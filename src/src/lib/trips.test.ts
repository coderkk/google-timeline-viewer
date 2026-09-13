import { describe, expect, it } from 'vitest'
import type { Segment, Visit } from './types'
import {
  activityColor,
  boundsOf,
  endOfDayMs,
  filterSegments,
  filterVisits,
  fmtDuration,
  fmtRangeLabel,
  legendTypes,
  LIST_LIMIT,
  MARKER_CAP,
  prepareTrips,
  segmentsOnSameDay,
  segmentsOverlappingVisit,
  simplifyPath,
  startOfDayMs,
  toInputDate,
  type DateRangeFilter,
} from './trips'

function point(lat: number, lng: number) {
  return { lat, lng }
}

function segment(over: Partial<Segment> & { id: string }): Segment {
  const start = over.start ?? point(25, 121.5)
  const end = over.end ?? point(25.1, 121.6)
  return {
    activityType: over.activityType,
    start,
    end,
    startMs: over.startMs ?? 0,
    endMs: over.endMs ?? 1,
    path: over.path ?? [start, end],
  }
}

function visit(over: Partial<Visit> & { id: string }): Visit {
  return {
    name: `v-${over.id}`,
    startMs: over.startMs ?? 0,
    endMs: over.endMs ?? 1,
    lat: over.lat ?? 25.05,
    lng: over.lng ?? 121.55,
  }
}

const DAY = 24 * 60 * 60 * 1000

describe('date helpers', () => {
  it('anchors a timestamp to its UTC day boundaries', () => {
    const ms = Date.UTC(2026, 7, 7, 10, 30)
    expect(startOfDayMs(ms)).toBe(Date.UTC(2026, 7, 7))
    expect(endOfDayMs(ms)).toBe(Date.UTC(2026, 7, 7) + DAY - 1)
  })

  it('formats inputs and durations', () => {
    expect(toInputDate(Date.UTC(2026, 6, 3))).toBe('2026-07-03')
    expect(fmtDuration(5 * 60 * 60 * 1000 + 5 * 60 * 1000)).toBe('5h 5m')
    expect(fmtDuration(45 * 60 * 1000)).toBe('45m')
    expect(fmtDuration(30_000)).toBe('<1m')
  })

  it('renders an open-ended range label', () => {
    expect(fmtRangeLabel({ startMs: null, endMs: null })).toBe('不限 ~ 不限')
    expect(fmtRangeLabel({ startMs: Date.UTC(2026, 6, 20), endMs: null })).toBe('2026-07-20 ~ 不限')
  })
})

describe('filtering', () => {
  const segments = [
    segment({ id: 'a', startMs: Date.UTC(2026, 0, 1), endMs: Date.UTC(2026, 0, 2) }),
    segment({ id: 'b', startMs: Date.UTC(2026, 6, 1), endMs: Date.UTC(2026, 6, 2) }),
  ]
  const visits = [
    visit({ id: 'x', startMs: Date.UTC(2025, 0, 1), endMs: Date.UTC(2025, 0, 1, 2) }),
    visit({ id: 'y', startMs: Date.UTC(2026, 6, 1), endMs: Date.UTC(2026, 6, 2) }),
  ]

  it('keeps everything when the range is unrestricted', () => {
    expect(filterSegments(segments, { startMs: null, endMs: null })).toHaveLength(2)
    expect(filterVisits(visits, { startMs: null, endMs: null })).toHaveLength(2)
  })

  it('supports one-sided ranges', () => {
    const onlyFrom = filterSegments(segments, { startMs: Date.UTC(2026, 5, 1), endMs: null })
    expect(onlyFrom).toHaveLength(1)
    expect(onlyFrom[0]).toMatchObject({ startMs: Date.UTC(2026, 6, 1) })
  })

  it('keeps records that merely overlap the window (not fully inside)', () => {
    const local = [visit({ id: 'z', startMs: Date.UTC(2025, 11, 15), endMs: Date.UTC(2025, 11, 25) })]
    const win: DateRangeFilter = { startMs: Date.UTC(2025, 11, 20), endMs: Date.UTC(2025, 11, 31) }
    expect(filterVisits(local, win)).toHaveLength(1)
  })
})

describe('boundsOf', () => {
  it('returns null when there is no geometry', () => {
    expect(boundsOf([], [])).toBeNull()
  })

  it('covers segment path points and visit coords', () => {
    const segments = [segment({ id: 'a', path: [point(1, 2), point(10, 20)], start: point(1, 2), end: point(10, 20) })]
    const visits = [visit({ id: 'v', lat: 5, lng: 15 })]
    expect(boundsOf(segments, visits)).toEqual({ minLat: 1, minLng: 2, maxLat: 10, maxLng: 20 })
  })
})

