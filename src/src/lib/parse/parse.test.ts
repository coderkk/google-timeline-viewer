import { describe, expect, it } from 'vitest'
import { e7ToLat, e7ToLng, haversineKm, toMs } from '../types'
import type { TimelineData } from '../types'
import { addRawPoint, createState, emptyTimelineData, MAX_RAW_POINTS } from './common'
import { mergeTimelineData, parseTimelineFile, ParseError } from './index'
import {
  FIXTURE_DEVICE_EXPORT_2026,
  FIXTURE_EMPTY_ARRAY,
  FIXTURE_EMPTY_LOCATIONS,
  FIXTURE_EMPTY_OBJECT,
  FIXTURE_LOCATION_HISTORY,
  FIXTURE_LOCATION_ONLY,
  FIXTURE_RECORDS,
  FIXTURE_RECORDS_EMPTY_SEGMENTS,
  FIXTURE_SEMANTIC_HISTORY,
  FIXTURE_TIMELINE_DIRECT_ARRAY,
} from './__fixtures__/fixtures'

describe('e7 coordinate conversion', () => {
  it('divides E7 values by 1e7', () => {
    expect(e7ToLat(523719400)).toBeCloseTo(52.37194, 6)
    expect(e7ToLng(13375000)).toBeCloseTo(1.3375, 6)
    expect(e7ToLat(0)).toBe(0)
  })
})

describe('toMs', () => {
  it('accepts numeric milliseconds', () => {
    expect(toMs(1714543200000)).toBe(1714543200000)
  })

  it('accepts ISO date strings', () => {
    expect(toMs('2024-05-01T00:00:00.000Z')).toBe(Date.parse('2024-05-01T00:00:00.000Z'))
    expect(toMs('2024-05-01T07:40:00Z')).toBe(Date.parse('2024-05-01T07:40:00Z'))
  })

  it('accepts numeric strings as milliseconds', () => {
    expect(toMs('1714543200000')).toBe(1714543200000)
  })

  it('returns NaN for unparsable input', () => {
    expect(Number.isNaN(toMs('not-a-time'))).toBe(true)
    expect(Number.isNaN(toMs(Number.NaN))).toBe(true)
  })
})

describe('haversineKm', () => {
  it('returns zero for identical points', () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })).toBe(0)
  })

  it('approximates one degree of longitude at the equator', () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111.19, 0)
  })
})

describe('format 1: Timeline.json direct array', () => {
  it('parses trips and place-visits into the unified model', () => {
    const { data, warnings } = parseTimelineFile('timeline.json', FIXTURE_TIMELINE_DIRECT_ARRAY)
    expect(warnings).toEqual([])
    expect(data.segments).toHaveLength(1)
    expect(data.visits).toHaveLength(1)
    expect(data.points).toHaveLength(0)

    const segment = data.segments[0]
    expect(segment.activityType).toBe('IN_PASSENGER_VEHICLE')
    expect(segment.hasActivitySemantics).toBe(true)
    expect(segment.start).toEqual({ lat: 52.37194, lng: 1.3375 })
    expect(segment.end).toEqual({ lat: 52.4433, lng: 1.35189 })
    expect(segment.startMs).toBe(Date.parse('2024-05-01T07:00:00.000Z'))
    expect(segment.endMs).toBe(Date.parse('2024-05-01T07:40:00.000Z'))
    expect(segment.path).toHaveLength(3)
    expect(segment.path[1]).toEqual({ lat: expect.closeTo(52.4, 4), lng: expect.closeTo(1.34, 4) })

    const visit = data.visits[0]
    expect(visit.name).toBe('Office')
    expect(visit.address).toBe('1 Main St')
    expect(visit.placeId).toBe('office')
    expect(visit.startMs).toBe(Date.parse('2024-05-01T07:40:00.000Z'))
    expect(visit.endMs).toBe(Date.parse('2024-05-01T09:10:00.000Z'))
  })
})

