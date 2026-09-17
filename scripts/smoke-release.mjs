#!/usr/bin/env node
// RELEASE-SMOKE v1.1 — smoke-release.mjs
// T43 (2026-09-16 v1.0.0 release Retro, action A10 → WORKFLOW rule 16):
// the T38 dual-viewport browser smoke (originally the throwaway
// scripts/out/gh-live-smoke.mjs) is promoted into a formal release gate
// living in scripts/. It covers every check gh-live-smoke covered, adds
// exit-code plumbing and derives its self origin from --base at runtime.
//
// v1.1 (2026-09-17, T43 Reviewer PASS consumption round — G1 + S2–S6):
//   G1 help route now asserts the Help-specific `.help-section` selector +
//     a `#/help` URL tail — the old `h1, .section-title, main` set could
//     false-green a broken hash route (Landing has an h1, Layout renders
//     `main` unconditionally). Bare-page negative control added below.
//   S2 CLI: `--base=<url>` equals form + unknown-arg / missing-value errors
//     → usage + exit 2 (no silent fallback to the live URL).
//   S3 CLI: non-http(s) URL → usage + exit 2 (`new URL()` in a try).
//   S4 landing 200 asserts `status() === 200` explicitly.
//   S5 hero CTA hidden → FAIL (was PASS with value 'hidden').
//   S6 filtered pageerror lines are printed, not just counted (A12 audit).
//
// ── CLI ──────────────────────────────────────────────────────────────────────
//   --base <url> | --base=<url>   app origin to smoke test. Defaults to the
//                  live GitHub Pages URL (live mode). Self origin is derived
//                  at runtime from --base — never hardcoded.
//   Unknown argument / missing --base value / non-http(s) URL → usage to
//   stderr + exit 2 (S2/S3, no silent fallback to the live URL).
//
// ── Checks (per viewport) ────────────────────────────────────────────────────
//   Desktop 1440×900 + mobile 390×844, each:
//     landing HTTP 200 (status===200) / origin match / 4 feature cards /
//     landing title / feature tags / hero CTA visible (hidden = FAIL) /
//     help hash route (`.help-section` + url ends `#/help`) / horizontal
//     overflow / 0 pageerror.
//   pageerror + console.error are collected per viewport and asserted to be
//   empty modulo the known CSP `frame-ancestors` meta noise (DECISIONS
//   2026-09-16, A12 record); every filtered line is printed for auditability.
//   Real-import smoke stays out of scope (110MB+ fixture is not hosted);
//   the help hash route proves SPA hash routing.
//
// ── Exit codes ───────────────────────────────────────────────────────────────
//   0  every check PASS (0 pageerrors outside the known noise set)
//   1  assertion failure: any FAIL line (selector miss, wrong card count,
//      overflow, unexpected pageerror/console.error)
//   2  runtime error: base unreachable (fails fast on connection refusal,
//      no 30s stall), browser launch failure, the sweep itself crashed, or
//      a CLI usage error (unknown arg / missing --base value / bad URL)
//
// ── Output ───────────────────────────────────────────────────────────────────
//   `PASS  name: value` / `FAIL  name: value` per check, then a verdict line
//   with pass/total and the exit code.
//
// ── Calibration (WORKFLOW §8, gate script → negative control) ───────────────
//   Exit-2 path: --base pointed at a dead port (connection refused) →
//   fast-fail, exit 2.                          verified 2026-09-17 (T43)
//   Exit-1 path: --base served a minimal HTML page without .feature-card →
//   FAIL lines + exit 1 (never a false green).
//                                             verified 2026-09-17 (T43)
//   Positive: local build preview + live site both full PASS, 0 pageerror.
//                                             verified 2026-09-17 (T43)
//   G1 bare-page negative (v1.1): --base served `<main><h1>not the
//   app</h1></main>` → `help route` FAILs (`.help-section` never
//   appears; the old `h1/main` selector would have false-green).
//                                             verified 2026-09-17 (T43 fix round)
//   S2/S3 usage negatives (v1.1): dead --base port → exit 2; non-URL /
//   protocol-less --base (e.g. `localhost:4173`) → usage + exit 2; unknown
//   arg → usage + exit 2; `--base=` (no value) → usage + exit 2.
//                                             verified 2026-09-17 (T43 fix round)
//
// Usage:
//   node scripts/smoke-release.mjs --base http://127.0.0.1:4173
//   node scripts/smoke-release.mjs --base=http://127.0.0.1:4173   # equals form
//   node scripts/smoke-release.mjs                 # live mode
// Requires scripts/node_modules (playwright) and, for --base, a reachable
// built site (local: `cd src && npm run build && npx vite preview`).