describe('simplifyPath / caps', () => {
  it('returns the original array when under the limit', () => {
    const pts = [point(0, 0), point(1, 1), point(2, 2)]
    expect(simplifyPath(pts, 1500)).toBe(pts)
  })

  it('keeps endpoints and reduces collinear paths', () => {
    const pts = Array.from({ length: 100 }, (_, i) => point(i * 0.001, i * 0.001))
    const out = simplifyPath(pts, 10)
    expect(out.length).toBeLessThanOrEqual(10)
    expect(out[0]).toEqual(pts[0])
    expect(out[out.length - 1]).toEqual(pts[pts.length - 1])
  })

  it('decimates to the global budgets and flags downsampled', () => {
    const many = segment({
      id: 'big',
      path: Array.from({ length: 1000 }, (_, i) => point(0.05 + i * 0.0001, 103.8)),
    })
    const visits = Array.from({ length: MARKER_CAP + 100 }, (_, i) => visit({ id: String(i), lat: 1 + i * 0.01 }))
    const prepared = prepareTrips([many], visits, { startMs: null, endMs: null })
    expect(prepared.markers.length).toBeLessThan(visits.length)
    expect(prepared.downsampled).toBe(true)
    expect(prepared.segments[0].path.length).toBeLessThanOrEqual(1500)
  })

  it('sorts the sidebar list newest-first but keeps every stopped visit', () => {
    const visits = [
      visit({ id: 'old', startMs: Date.UTC(2026, 0, 1) }),
      visit({ id: 'new', startMs: Date.UTC(2026, 0, 3) }),
      visit({ id: 'mid', startMs: Date.UTC(2026, 0, 2) }),
    ]
    const prepared = prepareTrips([], visits, { startMs: null, endMs: null })
    expect(prepared.visits.map((v) => v.startMs)).toEqual([
      Date.UTC(2026, 0, 3),
      Date.UTC(2026, 0, 2),
      Date.UTC(2026, 0, 1),
    ])
    expect(prepared.visits).toHaveLength(3)
    expect(LIST_LIMIT).toBeGreaterThan(0)
  })
})

describe('activity styling', () => {
  it('maps at least three transport modes to distinct colors', () => {
    const colors = new Set([
      activityColor('IN_PASSENGER_VEHICLE'),
      activityColor('WALKING'),
      activityColor('IN_FLIGHT'),
      activityColor('CYCLING'),
    ])
    expect(colors.size).toBeGreaterThanOrEqual(3)
  })

  it('falls back to a neutral color for unknown types', () => {
    expect(activityColor('UNKNOWN_ACTIVITY_TYPE')).toBe(activityColor(undefined))
  })

  it('builds a legend from the visible segments', () => {
    const segments = [
      segment({ id: 'a', activityType: 'WALKING' }),
      segment({ id: 'b', activityType: 'IN_PASSENGER_VEHICLE' }),
      segment({ id: 'c', activityType: 'WALKING' }),
    ]
    const legend = legendTypes(segments)
    expect(legend.map((l) => l.type)).toEqual(['WALKING', 'IN_PASSENGER_VEHICLE'])
  })
})

describe('stop <-> segment linkage', () => {
  const segs = [
    segment({ id: 'arrive', startMs: Date.UTC(2026, 0, 1, 8), endMs: Date.UTC(2026, 0, 1, 9) }),
    segment({ id: 'nextDay', startMs: Date.UTC(2026, 0, 2, 8), endMs: Date.UTC(2026, 0, 2, 9) }),
    segment({ id: 'far', startMs: Date.UTC(2026, 5, 1, 8), endMs: Date.UTC(2026, 5, 1, 9) }),
  ]

  it('finds segments overlapping the visit window', () => {
    const v = visit({ id: 'stay', startMs: Date.UTC(2026, 0, 1, 9), endMs: Date.UTC(2026, 0, 1, 12) })
    const hit = segmentsOverlappingVisit(v, segs)
    expect(hit).toHaveLength(1)
    expect(hit[0]).toMatchObject({ startMs: Date.UTC(2026, 0, 1, 8) })
  })

  it('finds segments on the same calendar day', () => {
    const v = visit({ id: 'stay', startMs: Date.UTC(2026, 0, 1, 9), endMs: Date.UTC(2026, 0, 1, 12) })
    const hit = segmentsOnSameDay(v, segs)
    expect(hit).toHaveLength(1)
    expect(hit[0].startMs).toBe(Date.UTC(2026, 0, 1, 8))
  })
})