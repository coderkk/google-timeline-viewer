#!/usr/bin/env node
// perf-browser.mjs
// T37 — production-build performance re-test (pre-release gate).
//
// Drives the REAL app (dist build, served by `vite preview`) in headless
// Chromium with real livedata imports and real user gestures (mouse drag pan,
// zoom-control clicks, wheel zoom), replicating the T23 methodology recorded in
// DATA-FINDINGS §8:
//   - rAF frame intervals (per-frame timings) + PerformanceObserver('longtask')
//   - gestures = mouse drag pan / click&wheel zoom, 1280×800 headless
// plus the T37 additions: data-load first-paint waterfall, range-switch cost,
// and the merged-archive "超长窗口" scenario (附加场景).
//
// Usage:
//   node scripts/perf-browser.mjs [--smoke] [--out scripts/out/perf-report.json]
//     --smoke  : faster subset (sample data, 2 pans, zoom crossing) — sanity only
//     --out    : JSON report path (default scripts/out/perf-report.json)
//
// Requires: `npm run build` already done; lives in scripts/ (Playwright there).
// Product code is NOT modified by this script.

import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Anchor every path to THIS script's directory — never to process.cwd() —
// so the script behaves identically from any working directory.
const HERE = dirname(fileURLToPath(import.meta.url)) // <project>/scripts
const REPO = resolve(HERE, '..') // <project> root
const ROOT = resolve(REPO, 'src') // vite project root (serves dist/)
const OUT_DIR = resolve(HERE, 'out')
const BASE = 'http://127.0.0.1:4174'
const VIDEO = { width: 1280, height: 800 }
const REAL_TEXT = 'Timeline-20260820.json'
const MERGED_TEXT = 'timeline-merged-perf.json'
const DENSE_DAY_2026 = 'Aug 3, 2026'
const DENSE_DAY_2025 = 'Feb 2, 2025'

// ── tiny stats ────────────────────────────────────────────────────────────────

function pct(sorted, q) {
  if (sorted.length === 0) return 0
  return +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))].toFixed(1)
}
function fmtStats(frames) {
  const fs = frames.map((f) => f.d).sort((a, b) => a - b)
  if (fs.length === 0) return { n: 0, avg: 0, med: 0, p95: 0, p99: 0, over50: 0 }
  return {
    n: fs.length,
    avg: +(fs.reduce((a, b) => a + b, 0) / fs.length).toFixed(1),
    med: +fs[Math.floor((fs.length - 1) * 0.5)].toFixed(1),
    p95: pct(fs, 0.95),
    p99: pct(fs, 0.99),
    over50: fs.filter((x) => x > 50).length,
  }
}

// ── in-page harness (installed before any page load) ─────────────────────────

