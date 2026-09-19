#!/usr/bin/env node
// smoke-race-check.mjs — N1 `_leaflet_pos` teardown-race regression seal.
// T39/N1 family (hit twice: T27 warning → T38/T39 full crash): Leaflet's 250ms
// `_onZoomTransitionEnd` timer fires AFTER `Map.remove()` deleted `_mapPane`
// when an animated zoom transition (fitBounds/flyTo) is still in flight during
// view teardown (navigate away / sidebar collapse / re-import + instant nav).
// Unmount-time `_animatingZoom = false` reset (shared useResetZoomAnimOnUnmount
// hook, mounted by BOTH Trips FitController and Places ResetZoomAnimController)
// neutralizes the timer's first line. This script seals that regression so a
// future release can re-verify cheaply.
//
// Sections (all expect 0 `_leaflet_pos` pageerrors; exit nonzero on failure):
//   A. Places race   — mobile 390×844, wheel-zoom to intermediate level (zoom
//                      delta <= 4 so the ring-fit actually animates), click
//                      map, INSTANT nav to Merge, ×6 rounds. Each round must
//                      BOTH stay error-free AND genuinely hit the race window
//                      (navAt < 250ms); a runError or a WIDE round counts as a
//                      bad round and FAILs the section (no silent pass).
//   B. Trips whammy  — mobile, stay click → tooltip, then re-import ×3 + INSTANT
//                      nav to Merge (fresh page per cycle).
//   C. Desktop reg   — 1440×900 sidebar collapse/expand ×3 (T27 white-screen
//                      path), root must stay single-child, 0 pageerror.
//
// Server hygiene: `vite preview` runs on port 0 (OS-assigned free port → no
// fixed-port conflicts, no stale-server false signals). BASE is parsed from
// vite's own `Local:` stdout line. The preview process tree is torn down in
// the finalizer on the success AND failure paths. Cleanup is cross-platform:
// POSIX kills the detached process group (vite node process + any children)
// via kill(-pid); on Windows kill(-pid) is unimplemented (always throws ESRCH
// → a silent no-op, which actually leaked preview servers inside the original
// T39 S1 fix — see NOTES 2026-09-19 recheck), so the finalizer uses
// `taskkill /PID <pid> /T /F` (whole tree) plus a positive-pid SIGKILL
// fallback.
//
// Usage:
//   node scripts/smoke-race-check.mjs
//
// Prints a PASS/FAIL summary. Requires scripts/node_modules (playwright) and a
// production build (`npm run build` in src/ first).

import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../src/', import.meta.url))
const SAMPLE = fileURLToPath(new URL('../src/src/lib/sample/sample-timeline.json', import.meta.url))
const VITE_BIN = fileURLToPath(new URL('../src/node_modules/vite/bin/vite.js', import.meta.url))

// Spawn `vite preview` on port 0 (vite 8.x honors 0 = random free port) and
// resolve with the preview URL parsed from its `Local:` stdout line. Spawned
// via process.execPath + vite.js (project Windows convention: `npx` is not
// auto-resolved on Windows and fails with ENOENT). `detached` makes vite the
// leader of a new process group — on POSIX that lets kill(-pid) reach vite +
// any children together; on Windows the group kill is a no-op and the
// finalizer falls back to `taskkill /T /F` against this pid.
function startPreview() {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      process.execPath,
      [VITE_BIN, 'preview', '--port', '0', '--host', '127.0.0.1'],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true },
    )
    let out = ''
    // Vite prints ANSI colors even when piped on some shells; strip them so
    // the `Local:` line always matches.
    const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*m/g, '')
    const parse = () => stripAnsi(out).match(/Local:\s+(http:\/\/[^\s]+)/)
    const onData = (d) => {
      out += d.toString()
      const m = parse()
      if (m) {
        cleanup()
        resolve({ proc, base: m[1].replace(/\/+$/, '') })
      }
    }
    const onExit = () => {
      cleanup()
      const m = parse()
      if (m) resolve({ proc, base: m[1].replace(/\/+$/, '') })
      else reject(new Error(`vite preview exited before printing Local URL (exit=${proc.exitCode}, output=${out.slice(0, 400)})`))
    }
    const timer = setTimeout(async () => {
      cleanup()
      // Never leak the preview server on the timeout path: tear down the whole
      // process tree (POSIX group kill / Windows taskkill) before rejecting.
      await killProcessTree(proc.pid)
      reject(new Error(`timed out waiting for vite preview Local URL (output=${out.slice(0, 400)})`))
    }, 15000)
    function cleanup() {
      clearTimeout(timer)
      proc.stdout?.off('data', onData)
      proc.stderr?.off('data', onData)
      proc.off('exit', onExit)
    }
    proc.stdout.on('data', onData)
    proc.stderr.on('data', onData)
    proc.on('exit', onExit)
  })
}

