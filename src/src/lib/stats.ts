// Trip statistics (T27 / PRD 功能 11): pure, local-only aggregates over the
// CURRENTLY FILTERED data. Everything is O(n) over the filtered arrays (no
// per-render O(n²)) so it stays cheap on decade-spanning ranges.
//
// A1: the filtered records use overlap semantics, so a cross-midnight segment or
// stay can start before / end after the selected range. Intervals and stay
// durations are therefore CLAMPED to the range before counting active days and
// total stay time — the out-of-range day must not count.
//
// A4 (known limitation): places are grouped by `name → address → coarse
// coordinate` (see `groupVisitsByLocation`); same-named places at different
// coordinates are merged into one entry.
import { haversineKm, type Point, type Segment, type Visit } from './types'
import { startOfDayMs, type DateRangeFilter } from './trips'
import { groupVisitsByLocation } from './geo/visitHistory'

export interface PlaceFrequency {
  /** Group key (place name → address → coarse coordinate bucket). */
  key: string
  /** Display name for the group. */
  name: string
  /** Number of visits. */
  count: number
  /** Cumulative stay duration across visits, in ms (clamped to the range). */
  totalDurationMs: number
}

export interface TripStats {
  /** Sum of great-circle distances along the drawn geometry, in km. */
  totalDistanceKm: number
  /** Distinct local calendar days touched by any in-range segment or stay. */
  activeDays: number
  /** totalDistanceKm / activeDays (0 when there are no active days). */
  avgDistanceKmPerDay: number
  /** Cumulative (clamped) stay duration / activeDays, in ms. */
  avgStayMsPerDay: number
  /** Cumulative (clamped) stay duration across all in-range stays, in ms. */
  totalStayMs: number
  /** Most-visited places, most frequent first. */
  topPlaces: PlaceFrequency[]
}

export type DistanceSource = 'route' | 'segments'

export interface TripStatsInput {
  /** Timeline route (used when `distanceSource` is 'route'). */
  route: readonly Point[]
  /** Filtered segments (used when `distanceSource` is 'segments'). */
  segments: readonly Segment[]
  /** Filtered stays. */
  visits: readonly Visit[]
  /** Selected range; open-ended sides (null) are not clamped. */
  range: DateRangeFilter
  /** Which drawn geometry the distance should match. Defaults to 'route'. */
  distanceSource?: DistanceSource
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Sum of haversine distances between consecutive points (km). */
export function routeDistanceKm(points: readonly Point[]): number {
  let sum = 0
  for (let i = 1; i < points.length; i++) {
    sum += haversineKm(points[i - 1], points[i])
  }
  return sum
}

/**
 * Total distance of the activityType view: each segment's drawn polyline
 * (path when it has ≥2 vertices, else the semantic start→end) summed. Matches
 * exactly what the map draws in that mode.
 */
export function segmentsDistanceKm(segments: readonly Segment[]): number {
  let sum = 0
  for (const s of segments) {
    // `> 0`, not `>= 2`: after range clipping a segment may hold a single
    // vertex. The renderer (TripMap.positions) then draws a single point and no
    // line, so the distance must be 0 — falling back to the unclipped
    // `[start, end]` here would count the whole out-of-range leg (S3).
    const path: readonly Point[] =
      s.path.length > 0 ? s.path : [s.start, s.end]
    sum += routeDistanceKm(path)
  }
  return sum
}

/** Clamp an interval to the range; null when it falls entirely outside. */
function clampInterval(
  startMs: number,
  endMs: number,
  range: DateRangeFilter,
): { startMs: number; endMs: number } | null {
  let start = startMs
  let end = endMs
  if (range.startMs !== null) start = Math.max(start, range.startMs)
  if (range.endMs !== null) end = Math.min(end, range.endMs)
  if (end < start) return null
  return { startMs: start, endMs: end }
}

/**
 * Distinct local days covered by the union of the given intervals. Uses
 * `setDate` stepping (not +DAY_MS) so DST-length days still advance one
 * calendar day at a time.
 */
function activeDayCount(intervals: readonly { startMs: number; endMs: number }[]): number {
  const days = new Set<number>()
  for (const interval of intervals) {
    if (!Number.isFinite(interval.startMs) || !Number.isFinite(interval.endMs)) continue
    if (interval.endMs < interval.startMs) continue
    const cursor = new Date(startOfDayMs(interval.startMs))
    const last = startOfDayMs(interval.endMs)
    // Guard against pathological spans (e.g. a corrupt multi-year "visit"):
    // the calendar day loop is bounded by the range length anyway, but a hard
    // cap keeps a single bad record from dominating the computation.
    let guard = 0
    while (cursor.getTime() <= last && guard < 20000) {
      days.add(cursor.getTime())
      cursor.setDate(cursor.getDate() + 1)
      guard++
    }
  }
  return days.size
}

function placeFrequencies(
  visits: readonly Visit[],
  range: DateRangeFilter,
  topN: number,
): PlaceFrequency[] {
  const groups = groupVisitsByLocation([...visits])
  const out: PlaceFrequency[] = []
  for (const [key, group] of groups) {
    let totalDurationMs = 0
    for (const visit of group) {
      const clamped = clampInterval(visit.startMs, visit.endMs, range)
      if (clamped) totalDurationMs += clamped.endMs - clamped.startMs
    }
    out.push({
      key,
      name: group[0]?.name ?? group[0]?.address ?? key,
      count: group.length,
      totalDurationMs,
    })
  }
  out.sort((a, b) => b.count - a.count || b.totalDurationMs - a.totalDurationMs)
  return out.slice(0, topN)
}

/**
 * Compute the stats summary for an already date-filtered dataset.
 *
 * `distanceSource` selects which drawn geometry the distance matches:
 * 'route' (timeline mode) or 'segments' (activityType mode).
 */
export function computeTripStats(input: TripStatsInput, topN = 5): TripStats {
  const { range } = input
  const totalDistanceKm =
    (input.distanceSource ?? 'route') === 'segments'
      ? segmentsDistanceKm(input.segments)
      : routeDistanceKm(input.route)

  const intervals: { startMs: number; endMs: number }[] = []
  for (const s of input.segments) {
    const clamped = clampInterval(s.startMs, s.endMs, range)
    if (clamped) intervals.push(clamped)
  }
  for (const v of input.visits) {
    const clamped = clampInterval(v.startMs, v.endMs, range)
    if (clamped) intervals.push(clamped)
  }
  const activeDays = activeDayCount(intervals)

  let totalStayMs = 0
  for (const v of input.visits) {
    const clamped = clampInterval(v.startMs, v.endMs, range)
    if (clamped) totalStayMs += clamped.endMs - clamped.startMs
  }

  return {
    totalDistanceKm,
    activeDays,
    avgDistanceKmPerDay: activeDays > 0 ? totalDistanceKm / activeDays : 0,
    avgStayMsPerDay: activeDays > 0 ? totalStayMs / activeDays : 0,
    totalStayMs,
    topPlaces: placeFrequencies(input.visits, range, topN),
  }
}

export { DAY_MS }