const HARNESS = () => {
  const CALM = 25 // ms — a frame above this counts as "heavy"
  const QUIET_MS = 300 // calm run required before declaring a gesture settled
  const GRACE_MS = 300 // min quiet since the LAST input event (covers Leaflet's ~250ms zoom transition)
  window.__perf = {
    frames: [],
    longtasks: [],
    recording: false,
    gStart: 0,
    gLabel: '',
    heavyT: 0,
    settledAt: 0,
    lastInputAt: 0,
    mapFirstFrameAt: 0,
    loadStart: 0,
    summaryAt: 0,
    navAt: 0,
    heapAt: 0,
  }
  const p = () => window.__perf
  let last = performance.now()
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      const perf = p()
      perf.longtasks.push({ start: e.startTime, dur: e.duration })
      if (perf.recording && e.startTime + e.duration > perf.heavyT) {
        perf.heavyT = e.startTime + e.duration
      }
    }
  }).observe({ entryTypes: ['longtask'] })
  const tick = (now) => {
    const perf = p()
    const d = now - last
    last = now
    if (perf.recording) {
      perf.frames.push({ t: now, d })
      if (d > CALM) perf.heavyT = now
      // Settle = quiet rAF since the last heavy frame AND since the last input
      // event (input grace covers composited animations that produce no heavy
      // frames). Recording FREEZES at that instant so the frame/longtask arrays
      // exactly cover the gesture window (no post-settle dilution).
      if (!perf.settledAt && now - perf.heavyT >= QUIET_MS && now - perf.lastInputAt >= GRACE_MS) {
        perf.settledAt = now
        perf.recording = false
      }
    } else if (perf.mapFirstFrameAt) {
      // no page queries while idle → zero measurement noise outside gestures
      requestAnimationFrame(tick)
      return
    }
    const c = document.querySelector('.leaflet-container')
    if (c && !perf.mapFirstFrameAt) {
      const r = c.getBoundingClientRect()
      if (r.width > 2 && r.height > 2) perf.mapFirstFrameAt = now
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

const beginMeasure = (page, label) =>
  page.evaluate((l) => {
    const p = window.__perf
    p.frames = []
    p.longtasks = []
    p.recording = true
    p.gStart = performance.now()
    p.lastInputAt = p.gStart
    p.gLabel = l
    p.heavyT = 0
    p.settledAt = 0
  }, label)

// Stamp the moment of an actual input event (click/wheel/mouse-move) so the
// settle grace counts from the REAL gesture end, not from measure start.
const blipInput = (page) => page.evaluate(() => (window.__perf.lastInputAt = performance.now()))

const waitSettled = (page, timeout = 8000) =>
  page.waitForFunction(() => window.__perf.settledAt > 0, null, { timeout }).then(
    () => true,
    () => false,
  )

const readPerf = (page) =>
  page.evaluate(() => {
    const p = window.__perf
    const fs = p.frames.map((f) => f.d).sort((a, b) => a - b)
    const sum = fs.reduce((a, b) => a + b, 0)
    const longMax = p.longtasks.reduce((m, l) => Math.max(m, l.dur), 0)
    // Raw frame timings trimmed to the settle instant (the frames after that
    // are idle calm and would dilute the pooled p95).
    const rawFrames = p.frames.filter((f) => f.t <= p.settledAt).map((f) => ({ ...f }))
    return {
      label: p.gLabel,
      durMs: +(p.settledAt - p.gStart).toFixed(1),
      frames: fmt(fs),
      rawFrames,
      longtaskCount: p.longtasks.length,
      longtaskMax: +longMax.toFixed(1),
    }
    function fmt(s) {
      return {
        n: s.length,
        avg: +(sum / s.length).toFixed(1),
        med: s[Math.floor((s.length - 1) * 0.5)] ?? 0,
        p95: s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] ?? 0,
        p99: s[Math.min(s.length - 1, Math.floor(s.length * 0.99))] ?? 0,
        over50: s.filter((x) => x > 50).length,
      }
    }
  })

const readViewState = (page) =>
  page.evaluate(() => {
    const sum = document.querySelector('.trips-summary')?.textContent ?? ''
    const note = document.querySelector('.trips-note')?.textContent ?? ''
    const active =
      document.querySelector('.trips-mode-btn.active')?.textContent ?? ''
    const heap = performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0
    return { summary: sum.trim(), downsampled: note.trim(), mode: active.trim(), heapMB: +heap.toFixed(1) }
  })

// ── browser helpers ───────────────────────────────────────────────────────────

async function launch(page) {
  page.on('dialog', (d) => d.accept().catch(() => {}))
  await page.setViewportSize(VIDEO)
}

async function readZoom(page) {
  const out = await page.evaluate(() => {
    const zout = document.querySelector('.leaflet-control-zoom-out')
    const zin = document.querySelector('.leaflet-control-zoom-in')
    return {
      outDisabled: zout ? zout.classList.contains('leaflet-disabled') : false,
      inDisabled: zin ? zin.classList.contains('leaflet-disabled') : false,
      toggleDisabled: !!document.querySelector('.trips-toggle--plain[t-disabled], .trips-toggle--plain:disabled'),
    }
  })
  return out
}

async function zoomOutToZero(page) {
  for (let i = 0; i < 15; i++) {
    const z = await readZoom(page)
    if (z.outDisabled) return i
    await page.click('.leaflet-control-zoom-out')
    await page.waitForTimeout(380)
  }
  return -1
}

async function warmZoomIn(page, n) {
  for (let i = 0; i < n; i++) {
    await page.click('.leaflet-control-zoom-in')
    await page.waitForTimeout(380)
  }
}

async function measuredZoomClick(page, label, dir) {
  await beginMeasure(page, label)
  await page.click(`.leaflet-control-zoom-${dir}`)
  await blipInput(page)
  const ok = await waitSettled(page, 8000)
  return readPerf(page)
}

async function measuredPan(page, label, dxFrac = 0.16, dyFrac = 0.1, steps = 10) {
  await beginMeasure(page, label)
  const box = await page.locator('.leaflet-container').boundingBox()
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const dx = Math.round(box.width * dxFrac)
  const dy = Math.round(box.height * dyFrac)
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  for (let s = 1; s <= steps; s++) {
    await page.mouse.move(cx + (s * dx) / steps, cy + (s % 2 ? 1 : -1) * (s * dy) / steps)
    await blipInput(page)
    await page.waitForTimeout(30)
  }
  await page.mouse.up()
  await blipInput(page)
  const ok = await waitSettled(page, 6000)
  return readPerf(page)
}

async function measuredWheelBurst(page, label, notches = 6) {
  await beginMeasure(page, label)
  const box = await page.locator('.leaflet-container').boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let i = 0; i < notches; i++) {
    await page.mouse.wheel(0, -260)
    await blipInput(page)
    await page.waitForTimeout(45)
  }
  const ok = await waitSettled(page, 10000)
  return readPerf(page)
}

