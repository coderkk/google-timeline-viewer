#!/usr/bin/env node
// PRIVACY-TAP v1 — smoke-network-tap.mjs
// T42 (DESIGN-T42.md §3): machine-enforced privacy assertion for the default
// configuration. Every network request initiated by the app runtime must be
// allowed by scripts/privacy-allowlist.json or this gate FAILS.
//
// Scope contract (from the allowlist `meta.scope`): default configuration only
// (tile source = OpenStreetMap, no persisted user settings). The custom tile
// source is an explicit user opt-in OUTSIDE the default scope — it is not
// whitelisted; instead calibration probe B proves the tap flags any arbitrary
// custom host red (gauge sensitivity).
//
// ── HARD RULE (red line, DESIGN-T42.md §3) ──────────────────────────────────
// The sweep and the calibration probes NEVER click any external anchor
// (google.com / coderkk.net / any a[href^="http"] leaving the origin). Those
// links are user opt-in surfaces; clicking them inside CI would literally ship
// the viewer's coordinates to Google. Navigation is limited to hash changes
// (#/app, #/settings …) and same-origin buttons.
//
// ── Exit codes ───────────────────────────────────────────────────────────────
//   0  assert phase clean (0 violations, vacuous guards satisfied) AND every
//      calibration probe was flagged as a violation
//   1  assert phase violation (gate red): VIOLATION-* row, vacuous guard, or
//      CSP static check failure
//   2  calibration failure (gauge broken, red): a probe that should flag an
//      injected violation did not
//   3  runtime error: base unreachable, allowlist unreadable / schema invalid,
//      or the sweep itself crashed
//
// ── CLI ──────────────────────────────────────────────────────────────────────
//   --base <url>          app origin to assert (default http://127.0.0.1:4173)
//   --allowed <path>      allowlist JSON (default scripts/privacy-allowlist.json
//                         relative to this file)
//   --json <path>         write the structured report (for CI annotations)
//   --calibrate-only      run only the calibration probes (assert phase skipped)
//
// ── Assert phase (default config) ────────────────────────────────────────────
//   Desktop 1440×900 + mobile 390×844; captures are the UNION of both viewports
//   (page.on('request') fires at initiation, success/failure independent).
//   Route traversal S1–S8:
//     S1 landing (.hero-cta .btn-primary)
//     S2 click "立即体验" → .trip-map (built-in sample + OSM tile burst;
//        REQUIRED signal: >=1 captured request to a tile origin)
//     S3 map settle (waitForTimeout 1500 — deliberately not networkidle)
//     S4 setInputFiles with a minimal format-1 fixture (REQUIRED signal:
//        data stats render = .trips-summary; proves the real import worker)
//     S5 #/app/places (.leaflet-container)
//     S6 #/app/merge (static)
//     S7 back to /app, open Export, download the blob (acceptDownloads)
//     S8 #/settings → #/help → landing
//   Per-request adjudication order: local scheme → ALLOW-LOCAL; non-http(s)
//   → VIOLATION-SCHEME; origin == self → ALLOW-SELF; tile origin + pathPattern
//   → ALLOW-TILE (path mismatch → VIOLATION-PATH); anything else →
//   VIOLATION-HOST. Payload hardening: ALLOW-SELF/ALLOW-TILE still fail on a
//   non-empty query (VIOLATION-QUERY) or non-empty request body
//   (VIOLATION-PAYLOAD) — "no network request carries raw coordinates" lands
//   at the network layer (DESIGN-T42.md §3③). `exceptions` never auto-allow.
//   Vacuous guards (anti-false-green): tile path not exercised → exit 1;
//   data not ready after S4 → exit 1.
//   CSP static check (third layer): fetch base/index.html, require
//   connect-src to exist, contain 'self', contain no '*' and no concrete
//   https://host token (policy.cspConnectSrcHostTokens) → exit 1 on violation.
//
// ── Calibration phase (negative control, WORKFLOW §8) ───────────────────────
//   Separate context; every probe MUST register as a VIOLATION, otherwise the
//   gauge is broken (exit 2):
//     probe A — fetch injection via page.evaluate, intercepted by
//               page.route(...abort) so it never touches the real network;
//               expects VIOLATION-HOST.
//     probe B — real Settings UI: type an arbitrary https:// tile URL, apply,
//               return to the app, force a TileLayer reload; expects
//               VIOLATION-HOST (custom tile source is opt-in, never whitelisted).
//
// ── Test seams (documented, CI never sets them) ──────────────────────────────
//   T42_VACUOUS_SIM=1      simulate an empty sweep so the vacuous guards fire
//                          (proves the anti-false-green branch, A5)
//   T42_PROBE_A_URL=''     disable probe A → calibration fails (proves exit 2,
//                          A4/A6 gauge-broken path)
//
// Usage:
//   node scripts/smoke-network-tap.mjs --base http://127.0.0.1:4173
// Requires scripts/node_modules (playwright) and the built site served at base
// (local: `cd src && npm run build && npm run preview`; CI: python http.server).

