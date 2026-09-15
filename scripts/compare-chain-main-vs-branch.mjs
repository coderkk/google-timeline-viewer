#!/usr/bin/env node
// compare-chain-main-vs-branch.mjs
// T33 B5方案A验证：同一份 livedata 上对比「main（全 segments 参与链）」与
// 「branch（by-activity，过滤 timelinePath-only traces）」的行程链统计。
//
// Usage: node scripts/compare-chain-main-vs-branch.mjs [file1.json ...]
//   defaults to docs/livedata/Timeline-20250213.json and Timeline-20260820.json
//
// 与 T32 脚本的差异：只做链统计（不做 overlap 分类），并输出
//   1. 三角数（chain movement 同时重叠两侧 visit）——方案A目标归零
//   2. 链边数（chain movement 去重计数）
//   3. 孤立 visit 数（无 incoming 且无 outgoing）——trace 过滤前的桥接失效
//   4. duration 分布对比（链边段时长分桶，验证 2h 假移动被移除）
//
// 配对逻辑与 lib/tripChain.ts buildTripChain 完全一致（merge-sort + 最近邻扫描）。
// branch 侧的过滤与解析层 hasActivitySemantics 判据一致：
//   无 activity 包装 + 无 activityType + 无 start/end 位置 → trace（排除）。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, basename, dirname } from 'node:path'

const DEFAULT_FILES = [
  'docs/livedata/Timeline-20250213.json',
  'docs/livedata/Timeline-20260820.json',
]
const OUT_DIR = 'scripts/out'

// ── Helpers（与 analyze-visit-activity-overlap.mjs 对齐）────────────────────

function toMs(iso) {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) throw new Error(`Bad timestamp: ${iso}`)
  return t
}

function asRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value
    : null
}

function stringField(record, keys) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return undefined
}

function getLatLng(location) {
  const rec = asRecord(location)
  if (!rec) return null
  const latLng = rec['latLng']
  if (typeof latLng === 'string') {
    const parts = latLng.replace('°', '').replace(/\s/g, '').split(',')
    if (parts.length >= 2) {
      const lat = parseFloat(parts[0])
      const lng = parseFloat(parts[1])
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }
    }
  }
  for (const key of ['lat', 'latitude']) {
    if (typeof rec[key] === 'number') {
      const lat = rec[key]
      const lng = rec['lng'] ?? rec['longitude']
      if (typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng }
      }
    }
  }
  return null
}

/** 与 parse/common.ts addSegment 的 hasActivitySemantics 判据对齐。 */
function hasActivitySemanticsFor(record) {
  const activityRec = asRecord(record['activity'])
  const start =
    getLatLng(record['startLocation']) ??
    getLatLng(activityRec?.['start']) ??
    getLatLng(record['start'])
  const end =
    getLatLng(record['endLocation']) ??
    getLatLng(activityRec?.['end']) ??
    getLatLng(record['end'])
  return (
    activityRec !== null ||
    stringField(record, ['activityType']) !== undefined ||
    start !== null ||
    end !== null
  )
}

/**
 * 模拟 buildTripChain 配对（lib/tripChain.ts）。
 * filterTraces=true 时排除 hasActivitySemantics=false 的段（branch 侧）。
 * 返回每个 visit 的 { incoming, outgoing }（对应原数组索引）。
 */
