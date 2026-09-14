import { describe, expect, it } from 'vitest'
import { parseTimelineFile } from '../parse'
import { loadSampleTimeline, SAMPLE_FILE_NAME } from './index'
import sampleRaw from './sample-timeline.json?raw'

describe('sample timeline data', () => {
  const pathPointCount = (data: { segments: { path: unknown[] }[] }): number =>
    data.segments.reduce((sum, segment) => sum + segment.path.length, 0)

  it('parses through the format-1 pipeline without warnings', () => {
    const { data, warnings } = parseTimelineFile(SAMPLE_FILE_NAME, sampleRaw)
    expect(warnings).toEqual([])
    expect(pathPointCount(data)).toBeGreaterThanOrEqual(300)
    expect(pathPointCount(data)).toBeLessThanOrEqual(2500)
    expect(data.segments.length).toBeGreaterThan(50)
    expect(data.visits.length).toBeGreaterThan(50)
    // The bundled rawSignals stream (432 fixes) flows into the point data.
    expect(data.points.length).toBeGreaterThan(0)
  })

  it('spans several weeks with a realistic time range', () => {
    const { data } = parseTimelineFile(SAMPLE_FILE_NAME, sampleRaw)
    expect(data.meta.timeRange.minMs).toBeGreaterThanOrEqual(Date.UTC(2026, 6, 20))
    expect(data.meta.timeRange.maxMs).toBeLessThanOrEqual(Date.UTC(2026, 8, 12))
    expect(data.meta.timeRange.maxMs - data.meta.timeRange.minMs).toBeGreaterThan(30 * 24 * 3600 * 1000)
  })

  it('covers multiple cities (inter-city drive + within-city walking)', () => {
    const { data } = parseTimelineFile(SAMPLE_FILE_NAME, sampleRaw)
    const lats = data.segments.map((s) => [s.start.lat, s.end.lat]).flat()
    const latitudes = Array.from(new Set(lats.map((lat) => Math.round(lat))))
    expect(latitudes.length).toBeGreaterThanOrEqual(3)
    const activities = new Set(data.segments.map((s) => s.activityType))
    expect(activities.has('IN_FLIGHT')).toBe(true)
    expect(activities.has('WALKING')).toBe(true)
  })

  it('loadSampleTimeline resolves the parsed dataset', async () => {
    const data = await loadSampleTimeline()
    expect(data.segments.length).toBeGreaterThan(0)
    expect(data.meta.fileCount).toBe(1)
  })
})