import { chromium } from 'playwright'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'

const VERSION = 'PRIVACY-TAP v1'

// ── CLI ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const argValue = (name, fallback) => {
  const i = argv.indexOf(name)
  return i === -1 ? fallback : argv[i + 1]
}
const BASE = (argValue('--base', 'http://127.0.0.1:4173') ?? '').replace(/\/+$/, '')
const ALLOWED_ARG = argValue('--allowed', null)
const ALLOWED_PATH = ALLOWED_ARG
  ? path.resolve(ALLOWED_ARG)
  : fileURLToPath(new URL('./privacy-allowlist.json', import.meta.url))
const JSON_PATH = argValue('--json', null)
const CALIBRATE_ONLY = argv.includes('--calibrate-only')

// Test seams (see header).
const VACUOUS_SIM = process.env.T42_VACUOUS_SIM === '1'
const PROBE_A_URL = process.env.T42_PROBE_A_URL ?? 'https://example.com/t42-calibration-probe'
const PROBE_B_URL = process.env.T42_PROBE_B_URL ?? 'https://tiles.example.com/{z}/{x}/{y}.png'

// ── Allowlist loading + schema validation ───────────────────────────────────
// Schema contract (DESIGN-T42.md §2): meta{repo,app,updated,scope,surfaces,
// limitations} + localSchemes[] + network{self.match, tile:[{name,origin,
// pathPattern,note}]} + policy{networkRequestsNoQuery, networkRequestsNoPayload,
// cspConnectSrcHostTokens, customTileSource{...}} + exceptions[] (every entry
// MUST carry date/owner/reason — reason missing is a violation, §1.4).
function loadAllowlist(file) {
  let raw
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    throw new Error(`allowlist unreadable or invalid JSON at ${file}: ${err.message}`)
  }
  const problems = []
  const needObj = (v, name) => {
    if (v == null || typeof v !== 'object' || Array.isArray(v)) problems.push(`${name}: expected object`)
    return v
  }
  const needArr = (v, name) => {
    if (!Array.isArray(v)) problems.push(`${name}: expected array`)
    return v
  }
  const meta = needObj(raw.meta, 'meta')
  for (const k of ['repo', 'app', 'updated', 'scope']) {
    if (typeof meta?.[k] !== 'string') problems.push(`meta.${k}: expected string`)
  }
  needArr(meta?.surfaces, 'meta.surfaces')
  needArr(meta?.limitations, 'meta.limitations')
  const localSchemes = needArr(raw.localSchemes, 'localSchemes')
  for (const s of localSchemes ?? []) {
    if (typeof s !== 'string') problems.push(`localSchemes: expected string entries`)
  }
  const network = needObj(raw.network, 'network')
  if (typeof network?.self?.match !== 'string') problems.push('network.self.match: expected string')
  const tiles = needArr(network?.tile, 'network.tile')
  for (const [i, t] of (tiles ?? []).entries()) {
    if (typeof t?.name !== 'string') problems.push(`network.tile[${i}].name: expected string`)
    if (typeof t?.origin !== 'string' || !/^https?:\/\//.test(t.origin)) {
      problems.push(`network.tile[${i}].origin: expected http(s) URL string`)
    }
    if (typeof t?.pathPattern !== 'string') {
      problems.push(`network.tile[${i}].pathPattern: expected string`)
    } else {
      try {
        new RegExp(t.pathPattern)
      } catch {
        problems.push(`network.tile[${i}].pathPattern: invalid regex "${t.pathPattern}"`)
      }
    }
    if (typeof t?.note !== 'string') problems.push(`network.tile[${i}].note: expected string`)
  }
  const policy = needObj(raw.policy, 'policy')
  for (const k of ['networkRequestsNoQuery', 'networkRequestsNoPayload', 'cspConnectSrcHostTokens']) {
    if (typeof policy?.[k] !== 'boolean') problems.push(`policy.${k}: expected boolean`)
  }
  const cts = needObj(policy?.customTileSource, 'policy.customTileSource')
  if (typeof cts?.status !== 'string') problems.push('policy.customTileSource.status: expected string')
  needArr(cts?.surfaces, 'policy.customTileSource.surfaces')
  const exceptions = needArr(raw.exceptions, 'exceptions')
  for (const [i, e] of (exceptions ?? []).entries()) {
    for (const k of ['date', 'owner', 'reason']) {
      if (typeof e?.[k] !== 'string') problems.push(`exceptions[${i}].${k}: expected string (mandatory)`)
    }
  }
  if (problems.length > 0) throw new Error(`allowlist schema invalid at ${file}:\n  - ${problems.join('\n  - ')}`)
  return raw
}

