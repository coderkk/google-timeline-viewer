// Merge algorithm unit tests (T36 / PRD 功能 14). Covers the four required
// merge profiles — first merge (no main archive), same file twice, disjoint
// ≥29-day windows, overlapping windows — plus the fold tolerance boundaries
// (time ±60s, position ~100m), coordless signal passthrough, both format-1
// shapes (direct-array / top-level object), output-schema re-importability,
// and error cases. The livedata describe block re-merges the two real exports
// and re-imports the merged file as a full end-to-end smoke.
/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  mergeTimelineExports,
  MergeError,
  MERGE_POSITION_TOLERANCE_M,
  MERGE_TIME_TOLERANCE_MS,
} from './index'
import { parseTimelineFile } from '../parse'
import { extractFormat1Slices } from '../parse/formatTimelineArray'
import { FIXTURE_DEVICE_EXPORT_2026 } from '../parse/__fixtures__/fixtures'

// -- helpers ---------------------------------------------------------------

/** Build a format-1 top-level-object export string. */
function objectFile(rawSignals: unknown[], segments: unknown[] = [], profile?: unknown): string {
  const root: Record<string, unknown> = { semanticSegments: segments, rawSignals }
  if (profile !== undefined) root.userLocationProfile = profile
  return JSON.stringify(root)
}

/** A rawSignals `position` fix in the real device-export spelling. */
function fix(iso: string, lat: number, lng: number, extra: Record<string, unknown> = {}): unknown {
  return { position: { LatLng: `${lat}°, ${lng}°`, timestamp: iso, accuracyMeters: 25, ...extra } }
}

function seg(id: string): unknown {
  return {
    startTime: '2025-01-01T00:00:00.000Z',
    endTime: '2025-01-01T01:00:00.000Z',
    activityType: id,
  }
}

/** The coordinate-bearing fixes of a merged rawSignals array, in order. */
function mergedFixes(json: string): { ts: number; lat: number; lng: number; source?: string }[] {
  const root = JSON.parse(json) as { rawSignals: unknown[] }
  const out: { ts: number; lat: number; lng: number; source?: string }[] = []
  for (const entry of root.rawSignals) {
    const record = entry as { position?: { LatLng?: string; timestamp?: string; source?: string } }
    const pos = record.position
    if (!pos?.LatLng || pos.timestamp === undefined) continue
    const [lat, lng] = pos.LatLng.replace('°', '').split(',').map((part) => Number(part.trim()))
    out.push({ ts: Date.parse(pos.timestamp), lat, lng, ...(pos.source ? { source: pos.source } : {}) })
  }
  return out
}

// -- first merge / raw profile ---------------------------------------------

describe('merge: first merge (no main archive)', () => {
  it('passes the new export through unchanged (points, mixes, segments', () => {
    const exportText = objectFile(
      [fix('2025-01-10T05:00:00.000Z', 1, 2), { wifiScan: { deliveryTime: '2025-01-10T06:00:00.000Z' } }],
      [seg('WALKING'), seg('IN_BUS')],
      { frequentPlaces: ['home'] },
    )
    const outcome = mergeTimelineExports(null, { name: 'new.json', text: exportText })
    expect(outcome.stats).toMatchObject({ semanticSegments: 2, rawSignals: 2, points: 1 })
    expect(outcome.stats.windowEndMs).toBe(Date.parse('2025-01-10T05:00:00.000Z'))
    const root = JSON.parse(outcome.json) as {
      semanticSegments: unknown[]
      rawSignals: unknown[]
      userLocationProfile: unknown
    }
    expect(root.semanticSegments).toHaveLength(2)
    expect(root.rawSignals).toHaveLength(2)
    expect(root.userLocationProfile).toEqual({ frequentPlaces: ['home'] })
  })
})

// -- same file twice -------------------------------------------------------