function simulateChain(visits, segments, filterTraces) {
  const events = []
  for (let i = 0; i < segments.length; i++) {
    if (filterTraces && segments[i].hasActivitySemantics === false) continue
    events.push({ kind: 'seg', ms: segments[i].startMs, index: i })
  }
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

function overlaps(aS, aE, bS, bE) {
  return aS < bE && bS < aE
}

const BUCKETS = [
  { label: ' < 15min', min: 0, max: 15 * 60_000 },
  { label: '15–30min', min: 15 * 60_000, max: 30 * 60_000 },
  { label: '30–60min', min: 30 * 60_000, max: 60 * 60_000 },
  { label: ' 1–2h  ', min: 60 * 60_000, max: 120 * 60_000 },
  { label: '≈2h ±10min', min: 110 * 60_000, max: 130 * 60_000 },
  { label: ' > 2h  ', min: 120 * 60_000, max: Number.POSITIVE_INFINITY },
]

function durationBuckets(msArray) {
  const counts = {}
  for (const b of BUCKETS) counts[b.label] = 0
  counts[' < 10min'] = 0
  counts['10–14min'] = 0
  for (const ms of msArray) {
    if (ms < 10 * 60_000) counts[' < 10min']++
    else if (ms < 15 * 60_000) counts['10–14min']++
    let placed = false
    for (const b of BUCKETS) {
      if (ms >= b.min && ms < b.max) {
        counts[b.label]++
        placed = true
        break
      }
    }
    // ≈2h bucket overlaps the 1–2h / >2h buckets by design; keep the flag
    // but avoid double counting in the >=15min report by skipping.
    if (!placed) counts[' > 2h  ']++
  }
  return counts
}

/** 链统计：三角数、链边数、孤立 visit、duration 分布。 */
function chainStats(visits, segments, filterTraces) {
  const chain = simulateChain(visits, segments, filterTraces)

  const chainSegSet = new Set()
  let isolated = 0
  for (let vi = 0; vi < visits.length; vi++) {
    const info = chain[vi]
    if (!info) continue
    if (info.outgoing !== null) chainSegSet.add(info.outgoing)
    if (info.incoming !== null) chainSegSet.add(info.incoming)
    if (info.incoming === null && info.outgoing === null) isolated++
  }

  // 三角：链边段同时重叠其两侧 visit（outgoing(vi) 又重叠后续 visit）。
  let triangles = 0
  const triangleSegIdxs = new Set()
  for (let vi = 0; vi < visits.length; vi++) {
    const info = chain[vi]
    if (!info || info.outgoing === null) continue
    const seg = segments[info.outgoing]
    for (let vj = vi + 1; vj < visits.length; vj++) {
      if (visits[vj].startMs >= seg.endMs) break
      if (overlaps(visits[vj].startMs, visits[vj].endMs, seg.startMs, seg.endMs)) {
        triangles++
        triangleSegIdxs.add(info.outgoing)
        break
      }
    }
  }

  const chainDurations = []
  for (const segIdx of chainSegSet) {
    chainDurations.push(segments[segIdx].endMs - segments[segIdx].startMs)
  }
  chainDurations.sort((a, b) => a - b)
  const medianMs = chainDurations.length
    ? chainDurations[Math.floor(chainDurations.length / 2)]
    : 0

  return {
    hasFilter: filterTraces,
    visitCount: visits.length,
    segmentCount: segments.length,
    chainEdgeCount: chainSegSet.size,
    triangleCount: triangles,
    triangleSegmentCount: triangleSegIdxs.size,
    isolatedVisitCount: isolated,
    isolatedVisitPct: visits.length ? ((isolated / visits.length) * 100).toFixed(1) + '%' : '0%',
    medianChainDurationMin: (medianMs / 60000).toFixed(1),
    durationBuckets: durationBuckets(chainDurations),
  }
}

// ── 加载 & 分类（与 T32 脚本一致 + hasActivitySemantics 判据）───────────────

function loadRecords(filePath) {
  const raw = JSON.parse(readFileSync(filePath, 'utf8'))
  const segs = raw.semanticSegments || []

  const visits = []
  const segments = []
  let timelineMemoryCount = 0
  let otherCount = 0

  for (const rec of segs) {
    if (rec.visit) {
      const vtc = asRecord(rec.visit.topCandidate)
      const loc = asRecord(vtc?.['placeLocation'])
      visits.push({
        startMs: toMs(rec.startTime),
        endMs: toMs(rec.endTime),
        coord: getLatLng(loc ?? vtc),
      })
      continue
    }
    if (rec.timelineMemory) {
      timelineMemoryCount++
      continue
    }
    // 其余（activity / trace / 其它 travelish）走 addSegment 语义。
    const activityRec = asRecord(rec['activity'])
    const activityType =
      stringField(rec, ['activityType']) ??
      stringField(asRecord(asRecord(rec['activity'])?.['topCandidate']) ?? {}, ['type'])
    if (
      activityRec === null &&
      activityType === undefined &&
      rec.timelinePath === undefined &&
      rec.waypointPath === undefined &&
      rec.path === undefined &&
      rec.simplifiedRawPath === undefined &&
      rec.transitPath === undefined
    ) {
      otherCount++
      continue
    }
    const semantic = hasActivitySemanticsFor(rec)
    const path = rec.timelinePath ?? rec.waypointPath ?? rec.path ?? rec.simplifiedRawPath ?? rec.transitPath ?? []
    segments.push({
      startMs: toMs(rec.startTime),
      endMs: toMs(rec.endTime),
      hasActivitySemantics: semantic,
      type: activityType ?? (semantic ? 'activity' : 'timelinePath-trace'),
    })
  }

  visits.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)
  return { visits, segments, timelineMemoryCount, otherCount, totalSemanticSegments: segs.length }
}