const allowlist = loadAllowlist(ALLOWED_PATH)
const SELF_ORIGIN = new URL(BASE).origin
const TILE_ORIGINS = new Set(allowlist.network.tile.map((t) => t.origin))
const LOCAL_SCHEMES = new Set(allowlist.localSchemes)
const TILE_PATTERNS = allowlist.network.tile.map((t) => ({ origin: t.origin, re: new RegExp(t.pathPattern), name: t.name }))
const report = {
  tool: 'privacy-tap',
  version: 1,
  base: BASE,
  allowlist: ALLOWED_PATH,
  scope: 'default-config',
  calibrateOnly: CALIBRATE_ONLY,
  captured: [],
  counts: { total: 0, allows: 0, violations: 0 },
  violations: [],
  vacuous: { tilePathExercised: false, dataReady: false },
  calibration: { probeA: { flagged: false, requests: 0, verdict: null, url: PROBE_A_URL }, probeB: { flagged: false, requests: 0, verdict: null, url: PROBE_B_URL } },
  verdict: 'FAIL',
  exitCode: 3,
}

// ── Per-request adjudication (DESIGN-T42.md §3) ─────────────────────────────
function classify(req) {
  // req: { url, method, postData }
  let parsed
  try {
    parsed = new URL(req.url)
  } catch {
    return { verdict: 'VIOLATION-SCHEME', detail: 'unparseable URL' }
  }
  const scheme = parsed.protocol
  if (LOCAL_SCHEMES.has(scheme)) return { verdict: 'ALLOW-LOCAL', detail: scheme }
  if (scheme !== 'http:' && scheme !== 'https:') {
    return { verdict: 'VIOLATION-SCHEME', detail: `${scheme}//` }
  }
  const selfOrigin = parsed.origin === SELF_ORIGIN
  const tile = TILE_PATTERNS.find((t) => t.origin === parsed.origin)
  if (!selfOrigin && !tile) return { verdict: 'VIOLATION-HOST', detail: parsed.origin }
  if (tile && !tile.re.test(parsed.pathname)) {
    return { verdict: 'VIOLATION-PATH', detail: `${parsed.pathname} does not match ${tile.re}` }
  }
  // Payload hardening for the two allowed classes: the default configuration
  // must never attach a query string or a request body to network requests.
  if (allowlist.policy.networkRequestsNoQuery && parsed.search !== '') {
    return { verdict: 'VIOLATION-QUERY', detail: `query string "${parsed.search}" on ${parsed.origin}` }
  }
  const body = req.postData ?? null
  if (allowlist.policy.networkRequestsNoPayload && typeof body === 'string' && body.length > 0) {
    return { verdict: 'VIOLATION-PAYLOAD', detail: `${body.length} bytes request body on ${parsed.origin}` }
  }
  if (selfOrigin) return { verdict: 'ALLOW-SELF', detail: SELF_ORIGIN }
  return { verdict: 'ALLOW-TILE', detail: tile.name }
}

