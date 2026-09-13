// Uniform square-cell spatial index for the Places view. Records are bucketed
// into latitude x longitude cells (default 1°x1°); a circle query first walks
// the cells covered by the query's bounding box, then filters those candidates
// precisely with haversine distance. The index is small enough (only stops,
// no path points) that it is rebuilt whenever the dataset or the active date
// range changes instead of being updated incrementally.
import type { Point } from '../types'
import { haversineKm } from '../types'

/** Approximate kilometers per degree of latitude (WGS84 mean). */
const LAT_KM_PER_DEGREE = 111.195

// Grid cells are expanded beyond the true radius so the exact haversine pass
// (row/col walk + distance filter) never drops a record that legitimately
// belongs — the box-to-circle slack must only ever over-approximate.
const BBOX_SAFETY = 1.25

export interface CircleHit<T extends Point> {
  record: T
  /** Great-circle distance from the query center, in kilometers. */
  distanceKm: number
}

/**
 * Spatial index over any point-bearing record type. Grid cell size defaults to
 * 1° per side; queries return hits sorted in *unspecified* order — callers
 * that need time ordering sort the results themselves.
 */
export class SpatialGrid<T extends Point> {
  private readonly cells = new Map<string, T[]>()
  private readonly size: number
  private count = 0

  constructor(size = 1) {
    this.size = size
  }

  /** Total number of indexed records. */
  get recordCount(): number {
    return this.count
  }

  /** Number of non-empty cells currently holding records. */
  get cellCount(): number {
    return this.cells.size
  }

  add(record: T): void {
    const row = Math.floor(record.lat / this.size)
    const col = Math.floor(record.lng / this.size)
    const key = `${row}/${col}`
    let bucket = this.cells.get(key)
    if (!bucket) {
      bucket = []
      this.cells.set(key, bucket)
    }
    bucket.push(record)
    this.count++
  }

  /** Bulk-add records; returns `this` for chaining. */
  build(records: readonly T[]): this {
    for (const record of records) this.add(record)
    return this
  }

  /**
   * All records within `radiusKm` of (lat, lng). The bounding box of the query
   * circle (widened by BBOX_SAFETY) selects the candidate cells; each candidate
   * is then filtered by exact great-circle distance.
   */
  queryCircle(lat: number, lng: number, radiusKm: number): CircleHit<T>[] {
    if (!Number.isFinite(radiusKm) || radiusKm <= 0) return []

    const degreePerKm = 1 / LAT_KM_PER_DEGREE
    const latHalf = radiusKm * degreePerKm * BBOX_SAFETY
    // Longitude degrees shrink as latitude grows; at the poles any longitude is
    // degenerate so the span is clipped to the full 360°.
    const cosLat = Math.cos((lat * Math.PI) / 180)
    const cosAbs = Math.abs(cosLat)
    const lngHalf = cosAbs < 1e-9 ? 180 : Math.min(180, (radiusKm * degreePerKm * BBOX_SAFETY) / cosAbs)

    const minLat = Math.max(-90, lat - latHalf)
    const maxLat = Math.min(90, lat + latHalf)
    const minLng = Math.max(-180, lng - lngHalf)
    const maxLng = Math.min(180, lng + lngHalf)

    const rowStart = Math.floor(minLat / this.size)
    const rowEnd = Math.floor(maxLat / this.size)
    const colStart = Math.floor(minLng / this.size)
    const colEnd = Math.floor(maxLng / this.size)

    const hits: CircleHit<T>[] = []
    const center: Point = { lat, lng }
    for (let row = rowStart; row <= rowEnd; row++) {
      for (let col = colStart; col <= colEnd; col++) {
        const bucket = this.cells.get(`${row}/${col}`)
        if (!bucket) continue
        for (const record of bucket) {
          const distanceKm = haversineKm(record, center)
          if (distanceKm <= radiusKm) hits.push({ record, distanceKm })
        }
      }
    }
    return hits
  }
}