// Pure helpers for the Trips view: date-range filtering, polyline
// simplification, render caps (per-segment Douglas-Peucker + global point /
// marker budget), activity styling and stop<->segment linkage. Everything here
// stays framework-agnostic so it is easy to unit test.
import type { PathPoint, Point, RawPoint, Segment, TimelineData, Visit } from './types'

// -- Fallback thresholds (T31) -----------------------------------------------

/**
 * Minimum path length for a segment to be treated as carrying its own geometry.
 * When `path.length >= MIN_PATH_LEN` the path is used as-is; otherwise the
 * caller falls back to the semantic `[start, end]` pair.
 *
 * This is intentionally **not** `>= 2`: a segment clipped to a single in-range
 * vertex must still draw that vertex — falling back to the unclipped
 * `[start, end]` would reintroduce the previous day's geometry (T22/S2).
 */
export const MIN_PATH_LEN = 1

/** Does this segment carry at least one path vertex? */
export function hasPath(s: Segment): boolean {
  return s.path.length >= MIN_PATH_LEN
}

/**
 * Candidate renderable geometry for a segment: the path when one exists,
 * otherwise the semantic `[start, end]` fallback.
 *
 * Single-source-of-truth for the 6 call sites that previously each wrote
 * their own `path.length > 0 ? path : [start, end]` pattern.
 */
export function segmentPathOrEndpoints(s: Segment): Point[] {
  return hasPath(s) ? s.path : [s.start, s.end]
}

/**
 * Minimum vertex count for a polyline / LineString to be drawable.
 * Below this threshold the geometry is degenerate (a point, not a line).
 */
export const MIN_POLYLINE_LEN = 2

/**
 * Can these vertices form a drawable Polyline / LineString?
 *
 * The parameter is length-only on purpose: the render gates feed it either
 * `Point[]` (semantic paths, GeoJSON/KML export) or `LatLngExpression[]`
 * (TripMap's already-converted positions) — what matters is the vertex count,
 * not the vertex shape.
 */
export function hasRenderablePath(points: readonly unknown[]): boolean {
  return points.length >= MIN_POLYLINE_LEN
}

export interface DateRangeFilter {
  startMs: number | null
  endMs: number | null
}

export interface Bounds {
  minLat: number
  minLng: number
  maxLat: number
  maxLng: number
}

export interface PreparedTrips {
  /** Filtered segments, paths simplified and capped to the global budget. */
  segments: Segment[]
  /** All filtered visits, newest first (drives the sidebar list). */
  visits: Visit[]
  /** Visits actually drawn on the map (decimated when over the marker cap). */
  markers: Visit[]
  /** Filtered raw GPS fixes (from rawSignals), decimated to the draw cap. */
  points: RawPoint[]
  totalPathPoints: number
  /** True when a rendering cap kicked in and the map shows a subset. */
  downsampled: boolean
}

export interface TimelinePayload {
  /** All filtered rawSignals sorted by timestampMs (may be decimated). */
  points: RawPoint[]
  /**
   * Polyline vertices for the timeline route, in time order. Sourced from raw
   * fixes where they exist and from semantic segment paths elsewhere, because
   * rawSignals are only retained ~30 days (see `buildTimelineRoute`). Every
   * vertex is also drawn as a dot, so this is the "trail of points" the view
   * shows. `timestampMs` is only set on raw-derived vertices.
   */
  route: TimelineVertex[]
  /** Where the route geometry came from, for an honest summary label. */
  routeSource: 'raw' | 'segments' | 'mixed'
  /** All filtered visits, newest first. */
  visits: Visit[]
  /** Visits actually drawn on the map (decimated when over the marker cap). */
  markers: Visit[]
  /** True when a rendering cap kicked in and the map shows a subset. */
  downsampled: boolean
}

/**
 * A timeline-route vertex. `timestampMs` is present only when the vertex came
 * from a raw GPS fix; semantic-segment vertices carry no per-point time (the
 * export does not provide one), so the UI must not fabricate it.
 */
export interface TimelineVertex extends Point {
  timestampMs?: number
}

// --- Rendering budget -------------------------------------------------------

export const SEGMENT_POINT_SIMPLIFY_MAX = 1500
// T23: lowered from 30000 after the release performance pass. The decade-spanning
// "全部" view merged ~30k vertices; mounting that many React CircleMarker layers
// (even on one canvas) stalled zoom for hundreds of ms. 12000 keeps the low-zoom
// route readable while roughly halving the worst-case repaint/mount cost. Narrow
// ranges are unaffected (their route is below the cap anyway).
export const GLOBAL_PATH_POINT_CAP = 12000
export const MAX_SEGMENTS = 12000
export const MARKER_CAP = 4000
export const ROUTE_POINT_CAP = 5000
/** Render budget for raw `rawSignals` GPS fixes (dense trail dots). */
export const RAW_POINT_CAP = 12000
export const LIST_LIMIT = 500

