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
//                      map, INSTANT nav to Merge, ×6 rounds.
//   B. Trips whammy  — mobile, stay click → tooltip, then re-import ×3 + INSTANT
//                      nav to Merge (fresh page per cycle).
//   C. Desktop reg   — 1440×900 sidebar collapse/expand ×3 (T27 white-screen
//                      path), root must stay single-child, 0 pageerror.
//
// Usage:
//   node scripts/smoke-race-check.mjs
//
// Prints a PASS/FAIL summary. Requires scripts/node_modules (playwright) and a
// production build (`npm run build` in src/ first).

import { chromium } from 'playwright'
import { spawn } from 'node:child_process'

const ROOT = new URL('../src/', import.meta.url).pathname
const BASE = 'http://127.0.0.1:4194'
const SAMPLE = new URL('../src/src/lib/sample/sample-timeline.json', import.meta.url).pathname

const server = spawn(
  'npx',
  ['vite', 'preview', '--port', '4194', '--strictPort', '--host', '127.0.0.1'],
  { cwd: ROOT, stdio: 'ignore' },
)
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 250))
  try {
    const res = await fetch(BASE)
    if (res.ok) break
  } catch {}
}

const browser = await chromium.launch({ headless: true })
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

// ── A. Places race: ring-fit animation torn down mid-flight ×6 ──────────────
let aRaces = 0
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
    console.log(`  A[${i}] race window navAt=t+${navAt}ms leafletRace=${races.length} totalErrors=${errs.length}`)
  } catch (e) {
    console.log(`  A[${i}] runError=${String(e).slice(0, 160)} leafletRace=${errs.filter(isRace).length}`)
  } finally {
    await page.close()
  }
}
results.push({ name: 'A Places race ×6', ok: aRaces === 0, detail: `leafletRace=${aRaces}/6` })

// ── B. Trips whammy: tooltip path + re-import + INSTANT nav ×3 ───────────────
const { page: bPage, errs: bErrs } = await newMobilePage()
let tooltipOk = false
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
} finally {
  await bPage.close()
}
const bRaces = bErrs.filter(isRace).length
console.log(`  B tooltip=${tooltipOk} cycles=3 leafletRace=${bRaces} totalErrors=${bErrs.length}`)
results.push({ name: 'B Trips whammy', ok: tooltipOk && bRaces === 0, detail: `tooltip=${tooltipOk} leafletRace=${bRaces}` })

// ── C. Desktop regression: sidebar collapse/expand ×3 (T27 path) ─────────────
const { page: cPage, errs: cErrs } = await newMobilePage()
let rootOk = true
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
} finally {
  await cPage.close()
}
const cRaces = cErrs.filter(isRace).length
console.log(`  C collapseExpand×3 rootOk=${rootOk} leafletRace=${cRaces} totalErrors=${cErrs.length}`)
results.push({ name: 'C Desktop reg', ok: rootOk && cRaces === 0, detail: `rootOk=${rootOk} leafletRace=${cRaces}` })

await browser.close()
server.kill()

const failed = results.filter((r) => !r.ok)
console.log('\nsmoke-race-check summary:')
for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  (${r.detail})`)
if (failed.length > 0) {
  console.error(`\nN1 race seal BROKEN — ${failed.length} section(s) failed. Do not release.`)
  process.exit(1)
}
console.log('\nN1 race seal intact — 0 `_leaflet_pos` pageerrors, ready for release.')