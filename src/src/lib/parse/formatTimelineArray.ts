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
//
// `extractFormat1Slices` is the shared raw-slice traversal used by BOTH the
// parser (this file) and the merge module (T36 / PRD 功能 14) so the two never
// drift: given a format-1 root, it returns the verbatim `semanticSegments` /
// `rawSignals` / `userLocationProfile` slices in document order.
import {
  addRawPoint,
  asRecord,
  parseSemanticElement,
  stitchSegments,
  type ParseState,
} from './common'

/** Keys that mark an element as a flat semantic segment in the direct array. */
export const SEGMENT_KEYS = [
  'activityType',
  'placeVisit',
  'visit',
  'activity',
  'location',
  'startLocation',
  'timelinePath',
] as const

/** A raw semantic record plus its parser-compatible warning context path. */
export interface Format1SemanticSlice {
  item: unknown
  path: string
}

/** A raw signal entry plus its parser-compatible warning context path. */
export interface Format1RawSlice {
  item: unknown
  path: string
}

/** Verbatim slices collected from a format-1 root (array or top-level object). */
export interface Format1Slices {
  semanticSegments: Format1SemanticSlice[]
  rawSignals: Format1RawSlice[]
  /** The top-level object root was not a record (`null` root). */
  invalidTopObject: boolean
  /** The top-level object carried no recognizable semanticSegments/segments. */
  missingSegments: boolean
  /**
   * `userLocationProfile` of a top-level object export (present only for the
   * object shape; undefined for the direct-array shape and when absent).
   */
  userLocationProfile: unknown
}

/**
 * Traverse a format-1 root and collect the raw `semanticSegments` /
 * `rawSignals` slices. The traversal mirrors the parser's `parseFormat1`
 * branch logic exactly (including the object-shape early-return flags
 * `invalidTopObject` / `missingSegments`), so consumers that only need the
 * verbatim slices — the merge module — stay perfectly in sync with parsing
 * behavior. Item paths carry the same context strings the parser reports.
 */
export function extractFormat1Slices(root: unknown, ctx: string): Format1Slices {
  const semanticSegments: Format1SemanticSlice[] = []
  const rawSignals: Format1RawSlice[] = []
  let invalidTopObject = false
  let missingSegments = false
  let userLocationProfile: unknown

  if (Array.isArray(root)) {
    root.forEach((element, index) => {
      const record = asRecord(element)
      if (!record) return
      const prefix = `${ctx} 条目[${index}]`
      const segmentArray = record['semanticSegments']
      if (Array.isArray(segmentArray)) {
        segmentArray.forEach((segment, segIndex) =>
          semanticSegments.push({ item: segment, path: `${prefix}.semanticSegments[${segIndex}]` }),
        )
      } else if (SEGMENT_KEYS.some((key) => record[key] !== undefined)) {
        // Some exports place segments directly on the top-level element.
        semanticSegments.push({ item: element, path: prefix })
      } else if (!Array.isArray(record['rawSignals'])) {
        return
      }
      const signals = record['rawSignals']
      if (Array.isArray(signals)) {
        signals.forEach((item) => rawSignals.push({ item, path: `${prefix}.rawSignals` }))
      }
    })
  } else {
    const record = asRecord(root)
    if (!record) {
      invalidTopObject = true
      return { semanticSegments, rawSignals, invalidTopObject, missingSegments, userLocationProfile }
    }
    userLocationProfile = record['userLocationProfile']
    const segmentArray = record['semanticSegments']
    if (Array.isArray(segmentArray)) {
      segmentArray.forEach((segment, segIndex) =>
        semanticSegments.push({ item: segment, path: `${ctx}.semanticSegments[${segIndex}]` }),
      )
    } else if (SEGMENT_KEYS.some((key) => record[key] !== undefined)) {
      semanticSegments.push({ item: root, path: ctx })
    } else {
      // Parity with the parser: a segment-less top-level object is rejected
      // BEFORE its rawSignals are consumed.
      missingSegments = true
      return { semanticSegments, rawSignals, invalidTopObject, missingSegments, userLocationProfile }
    }
    const signals = record['rawSignals']
    if (Array.isArray(signals)) {
      signals.forEach((item) => rawSignals.push({ item, path: `${ctx}.rawSignals` }))
    }
  }
  return { semanticSegments, rawSignals, invalidTopObject, missingSegments, userLocationProfile }
}

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

export function parseFormat1(root: unknown, state: ParseState, ctx: string): void {
  const slices = extractFormat1Slices(root, ctx)
  for (const slice of slices.semanticSegments) {
    parseSemanticElement(slice.item, state, slice.path)
  }
  if (slices.invalidTopObject) {
    state.warnings.push(`${ctx}: 顶层应为数组或对象`)
    return
  }
  if (slices.missingSegments) {
    state.warnings.push(`${ctx}: 顶层对象缺少 semanticSegments 数组`)
    return
  }
  for (const slice of slices.rawSignals) {
    parseRawSignal(slice.item, state, slice.path)
  }
  // Stitch coarse timelinePath traces into path-less activity records. A final
  // pass is used so an activity that precedes its covering trace in the export
  // still gets a polyline.
  stitchSegments(state)
}