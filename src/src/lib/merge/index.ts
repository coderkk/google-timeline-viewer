// Merge archive page algorithm (T36 / PRD 功能 14): combine a previous merged
// Timeline.json archive with a freshly exported one, "divide and conquer":
//
//   - semanticSegments  → the NEW export's, verbatim. Google keeps the full
//     semantic history in every export, so the newest copy is the most
//     complete; replacing (never concat or dedup) keeps the merged file at
//     exactly one semantic layer.
//   - rawSignals        → window-complementary accumulation. Google only keeps
//     a ~29-day rolling window of raw fixes, so the pool grows across exports:
//     non-overlapping windows concatenate; overlapping points fold by
//     "time ± tolerance + position" keeping the NEW export's fix. Coordless
//     entries (wifiScan / activityRecord — no coordinates) dedup by *exact
//     identity*: a byte-identical copy already in the pool folds, so re-merging
//     the same export never proliferates them, while genuine increments
//     survive.
//   - userLocationProfile → the NEW export's.
//
// The output is a format-1 Timeline.json ({ semanticSegments, rawSignals,
// userLocationProfile }) that the existing import page parses like any native
// export. This module is a pure function of the two files' text — no DOM, no
// network, unit-testable.
import { asRecord, getLatLng, timeField } from '../parse/common'
import { extractFormat1Slices } from '../parse/formatTimelineArray'
import { haversineKm } from '../types'

/** ±60s: two fixes closer in time than this — with matching position — fold. */
export const MERGE_TIME_TOLERANCE_MS = 60_000

/** ~100m: position tolerance for the duplicate-fold decision. */
export const MERGE_POSITION_TOLERANCE_M = 100

export interface MergeInput {
  /** File name, used only for error messages. */
  name: string
  /** Full text of a format-1 Timeline.json export. */
  text: string
}

export interface MergeStats {
  /** semanticSegments records in the merged file (always the newer export's). */
  semanticSegments: number
  /** rawSignals entries in the merged file (mixes + coordinate fixes). */
  rawSignals: number
  /** Coordinate-bearing GPS fixes preserved in the merged file. */
  points: number
  /** Latest raw fix timestamp in the merged window (for the file name). */
  windowEndMs: number
}

export interface MergeOutcome {
  /** Serialized merged Timeline.json. */
  json: string
  stats: MergeStats
}

/** Errors carry a message-catalog key + interpolating params for i18n. */
export class MergeError extends Error {
  readonly key: string
  readonly params: Record<string, string | number>

  constructor(key: string, params: Record<string, string | number> = {}) {
    super(key)
    this.name = 'MergeError'
    this.key = key
    this.params = params
  }
}

// -- Raw signal point extraction ---------------------------------------------

interface RawPointSignal {
  timestampMs: number
  lat: number
  lng: number
}

interface IndexedSignal extends RawPointSignal {
  /** Index of the entry inside its rawSignals array. */
  index: number
}

/**
 * Extract the fix (time + coordinate) of a rawSignals entry. Mirrors
 * `parseRawSignal`'s acceptance exactly: the nested `position` wrapper is the
 * primary source (uppercase `LatLng` + nested `timestamp` in the device
 * export), the coordless `wifiScan`/`activityRecord` categories are not
 * points, and the legacy flat spelling falls back to the record itself.
 */
function pointSignal(entry: unknown): RawPointSignal | null {
  const record = asRecord(entry)
  if (!record) return null
  const position = asRecord(record['position'])
  if (position) {
    return fixFrom(position)
  }
  if (record['wifiScan'] !== undefined || record['activityRecord'] !== undefined) return null
  return fixFrom(record)
}

function fixFrom(record: Record<string, unknown>): RawPointSignal | null {
  const coordinate = getLatLng(record)
  if (!coordinate) return null
  const timestampMs = timeField(record, ['timestampMs', 'timestamp', 'time'])
  if (timestampMs === undefined) return null
  return { timestampMs, lat: coordinate.lat, lng: coordinate.lng }
}

function collectSignals(entries: readonly unknown[]): IndexedSignal[] {
  const out: IndexedSignal[] = []
  for (let i = 0; i < entries.length; i++) {
    const signal = pointSignal(entries[i])
    if (signal) out.push({ ...signal, index: i })
  }
  return out.sort((a, b) => a.timestampMs - b.timestampMs)
}

// -- Fold window --------------------------------------------------------------