async function applyPreset(page, label, measureLabel = `range:${label}`) {
  await page.click('.drp-trigger')
  await beginMeasure(page, measureLabel)
  await page.click(`.drp-preset:has-text("${label}")`)
  await blipInput(page)
  const ok = await waitSettled(page, 12000)
  return readPerf(page)
}

async function pickSingleDay(page, ariaLabel) {
  await page.click('.drp-trigger')
  const day = page.locator(`.drp-day[aria-label="${ariaLabel}"]`).first()
  await beginMeasure(page, `range:${ariaLabel}`)
  await day.click()
  await day.click()
  await blipInput(page)
  const ok = await waitSettled(page, 10000)
  return readPerf(page)
}

// ── scenario suite ────────────────────────────────────────────────────────────

async function dataLoadWaterfall(page, filePath, label) {
  const t0 = Date.now()
  for (let attempt = 1; attempt <= 3; attempt++) {
    // `/#/app` renders the EmptyState (ImportPanel) when no data is loaded — the
    // only place the hidden file input exists (T35 single-file import).
    await page.goto(`${BASE}/#/app`)
    await page.evaluate(() => {
      window.__perf.loadStart = performance.now()
      window.__perf.longtasks = []
    })
    try {
      // The file input is `hidden` — wait for ATTACHED, never for visible.
      await page.locator('input[type=file]').first().waitFor({ state: 'attached', timeout: 15000 })
      await page.setInputFiles('input[type=file]', filePath)
      return finishLoadWaterfall(page, t0, label)
    } catch (err) {
      const dbg = await page.evaluate(() => ({
        hash: location.hash,
        landing: !!document.querySelector('.page-landing'),
        empty: !!document.querySelector('.page-empty, .empty-state, .import-panel'),
        input: document.querySelectorAll('input[type=file]').length,
        title: document.title,
      })).catch(() => ({}))
      console.log(`  [!] import input unreachable (attempt ${attempt}): ${err.message.split('\n')[0]}
      route: ${JSON.stringify(dbg)}`)
      await page.reload({ waitUntil: 'load' })
      await page.evaluate(() => {
        window.__perf.loadStart = performance.now()
        window.__perf.longtasks = []
      })
    }
  }
  throw new Error('dataLoadWaterfall: input[type=file] unreachable after 3 attempts')
}

async function sampleLoadWaterfall(page, label) {
  const t0 = Date.now()
  await page.goto(BASE)
  await page.evaluate(() => {
    window.__perf.loadStart = performance.now()
    window.__perf.longtasks = []
  })
  await page.click('.hero-cta .btn-primary')
  return finishLoadWaterfall(page, t0, label)
}