describe('merge: same file merged twice is idempotent', () => {
  it('yields no duplicate points and exactly one semantic layer', () => {
    const exportText = objectFile(
      [
        fix('2025-01-10T05:00:00.000Z', 1, 2, { source: 'A' }),
        fix('2025-01-10T05:10:00.000Z', 3, 4, { source: 'A' }),
      ],
      [seg('WALKING')],
    )
    const outcome = mergeTimelineExports(
      { name: 'same.json', text: exportText },
      { name: 'same.json', text: exportText },
    )
    const fixes = mergedFixes(outcome.json)
    // The two fixes survive exactly once each; no duplicate timestamps.
    expect(fixes).toHaveLength(2)
    expect(new Set(fixes.map((f) => f.ts)).size).toBe(2)
    const root = JSON.parse(outcome.json) as { semanticSegments: unknown[] }
    expect(root.semanticSegments).toHaveLength(1)
    expect(outcome.stats.points).toBe(2)
  })
})

// -- disjoint windows ------------------------------------------------------

describe('merge: disjoint ≥29-day windows concatenate', () => {
  it('covers a longer raw span and takes the newer semanticSegments', () => {
    const oldText = objectFile(
      [fix('2025-01-10T05:00:00.000Z', 1, 2, { source: 'OLD' })],
      [seg('old-only')],
      { frequentPlaces: ['old'] },
    )
    const newText = objectFile(
      [fix('2025-02-20T05:00:00.000Z', 3, 4, { source: 'NEW' })],
      [seg('new-a'), seg('new-b')],
      { frequentPlaces: ['new'] },
    )
    const outcome = mergeTimelineExports(
      { name: 'old.json', text: oldText },
      { name: 'new.json', text: newText },
    )
    // Raw windows concatenated (1 + 1 points), segments = newer only.
    const fixes = mergedFixes(outcome.json)
    expect(fixes).toHaveLength(2)
    expect(fixes.map((f) => f.source).sort()).toEqual(['NEW', 'OLD'])
    const root = JSON.parse(outcome.json) as {
      semanticSegments: Array<{ activityType?: string }>
      userLocationProfile: { frequentPlaces: string[] }
    }
    expect(root.semanticSegments.map((s) => s.activityType)).toEqual(['new-a', 'new-b'])
    // userLocationProfile: the newer export wins.
    expect(root.userLocationProfile.frequentPlaces).toEqual(['new'])
    // Merged window spans both fixes.
    expect(Math.min(...fixes.map((f) => f.ts))).toBe(Date.parse('2025-01-10T05:00:00.000Z'))
    expect(Math.max(...fixes.map((f) => f.ts))).toBe(Date.parse('2025-02-20T05:00:00.000Z'))
  })
})

// -- overlapping windows / fold --------------------------------------------

