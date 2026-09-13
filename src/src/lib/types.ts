// Internal unified data model shared by every supported Google Timeline export
// format. All values are plain JSON-serializable so they can flow through the
// Web Worker postMessage channel without data loss.

export interface Point {
  lat: number
  lng: number
}

export interface RawPoint extends Point {
  /** Epoch milliseconds. */
  timestampMs: number
  /** Optional horizontal accuracy in meters. */
  accuracyMeters?: number
}

export interface Visit extends Point {
  name?: string
  address?: string
  placeId?: string
  startMs: number
  endMs: number
}

export interface Segment {
  activityType?: string
  start: Point
  end: Point
  startMs: number
  endMs: number
  /** Simplified polyline points from waypointPath / timelinePath. */
  path: Point[]
}

export interface TimeRange {
  minMs: number
  maxMs: number
}

export interface TimelineMeta {
  fileCount: number
  pointCount: number
  visitCount: number
  segmentCount: number
  timeRange: TimeRange
}

export interface TimelineData {
  points: RawPoint[]
  visits: Visit[]
  segments: Segment[]
  meta: TimelineMeta
}

/** Convert an E7-encoded latitude (e.g. 523719400) into decimal degrees. */
export function e7ToLat(e7: number): number {
  return e7 / 1e7
}

/** Convert an E7-encoded longitude (e.g. 13375000) into decimal degrees. */
export function e7ToLng(e7: number): number {
  return e7 / 1e7
}

/**
 * Normalize a timestamp into epoch milliseconds. Accepts ISO date strings and
 * numeric milliseconds; numeric strings are treated as already-ms values.
 * Returns NaN when the value cannot be parsed.
 */
export function toMs(ts: string | number): number {
  if (typeof ts === 'number') {
    return Number.isFinite(ts) ? ts : NaN
  }
  const s = ts.trim()
  if (/^\d+$/.test(s)) {
    return Number(s)
  }
  const ms = Date.parse(s)
  return Number.isFinite(ms) ? ms : NaN
}

const EARTH_RADIUS_KM = 6371

/** Great-circle distance between two points in kilometers. */
export function haversineKm(a: Point, b: Point): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}