import { chromium } from 'playwright'

const VERSION = 'RELEASE-SMOKE v1.1'
const DEFAULT_BASE = 'https://coderkk.github.io/google-timeline-viewer'
const KNOWN_PAGEERROR_NOISE = 'frame-ancestors' // CSP meta noise, DECISIONS 2026-09-16

// ── CLI ─────────────────────────────────────────────────────────────────────
const USAGE = `Usage: node scripts/smoke-release.mjs [--base <url>]
  --base <url>   app origin to smoke test (default: live GitHub Pages URL)
                 also accepted as --base=<url>`

function parseArgv(argv) {
  let base = DEFAULT_BASE
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith('--base=')) {
      base = arg.slice('--base='.length)
    } else if (arg === '--base') {
      const val = argv[i + 1]
      if (val === undefined || val.startsWith('--')) {
        throw new Error(`--base requires a value\n\n${USAGE}`)
      }
      base = val
      i++ // consume the value
    } else {
      throw new Error(`unknown argument: ${arg}\n\n${USAGE}`)
    }
  }
  // S3: any malformed or non-http(s) base is a usage error → exit 2 (never a
  // silent fallback to the live URL).
  let parsed
  try {
    parsed = new URL(base) // "not-a-url" / "localhost:4173" throw or parse oddly
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`unsupported protocol ${parsed.protocol}`)
    }
  } catch (err) {
    throw new Error(
      `--base is not a valid http(s) URL: ${base} (${err?.message ?? err})\n\n${USAGE}`,
    )
  }
  return {
    base: parsed.href.replace(/\/+$/, ''),
    selfOrigin: parsed.origin,
  }
}

let BASE, SELF_ORIGIN
try {
  ;({ base: BASE, selfOrigin: SELF_ORIGIN } = parseArgv(process.argv.slice(2)))
} catch (err) {
  console.error(`${VERSION}\n${err?.message ?? err}`)
  process.exit(2)
}

const results = [] // { viewport, name, value, pass }

async function check(viewportTag, name, fn) {
  const full = `${viewportTag} ${name}`
  try {
    const value = await fn()
    results.push({ viewport: viewportTag, name, value, pass: true })
    console.log(`PASS  ${full}: ${value}`)
  } catch (err) {
    const msg = String(err?.message ?? err).split('\n')[0]
    results.push({ viewport: viewportTag, name, value: msg, pass: false })
    console.log(`FAIL  ${full}: ${msg}`)
  }
}

