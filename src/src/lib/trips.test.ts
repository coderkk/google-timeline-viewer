import { describe, expect, it } from 'vitest'
import type { RawPoint, Segment, TimelineData, Visit } from './types'
import {
  activityColor,
  boundsOf,
  BRIDGE_CAP,
  bridgeGapLabel,
  bridgeLines,
  budgetRoutePoints,
  dayKeyOf,
  endOfDayMs,
  filterRawPoints,
  filterSegments,
  filterVisits,
  fmtDuration,
  fmtRangeLabel,
  legendTypes,
  LIST_LIMIT,
  MARKER_CAP,
  parseInputDate,
  prepareTrips,
  prepareTripsForData,
  RAW_POINT_CAP,
  ROUTE_POINT_CAP,
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
  it('anchors a timestamp to its LOCAL day boundaries (previous UTC-day behavior)', () => {
    // Constructed through the local-timezone constructor on purpose: grouping
    // must follow the local calendar day — the same frame `parseInputDate`
    // selects with. On +08 a 00:30 local timestamp is UTC the day before, and
    // it must still bin to the local day.
    const local = new Date(2026, 7, 7, 0, 30).getTime()
    const midnight = new Date(2026, 7, 7).getTime()
    expect(startOfDayMs(local)).toBe(midnight)
    expect(endOfDayMs(local)).toBe(midnight + DAY - 1)
    expect(toInputDate(startOfDayMs(local))).toBe('2026-08-07')
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

describe('local-timezone day grouping (T13.7)', () => {
  it('bins pre-08:00 local segments on their local calendar day, aligned with the filter', () => {
    // The CEO-flagged 2025-01-30 morning segments (04:00 / 06:00 local, plus
    // a 00:30 edge). Instants built through the local constructor so the test
    // pins behavior in any runner timezone: the UTC day may be 2025-01-29
    // (that is exactly the +08 pipeline), but grouping must say 2025-01-30.
    const early = new Date(2025, 0, 30, 4, 0).getTime()
    expect(dayKeyOf(early)).toBe('2025-01-30')
    expect(startOfDayMs(early)).toBe(parseInputDate('2025-01-30'))

    for (const hour of [0, 4, 6]) {
      const ms = new Date(2025, 0, 30, hour).getTime()
      expect(dayKeyOf(ms)).toBe('2025-01-30')
      expect(startOfDayMs(ms)).toBe(startOfDayMs(early))
    }
  })

  it('keeps late-evening segments on their own (previous) local day', () => {
    const prevEvening = new Date(2025, 0, 29, 22, 0).getTime()
    expect(dayKeyOf(prevEvening)).toBe('2025-01-29')
    expect(startOfDayMs(prevEvening)).toBe(parseInputDate('2025-01-29'))
  })

  it('groups the map highlight by the local calendar day', () => {
    // A visit and a segment that both fall on 2025-01-30 local must share one
    // startOfDayMs boundary even if their UTC instants straddle midnight.
    const visitMs = new Date(2025, 0, 30, 0, 30).getTime()
    const segMs = new Date(2025, 0, 30, 7, 45).getTime()
    expect(startOfDayMs(visitMs)).toBe(startOfDayMs(segMs))
    expect(startOfDayMs(visitMs)).toBe(parseInputDate('2025-01-30'))
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

describe('raw GPS points (rawSignals) in the Trips flow', () => {
  const rawPoint = (lat: number, lng: number, timestampMs: number): RawPoint => ({
    lat,
    lng,
    timestampMs,
  })

  it('filters raw fixes to the selected date range', () => {
    const points = [
      rawPoint(1, 2, Date.UTC(2026, 0, 1)),
      rawPoint(3, 4, Date.UTC(2026, 6, 1)),
    ]
    const out = filterRawPoints(points, {
      startMs: Date.UTC(2026, 5, 1),
      endMs: Date.UTC(2026, 6, 30),
    })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ lat: 3, lng: 4 })
  })

  it('carries the filtered fixes into the prepared payload', () => {
    const points = Array.from({ length: 30 }, (_, i) =>
      rawPoint(0.1, 0.2 + i * 0.001, Date.UTC(2026, 6, 1, 0, i * 2)),
    )
    const prepared = prepareTrips(
      [],
      [],
      { startMs: Date.UTC(2026, 6, 1), endMs: Date.UTC(2026, 6, 2) },
      points,
    )
    expect(prepared.points).toHaveLength(30)
    expect(prepared.downsampled).toBe(false)
  })

  it('decimates raw fixes to RAW_POINT_CAP and flags downsampled', () => {
    const many = Array.from({ length: RAW_POINT_CAP + 500 }, (_, i) =>
      rawPoint(0.1, 0.2 + i * 1e-5, i),
    )
    const prepared = prepareTrips([], [], { startMs: null, endMs: null }, many)
    expect(prepared.points).toHaveLength(RAW_POINT_CAP)
    expect(prepared.downsampled).toBe(true)
  })

  it('excludes raw fixes outside the range', () => {
    const points = [rawPoint(1, 2, Date.UTC(2026, 0, 1))]
    const prepared = prepareTrips([], [], { startMs: Date.UTC(2026, 6, 1), endMs: null }, points)
    expect(prepared.points).toHaveLength(0)
  })
})

describe('TripsPage wiring (prepareTripsForData)', () => {
  const rawPoint = (lat: number, lng: number, timestampMs: number): RawPoint => ({
    lat,
    lng,
    timestampMs,
  })

  it('carries data.points into the payload the map and summary layers consume', () => {
    const range: DateRangeFilter = {
      startMs: Date.UTC(2026, 0, 1),
      endMs: Date.UTC(2026, 0, 31),
    }
    const data: TimelineData = {
      segments: [segment({ id: 's', startMs: Date.UTC(2026, 0, 1, 1), endMs: Date.UTC(2026, 0, 1, 2) })],
      visits: [visit({ id: 'v', startMs: Date.UTC(2026, 0, 1, 2), endMs: Date.UTC(2026, 0, 1, 3) })],
      points: [
        rawPoint(25.0, 121.5, Date.UTC(2026, 0, 1, 0, 5)),
        rawPoint(24.0, 120.5, Date.UTC(2026, 0, 2, 0, 5)),
        rawPoint(23.0, 119.5, Date.UTC(2026, 6, 1)), // outside the range
      ],
      meta: { fileCount: 1, pointCount: 3, visitCount: 1, segmentCount: 1, timeRange: { minMs: Date.UTC(2026, 0, 1), maxMs: Date.UTC(2026, 6, 1) } },
    }

    const prepared = prepareTripsForData(data, range)

    // The exact contract the page renders from: TripMap receives
    // `rawPoints={prepared.points}` and the summary shows "N 原始点" only when
    // `prepared.points.length > 0`. If the wiring ever drops `data.points`
    // (regression: S1), `points` is empty here and this test fails.
    expect(prepared.points).toHaveLength(2)
    expect(prepared.points[0]).toMatchObject({ lat: 25.0, lng: 121.5 })
    expect(prepared.points[1].lng).toBe(120.5)
    expect(prepared.segments).toHaveLength(1)
    expect(prepared.visits).toHaveLength(1)
  })
})

describe('timeline bridges (T14)', () => {
  it('sorts in-range segments into timeline order across midnight', () => {
    // Handed in document order (late-evening first); one segment is outside the
    // range and must be dropped. 23:50 local one day and 00:10 local the next
    // must still order by absolute ms — local midnight is not a sort boundary.
    const lateNight = segment({
      id: 'late',
      startMs: new Date(2025, 0, 29, 23, 50).getTime(),
      endMs: new Date(2025, 0, 30, 0, 5).getTime(),
    })
    const afterMidnight = segment({
      id: 'early',
      startMs: new Date(2025, 0, 30, 0, 10).getTime(),
      endMs: new Date(2025, 0, 30, 0, 40).getTime(),
    })
    const outOfRange = segment({ id: 'june', startMs: Date.UTC(2025, 5, 1), endMs: Date.UTC(2025, 5, 2) })
    const prepared = prepareTrips([outOfRange, lateNight, afterMidnight], [], {
      startMs: Date.UTC(2025, 0, 28),
      endMs: Date.UTC(2025, 0, 31),
    })
    expect(prepared.segments.map((s) => s.startMs)).toEqual([
      lateNight.startMs,
      afterMidnight.startMs,
    ])
    for (let i = 1; i < prepared.segments.length; i++) {
      expect(prepared.segments[i].startMs).toBeGreaterThanOrEqual(prepared.segments[i - 1].startMs)
    }
  })

  it('links consecutive segments with {from, to, gapMs} bridge metadata', () => {
    const a = segment({
      id: 'a',
      startMs: Date.UTC(2026, 6, 1, 8),
      endMs: Date.UTC(2026, 6, 1, 8, 30),
      start: point(25.0, 121.5),
      end: point(25.05, 121.55),
    })
    const b = segment({
      id: 'b',
      startMs: Date.UTC(2026, 6, 1, 8, 42),
      endMs: Date.UTC(2026, 6, 1, 9),
      start: point(25.1, 121.62),
      end: point(25.2, 121.7),
    })
    const bridges = bridgeLines([a, b])
    expect(bridges).toHaveLength(1)
    expect(bridges[0]).toEqual({
      fromIndex: 0,
      toIndex: 1,
      from: { lat: 25.05, lng: 121.55 },
      to: { lat: 25.1, lng: 121.62 },
      fromMs: Date.UTC(2026, 6, 1, 8, 30),
      toMs: Date.UTC(2026, 6, 1, 8, 42),
      gapMs: 12 * 60 * 1000,
    })
  })

  it('skips time-overlapping and temporally contiguous pairs', () => {
    const overlapA = segment({ id: 'o-a', startMs: Date.UTC(2026, 6, 1, 8), endMs: Date.UTC(2026, 6, 1, 10) })
    const overlapB = segment({ id: 'o-b', startMs: Date.UTC(2026, 6, 1, 9), endMs: Date.UTC(2026, 6, 1, 11) })
    const contiguous = segment({ id: 'c', startMs: Date.UTC(2026, 6, 1, 11), endMs: Date.UTC(2026, 6, 1, 12) })
    expect(bridgeLines([overlapA, overlapB])).toEqual([])
    expect(bridgeLines([overlapB, contiguous])).toEqual([])
  })

  it('skips a bridge whose endpoints coincide (degenerate zero-length)', () => {
    const a = segment({
      id: 'a',
      startMs: Date.UTC(2026, 6, 1, 8),
      endMs: Date.UTC(2026, 6, 1, 8, 30),
      start: point(25.0, 121.5),
      end: point(25.05, 121.55),
    })
    // Ends exactly where the next leg begins: nothing to draw.
    const b = segment({
      id: 'b',
      startMs: Date.UTC(2026, 6, 1, 8, 35),
      endMs: Date.UTC(2026, 6, 1, 9),
      start: point(25.05, 121.55),
      end: point(25.1, 121.62),
    })
    expect(bridgeLines([a, b])).toEqual([])
  })

  it('labels bridges honestly: short gaps are just "衔接", real gaps carry "衔接 +N …"', () => {
    expect(bridgeGapLabel(30_000)).toBe('衔接')
    // Exactly the annotation threshold (60s) is included in the annotated
    // range: `< BRIDGE_ANNOTATE_MIN_MS` gates the plain "衔接" tag.
    expect(bridgeGapLabel(60_000)).toBe('衔接 +1 分钟')
    expect(bridgeGapLabel(12 * 60_000)).toBe('衔接 +12 分钟')
    expect(bridgeGapLabel(2 * 3_600_000 + 5 * 60_000)).toBe('衔接 +2 小时 5 分')
    expect(bridgeGapLabel(2 * 86_400_000)).toBe('衔接 +2 天')
  })

  it('keeps bridge geometry inside the render budget on span-all views', () => {
    // More consecutive legs than the cap: bridges must be evenly decimated.
    const many = Array.from({ length: BRIDGE_CAP + 500 }, (_, i) =>
      segment({
        id: `s${i}`,
        startMs: Date.UTC(2026, 0, 1) + i * 3_600_000,
        endMs: Date.UTC(2026, 0, 1) + i * 3_600_000 + 1_800_000,
        start: point(1 + i * 0.001, 100),
        end: point(1 + i * 0.001 + 0.0005, 100.001),
      }),
    )
    const bridges = bridgeLines(many)
    expect(bridges.length).toBe(BRIDGE_CAP)
    // stride sampling keeps both ends of the timeline.
    expect(bridges[0].fromIndex).toBe(0)
    expect(bridges[bridges.length - 1].toIndex).toBe(many.length - 1)
    // 2 vertices per bridge, always bounded: total bridge points stay ≤ 2×cap.
    expect(bridges.length * 2).toBeLessThanOrEqual(2 * BRIDGE_CAP)
  })

  it('a multi-leg day yields one continuous sorted trace with full bridging', () => {
    const leg1 = segment({
      id: 'leg1',
      startMs: Date.UTC(2026, 6, 1, 7),
      endMs: Date.UTC(2026, 6, 1, 7, 20),
      start: point(25.0, 121.5),
      end: point(25.05, 121.53),
    })
    const leg2 = segment({
      id: 'leg2',
      startMs: Date.UTC(2026, 6, 1, 7, 35),
      endMs: Date.UTC(2026, 6, 1, 8),
      start: point(25.06, 121.55),
      end: point(25.1, 121.6),
    })
    const leg3 = segment({
      id: 'leg3',
      startMs: Date.UTC(2026, 6, 1, 8, 5),
      endMs: Date.UTC(2026, 6, 1, 8, 25),
      start: point(25.11, 121.61),
      end: point(25.2, 121.7),
    })
    const prepared = prepareTrips([leg2, leg1, leg3], [], { startMs: null, endMs: null })
    expect(prepared.segments.map((s) => s.startMs)).toEqual([leg1.startMs, leg2.startMs, leg3.startMs])
    const bridges = bridgeLines(prepared.segments)
    expect(bridges).toHaveLength(2)
    expect(bridges[0].gapMs).toBe(15 * 60_000)
    expect(bridges[1].gapMs).toBe(5 * 60_000)
    // Bridges derive from segments only — raw fixes never merge into the drawn
    // trace (they stay the faint toggleable grey trail).
    const withPoints = prepareTrips([leg1, leg2, leg3], [], { startMs: null, endMs: null }, [
      { lat: 9, lng: 90, timestampMs: Date.UTC(2026, 6, 1, 7, 30) },
    ])
    expect(bridgeLines(withPoints.segments)).toHaveLength(2)
  })
})

describe('budgetRoutePoints', () => {
  it('flattens every path point under the cap, colored by activity', () => {
    const segA = segment({
      id: 'a',
      activityType: 'WALKING',
      path: [point(1, 1), point(2, 2), point(3, 3)],
    })
    const segB = segment({ id: 'b', activityType: 'IN_BUS', path: [point(4, 4), point(5, 5)] })
    const out = budgetRoutePoints([segA, segB], 100)
    expect(out).toHaveLength(5)
    expect(out[0]).toEqual({ lat: 1, lng: 1, color: activityColor('WALKING') })
    expect(out[3]).toEqual({ lat: 4, lng: 4, color: activityColor('IN_BUS') })
  })

  it('stride-samples proportionally and keeps both ends when the cap is exceeded', () => {
    const big = segment({
      id: 'big',
      path: Array.from({ length: ROUTE_POINT_CAP + 200 }, (_, i) => point(0.05 + i * 0.0001, 103.8)),
    })
    const out = budgetRoutePoints([big], ROUTE_POINT_CAP)
    expect(out.length).toBe(ROUTE_POINT_CAP)
    expect(out[0].lat).toBe(0.05)
    expect(out[out.length - 1].lat).toBe(big.path[big.path.length - 1].lat)
  })

  it('caps the flattened total across many small segments', () => {
    const segCount = 3000
    const segs = Array.from({ length: segCount }, (_, i) =>
      segment({
        id: `s${i}`,
        activityType: 'WALKING',
        path: [point(i, i), point(i + 1, i + 1)],
      }),
    )
    expect(segs.flatMap((s) => s.path).length).toBe(segCount * 2)
    expect(segCount * 2).toBeGreaterThan(ROUTE_POINT_CAP)
    const out = budgetRoutePoints(segs, ROUTE_POINT_CAP)
    expect(out.length).toBeLessThanOrEqual(ROUTE_POINT_CAP)
    expect(out[0]).toEqual({ lat: 0, lng: 0, color: activityColor('WALKING') })
    expect(out[out.length - 1].lat).toBe(segCount)
  })

  it('returns an empty list with no segments', () => {
    expect(budgetRoutePoints([], ROUTE_POINT_CAP)).toEqual([])
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