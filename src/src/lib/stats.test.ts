import { describe, expect, it } from 'vitest'
import { haversineKm, type Segment, type Visit } from './types'
import { computeTripStats, routeDistanceKm, segmentsDistanceKm } from './stats'

function visit(over: Partial<Visit> & { startMs: number; endMs: number }): Visit {
  return { lat: 25, lng: 121.5, name: over.name, address: over.address, startMs: over.startMs, endMs: over.endMs }
}

const seg = (startMs: number, endMs: number, path: Segment['path'] = []): Segment => ({
  start: { lat: 25, lng: 121.5 },
  end: { lat: 25.1, lng: 121.6 },
  startMs,
  endMs,
  path,
})

const ALL: { startMs: null; endMs: null } = { startMs: null, endMs: null }

describe('routeDistanceKm', () => {
  it('sums haversine distances between consecutive points', () => {
    const route = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
      { lat: 0, lng: 2 },
    ]
    const expected = haversineKm(route[0], route[1]) + haversineKm(route[1], route[2])
    expect(routeDistanceKm(route)).toBeCloseTo(expected, 6)
  })

  it('is 0 for fewer than two points', () => {
    expect(routeDistanceKm([])).toBe(0)
    expect(routeDistanceKm([{ lat: 1, lng: 2 }])).toBe(0)
  })
})

describe('segmentsDistanceKm (A2)', () => {
  it('sums each segment polyline, falling back to start→end', () => {
    const withPath = seg(0, 1, [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }])
    const withoutPath = seg(0, 1, [])
    const expected =
      haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }) +
      haversineKm(withoutPath.start, withoutPath.end)
    expect(segmentsDistanceKm([withPath, withoutPath])).toBeCloseTo(expected, 6)
  })

  it('counts 0 for a segment clipped to a single vertex (no unclipped fallback)', () => {
    // After range clipping a cross-midnight segment can hold one vertex; the map
    // draws a point and no line, so the distance must be 0 (S3).
    const single = seg(0, 1, [{ lat: 9, lng: 9 }])
    expect(single.start).not.toEqual(single.path[0]) // fallback would differ
    expect(segmentsDistanceKm([single])).toBe(0)
  })
})

describe('computeTripStats (T27)', () => {
  // 2026-07-01 local noon, 07-02, 07-03.
  const d1 = new Date(2026, 6, 1, 10).getTime()
  const d1b = new Date(2026, 6, 1, 12).getTime()
  const d1c = new Date(2026, 6, 1, 14).getTime()
  const d2 = new Date(2026, 6, 2, 8).getTime()
  const d3 = new Date(2026, 6, 3, 9).getTime()
  const d3b = new Date(2026, 6, 3, 11).getTime()

  const visits: Visit[] = [
    visit({ name: 'Home', startMs: d1, endMs: d1b }), // 2h, day 1
    visit({ name: 'Home', startMs: d3, endMs: d3b }), // 2h, day 3
    visit({ name: 'Cafe', startMs: d1c, endMs: d2 }), // spans day 1→2
  ]
  const segments: Segment[] = [seg(d1, d1b), seg(d3, d3b)]

  it('computes total distance from the route', () => {
    const route = [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }]
    const stats = computeTripStats({ route, segments: [], visits: [], range: ALL })
    expect(stats.totalDistanceKm).toBeCloseTo(haversineKm(route[0], route[1]), 6)
  })

  it('uses the segment geometry when distanceSource is "segments" (A2)', () => {
    const route = [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }]
    const segment = seg(0, 1, [{ lat: 0, lng: 0 }, { lat: 0, lng: 2 }])
    const stats = computeTripStats({ route, segments: [segment], visits: [], range: ALL, distanceSource: 'segments' })
    expect(stats.totalDistanceKm).toBeCloseTo(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 2 }), 6)
  })

  it('counts distinct active days across segments and stays (incl. multi-day stays)', () => {
    const stats = computeTripStats({ route: [], segments, visits, range: ALL })
    // day 1 (segment + visits), day 2 (Cafe ends there), day 3 (segment + Home)
    expect(stats.activeDays).toBe(3)
  })

  it('clamps cross-midnight records to the range (A1)', () => {
    // Range = day 2 only. The Cafe stay runs day1 14:00 → day2 08:00 and a
    // segment spans day1 22:00 → day2 02:00.
    const range = { startMs: new Date(2026, 6, 2, 0, 0).getTime(), endMs: new Date(2026, 6, 2, 23, 59, 59).getTime() }
    const overnightVisit = visit({ name: 'Cafe', startMs: d1c, endMs: d2 })
    const overnightSeg = seg(new Date(2026, 6, 1, 22, 0).getTime(), new Date(2026, 6, 2, 2, 0).getTime())
    const stats = computeTripStats({ route: [], segments: [overnightSeg], visits: [overnightVisit], range })
    expect(stats.activeDays).toBe(1)
    // Only the in-range part of the stay (00:00 → 08:00) counts.
    expect(stats.totalStayMs).toBe(new Date(2026, 6, 2, 8, 0).getTime() - new Date(2026, 6, 2, 0, 0).getTime())
  })

  it('does not clamp when the range is open-ended', () => {
    const stats = computeTripStats({ route: [], segments: [], visits: [visit({ startMs: d1c, endMs: d2 })], range: ALL })
    expect(stats.activeDays).toBe(2)
    expect(stats.totalStayMs).toBe(d2 - d1c)
  })

  it('derives daily averages from the active days', () => {
    const route = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
      { lat: 0, lng: 2 },
      { lat: 0, lng: 3 },
    ]
    const totalKm = routeDistanceKm(route)
    const stats = computeTripStats({ route, segments, visits, range: ALL })
    expect(stats.activeDays).toBe(3)
    expect(stats.avgDistanceKmPerDay).toBeCloseTo(totalKm / 3, 6)
    // Stays: 2h + 2h + (14:00 → 08:00 next day = 18h) = 22h.
    const totalStayMs = 2 * 3600_000 + 2 * 3600_000 + (d2 - d1c)
    expect(stats.totalStayMs).toBe(totalStayMs)
    expect(stats.avgStayMsPerDay).toBeCloseTo(totalStayMs / 3, 6)
  })

  it('ranks places by visit count and cumulative duration', () => {
    const stats = computeTripStats({ route: [], segments: [], visits, range: ALL }, 5)
    expect(stats.topPlaces[0].name).toBe('Home')
    expect(stats.topPlaces[0].count).toBe(2)
    expect(stats.topPlaces[0].totalDurationMs).toBe(4 * 3600_000)
    expect(stats.topPlaces[1].name).toBe('Cafe')
    expect(stats.topPlaces[1].count).toBe(1)
  })

  it('honours the Top-N cap', () => {
    const many: Visit[] = Array.from({ length: 8 }, (_, i) =>
      visit({ name: `P${i}`, startMs: d1 + i * 1000, endMs: d1 + i * 1000 + 600_000 }),
    )
    const stats = computeTripStats({ route: [], segments: [], visits: many, range: ALL }, 3)
    expect(stats.topPlaces).toHaveLength(3)
  })

  it('returns zeroed averages when there is no activity', () => {
    const stats = computeTripStats({ route: [], segments: [], visits: [], range: ALL })
    expect(stats).toMatchObject({ totalDistanceKm: 0, activeDays: 0, avgDistanceKmPerDay: 0, avgStayMsPerDay: 0 })
  })
})