async function finishLoadWaterfall(page, t0, label) {
  await page.waitForFunction(() => location.hash.includes('#/app'), null, { timeout: 240000 }).catch(() => {})
  await page.evaluate(() => {
    window.__perf.navAt = performance.now()
  })
  await page.waitForSelector('.trips-summary', { timeout: 60000 })
  await page.evaluate(() => {
    window.__perf.summaryAt = performance.now()
  })
  await page.waitForFunction(() => window.__perf.mapFirstFrameAt > 0, null, { timeout: 60000 }).catch(() => {})
  await page.evaluate(() => {
    window.__perf.heapAt = performance.now()
    window.__perf.heapMB = performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0
  })
  // let the map finish fitting + tiles
  await waitSettledReal(page)
  const snap = await page.evaluate(() => {
    const p = window.__perf
    const lt = p.longtasks.filter((l) => l.start >= p.loadStart)
    const ltDuringRender = lt.filter((l) => l.start >= p.navAt)
    return {
      wallTotalMs: 0, // filled in Node
      navAt: p.navAt - p.loadStart,
      summaryAt: p.summaryAt - p.loadStart,
      mapFirstFrameAt: p.mapFirstFrameAt - p.loadStart,
      longtaskImportCount: lt.length,
      longtaskImportMax: Math.max(0, ...lt.map((l) => l.dur)),
      longtaskRenderCount: ltDuringRender.length,
      longtaskRenderMax: Math.max(0, ...ltDuringRender.map((l) => l.dur)),
      heapMB: p.heapMB,
    }
  })
  snap.wallTotalMs = Date.now() - t0
  snap.label = label
  const state = await readViewState(page)
  return { waterfall: snap, view: state }
}

async function waitSettledReal(page) {
  await beginMeasure(page, 'initial-settle')
  await waitSettled(page, 15000)
}

// ── reporting ────────────────────────────────────────────────────────────────

const report = { meta: {}, sessions: {} }

function fmtMs(x) {
  return +x.toFixed(0)
}

