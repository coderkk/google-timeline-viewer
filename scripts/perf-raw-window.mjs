#!/usr/bin/env node
// perf-raw-window.mjs
// T37 pre-release perf test — data-window planning
//
// Counts `rawSignals` per local day (+08, the product's timezone frame) for one
// or both livedata exports, so the stress-test scenario can pick a genuinely
// dense window (~15k timeline vertices). Also simulates the T36 merged raw pool
// (window-complementary accumulation of both files) so the "超长窗口" scenario
// knows its input size before the test runs.
//
// Usage:
//   node scripts/perf-raw-window.mjs [file.json ...]
//   defaults to both docs/livedata files; each file is analyzed separately.
//
// Output: per-file per-day counts + a simulated merged pool summary.

import { readFileSync } from 'node:fs'
import { resolve, basename } from 'node:path'

const DEFAULT_FILES = [
  'docs/livedata/Timeline-20250213.json',
  'docs/livedata/Timeline-20260820.json',
]

const DAY_MS = 24 * 60 * 60 * 1000

function localDayKey(ms) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseCoord(latLngStr) {
  if (!latLngStr) return null
  const parts = latLngStr.replace('°', '').replace(/\s/g, '').split(',')
  if (parts.length < 2) return null
  const lat = parseFloat(parts[0])
  const lng = parseFloat(parts[1])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

/** Extract rawSignals as {timestampMs, lat, lng}. */
function rawPointsOf(json) {
  const out = []
  const list = json.rawSignals ?? []
  for (const r of list) {
    const p = r && typeof r === 'object' && r.position ? r.position : r
    const ms = Date.parse(p.timestamp)
    if (Number.isNaN(ms)) continue
    // format1 `position` entries spell lat/lng in a single "lat°, lng°" string
    // (a capital-L `LatLng` field); the array entries carry `latitudeE7` /
    // `longitudeE7` when present. Handle both.
    const coord = parseCoord(p.LatLng ?? (p.latitudeE7 != null ? `${p.latitudeE7 / 1e7},${p.longitudeE7 / 1e7}` : `${p.latitude},${p.longitude}`))
    if (!coord) continue
    out.push({ timestampMs: ms, lat: coord.lat, lng: coord.lng })
  }
  return out
}

function byDay(points) {
  const map = new Map()
  for (const p of points) {
    const key = localDayKey(p.timestampMs)
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
}

function fmtCount(n) {
  return n.toLocaleString('en-US')
}

function printFile(name, points) {
  const days = byDay(points)
  const total = points.length
  console.log(`\n== ${name} ==`)
  console.log(`rawSignals total: ${fmtCount(total)}`)
  if (days.length === 0) {
    console.log('  (no raw points)')
    return { total, days }
  }
  console.log(`span: ${days[0][0]} → ${days[days.length - 1][0]} (${days.length} local days)`)
  const n = days.length
  const top = [...days].sort((a, b) => b[1] - a[1]).slice(0, 12)
  console.log('top-12 densest days:')
  for (const [key, count] of top) console.log(`  ${key}  ${fmtCount(count)}`)
  // Rolling 30-day (30000? no — 30 days) window total, trailing from max:
  const maxMs = points.reduce((m, p) => Math.max(m, p.timestampMs), 0)
  const start30 = new Date(maxMs - 29 * DAY_MS).getTime()
  const win30 = points.filter((p) => p.timestampMs >= start30).length
  console.log(`trailing-30-day window (ending ${localDayKey(maxMs)}): ${fmtCount(win30)}`)
  return { total, days }
}

// ── main ─────────────────────────────────────────────────────────────────────

const files = process.argv.slice(2)
const chosen = files.length > 0 ? files : DEFAULT_FILES

const allRaw = {}
for (const f of chosen) {
  const abs = resolve(f)
  const json = JSON.parse(readFileSync(abs, 'utf8'))
  const points = rawPointsOf(json)
  allRaw[basename(f)] = printFile(basename(f), points)
}

// Merged-pool simulation (T36 window-complementary accumulation, no overlap
// between the two ~30-day windows 1.5 years apart): every raw point of both
// files survives.
if (chosen.length > 1 || files.length === 0) {
  const merged = []
  for (const f of chosen.length > 0 ? chosen : DEFAULT_FILES) {
    const abs = resolve(f)
    const json = JSON.parse(readFileSync(abs, 'utf8'))
    merged.push(...rawPointsOf(json))
  }
  console.log(`\n== merged raw pool (T36 simulation: ${chosen.map((p) => basename(p)).join(' + ')}) ==`)
  console.log(`rawSignals total: ${fmtCount(merged.length)}`)
  const days = byDay(merged)
  console.log(`span: ${days[0][0]} → ${days[days.length - 1][0]} (${days.length} local days)`)
  const maxMs = merged.reduce((m, p) => Math.max(m, p.timestampMs), 0)
  const start30 = new Date(maxMs - 29 * DAY_MS).getTime()
  const win30 = merged.filter((p) => p.timestampMs >= start30).length
  console.log(`trailing-30-day window: ${fmtCount(win30)} (=${fmtCount(win30)} raw for the default post-import range)`)
  console.log(`non-30-day raw (outside trailing window): ${fmtCount(merged.length - win30)}`)
}