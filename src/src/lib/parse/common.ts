// Shared defensive helpers used by all four format parsers. Every record read
// from user-provided JSON is validated field-by-field; malformed entries are
// skipped with a warning instead of throwing.
import type { Point, RawPoint, Segment, TimelineData, TimelineMeta, Visit } from '../types'
import { e7ToLat, e7ToLng, toMs } from '../types'

/** Upper bound on accumulated raw trajectory points (per file and merged). */
export const MAX_RAW_POINTS = 2_000_000

/**
 * A coarse GPS trace: a flat `timelinePath` segment (2-hour buckets in the
 * 2026+ device export) that carries polyline points but no activity label.
 * The device export keeps the real trajectory here, while the matching
 * `activity` record only has start/end coordinates.
 */
export interface TimelinePathCandidate {
  startMs: number
  endMs: number
  points: Point[]
}

export interface ParseState {
  points: RawPoint[]
  visits: Visit[]
  segments: Segment[]
  warnings: string[]
  /** Set once a truncation warning for the raw-point cap has been emitted. */
  rawTruncated: boolean
  /**
   * Coarse traces collected while parsing, in file order — NOT sorted by
   * startMs (the direct-array export interleaves activities and traces). The
   * pool is sorted once in `stitchSegments`, which then scans it for every
   * path-less activity segment.
   */
  timelinePathPool: TimelinePathCandidate[]
}

export function createState(warnings: string[]): ParseState {
  return { points: [], visits: [], segments: [], warnings, rawTruncated: false, timelinePathPool: [] }
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
 * Parse a "lat, lng" coordinate string. The newer device exports append a
 * degree symbol ("1.3521°, 103.8198°"), so coordinates are extracted with a
 * tolerant regex rather than a plain Number() cast.
 */
export function parseLatLngString(value: string): Point | null {
  if (typeof value !== 'string') return null
  const parts = value.match(/[+-]?\d+(?:\.\d+)?/g)
  if (!parts || parts.length < 2) return null
  const lat = Number(parts[0])
  const lng = Number(parts[1])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

/**
 * Extract a coordinate pair from a location record: E7 fields first (including
 * the placeVisit-level `centerLatE7`/`centerLngE7` fallback), then
 * decimal-degree fields, then a combined "lat, lng" string (both spellings are
 * seen in the wild).
 */
export function getLatLng(location: unknown): Point | null {
  const record = asRecord(location)
  if (!record) return null
  const latE7 = numField(record, ['latitudeE7', 'latE7'])
  const lngE7 = numField(record, ['longitudeE7', 'lngE7'])
  if (latE7 !== undefined && lngE7 !== undefined) {
    return { lat: e7ToLat(latE7), lng: e7ToLng(lngE7) }
  }
  // Older Semantic Location History placeVisits carry the coordinate directly
  // on the record as centerLatE7/centerLngE7 instead of a `location` object.
  const centerLatE7 = numField(record, ['centerLatE7'])
  const centerLngE7 = numField(record, ['centerLngE7'])
  if (centerLatE7 !== undefined && centerLngE7 !== undefined) {
    return { lat: e7ToLat(centerLatE7), lng: e7ToLng(centerLngE7) }
  }
  const lat = numField(record, ['latitude', 'lat'])
  const lng = numField(record, ['longitude', 'lng'])
  if (lat !== undefined && lng !== undefined) return { lat, lng }
  // rawSignals `position` entries spell the combined coordinate with a capital
  // L (`LatLng`) in both real 2025/2026 device exports.
  const latLng = stringField(record, ['latLng', 'LatLng', 'coordinates'])
  if (latLng !== undefined) {
    const point = parseLatLngString(latLng)
    if (point) return point
  }
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
      const point = parseLatLngString(pointLabel)
      if (point) return point
    }
  }
  return getLatLng(element)
}