/** First index in a ts-sorted signal list whose ts >= the given ts. */
function lowerBound(signals: readonly RawPointSignal[], ts: number): number {
  let lo = 0
  let hi = signals.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (signals[mid].timestampMs < ts) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** True when two fixes fall inside the fold tolerance (time + position). */
function isNear(a: RawPointSignal, b: RawPointSignal): boolean {
  if (Math.abs(a.timestampMs - b.timestampMs) > MERGE_TIME_TOLERANCE_MS) return false
  return haversineKm(a, b) * 1000 <= MERGE_POSITION_TOLERANCE_M
}

/**
 * True when any signal in the ts-sorted `candidates` list lies within the fold
 * tolerance of `point`. The ±tolerance time window narrows the scan to a
 * handful of candidates via binary search, so the whole fold stays
 * O((nOld+nNew) log n) instead of comparing every pair.
 */
function hasNearMatch(point: RawPointSignal, candidates: readonly RawPointSignal[]): boolean {
  const start = lowerBound(candidates, point.timestampMs - MERGE_TIME_TOLERANCE_MS)
  for (let i = start; i < candidates.length; i++) {
    const candidate = candidates[i]
    if (candidate.timestampMs - point.timestampMs > MERGE_TIME_TOLERANCE_MS) break
    if (isNear(point, candidate)) return true
  }
  return false
}

/**
 * Fold two rawSignals arrays into the merged stream, newest-wins (PRD 功能 14):
 *  1. every NEW fix is a fold candidate — the new export's own fixes pass
 *     through verbatim, so a single file's stationary/moving-slow pings keep
 *     their full density;
 *  2. an OLD fix folds away when any NEW fix falls within the fold tolerance
 *     ("保留新导出的点") — this is what makes same-file-twice and overlapping
 *     ~29-day rolling windows idempotent;
 *  3. coordless mix entries (wifiScan / activityRecord / …) have no foldable
 *     coordinate, so they dedup by *exact identity* only: a NEW coordless entry
 *     byte-identical to one already in the accumulated pool folds (the pool's
 *     own copy wins), keeping re-merges idempotent while genuine increments
 *     pass through.
 * Output keeps old-then-new document order; the import pipeline sorts by time
 * itself, so serialized order is semantically irrelevant.
 */
function foldRawSignals(oldEntries: readonly unknown[], newEntries: readonly unknown[]): unknown[] {
  const keptNewSignals = collectSignals(newEntries)

  const dropOld = new Array<boolean>(oldEntries.length).fill(false)
  for (const signal of collectSignals(oldEntries)) {
    if (hasNearMatch(signal, keptNewSignals)) dropOld[signal.index] = true
  }

  // Coordless exact-identity pass (T36 fix #2): serialize each coordless entry
  // in the accumulated pool into a Set (O(n)), then fold NEW entries whose
  // serialization is *exactly* in the set. JSON.stringify is the strictest
  // "completely identical" comparison — a same-shape entry with any different
  // field value is a real increment and survives.
  const oldCoordlessKeys = new Set<string>()
  for (const entry of oldEntries) {
    if (!pointSignal(entry)) oldCoordlessKeys.add(JSON.stringify(entry))
  }

  const merged: unknown[] = []
  for (let i = 0; i < oldEntries.length; i++) {
    if (!dropOld[i]) merged.push(oldEntries[i])
  }
  for (const entry of newEntries) {
    if (!pointSignal(entry) && oldCoordlessKeys.has(JSON.stringify(entry))) continue
    merged.push(entry)
  }
  return merged
}

// -- Public entry point -------------------------------------------------------

function parseRoot(input: MergeInput): unknown {
  try {
    return JSON.parse(input.text)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new MergeError('import.notJson', { name: input.name, reason })
  }
}

/** A merge input must be a recognizable format-1 Timeline.json. */
function requireFormat1(name: string, slices: ReturnType<typeof extractFormat1Slices>): void {
  if (slices.invalidTopObject || slices.missingSegments) {
    throw new MergeError('merge.error.needTimeline', { name })
  }
  if (slices.semanticSegments.length === 0 && slices.rawSignals.length === 0) {
    throw new MergeError('import.emptyData', { name })
  }
  // Data-safety guard (T36 fix #1): raw signals without a semantic layer must
  // not be merged. semanticSegments of the merged file are taken verbatim from
  // the newer export, so accepting this would silently REPLACE the archive's
  // accumulated semantic layer with an empty one.
  if (slices.semanticSegments.length === 0) {
    throw new MergeError('merge.error.needSemanticSegments', { name })
  }
}

/**
 * Merge a previous archive (optional) with a fresh export into a single
 * format-1 Timeline.json. Pure: both inputs are file text; the outcome is a
 * serialized document plus stats. Errors are `MergeError`s carrying i18n keys.
 */
export function mergeTimelineExports(
  mainArchive: MergeInput | null,
  newExport: MergeInput,
): MergeOutcome {
  const newRoot = parseRoot(newExport)
  const newSlices = extractFormat1Slices(newRoot, `"${newExport.name}"`)
  requireFormat1(newExport.name, newSlices)

  let oldEntries: readonly unknown[] = []
  if (mainArchive) {
    const oldRoot = parseRoot(mainArchive)
    const oldSlices = extractFormat1Slices(oldRoot, `"${mainArchive.name}"`)
    requireFormat1(mainArchive.name, oldSlices)
    oldEntries = oldSlices.rawSignals.map((slice) => slice.item)
  }

  const newEntries = newSlices.rawSignals.map((slice) => slice.item)
  const rawSignals = foldRawSignals(oldEntries, newEntries)
  // semanticSegments: the newest export's, verbatim — the merged file carries
  // exactly one semantic layer (PRD 功能 14 "最新 = 最全，无需合并去重").
  const semanticSegments = newSlices.semanticSegments.map((slice) => slice.item)

  const output: Record<string, unknown> = { semanticSegments, rawSignals }
  if (newSlices.userLocationProfile !== undefined) {
    output.userLocationProfile = newSlices.userLocationProfile
  }

  // Compact serialization: pretty-printing would roughly double an already
  // 100MB+ document for zero parser benefit.
  const json = JSON.stringify(output)

  let points = 0
  let windowEndMs = 0
  for (const entry of rawSignals) {
    const signal = pointSignal(entry)
    if (!signal) continue
    points += 1
    if (signal.timestampMs > windowEndMs) windowEndMs = signal.timestampMs
  }

  return {
    json,
    stats: {
      semanticSegments: semanticSegments.length,
      rawSignals: rawSignals.length,
      points,
      windowEndMs,
    },
  }
}