// Tear down a spawned preview process tree (async). POSIX: a negative pid
// kills the detached process group (the spawned process is its leader).
// Windows: kill(-pid) always throws ESRCH (unimplemented), so this goes to
// `taskkill /T /F`, the only way to reach children/grandchildren (vite's
// esbuild service process, or any shell/js wrapper the spawn went through).
function killProcessTree(pid) {
  if (typeof pid !== 'number') return Promise.resolve()
  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      const tk = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      })
      tk.on('error', resolve)
      tk.on('exit', resolve)
    })
  }
  try { process.kill(-pid, 'SIGKILL') } catch {}
  return Promise.resolve()
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true } catch { return false }
}

// Kill the preview process tree (npx wrapper + vite preview child and any
// grandchildren) and wait for it to fully disappear. Called from the finalizer
// so no preview server outlives the gate, passed or failed.
async function stopPreview(server) {
  if (!server?.proc?.pid) return
  const pid = server.proc.pid
  if (process.platform !== 'win32') {
    // POSIX: SIGTERM the whole group, wait for the group to disappear, SIGKILL
    // any straggler.
    try { process.kill(-pid, 'SIGTERM') } catch {}
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 100))
      try { process.kill(-pid, 0) } catch { return } // group fully gone
    }
    try { process.kill(-pid, 'SIGKILL') } catch {}
    return
  }
  // Windows: kill(-pid) is a no-op, so reach the whole tree with taskkill /T
  // /F, then a positive-pid SIGKILL as the final fallback (probe first so a
  // stale pid never gets a meaningless signal).
  if (!isAlive(pid)) return
  await killProcessTree(pid)
  try { process.kill(pid, 'SIGKILL') } catch {}
}

async function waitReady(base) {
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250))
    try {
      const res = await fetch(base)
      if (res.ok) return
    } catch {}
  }
  throw new Error(`preview server not ready at ${base}`)
}