// ── 输出 ─────────────────────────────────────────────────────────────────────

function fmtCount(n) {
  return n.toLocaleString()
}

function renderReport(result) {
  const { file, main, branch } = result
  const lines = []
  lines.push(`═══ chain compare (main vs branch) — ${file} ═══`)
  lines.push(`  semanticSegments: ${fmtCount(result.totalSemanticSegments)}`
    + ` = visit ${fmtCount(result.visitCount)} + segment ${fmtCount(result.segmentCount)}`
    + ` + memory ${result.timelineMemoryCount} + other ${result.otherCount}`)
  lines.push('')
  lines.push('  ── main  (全 segments 参与链，trace 未过滤) ──')
  lines.push(`    chain edges:        ${fmtCount(main.chainEdgeCount)}`)
  lines.push(`    triangles:          ${fmtCount(main.triangleCount)}  (segments ${fmtCount(main.triangleSegmentCount)})`)
  lines.push(`    isolated visits:    ${fmtCount(main.isolatedVisitCount)}  (${main.isolatedVisitPct})`)
  lines.push(`    median chain duration: ${main.medianChainDurationMin} min`)
  lines.push(`    duration buckets:`)
  for (const [k, v] of Object.entries(main.durationBuckets)) {
    lines.push(`      ${k}  ${fmtCount(v)}`)
  }
  lines.push('')
  lines.push('  ── branch (by-activity，timelinePath-only traces 已过滤) ──')
  lines.push(`    chain edges:        ${fmtCount(branch.chainEdgeCount)}`)
  lines.push(`    triangles:          ${fmtCount(branch.triangleCount)}  (segments ${fmtCount(branch.triangleSegmentCount)})`)
  lines.push(`    isolated visits:    ${fmtCount(branch.isolatedVisitCount)}  (${branch.isolatedVisitPct})`)
  lines.push(`    median chain duration: ${branch.medianChainDurationMin} min`)
  lines.push(`    duration buckets:`)
  for (const [k, v] of Object.entries(branch.durationBuckets)) {
    lines.push(`      ${k}  ${fmtCount(v)}`)
  }
  lines.push('')
  lines.push('  ── delta (main → branch) ──')
  lines.push(`    chain edges:        ${fmtCount(main.chainEdgeCount)} → ${fmtCount(branch.chainEdgeCount)}`
    + `  (${main.chainEdgeCount ? ((branch.chainEdgeCount / main.chainEdgeCount - 1) * 100).toFixed(1) : 'n/a'}%)`)
  lines.push(`    triangles:          ${fmtCount(main.triangleCount)} → ${fmtCount(branch.triangleCount)}`
    + `  (removed ${fmtCount(main.triangleCount - branch.triangleCount)})`)
  lines.push(`    isolated visits:    ${fmtCount(main.isolatedVisitCount)} → ${fmtCount(branch.isolatedVisitCount)}`
    + `  (+${fmtCount(branch.isolatedVisitCount - main.isolatedVisitCount)})`)
  lines.push(`    median chain duration: ${main.medianChainDurationMin} → ${branch.medianChainDurationMin} min`)
  return lines.join('\n')
}

// ── Entry point ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const files = args.length > 0 ? args : DEFAULT_FILES.map((f) => resolve(f))

const reports = []
for (const f of files) {
  const t0 = performance.now()
  const { visits, segments, timelineMemoryCount, otherCount, totalSemanticSegments } = loadRecords(f)
  const main = chainStats(visits, segments, false)
  const branch = chainStats(visits, segments, true)
  const report = {
    file: basename(f),
    totalSemanticSegments,
    visitCount: visits.length,
    segmentCount: segments.length,
    timelineMemoryCount,
    otherCount,
    main,
    branch,
    elapsedMs: Math.round(performance.now() - t0),
  }
  reports.push(report)
  const text = renderReport(report)
  process.stdout.write(text + '\n\n')

  mkdirSync(dirname(resolve(OUT_DIR)), { recursive: true })
  const outPath = resolve(OUT_DIR, `chain-compare-${report.file.replace(/\.json$/, '')}.txt`)
  writeFileSync(outPath, text + '\n')
  process.stdout.write(`  → wrote ${outPath}\n\n`)
}