// ── Health poll (≤30s) ──────────────────────────────────────────────────────
async function waitReady(base, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  let lastErr = null
  while (Date.now() < deadline) {
    try {
      const res = await fetch(base)
      if (res.ok) return
      lastErr = new Error(`base returned HTTP ${res.status}`)
    } catch (err) {
      lastErr = err
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`base not reachable at ${base} within ${timeoutMs}ms (${lastErr?.message ?? 'no response'})`)
}

// ── CSP static check (third layer) ──────────────────────────────────────────
function checkCsp(html) {
  if (!allowlist.policy.cspConnectSrcHostTokens) return { ok: true, note: 'cspConnectSrcHostTokens=false, check disabled' }
  const meta = html.match(/<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/i)
  if (!meta) return { ok: false, note: 'CSP meta tag not found in index.html' }
  // The CSP meta content attribute is double-quoted and may itself contain
  // single-quoted tokens ('self' etc.), so the capture must only exclude '"'.
  const content = meta[0].match(/content=\s*"([^"]*)"/i)
  if (!content) return { ok: false, note: 'CSP meta tag without content attribute' }
  const directive = content[1].split(';').map((s) => s.trim()).find((d) => /^connect-src\b/i.test(d))
  if (!directive) return { ok: false, note: 'connect-src directive missing from CSP' }
  const tokens = directive.replace(/^connect-src\s*/i, '').split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return { ok: false, note: 'connect-src directive is empty' }
  if (!tokens.includes("'self'")) return { ok: false, note: "connect-src missing 'self'" }
  if (tokens.includes('*')) return { ok: false, note: 'connect-src contains "*"' }
  const hostToken = tokens.find((t) => /^https?:\/\/[^\s'"]+/.test(t) || t.startsWith('//'))
  if (hostToken) return { ok: false, note: `connect-src contains concrete host token: ${hostToken}` }
  return { ok: true, note: `connect-src tokens: ${tokens.join(' ')}` }
}

// ── Minimal format-1 Timeline.json fixture (1 visit + 1 raw point) ──────────
// Generated in a tmpdir, removed at the end, never committed (C4).
function makeFixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 't42-'))
  const file = path.join(dir, 'Timeline.json')
  const doc = [
    {
      semanticSegments: [
        {
          startTime: '2024-05-01T07:00:00.000Z',
          endTime: '2024-05-01T09:00:00.000Z',
          placeVisit: {
            location: {
              name: 'Home',
              address: '1 Main St',
              latitudeE7: 523719400,
              longitudeE7: 13375000,
              placeId: 'home',
            },
            duration: {
              startTimestampMs: '2024-05-01T07:00:00.000Z',
              endTimestampMs: '2024-05-01T09:00:00.000Z',
            },
          },
        },
        {
          startTime: '2024-05-01T09:00:00.000Z',
          endTime: '2024-05-01T09:40:00.000Z',
          activityType: 'IN_PASSENGER_VEHICLE',
          startLocation: { latitudeE7: 523719400, longitudeE7: 13375000 },
          endLocation: { latitudeE7: 524433000, longitudeE7: 13518900 },
          waypointPath: {
            waypoints: [
              { latE7: 523719400, lngE7: 13375000 },
              { latE7: 524000000, lngE7: 13400000 },
              { latE7: 524433000, lngE7: 13518900 },
            ],
          },
        },
      ],
      rawSignals: [
        {
          position: {
            LatLng: '52.3719400°, 1.3375000°',
            accuracyMeters: 12,
            timestamp: '2024-05-01T08:00:00.000Z',
          },
        },
      ],
    },
  ]
  writeFileSync(file, JSON.stringify(doc))
  return { dir, file }
}

