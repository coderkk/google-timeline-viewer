// Shared defensive helpers used by all four format parsers. Every record read
// from user-provided JSON is validated field-by-field; malformed entries are
// skipped with a warning instead of throwing.
import type { Point, RawPoint, Segment, TimelineData, TimelineMeta, Visit } from '../types'
import { e7ToLat, e7ToLng, toMs } from '../types'

export interface ParseState {
  points: RawPoint[]
  visits: Visit[]
  segments: Segment[]
  warnings: string[]
}

export function createState(warnings: string[]): ParseState {
  return { points: [], visits: [], segments: [], warnings }
}

export function emptyTimelineData(): TimelineData {
  return { points: [], visits: [], segments: [], meta: computeMeta([], [], [], 0) }
}

export function computeMeta(
  points: RawPoint[],
  visits: Visit[],
  segments: Segment[],
  fileCount: number,
): TimelineMeta {
  let minMs = Infinity
  let maxMs = -Infinity
  const consider = (ms: number): void => {
    if (Number.isFinite(ms)) {
      if (ms < minMs) minMs = ms
      if (ms > maxMs) maxMs = ms
    }
  }
  for (const p of points) consider(p.timestampMs)
  for (const v of visits) {
    consider(v.startMs)
    consider(v.endMs)
  }
  for (const s of segments) {
    consider(s.startMs)
    consider(s.endMs)
  }
  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs)) {
    minMs = 0
    maxMs = 0
  }
  return {
    fileCount,
    pointCount: points.length,
    visitCount: visits.length,
    segmentCount: segments.length,
    timeRange: { minMs, maxMs },
  }
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** First finite number found among the given keys (strings are coerced). */
export function numField(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key]
    if (isFiniteNumber(value)) return value
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed !== '') {
        const n = Number(trimmed)
        if (Number.isFinite(n)) return n
      }
    }
  }
  return undefined
}

/** First parseable epoch-ms value found among the given keys. */
export function timeField(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' || isFiniteNumber(value)) {
      const ms = toMs(value as string | number)
      if (Number.isFinite(ms) && ms >= 0) return ms
    }
  }
  return undefined
}

function stringField(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return undefined
}

/**
 * Extract a coordinate pair from a location record, preferring E7 fields and
 * falling back to decimal-degree fields (both spellings are seen in the wild).
 */
export function getLatLng(location: unknown): Point | null {
  const record = asRecord(location)
  if (!record) return null
  const latE7 = numField(record, ['latitudeE7', 'latE7'])
  const lngE7 = numField(record, ['longitudeE7', 'lngE7'])
  if (latE7 !== undefined && lngE7 !== undefined) {
    return { lat: e7ToLat(latE7), lng: e7ToLng(lngE7) }
  }
  const lat = numField(record, ['latitude', 'lat'])
  const lng = numField(record, ['longitude', 'lng'])
  if (lat !== undefined && lng !== undefined) return { lat, lng }
  return null
}

export interface Duration {
  startMs: number
  endMs: number
}

/** Extract a start/end time pair from a duration record or a flat segment. */
export function getDuration(record: Record<string, unknown> | null): Duration | null {
  if (!record) return null
  const startMs = timeField(record, ['startTimestampMs', 'startTimestamp', 'startTime'])
  const endMs = timeField(record, ['endTimestampMs', 'endTimestamp', 'endTime'])
  if (startMs === undefined || endMs === undefined) return null
  return { startMs, endMs }
}

/** Convert a single path element (waypoint or timeline-path row) to a point. */
function pointFromPathElement(element: unknown): Point | null {
  const record = asRecord(element)
  if (record) {
    const pointLabel = record['point']
    if (typeof pointLabel === 'string') {
      const parts = pointLabel.split(',')
      if (parts.length >= 2) {
        const lat = Number(parts[0])
        const lng = Number(parts[1])
        if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }
      }
    }
  }
  return getLatLng(element)
}

/** Extract points from a path field: an array, or { waypoints | points: [] }. */
export function pathToPoints(value: unknown, maxPoints = 1_000_000): Point[] {
  let items: unknown[]
  if (Array.isArray(value)) {
    items = value
  } else {
    const record = asRecord(value)
    if (!record) return []
    const nested = Array.isArray(record['waypoints']) ? record['waypoints'] : record['points']
    if (!Array.isArray(nested)) return []
    items = nested
  }
  const points: Point[] = []
  for (let i = 0; i < items.length && points.length < maxPoints; i++) {
    const point = pointFromPathElement(items[i])
    if (point) points.push(point)
  }
  return points
}

