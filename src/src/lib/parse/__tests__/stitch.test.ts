// Path stitching: the 2026+ device export keeps real GPS polylines in coarse
// `timelinePath` segments, while the matching `activity` records only carry
// start/end coordinates. These tests assert that parsing merges the covering
// trace into the path-less activity segment so vehicle trips render a real
// route instead of a degenerate line.
/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseTimelineFile } from '../index'
import type { Point, Segment } from '../../types'

// Synthetic timeline in the shape of the 2026+ device export. Traces are
// deliberately interleaved: two activities precede their covering trace (so
// only the final pass can stitch them), one follows it (immediate stitch), and
// one has matching coordinates but no time overlap (must NOT be stitched).
const STITCH_FIXTURE = JSON.stringify({
  semanticSegments: [
    {
      startTime: '2025-01-31T12:10:00.000+08:00',
      endTime: '2025-01-31T12:30:00.000+08:00',
      activity: {
        start: { latLng: '34.9990°, 135.7594°' },
        end: { latLng: '34.9957°, 135.7793°' },
        topCandidate: { type: 'IN_BUS' },
      },
    },
    {
      startTime: '2025-01-31T08:39:27.000+08:00',
      endTime: '2025-01-31T09:07:59.000+08:00',
      activity: {
        start: { latLng: '34.9990°, 135.7594°' },
        end: { latLng: '34.9957°, 135.7793°' },
        topCandidate: { type: 'IN_BUS' },
      },
    },
    {
      startTime: '2025-01-31T08:00:00.000+08:00',
      endTime: '2025-01-31T10:00:00.000+08:00',
      timelinePath: [
        { point: '34.9985°, 135.7597°', time: '2025-01-31T08:37:00.000+08:00' },
        { point: '34.9995°, 135.7700°', time: '2025-01-31T08:58:00.000+08:00' },
        { point: '34.9957°, 135.7793°', time: '2025-01-31T09:58:00.000+08:00' },
      ],
    },
    {
      startTime: '2025-01-31T12:00:00.000+08:00',
      endTime: '2025-01-31T14:00:00.000+08:00',
      timelinePath: [
        { point: '34.9990°, 135.7594°' },
        { point: '35.0100°, 135.7200°' },
        { point: '34.9957°, 135.7793°' },
      ],
    },
    {
      startTime: '2025-01-31T16:00:00.000+08:00',
      endTime: '2025-01-31T18:00:00.000+08:00',
      timelinePath: [
        { point: '35.0207°, 135.6828°' },
        { point: '35.0100°, 135.7200°' },
        { point: '35.0050°, 135.7598°' },
      ],
    },
    {
      startTime: '2025-01-31T17:14:27.000+08:00',
      endTime: '2025-01-31T17:57:25.000+08:00',
      activity: {
        start: { latLng: '35.0211°, 135.6921°' },
        end: { latLng: '35.0050°, 135.7598°' },
        topCandidate: { type: 'IN_BUS' },
      },
    },
    {
      startTime: '2025-02-01T08:00:00.000+08:00',
      endTime: '2025-02-01T10:00:00.000+08:00',
      timelinePath: [{ point: '40.0000°, 140.0000°' }, { point: '40.0050°, 140.0050°' }],
    },
    {
      startTime: '2025-01-31T19:00:00.000+08:00',
      endTime: '2025-01-31T20:00:00.000+08:00',
      activity: {
        start: { latLng: '40.0000°, 140.0000°' },
        end: { latLng: '40.0050°, 140.0050°' },
        topCandidate: { type: 'IN_BUS' },
      },
    },
  ],
})

function segmentAt(segments: Segment[], startMs: number): Segment | undefined {
  return segments.find((s) => s.startMs === startMs)
}

describe('stitch: timelinePath GPS into path-less activity segments', () => {
  it('merges the covering trace when it precedes the activity (final pass)', () => {
    const { data, warnings } = parseTimelineFile('Timeline.json', STITCH_FIXTURE)
    expect(warnings).toEqual([])
    expect(data.segments).toHaveLength(8)

    const stitched = data.segments.filter((s) => s.activityType === 'IN_BUS' && s.path.length >= 2)
    expect(stitched).toHaveLength(3)

    // activity type and endpoint coords stay authoritative.
    const morning = segmentAt(data.segments, Date.parse('2025-01-31T08:39:27.000+08:00'))
    expect(morning?.activityType).toBe('IN_BUS')
    expect(morning?.start).toEqual({ lat: 34.999, lng: 135.7594 })
    expect(morning?.end).toEqual({ lat: 34.9957, lng: 135.7793 })
    expect(morning?.path).toHaveLength(3)
    expect(morning?.path[1]).toEqual({ lat: 34.9995, lng: 135.77 })
  })

  it('merges immediately when the trace precedes the activity', () => {
    const { data } = parseTimelineFile('Timeline.json', STITCH_FIXTURE)
    const afternoon = segmentAt(data.segments, Date.parse('2025-01-31T17:14:27.000+08:00'))
    expect(afternoon?.path).toHaveLength(3)
  })

  it('keeps timelimePath traces as their own segments', () => {
    const { data } = parseTimelineFile('Timeline.json', STITCH_FIXTURE)
    const febTrace = segmentAt(data.segments, Date.parse('2025-02-01T08:00:00.000+08:00'))
    expect(febTrace?.path).toHaveLength(2)
  })

  it('does not stitch when coordinates match but windows do not overlap', () => {
    const { data } = parseTimelineFile('Timeline.json', STITCH_FIXTURE)
    const unmatched = segmentAt(data.segments, Date.parse('2025-01-31T19:00:00.000+08:00'))
    expect(unmatched?.path).toHaveLength(0)
  })
})

// Real device export (129MB, gitignored). Skipped automatically when the file
// is absent so CI and fresh clones stay green.
const LIVEDATA_PATH = new URL('../../../../../docs/livedata/Timeline-20260820.json', import.meta.url)
const hasLivedata = existsSync(LIVEDATA_PATH)

describe.skipIf(!hasLivedata)('stitch: real device export (docs/livedata)', () => {
  it('gives 2025-01-31 IN_BUS segments a real GPS path', () => {
    const json = readFileSync(fileURLToPath(LIVEDATA_PATH), 'utf8')
    const { data } = parseTimelineFile('Timeline.json', json)

    const start = Date.UTC(2025, 0, 31)
    const end = Date.UTC(2025, 1, 1)
    const bus = data.segments.filter((s) => s.activityType === 'IN_BUS' && s.startMs >= start && s.startMs < end)
    expect(bus.length).toBeGreaterThan(0)

    const withPath = bus.filter((s) => s.path.length >= 2)
    expect(withPath.length).toBeGreaterThan(0)

    const near = (a: Point, b: Point): boolean =>
      Math.abs(a.lat - b.lat) <= 0.02 && Math.abs(a.lng - b.lng) <= 0.02
    const covering = withPath.filter(
      (s) => s.path.some((p) => near(p, s.start)) && s.path.some((p) => near(p, s.end)),
    )
    expect(covering.length).toBeGreaterThan(0)
  }, 120_000)
})