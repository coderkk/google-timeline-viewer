#!/usr/bin/env node
// analyze-visit-activity-overlap.mjs
// T32 B5侦察：量化 livedata 中 visit 与「行程段」的时间重叠形态
//
// Usage: node scripts/analyze-visit-activity-overlap.mjs [file1.json] [file2.json]
//   defaults to docs/livedata/Timeline-20250213.json and Timeline-20260820.json
//
// Investigation note (T32 / B5):
//   The task asked for visit ↔ activity-keyed segment overlaps. Both livedata
//   files show *zero* such overlaps — visits and activities form a clean
//   partition. BUT the product's parse layer (parse/common.ts addSegment)
//   ALSO exposes `timelinePath`-only segments (2h coarse GPS traces) as
//   `segments`, and `prepareTrips` feeds BOTH populations into T29's
//   `buildTripChain`. Those traces DO overlap visits heavily (the trace covers
//   the visit window too), so the analysis runs twice:
//   1. visits ↔ activity-keyed segments  (task's literal definition)
//   2. visits ↔ ALL parsed segments      (what T29 actually pairs with)
//
// For population 2, in addition to raw overlap counting, the script SIMULATES
// T29's pairing exactly (same merge-sort + nearest-prev/next scan as
// lib/tripChain.ts) and measures the "triangle / back-to-back" phenomenon:
// a movement segment that is the outgoing of one visit AND the incoming of the
// next visit while time-overlapping both stays.
//
// Output: human-readable summary + compact JSON report, both to stdout.

import { readFileSync } from 'node:fs'
import { resolve, basename } from 'node:path'

const DEFAULT_FILES = [
  'docs/livedata/Timeline-20250213.json',
  'docs/livedata/Timeline-20260820.json',
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMs(iso) {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) throw new Error(`Bad timestamp: ${iso}`)
  return t
}

function fmtUtc(ms) {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19)
}

function fmtMin(ms) {
  return (ms / 60000).toFixed(1)
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

function coordStr(coord) {
  if (!coord) return '?'
  return `${coord.lat.toFixed(5)}, ${coord.lng.toFixed(5)}`
}

function overlaps(aS, aE, bS, bE) {
  return aS < bE && bS < aE
}

/** All (visit, segment) time-overlap pairs; O(V log S + k). */
function findOverlapPairs(visits, segments) {
  const ordered = segments
    .map((s, idx) => ({ s, idx }))
    .sort((a, b) => a.s.startMs - b.s.startMs || a.idx - b.idx)
  const pairs = []
  for (let vi = 0; vi < visits.length; vi++) {
    const v = visits[vi]
    let lo = 0, hi = ordered.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (ordered[mid].s.endMs <= v.startMs) lo = mid + 1
      else hi = mid
    }
    for (let ai = lo; ai < ordered.length; ai++) {
      const seg = ordered[ai].s
      if (seg.startMs >= v.endMs) break
      // Binary search only guarantees ordered[lo].endMs > v.startMs.
      // Later candidates (sorted by start only) may have earlier endMs.
      if (seg.endMs <= v.startMs) continue
      let type
      if (seg.startMs === v.startMs && seg.endMs === v.endMs) type = 'E'
      else if (seg.startMs <= v.startMs && seg.endMs >= v.endMs) type = 'A'
      else if (v.startMs <= seg.startMs && v.endMs >= seg.endMs) type = 'B'
      else if (seg.startMs < v.startMs && seg.endMs < v.endMs) type = 'C'
      else type = 'D'
      pairs.push({
        vIdx: vi,
        segIdx: ordered[ai].idx,
        type,
        overlapMs: Math.min(v.endMs, seg.endMs) - Math.max(v.startMs, seg.startMs),
      })
    }
  }
  return pairs
}

/**
 * Simulate T29 pairing exactly (lib/tripChain.ts): merge visits + segments,
 * sort by (startMs, kind: seg<visit, index), nearest-prev/next segment scan.
 * Returns per-visit incoming/outgoing segment indices.
 */
