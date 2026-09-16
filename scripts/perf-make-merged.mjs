#!/usr/bin/env node
// perf-make-merged.mjs
// T37 — produce the merged-archive input for the performance re-test.
//
// Faithfully reproduces the T36 merge (PRD 功能 14) for the two livedata
// exports: semanticSegments + userLocationProfile come from the NEWER export
// (2026), rawSignals windows complement each other (1.5y apart, no fold
// candidates within ±60s / ~100m) so they simply concatenate — identical to
// what the MergePage would write for this pair.
//
// Writes a single Timeline.json-compatible file for the perf test to import.
//
// Usage: node scripts/perf-make-merged.mjs [out.json]
//   out default: scripts/out/timeline-merged-perf.json

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const NEWER = 'docs/livedata/Timeline-20260820.json'
const OLDER = 'docs/livedata/Timeline-20250213.json'
const OUT = process.argv[2] ? resolve(process.argv[2]) : resolve('scripts/out/timeline-merged-perf.json')

const newer = JSON.parse(readFileSync(resolve(NEWER), 'utf8'))
const older = JSON.parse(readFileSync(resolve(OLDER), 'utf8'))

// semanticSegments + userLocationProfile: newest export wins (T36).
// rawSignals: window-complementary accumulation (concat in time order).
const raw = [...older.rawSignals, ...newer.rawSignals]
raw.sort((a, b) => Date.parse(a.position?.timestamp ?? '') - Date.parse(b.position?.timestamp ?? ''))

const merged = {
  semanticSegments: newer.semanticSegments,
  rawSignals: raw,
  userLocationProfile: newer.userLocationProfile,
}

const out = resolve(OUT)
writeFileSync(out, JSON.stringify(merged))
console.log(`wrote ${out}`)
console.log(`  semanticSegments: ${merged.semanticSegments.length}`)
console.log(`  rawSignals:       ${merged.rawSignals.length} (${older.rawSignals.length} old + ${newer.rawSignals.length} new)`)
console.log(`  size:             ${(Buffer.byteLength(JSON.stringify(merged)) / 1024 / 1024).toFixed(1)} MB`)