/** First non-empty path among the candidate keys (ordered by preference). */
export function firstPath(segment: Record<string, unknown>, keys: string[]): Point[] {
  for (const key of keys) {
    const value = segment[key]
    if (value !== undefined) {
      const points = pathToPoints(value)
      if (points.length > 0) return points
    }
  }
  return []
}

/** Append a raw trajectory point, skipping records with missing fields. */
export function addRawPoint(
  record: Record<string, unknown>,
  state: ParseState,
  ctx: string,
): void {
  const coordinate = getLatLng(record)
  if (!coordinate) {
    state.warnings.push(`${ctx}: 缺少坐标字段`)
    return
  }
  const timestampMs = timeField(record, ['timestampMs', 'timestamp', 'time'])
  if (timestampMs === undefined) {
    state.warnings.push(`${ctx}: 缺少时间戳`)
    return
  }
  const accuracyMeters = numField(record, ['accuracyMeters', 'accuracy'])
  state.points.push({
    lat: coordinate.lat,
    lng: coordinate.lng,
    timestampMs,
    ...(accuracyMeters === undefined ? {} : { accuracyMeters }),
  })
}

/** Append a place-visit, skipping records missing coordinates or a time span. */
export function addVisit(visitObject: unknown, state: ParseState, ctx: string): void {
  const record = asRecord(visitObject)
  if (!record) {
    state.warnings.push(`${ctx}: placeVisit 结构无效`)
    return
  }
  const location = asRecord(record['location'])
  const coordinate = location ? getLatLng(location) : null
  const duration = getDuration(asRecord(record['duration'])) ?? getDuration(record)
  if (!coordinate || !duration) {
    state.warnings.push(`${ctx}: placeVisit 缺少坐标或时间范围`)
    return
  }
  const visit: Visit = {
    lat: coordinate.lat,
    lng: coordinate.lng,
    startMs: duration.startMs,
    endMs: duration.endMs,
  }
  if (location) {
    const name = stringField(location, ['name'])
    const address = stringField(location, ['address'])
    const placeId = stringField(location, ['placeId', 'place'])
    if (name) visit.name = name
    if (address) visit.address = address
    if (placeId) visit.placeId = placeId
  }
  state.visits.push(visit)
}

/** Append a travel segment, falling back to path endpoints when missing. */
export function addSegment(segmentObject: unknown, state: ParseState, ctx: string): void {
  const record = asRecord(segmentObject)
  if (!record) {
    state.warnings.push(`${ctx}: 行程段结构无效`)
    return
  }
  const start = getLatLng(record['startLocation']) ?? getLatLng(record['start'])
  const end = getLatLng(record['endLocation']) ?? getLatLng(record['end'])
  const path = firstPath(record, ['timelinePath', 'waypointPath', 'simplifiedRawPath', 'transitPath'])
  const effectiveStart = start ?? path[0]
  const effectiveEnd = end ?? path[path.length - 1]
  if (!effectiveStart || !effectiveEnd) {
    state.warnings.push(`${ctx}: 行程段缺少起终点坐标`)
    return
  }
  const duration = getDuration(asRecord(record['duration'])) ?? getDuration(record)
  if (!duration) {
    state.warnings.push(`${ctx}: 行程段缺少时间范围`)
    return
  }
  const segment: Segment = {
    start: effectiveStart,
    end: effectiveEnd,
    startMs: duration.startMs,
    endMs: duration.endMs,
    path,
  }
  const activityType = stringField(record, ['activityType'])
  if (activityType) segment.activityType = activityType
  state.segments.push(segment)
}

/**
 * Classify one semantic element into a visit or a segment. Handles both the
 * wrapped forms (`{ placeVisit }` / `{ activitySegment }`) used by Takeout and
 * the flat forms used by the new direct-array device export.
 */
export function parseSemanticElement(element: unknown, state: ParseState, ctx: string): void {
  const record = asRecord(element)
  if (!record) {
    state.warnings.push(`${ctx}: 语义段结构无效`)
    return
  }
  const placeVisit = asRecord(record['placeVisit'])
  if (placeVisit) {
    addVisit(placeVisit, state, ctx)
    return
  }
  const activitySegment = asRecord(record['activitySegment'])
  if (activitySegment) {
    addSegment(activitySegment, state, ctx)
    return
  }
  const hasLocation =
    asRecord(record['location']) !== null &&
    asRecord(record['duration']) !== null &&
    timeField(record, ['startTime', 'startTimestampMs']) !== undefined
  if (hasLocation) {
    addVisit(record, state, ctx)
    return
  }
  const travelish = ['activityType', 'startLocation', 'timelinePath', 'waypointPath', 'simplifiedRawPath'].some(
    (key) => record[key] !== undefined,
  )
  if (travelish) {
    addSegment(record, state, ctx)
    return
  }
  state.warnings.push(`${ctx}: 无法识别的语义段`)
}