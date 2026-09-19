#!/usr/bin/env node
// smoke-merge-layout.mjs — T44 layout regression seal.
// Root cause (user report 2026-09-18): Layout.tsx used `pathname.startsWith('/app')`
// to pick the full-viewport map shell, so /app/merge inheristed `.app-main--app`
// (max-width:none / padding:0 / overflow:hidden) AND lost the footer — content
// pinned left, no footer, zero top margin vs Help/Settings (padding:40px 20px).
// Fix: exact-match the two map viewports (/app Trips, /app/places Places).
//
// This gate seals the fix so a future release can re-verify cheaply:
//   A. merge page uses the STANDARD centered column + footer + 40px top pad,
//      and its content column geometry (left/top/width) is identical across
//      /app/merge, /settings and /help AND horizontally centered.
//   B. Trips/Places stay full-viewport (app-main--app) with NO footer.
//   C. 0 pageerror + 0 horizontal overflow on all checked routes, both
//      viewports.
//
// T46: +help 页纳入几何互等 + 水平居中断言（|center−viewportCenter|≤1）——
// T44 只断言互等未断言居中。
//
// Server hygiene: `vite preview` on port 0 (OS-assigned free port), BASE
// parsed from vite's own `Local:` stdout line, and the preview process tree is
// torn down in the finalizer on the success AND failure paths. Cleanup is
// cross-platform: POSIX kills the whole detached process group via kill(-pid);
// on Windows kill(-pid) is unimplemented (always throws ESRCH → a silent
// no-op, which leaked preview servers in earlier runs), so the finalizer uses
// `taskkill /PID <pid> /T /F` (whole tree) plus a positive-pid SIGKILL
// fallback.
//
// Usage:
//   node scripts/smoke-merge-layout.mjs
//
// Requires scripts/node_modules (playwright) and a production build
// (`cd src && npm run build`) first. Exit: 0 all PASS / 1 assertion / 2 runtime.

import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../src/', import.meta.url))
const VITE_BIN = fileURLToPath(new URL('../src/node_modules/vite/bin/vite.js', import.meta.url))

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

