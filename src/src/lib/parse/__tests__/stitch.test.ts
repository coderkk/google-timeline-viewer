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
import {
  buildMaxEndUpTo,
  findStitchCandidate,
  type TimelinePathCandidate,
} from '../common'
import type { Point, Segment } from '../../types'

// synthetic timeline in the shape of the 2026+ device export. Traces are
// deliberately interleaved: two activities precede their covering trace and
// one follows it (all three can only be stitched by the single sorted final
// pass), and one has matching coordinates but no time overlap (must NOT be
// stitched).
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

const H = 3_600_000
const p = (lat: number, lng: number): Point => ({ lat, lng })
const candidateOf = (
  pool: TimelinePathCandidate[],
  seg: { startMs: number; endMs: number; start: Point; end: Point },
): TimelinePathCandidate | null => findStitchCandidate(seg, pool.sort((a, b) => a.startMs - b.startMs), buildMaxEndUpTo(pool))

// Trace with two distinct near-matchable points (one for each segment
// endpoint), kept trivial so the S1/S2 scan and overlap behavior is what is
// exercised rather than geometry.
const tripPair = (startMs: number, endMs: number): TimelinePathCandidate => ({
  startMs,
  endMs,
  points: [p(34.999, 135.7594), p(34.9992, 135.7596)],
})

const START_P = p(34.999, 135.7594)
const END_P = p(34.9957, 135.7793)