function simulateT29Chain(visits, segments) {
  const events = []
  for (let i = 0; i < segments.length; i++) events.push({ kind: 'seg', ms: segments[i].startMs, index: i })
  for (let i = 0; i < visits.length; i++) events.push({ kind: 'visit', ms: visits[i].startMs, index: i })
  events.sort((a, b) => {
    if (a.ms !== b.ms) return a.ms - b.ms
    if (a.kind === b.kind) return a.index - b.index
    return a.kind === 'seg' ? -1 : 1
  })
  const prevSeg = new Array(events.length).fill(null)
  const nextSeg = new Array(events.length).fill(null)
  let last = null
  for (let i = 0; i < events.length; i++) {
    prevSeg[i] = last
    if (events[i].kind === 'seg') last = events[i].index
  }
  last = null
  for (let i = events.length - 1; i >= 0; i--) {
    nextSeg[i] = last
    if (events[i].kind === 'seg') last = events[i].index
  }
  // Build a lookup from visit index → chain info
  const visitChain = new Array(visits.length).fill(null)
  for (let i = 0; i < events.length; i++) {
    if (events[i].kind !== 'visit') continue
    const vIdx = events[i].index
    visitChain[vIdx] = {
      incoming: prevSeg[i] === null ? null : prevSeg[i],
      outgoing: nextSeg[i] === null ? null : nextSeg[i],
    }
  }
  return visitChain
}

/** Compute a full overlap + T29-triangle report over one (visits, segments). */
function analyzePopulation(visits, segments) {
  const pairs = findOverlapPairs(visits, segments)

  const typeCounts = { A: 0, B: 0, C: 0, D: 0, E: 0 }
  let maxOverlapMs = 0
  const durations = []
  for (const p of pairs) {
    typeCounts[p.type]++
    if (p.overlapMs > maxOverlapMs) maxOverlapMs = p.overlapMs
    durations.push(p.overlapMs)
  }
  durations.sort((a, b) => a - b)
  const medianOverlapMs = durations.length ? durations[Math.floor(durations.length / 2)] : 0

  // Broad b2b: a segment time-overlapping >= 2 DISTINCT visit records.
  const segVisitCount = new Map()
  for (const p of pairs) {
    let set = segVisitCount.get(p.segIdx)
    if (!set) segVisitCount.set(p.segIdx, (set = new Set()))
    set.add(p.vIdx)
  }
  const b2bSegIdxs = []
  for (const [segIdx, set] of segVisitCount) if (set.size >= 2) b2bSegIdxs.push(segIdx)
  const b2bSet = new Set(b2bSegIdxs)

  const b2bDurations = []
  for (const p of pairs) if (b2bSet.has(p.segIdx)) b2bDurations.push(p.overlapMs)
  b2bDurations.sort((a, b) => a - b)

  // T29 triangle: simulate pairing; a segment counts when it is the incoming
  // of one visit and the outgoing of another AND time-overlaps both visits.
  const chain = simulateT29Chain(visits, segments)
  const chainSegments = new Set()
  const trianglePairs = [] // { segIdx, fromV, toV, fromOverlapMs, toOverlapMs }
  for (let vi = 0; vi < visits.length; vi++) {
    const info = chain[vi]
    if (!info) continue
    if (info.outgoing !== null) chainSegments.add(info.outgoing)
    if (info.incoming !== null) chainSegments.add(info.incoming)
    // Outgoing side: seg = outgoing(vi); does it also overlap a LATER visit?
    if (info.outgoing !== null) {
      const seg = segments[info.outgoing]
      for (let vj = vi + 1; vj < visits.length; vj++) {
        if (visits[vj].startMs >= seg.endMs) break
        if (overlaps(visits[vj].startMs, visits[vj].endMs, seg.startMs, seg.endMs)) {
          trianglePairs.push({
            segIdx: info.outgoing,
            fromV: vi,
            toV: vj,
            fromOverlapMs: Math.min(visits[vi].endMs, seg.endMs) - Math.max(visits[vi].startMs, seg.startMs),
            toOverlapMs: Math.min(visits[vj].endMs, seg.endMs) - Math.max(visits[vj].startMs, seg.startMs),
          })
          break // one instance per (visit, seg) is enough for counting
        }
      }
    }
  }

  // Distinct segments participating in any triangle
  const triangleSegSet = new Set(trianglePairs.map((t) => t.segIdx))

  // Sample builder: prefer temporally distinct visits (dedupe identical ranges).
  const keyOf = (v) => `${v.startMs}:${v.endMs}`
  const sampleDedupe = trianglePairs.filter((t) => keyOf(visits[t.fromV]) !== keyOf(visits[t.toV]))
  const triangleSamples = sampleDedupe
    .map((t) => {
      const seg = segments[t.segIdx]
      const fromV = visits[t.fromV]
      const toV = visits[t.toV]
      return {
        segType: seg.type,
        segStart: fmtUtc(seg.startMs),
        segEnd: fmtUtc(seg.endMs),
        segStartCoord: coordStr(seg.coordStart),
        segEndCoord: coordStr(seg.coordEnd),
        fromVisitStart: fmtUtc(fromV.startMs),
        fromVisitEnd: fmtUtc(fromV.endMs),
        toVisitStart: fmtUtc(toV.startMs),
        toVisitEnd: fmtUtc(toV.endMs),
        fromOverlapMin: parseFloat((t.fromOverlapMs / 60000).toFixed(1)),
        toOverlapMin: parseFloat((t.toOverlapMs / 60000).toFixed(1)),
      }
    })
    .sort((a, b) => Math.min(b.fromOverlapMin, b.toOverlapMin) - Math.min(a.fromOverlapMin, a.toOverlapMin))
    .slice(0, 10)

  return {
    visitCount: visits.length,
    segmentCount: segments.length,
    // Population-level overlap statistics
    overlapPairs: pairs.length,
    overlapTypeCounts: typeCounts,
    maxOverlapMinutes: parseFloat(fmtMin(maxOverlapMs)),
    medianOverlapMinutes: parseFloat(fmtMin(medianOverlapMs)),
    // Broad back-to-back (time-overlap >=2 visits, any segment)
    b2bSegmentCount: b2bSegIdxs.length,
    b2bPairCount: b2bSegIdxs.reduce((acc, s) => acc + segVisitCount.get(s).size - 1, 0),
    b2bMedianOverlapMinutes: b2bDurations.length
      ? parseFloat(fmtMin(b2bDurations[Math.floor(b2bDurations.length / 2)]))
      : 0,
    // T29 triangle (a chain movement overlapping both its flanking visits)
    chainMovementCount: chainSegments.size,
    triangleSegmentCount: triangleSegSet.size,
    triangleVisitorPairCount: trianglePairs.length,
    triangleMedianOverlapMinutes: trianglePairs.length
      ? parseFloat(
          fmtMin(
            trianglePairs
              .map((t) => Math.min(t.fromOverlapMs, t.toOverlapMs))
              .sort((a, b) => a - b)[Math.floor(trianglePairs.length / 2)],
          ),
        )
      : 0,
    triangleSamples,
  }
}

