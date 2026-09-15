import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { RawPoint, Segment, TimelineData, Visit } from './types'
import {
  activityColor,
  boundsOf,
  BRIDGE_CAP,
  bridgeGapLabel,
  bridgeLines,
  budgetRoutePoints,
  buildTimelineRoute,
  clipSegmentPath,
  dayKeyOf,
  endOfDayMs,
  filterRawPoints,
  filterSegments,
  filterVisits,
  fmtDuration,
  fmtRangeLabel,
  GLOBAL_PATH_POINT_CAP,
  hasPath,
  hasRenderablePath,
  legendTypes,
  lastNDaysRange,
  LIST_LIMIT,
  MARKER_CAP,
  MIN_PATH_LEN,
  MIN_POLYLINE_LEN,
  parseInputDate,
  prepareTimeline,
  prepareTrips,
  prepareTripsForData,
  RAW_POINT_CAP,
  ROUTE_POINT_CAP,
  segmentsOnSameDay,
  segmentsOverlappingVisit,
  segmentPathOrEndpoints,
  simplifyPath,
  startOfDayMs,
  toInputDate,
  type DateRangeFilter,
} from './trips'
import { parseTimelineFile } from './parse'

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

describe('fallback threshold helpers (T31)', () => {
  it('exposes MIN_PATH_LEN = 1 and MIN_POLYLINE_LEN = 2', () => {
    // A-class geometry source (`> 0`) and B-class drawability gate (`>= 2`)
    // are deliberately distinct constants — the fix for the T20-25 / T27
    // `> 0` vs `>= 2` divergence is that the thresholds now live in one place.
    expect(MIN_PATH_LEN).toBe(1)
    expect(MIN_POLYLINE_LEN).toBe(2)
  })

  it('hasPath: a segment carries geometry once it holds ≥ MIN_PATH_LEN vertices', () => {
    expect(hasPath(segment({ id: 'empty', path: [] }))).toBe(false)
    expect(hasPath(segment({ id: 'one', path: [point(1, 2)] }))).toBe(true)
    expect(hasPath(segment({ id: 'many', path: [point(1, 2), point(3, 4)] }))).toBe(true)
  })

  it('segmentPathOrEndpoints: path-less falls back to [start, end], 1-point path is kept', () => {
    const start = point(1, 2)
    const end = point(3, 4)
    const empty = segment({ id: 'empty', start, end, path: [] })
    expect(segmentPathOrEndpoints(empty)).toEqual([start, end])

    const single = segment({ id: 'one', start, end, path: [point(9, 9)] })
    // A 1-vertex path stays the geometry source — do NOT fall back to the
    // unclipped [start, end] (T22/S2 single in-range vertex case).
    expect(segmentPathOrEndpoints(single)).toEqual([point(9, 9)])

    const multi = segment({ id: 'multi', start, end, path: [point(9, 9), point(8, 8)] })
    expect(segmentPathOrEndpoints(multi)).toEqual([point(9, 9), point(8, 8)])
  })

  it('hasRenderablePath: only ≥ MIN_POLYLINE_LEN vertices form a drawable line', () => {
    expect(hasRenderablePath([])).toBe(false)
    expect(hasRenderablePath([point(1, 2)])).toBe(false)
    expect(hasRenderablePath([point(1, 2), point(3, 4)])).toBe(true)
    expect(hasRenderablePath([point(1, 2), point(3, 4), point(5, 6)])).toBe(true)
  })

  it('segmentPathOrEndpoints returns the path array by reference (no defensive copy)', () => {
    const path = [point(1, 2)]
    const s = segment({ id: 'ref', path })
    // Render call sites rely on the same array (e.g. bridge endpoint lookups);
    // this pins that the helper never copies.
    expect(segmentPathOrEndpoints(s)).toBe(path)
  })
})

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