describe('stitch: candidate selection (unit)', () => {
  it('left scan steps over a short-window trace to reach a truly overlapping one (S1)', () => {
    // startMs-sorted pool whose endMs is NOT monotone: T1 (11:00-11:30) is a
    // short window sandwiched between T0 (10:00-12:00) and T2 (12:00-14:00).
    const pool: TimelinePathCandidate[] = [
      tripPair(10 * H, 12 * H), // T0 — genuinely overlaps
      tripPair(11 * H, 11.5 * H), // T1 — short window
      tripPair(12 * H, 14 * H), // T2
    ]
    // Query 11:45-12:10: T0 overlaps 15min, T2 overlaps 10min, T1 not at all.
    const candidate = candidateOf(pool, {
      startMs: 11.75 * H,
      endMs: 12.1 * H,
      start: START_P,
      end: p(34.9992, 135.7596),
    })
    expect(candidate?.startMs).toBe(10 * H)
    expect(candidate?.points).toEqual([START_P, p(34.9992, 135.7596)])
  })

  it('picks the candidate with the longest genuine overlap', () => {
    const pool: TimelinePathCandidate[] = [
      tripPair(9 * H, 13 * H), // overlaps 1h15m
      tripPair(10 * H, 12 * H), // overlaps 1h
    ]
    // Query 11:00-12:15; the shorter-overlap trace is considered first during
    // the left scan, so a strict `> bestOverlap` must still win for pool[0].
    const candidate = candidateOf(pool, {
      startMs: 11 * H,
      endMs: 12.25 * H,
      start: START_P,
      end: p(34.9992, 135.7596),
    })
    expect(candidate?.startMs).toBe(9 * H)
  })

  it('matches traces whose points run in reverse order (A2)', () => {
    const west = START_P
    const east = p(40, 140)
    // Trace stored end→start: first point is the segment's end, last is its
    // start; the returned sub-trace is flipped back into travel order.
    const pool: TimelinePathCandidate[] = [{ startMs: 10 * H, endMs: 12 * H, points: [east, west] }]
    const candidate = candidateOf(pool, { startMs: 11 * H, endMs: 11.5 * H, start: west, end: east })
    expect(candidate?.startMs).toBe(10 * H)
    expect(candidate?.points).toEqual([west, east])
  })

  it('rejects when no trace point is near the segment start or end', () => {
    // Segment far outside Japan; the trace never approaches either endpoint.
    const candidate = candidateOf(
      [{ startMs: 10 * H, endMs: 12 * H, points: [p(34.999, 135.7594), p(40, 140)] }],
      { startMs: 11 * H, endMs: 11.5 * H, start: p(36, 136), end: p(36.001, 136.001) },
    )
    expect(candidate).toBeNull()
  })

  it('returns the mid-trace sub-segment when the activity is one leg of the window', () => {
    // 2-hour trace: the activity only spans its first five points.
    const trace: Point[] = [
      START_P,
      p(34.9995, 135.77),
      p(34.9992, 135.78),
      p(34.9985, 135.782),
      END_P,
      p(34.99, 135.785),
      p(34.98, 135.79),
      p(34.97, 135.795),
      p(34.96, 135.8),
    ]
    const pool: TimelinePathCandidate[] = [{ startMs: 16 * H, endMs: 18 * H, points: trace }]
    const candidate = candidateOf(pool, {
      startMs: 16.25 * H,
      endMs: 16.55 * H,
      start: START_P,
      end: END_P,
    })
    expect(candidate).not.toBeNull()
    expect(candidate?.points).toHaveLength(5)
    expect(candidate?.points[0]).toEqual(START_P)
    expect(candidate?.points[4]).toEqual(END_P)
  })

  it('picks the closer of two in-tolerance trace points for an endpoint', () => {
    // idx1 is the exact segment start; idx0 drifts ~33m but stays under the
    // 0.02° tolerance. The sub-trace must begin at the nearer (idx1) point.
    const startP = p(24.0, 121.0)
    const endP = p(24.05, 121.05)
    const trace: Point[] = [p(24.0003, 121.0003), startP, p(24.02, 121.02), p(24.04, 121.04), endP]
    const pool: TimelinePathCandidate[] = [{ startMs: 10 * H, endMs: 12 * H, points: trace }]
    const candidate = candidateOf(pool, { startMs: 11 * H, endMs: 11.5 * H, start: startP, end: endP })
    expect(candidate).not.toBeNull()
    expect(candidate?.points).toHaveLength(4)
    expect(candidate?.points[0]).toEqual(startP)
    expect(candidate?.points[candidate.points.length - 1]).toEqual(endP)
  })

  it('still matches a segment spanning the whole trace (forward, full slice)', () => {
    const first = START_P
    const last = END_P
    const trace = [first, p(34.9995, 135.77), p(34.9992, 135.78), last]
    const pool: TimelinePathCandidate[] = [{ startMs: 10 * H, endMs: 12 * H, points: trace }]
    const candidate = candidateOf(pool, { startMs: 11 * H, endMs: 11.5 * H, start: first, end: last })
    expect(candidate?.startMs).toBe(10 * H)
    expect(candidate?.points).toEqual(trace)
  })

  it('rejects when the segment start matches after the end and no reverse pairing holds', () => {
    // Trace stored [≈end, ≈start, far]: the nearest indices put the start
    // AFTER the end (1 > 0), but the start is not near the trace's last point,
    // so the reverse pairing does not apply and the match must be dropped.
    const startP = START_P
    const endP = p(34.999, 135.758)
    const pool: TimelinePathCandidate[] = [{ startMs: 10 * H, endMs: 12 * H, points: [endP, startP, p(40, 140)] }]
    const candidate = candidateOf(pool, { startMs: 11 * H, endMs: 11.5 * H, start: startP, end: endP })
    expect(candidate).toBeNull()
  })

  it('rejects when both endpoints collapse onto a single trace point', () => {
    const startP = START_P
    const endP = p(34.999, 135.7694) // 0.01° east — inside the tolerance of startP
    const pool: TimelinePathCandidate[] = [{ startMs: 10 * H, endMs: 12 * H, points: [startP, p(40, 140)] }]
    const candidate = candidateOf(pool, { startMs: 11 * H, endMs: 11.5 * H, start: startP, end: endP })
    expect(candidate).toBeNull()
  })
})

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

  it('merges the covering trace even when it precedes the activity (final pass)', () => {
    const { data } = parseTimelineFile('Timeline.json', STITCH_FIXTURE)
    const afternoon = segmentAt(data.segments, Date.parse('2025-01-31T17:14:27.000+08:00'))
    expect(afternoon?.path).toHaveLength(3)
  })

  it('keeps timelinePath traces as their own segments', () => {
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

describe('stitch: activity that is one leg inside a multi-point trace', () => {
  it('stitches the exact sub-segment between the matched trace points', () => {
    const json = JSON.stringify({
      semanticSegments: [
        {
          startTime: '2025-01-31T16:00:00.000+08:00',
          endTime: '2025-01-31T18:00:00.000+08:00',
          timelinePath: [
            { point: '34.9990°, 135.7594°' },
            { point: '34.9995°, 135.7700°' },
            { point: '34.9993°, 135.7703°' },
            { point: '34.9985°, 135.7800°' },
            { point: '34.9957°, 135.7793°' },
            { point: '34.9900°, 135.7900°' },
          ],
        },
        {
          startTime: '2025-01-31T16:15:00.000+08:00',
          endTime: '2025-01-31T16:33:00.000+08:00',
          activity: {
            start: { latLng: '34.9990°, 135.7594°' },
            end: { latLng: '34.9957°, 135.7793°' },
            topCandidate: { type: 'IN_BUS' },
          },
        },
      ],
    })
    const { data } = parseTimelineFile('Timeline.json', json)
    const leg = data.segments.find((s) => s.activityType === 'IN_BUS')
    expect(leg?.path).toHaveLength(5)
    expect(leg?.path[0]).toEqual({ lat: 34.999, lng: 135.7594 })
    expect(leg?.path[4]).toEqual({ lat: 34.9957, lng: 135.7793 })
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
    expect(bus).toHaveLength(5)

    const withPath = bus.filter((s) => s.path.length >= 2)
    expect(withPath).toHaveLength(5)

    const near = (a: Point, b: Point): boolean =>
      Math.abs(a.lat - b.lat) <= 0.02 && Math.abs(a.lng - b.lng) <= 0.02
    const covering = withPath.filter(
      (s) => s.path.some((p) => near(p, s.start)) && s.path.some((p) => near(p, s.end)),
    )
    expect(covering).toHaveLength(5)
  }, 120_000)
})
