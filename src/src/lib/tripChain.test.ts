import { describe, expect, it } from 'vitest'
import { haversineKm, type Segment, type Visit } from './types'
import { buildTripChain, segmentDistanceKm } from './tripChain'
import type { DateRangeFilter } from './trips'

const ALL: DateRangeFilter = { startMs: null, endMs: null }

/** Local wall-clock helper: day 2025-01-30 (and 29 for cross-midnight). */
const at = (day: number, h: number, m = 0): number => new Date(2025, 0, day, h, m).getTime()

function seg(over: Partial<Segment> & { startMs: number; endMs: number }): Segment {
  return {
    activityType: over.activityType ?? 'WALKING',
    start: over.start ?? { lat: 25, lng: 121.5 },
    end: over.end ?? { lat: 25.1, lng: 121.6 },
    startMs: over.startMs,
    endMs: over.endMs,
    path: over.path ?? [],
  }
}

function visit(over: Partial<Visit> & { startMs: number; endMs: number }): Visit {
  return { lat: 25, lng: 121.5, name: over.name, address: over.address, startMs: over.startMs, endMs: over.endMs }
}

describe('segmentDistanceKm', () => {
  it('sums haversine along the path when it has vertices', () => {
    const s = seg({ startMs: 0, endMs: 1, path: [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }] })
    expect(segmentDistanceKm(s)).toBeCloseTo(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }), 6)
  })

  it('falls back to start→end when there is no path', () => {
    const s = seg({ startMs: 0, endMs: 1, start: { lat: 0, lng: 0 }, end: { lat: 0, lng: 2 }, path: [] })
    expect(segmentDistanceKm(s)).toBeCloseTo(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 2 }), 6)
  })

  it('is 0 for a segment clipped to a single vertex (no unclipped fallback)', () => {
    const s = seg({ startMs: 0, endMs: 1, start: { lat: 1, lng: 1 }, path: [{ lat: 9, lng: 9 }] })
    expect(segmentDistanceKm(s)).toBe(0)
  })
})

describe('buildTripChain pairing', () => {
  it('pairs a stay with the movement before and after it', () => {
    const before = seg({ startMs: at(30, 9), endMs: at(30, 9, 30), activityType: 'IN_PASSENGER_VEHICLE' })
    const after = seg({ startMs: at(30, 11), endMs: at(30, 11, 30), activityType: 'WALKING' })
    const stay = visit({ startMs: at(30, 10), endMs: at(30, 10, 30) })
    // Unsorted input; indices must refer to the caller's arrays.
    const chain = buildTripChain([stay], [after, before], ALL)
    expect(chain.visits).toHaveLength(1)
    expect(chain.visits[0].visitIndex).toBe(0)
    expect(chain.visits[0].incoming?.segmentIndex).toBe(1) // `before`
    expect(chain.visits[0].incoming?.activityType).toBe('IN_PASSENGER_VEHICLE')
    expect(chain.visits[0].outgoing?.segmentIndex).toBe(0) // `after`
    expect(chain.visits[0].outgoing?.activityType).toBe('WALKING')
  })

  it('leaves the incoming side empty for a stay with nothing before it', () => {
    const after = seg({ startMs: at(30, 11), endMs: at(30, 11, 30) })
    const stay = visit({ startMs: at(30, 10), endMs: at(30, 10, 30) })
    const chain = buildTripChain([stay], [after], ALL)
    expect(chain.visits[0].incoming).toBeUndefined()
    expect(chain.visits[0].outgoing?.segmentIndex).toBe(0)
  })

  it('leaves the outgoing side empty for a stay with nothing after it', () => {
    const before = seg({ startMs: at(30, 9), endMs: at(30, 9, 30) })
    const stay = visit({ startMs: at(30, 10), endMs: at(30, 10, 30) })
    const chain = buildTripChain([stay], [before], ALL)
    expect(chain.visits[0].incoming?.segmentIndex).toBe(0)
    expect(chain.visits[0].outgoing).toBeUndefined()
  })

  it('has no adjacent movements when the stay is alone', () => {
    const stay = visit({ startMs: at(30, 10), endMs: at(30, 10, 30) })
    const chain = buildTripChain([stay], [], ALL)
    expect(chain.visits[0].incoming).toBeUndefined()
    expect(chain.visits[0].outgoing).toBeUndefined()
  })

  it('pairs across midnight by absolute time', () => {
    const overnight = seg({ startMs: at(29, 23), endMs: at(30, 1) })
    const morning = seg({ startMs: at(30, 2), endMs: at(30, 2, 30) })
    const stay = visit({ startMs: at(30, 1, 30), endMs: at(30, 1, 50) })
    const chain = buildTripChain([stay], [overnight, morning], ALL)
    expect(chain.visits[0].incoming?.segmentIndex).toBe(0)
    expect(chain.visits[0].outgoing?.segmentIndex).toBe(1)
  })

  it('orders visits by time while preserving their input indices', () => {
    const early = visit({ startMs: at(30, 8), endMs: at(30, 8, 30), name: 'A' })
    const late = visit({ startMs: at(30, 18), endMs: at(30, 18, 30), name: 'B' })
    const chain = buildTripChain([late, early], [], ALL)
    expect(chain.visits.map((n) => n.visit.name)).toEqual(['A', 'B'])
    expect(chain.visits.map((n) => n.visitIndex)).toEqual([1, 0])
  })

  it('sorts a segment before a visit at the same start time (segment is incoming)', () => {
    const same = at(30, 10)
    const movement = seg({ startMs: same, endMs: same + 30 * 60_000, activityType: 'WALKING' })
    const stay = visit({ startMs: same, endMs: same + 60 * 60_000 })
    const chain = buildTripChain([stay], [movement], ALL)
    expect(chain.visits[0].incoming?.segmentIndex).toBe(0)
    expect(chain.visits[0].outgoing).toBeUndefined()
  })
})

describe('buildTripChain durations', () => {
  it('clamps movement and stay durations to the range', () => {
    const range: DateRangeFilter = { startMs: at(30, 10), endMs: at(30, 12) }
    const movement = seg({ startMs: at(30, 9), endMs: at(30, 11), path: [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }] })
    const stay = visit({ startMs: at(30, 9, 30), endMs: at(30, 10, 30) })
    const chain = buildTripChain([stay], [movement], range)
    // movement: 09:00→11:00 clamped to 10:00→11:00 = 1h
    expect(chain.visits[0].incoming?.durationMs).toBe(60 * 60_000)
    // stay: 09:30→10:30 clamped to 10:00→10:30 = 30m
    expect(chain.visits[0].stayDurationMs).toBe(30 * 60_000)
    // distance is the full rendered path (already clipped by prepareTrips upstream)
    expect(chain.visits[0].incoming?.distanceKm).toBeCloseTo(
      haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }),
      6,
    )
  })
})