/**
 * Extract points from a path field: an array, or
 * { waypoints | points | transitStops | path: [] }. transitPath objects expose
 * the stop list under `transitStops` (each element is a plain location record
 * with latitudeE7/longitudeE7), so it is treated as a point source too.
 */
export function pathToPoints(value: unknown, maxPoints = 1_000_000): Point[] {
  let items: unknown[]
  if (Array.isArray(value)) {
    items = value
  } else {
    const record = asRecord(value)
    if (!record) return []
    const nested = Array.isArray(record['waypoints'])
      ? record['waypoints']
      : Array.isArray(record['points'])
        ? record['points']
        : Array.isArray(record['transitStops'])
          ? record['transitStops']
          : record['path']
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

// -- Timeline-path stitching -------------------------------------------------

/** Max degrees of latitude/longitude drift allowed between an activity
 * endpoint and the matched trace endpoint. ~0.02° ≈ 2 km. */
const MAX_STITCH_DEG = 0.02

function isNear(a: Point, b: Point): boolean {
  return Math.abs(a.lat - b.lat) <= MAX_STITCH_DEG && Math.abs(a.lng - b.lng) <= MAX_STITCH_DEG
}

/** Overlap duration in ms; 0 when the windows do not intersect. */
function overlapMs(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart))
}

/**
 * maxEndUpTo[i] = max(endMs over pool[0..i]). Requires `pool` sorted by
 * startMs. Because endMs is not monotone over a startMs-sorted pool, this
 * running maximum is what lets the left scan in `findStitchCandidate` step
 * over short-window traces instead of stopping early.
 */
export function buildMaxEndUpTo(pool: readonly TimelinePathCandidate[]): number[] {
  const prefix: number[] = new Array(pool.length)
  let maxEnd = -Infinity
  for (let i = 0; i < pool.length; i++) {
    const endMs = pool[i].endMs
    if (endMs > maxEnd) maxEnd = endMs
    prefix[i] = maxEnd
  }
  return prefix
}

/**
 * Index of the trace point nearest to `point` within the stitch tolerance, or
 * -1 when no point is that close. A linear scan is fine here: traces average
 * ~10 points (max 106) and only path-less segments run this.
 */
function nearestTraceIndex(point: Point, points: readonly Point[]): number {
  let best = -1
  let bestDistSq = Infinity
  for (let i = 0; i < points.length; i++) {
    const candidate = points[i]
    if (!isNear(point, candidate)) continue
    const dLat = point.lat - candidate.lat
    const dLng = point.lng - candidate.lng
    const dSq = dLat * dLat + dLng * dLng
    if (dSq < bestDistSq) {
      bestDistSq = dSq
      best = i
    }
  }
  return best
}

/**
 * Pick the coarse trace that best describes a short candidate segment: its
 * window must genuinely overlap the segment, and the trace must contain a
 * point near each activity endpoint (the segment is usually one leg *inside*
 * the 2-hour window, not the whole window). The sub-trace between the two
 * matched points is returned so the stitched path is exactly the activity's
 * leg, not the full window. A trace stored end→start is accepted via the
 * original reverse pairing (start ≈ last point, end ≈ first point). The pool
 * is sorted by startMs (with `maxEndUpTo` the monotone-max-end prefix built by
 * `buildMaxEndUpTo`), so a binary search plus a bounded linear fan-out keeps
 * this O(log n + overlap width) instead of a full scan (device exports can
 * hold ~30k traces).
 */