describe('merge: overlapping windows fold duplicates, keeping the NEW fix', () => {
  it('folds a near-duplicate (same place, 30s apart) keeping the new export point', () => {
    const oldText = objectFile([fix('2025-01-10T05:00:00.000Z', 1, 2, { source: 'OLD' })])
    const newText = objectFile([fix('2025-01-10T05:00:30.000Z', 1, 2, { source: 'NEW' })])
    const outcome = mergeTimelineExports(
      { name: 'old.json', text: oldText },
      { name: 'new.json', text: newText },
    )
    const fixes = mergedFixes(outcome.json)
    expect(fixes).toHaveLength(1)
    expect(fixes[0].source).toBe('NEW')
    expect(outcome.stats.points).toBe(1)
    expect(outcome.stats.rawSignals).toBe(1)
  })

  it('does NOT fold fixes farther apart than the time tolerance', () => {
    const oldText = objectFile([fix('2025-01-10T05:00:00.000Z', 1, 2)])
    const newText = objectFile([
      fix('2025-01-10T05:00:00.000Z', 1, 2 + 0.03), // ~2.6km south — same time, far position
      fix(new Date(Date.parse('2025-01-10T05:00:00.000Z') + MERGE_TIME_TOLERANCE_MS + 60_000).toISOString(), 1, 2), // just past the time window
    ])
    const outcome = mergeTimelineExports(
      { name: 'old.json', text: oldText },
      { name: 'new.json', text: newText },
    )
    expect(mergedFixes(outcome.json)).toHaveLength(3)
  })

  it('respects the position tolerance boundary (~100m)', () => {
    const degreeLat = 111320 // meters per degree of latitude
    const m = MERGE_POSITION_TOLERANCE_M
    // 50m apart at the same instant → fold.
    const close = mergeTimelineExports(
      { name: 'old.json', text: objectFile([fix('2025-01-10T05:00:00.000Z', 1, 2)]) },
      { name: 'new.json', text: objectFile([fix('2025-01-10T05:00:00.000Z', 1 + 50 / degreeLat, 2)]) },
    )
    expect(mergedFixes(close.json)).toHaveLength(1)
    // 200m apart at the same instant → keep both.
    const far = mergeTimelineExports(
      { name: 'old.json', text: objectFile([fix('2025-01-10T05:00:00.000Z', 1, 2)]) },
      { name: 'new.json', text: objectFile([fix('2025-01-10T05:00:00.000Z', 1 + 200 / degreeLat, 2)]) },
    )
    expect(mergedFixes(far.json)).toHaveLength(2)
    expect(m).toBeGreaterThan(0)
  })

  it('passes coordless signal categories through from BOTH files untouched', () => {
    const wifi = { wifiScan: { deliveryTime: '2025-01-10T06:00:00.000Z' } }
    const activity = { activityRecord: { probableActivities: [] } }
    const oldText = objectFile([wifi, fix('2025-01-10T05:00:00.000Z', 1, 2)])
    const newText = objectFile([activity, fix('2025-01-10T05:00:30.000Z', 1, 2)])
    const outcome = mergeTimelineExports(
      { name: 'old.json', text: oldText },
      { name: 'new.json', text: newText },
    )
    const root = JSON.parse(outcome.json) as { rawSignals: unknown[] }
    // The duplicate fix folded to one (old dropped); both coordless mixes
    // survive untouched → wifi + activity + the new fix = 3 entries.
    expect(root.rawSignals).toHaveLength(3)
    expect(mergedFixes(outcome.json)).toHaveLength(1)
  })
})

// -- both format-1 shapes --------------------------------------------------

describe('merge: accepts both format-1 shapes', () => {
  it('merges a direct-array archive with a top-level-object export', () => {
    const arrayText = JSON.stringify([
      { semanticSegments: [seg('arr-seg')], rawSignals: [fix('2025-01-10T05:00:00.000Z', 1, 2)] },
      { rawSignals: [fix('2025-01-11T05:00:00.000Z', 3, 4)] },
    ])
    const objectText = objectFile([fix('2025-02-20T05:00:00.000Z', 5, 6)], [seg('obj-seg')])
    const outcome = mergeTimelineExports(
      { name: 'array.json', text: arrayText },
      { name: 'object.json', text: objectText },
    )
    const fixes = mergedFixes(outcome.json)
    expect(fixes).toHaveLength(3)
    const root = JSON.parse(outcome.json) as { semanticSegments: Array<{ activityType?: string }> }
    // Only the object (newer) export's segments survive.
    expect(root.semanticSegments.map((s) => s.activityType)).toEqual(['obj-seg'])
  })

  it('extractFormat1Slices traverses both shapes like the parser', () => {
    const deviceRoot = JSON.parse(FIXTURE_DEVICE_EXPORT_2026) as unknown
    const slices = extractFormat1Slices(deviceRoot, '"device.json"')
    expect(slices.semanticSegments).toHaveLength(3)
    expect(slices.invalidTopObject).toBe(false)
    expect(slices.missingSegments).toBe(false)

    const arrayShape = JSON.parse(
      JSON.stringify([
        { semanticSegments: [seg('x')], rawSignals: [fix('2025-01-10T05:00:00.000Z', 1, 2)] },
      ]),
    ) as unknown
    const arraySlices = extractFormat1Slices(arrayShape, '"arr.json"')
    expect(arraySlices.semanticSegments).toHaveLength(1)
    expect(arraySlices.rawSignals).toHaveLength(1)
    expect(arraySlices.invalidTopObject).toBe(false)
    expect(arraySlices.missingSegments).toBe(false)
  })
})