// ── Assert sweep for one viewport ───────────────────────────────────────────
async function sweepViewport(browser, viewport, fixturePath) {
  const context = await browser.newContext({ viewport, acceptDownloads: true })
  const page = await context.newPage()
  page.setDefaultTimeout(20000)
  page.on('dialog', (d) => d.accept().catch(() => {}))
  const captured = []
  page.on('request', (req) => {
    let postData = null
    try {
      postData = req.postData()
    } catch {
      postData = null
    }
    captured.push({ url: req.url(), method: req.method(), postData })
  })
  const steps = []
  const mark = (s) => steps.push(s)
  let dataReady = false
  try {
    await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.hero-cta .btn-primary') // S1 landing
    mark('S1 landing')
    await page.click('.hero-cta .btn-primary') // S2 sample + OSM tile burst
    await page.waitForSelector('.trip-map', { timeout: 30000 })
    await page.waitForTimeout(1500) // S3 map settle (no networkidle bet)
    mark('S2/S3 sample+map')
    // S4 real import of the minimal fixture (through the parse worker)
    await page.locator('.data-bar-btn').last().click() // change data
    await page.waitForSelector('input[type=file]', { state: 'attached' })
    await page.setInputFiles('input[type=file]', fixturePath)
    await page.waitForSelector('.trips-summary', { timeout: 60000 }) // data-ready signal
    await page.waitForTimeout(800)
    dataReady = (await page.locator('.trips-summary').count()) > 0
    mark('S4 fixture-import dataReady=' + dataReady)
    // S5 places
    await page.evaluate(() => { location.hash = '#/app/places' })
    await page.waitForSelector('.leaflet-container')
    await page.waitForTimeout(1000)
    mark('S5 places')
    // S6 merge (static)
    await page.evaluate(() => { location.hash = '#/app/merge' })
    await page.waitForSelector('.merge-page')
    await page.waitForTimeout(400)
    mark('S6 merge')
    // S7 export blob download
    await page.evaluate(() => { location.hash = '#/app' })
    await page.waitForSelector('.trip-map')
    const downloadP = page.waitForEvent('download', { timeout: 15000 }).catch(() => null)
    await page.locator('.data-bar-btn').first().click()
    await page.waitForSelector('.export-dialog')
    await page.click('.export-confirm')
    const dl = await downloadP
    mark('S7 export-download ' + (dl ? 'fired' : 'not-observed'))
    // S8 settings → help → landing
    await page.evaluate(() => { location.hash = '#/settings' })
    await page.waitForSelector('.settings-page')
    await page.waitForTimeout(300)
    await page.evaluate(() => { location.hash = '#/help' })
    await page.waitForSelector('.page-help')
    await page.waitForTimeout(300)
    await page.evaluate(() => { location.hash = '#/' })
    await page.waitForSelector('.hero-cta .btn-primary')
    await page.waitForTimeout(300)
    mark('S8 settings/help/landing')
  } finally {
    await context.close().catch(() => {})
  }
  return { captured, steps, dataReady }
}

