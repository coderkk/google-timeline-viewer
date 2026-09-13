// Pure helpers for the Trips view: date-range filtering, polyline
// simplification, render caps (per-segment Douglas-Peucker + global point /
// marker budget), activity styling and stop<->segment linkage. Everything here
// stays framework-agnostic so it is easy to unit test.
import type { Point, Segment, Visit } from './types'

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
  totalPathPoints: number
  /** True when a rendering cap kicked in and the map shows a subset. */
  downsampled: boolean
}

// --- Rendering budget -------------------------------------------------------

export const SEGMENT_POINT_SIMPLIFY_MAX = 1500
export const GLOBAL_PATH_POINT_CAP = 30000
export const MAX_SEGMENTS = 12000
export const MARKER_CAP = 4000
export const LIST_LIMIT = 500

// -- Date helpers ------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000

export function startOfDayMs(ms: number): number {
  const d = new Date(ms)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

export function endOfDayMs(ms: number): number {
  return startOfDayMs(ms) + DAY_MS - 1
}

/** UTC day key like "2026-08-07"; stable across timezone-sensitive views. */
export function dayKeyOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
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
    grow(s.start.lat, s.start.lng)
    grow(s.end.lat, s.end.lng)
    for (const p of s.path) grow(p.lat, p.lng)
  }
  for (const v of visits) grow(v.lat, v.lng)
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
): PreparedTrips {
  const filteredSegments = filterSegments(segments, range)
  const filteredVisits = filterVisits(visits, range)

  let downsampled = false
  let sliced = filteredSegments
  if (sliced.length > MAX_SEGMENTS) {
    downsampled = true
    sliced = strideTake(sliced, MAX_SEGMENTS)
  }

  const prepared = sliced.map((s) => {
    let path = s.path
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

  const newestFirst = [...filteredVisits].sort((a, b) => b.startMs - a.startMs)
  return {
    segments: prepared,
    visits: newestFirst,
    markers,
    totalPathPoints: sumPathLengths(prepared),
    downsampled,
  }
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

/** Distinct legend entries from the currently visible segment set. */
export function legendTypes(segments: Segment[]): Array<{ type: string; label: string; color: string }> {
  const seen = new Set<string>()
  const out: Array<{ type: string; label: string; color: string }> = []
  for (const s of segments) {
    const type = s.activityType ?? ''
    if (seen.has(type)) continue
    seen.add(type)
    out.push({ type, label: activityLabel(s.activityType), color: activityColor(s.activityType) })
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