// -- errors ----------------------------------------------------------------

describe('merge: input validation', () => {
  it('rejects invalid JSON with import.notJson', () => {
    try {
      mergeTimelineExports(null, { name: 'broken.json', text: '{ not json' })
      expect.unreachable('merge should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(MergeError)
      expect((err as MergeError).key).toBe('import.notJson')
      expect((err as MergeError).params.name).toBe('broken.json')
    }
  })

  it('rejects non-format-1 files (records shape) with merge.error.needTimeline', () => {
    const records = JSON.stringify({ locations: [], activitySegments: [] })
    expect(() => mergeTimelineExports(null, { name: 'Records.json', text: records })).toThrowError(
      'merge.error.needTimeline',
    )
  })

  it('rejects an empty-but-valid export with import.emptyData', () => {
    expect(() =>
      mergeTimelineExports(null, { name: 'empty.json', text: '{"semanticSegments":[],"rawSignals":[]}' }),
    ).toThrowError('import.emptyData')
  })

  it('rejects a non-format-1 main archive too', () => {
    const valid = objectFile([fix('2025-02-20T05:00:00.000Z', 1, 2)])
    const records = JSON.stringify({ locations: [] })
    expect(() =>
      mergeTimelineExports({ name: 'Records.json', text: records }, { name: 'new.json', text: valid }),
    ).toThrowError('merge.error.needTimeline')
  })
})

// -- real livedata smoke: merged file re-imports and watches ---------------

const LIVEDATA_OLD = new URL('../../../../docs/livedata/Timeline-20250213.json', import.meta.url)
const LIVEDATA_NEW = new URL('../../../../docs/livedata/Timeline-20260820.json', import.meta.url)
const hasLivedata = existsSync(LIVEDATA_OLD) && existsSync(LIVEDATA_NEW)

describe.skipIf(!hasLivedata)('merge: real device exports (docs/livedata)', () => {
  it('merges 2025+2026 exports; the merged file re-imports with accumulated raw + newest semantics', () => {
    const oldText = readFileSync(fileURLToPath(LIVEDATA_OLD), 'utf8')
    const newText = readFileSync(fileURLToPath(LIVEDATA_NEW), 'utf8')
    const outcome = mergeTimelineExports(
      { name: 'Timeline-20250213.json', text: oldText },
      { name: 'Timeline-20260820.json', text: newText },
    )
    // 50662 + 55509 signals, 11773 + 15479 fixes, newest semantics (97382).
    expect(outcome.stats).toMatchObject({
      semanticSegments: 97_382,
      rawSignals: 106_171,
      points: 27_252,
    })
    expect(outcome.stats.windowEndMs).toBeGreaterThan(Date.parse('2026-08-20T00:00:00.000Z'))

    // Re-import the merged file through the normal import parser (功能 3
    // 时间轴模式 consumes exactly this TimelineData): accumulated raw points,
    // one semantic layer = the 2026 export's, span covering both raw windows.
    const mergedParse = parseTimelineFile('timeline-merged.json', outcome.json)
    const newParse = parseTimelineFile('Timeline-20260820.json', newText)
    expect(mergedParse.data.points).toHaveLength(27_252)
    expect(mergedParse.data.segments).toHaveLength(newParse.data.segments.length)
    expect(mergedParse.data.visits).toHaveLength(newParse.data.visits.length)
    expect(mergedParse.data.meta.timeRange.minMs).toBeLessThanOrEqual(
      Date.parse('2025-01-14T01:10:51.000Z'),
    )
    expect(mergedParse.data.meta.timeRange.maxMs).toBeGreaterThanOrEqual(
      Date.parse('2026-08-20T12:31:08.000Z'),
    )
    expect(mergedParse.warnings.filter((w) => w.includes('rawSignals'))).toEqual([])
  }, 240_000)
})