export function findStitchCandidate(
  segment: Pick<Segment, 'start' | 'end' | 'startMs' | 'endMs'>,
  pool: TimelinePathCandidate[],
  maxEndUpTo: readonly number[],
): TimelinePathCandidate | null {
  if (pool.length === 0) return null
  let lo = 0
  let hi = pool.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (pool[mid].startMs < segment.startMs) lo = mid + 1
    else hi = mid
  }
  let best: TimelinePathCandidate | null = null
  let bestOverlap = 0
  const consider = (candidate: TimelinePathCandidate): void => {
    const overlap = overlapMs(segment.startMs, segment.endMs, candidate.startMs, candidate.endMs)
    if (overlap <= 0) return
    const points = candidate.points
    const startIdx = nearestTraceIndex(segment.start, points)
    if (startIdx < 0) return
    const endIdx = nearestTraceIndex(segment.end, points)
    if (endIdx < 0) return
    // Both endpoints collapsed onto a single trace point: no real route to
    // hand back (degenerate match).
    if (startIdx === endIdx) return
    if (startIdx > endIdx) {
      // The activity runs opposite to the trace's stored point order. Only the
      // original reverse pairing (start ≈ last, end ≈ first) is accepted, so
      // reverse-stored traces stay supported without inventing backwards
      // sub-trips somewhere in the middle of a wandering window.
      const first = points[0]
      const last = points[points.length - 1]
      if (!isNear(segment.start, last) || !isNear(segment.end, first)) return
      const sub = points.slice(endIdx, startIdx + 1).reverse()
      if (overlap > bestOverlap) {
        bestOverlap = overlap
        best = { ...candidate, points: sub }
      }
      return
    }
    // Forward: sub-trace from the matched start point through the matched end
    // point, in trace (travel) order. New object so the trace pool is never
    // mutated.
    const sub = points.slice(startIdx, endIdx + 1)
    if (overlap > bestOverlap) {
      bestOverlap = overlap
      best = { ...candidate, points: sub }
    }
  }
  // Traces starting before the segment can still reach into it. endMs is not
  // monotone over a startMs-sorted pool, so scan left while the maximum endMs
  // of the covered prefix (maxEndUpTo) reaches the segment's start rather than
  // stopping at the first short window; the prefix is monotone, so this exit
  // is safe.
  for (let i = lo - 1; i >= 0 && maxEndUpTo[i] >= segment.startMs; i--) consider(pool[i])
  // Traces starting at/after the segment only match while they begin before it
  // ends (exact scan boundary given a startMs-sorted pool).
  for (let i = lo; i < pool.length && pool[i].startMs <= segment.endMs; i++) consider(pool[i])
  return best
}

/**
 * Backfill polyline geometry for segments produced by short `activity`
 * records (start/end coordinates but no path) using the covering coarse
 * `timelinePath` trace. Runs as a final pass so a trace that appears *after*
 * its activity in the export can still be matched; only touches segments that
 * still have no path. The chosen trace's activity type is left untouched — the
 * activity's own label (IN_BUS, WALKING, ...) stays authoritative.
 */
export function stitchSegments(state: ParseState): void {
  if (state.timelinePathPool.length === 0) return
  const pool = state.timelinePathPool
  pool.sort((a, b) => a.startMs - b.startMs)
  const maxEndUpTo = buildMaxEndUpTo(pool)
  for (const segment of state.segments) {
    if (segment.path.length >= 2) continue
    const candidate = findStitchCandidate(segment, pool, maxEndUpTo)
    // Copy the points array so the stitched segment never aliases the trace's
    // own path (downstream consumers may reorganize path points).
    if (candidate) segment.path = candidate.points.slice()
  }
}

/**
 * Append a raw trajectory point, skipping records with missing fields. The
 * 2026+ format-1 exports wrap each GPS fix in a nested `position` object
 * (whose `LatLng` capitalizes the coordinate string and whose `timestamp`
 * lives inside the wrapper), so coordinates/time/accuracy are resolved from
 * the wrapper first and fall back to the record itself for the legacy flat
 * spellings (Records / Location History / sample data).
 */