// ── Main analysis ────────────────────────────────────────────────────────────

function analyzeFile(filePath) {
  const t0 = performance.now()
  const raw = JSON.parse(readFileSync(filePath, 'utf8'))
  const segs = raw.semanticSegments || []
  const loadMs = performance.now() - t0

  const visits = []
  const activitySegments = []
  const traceSegments = []
  let timelineMemoryCount = 0

  for (const s of segs) {
    if (s.visit) {
      visits.push({
        startMs: toMs(s.startTime),
        endMs: toMs(s.endTime),
        coord: parseCoord(s.visit.topCandidate?.placeLocation?.latLng),
      })
      continue
    }
    if (s.activity) {
      activitySegments.push({
        startMs: toMs(s.startTime),
        endMs: toMs(s.endTime),
        type: s.activity.topCandidate?.type || `activity`,
        coordStart: parseCoord(s.activity.start?.latLng),
        coordEnd: parseCoord(s.activity.end?.latLng),
      })
      continue
    }
    if (s.timelinePath) {
      const path = s.timelinePath
      traceSegments.push({
        startMs: toMs(s.startTime),
        endMs: toMs(s.endTime),
        type: 'timelinePath-trace',
        coordStart: parseCoord(path[0]?.point),
        coordEnd: parseCoord(path[path.length - 1]?.point),
      })
      continue
    }
    if (s.timelineMemory) {
      timelineMemoryCount++
      continue
    }
  }

  visits.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)

  const allSegments = [...activitySegments, ...traceSegments]

  return {
    file: basename(filePath),
    loadMs: Math.round(loadMs),
    segmentComposition: {
      totalSemanticSegments: segs.length,
      visitKeyedRecords: visits.length,
      activityKeyedSegments: activitySegments.length,
      timelinePathOnlyTraces: traceSegments.length,
      timelineMemoryIgnored: timelineMemoryCount,
    },
    visitActivityOverlap: analyzePopulation(visits, activitySegments),
    t29InputOverlap: analyzePopulation(visits, allSegments),
    elapsedMs: Math.round(performance.now() - t0),
  }
}

