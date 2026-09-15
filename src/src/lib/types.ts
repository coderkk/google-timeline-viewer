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

/**
 * A vertex of a segment polyline. The new device export's `timelinePath`
 * carries a per-point `time`, so movement vertices can be time-stamped;
 * formats without per-point time (e.g. `waypointPath`) leave it undefined.
 */
export interface PathPoint extends Point {
  /** Epoch milliseconds when this vertex was recorded, when the export has it. */
  timestampMs?: number
}

export interface Visit extends Point {
  name?: string
  address?: string
  placeId?: string
  startMs: number
  endMs: number
}

export interface Segment {
  /**
   * Transport label (IN_PASSENGER_VEHICLE, WALKING, ...). Present only when the
   * source record carried activity semantics. `undefined` alone is NOT a
   * reliable orphan-trace discriminator (a label-less activity record is
   * theoretically possible), so the parse layer also sets `hasActivitySemantics`.
   */
  activityType?: string
  start: Point
  end: Point
  startMs: number
  endMs: number
  /** Simplified polyline points from waypointPath / timelinePath. */
  path: PathPoint[]
  /**
   * True when this segment came from an activity record (visit semantics for
   * movement); false for orphan timelinePath-only GPS patrol traces (2h
   * ambient windows with no activity label — B5). `undefined` is the legacy
   * default for hand-built segments and is treated as "has semantics" by the
   * trip chain. The by-activity chain (T29/T33) only pairs visits with
   * segments where this is not explicitly false.
   */
  hasActivitySemantics?: boolean
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