// Format 1: Timeline.json direct-array export (Android 系统设置 / iOS Maps App).
// The export is either an array of days (each with `semanticSegments` +
// `rawSignals`) or — in the 2026+ device export — a plain object exposing the
// same top-level keys (`semanticSegments` + `rawSignals` +
// `userLocationProfile`). Semantic elements are trips (`activityType` +
// start/endLocation + timelinePath / waypointPath, or the flat `activity`
// wrapper with `start`/`end` latLng strings) and place-visits (`location` +
// `duration`, or the flat `visit` wrapper carrying a
// `topCandidate.placeLocation`). `rawSignals` entries add a dense GPS /
// activity signal stream: `position` records become raw trajectory points,
// while the coordless `wifiScan` / `activityRecord` categories are recognized
// and skipped rather than misreported as malformed.
import {
  addRawPoint,
  asRecord,
  parseSemanticElement,
  stitchSegments,
  type ParseState,
} from './common'

/** Keys that mark an element as a flat semantic segment in the direct array. */
const SEGMENT_KEYS = [
  'activityType',
  'placeVisit',
  'visit',
  'activity',
  'location',
  'startLocation',
  'timelinePath',
] as const

/** Parse one `rawSignals` element. */
function parseRawSignal(entry: unknown, state: ParseState, ctx: string): void {
  const record = asRecord(entry)
  if (!record) return
  const position = asRecord(record['position'])
  if (position) {
    addRawPoint(position, state, ctx)
    return
  }
  // Known signal types without a coordinate fix (verified in both real 2025 /
  // 2026 exports): the parser must consume them silently, never surfacing
  // thousands of "缺少坐标字段" warnings for legitimate entries.
  if (record['wifiScan'] !== undefined || record['activityRecord'] !== undefined) return
  // Legacy / sample spellings put the point fields directly on the element.
  addRawPoint(record, state, ctx)
}

/** Parse the `rawSignals` array (state.points is the global raw stream). */
function parseRawSignals(rawSignals: unknown, state: ParseState, ctx: string): void {
  if (!Array.isArray(rawSignals)) return
  for (let i = 0; i < rawSignals.length; i++) {
    parseRawSignal(rawSignals[i], state, `${ctx}[${i}]`)
  }
}

/** Parse one array element that may bundle semanticSegments + rawSignals. */
function parseDayOrSegment(record: Record<string, unknown>, ctx: string, state: ParseState): void {
  const semanticSegments = record['semanticSegments']
  if (Array.isArray(semanticSegments)) {
    semanticSegments.forEach((segment, segIndex) =>
      parseSemanticElement(segment, state, `${ctx}.semanticSegments[${segIndex}]`),
    )
  } else if (SEGMENT_KEYS.some((key) => record[key] !== undefined)) {
    // Some exports place segments directly on the top-level element.
    parseSemanticElement(record, state, ctx)
  } else if (!Array.isArray(record['rawSignals'])) {
    return
  }
  const rawSignals = record['rawSignals']
  if (Array.isArray(rawSignals)) {
    parseRawSignals(rawSignals, state, `${ctx}.rawSignals`)
  }
}

export function parseFormat1(root: unknown, state: ParseState, ctx: string): void {
  if (Array.isArray(root)) {
    root.forEach((element, index) => {
      const record = asRecord(element)
      if (!record) return
      parseDayOrSegment(record, `${ctx} 条目[${index}]`, state)
    })
  } else {
    const record = asRecord(root)
    if (!record) {
      state.warnings.push(`${ctx}: 顶层应为数组或对象`)
      return
    }
    const semanticSegments = record['semanticSegments']
    if (Array.isArray(semanticSegments)) {
      semanticSegments.forEach((segment, segIndex) =>
        parseSemanticElement(segment, state, `${ctx}.semanticSegments[${segIndex}]`),
      )
    } else if (SEGMENT_KEYS.some((key) => record[key] !== undefined)) {
      parseSemanticElement(record, state, ctx)
    } else {
      state.warnings.push(`${ctx}: 顶层对象缺少 semanticSegments 数组`)
      return
    }
    const rawSignals = record['rawSignals']
    if (Array.isArray(rawSignals)) {
      parseRawSignals(rawSignals, state, `${ctx}.rawSignals`)
    }
  }
  // Stitch coarse timelinePath traces into path-less activity records. A final
  // pass is used so an activity that precedes its covering trace in the export
  // still gets a polyline.
  stitchSegments(state)
}