// ── Calibration probes (negative control) ───────────────────────────────────
async function runCalibration(browser) {
  const context = await browser.newContext({ acceptDownloads: false })
  const page = await context.newPage()
  page.setDefaultTimeout(20000)
  page.on('dialog', (d) => d.accept().catch(() => {}))
  const captured = []
  page.on('request', (req) => {
    let postData = null
    try {
      postData = req.postData()
    } catch {
      postData = null
    }
    captured.push({ url: req.url(), method: req.method(), postData })
  })
  try {
    await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.hero-cta .btn-primary')

    // Probe A — fetch injection, intercepted (never touches the real network).
    if (PROBE_A_URL) {
      await page.route(PROBE_A_URL, (route) => route.abort())
      await page.evaluate((url) => fetch(url, { method: 'GET' }).catch(() => {}), PROBE_A_URL)
      await page.waitForTimeout(600)
    }
    const aReqs = captured.filter((r) => r.url.startsWith(PROBE_A_URL))
    const aClass = aReqs.map((r) => classify(r))
    const aFlag = aReqs.length > 0 && aClass.every((c) => c.verdict === 'VIOLATION-HOST')
    console.log(`  [calibrate] probe A fetch-injection -> ${aReqs.length} request(s), verdict=${aClass[0]?.verdict ?? 'none'} ${aFlag ? 'FLAGGED' : 'NOT-FLAGGED'}`)
    report.calibration.probeA.flagged = aFlag
    report.calibration.probeA.requests = aReqs.length
    report.calibration.probeA.verdict = aClass[0]?.verdict ?? null

    // Probe B — custom tile source through the REAL Settings UI.
    if (PROBE_B_URL) {
      await page.click('.hero-cta .btn-primary') // sample → a map is mounted
      await page.waitForSelector('.trip-map', { timeout: 30000 })
      await page.waitForTimeout(1000)
      await page.evaluate(() => { location.hash = '#/settings' })
      await page.waitForSelector('.settings-page')
      await page.fill('.tile-field input', PROBE_B_URL)
      await page.click('.tile-actions .btn-primary')
      await page.waitForSelector('.settings-custom-badge', { timeout: 10000 }) // applied
      await page.waitForTimeout(300)
      await page.evaluate(() => { location.hash = '#/app' })
      await page.waitForSelector('.trip-map')
      // Force the TileLayer to actually re-request from the custom host.
      await page.waitForTimeout(1500)
    }
    const bReqs = captured.filter((r) => {
      try {
        return new URL(r.url).origin === new URL(PROBE_B_URL.replace('{z}', '0').replace('{x}', '0').replace('{y}', '0')).origin
      } catch {
        return r.url.startsWith(PROBE_B_URL.split('{')[0])
      }
    })
    const bClass = bReqs.map((r) => classify(r))
    const bFlag = bReqs.length > 0 && bClass.every((c) => c.verdict === 'VIOLATION-HOST')
    console.log(`  [calibrate] probe B custom-tile-UI -> ${bReqs.length} request(s), verdict=${bClass[0]?.verdict ?? 'none'} ${bFlag ? 'FLAGGED' : 'NOT-FLAGGED'}`)
    report.calibration.probeB.flagged = bFlag
    report.calibration.probeB.requests = bReqs.length
    report.calibration.probeB.verdict = bClass[0]?.verdict ?? null
  } finally {
    await context.close().catch(() => {})
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
let browser = null
let fixture = null
try {
  console.log(`${VERSION} allowlist=${ALLOWED_PATH} base=${BASE} scope=default-config`)
  if (VACUOUS_SIM) console.log('  [vacuous-sim] T42_VACUOUS_SIM=1 — simulating empty sweep (fixture guards)')
  await waitReady(BASE)

  const assertFailures = []
  if (CALIBRATE_ONLY) {
    console.log('  calibrate-only: assert phase skipped')
  } else {
    // ── CSP static check ────────────────────────────────────────────────────
    const htmlRes = await fetch(`${BASE}/index.html`)
    if (!htmlRes.ok) throw new Error(`index.html unreachable (HTTP ${htmlRes.status})`)
    const csp = checkCsp(await htmlRes.text())
    console.log(`  csp-static ${csp.ok ? 'OK' : 'FAIL'} — ${csp.note}`)
    if (!csp.ok) assertFailures.push({ verdict: 'VIOLATION-CSP', url: `${BASE}/index.html`, detail: csp.note, count: 1 })

    // ── S1–S8 sweep across both viewports, UNION capture set ──────────────
    browser = browser ?? (await chromium.launch({ headless: true }))
    let allCaptured = []
    let dataReadySeen = false
    if (VACUOUS_SIM) {
      // Test seam: skip the real sweep, present an empty capture union so the
      // vacuous guards fire (anti-false-green branch self-test, A5).
      allCaptured = []
      dataReadySeen = false
    } else {
      fixture = makeFixture()
      for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
        const res = await sweepViewport(browser, viewport, fixture.file)
        console.log(`  [${viewport.name} ${viewport.width}x${viewport.height}] ${res.steps.join(' · ')} (captured=${res.captured.length})`)
        allCaptured = allCaptured.concat(res.captured)
        if (res.dataReady) dataReadySeen = true
      }
      rmSync(fixture.dir, { recursive: true, force: true })
      fixture = null
    }

    // Vacuous guards (exit 1) — evaluated on the union.
    const tileHits = allCaptured.filter((r) => {
      try {
        return TILE_ORIGINS.has(new URL(r.url).origin)
      } catch {
        return false
      }
    }).length
    report.vacuous.tilePathExercised = tileHits > 0
    report.vacuous.dataReady = dataReadySeen
    if (tileHits === 0) {
      assertFailures.push({ verdict: 'VACUOUS', url: '(sweep)', detail: 'tile path not exercised — sweep is vacuous', count: 1 })
      console.log('  [vacuous] tile path not exercised — sweep is vacuous')
    }
    if (!dataReadySeen) {
      assertFailures.push({ verdict: 'VACUOUS', url: '(sweep)', detail: 'data not ready after fixture import — import path not exercised', count: 1 })
      console.log('  [vacuous] data not ready after fixture import — import path not exercised')
    }

    // Classify the union (dedupe by method+url).
    const seen = new Map()
    for (const r of allCaptured) {
      const key = `${r.method} ${r.url}`
      if (!seen.has(key)) seen.set(key, { ...r, count: 0 })
      seen.get(key).count += 1
    }
    for (const r of seen.values()) {
      const cls = classify(r)
      report.captured.push({ verdict: cls.verdict, url: r.url, count: r.count, detail: cls.detail })
      report.counts.total += r.count
      if (cls.verdict.startsWith('ALLOW')) {
        report.counts.allows += r.count
        console.log(`  ${cls.verdict} ${r.url} (${cls.detail})`)
      } else {
        report.counts.violations += r.count
        report.violations.push({ verdict: cls.verdict, url: r.url, count: r.count, detail: cls.detail })
        // Per-request violations are gate failures (exit 1) — the classification
        // loop must feed assertFailures or the verdict would never see them
        // (a false-green surfaced by the A3 tri-state injection, 2026-09-17).
        assertFailures.push({ verdict: cls.verdict, url: r.url, count: r.count, detail: cls.detail })
        console.log(`  >>> ${cls.verdict} ${r.url} (${cls.detail})`)
      }
    }
    for (const f of assertFailures) {
      if (f.verdict === 'VIOLATION-CSP') report.violations.unshift(f)
    }
  }

  // ── Calibration ──────────────────────────────────────────────────────────
  browser = browser ?? (await chromium.launch({ headless: true }))
  console.log('  calibrate:')
  await runCalibration(browser)
  const calibOk = report.calibration.probeA.flagged && report.calibration.probeB.flagged

  report.verdict = CALIBRATE_ONLY
    ? (calibOk ? 'PASS' : 'FAIL')
    : (assertFailures.length > 0 ? 'FAIL' : 'PASS')
  report.exitCode = assertFailures.length > 0 ? 1 : calibOk ? 0 : 2
  console.log(`verdict: ${report.verdict} (assert-failures=${assertFailures.length} calibration-probes-flagged=${report.calibration.probeA.flagged}/${report.calibration.probeB.flagged})`)
  console.log(`exit code: ${report.exitCode}`)
} catch (err) {
  console.error('privacy-tap crashed:', err)
  report.verdict = 'FAIL'
  report.exitCode = 3
  report.crash = String(err?.message ?? err)
} finally {
  if (fixture) rmSync(fixture.dir, { recursive: true, force: true })
  if (browser) await browser.close().catch(() => {})
  if (JSON_PATH) {
    try {
      writeFileSync(JSON_PATH, JSON.stringify(report, null, 2))
      console.log(`report written: ${JSON_PATH}`)
    } catch (err) {
      console.error(`failed to write json report ${JSON_PATH}: ${err.message}`)
    }
  }
}
process.exit(report.exitCode)