describe('lastNDaysRange', () => {
  // Mid-day local timestamp so day anchoring (+08 pipeline) is exercised.
  const sample = new Date(2026, 7, 15, 14, 5).getTime() // 2026-08-15 14:05 local

  it('a 1-day window is exactly the local day containing maxMs (end included)', () => {
    const end = endOfDayMs(sample)
    expect(lastNDaysRange(sample, 1)).toEqual({ startMs: end - DAY + 1, endMs: end })
    expect(lastNDaysRange(sample, 1).startMs).toBe(startOfDayMs(sample))
  })

  it('a 30-day window ends at maxMs day and spans exactly 30 local days', () => {
    const end = endOfDayMs(sample)
    const range = lastNDaysRange(sample, 30)
    if (range.startMs === null || range.endMs === null) {
      throw new Error('finite maxMs must produce a finite range')
    }
    expect(range.endMs).toBe(end)
    expect(range.startMs).toBe(end - 30 * DAY + 1)
    expect(range.endMs - range.startMs).toBe(30 * DAY - 1)
  })

  it('matches the "last 30 days / last year" quick-preset formula exactly', () => {
    const endAnchor = endOfDayMs(sample)
    expect(lastNDaysRange(sample, 30)).toEqual({ startMs: endAnchor - 30 * DAY + 1, endMs: endAnchor })
    expect(lastNDaysRange(sample, 365)).toEqual({ startMs: endAnchor - 365 * DAY + 1, endMs: endAnchor })
  })

  it('falls back to the open range when maxMs is not finite', () => {
    expect(lastNDaysRange(NaN, 30)).toEqual({ startMs: null, endMs: null })
    expect(lastNDaysRange(Infinity, 30)).toEqual({ startMs: null, endMs: null })
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
    // Legs shown like stitched traces (T13.2/T13.3): the polyline `path`
    // endpoints deliberately differ from the semantic `start`/`end` — the
    // bridge must attach to the VERTICES THE MAP DRAWS, not the semantic ones.
    const a = segment({
      id: 'a',
      startMs: Date.UTC(2026, 6, 1, 8),
      endMs: Date.UTC(2026, 6, 1, 8, 30),
      start: point(25.0, 121.5),
      end: point(25.05, 121.55),
      path: [point(25.01, 121.51), point(25.02, 121.52), point(25.04, 121.54)],
    })
    const b = segment({
      id: 'b',
      startMs: Date.UTC(2026, 6, 1, 8, 42),
      endMs: Date.UTC(2026, 6, 1, 9),
      start: point(25.1, 121.62),
      end: point(25.2, 121.7),
      path: [point(25.09, 121.61), point(25.12, 121.63), point(25.15, 121.66)],
    })
    const bridges = bridgeLines([a, b])
    expect(bridges).toHaveLength(1)
    // from = last drawn vertex of the earlier polyline; to = first drawn
    // vertex of the later one — even though a.end ≠ a.path[-1] etc.
    expect(bridges[0]).toEqual({
      fromIndex: 0,
      toIndex: 1,
      from: { lat: 25.04, lng: 121.54 },
      to: { lat: 25.09, lng: 121.61 },
      fromMs: Date.UTC(2026, 6, 1, 8, 30),
      toMs: Date.UTC(2026, 6, 1, 8, 42),
      gapMs: 12 * 60 * 1000,
    })
  })

  it('hugs every drawn polyline endpoint when paths do not match start/end', () => {
    const legs = [
      segment({
        id: 'l1',
        startMs: Date.UTC(2026, 6, 1, 7),
        endMs: Date.UTC(2026, 6, 1, 7, 20),
        start: point(25.0, 121.5),
        end: point(25.05, 121.53),
        path: [point(25.01, 121.51), point(25.04, 121.52)],
      }),
      segment({
        id: 'l2',
        startMs: Date.UTC(2026, 6, 1, 7, 35),
        endMs: Date.UTC(2026, 6, 1, 8),
        start: point(25.1, 121.6),
        end: point(25.2, 121.7),
        path: [point(25.06, 121.56), point(25.09, 121.59), point(25.12, 121.63)],
      }),
      segment({
        id: 'l3',
        startMs: Date.UTC(2026, 6, 1, 8, 5),
        endMs: Date.UTC(2026, 6, 1, 8, 25),
        start: point(25.3, 121.8),
        end: point(25.4, 121.9),
        path: [point(25.13, 121.64), point(25.16, 121.67)],
      }),
    ]
    const bridges = bridgeLines(legs)
    expect(bridges).toHaveLength(2)
    for (const bridge of bridges) {
      const prev = legs[bridge.fromIndex]
      const cur = legs[bridge.toIndex]
      // Bridge knots sit EXACTLY on the polyline vertices TripMap draws, so no
      // km-scale visual break remains between bridge and either real trace.
      expect(bridge.from.lat).toBe(prev.path[prev.path.length - 1].lat)
      expect(bridge.from.lng).toBe(prev.path[prev.path.length - 1].lng)
      expect(bridge.to.lat).toBe(cur.path[0].lat)
      expect(bridge.to.lng).toBe(cur.path[0].lng)
    }
  })

  it('bridges time-overlapping and temporally contiguous pairs even when FAR apart (T14.3 跟時間連)', () => {
    // Parallel records overlapping the same window or contiguous in time are
    // bridged regardless of distance — the "跟時間連" contract bridges EVERY
    // time-adjacent pair. Visual endpoints here are ~11 km apart (town-scale).
    const overlapA = segment({ id: 'o-a', startMs: Date.UTC(2026, 6, 1, 8), endMs: Date.UTC(2026, 6, 1, 10) })
    const overlapB = segment({ id: 'o-b', startMs: Date.UTC(2026, 6, 1, 9), endMs: Date.UTC(2026, 6, 1, 11) })
    const contiguous = segment({ id: 'c', startMs: Date.UTC(2026, 6, 1, 11), endMs: Date.UTC(2026, 6, 1, 12) })
    const bridges = bridgeLines([overlapA, overlapB, contiguous])
    expect(bridges).toHaveLength(2)
    // overlapA→overlapB windows overlap; overlapB→contiguous are contiguous.
    expect(bridges[0].gapMs).toBeLessThan(0)
    expect(bridges[1].gapMs).toBe(0)
    expect(bridges.map((b) => b.fromIndex + '->' + b.toIndex)).toEqual(['0->1', '1->2'])
  })

  it('bridges time-overlapping legs whose endpoints are CLOSE (a walking-distance transfer)', () => {
    // Driving leg ends 08:31, walking (sub)leg starts 08:25 — windows overlap
    // by 6 minutes (GPS granularity). The transfer point is a ~70 m walk away.
    // Pin the bridge metadata contract: negative gapMs kept intact, label is
    // the plain "衔接" (never a negative duration), knots hug drawn polylines.
    const drive = segment({
      id: 'drive',
      activityType: 'IN_PASSENGER_VEHICLE',
      startMs: Date.UTC(2026, 6, 1, 8, 0),
      endMs: Date.UTC(2026, 6, 1, 8, 31),
      start: point(25.0, 121.5),
      end: point(25.045, 121.548),
      path: [point(25.01, 121.51), point(25.02, 121.52), point(25.045, 121.548)],
    })
    const walk = segment({
      id: 'walk',
      activityType: 'WALKING',
      startMs: Date.UTC(2026, 6, 1, 8, 25),
      endMs: Date.UTC(2026, 6, 1, 8, 45),
      start: point(25.0456, 121.5484),
      end: point(25.05, 121.55),
      path: [point(25.0456, 121.5484), point(25.046, 121.5486)],
    })
    const bridges = bridgeLines([drive, walk])
    expect(bridges).toHaveLength(1)
    const b = bridges[0]
    // gapMs keeps the real (negative) overlap; the label must render "衔接",
    // never a negative duration.
    expect(b.gapMs).toBe(Date.UTC(2026, 6, 1, 8, 25) - Date.UTC(2026, 6, 1, 8, 31))
    expect(b.gapMs).toBeLessThan(0)
    expect(bridgeGapLabel(b.gapMs)).toBe('衔接')
    // Bridge hugs the drawn polyline endpoints of both legs.
    expect(b.from).toEqual({ lat: 25.045, lng: 121.548 })
    expect(b.to).toEqual({ lat: 25.0456, lng: 121.5484 })
  })

  it('bridges time-overlapping legs even when tens of km apart (T14.2 distance gate revoked in T14.3)', () => {
    // ~60 km apart: the old BRIDGE_OVERLAP_MAX_M gate would have dropped this
    // pair, but the "跟時間連" contract bridges every time-adjacent pair. This
    // is the exact user-reported case (驾车 13:54→15:00 alongside a coarse 移動
    // 14:00→16:00 segment a whole city away) that T14.2 broke and T14.3 fixes.
    const a = segment({
      id: 'a',
      activityType: 'IN_PASSENGER_VEHICLE',
      startMs: Date.UTC(2026, 6, 1, 9, 0),
      endMs: Date.UTC(2026, 6, 1, 9, 30),
      start: point(25.0, 121.5),
      end: point(25.01, 121.51),
      path: [point(25.0, 121.5), point(25.01, 121.51)],
    })
    const b = segment({
      id: 'b',
      startMs: Date.UTC(2026, 6, 1, 9, 10),
      endMs: Date.UTC(2026, 6, 1, 9, 40),
      start: point(25.5, 122.0),
      end: point(25.55, 122.05),
      path: [point(25.5, 122.0), point(25.55, 122.05)],
    })
    const bridges = bridgeLines([a, b])
    expect(bridges).toHaveLength(1)
    expect(bridges[0].gapMs).toBeLessThan(0)
    expect(bridges[0].fromIndex).toBe(0)
    expect(bridges[0].toIndex).toBe(1)
  })

  it('regression: the 2025-01-30 user report ("13:45 後沒有連去移動") now bridges one continuous line (T14.3 跟時間連)', () => {
    // This is the exact case that made the CEO revoke T14.2's distance gate:
    // a coarse 移動 segment (14:00→16:00) that overlaps both a 驾车 13:54→15:00
    // leg and a 驾车 15:15→16:35 leg while its endpoints sit tens of km away.
    // Under "跟時間連" every time-adjacent pair is bridged, so the four legs
    // render as one unbroken dashed sequence. Synthetic — no livedata needed.
    const driveA = segment({
      id: 'driveA',
      activityType: 'IN_PASSENGER_VEHICLE',
      startMs: Date.UTC(2026, 6, 1, 12, 42),
      endMs: Date.UTC(2026, 6, 1, 13, 45),
      start: point(24.98, 121.48),
      end: point(25.0, 121.5),
    })
    const driveB = segment({
      id: 'driveB',
      activityType: 'IN_PASSENGER_VEHICLE',
      startMs: Date.UTC(2026, 6, 1, 13, 54),
      endMs: Date.UTC(2026, 6, 1, 15, 0),
      start: point(25.002, 121.502),
      end: point(25.05, 121.55),
    })
    const coarseMove = segment({
      id: 'coarseMove', // 移動: no activityType
      startMs: Date.UTC(2026, 6, 1, 14, 0),
      endMs: Date.UTC(2026, 6, 1, 16, 0),
      start: point(25.5, 122.0), // ~60 km from driveB's end — far-overlap pair
      end: point(25.55, 122.05),
    })
    const driveD = segment({
      id: 'driveD',
      activityType: 'IN_PASSENGER_VEHICLE',
      startMs: Date.UTC(2026, 6, 1, 15, 15),
      endMs: Date.UTC(2026, 6, 1, 16, 35),
      start: point(25.8, 122.4), // ~48 km from coarseMove's end
      end: point(25.85, 122.45),
    })
    const bridges = bridgeLines([driveA, driveB, coarseMove, driveD])
    expect(bridges).toHaveLength(3)
    expect(bridges.map((b) => `${b.fromIndex}->${b.toIndex}`)).toEqual(['0->1', '1->2', '2->3'])
    // driveA→driveB: +9 min real forward gap; the other two overlap far apart.
    expect(bridges[0].gapMs).toBe(9 * 60_000)
    expect(bridges[1].gapMs).toBe(-3_600_000)
    expect(bridges[2].gapMs).toBe(-2_700_000)
    expect(bridgeGapLabel(bridges[0].gapMs)).toBe('衔接 +9 分钟')
    expect(bridgeGapLabel(bridges[1].gapMs)).toBe('衔接')
    expect(bridgeGapLabel(bridges[2].gapMs)).toBe('衔接')
    // Every bridge knots exactly onto the drawn polylines of both neighbours.
    expect(bridges[0].from).toEqual({ lat: 25.0, lng: 121.5 })
    expect(bridges[0].to).toEqual({ lat: 25.002, lng: 121.502 })
    expect(bridges[1].to).toEqual({ lat: 25.5, lng: 122.0 })
    expect(bridges[2].from).toEqual({ lat: 25.55, lng: 122.05 })
    expect(bridges[2].to).toEqual({ lat: 25.8, lng: 122.4 })
  })

  it('skips a bridge whose drawn polyline endpoints coincide (degenerate zero-length)', () => {
    const a = segment({
      id: 'a',
      startMs: Date.UTC(2026, 6, 1, 8),
      endMs: Date.UTC(2026, 6, 1, 8, 30),
      start: point(25.0, 121.5),
      end: point(25.4, 121.9),
      // semantic end is far away, but the DRAWN polyline stops at 25.05...
      path: [point(25.01, 121.51), point(25.05, 121.55)],
    })
    // ...exactly where the next leg's drawn polyline begins (its semantic start
    // is somewhere else entirely). Nothing to draw: the traces already touch on
    // screen, so the coincidence check must use the visual endpoints.
    const b = segment({
      id: 'b',
      startMs: Date.UTC(2026, 6, 1, 8, 35),
      endMs: Date.UTC(2026, 6, 1, 9),
      start: point(25.0, 121.5),
      end: point(25.1, 121.62),
      path: [point(25.05, 121.55), point(25.08, 121.58)],
    })
    expect(bridgeLines([a, b])).toEqual([])
  })

  it('labels bridges honestly: short gaps are just "衔接", real gaps carry "衔接 +N …"', () => {
    expect(bridgeGapLabel(30_000)).toBe('衔接')
    // Overlapping transfer bridges (T14.2) carry a negative gapMs — the tooltip
    // must show "衔接", never a negative duration like 衔接 +-6 分钟.
    expect(bridgeGapLabel(-6 * 60_000)).toBe('衔接')
    expect(bridgeGapLabel(0)).toBe('衔接')
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

// Real device export (129MB, gitignored). Skipped automatically when the file
// is absent so CI and fresh clones stay green. Pins the T14.3 "跟時間連"
// behavioural fix on real data: EVERY time-adjacent pair on a busy local day is
// bridged, except degenerate pairs whose visual endpoints are the exact same
// coordinate (traces already touch on screen).
const LIVEDATA_2026 = new URL('../../../docs/livedata/Timeline-20260820.json', import.meta.url)
const hasLivedata = existsSync(LIVEDATA_2026)

describe.skipIf(!hasLivedata)('timeline bridges on real device export (docs/livedata)', () => {
  it('bridges every time-adjacent pair on the busiest local day except degenerate coincident endpoints (T14.3)', () => {
    const json = readFileSync(fileURLToPath(LIVEDATA_2026), 'utf8')
    const { data } = parseTimelineFile('Timeline.json', json)

    // Busiest LOCAL day = the calendar day with the most segments (well below
    // BRIDGE_CAP, so no stride sampling interferes with the exact count).
    const byDay = new Map<string, Segment[]>()
    for (const s of data.segments) {
      const key = dayKeyOf(s.startMs)
      const list = byDay.get(key)
      if (list) list.push(s)
      else byDay.set(key, [s])
    }
    let busiest = ''
    let maxCount = 0
    for (const [key, list] of byDay) {
      if (list.length > maxCount) {
        busiest = key
        maxCount = list.length
      }
    }
    expect(maxCount).toBeGreaterThan(1)

    const daySegs = [...(byDay.get(busiest) ?? [])].sort((a, b) => a.startMs - b.startMs)
    const bridges = bridgeLines(daySegs)
    expect(bridges.length).toBeGreaterThan(0)

    // Degenerate count: adjacent pairs whose DRAWN visual endpoints are the
    // exact same coordinate — the only pairs "跟時間連" is allowed to skip.
    // Mirrors `polylineEndpoints` via the shared A-class `hasPath` gate so the
    // test's degenerate math can never drift from what the bridge actually
    // draws (T31 threshold unification).
    let degenerate = 0
    for (let i = 1; i < daySegs.length; i++) {
      const prev = daySegs[i - 1]
      const cur = daySegs[i]
      const prevLast = hasPath(prev) ? prev.path[prev.path.length - 1] : prev.end
      const curFirst = hasPath(cur) ? cur.path[0] : cur.start
      if (prevLast.lat === curFirst.lat && prevLast.lng === curFirst.lng) degenerate++
    }
    expect(bridges.length).toBe(daySegs.length - 1 - degenerate)

    // The old pure-time rule bridged ONLY forward gaps; with every non-positive
    // pair now bridged the result is strictly more bridges than that rule made.
    const oldRuleCount = daySegs.reduce((acc, _, i) => {
      if (i === 0) return acc
      return daySegs[i].startMs - daySegs[i - 1].endMs > 0 ? acc + 1 : acc
    }, 0)
    const overlapBridges = bridges.filter((b) => b.gapMs <= 0)
    expect(overlapBridges.length).toBeGreaterThan(0)
    expect(bridges.length).toBeGreaterThan(oldRuleCount)

    // Every non-positive-gap bridge's label is the plain "衔接" (never negative).
    for (const b of overlapBridges) expect(bridgeGapLabel(b.gapMs)).toBe('衔接')
  }, 180_000)
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

describe('prepareTimeline (T15)', () => {
  const rawPoint = (lat: number, lng: number, timestampMs: number): RawPoint => ({
    lat,
    lng,
    timestampMs,
  })

  it('sorts rawSignals by timestampMs', () => {
    const points = [
      rawPoint(1, 2, Date.UTC(2026, 6, 1, 10)),
      rawPoint(3, 4, Date.UTC(2026, 6, 1, 8)),
      rawPoint(5, 6, Date.UTC(2026, 6, 1, 9)),
    ]
    const visits = [visit({ id: 'v', startMs: Date.UTC(2026, 6, 1, 9), endMs: Date.UTC(2026, 6, 1, 10) })]
    const result = prepareTimeline(visits, { startMs: null, endMs: null }, points)
    expect(result.points).toHaveLength(3)
    expect(result.points[0].timestampMs).toBe(Date.UTC(2026, 6, 1, 8))
    expect(result.points[1].timestampMs).toBe(Date.UTC(2026, 6, 1, 9))
    expect(result.points[2].timestampMs).toBe(Date.UTC(2026, 6, 1, 10))
  })

  it('filters rawSignals to the date range', () => {
    const points = [
      rawPoint(1, 2, Date.UTC(2026, 0, 1)),
      rawPoint(3, 4, Date.UTC(2026, 6, 1)),
      rawPoint(5, 6, Date.UTC(2026, 6, 15)),
    ]
    const visits = [visit({ id: 'v', startMs: Date.UTC(2026, 6, 1), endMs: Date.UTC(2026, 6, 30) })]
    const result = prepareTimeline(visits, { startMs: Date.UTC(2026, 6, 1), endMs: Date.UTC(2026, 6, 10) }, points)
    expect(result.points).toHaveLength(1)
    expect(result.points[0].lng).toBe(4)
  })

  it('decimates to RAW_POINT_CAP and flags downsampled', () => {
    const many = Array.from({ length: RAW_POINT_CAP + 500 }, (_, i) =>
      rawPoint(0.1, 0.2 + i * 1e-5, i),
    )
    const visits = [visit({ id: 'v', startMs: 0, endMs: 1 })]
    const result = prepareTimeline(visits, { startMs: null, endMs: null }, many)
    expect(result.points).toHaveLength(RAW_POINT_CAP)
    expect(result.downsampled).toBe(true)
  })

  it('returns visits sorted newest-first', () => {
    const visits = [
      visit({ id: 'old', startMs: Date.UTC(2026, 0, 1) }),
      visit({ id: 'new', startMs: Date.UTC(2026, 0, 3) }),
      visit({ id: 'mid', startMs: Date.UTC(2026, 0, 2) }),
    ]
    const result = prepareTimeline(visits, { startMs: null, endMs: null }, [])
    expect(result.visits.map((v) => v.startMs)).toEqual([
      Date.UTC(2026, 0, 3),
      Date.UTC(2026, 0, 2),
      Date.UTC(2026, 0, 1),
    ])
  })

  it('keeps endpoints when decimating', () => {
    const many = Array.from({ length: RAW_POINT_CAP + 500 }, (_, i) =>
      rawPoint(0.1 + i * 0.001, 103.8, i),
    )
    const visits = [visit({ id: 'v', startMs: 0, endMs: 1 })]
    const result = prepareTimeline(visits, { startMs: null, endMs: null }, many)
    expect(result.points[0].lat).toBe(0.1)
    expect(result.points[result.points.length - 1].lat).toBe(0.1 + (RAW_POINT_CAP + 499) * 0.001)
  })

  it('returns empty points when no rawSignals', () => {
    const visits = [visit({ id: 'v', startMs: 0, endMs: 1 })]
    const result = prepareTimeline(visits, { startMs: null, endMs: null }, [])
    expect(result.points).toHaveLength(0)
    expect(result.downsampled).toBe(false)
    expect(result.visits).toHaveLength(1)
  })

  it('decimates markers when over MARKER_CAP', () => {
    const manyVisits = Array.from({ length: MARKER_CAP + 100 }, (_, i) =>
      visit({ id: String(i), startMs: Date.UTC(2026, 0, i + 1), endMs: Date.UTC(2026, 0, i + 1, 1) }),
    )
    const result = prepareTimeline(manyVisits, { startMs: null, endMs: null }, [])
    expect(result.markers.length).toBeLessThan(manyVisits.length)
    expect(result.markers.length).toBe(MARKER_CAP)
    expect(result.downsampled).toBe(true)
  })

  // T16: rawSignals are only retained ~30 days, so older ranges must fall back
  // to the semantic segment paths or the timeline route is empty.
  it('falls back to segment paths when the range has no rawSignals', () => {
    const start = new Date(2025, 0, 30, 10).getTime()
    const segs = [
      segment({ id: 'a', startMs: start, endMs: start + 3600_000, path: [point(35, 138), point(35.5, 138.5)] }),
    ]
    const visits = [visit({ id: 'v', startMs: start, endMs: start + 3600_000 })]
    const result = prepareTimeline(visits, { startMs: null, endMs: null }, [], segs)
    expect(result.points).toHaveLength(0)
    expect(result.route).toEqual([{ lat: 35, lng: 138 }, { lat: 35.5, lng: 138.5 }])
    expect(result.routeSource).toBe('segments')
    expect(result.downsampled).toBe(false)
  })

  it('prefers raw fixes over segment paths on the same day', () => {
    const start = new Date(2026, 6, 1, 8).getTime()
    const segs = [
      segment({ id: 'a', startMs: start, endMs: start + 3600_000, path: [point(0, 0), point(1, 1)] }),
    ]
    // Raw fixes near BOTH segment vertices → every semantic vertex is covered,
    // so the segment path is dropped entirely and the route is raw-only.
    const raw = [
      { lat: 10, lng: 10, timestampMs: start },
      { lat: 10.5, lng: 10.5, timestampMs: start + 120_000 },
      { lat: 11, lng: 11, timestampMs: start + 3600_000 },
    ]
    const result = prepareTimeline([], { startMs: null, endMs: null }, raw, segs)
    expect(result.routeSource).toBe('raw')
    expect(result.route).toEqual([
      { lat: 10, lng: 10, timestampMs: start },
      { lat: 10.5, lng: 10.5, timestampMs: start + 120_000 },
      { lat: 11, lng: 11, timestampMs: start + 3600_000 },
    ])
  })
})

describe('buildTimelineRoute (T16/T17)', () => {
  const localNoon = (y: number, m: number, d: number, h = 12): number => new Date(y, m - 1, d, h).getTime()

  it('merges semantic segment paths into one time-ordered trail, deduping shared vertices', () => {
    const segs = [
      segment({ id: 'a', startMs: localNoon(2025, 1, 30, 10), endMs: localNoon(2025, 1, 30, 11), path: [point(35, 138), point(35.1, 138.1)] }),
      segment({ id: 'b', startMs: localNoon(2025, 1, 30, 12), endMs: localNoon(2025, 1, 30, 13), path: [point(35.1, 138.1), point(35.2, 138.2)] }),
    ]
    const r = buildTimelineRoute([], segs, { startMs: null, endMs: null })
    expect(r.source).toBe('segments')
    // Segment A's last vertex == segment B's first vertex → collapsed once.
    expect(r.points).toEqual([
      { lat: 35, lng: 138 },
      { lat: 35.1, lng: 138.1 },
      { lat: 35.2, lng: 138.2 },
    ])
  })

  it('carries the per-vertex time of timelinePath points', () => {
    const t0 = localNoon(2025, 1, 30, 10)
    const segs = [
      segment({
        id: 'a',
        startMs: t0,
        endMs: t0 + 3600_000,
        path: [
          { lat: 35, lng: 138, timestampMs: t0 + 60_000 },
          { lat: 35.1, lng: 138.1, timestampMs: t0 + 120_000 },
        ],
      }),
    ]
    const r = buildTimelineRoute([], segs, { startMs: null, endMs: null })
    expect(r.points).toEqual([
      { lat: 35, lng: 138, timestampMs: t0 + 60_000 },
      { lat: 35.1, lng: 138.1, timestampMs: t0 + 120_000 },
    ])
  })

  it('drops semantic vertices already covered by a nearby raw fix (no double-drawn trace)', () => {
    const t0 = localNoon(2026, 7, 1, 8)
    const raw = [
      { lat: 10, lng: 10, timestampMs: t0 },
      { lat: 11, lng: 11, timestampMs: t0 + 30 * 60_000 },
      { lat: 12, lng: 12, timestampMs: t0 + 3600_000 },
    ]
    // Same journey also present as a semantic segment; every vertex has a raw
    // fix at the same time, so the whole segment path is dropped.
    const segs = [
      segment({
        id: 'covered',
        startMs: t0,
        endMs: t0 + 3600_000,
        path: [
          { lat: 10, lng: 10, timestampMs: t0 },
          { lat: 11, lng: 11, timestampMs: t0 + 30 * 60_000 },
          { lat: 12, lng: 12, timestampMs: t0 + 3600_000 },
        ],
      }),
    ]
    const r = buildTimelineRoute(raw, segs, { startMs: null, endMs: null })
    expect(r.source).toBe('raw')
    expect(r.points).toEqual([
      { lat: 10, lng: 10, timestampMs: t0 },
      { lat: 11, lng: 11, timestampMs: t0 + 30 * 60_000 },
      { lat: 12, lng: 12, timestampMs: t0 + 3600_000 },
    ])
  })

  it('keeps uncovered semantic vertices so a raw-window boundary leaves no hole (T21)', () => {
    const t0 = localNoon(2026, 7, 1, 8)
    // Raw only covers the first ~30 min; the rest of the segment is uncovered.
    const raw = [
      { lat: 10, lng: 10, timestampMs: t0 },
      { lat: 10.1, lng: 10.1, timestampMs: t0 + 30 * 60_000 },
    ]
    const segs = [
      segment({
        id: 'straddle',
        startMs: t0,
        endMs: t0 + 3600_000,
        path: [
          { lat: 10, lng: 10, timestampMs: t0 },
          { lat: 10.1, lng: 10.1, timestampMs: t0 + 30 * 60_000 },
          { lat: 20, lng: 20, timestampMs: t0 + 3600_000 },
        ],
      }),
    ]
    const r = buildTimelineRoute(raw, segs, { startMs: null, endMs: null })
    expect(r.source).toBe('mixed')
    // Covered vertices are dropped; the uncovered segment end is kept.
    expect(r.points).toEqual([
      { lat: 10, lng: 10, timestampMs: t0 },
      { lat: 10.1, lng: 10.1, timestampMs: t0 + 30 * 60_000 },
      { lat: 20, lng: 20, timestampMs: t0 + 3600_000 },
    ])
  })

  it('mixes raw and segment sources across days', () => {
    const raw = [
      { lat: 1, lng: 1, timestampMs: localNoon(2026, 7, 1, 8) },
      { lat: 2, lng: 2, timestampMs: localNoon(2026, 7, 1, 9) },
    ]
    const segs = [
      segment({ id: 'old', startMs: localNoon(2025, 1, 30, 10), endMs: localNoon(2025, 1, 30, 11), path: [point(35, 138), point(35.5, 138.5)] }),
    ]
    const r = buildTimelineRoute(raw, segs, { startMs: null, endMs: null })
    expect(r.source).toBe('mixed')
    // Oldest day first (ascending), raw day last. Segment vertices carry no
    // per-point time; raw vertices do.
    expect(r.points[0]).toEqual({ lat: 35, lng: 138 })
    expect(r.points[0]).not.toHaveProperty('timestampMs')
    expect(r.points[r.points.length - 1]).toEqual({
      lat: 2,
      lng: 2,
      timestampMs: localNoon(2026, 7, 1, 9),
    })
  })

  it('filters segments to the date range', () => {
    const segs = [
      segment({ id: 'in', startMs: localNoon(2025, 1, 30), endMs: localNoon(2025, 1, 30) + 3600_000, path: [point(1, 1), point(2, 2)] }),
      segment({ id: 'out', startMs: localNoon(2025, 3, 30), endMs: localNoon(2025, 3, 30) + 3600_000, path: [point(9, 9), point(8, 8)] }),
    ]
    const range = { startMs: new Date(2025, 0, 30).getTime(), endMs: new Date(2025, 0, 30, 23, 59, 59, 999).getTime() }
    const r = buildTimelineRoute([], segs, range)
    expect(r.points).toEqual([{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }])
  })

  it('clips an overlapping segment\'s vertices to the selected range (T22)', () => {
    const t0 = localNoon(2025, 1, 30, 10)
    const segs = [
      segment({
        id: 'span',
        startMs: t0,
        endMs: t0 + 2 * 3600_000,
        path: [
          { lat: 1, lng: 1, timestampMs: t0 }, // before the range
          { lat: 2, lng: 2, timestampMs: t0 + 3600_000 }, // inside
          { lat: 3, lng: 3, timestampMs: t0 + 2 * 3600_000 }, // after the range
        ],
      }),
    ]
    // Segment overlaps the range, but only the middle vertex falls inside it.
    const range = { startMs: t0 + 30 * 60_000, endMs: t0 + 90 * 60_000 }
    const r = buildTimelineRoute([], segs, range)
    expect(r.points).toEqual([{ lat: 2, lng: 2, timestampMs: t0 + 3600_000 }])
  })

  it('uses [start, end] when a segment has no path points', () => {
    const segs = [
      segment({ id: 'a', startMs: localNoon(2025, 1, 30), endMs: localNoon(2025, 1, 30) + 3600_000, start: point(1, 2), end: point(3, 4), path: [] }),
    ]
    const r = buildTimelineRoute([], segs, { startMs: null, endMs: null })
    expect(r.points).toEqual([{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }])
  })

  it('caps the route and flags downsampled', () => {
    // Spacing must exceed the consecutive-duplicate threshold (~1e-5°).
    const path = Array.from({ length: GLOBAL_PATH_POINT_CAP + 100 }, (_, i) => point(1, 2 + i * 1e-4))
    const segs = [
      segment({ id: 'a', startMs: localNoon(2025, 1, 30), endMs: localNoon(2025, 1, 30) + 3600_000, path }),
    ]
    const r = buildTimelineRoute([], segs, { startMs: null, endMs: null })
    expect(r.points).toHaveLength(GLOBAL_PATH_POINT_CAP)
    expect(r.downsampled).toBe(true)
  })

  it('reports no source when there is no geometry at all', () => {
    const r = buildTimelineRoute([], [], { startMs: null, endMs: null })
    expect(r.points).toHaveLength(0)
    expect(r.source).toBe('raw')
    expect(r.downsampled).toBe(false)
  })
})

describe('clipSegmentPath (T22/S3 activityType clipping)', () => {
  const day = new Date(2025, 0, 30, 0, 0).getTime()
  const at = (h: number, m = 0): number => new Date(2025, 0, 29, h, m).getTime()

  it('drops vertices before the range start from a cross-midnight segment', () => {
    const seg = segment({
      id: 'overnight',
      startMs: at(22),
      endMs: day,
      path: [
        { lat: 1, lng: 1, timestampMs: at(22) },
        { lat: 2, lng: 2, timestampMs: at(23) },
        { lat: 3, lng: 3, timestampMs: day },
      ],
    })
    expect(clipSegmentPath(seg, { startMs: day, endMs: null })).toEqual([
      { lat: 3, lng: 3, timestampMs: day },
    ])
  })

  it('keeps every vertex for an open-ended range', () => {
    const seg = segment({
      id: 'open',
      startMs: at(22),
      endMs: day,
      path: [
        { lat: 1, lng: 1, timestampMs: at(22) },
        { lat: 3, lng: 3, timestampMs: day },
      ],
    })
    expect(clipSegmentPath(seg, { startMs: null, endMs: null })).toHaveLength(2)
  })

  it('uses interpolated times for vertices without a timestamp', () => {
    // 22:00 → 00:00, five vertices → keys at 22:00, 22:30, 23:00, 23:30, 00:00.
    // A 23:00 range start keeps only the last three (no per-vertex time exists,
    // so the map must not fabricate one — only the ordering key is used).
    const seg = segment({
      id: 'interp',
      startMs: at(22),
      endMs: day,
      path: Array.from({ length: 5 }, (_, i) => point(1 + i, 2 + i)),
    })
    const clipped = clipSegmentPath(seg, { startMs: new Date(2025, 0, 29, 23, 0).getTime(), endMs: null })
    expect(clipped).toHaveLength(3)
    expect(clipped[0]).toEqual(point(3, 4))
    expect(clipped.every((p) => p.timestampMs === undefined)).toBe(true)
  })

  it('returns path-less segments untouched (no fallback expansion)', () => {
    const seg = segment({ id: 'nopath', startMs: at(22), endMs: day, path: [] })
    expect(clipSegmentPath(seg, { startMs: day, endMs: null })).toEqual([])
  })

  it('is applied by prepareTrips so the activityType renderer clips too', () => {
    const seg = segment({
      id: 'overnight',
      startMs: at(22),
      endMs: day,
      path: [
        { lat: 1, lng: 1, timestampMs: at(22) },
        { lat: 3, lng: 3, timestampMs: day },
      ],
    })
    const prepared = prepareTrips([seg], [], { startMs: day, endMs: null })
    expect(prepared.segments[0].path).toEqual([{ lat: 3, lng: 3, timestampMs: day }])
  })
})

describe('raw coverage boundary ±5min (T21)', () => {
  const t0 = new Date(2026, 6, 1, 8).getTime()
  const raw = [{ lat: 10, lng: 10, timestampMs: t0 }]

  it('drops a semantic vertex exactly at the 5-minute boundary', () => {
    const seg = segment({
      id: 'edge',
      startMs: t0,
      endMs: t0 + 3600_000,
      path: [
        { lat: 10, lng: 10, timestampMs: t0 },
        { lat: 11, lng: 11, timestampMs: t0 + 5 * 60_000 },
      ],
    })
    const r = buildTimelineRoute(raw, [seg], { startMs: null, endMs: null })
    expect(r.points).toEqual([{ lat: 10, lng: 10, timestampMs: t0 }])
  })

  it('keeps a semantic vertex just beyond the 5-minute boundary', () => {
    const beyond = t0 + 5 * 60_000 + 1000
    const seg = segment({
      id: 'beyond',
      startMs: t0,
      endMs: t0 + 3600_000,
      path: [
        { lat: 10, lng: 10, timestampMs: t0 },
        { lat: 11, lng: 11, timestampMs: beyond },
      ],
    })
    const r = buildTimelineRoute(raw, [seg], { startMs: null, endMs: null })
    expect(r.points).toEqual([
      { lat: 10, lng: 10, timestampMs: t0 },
      { lat: 11, lng: 11, timestampMs: beyond },
    ])
  })
})

describe('cap → downsampled → summary propagation', () => {
  it('flags downsampled in prepareTimeline when the route hits the global cap', () => {
    const t0 = new Date(2026, 6, 1, 0).getTime()
    // Spatial step > DEDUP_DEG (~1e-5) so consecutive-duplicate collapse does
    // not hide the cap.
    const raw = Array.from({ length: GLOBAL_PATH_POINT_CAP + 100 }, (_, i) => ({
      lat: 1 + i * 1e-4,
      lng: 2,
      timestampMs: t0 + i * 1000,
    }))
    const payload = prepareTimeline([], { startMs: null, endMs: null }, raw, [])
    expect(payload.route).toHaveLength(GLOBAL_PATH_POINT_CAP)
    expect(payload.downsampled).toBe(true)
  })

  it('flags downsampled in prepareTrips when combined path points exceed the cap', () => {
    const segs = Array.from({ length: 10 }, (_, k) =>
      segment({
        id: `s${k}`,
        startMs: Date.UTC(2026, 6, 1, k),
        endMs: Date.UTC(2026, 6, 1, k, 30),
        path: Array.from({ length: 1500 }, (_, i) => point(k + i * 1e-4, 0)),
      }),
    )
    const prepared = prepareTrips(segs, [], { startMs: null, endMs: null })
    expect(prepared.downsampled).toBe(true)
    expect(prepared.totalPathPoints).toBeLessThanOrEqual(GLOBAL_PATH_POINT_CAP)
  })
})

describe('S2: clipped paths must not be undone by downstream fallbacks', () => {
  const day = new Date(2025, 0, 30, 0, 0).getTime()
  const prev22 = new Date(2025, 0, 29, 22, 0).getTime()
  const prev23 = new Date(2025, 0, 29, 23, 0).getTime()

  const overnight = segment({
    id: 'overnight',
    startMs: prev22,
    endMs: day,
    start: point(1, 1), // 01-29 semantic start — must NOT leak into bounds/bridges
    end: point(9, 9),
    path: [
      { lat: 1, lng: 1, timestampMs: prev22 },
      { lat: 5, lng: 5, timestampMs: prev23 },
      { lat: 9, lng: 9, timestampMs: day },
    ],
  })

  it('excludes clipped-away pre-range vertices from the fitted bounds', () => {
    const prepared = prepareTrips([overnight], [], { startMs: day, endMs: null })
    expect(prepared.segments[0].path).toEqual([{ lat: 9, lng: 9, timestampMs: day }])
    const bounds = boundsOf(prepared.segments, [])
    expect(bounds).toEqual({ minLat: 9, minLng: 9, maxLat: 9, maxLng: 9 })
  })

  it('still falls back to semantic start/end for a path-less segment', () => {
    const seg = segment({ id: 'nopath', path: [], start: point(1, 2), end: point(3, 4) })
    expect(boundsOf([seg], [])).toEqual({ minLat: 1, minLng: 2, maxLat: 3, maxLng: 4 })
  })

  it('bridges from a single-vertex clipped path, not the unclipped endpoints', () => {
    const later = segment({
      id: 'later',
      startMs: day + 3600_000,
      endMs: day + 7200_000,
      start: point(10, 10),
      end: point(11, 11),
      path: [point(10, 10), point(11, 11)],
    })
    const prepared = prepareTrips([overnight, later], [], { startMs: day, endMs: null })
    const bridges = bridgeLines(prepared.segments)
    // from = overnight's single rendered vertex (9,9), NOT its semantic start (1,1)
    expect(bridges[0].from).toMatchObject({ lat: 9, lng: 9 })
  })
})