describe('format 1: 2026 device export (semanticSegments object, flat records)', () => {
  it('parses flat visit / activity / timelinePath records with °-suffixed coords', () => {
    const { data, warnings } = parseTimelineFile('Timeline.json', FIXTURE_DEVICE_EXPORT_2026)
    expect(warnings).toEqual([])
    expect(data.visits).toHaveLength(1)
    expect(data.segments).toHaveLength(2)

    expect(data.visits[0]).toMatchObject({
      lat: expect.closeTo(6.060128, 6),
      lng: expect.closeTo(116.155137, 6),
      startMs: Date.parse('2012-12-30T15:15:50.000+08:00'),
      endMs: Date.parse('2012-12-30T20:48:23.000+08:00'),
      placeId: 'ChIJ-TqqarRsOzIRqQZVixuJl8M',
    })

    const activity = data.segments[0]
    expect(activity.activityType).toBe('IN_PASSENGER_VEHICLE')
    expect(activity.hasActivitySemantics).toBe(true)
    expect(activity.start).toEqual({ lat: expect.closeTo(6.0611445, 6), lng: expect.closeTo(116.1556962, 6) })
    expect(activity.end).toEqual({ lat: expect.closeTo(5.9616525, 6), lng: expect.closeTo(116.0972516, 6) })

    const path = data.segments[1]
    expect(path.activityType).toBeUndefined()
    // B5/T33: the timelinePath-only trace is marked WITHOUT activity semantics,
    // so the by-activity trip chain can exclude it.
    expect(path.hasActivitySemantics).toBe(false)
    expect(path.path).toHaveLength(2)
    // timelinePath rows carry a per-vertex time; it must survive parsing.
    expect(path.path[0]).toEqual({
      lat: expect.closeTo(6.0611385, 6),
      lng: expect.closeTo(116.1557205, 6),
      timestampMs: Date.parse('2013-01-02T09:40:00.000+08:00'),
    })
    expect(path.path[1]).toEqual({
      lat: expect.closeTo(6.01, 6),
      lng: expect.closeTo(116.12, 6),
      timestampMs: Date.parse('2013-01-02T09:50:00.000+08:00'),
    })
    expect(path.start).toEqual(path.path[0])
    expect(path.end).toEqual(path.path[1])
  })

  it('consumes timelineMemory records silently (documented ignore-only type)', () => {
    const json = JSON.stringify({
      semanticSegments: [
        {
          startTime: '2013-02-12T07:25:57.000+08:00',
          endTime: '2013-02-12T16:49:21.000+08:00',
          startTimeTimezoneUtcOffsetMinutes: 480,
          endTimeTimezoneUtcOffsetMinutes: 480,
          timelineMemory: { trip: { distanceMeters: 1021 } },
        },
      ],
    })
    const { data, warnings } = parseTimelineFile('Timeline.json', json)
    expect(warnings).toEqual([])
    expect(data.segments).toHaveLength(0)
    expect(data.visits).toHaveLength(0)
  })
})

describe('format 2: Records.json', () => {
  it('parses locations, activity segments and warns about savedPlaces', () => {
    const { data, warnings } = parseTimelineFile('Records.json', FIXTURE_RECORDS)
    expect(warnings.some((w) => w.includes('savedPlaces'))).toBe(true)
    expect(data.points).toHaveLength(2)
    expect(data.segments).toHaveLength(1)
    expect(data.visits).toHaveLength(0)

    expect(data.points[0].accuracyMeters).toBe(12)
    expect(data.points[1].accuracyMeters).toBe(8)

    const segment = data.segments[0]
    expect(segment.activityType).toBe('IN_PASSENGER_VEHICLE')
    expect(segment.path).toHaveLength(2)
    expect(segment.startMs).toBe(1714543200000)
  })
})

describe('format 3: Semantic Location History', () => {
  it('parses timelineObjects into visits and segments', () => {
    const { data, warnings } = parseTimelineFile('2024_05.json', FIXTURE_SEMANTIC_HISTORY)
    expect(warnings).toEqual([])
    expect(data.segments).toHaveLength(1)
    expect(data.visits).toHaveLength(1)
    expect(data.segments[0].activityType).toBe('WALKING')
    expect(data.visits[0].name).toBe('Cafe')
    expect(data.visits[0].startMs).toBe(1714203600000)
  })
})

describe('format 4: Location History.json', () => {
  it('parses raw locations into points', () => {
    const { data, warnings } = parseTimelineFile('Location History.json', FIXTURE_LOCATION_HISTORY)
    expect(warnings).toEqual([])
    expect(data.points).toHaveLength(2)
    expect(data.points[0]).toMatchObject({
      lat: 52.37194,
      lng: 1.3375,
      timestampMs: 1289894400000,
      accuracyMeters: 30,
    })
    expect(data.segments).toHaveLength(0)
    expect(data.visits).toHaveLength(0)
  })
})