function isAlive(pid) {
  try { process.kill(pid, 0); return true } catch { return false }
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

// Kill the preview process tree and wait for it to fully disappear. Called from
// the finalizer so no preview server outlives the gate, passed or failed.
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

// Column geometry of a page: left edge + top edge of the `.page` box relative
// to the viewport (the .app-main padding already consumed).
async function pageGeometry(page, route) {
  await page.goto(`${BASE}/${route}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.page', { timeout: 10000 })
  return page.$eval('.page', (el) => {
    const r = el.getBoundingClientRect()
    return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width) }
  })
}

function shellState(page) {
  return page.evaluate(() => {
    const main = document.querySelector('main')
    const footer = document.querySelector('footer')
    return {
      mainClass: main?.className ?? null,
      hasFooter: footer !== null,
    }
  })
}

let browser
let server = null
let exitCode = 2
const results = []

async function check(name, fn) {
  try {
    const value = await fn()
    results.push({ name, value, pass: true })
    console.log(`PASS  ${name}: ${value}`)
  } catch (err) {
    const msg = String(err?.message ?? err).split('\n')[0]
    results.push({ name, value: msg, pass: false })
    console.log(`FAIL  ${name}: ${msg}`)
  }
}

try {
  console.log('SMOKE-MERGE-LAYOUT (T44/T46)')
  server = await startPreview()
  const BASE0 = server.base
  globalThis.BASE = BASE0
  await waitReady(BASE0)
  browser = await chromium.launch({ headless: true })
  const KNOWN_NOISE = 'frame-ancestors'

  for (const viewport of [
    { tag: 'desktop', w: 1440, h: 900 },
    { tag: 'mobile', w: 390, h: 844 },
  ]) {
    const context = await browser.newContext({ viewport: { width: viewport.w, height: viewport.h } })
    const page = await context.newPage()
    page.setDefaultTimeout(20000)
    const runtimeErrors = []
    page.on('pageerror', (e) => runtimeErrors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => {
      if (m.type() === 'error') runtimeErrors.push(`console.error: ${m.text()}`)
    })
    const tag = viewport.tag

    // A. merge page = standard centered column + footer
    await check(`${tag} merge: standard main column`, async () => {
      await page.goto(`${BASE0}/#/app/merge`, { waitUntil: 'networkidle' })
      await page.waitForSelector('.merge-page', { timeout: 10000 })
      const state = await shellState(page)
      if (state.mainClass !== 'app-main') {
        throw new Error(`expected main class "app-main", got "${state.mainClass}"`)
      }
      if (!state.hasFooter) throw new Error('footer missing on merge page')
      return state.mainClass
    })
    // T46: the three content pages (/app/merge, /settings, /help) share one
    // centered column — assert left/top/width equal across all three AND that
    // each box is horizontally centered in the viewport (|center−vpCenter|≤1).
    const CONTENT_PAGES = [
      ['merge', '#/app/merge'],
      ['settings', '#/settings'],
      ['help', '#/help'],
    ]
    await check(`${tag} pages: equal column geometry (merge/settings/help)`, async () => {
      const geo = {}
      for (const [, route] of CONTENT_PAGES) geo[route] = await pageGeometry(page, route)
      const base = geo['#/app/merge']
      for (const [name, route] of CONTENT_PAGES) {
        const g = geo[route]
        if (g.left !== base.left) {
          throw new Error(`${name} left ${g.left}px !== merge left ${base.left}px`)
        }
        if (g.top !== base.top) {
          throw new Error(`${name} top ${g.top}px !== merge top ${base.top}px`)
        }
        if (g.width !== base.width) {
          throw new Error(`${name} width ${g.width}px !== merge width ${base.width}px`)
        }
      }
      return `left=${base.left} top=${base.top} width=${base.width} (= merge)`
    })
    for (const [name, route] of CONTENT_PAGES) {
      await check(`${tag} ${name}: horizontally centered`, async () => {
        const g = await pageGeometry(page, route)
        const vpCenter = viewport.w / 2
        const center = g.left + g.width / 2
        if (Math.abs(center - vpCenter) > 1) {
          throw new Error(`${name} left=${g.left} → center ${center}px ≠ viewport center ${vpCenter}px`)
        }
        return `${name} center ${center}px == viewport center ${vpCenter}px (left=${g.left})`
      })
    }
    // T46 (Reviewer 建议 3): overflowX 按内容页逐页量测（原只在最后停留的
    // places 路由量，三内容页无机器覆盖——居中/几何断言不保证无横向溢出）。
    await check(`${tag} content pages overflowX clean`, async () => {
      const issues = []
      for (const [name, route] of CONTENT_PAGES) {
        await page.goto(`${BASE0}${route}`, { waitUntil: 'networkidle' })
        await page.waitForSelector('.page', { timeout: 10000 })
        const o = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
        if (o > 0) issues.push(`${name}:${o}px`)
      }
      if (issues.length > 0) throw new Error(issues.join(' '))
      return '0px on merge/settings/help'
    })
    await check(`${tag} merge: footer present`, async () => {
      await page.goto(`${BASE0}/#/app/merge`, { waitUntil: 'networkidle' })
      await page.waitForSelector('.merge-page', { timeout: 10000 })
      const has = await page.$('footer.site-footer')
      if (!has) throw new Error('footer.site-footer missing')
      return 'footer.site-footer'
    })

    // B. Trips / Places stay full-viewport, no footer. Fresh visits render the
    // EmptyState (no persistence, PRD 功能 5) — the layout shell is what T44
    // touches, so the empty state is the right probe: main class + footer
    // belong to Layout, independent of data.
    await check(`${tag} trips: full-viewport main, no footer`, async () => {
      await page.goto(`${BASE0}/#/app`, { waitUntil: 'networkidle' })
      await page.waitForSelector('.empty-state, .trips-shell', { timeout: 10000 })
      const state = await shellState(page)
      if (state.mainClass !== 'app-main app-main--app') {
        throw new Error(`expected "app-main app-main--app", got "${state.mainClass}"`)
      }
      if (state.hasFooter) throw new Error('unexpected footer on Trips')
      return state.mainClass
    })
    await check(`${tag} places: full-viewport main, no footer`, async () => {
      await page.goto(`${BASE0}/#/app/places`, { waitUntil: 'networkidle' })
      await page.waitForSelector('.empty-state, .leaflet-container', { timeout: 15000 })
      const state = await shellState(page)
      if (state.mainClass !== 'app-main app-main--app') {
        throw new Error(`expected "app-main app-main--app", got "${state.mainClass}"`)
      }
      if (state.hasFooter) throw new Error('unexpected footer on Places')
      return state.mainClass
    })

    // C. 0 pageerror / 0 overflowX across the checked routes
    await check(`${tag} pageerror clean`, async () => {
      const real = runtimeErrors.filter((e) => !e.includes(KNOWN_NOISE))
      if (real.length > 0) throw new Error(real.join(' | '))
      return `0 (filtered ${runtimeErrors.length - real.length} known CSP noise)`
    })
    await check(`${tag} overflowX clean`, async () => {
      const o = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      if (o > 0) throw new Error(`horizontal overflow ${o}px`)
      return `${o}px`
    })
    await context.close().catch(() => {})
  }

  const failed = results.filter((r) => !r.pass)
  exitCode = failed.length > 0 ? 1 : 0
  console.log(`\nverdict: ${exitCode === 0 ? 'PASS' : 'FAIL'} (${results.length - failed.length}/${results.length} checks PASS)`)
  console.log(`exit code: ${exitCode}`)
} catch (err) {
  console.error('smoke-merge-layout crashed:', err)
  exitCode = 2
  console.error('exit code: 2')
} finally {
  if (browser) await browser.close().catch(() => {})
  await stopPreview(server)
}
process.exit(exitCode)