let browser = await chromium.launch({ headless: true })
let server = null
let exitCode = 0
try {
  server = await startPreview()
  const BASE = server.base
  await waitReady(BASE)

  const isRace = (e) => (e.msg ?? e).includes('_leaflet_pos')

  function trackErrors(page) {
    const errs = []
    page.on('pageerror', (e) => errs.push({ msg: String(e), stack: e.stack ?? '' }))
    return errs
  }

  async function newMobilePage() {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    page.on('dialog', (d) => d.accept().catch(() => {}))
    return { page, errs: trackErrors(page) }
  }

  async function enterApp(page) {
    await page.goto(`${BASE}/#/`, { waitUntil: 'load' })
    await page.click('.hero-cta .btn-primary')
    await page.waitForSelector('.trips-summary', { timeout: 60000 })
    await page.waitForTimeout(1500)
  }

  const results = []

  // ── A. Places race: ring-fit animation torn down mid-flight ×6 ─────────────
  let aRaces = 0
  let aBadRounds = 0
  for (let i = 1; i <= 6; i++) {
    const { page, errs } = await newMobilePage()
    try {
      await enterApp(page)
      await page.evaluate(() => document.querySelector('a[href="#/app/places"]').click())
      await page.waitForSelector('.leaflet-container', { timeout: 15000 })
      await page.waitForTimeout(700)
      const box = await page.locator('.leaflet-container').boundingBox()
      const cx = box.x + box.width / 2
      const cy = box.y + box.height * 0.3
      // Zoom into the intermediate band so the ring-fit zoom delta is <= 4 and
      // Leaflet's `_tryAnimatedZoom` actually animates (the race precondition).
      await page.mouse.move(cx, cy)
      for (let k = 0; k < 5; k++) await page.mouse.wheel(0, -400)
      await page.waitForTimeout(900)
      // Click → ring-fit animation starts; navigate away well inside the 250ms
      // `_onZoomTransitionEnd` timer window.
      const t0 = Date.now()
      await page.mouse.click(cx, cy)
      await page.waitForTimeout(150)
      await page.evaluate(() => document.querySelector('a[href="#/app/merge"]').click())
      const navAt = Date.now() - t0
      await page.waitForTimeout(1500)
      const races = errs.filter(isRace)
      aRaces += races.length
      const navOk = navAt < 250
      if (!navOk) aBadRounds++
      console.log(`  A[${i}] race window navAt=t+${navAt}ms ${navOk ? 'OK(<250)' : 'WIDE(>=250)'} leafletRace=${races.length} totalErrors=${errs.length}`)
    } catch (e) {
      aBadRounds++
      console.log(`  A[${i}] runError=${String(e).slice(0, 160)} leafletRace=${errs.filter(isRace).length}`)
    } finally {
      await page.close().catch(() => {})
    }
  }
  results.push({ name: 'A Places race ×6', ok: aRaces === 0 && aBadRounds === 0, detail: `leafletRace=${aRaces}/6 badRounds=${aBadRounds}/6` })

  // ── B. Trips whammy: tooltip path + re-import + INSTANT nav ×3 ─────────────
  const { page: bPage, errs: bErrs } = await newMobilePage()
  let tooltipOk = false
  let bRunErr = null
  try {
    await enterApp(bPage)
    await bPage.waitForSelector('.leaflet-container', { timeout: 15000 })
    const firstVisit = bPage.locator('.timeline-item.visit').first()
    await firstVisit.scrollIntoViewIfNeeded()
    await firstVisit.click()
    await bPage.waitForTimeout(400)
    tooltipOk = (await bPage.locator('.trip-tooltip').count()) > 0
    for (let cycle = 0; cycle < 3; cycle++) {
      // Change-data clears the store, then INSTANTLY race the re-fit animation:
      // the import + map remount steps are strict (a skipped cycle would silently
      // weaken the seal); the nav itself deliberately skips settle/actionability.
      await bPage.locator('.data-bar-btn').last().click()
      await bPage.waitForSelector('input[type=file]', { state: 'attached', timeout: 15000 })
      await bPage.setInputFiles('input[type=file]', SAMPLE)
      await bPage.waitForSelector('.leaflet-container', { timeout: 15000 })
      await bPage.evaluate(() => document.querySelector('a[href="#/app/merge"]')?.click()).catch(() => {})
      await bPage.waitForTimeout(1200)
      await bPage.evaluate(() => document.querySelector('a[href="#/app"]')?.click()).catch(() => {})
      await bPage.waitForSelector('.trips-summary', { timeout: 60000 }).catch(() => {})
    }
  } catch (e) {
    bRunErr = String(e)
  } finally {
    await bPage.close().catch(() => {})
  }
  const bRaces = bErrs.filter(isRace).length
  console.log(`  B tooltip=${tooltipOk} cycles=3 leafletRace=${bRaces} totalErrors=${bErrs.length}${bRunErr ? ` runError=${bRunErr.slice(0, 120)}` : ''}`)
  results.push({ name: 'B Trips whammy', ok: bRunErr === null && tooltipOk && bRaces === 0, detail: `tooltip=${tooltipOk} leafletRace=${bRaces}` })

  // ── C. Desktop regression: sidebar collapse/expand ×3 (T27 path) ───────────
  const { page: cPage, errs: cErrs } = await newMobilePage()
  let rootOk = true
  let cRunErr = null
  try {
    await cPage.setViewportSize({ width: 1440, height: 900 })
    await enterApp(cPage)
    await cPage.waitForSelector('.leaflet-container', { timeout: 15000 })
    for (let i = 0; i < 3; i++) {
      await cPage.locator('.trips-toggle').last().click()
      await cPage.waitForTimeout(700)
      const children = await cPage.evaluate(() => document.querySelector('#root')?.children.length ?? -1)
      if (children !== 1) {
        rootOk = false
        console.log(`  C[${i}] root children=${children}`)
      }
    }
  } catch (e) {
    cRunErr = String(e)
  } finally {
    await cPage.close().catch(() => {})
  }
  const cRaces = cErrs.filter(isRace).length
  console.log(`  C collapseExpand×3 rootOk=${rootOk} leafletRace=${cRaces} totalErrors=${cErrs.length}${cRunErr ? ` runError=${cRunErr.slice(0, 120)}` : ''}`)
  results.push({ name: 'C Desktop reg', ok: cRunErr === null && rootOk && cRaces === 0, detail: `rootOk=${rootOk} leafletRace=${cRaces}` })

  const failed = results.filter((r) => !r.ok)
  console.log('\nsmoke-race-check summary:')
  for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  (${r.detail})`)
  if (failed.length > 0) {
    console.error(`\nN1 race seal BROKEN — ${failed.length} section(s) failed. Do not release.`)
    exitCode = 1
  } else {
    console.log('\nN1 race seal intact — 0 `_leaflet_pos` pageerrors, ready for release.')
  }
} catch (e) {
  console.error('smoke-race-check crashed:', e)
  exitCode = 2
} finally {
  if (browser) await browser.close().catch(() => {})
  await stopPreview(server)
}
process.exit(exitCode)