// Health poll. A connection refused / DNS failure is not going to recover
// within the window, so it fails fast — a dead --base exits 2 immediately
// instead of stalling for the full timeout.
async function waitReady(base, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  let lastErr = null
  while (Date.now() < deadline) {
    try {
      const res = await fetch(base)
      if (res.ok) return
      lastErr = new Error(`base returned HTTP ${res.status}`)
    } catch (err) {
      throw new Error(`base not reachable at ${base}: ${err?.message ?? err}`)
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`base not reachable at ${base} within ${timeoutMs}ms (${lastErr?.message ?? 'no response'})`)
}

// ── Per-viewport sweep ──────────────────────────────────────────────────────
async function sweepViewport(browser, viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.w, height: viewport.h } })
  const page = await context.newPage()
  page.setDefaultTimeout(20000)
  const runtimeErrors = []
  page.on('pageerror', (e) => runtimeErrors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') runtimeErrors.push(`console.error: ${m.text()}`)
  })
  const tag = viewport.tag
  try {
    await check(tag, 'landing 200', async () => {
      const r = await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
      // S4: explicit status assertion — a non-200 response must FAIL,
      // not just be echoed back as a PASSing value.
      if (r.status() !== 200) throw new Error(`expected HTTP 200, got ${r.status()}`)
      return r.status()
    })
    await check(tag, 'origin match', async () => {
      const origin = await page.evaluate(() => document.location.origin)
      if (origin !== SELF_ORIGIN) {
        throw new Error(`page origin ${origin} !== base origin ${SELF_ORIGIN}`)
      }
      return origin
    })
    await check(tag, 'landing 4 feature cards', async () => {
      await page.waitForSelector('.feature-card', { timeout: 15000 })
      const n = await page.$$eval('.feature-card', (els) => els.length)
      if (n !== 4) throw new Error(`expected 4 cards, got ${n}`)
      return n
    })
    await check(tag, 'landing title', async () => {
      const t = await page.textContent('.landing-section h2')
      return (t ?? '').trim().replace(/\s+/g, ' ')
    })
    await check(tag, 'feature tags', async () => {
      const tags = await page.$$eval('.fc-tag', (els) => els.map((e) => e.textContent).join(','))
      if (!tags) throw new Error('no feature tags found')
      return tags
    })
    await check(tag, 'hero CTA visible', async () => {
      const b = await page.$('.hero-cta .btn-primary')
      if (!b) throw new Error('no primary CTA')
      // S5: a present-but-hidden CTA is a FAIL (was 'hidden' → PASS before).
      if (!(await b.isVisible())) throw new Error('hero CTA is hidden')
      return 'visible'
    })
    await check(tag, 'help route', async () => {
      await page.goto(`${BASE}/#/help`, { waitUntil: 'networkidle' })
      // G1: Help-specific selector. The old `h1, .section-title, main` set
      // false-greened a dead hash route — Landing has an h1 and Layout
      // renders `main` unconditionally, so a blank shell still matched.
      await page.waitForSelector('.help-section', { timeout: 10000 })
      const url = page.url()
      if (!url.endsWith('#/help')) throw new Error(`url ${url} does not end with #/help`)
      return url
    })
    await check(tag, 'overflowX', async () => {
      const o = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      if (o > 0) throw new Error(`horizontal overflow ${o}px`)
      return o
    })
    await check(tag, 'pageerror', async () => {
      const real = runtimeErrors.filter((e) => !e.includes(KNOWN_PAGEERROR_NOISE))
      const ignored = runtimeErrors.filter((e) => e.includes(KNOWN_PAGEERROR_NOISE))
      if (real.length > 0) throw new Error(real.join(' | '))
      if (ignored.length > 0) {
        // S6: print every filtered line — source + trigger stays traceable
        // (A12 discipline), not just a count.
        for (const line of ignored) console.log(`  (ignored known noise) ${line}`)
        return `0 (ignored ${ignored.length} known CSP frame-ancestors noise — lines above)`
      }
      return '0'
    })
  } finally {
    await context.close().catch(() => {})
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
let browser = null
let exitCode = 2
try {
  console.log(`${VERSION} base=${BASE} self=${SELF_ORIGIN}`)
  await waitReady(`${BASE}/`)
  browser = await chromium.launch({ headless: true })
  for (const viewport of [
    { tag: 'desktop', w: 1440, h: 900 },
    { tag: 'mobile', w: 390, h: 844 },
  ]) {
    await sweepViewport(browser, viewport)
  }
  const failed = results.filter((r) => !r.pass)
  exitCode = failed.length > 0 ? 1 : 0
  console.log(`\nverdict: ${exitCode === 0 ? 'PASS' : 'FAIL'} (${results.length - failed.length}/${results.length} checks PASS)`)
  console.log(`exit code: ${exitCode}`)
} catch (err) {
  console.error('smoke-release crashed:', err)
  exitCode = 2
  console.error('exit code: 2')
} finally {
  if (browser) await browser.close().catch(() => {})
}
process.exit(exitCode)