async function main() {
  const args = process.argv.slice(2)
  const smoke = args.includes('--smoke')
  const outArg = args[args.indexOf('--out') + 1]
  const outPath = resolve(outArg ?? resolve(OUT_DIR, 'perf-report.json'))

  // 1. preview server
  console.log('[server] starting vite preview on :4174 …')
  const server = spawn('npx', ['vite', 'preview', '--port', '4174', '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT,
    stdio: 'ignore',
    detached: false,
  })
  server.on('error', (e) => {
    console.error('[server] failed:', e.message)
    process.exit(1)
  })
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250))
    try {
      const res = await fetch(BASE)
      if (res.ok) break
    } catch {
      /* not up yet */
    }
  }

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.addInitScript(HARNESS)
  await launch(page)
  report.meta = {
    browser: 'chromium headless',
    viewport: VIDEO,
    base: BASE,
    product: 'dist build via vite preview',
    date: new Date().toISOString(),
    smoke,
  }

  const zoomAgg = { frames: [], longtasks: [] }
  const panAgg = { frames: [], longtasks: [] }

  // ── Session 1 — real 2026 livedata, default 30-day window (the 15k raw window)
  const N_PANS = smoke ? 1 : 8
  const realPath = resolve(REPO, `docs/livedata/${REAL_TEXT}`)
  console.log(`\n══ SESSION 1: ${smoke ? 'SAMPLE' : REAL_TEXT} (${smoke ? 'smoke' : 'real livedata'}) ══`)
  const s1 = {}
  const load1 = smoke
    ? await sampleLoadWaterfall(page, 'import:sample')
    : await dataLoadWaterfall(page, realPath, `import:${REAL_TEXT}`)
  s1.load = load1
  console.log(`  import waterfall: wall=${fmtMs(load1.waterfall.wallTotalMs)}ms nav@${fmtMs(load1.waterfall.navAt)}ms summary@${fmtMs(load1.waterfall.summaryAt)}ms map@${fmtMs(load1.waterfall.mapFirstFrameAt)}ms | longtasks(render)=${load1.waterfall.longtaskRenderCount}/${fmtMs(load1.waterfall.longtaskRenderMax)}ms | heap=${load1.view.heapMB}MB`)
  console.log(`  view: ${load1.view.summary}`)

  // 15k-window zoom: anchor at zoom 0, warm to z5, measured 5→6…→12, then out
  console.log('  [zoom] anchoring at z0 …')
  const anchorClicks = await zoomOutToZero(page)
  console.log(`  [zoom] at z0 (${anchorClicks} zoom-out clicks)`)
  await warmZoomIn(page, 5)
  console.log('  [zoom] warm-up 0→5 done (dots hidden)')

  const zoomSteps = []
  let zoom = 5
  const upLabels = ['z5→6 •mount', 'z6→7', 'z7→8', 'z8→9', 'z9→10', 'z10→11', 'z11→12']
  for (const lab of upLabels) {
    const m = await measuredZoomClick(page, `zoom:${lab}`, 'in')
    m.label = lab
    m.fromZoom = zoom
    m.toZoom = ++zoom
    zoomSteps.push(m)
    zoomAgg.frames.push(...m.rawFrames)
    zoomAgg.longtasks.push(...m.longtasks ?? [])
    console.log(`    ${lab.padEnd(14)} ${String(m.durMs).padStart(6)}ms  p95=${m.frames.p95}ms  >50ms=${m.frames.over50}  lt=${m.longtaskCount}(max ${fmtMs(m.longtaskMax)}ms)`)
  }
  const downLabels = ['z12→11', 'z11→10', 'z10→9', 'z9→8', 'z8→7', 'z7→6', 'z6→5 •unmount']
  for (const lab of downLabels) {
    const m = await measuredZoomClick(page, `zoom:${lab}`, 'out')
    m.label = lab
    m.fromZoom = zoom
    m.toZoom = --zoom
    zoomSteps.push(m)
    zoomAgg.frames.push(...m.rawFrames)
    zoomAgg.longtasks.push(...m.longtasks ?? [])
    console.log(`    ${lab.padEnd(14)} ${String(m.durMs).padStart(6)}ms  p95=${m.frames.p95}ms  >50ms=${m.frames.over50}  lt=${m.longtaskCount}(max ${fmtMs(m.longtaskMax)}ms)`)
  }

  // continuous wheel burst at z6 (re-mount is already done; this is the burst path)
  await warmZoomIn(page, 1) // 5→6 again (mount)
  await page.waitForTimeout(800)
  const burst = await measuredWheelBurst(page, 'zoom:wheel-burst(6 notches)', 6)
  console.log(`    wheel-burst(6)     ${String(burst.durMs).padStart(6)}ms  p95=${burst.frames.p95}ms  >50ms=${burst.frames.over50}  lt=${burst.longtaskCount}(max ${fmtMs(burst.longtaskMax)}ms)`)

  // pans at low zoom (dots off) + at high zoom (dots on, dense)
  console.log(`  [pan] low-zoom (z4, outline only) — ${N_PANS} drags …`)
  await warmZoomIn(page, 0)
  await zoomOutToZero(page)
  await warmZoomIn(page, 4)
  const panLow = []
  for (let i = 0; i < N_PANS; i++) {
    const m = await measuredPan(page, `pan:low:${i}`)
    panLow.push(m)
    panAgg.frames.push(...m.rawFrames)
    panAgg.longtasks.push(...m.longtasks ?? [])
  }
  const panLowStats = fmtStats(panLow.flatMap((s) => s.rawFrames))

  // high-zoom pan (z12, dots mounted)
  console.log(`  [pan] high-zoom (z12, dots mounted) — ${N_PANS} drags …`)
  await warmZoomIn(page, 8) // 4→12
  await page.waitForTimeout(600)
  const panHigh = []
  for (let i = 0; i < N_PANS; i++) {
    const m = await measuredPan(page, `pan:high:${i}`)
    panHigh.push(m)
    panAgg.frames.push(...m.rawFrames)
    panAgg.longtasks.push(...m.longtasks ?? [])
  }

  s1.zoomSteps = zoomSteps.map(({ rawFrames, ...m }) => m)
  s1.wheelBurst = burst
  s1.panLow = panLow.map(({ rawFrames, ...m }) => m)
  s1.panHigh = panHigh.map(({ rawFrames, ...m }) => m)
  report.sessions['2026-file'] = s1
  console.log(`  [pan:low]  pooled p95=${panLowStats.p95}ms p99=${panLowStats.p99}ms >50ms=${panLowStats.over50} (${panLowStats.n} frames)`)
  const panHighStats = fmtStats(panHigh.flatMap((s) => s.rawFrames))
  console.log(`  [pan:high] pooled p95=${panHighStats.p95}ms p99=${panHighStats.p99}ms >50ms=${panHighStats.over50} (${panHighStats.n} frames)`)

  if (!smoke) {
    // range switch first-paint (切换日期): single dense day + last year preset
    console.log('  [range-switch] dense day 2026-08-03 …')
    const switchDay = await (async () => {
      const m = await pickSingleDay(page, DENSE_DAY_2026)
      const state = await readViewState(page)
      return { ...m, view: state }
    })()
    s1.rangeDenseDay = switchDay
    console.log(`    dense-day ${switchDay.durMs}ms  p95=${switchDay.frames.p95}ms  lt=${switchDay.longtaskCount}(max ${fmtMs(switchDay.longtaskMax)}ms)  → ${switchDay.view.summary}`)
  }

  console.log('  [range-switch] Last year preset …')
  const switchYear = await (async () => {
    const m = await applyPreset(page, 'Last year')
    const state = await readViewState(page)
    return { ...m, view: state }
  })()
  s1.rangeLastYear = switchYear
  console.log(`    last-year ${switchYear.durMs}ms  p95=${switchYear.frames.p95}ms  lt=${switchYear.longtaskCount}(max ${fmtMs(switchYear.longtaskMax)}ms)  → ${switchYear.view.summary}`)

  console.log(`\n  [zoom aggregate (measured steps)]  pooled p95=${zoomAgg.frames.length ? fmtStats(zoomAgg.frames).p95 : '-'}ms  p99=${fmtStats(zoomAgg.frames).p99}ms  >50ms=${fmtStats(zoomAgg.frames).over50}  longtaskMax=${fmtMs(Math.max(0, ...zoomAgg.longtasks.map((l) => l.dur)))}ms`)

  if (!smoke) {
    // ── Session 2 — merged archive (T36 超长窗口 input)
    console.log(`\n══ SESSION 2: ${MERGED_TEXT} (merged archive, cumulative raw) ══`)
    const mergedPath = resolve(OUT_DIR, MERGED_TEXT)
    const page2 = await browser.newPage()
    await page2.addInitScript(HARNESS)
    await launch(page2)
    const s2 = {}
    const load2 = await dataLoadWaterfall(page2, mergedPath, `import:${MERGED_TEXT}`)
    s2.load = load2
    console.log(`  import waterfall: wall=${fmtMs(load2.waterfall.wallTotalMs)}ms nav@${fmtMs(load2.waterfall.navAt)}ms summary@${fmtMs(load2.waterfall.summaryAt)}ms map@${fmtMs(load2.waterfall.mapFirstFrameAt)}ms | longtasks(render)=${load2.waterfall.longtaskRenderCount}/${fmtMs(load2.waterfall.longtaskRenderMax)}ms | heap=${load2.view.heapMB}MB`)
    console.log(`  view: ${load2.view.summary}`)

    // 全部 (full span) panorama — low zoom pans + crossing zoom
    console.log('  [range] All → 低 zoom 全景 …')
    const rAll = await applyPreset(page2, 'All', 'range:all-merged')
    const viewAll = await readViewState(page2)
    s2.rangeAll = rAll
    console.log(`    range:all ${rAll.durMs}ms  p95=${rAll.frames.p95}ms  lt=${rAll.longtaskCount}(max ${fmtMs(rAll.longtaskMax)}ms)`)
    console.log(`    view: ${viewAll.summary} (${viewAll.downsampled})`)
    const panoPans = []
    const panoAgg = { frames: [], longtasks: [] }
    for (let i = 0; i < 8; i++) {
      const m = await measuredPan(page2, `pan:pano:${i}`, 0.16, 0.1, 10)
      panoPans.push(m)
      panoAgg.frames.push(...m.rawFrames)
      panoAgg.longtasks.push(...m.longtasks ?? [])
    }
    const panoStats = fmtStats(panoAgg.frames)
    console.log(`    pano-pan pooled p95=${panoStats.p95}ms p99=${panoStats.p99}ms >50ms=${panoStats.over50} (${panoStats.n} frames)  lt=${panoAgg.longtasks.length}`)

    console.log('  [zoom] 全部 crossing 5→6 (12k dot mount over 13.7y) …')
    await zoomOutToZero(page2)
    await warmZoomIn(page2, 5)
    const z1 = await measuredZoomClick(page2, 'zoom:all-5→6-mount', 'in')
    s2.panoCrossZoom = { ...z1, view: viewAll }
    console.log(`    all 5→6 ${String(z1.durMs).padStart(6)}ms  p95=${z1.frames.p95}ms  >50ms=${z1.frames.over50}  lt=${z1.longtaskCount}(max ${fmtMs(z1.longtaskMax)}ms)`)

    // Last year (segments + latest raw) — quick zoom tilt
    console.log('  [range] Last year …')
    const rYear = await applyPreset(page2, 'Last year', 'range:last-year-merged')
    const viewYear = await readViewState(page2)
    s2.rangeLastYear = rYear
    console.log(`    range:last-year ${rYear.durMs}ms  p95=${rYear.frames.p95}ms  lt=${rYear.longtaskCount}(max ${fmtMs(rYear.longtaskMax)}ms)`)
    console.log(`    view: ${viewYear.summary} (${viewYear.downsampled})`)
    // measured crossing on the year view
    await zoomOutToZero(page2)
    await warmZoomIn(page2, 5)
    const zY = await measuredZoomClick(page2, 'zoom:year-5→6-mount', 'in')
    s2.yearCrossZoom = { ...zY, view: viewYear }
    console.log(`    year 5→6 ${String(zY.durMs).padStart(6)}ms  p95=${zY.frames.p95}ms  >50ms=${zY.frames.over50}  lt=${zY.longtaskCount}(max ${fmtMs(zY.longtaskMax)}ms)`)

    // old-window dense day (2025-02-02) — merged raw now covers old dates
    console.log('  [range] old dense day 2025-02-02 (merged raw window) …')
    await page2.click('.drp-trigger')
    await page2.click('[aria-label="Previous year"]')
    for (let i = 0; i < 6; i++) await page2.click('[aria-label="Previous month"]')
    const dayOld = page2.locator(`.drp-day[aria-label="${DENSE_DAY_2025}"]`).first()
    await beginMeasure(page2, 'range:old-dense-day-2025-02-02')
    await dayOld.click()
    await dayOld.click()
    await waitSettled(page2, 10000)
    const rOld = await readPerf(page2)
    s2.rangeOldDenseDay = { ...rOld, view: await readViewState(page2) }
    console.log(`    old-day ${rOld.durMs}ms  p95=${rOld.frames.p95}ms  lt=${rOld.longtaskCount}(max ${fmtMs(rOld.longtaskMax)}ms)  → ${s2.rangeOldDenseDay.view.summary}`)
    // small pan at high zoom on old dense day
    await warmZoomIn(page2, 9)
    await page2.waitForTimeout(600)
    const panOld = await measuredPan(page2, 'pan:old-dense-day', 0.16, 0.1, 8)
    s2.panOldDenseDay = panOld
    console.log(`    old-day pan ${panOld.durMs}ms  p95=${panOld.frames.p95}ms  >50ms=${panOld.frames.over50}  lt=${panOld.longtaskCount}`)

    report.sessions['merged'] = s2

    // dense NEW day on merged (2026-08-03) — should equal session 1 day behavior
    console.log('  [range] new dense day 2026-08-03 on merged …')
    await page2.click('.drp-trigger')
    await page2.click('[aria-label="Next year"]')
    for (let i = 0; i < 6; i++) await page2.click('[aria-label="Next month"]')
    const dayNew = page2.locator(`.drp-day[aria-label="${DENSE_DAY_2026}"]`).first()
    await beginMeasure(page2, 'range:new-dense-day-2026-08-03')
    await dayNew.click()
    await dayNew.click()
    await waitSettled(page2, 10000)
    const rNew = await readPerf(page2)
    s2.rangeNewDenseDay = { ...rNew, view: await readViewState(page2) }
    console.log(`    new-day ${rNew.durMs}ms  p95=${rNew.frames.p95}ms  lt=${rNew.longtaskCount}(max ${fmtMs(rNew.longtaskMax)}ms)  → ${s2.rangeNewDenseDay.view.summary}`)
  }

  // finalize
  report.summary = {
    zoomPooled: fmtStats(zoomAgg.frames),
    zoomLongtaskMax: fmtMs(Math.max(0, ...zoomAgg.longtasks.map((l) => l.dur))),
    panLowPooled: panLowStats,
    panHighPooled: panHighStats,
  }

  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(report, null, 2))
  console.log(`\n[done] report → ${outPath}`)

  await browser.close()
  server.kill()
}

main().catch((e) => {
  console.error('\n[FAIL]', e)
  process.exit(1)
})