describe('format auto-detection', () => {
  it('keeps location-only payloads on format 4', () => {
    const { data } = parseTimelineFile('a.json', FIXTURE_LOCATION_ONLY)
    expect(data.points).toHaveLength(1)
    expect(data.meta.pointCount).toBe(1)
  })

  it('routes locations + activitySegments to format 2 even when segments are empty', () => {
    const { data } = parseTimelineFile('b.json', FIXTURE_RECORDS_EMPTY_SEGMENTS)
    expect(data.points).toHaveLength(1)
  })
})

describe('empty and malformed input', () => {
  it('does not throw on empty structures', () => {
    for (const text of [FIXTURE_EMPTY_OBJECT, FIXTURE_EMPTY_ARRAY, FIXTURE_EMPTY_LOCATIONS]) {
      const { data } = parseTimelineFile('empty.json', text)
      expect(data.points).toHaveLength(0)
      expect(data.visits).toHaveLength(0)
      expect(data.segments).toHaveLength(0)
      expect(data.meta.timeRange).toEqual({ minMs: 0, maxMs: 0 })
    }
  })

  it('warns about an object with no recognizable structure', () => {
    const { warnings } = parseTimelineFile('empty.json', FIXTURE_EMPTY_OBJECT)
    expect(warnings.length).toBeGreaterThan(0)
  })

  it('skips malformed records with warnings instead of throwing', () => {
    const text = JSON.stringify({
      locations: [
        { timestampMs: 1000, latitudeE7: 1, longitudeE7: 2 },
        { latitudeE7: 3, longitudeE7: 4 },
        { timestampMs: 'bad', latitudeE7: 5, longitudeE7: 6 },
      ],
    })
    const { data, warnings } = parseTimelineFile('diry.json', text)
    expect(data.points).toHaveLength(1)
    expect(warnings.length).toBeGreaterThanOrEqual(2)
  })

  it('throws ParseError on invalid JSON text', () => {
    expect(() => parseTimelineFile('bad.json', '{ not json')).toThrow(ParseError)
  })
})

describe('mergeTimelineData', () => {
  it('concatenates collections and recomputes meta', () => {
    const a = parseTimelineFile('a.json', FIXTURE_TIMELINE_DIRECT_ARRAY).data
    const b = parseTimelineFile('b.json', FIXTURE_LOCATION_HISTORY).data
    const merged = mergeTimelineData([a, b])
    expect(merged.points).toHaveLength(a.points.length + b.points.length)
    expect(merged.segments).toHaveLength(1)
    expect(merged.visits).toHaveLength(1)
    expect(merged.meta.fileCount).toBe(2)
    expect(merged.meta.pointCount).toBe(2)
    expect(merged.meta.visitCount).toBe(1)
    expect(merged.meta.segmentCount).toBe(1)
    expect(merged.meta.timeRange.minMs).toBe(1289894400000)
    expect(merged.meta.timeRange.maxMs).toBe(Date.parse('2024-05-01T09:10:00.000Z'))
  })
})

describe('raw points cap (security G1)', () => {
  const mkTimeline = (pointCount: number): TimelineData => ({
    ...emptyTimelineData(),
    points: Array.from({ length: pointCount }, (_, i) => ({
      lat: i * 1e-6,
      lng: 0,
      timestampMs: i,
    })),
  })

  it('stops adding raw points once the cap is reached and warns once', () => {
    const warnings: string[] = []
    const state = createState(warnings)
    const record = { timestampMs: 1000, latitudeE7: 1, longitudeE7: 2 }
    for (let i = 0; i <= MAX_RAW_POINTS; i++) {
      addRawPoint(record, state, '"huge.json"')
    }
    expect(state.points).toHaveLength(MAX_RAW_POINTS)
    const truncations = warnings.filter((w) => w.includes('已截断'))
    expect(truncations).toHaveLength(1)
    expect(truncations[0]).toContain('"huge.json"')
    expect(truncations[0]).toContain('raw points 超过')
    // A3: 2,000,000 points = 200万 (not "2 万").
    expect(truncations[0]).toContain(`${MAX_RAW_POINTS / 10_000} 万`)
  }, 30_000)

  it('caps the merged raw points across multiple files and reports truncation', () => {
    const half = Math.floor(MAX_RAW_POINTS / 2) + 1
    const warnings: string[] = []
    const merged = mergeTimelineData([mkTimeline(half), mkTimeline(half)], warnings)
    expect(merged.points).toHaveLength(MAX_RAW_POINTS)
    expect(merged.meta.pointCount).toBe(MAX_RAW_POINTS)
    expect(warnings.some((w) => w.includes('已截断'))).toBe(true)
    expect(warnings.some((w) => w.includes('累计 raw points'))).toBe(true)
  })
})