export function addRawPoint(
  record: Record<string, unknown>,
  state: ParseState,
  ctx: string,
): void {
  const position = asRecord(record['position'])
  const coordSource = position ?? record
  const timeSource = position ?? record
  if (state.points.length >= MAX_RAW_POINTS) {
    if (!state.rawTruncated) {
      state.rawTruncated = true
      state.warnings.push(`${ctx}: raw points 超过 ${MAX_RAW_POINTS / 1_000_000} 万，已截断`)
    }
    return
  }
  const coordinate = getLatLng(coordSource)
  if (!coordinate) {
    state.warnings.push(`${ctx}: 缺少坐标字段`)
    return
  }
  const timestampMs = timeField(timeSource, ['timestampMs', 'timestamp', 'time'])
  if (timestampMs === undefined) {
    state.warnings.push(`${ctx}: 缺少时间戳`)
    return
  }
  const accuracyMeters = numField(coordSource, ['accuracyMeters', 'accuracy'])
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
  // Location may sit on the record itself, on a flat visit wrapper's
  // topCandidate, or in the older `location` field. Older records may instead
  // carry centerLatE7/centerLngE7 directly on the placeVisit, so the record
  // itself is the final fallback.
  const visitWrapper = asRecord(record['visit'])
  const location =
    asRecord(record['location']) ??
    asRecord(asRecord(record['topCandidate'])?.['placeLocation']) ??
    asRecord(asRecord(visitWrapper?.['topCandidate'])?.['placeLocation'])
  const coordinate = (location ? getLatLng(location) : null) ?? getLatLng(record)
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
  // Name, address and placeId usually live next to the coordinates inside the
  // location; for flat visit wrappers they sit on topCandidate itself.
  const topCandidate = visitWrapper?.['topCandidate']
  const meta = asRecord(topCandidate)
  if (location) {
    const name = stringField(location, ['name']) ?? stringField(meta ?? {}, ['name'])
    const address = stringField(location, ['address']) ?? stringField(meta ?? {}, ['address'])
    const placeId =
      stringField(location, ['placeId', 'place']) ?? stringField(meta ?? {}, ['placeId', 'place'])
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
  // Flat `activity` wrappers carry start/end inside the wrapper rather than
  // on the record itself.
  const activityRec = asRecord(record['activity'])
  const start =
    getLatLng(record['startLocation']) ??
    getLatLng(activityRec?.['start']) ??
    getLatLng(record['start'])
  const end =
    getLatLng(record['endLocation']) ??
    getLatLng(activityRec?.['end']) ??
    getLatLng(record['end'])
  const PATH_KEYS = ['timelinePath', 'waypointPath', 'path', 'simplifiedRawPath', 'transitPath']
  let path = firstPath(record, PATH_KEYS)
  if (path.length === 0) path = firstPath(activityRec ?? {}, PATH_KEYS)
  const isTimelinePathTrace =
    record['timelinePath'] !== undefined ||
    (activityRec !== null && activityRec['timelinePath'] !== undefined)
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
  // Newer device exports carry the activity label under activity.topCandidate.
  const activityType =
    stringField(record, ['activityType']) ??
    stringField(asRecord(asRecord(record['activity'])?.['topCandidate']) ?? {}, ['type'])
  if (activityType) segment.activityType = activityType
  state.segments.push(segment)
  if (isTimelinePathTrace && path.length >= 2) {
    // Keep the trace for the single final `stitchSegments` pass. File order is
    // not a startMs order (the direct-array export interleaves activities and
    // traces), and the pass sorts the pool once and re-evaluates every
    // path-less segment against all traces, so no immediate borrowing here.
    state.timelinePathPool.push({ startMs: duration.startMs, endMs: duration.endMs, points: path })
  }
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
  // timelineMemory trip memories carry no coordinates and are documented as
  // ignore-only — consumed silently instead of warning per record.
  if (record['timelineMemory'] !== undefined) return
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
  // Flat shapes used by the 2026+ device export: `visit` / `activity` wrappers
  // carrying times on the same record the coords inside the wrapper.
  const flatVisit = asRecord(record['visit'])
  if (flatVisit) {
    addVisit(record, state, ctx)
    return
  }
  const flatActivity = asRecord(record['activity'])
  if (flatActivity) {
    addSegment(record, state, ctx)
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