function printPopulationSummary(header, s) {
  const lines = []
  lines.push(`  ${header}:`)
  lines.push(`    visits: ${s.visitCount.toLocaleString()}   segments: ${s.segmentCount.toLocaleString()}`)
  lines.push(`    overlap pairs: ${s.overlapPairs.toLocaleString()}`)
  lines.push(`      A (seg ⊇ visit):  ${s.overlapTypeCounts.A.toLocaleString()}`)
  lines.push(`      B (visit ⊇ seg):  ${s.overlapTypeCounts.B.toLocaleString()}`)
  lines.push(`      C (head overlap): ${s.overlapTypeCounts.C.toLocaleString()}`)
  lines.push(`      D (tail overlap): ${s.overlapTypeCounts.D.toLocaleString()}`)
  lines.push(`      E (exact equal):  ${s.overlapTypeCounts.E.toLocaleString()}`)
  lines.push(`    max overlap: ${s.maxOverlapMinutes} min   median overlap: ${s.medianOverlapMinutes} min`)
  lines.push(`    broad b2b (seg overlaps >=2 visits): ${s.b2bSegmentCount.toLocaleString()} segs / ${s.b2bPairCount.toLocaleString()} pairs, median overlap ${s.b2bMedianOverlapMinutes} min`)
  lines.push(`    T29 chain movements: ${s.chainMovementCount.toLocaleString()}`)
  lines.push(`    T29 triangle (movement overlapping both flanking visits): ${s.triangleSegmentCount.toLocaleString()} segs / ${s.triangleVisitorPairCount.toLocaleString()} pairs, median overlap ${s.triangleMedianOverlapMinutes} min`)
  if (s.triangleSamples.length > 0) {
    lines.push(`    triangle samples (${Math.min(5, s.triangleSamples.length)} shown):`)
    for (let i = 0; i < Math.min(5, s.triangleSamples.length); i++) {
      const x = s.triangleSamples[i]
      lines.push(`      #${i + 1} seg=${x.segType} ${x.segStart} → ${x.segEnd}  (${x.segStartCoord} → ${x.segEndCoord})`)
      lines.push(`           fromVisit ${x.fromVisitStart} → ${x.fromVisitEnd}  overlap ${x.fromOverlapMin}min`)
      lines.push(`           toVisit   ${x.toVisitStart} → ${x.toVisitEnd}  overlap ${x.toOverlapMin}min`)
    }
  }
  return lines
}

function printHumanSummary(result) {
  const lines = []
  const c = result.segmentComposition
  lines.push(`═══ ${result.file} ═══`)
  lines.push(`  semanticSegments: ${c.totalSemanticSegments.toLocaleString()} =`
    + ` visit ${c.visitKeyedRecords.toLocaleString()} + activity ${c.activityKeyedSegments.toLocaleString()}`
    + ` + trace ${c.timelinePathOnlyTraces.toLocaleString()} + memory ${c.timelineMemoryIgnored}`)
  lines.push(`  elapsed ${result.elapsedMs}ms (load ${result.loadMs}ms)`)
  lines.push('')
  lines.push(...printPopulationSummary('[1] 任务字面定义: visit ↔ activity-keyed segments', result.visitActivityOverlap))
  lines.push('')
  lines.push(...printPopulationSummary('[2] T29 实际输入: visit ↔ ALL segments (activity + trace)', result.t29InputOverlap))
  lines.push('')
  return lines.join('\n')
}

// ── Entry point ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const files = args.length > 0 ? args : DEFAULT_FILES.map((f) => resolve(f))

const results = []
for (const f of files) {
  try {
    results.push(analyzeFile(f))
  } catch (err) {
    console.error(`Error processing ${f}: ${err.message}`)
    process.exit(1)
  }
}

for (const result of results) {
  process.stdout.write(printHumanSummary(result))
}
process.stdout.write('\n' + JSON.stringify(results, null, 2) + '\n')