// -- Date helpers ------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Anchor a timestamp to the start of its LOCAL calendar day (00:00 local wall
 * clock). The date filter (`parseInputDate`) already selects by local (+08)
 * day, so grouping must use the same frame: a 04:00 +08 GPS fix falls on the
 * PREVIOUS UTC day and would otherwise be binned "yesterday".
 */
export function startOfDayMs(ms: number): number {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export function endOfDayMs(ms: number): number {
  return startOfDayMs(ms) + DAY_MS - 1
}

/**
 * A fixed-width `days`-day range ending at the end of the LOCAL day containing
 * `maxMs`. Backs the date-range picker's "last 30 days / last year" quick
 * presets and the post-import default range (T30.3). Keeps the historical preset
 * formula exactly: `end = endOfDayMs(maxMs)`, `start = end - days * DAY_MS + 1`,
 * so the window spans exactly `days` calendar days (start and end are the first
 * and last milliseconds of their days). A non-finite `maxMs` (no usable data)
 * falls back to the open range — the same "no filter" state cleared data uses.
 */
export function lastNDaysRange(maxMs: number, days: number): DateRangeFilter {
  if (!Number.isFinite(maxMs)) return { startMs: null, endMs: null }
  const end = endOfDayMs(maxMs)
  return { startMs: end - days * DAY_MS + 1, endMs: end }
}

/**
 * Local-timezone day key like "2026-08-07". Matches the `YYYY-MM-DD` the date
 * inputs produce via `toInputDate` / `parseInputDate`, so grouping is aligned
 * with the filter that drives the same views.
 */
export function dayKeyOf(ms: number): string {
  return toInputDate(ms)
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** Local-timezone yyyy-mm-dd used by <input type="date"> values. */
export function toInputDate(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function parseInputDate(value: string): number | null {
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return null
  const date = new Date(y, m - 1, d)
  return Number.isNaN(date.getTime()) ? null : date.getTime()
}

/** "2026-07-20" -> short "07-20" / "9-11" style used in the summary line. */
export function fmtDay(ms: number): string {
  const d = new Date(ms)
  return `${d.getMonth() + 1}-${pad2(d.getDate())}`
}

/** Range summary like "2026-07-20 ~ 09-11" (open-ended sides shown as 不限). */
export function fmtRangeLabel(range: DateRangeFilter): string {
  const start = range.startMs === null ? '不限' : toInputDate(range.startMs)
  const end = range.endMs === null ? '不限' : fmtDay(range.endMs)
  return `${start} ~ ${end}`
}

/** Humanized duration: "9h 5m", "45m", "<1m". */
export function fmtDuration(ms: number): string {
  if (ms < 60000) return '<1m'
  const minutes = Math.round(ms / 60000)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export function fmtDateTime(ms: number): string {
  const d = new Date(ms)
  return `${toInputDate(ms)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

// -- Filtering ---------------------------------------------------------------

export function overlapsRange(startMs: number, endMs: number, range: DateRangeFilter): boolean {
  if (range.startMs !== null && endMs < range.startMs) return false
  if (range.endMs !== null && startMs > range.endMs) return false
  return true
}

export function filterSegments(segments: Segment[], range: DateRangeFilter): Segment[] {
  return segments.filter((s) => overlapsRange(s.startMs, s.endMs, range))
}

export function filterVisits(visits: Visit[], range: DateRangeFilter): Visit[] {
  return visits.filter((v) => overlapsRange(v.startMs, v.endMs, range))
}

/** Raw GPS fixes whose timestamp falls inside the date range. */
export function filterRawPoints(points: readonly RawPoint[], range: DateRangeFilter): RawPoint[] {
  return points.filter((p) => overlapsRange(p.timestampMs, p.timestampMs, range))
}

/** Bounding box across segments + visits; null when there is no geometry. */
export function boundsOf(segments: Segment[], visits: Visit[]): Bounds | null {
  let minLat = Infinity
  let minLng = Infinity
  let maxLat = -Infinity
  let maxLng = -Infinity
  const grow = (lat: number, lng: number): void => {
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
  }
  for (const s of segments) {
    // Prefer the rendered path when one exists: after range clipping it may be
    // shorter than (or entirely inside) the semantic start/end span, and growing
    // the bounds from the unclipped endpoints would re-introduce the previous
    // day (T22/S2). Path-less segments keep the start/end fallback.
    if (hasPath(s)) {
      for (const p of s.path) grow(p.lat, p.lng)
    } else {
      grow(s.start.lat, s.start.lng)
      grow(s.end.lat, s.end.lng)
    }
  }
  for (const v of visits) grow(v.lat, v.lng)
  if (!Number.isFinite(minLat)) return null
  return { minLat, minLng, maxLat, maxLng }
}

/** Extend an existing bounds object to also include the given points. */
export function boundsIncludeRawPoints(
  base: Bounds | null,
  points: readonly Point[],
): Bounds | null {
  let minLat = base?.minLat ?? Infinity
  let minLng = base?.minLng ?? Infinity
  let maxLat = base?.maxLat ?? -Infinity
  let maxLng = base?.maxLng ?? -Infinity
  const grow = (lat: number, lng: number): void => {
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
  }
  for (const p of points) grow(p.lat, p.lng)
  if (!Number.isFinite(minLat)) return null
  return { minLat, minLng, maxLat, maxLng }
}

// -- Simplification ----------------------------------------------------------

function perpDistSq(a: Point, b: Point, p: Point): number {
  const dLat = b.lat - a.lat
  const dLng = b.lng - a.lng
  const lenSq = dLat * dLat + dLng * dLng
  if (lenSq === 0) return (p.lat - a.lat) ** 2 + (p.lng - a.lng) ** 2
  const t = ((p.lat - a.lat) * dLat + (p.lng - a.lng) * dLng) / lenSq
  const projLat = a.lat + t * dLat
  const projLng = a.lng + t * dLng
  return (p.lat - projLat) ** 2 + (p.lng - projLng) ** 2
}

/**
 * Douglas-Peucker with an explicit stack (no recursion depth risk). Tolerance
 * is in squared degrees; 1e-8 (~1e-4 deg ≈ 11 m) keeps urban detail.
 */
function douglasPeucker(points: Point[], toleranceSq: number): Point[] {
  const n = points.length
  if (n <= 2) return points
  const keep = new Uint8Array(n)
  keep[0] = 1
  keep[n - 1] = 1
  const stack: Array<[number, number]> = [[0, n - 1]]
  while (stack.length > 0) {
    const [first, last] = stack.pop() as [number, number]
    if (last - first <= 1) continue
    const a = points[first]
    const b = points[last]
    let maxDistSq = -1
    let index = -1
    for (let i = first + 1; i < last; i++) {
      const d = perpDistSq(a, b, points[i])
      if (d > maxDistSq) {
        maxDistSq = d
        index = i
      }
    }
    if (maxDistSq > toleranceSq && index > 0) {
      keep[index] = 1
      stack.push([first, index])
      stack.push([index, last])
    }
  }
  const out: Point[] = []
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[i])
  return out
}

/** Uniform stride sampling down to `max` items, always keeping both ends. */
function strideTake<T>(items: T[], max: number): T[] {
  const n = items.length
  if (n <= max) return items
  const out: T[] = new Array(max)
  for (let i = 0; i < max; i++) {
    out[i] = items[i === max - 1 ? n - 1 : Math.round((i * (n - 1)) / (max - 1))]
  }
  return out
}

/**
 * Per-segment DP simplification; guarantees <= maxPoints after the fallback.
 */
export function simplifyPath(points: Point[], maxPoints: number): Point[] {
  if (points.length <= maxPoints) return points
  const simplified = douglasPeucker(points, 1e-8)
  if (simplified.length <= maxPoints) return simplified
  return strideTake(simplified, maxPoints)
}

function sumPathLengths(segments: Segment[]): number {
  return segments.reduce((sum, s) => sum + s.path.length, 0)
}

// -- Segment path clipping (T22/S3) ------------------------------------------

/** A segment path vertex plus the ordering key used to merge/clip by time. */
interface SegmentVertex {
  point: PathPoint
  sortMs: number
}

/**
 * Expand a segment into timed vertices. The path falls back to the semantic
 * start/end when the export carries no per-vertex path. Vertices without an
 * export time get an interpolated ordering key so they still land in segment
 * order; their displayed time stays absent (never fabricated).
 *
 * Note: falls back at `path.length < 2` (MIN_POLYLINE_LEN), deliberately NOT
 * `MIN_PATH_LEN = 1`: a single-vertex path has no real vertex to anchor a clip
 * decision, so both endpoints must be expanded here to give the timeline merge
 * / clipping two sortable vertices. This is the one place the "polyline
 * drawability" threshold doubles as an expansion gate — see clipSegmentPath.
 */
function segmentVertices(segment: Segment): SegmentVertex[] {
  const path: PathPoint[] =
    segment.path.length >= MIN_POLYLINE_LEN
      ? segment.path
      : [
          { lat: segment.start.lat, lng: segment.start.lng },
          { lat: segment.end.lat, lng: segment.end.lng },
        ]
  const span = segment.endMs - segment.startMs
  return path.map((point, i) => {
    const hasTime = typeof point.timestampMs === 'number' && Number.isFinite(point.timestampMs)
    const sortMs = hasTime
      ? (point.timestampMs as number)
      : path.length > 1 // interpolation denominator guard (span / (n - 1))
        ? segment.startMs + (span * i) / (path.length - 1)
        : segment.startMs
    return { point, sortMs }
  })
}

/**
 * Clip a segment's path to the selected range by each vertex's time (T22).
 * Segments are pulled in when they merely *overlap* the range, so without this
 * a cross-midnight segment draws the previous day's trail. Shared by the
 * timeline merge (`buildTimelineRoute`) and the activityType renderer (clipped
 * inside `prepareTrips`) so both modes agree.
 *
 * Path-less segments (`path.length < 2`) are returned untouched: they carry no
 * real vertices to clip, and expanding their start/end fallback here would
 * change `totalPathPoints` for every such segment. Known limitation: a
 * path-less segment that spans midnight is still drawn as the unclipped
 * `[start, end]` straight line (the pre-existing fallback in `boundsOf`,
 * `polylineEndpoints` and `TripMap`'s `positions`), because there is no vertex
 * to clip — it is recorded here rather than silently assumed fixed.
 */
export function clipSegmentPath(segment: Segment, range: DateRangeFilter): PathPoint[] {
  // A path with fewer than MIN_POLYLINE_LEN vertices cannot be a polyline —
  // return it untouched (no [start,end] expansion here; see segmentVertices).
  if (!hasRenderablePath(segment.path)) return segment.path
  return segmentVertices(segment)
    .filter((vertex) => {
      if (range.startMs !== null && vertex.sortMs < range.startMs) return false
      if (range.endMs !== null && vertex.sortMs > range.endMs) return false
      return true
    })
    .map((vertex) => vertex.point)
}

/**
 * Build the renderable trips payload for a date range. Per-segment paths are
 * DP-simplified past the per-segment threshold, then segment count, path points
 * and markers are decimated to their global budgets (set `downsampled` when
 * this happens). The segment cap keeps React + Leaflet layer counts bounded on
 * decade-spanning "全部" views.
 */
export function prepareTrips(
  segments: Segment[],
  visits: Visit[],
  range: DateRangeFilter,
  points: RawPoint[] = [],
): PreparedTrips {
  // Filter preserves document order, then the survivors are sorted into
  // timeline order (ascending startMs) so consecutive segments form the
  // continuous route the user asked for; `filter()` already returns a fresh
  // array, so sorting here never mutates the caller's list.
  const filteredSegments = filterSegments(segments, range).sort((a, b) => a.startMs - b.startMs)
  const filteredVisits = filterVisits(visits, range)

  let downsampled = false
  let sliced = filteredSegments
  if (sliced.length > MAX_SEGMENTS) {
    downsampled = true
    sliced = strideTake(sliced, MAX_SEGMENTS)
  }

  const prepared = sliced.map((s) => {
    // T22/S3: clip the path to the selected range before simplifying, so a
    // cross-midnight segment that merely *overlaps* the range cannot draw the
    // previous day's trail in the activityType view either. Uses the same
    // per-vertex time rule as the timeline merge.
    let path = clipSegmentPath(s, range)
    // Rendering-budget threshold, NOT a fallback gate (T31): simplify only
    // when the clipped path exceeds the per-segment DP budget.
    if (path.length > SEGMENT_POINT_SIMPLIFY_MAX) {
      path = simplifyPath(path, SEGMENT_POINT_SIMPLIFY_MAX)
    }
    return { ...s, path }
  })

  const total = sumPathLengths(prepared)
  if (total > GLOBAL_PATH_POINT_CAP) {
    downsampled = true
    const ratio = GLOBAL_PATH_POINT_CAP / total
    for (let i = 0; i < prepared.length; i++) {
      const seg = prepared[i]
      const target = Math.max(2, Math.round(seg.path.length * ratio))
      prepared[i] = { ...seg, path: strideTake(seg.path, target) }
    }
  }

  const markers = filteredVisits.length > MARKER_CAP ? strideTake(filteredVisits, MARKER_CAP) : filteredVisits
  if (markers.length !== filteredVisits.length) downsampled = true

  const filteredRaw = filterRawPoints(points, range)
  const rawDrawn =
    filteredRaw.length > RAW_POINT_CAP ? strideTake(filteredRaw, RAW_POINT_CAP) : filteredRaw
  if (rawDrawn.length !== filteredRaw.length) downsampled = true

  const newestFirst = [...filteredVisits].sort((a, b) => b.startMs - a.startMs)
  return {
    segments: prepared,
    visits: newestFirst,
    markers,
    points: rawDrawn,
    totalPathPoints: sumPathLengths(prepared),
    downsampled,
  }
}

/**
 * Page-level wiring entry: the single way the Trips view derives its renderable
 * payload from a parsed `TimelineData`. Every consumer layer that needs the raw
 * GPS stream — TripMap's `rawPoints`, the "N 原始点" summary — reads `points`
 * off the returned payload, so dropping `data.points` here would silently kill
 * the whole rendering path (regression guarded by a link-level test).
 */
export function prepareTripsForData(data: TimelineData, range: DateRangeFilter): PreparedTrips {
  return prepareTrips(data.segments, data.visits, range, data.points)
}

// -- Timeline mode (T15/T16) -------------------------------------------------

/**
 * Build the timeline route geometry (T16/T17).
 *
 * rawSignals are only retained by Google for ~30 days, so a range that reaches
 * further back has no raw fixes at all — the timeline would otherwise be empty
 * even though the semantic segments still describe the journey. This merges
 * every available vertex — raw fixes and semantic segment paths
 * (`timelinePath` / `waypointPath`, already stitched into `segment.path`) —
 * into ONE time-ordered trail:
 *
 * 1. Expand every segment path into vertices, carrying the export's per-vertex
 *    `time` when present. Vertices without a time get an interpolation sort key
 *    so they still land in segment order (their displayed time stays absent).
 * 2. Sort by time.
 * 3. Drop consecutive duplicates (same place, same time). This is what removes
 *    the "many lines" artefact: T13.2 stitching copies a coarse `timelinePath`
 *    trace into the path-less activity segment that borrowed it, so without
 *    dedup the exact same trace is drawn twice.
 *
 * Self-contained: filters both inputs to `range` and sorts them, so callers may
 * pass the full streams.
 */
export function buildTimelineRoute(
  rawPoints: readonly RawPoint[],
  segments: Segment[],
  range: DateRangeFilter,
): { points: TimelineVertex[]; source: 'raw' | 'segments' | 'mixed'; downsampled: boolean } {
  const inRangeRaw = [...filterRawPoints(rawPoints, range)].sort(
    (a, b) => a.timestampMs - b.timestampMs,
  )
  const inRangeSegments = filterSegments(segments, range).sort((a, b) => a.startMs - b.startMs)

  // Raw retention window: a segment whose span already contains a raw fix is
  // represented by that finer raw trail, so its (coarser) path is skipped —
  // otherwise the same journey would be drawn twice. Outside the window (no raw
  // fix in span) the semantic path is all we have and is used.
  const rawTimes = inRangeRaw.map((p) => p.timestampMs)
  // Raw retention window. A semantic vertex is dropped only when a raw fix
  // exists *near that vertex's time* — the finer raw trail already draws that
  // moment, so keeping the coarse vertex too would double-draw it. The check is
  // per-vertex (not per-segment) on purpose: a segment that straddles the raw
  // window boundary, or spans a gap in the raw stream, must still contribute
  // its uncovered vertices, otherwise the route develops a hole (T21).
  const COVER_MS = 5 * 60 * 1000
  const coveredByRaw = (t: number): boolean => {
    if (rawTimes.length === 0) return false
    let lo = 0
    let hi = rawTimes.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (rawTimes[mid] < t) lo = mid + 1
      else hi = mid
    }
    const next = lo < rawTimes.length ? rawTimes[lo] - t : Infinity
    const prev = lo > 0 ? t - rawTimes[lo - 1] : Infinity
    return Math.min(next, prev) <= COVER_MS
  }

  interface TimedVertex extends TimelineVertex {
    /** Ordering key: real time when known, otherwise interpolated across the segment. */
    sortMs: number
  }

  const candidates: TimedVertex[] = []
  let rawCount = 0
  for (const p of inRangeRaw) {
    candidates.push({ lat: p.lat, lng: p.lng, timestampMs: p.timestampMs, sortMs: p.timestampMs })
    rawCount++
  }

  let segmentCount = 0
  for (const s of inRangeSegments) {
    // Shared with `clipSegmentPath` (activityType): same per-vertex time rule,
    // including the interpolation used for vertices without an export time.
    for (const { point: p, sortMs } of segmentVertices(s)) {
      const hasTime = typeof p.timestampMs === 'number' && Number.isFinite(p.timestampMs)
      // T22: a segment is pulled in when it *overlaps* the range, but its
      // vertices must not stray outside it — otherwise selecting one day draws
      // the previous day's trail too. Clip by the vertex's time.
      if (range.startMs !== null && sortMs < range.startMs) continue
      if (range.endMs !== null && sortMs > range.endMs) continue
      if (coveredByRaw(sortMs)) continue
      candidates.push({ lat: p.lat, lng: p.lng, timestampMs: hasTime ? p.timestampMs : undefined, sortMs })
      segmentCount++
    }
  }

  candidates.sort((a, b) => a.sortMs - b.sortMs)

  // Consecutive-duplicate collapse: same place (~1m) within a second. The
  // stitched duplicate carries the identical time + coordinate, so it folds.
  const DEDUP_DEG = 1e-5
  const DEDUP_MS = 1000
  const out: TimelineVertex[] = []
  for (const c of candidates) {
    const last = out[out.length - 1]
    if (last) {
      const samePlace = Math.abs(last.lat - c.lat) < DEDUP_DEG && Math.abs(last.lng - c.lng) < DEDUP_DEG
      const closeInTime =
        last.timestampMs === undefined ||
        c.timestampMs === undefined ||
        Math.abs(c.timestampMs - last.timestampMs) <= DEDUP_MS
      if (samePlace && closeInTime) continue
    }
    const vertex: TimelineVertex = { lat: c.lat, lng: c.lng }
    if (c.timestampMs !== undefined) vertex.timestampMs = c.timestampMs
    out.push(vertex)
  }

  let downsampled = false
  let points = out
  if (out.length > GLOBAL_PATH_POINT_CAP) {
    points = strideTake(out, GLOBAL_PATH_POINT_CAP)
    downsampled = true
  }

  const source: 'raw' | 'segments' | 'mixed' =
    rawCount > 0 && segmentCount > 0
      ? 'mixed'
      : rawCount > 0 || segmentCount === 0
        ? 'raw'
        : 'segments'

  return { points, source, downsampled }
}

/**
 * Build the renderable timeline payload: a single continuous route through the
 * selected range plus visit markers. Route geometry comes from rawSignals where
 * they exist and falls back to the semantic segment paths for older dates
 * (`buildTimelineRoute`), so the route is always drawn even outside Google's
 * ~30-day raw retention window. No activity-type coloring, no bridges.
 */
export function prepareTimeline(
  visits: Visit[],
  range: DateRangeFilter,
  points: RawPoint[] = [],
  segments: Segment[] = [],
): TimelinePayload {
  const filteredVisits = filterVisits(visits, range)

  let downsampled = false

  const filteredRaw = filterRawPoints(points, range)
  const sortedRaw = [...filteredRaw].sort((a, b) => a.timestampMs - b.timestampMs)
  const drawnRaw =
    sortedRaw.length > RAW_POINT_CAP ? strideTake(sortedRaw, RAW_POINT_CAP) : sortedRaw
  if (drawnRaw.length !== sortedRaw.length) downsampled = true

  const markers = filteredVisits.length > MARKER_CAP ? strideTake(filteredVisits, MARKER_CAP) : filteredVisits
  if (markers.length !== filteredVisits.length) downsampled = true

  const route = buildTimelineRoute(drawnRaw, segments, range)
  if (route.downsampled) downsampled = true

  const newestFirst = [...filteredVisits].sort((a, b) => b.startMs - a.startMs)
  return {
    points: drawnRaw,
    route: route.points,
    routeSource: route.source,
    visits: newestFirst,
    markers,
    downsampled,
  }
}

// -- Timeline bridges (T14) --------------------------------------------------

/**
 * Maximum number of bridge polylines drawn between consecutive timeline
 * segments. Each bridge is a single 2-vertex line (2 path points, bounded by
 * design), so capping the chapter count keeps decade-spanning "全部" views
 * within the shared point budget while the segments themselves stay under
 * `MAX_SEGMENTS` / `GLOBAL_PATH_POINT_CAP`.
 */
export const BRIDGE_CAP = 1000

/**
 * Gaps at or above this duration get a human-readable "衔接 +…" tooltip label;
 * shorter gaps (already visually connected legs) are just tagged "衔接".
 */
export const BRIDGE_ANNOTATE_MIN_MS = 60_000

/** A dashed "no-record" link from the end of one segment to the start of the
 * next, an honest visual for the gap between two real traces. Geometry uses
 * each leg's VISUAL endpoints — the first/last vertex of the polyline actually
 * drawn (`segment.path`, with a `[start, end]` fallback) — so the bridge meets
 * the neighbouring polylines exactly where they end. Stitched traces
 * (T13.2/T13.3) can differ from `start`/`end` by up to MAX_STITCH_DEG, and the
 * two must not be mixed or every joint shows a km-scale visual break. */
export interface BridgeLine {
  /** Index of the departing segment, into the (timeline-sorted) list. */
  fromIndex: number
  /** Index of the arriving segment, into the (timeline-sorted) list. */
  toIndex: number
  /** Visual end point of the departing segment's polyline (`path.last`). */
  from: Point
  /** Visual start point of the arriving segment's polyline (`path[0]`). */
  to: Point
  fromMs: number
  toMs: number
  /**
   * Signed time delta `toMs - fromMs` between the consecutive segments:
   * positive = a real no-record forward gap; negative = the legs' windows
   * overlap (a transfer where GPS granularity makes leg A end after leg B
   * starts); zero = temporally contiguous. Tooltips must never render this raw
   * number when negative (see `bridgeGapLabel`).
   */
  gapMs: number
}

/** First/last vertex of the polyline TripMap actually renders for a segment. */
function polylineEndpoints(s: Segment): { first: Point; last: Point } {
  // A-clamp semantics (`MIN_PATH_LEN = 1`): after range clipping a segment may
  // hold a single vertex; using the unclipped semantic start/end here would
  // bridge back to the previous day (T22/S2).
  return hasPath(s)
    ? { first: s.path[0], last: s.path[s.path.length - 1] }
    : { first: s.start, last: s.end }
}

/**
 * Link consecutive segments of an already timeline-ordered list with bridge
 * lines — the "跟時間連" contract (CEO decision 2026-09-14): EVERY time-adjacent
 * pair gets a bridge, regardless of transport type, how far apart the
 * endpoints are, or of whether the windows overlap. Overlap between legs is the
 * norm for coarse/split GPS records — a driving leg commonly ends a minute or
 * two AFTER the following walking leg starts, and a coarse 移動 segment can
 * span the same window as a 驾车 leg tens of km away (the same journey recorded
 * twice at different granularities). The user asked to follow time, so those
 * legs are joined too; the dashed style + "衔接 +N 分钟" tooltip already say
 * honestly that no direct trace was recorded between them.
 * The only pair skipped is the degenerate one whose two visual endpoints are
 * the exact same coordinate — the traces already touch on screen, and a
 * zero-length dashed line would be invisible anyway.
 * All input must already be ordered ascending by `startMs` — `prepareTrips`
 * guarantees this — so consecutive pairs ARE the timeline sequence. When more
 * than `BRIDGE_CAP` legs exist, the bridges are evenly stride-sampled (both
 * ends kept).
 */
export function bridgeLines(segments: readonly Segment[]): BridgeLine[] {
  const out: BridgeLine[] = []
  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1]
    const cur = segments[i]
    const gapMs = cur.startMs - prev.endMs
    const prevEnd = polylineEndpoints(prev).last
    const curStart = polylineEndpoints(cur).first
    if (prevEnd.lat === curStart.lat && prevEnd.lng === curStart.lng) continue
    out.push({
      fromIndex: i - 1,
      toIndex: i,
      from: prevEnd,
      to: curStart,
      fromMs: prev.endMs,
      toMs: cur.startMs,
      gapMs,
    })
  }
  if (out.length <= BRIDGE_CAP) return out
  return strideTake(out, BRIDGE_CAP)
}

/**
 * Language-neutral decomposition of a bridge gap for the UI to localize.
 * `link` = below the annotation threshold (including overlapping transfers,
 * whose gapMs is negative and must never render as a negative duration).
 */
export type BridgeGapParts =
  | { kind: 'link' }
  | { kind: 'gap'; days: number; hours: number; minutes: number }

export function bridgeGapParts(gapMs: number): BridgeGapParts {
  if (gapMs < BRIDGE_ANNOTATE_MIN_MS) return { kind: 'link' }
  const totalMinutes = Math.round(gapMs / 60000)
  return {
    kind: 'gap',
    days: Math.floor(totalMinutes / (60 * 24)),
    hours: Math.floor((totalMinutes % (60 * 24)) / 60),
    minutes: totalMinutes % 60,
  }
}

/**
 * Short Chinese tooltip for a bridge: "衔接" for gaps under the annotation
 * threshold, otherwise "衔接 +N 分钟/小时/天" so the user can judge whether
 * the dashed link is a minute-long transfer or an unrecorded multi-day gap.
 * Overlapping legs carry a NEGATIVE `gapMs` — the label must never show a
 * negative duration, so any gap below the annotation threshold (including
 * overlap transfers) renders as the plain "衔接".
 *
 * Kept for tests/back-compat; the UI localizes via `bridgeGapParts` + i18n.
 */
export function bridgeGapLabel(gapMs: number): string {
  const parts = bridgeGapParts(gapMs)
  if (parts.kind === 'link') return '衔接'
  if (parts.days > 0) return parts.hours > 0 ? `衔接 +${parts.days} 天 ${parts.hours} 小时` : `衔接 +${parts.days} 天`
  if (parts.hours > 0) return parts.minutes > 0 ? `衔接 +${parts.hours} 小时 ${parts.minutes} 分` : `衔接 +${parts.hours} 小时`
  return `衔接 +${parts.minutes} 分钟`
}

// -- Route point rendering ---------------------------------------------------

export interface RoutePoint {
  lat: number
  lng: number
  color: string
}

/**
 * Flatten every prepared segment's path into small colored marker points. A
 * route point is drawn for each vertex the polyline passes through; when the
 * combined count overruns `cap`, the whole flattened list is uniformly
 * stride-sampled (keeping both ends) so the result is guaranteed to stay at
 * or under `cap` on decade-spanning "全部" views.
 */
export function budgetRoutePoints(segments: readonly Segment[], cap: number): RoutePoint[] {
  const out: RoutePoint[] = []
  for (const s of segments) {
    const color = activityColor(s.activityType)
    for (const point of s.path) out.push({ lat: point.lat, lng: point.lng, color })
  }
  if (out.length <= cap) return out
  return strideTake(out, cap)
}

// -- Activity styling --------------------------------------------------------

const ACTIVITY_COLORS: Record<string, string> = {
  // motorized road / rail
  IN_PASSENGER_VEHICLE: '#3b82f6',
  IN_VEHICLE: '#3b82f6',
  IN_BUS: '#38bdf8',
  IN_SUBWAY: '#2dd4bf',
  IN_TRAIN: '#22d3ee',
  IN_TRAM: '#2dd4bf',
  IN_FERRY: '#2dd4bf',
  // self-propelled
  WALKING: '#34d399',
  RUNNING: '#34d399',
  CYCLING: '#a78bfa',
  MOTORCYCLING: '#a78bfa',
  // air
  IN_FLIGHT: '#fbbf24',
  FLYING: '#fbbf24',
}

const ACTIVITY_LABELS: Record<string, string> = {
  IN_PASSENGER_VEHICLE: '驾车',
  IN_VEHICLE: '乘载具',
  IN_BUS: '公交',
  IN_SUBWAY: '地铁',
  IN_TRAIN: '火车',
  IN_TRAM: '电车',
  IN_FERRY: '渡轮',
  WALKING: '步行',
  RUNNING: '跑步',
  CYCLING: '骑行',
  MOTORCYCLING: '摩托',
  IN_FLIGHT: '飞行',
  FLYING: '飞行',
}

export const ACTIVITY_DEFAULT_COLOR = '#64748b'

export function activityColor(activityType?: string): string {
  if (!activityType) return ACTIVITY_DEFAULT_COLOR
  return ACTIVITY_COLORS[activityType] ?? ACTIVITY_DEFAULT_COLOR
}

export function activityLabel(activityType?: string): string {
  if (!activityType) return '移动'
  return ACTIVITY_LABELS[activityType] ?? activityType
}

/** Distinct legend entries from the currently visible segment set. The label is
 *  resolved in the UI from the activity type (i18n), so this stays
 *  language-neutral. */
export function legendTypes(segments: Segment[]): Array<{ type: string; color: string }> {
  const seen = new Set<string>()
  const out: Array<{ type: string; color: string }> = []
  for (const s of segments) {
    const type = s.activityType ?? ''
    if (seen.has(type)) continue
    seen.add(type)
    out.push({ type, color: activityColor(s.activityType) })
  }
  return out
}

// -- Stop <-> segment linkage ------------------------------------------------

/** Segments whose time window overlaps the visit's stay, in chronological order. */
export function segmentsOverlappingVisit(visit: Visit, segments: Segment[]): Segment[] {
  return segments.filter(
    (s) => s.startMs <= visit.endMs && s.endMs >= visit.startMs,
  )
}

/** Segments that started on the same calendar day as the visit. */
export function segmentsOnSameDay(visit: Visit, segments: Segment[]): Segment[] {
  const day = startOfDayMs(visit.startMs)
  return segments.filter((s) => startOfDayMs(s.startMs) === day)
}