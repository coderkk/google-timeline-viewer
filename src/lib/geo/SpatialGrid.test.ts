import { describe, expect, it } from 'vitest'
import type { Point } from '../types'
import { SpatialGrid } from './SpatialGrid'

const CENTER = { lat: 25.03, lng: 121.57 }

// A point due north of CENTER whose haversine distance is (very nearly) `km`.
// Placing offsets along the same meridian keeps the assertions independent of
// longitude/cosine effects.
const north = (km: number): Point => ({ lat: CENTER.lat + km / 111.195, lng: CENTER.lng })

const gridOf = (points: Point[]): SpatialGrid<Point> => new SpatialGrid<Point>().build(points)

describe('SpatialGrid', () => {
  it('buckets records into 1° cells and counts them', () => {
    const grid = gridOf([CENTER, north(100), { lat: 10, lng: 100 }])
    expect(grid.recordCount).toBe(3)
    expect(grid.cellCount).toBeGreaterThanOrEqual(2)
  })

  it('returns no hits for a non-positive or invalid radius', () => {
    const grid = gridOf([CENTER, north(1)])
    expect(grid.queryCircle(CENTER.lat, CENTER.lng, 0)).toHaveLength(0)
    expect(grid.queryCircle(CENTER.lat, CENTER.lng, Number.NaN)).toHaveLength(0)
  })

  it('10 km radius keeps near stops and drops far ones', () => {
    const grid = gridOf([CENTER, north(9), north(15), north(50)])
    const hits = grid.queryCircle(CENTER.lat, CENTER.lng, 10)
    expect(hits).toHaveLength(2)
    expect(hits.every((h) => h.distanceKm <= 10)).toBe(true)
  })

  it('100 km radius includes ~50 and ~90 km stops and a longitude offset', () => {
    const east = { lat: CENTER.lat, lng: CENTER.lng + 0.31 }
    const grid = gridOf([north(50), north(90), north(150), east])
    const hits = grid.queryCircle(CENTER.lat, CENTER.lng, 100)
    expect(hits.map((h) => h.distanceKm).sort((a, b) => a - b)).toEqual([
      expect.closeTo(31.2, 1),
      expect.closeTo(50, 1),
      expect.closeTo(90, 1),
    ])
  })

  it('reports the ~50 km distance accurately', () => {
    const grid = gridOf([north(50)])
    const hit = grid.queryCircle(CENTER.lat, CENTER.lng, 100)[0]
    expect(hit.distanceKm).toBeGreaterThan(49)
    expect(hit.distanceKm).toBeLessThan(51)
  })

  it('1000 km radius separates a 900 km stop from a 1500 km one', () => {
    const grid = gridOf([north(900), north(1500)])
    const hits = grid.queryCircle(CENTER.lat, CENTER.lng, 1000)
    expect(hits).toHaveLength(1)
    expect(hits[0].distanceKm).toBeGreaterThan(850)
    expect(hits[0].distanceKm).toBeLessThan(950)
  })

  it('5000 km radius covers intercontinental stops but not the far side', () => {
    const grid = gridOf([north(4000), north(6500)])
    const hits = grid.queryCircle(CENTER.lat, CENTER.lng, 5000)
    expect(hits).toHaveLength(1)
    expect(hits[0].distanceKm).toBeGreaterThan(3800)
    expect(hits[0].distanceKm).toBeLessThan(4200)
  })
})