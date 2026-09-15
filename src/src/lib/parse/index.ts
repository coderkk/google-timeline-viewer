// Entry point for parsing Google Timeline exports into the unified
// TimelineData model, with automatic format detection and multi-file merge.
import type { TimelineData } from '../types'
import { asRecord, computeMeta, createState, emptyTimelineData, MAX_RAW_POINTS } from './common'
import { parseFormat1 } from './formatTimelineArray'
import { parseFormat2 } from './formatRecords'
import { parseFormat3 } from './formatSemanticHistory'
import { parseFormat4 } from './formatLocationHistory'

export { emptyTimelineData }
export type { ParseState } from './common'
export type {
  Point,
  RawPoint,
  Segment,
  TimeRange,
  TimelineData,
  TimelineMeta,
  Visit,
} from '../types'
export { e7ToLat, e7ToLng, haversineKm, toMs } from '../types'

export class ParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ParseError'
  }
}

export interface ParseResult {
  data: TimelineData
  warnings: string[]
}

/**
 * Parse one export file. Recognizes the four supported structures by shape:
 * top-level array -> Timeline.json (format 1); timelineObjects -> Semantic
 * Location History (format 3); locations + activitySegments/savedPlaces ->
 * Records.json (format 2); locations only -> Location History.json (format 4).
 */
export function parseTimelineFile(name: string, text: string): ParseResult {
  let root: unknown
  try {
    root = JSON.parse(text)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new ParseError(`"${name}" 不是有效的 JSON（${reason}）`)
  }
  const warnings: string[] = []
  const state = createState(warnings)
  const ctx = (file: string): string => `"${file}"`

  if (Array.isArray(root)) {
    parseFormat1(root, state, ctx(name))
  } else {
    const record = asRecord(root)
    if (!record) {
      warnings.push(`${ctx(name)}: 数据为空或不可识别`)
    } else if (Array.isArray(record['timelineObjects'])) {
      parseFormat3(root, state, ctx(name))
    } else if (Array.isArray(record['semanticSegments'])) {
      // Format 1 also ships as a plain object whose semanticSegments array is
      // the top-level element list ({ semanticSegments, rawSignals, ... }).
      // The WHOLE record is handed over so `rawSignals` is not dropped.
      parseFormat1(record, state, ctx(name))
    } else if (Array.isArray(record['locations'])) {
      if (Array.isArray(record['activitySegments']) || Array.isArray(record['savedPlaces'])) {
        parseFormat2(root, state, ctx(name))
      } else {
        parseFormat4(root, state, ctx(name))
      }
    } else if (Array.isArray(record['activitySegments'])) {
      parseFormat2(root, state, ctx(name))
    } else {
      warnings.push(`${ctx(name)}: 无法识别的导出格式`)
    }
  }

  const data: TimelineData = {
    points: state.points,
    visits: state.visits,
    segments: state.segments,
    meta: computeMeta(state.points, state.visits, state.segments, 1),
  }
  return { data, warnings }
}

/** Merge several parsed files into one dataset and recompute aggregate meta. */
export function mergeTimelineData(list: TimelineData[], warnings: string[] = []): TimelineData {
  const visits = list.flatMap((data) => data.visits)
  const segments = list.flatMap((data) => data.segments)
  let points = list.flatMap((data) => data.points)
  if (points.length > MAX_RAW_POINTS) {
    points = points.slice(0, MAX_RAW_POINTS)
    warnings.push(`累计 raw points 超过 ${MAX_RAW_POINTS / 10_000} 万，已截断`)
  }
  return {
    points,
    visits,
    segments,
    meta: computeMeta(points, visits, segments, list.length),
  }
}