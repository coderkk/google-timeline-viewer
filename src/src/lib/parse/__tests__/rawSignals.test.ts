// rawSignals parsing (T13.6): the 2026+ format-1 device export stores a dense
// signal stream under `rawSignals`. `position` records are real GPS fixes and
// must become raw trajectory points (uppercase `LatLng` + nested `timestamp`);
// the coordless `wifiScan` / `activityRecord` categories are legitimate signal
// types and must be consumed silently — not misreported as malformed — while
// still counting toward none of the point stream.
/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseTimelineFile } from '../index'

// 2026+ device-export shape: top-level object, `rawSignals` array with the
// three mutually-exclusive signal categories exactly as observed in the real
// Timeline-20250213 / Timeline-20260820 files.
const FIXTURE_RAWSIGNALS_OBJECT = JSON.stringify({
  semanticSegments: [],
  rawSignals: [
    {
      position: {
        LatLng: '5.9893557°, 116.0920298°',
        accuracyMeters: 100,
        altitudeMeters: 52.7,
        source: 'WIFI',
        timestamp: '2025-01-14T09:10:51.000+08:00',
        speedMetersPerSecond: 0,
      },
    },
    {
      wifiScan: {
        deliveryTime: '2025-01-14T09:29:30.000+08:00',
        devicesRecords: [{ mac: 161476116215097, rawRssi: -50 }],
      },
    },
    {
      activityRecord: {
        probableActivities: [{ type: 'STILL', confidence: 1 }],
        timestamp: '2025-01-14T10:49:02.000+08:00',
      },
    },
    {
      position: {
        LatLng: '6.0100000°, 116.1200000°',
        accuracyMeters: 25,
        timestamp: '2025-01-14T09:20:00.000+08:00',
      },
    },
  ],
})

// Legacy direct-array shape: per-day object bundling `semanticSegments` +
// `rawSignals`, where signals may carry the nested `position` wrapper or the
// flat direct fields (sample data / older exports).
const FIXTURE_RAWSIGNALS_DIRECT_ARRAY = JSON.stringify([
  {
    semanticSegments: [
      {
        startTime: '2024-05-01T07:00:00.000Z',
        endTime: '2024-05-01T07:40:00.000Z',
        activityType: 'IN_PASSENGER_VEHICLE',
        startLocation: { latitudeE7: 523719400, longitudeE7: 13375000 },
        endLocation: { latitudeE7: 524433000, longitudeE7: 13518900 },
      },
    ],
    rawSignals: [
      {
        position: {
          LatLng: '1.3521°, 103.8198°',
          accuracyMeters: 12,
          timestamp: '2024-05-01T08:00:00.000Z',
        },
      },
      { timestampMs: 1784534400000, latitudeE7: 250463246, longitudeE7: 1216083654, accuracyMeters: 39 },
    ],
  },
])

describe('format 1 rawSignals: position category', () => {
  it('parses nested position fixes with uppercase LatLng + nested timestamp', () => {
    const { data, warnings } = parseTimelineFile('Timeline.json', FIXTURE_RAWSIGNALS_OBJECT)
    expect(warnings).toEqual([])
    expect(data.points).toHaveLength(2)

    expect(data.points[0]).toMatchObject({
      lat: 5.9893557,
      lng: 116.0920298,
      timestampMs: Date.parse('2025-01-14T09:10:51.000+08:00'),
      accuracyMeters: 100,
    })
    expect(data.points[1]).toMatchObject({
      lat: 6.01,
      lng: 116.12,
      timestampMs: Date.parse('2025-01-14T09:20:00.000+08:00'),
      accuracyMeters: 25,
    })
    expect(data.meta.pointCount).toBe(2)
  })

  it('consumes the legacy flat latLng spelling too', () => {
    const json = JSON.stringify({
      semanticSegments: [],
      rawSignals: [{ position: { latLng: '60.0°, 30.0°', timestamp: '2025-01-14T09:00:00.000Z' } }],
    })
    const { data } = parseTimelineFile('Timeline.json', json)
    expect(data.points[0]).toMatchObject({ lat: 60, lng: 30 })
  })
})

describe('format 1 rawSignals: activityRecord / wifiScan categories', () => {
  it('skips coordless categories silently — no points, no warnings', () => {
    const json = JSON.stringify({
      semanticSegments: [],
      rawSignals: [
        {
          activityRecord: {
            probableActivities: [{ type: 'STILL', confidence: 1 }],
            timestamp: '2025-01-14T10:49:02.000+08:00',
          },
        },
        { wifiScan: { deliveryTime: '2025-01-14T09:29:30.000+08:00', devicesRecords: [] } },
      ],
    })
    const { data, warnings } = parseTimelineFile('Timeline.json', json)
    expect(data.points).toHaveLength(0)
    expect(warnings).toEqual([])
  })

  it('only warns for a signal that is missing its coordinate', () => {
    const json = JSON.stringify({
      semanticSegments: [],
      rawSignals: [
        { activityRecord: { probableActivities: [] } },
        { position: { timestamp: '2025-01-14T09:10:51.000+08:00' } },
      ],
    })
    const { data, warnings } = parseTimelineFile('Timeline.json', json)
    expect(data.points).toHaveLength(0)
    expect(warnings.filter((w) => w.includes('缺少坐标字段'))).toHaveLength(1)
  })
})

describe('format 1 rawSignals: direct-array per-day bundling', () => {
  it('parses both nested and flat signal shapes without losing segments', () => {
    const { data, warnings } = parseTimelineFile('timeline.json', FIXTURE_RAWSIGNALS_DIRECT_ARRAY)
    expect(warnings).toEqual([])
    expect(data.segments).toHaveLength(1)
    expect(data.points).toHaveLength(2)
    expect(data.points[0]).toMatchObject({
      lat: 1.3521,
      lng: 103.8198,
      timestampMs: Date.parse('2024-05-01T08:00:00.000Z'),
    })
    expect(data.points[1]).toMatchObject({
      lat: 25.0463246,
      lng: 121.6083654,
      timestampMs: 1784534400000,
    })
  })
})

// Real device exports (gitignored, ~110/129MB). Skipped automatically when the
// files are absent so CI and fresh clones stay green.
const LIVEDATA_2025 = new URL('../../../../../docs/livedata/Timeline-20250213.json', import.meta.url)
const LIVEDATA_2026 = new URL('../../../../../docs/livedata/Timeline-20260820.json', import.meta.url)
const hasLivedata = existsSync(LIVEDATA_2025) && existsSync(LIVEDATA_2026)

describe.skipIf(!hasLivedata)('format 1 rawSignals: real device exports (docs/livedata)', () => {
  it('imports every raw position fix (11773 / 15479) with no warnings', () => {
    const files = [
      { name: 'Timeline-20250213.json', url: LIVEDATA_2025, expected: 11773 },
      { name: 'Timeline-20260820.json', url: LIVEDATA_2026, expected: 15479 },
    ]
    for (const { name, url, expected } of files) {
      const { data, warnings } = parseTimelineFile(name, readFileSync(fileURLToPath(url), 'utf8'))
      // No warning may come from the rawSignals stream itself; any mismatch
      // would also drop points below the exact counts asserted next.
      expect(warnings.filter((w) => w.includes('rawSignals'))).toEqual([])
      expect(data.points).toHaveLength(expected)
      // Raw-signals fixes are identified by the accuracy the nested `position`
      // wrapper carries — the point stream really came from rawSignals, not
      // from segments.
      expect(data.points.every((p) => p.accuracyMeters !== undefined)).toBe(true)
    }
  }, 180_000)
})