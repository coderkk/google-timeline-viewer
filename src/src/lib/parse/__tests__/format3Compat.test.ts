// Format 3 (Semantic Location History) compatibility gaps closed per the
// community schema (locationhistoryformat.com/reference/semantic/ and
// CarlosBergillos/LocationHistoryFormat schemas/Semantic.schema.json):
//   1. placeVisit coordinates may be centerLatE7/centerLngE7 instead of a
//      `location` object.
//   2. transitPath is a `transitStops[]` array of locations, not a raw point
//      array.
import { describe, expect, it } from 'vitest'
import { getLatLng, parseSemanticElement, pathToPoints, createState } from '../common'
import { parseTimelineFile } from '../index'

describe('format 3 compat: centerLatE7/centerLngE7', () => {
  it('parses centerLatE7/centerLngE7 with the E7 conversion', () => {
    const point = getLatLng({ centerLatE7: 414216106, centerLngE7: 21684775 })
    expect(point).toEqual({ lat: expect.closeTo(41.4216106, 7), lng: expect.closeTo(2.1684775, 7) })
  })

  it('prefers latitudeE7/longitudeE7 over centerLatE7/centerLngE7', () => {
    const point = getLatLng({
      latitudeE7: 1,
      longitudeE7: 2,
      centerLatE7: 414216106,
      centerLngE7: 21684775,
    })
    expect(point).toEqual({ lat: expect.closeTo(1e-7, 7), lng: expect.closeTo(2e-7, 7) })
  })

  it('still returns null when neither E7 pair is present', () => {
    expect(getLatLng({ centerLatE7: 414216106 })).toBeNull()
    expect(getLatLng({ name: 'home' })).toBeNull()
  })

  it('parses a placeVisit that only carries centerLatE7/centerLngE7', () => {
    const warnings: string[] = []
    const state = createState(warnings)
    parseSemanticElement(
      {
        placeVisit: {
          centerLatE7: 414216106,
          centerLngE7: 21684775,
          duration: { startTimestampMs: 1714203600000, endTimestampMs: 1714207200000 },
        },
      },
      state,
      'test timelineObjects[0]',
    )
    expect(warnings).toEqual([])
    expect(state.visits).toHaveLength(1)
    expect(state.visits[0]).toMatchObject({
      lat: expect.closeTo(41.4216106, 7),
      lng: expect.closeTo(2.1684775, 7),
      startMs: 1714203600000,
      endMs: 1714207200000,
    })
  })
})

describe('format 3 compat: transitPath.transitStops', () => {
  it('extracts multiple points from a transitPath transitStops array', () => {
    const points = pathToPoints({
      transitStops: [
        { latitudeE7: 414083140, longitudeE7: 21704000 },
        { latitudeE7: 414066427, longitudeE7: 21681608 },
        { latitudeE7: 414049343, longitudeE7: 21659001 },
      ],
    })
    expect(points).toHaveLength(3)
    expect(points[0]).toEqual({ lat: expect.closeTo(41.408314, 6), lng: expect.closeTo(2.1704, 6) })
    expect(points[2]).toEqual({ lat: expect.closeTo(41.4049343, 7), lng: expect.closeTo(2.1659001, 7) })
  })

  it('resolves an activity segment whose only path is a transitPath', () => {
    const warnings: string[] = []
    const state = createState(warnings)
    parseSemanticElement(
      {
        activitySegment: {
          startLocation: { latitudeE7: 414083590, longitudeE7: 21704229 },
          endLocation: { latitudeE7: 413961889, longitudeE7: 21536695 },
          duration: { startTimestampMs: 1714200000000, endTimestampMs: 1714203600000 },
          activityType: 'IN_BUS',
          transitPath: {
            transitStops: [
              { latitudeE7: 414083140, longitudeE7: 21704000 },
              { latitudeE7: 414066427, longitudeE7: 21681608 },
              { latitudeE7: 414049343, longitudeE7: 21659001 },
            ],
          },
        },
      },
      state,
      'test timelineObjects[0]',
    )
    expect(warnings).toEqual([])
    expect(state.segments).toHaveLength(1)
    expect(state.segments[0].activityType).toBe('IN_BUS')
    expect(state.segments[0].path).toHaveLength(3)
  })

  it('parses a full format 3 file mixing both documented shapes', () => {
    const text = JSON.stringify({
      timelineObjects: [
        {
          placeVisit: {
            centerLatE7: 414216106,
            centerLngE7: 21684775,
            duration: { startTimestampMs: 1714207200000, endTimestampMs: 1714210800000 },
          },
        },
        {
          activitySegment: {
            startLocation: { latitudeE7: 414083590, longitudeE7: 21704229 },
            endLocation: { latitudeE7: 413961889, longitudeE7: 21536695 },
            duration: { startTimestampMs: 1714200000000, endTimestampMs: 1714203600000 },
            activityType: 'IN_BUS',
            transitPath: {
              transitStops: [
                { latitudeE7: 414083140, longitudeE7: 21704000 },
                { latitudeE7: 414066427, longitudeE7: 21681608 },
                { latitudeE7: 414049343, longitudeE7: 21659001 },
              ],
            },
          },
        },
      ],
    })
    const { data, warnings } = parseTimelineFile('2024_05.json', text)
    expect(warnings).toEqual([])
    expect(data.visits).toHaveLength(1)
    expect(data.segments).toHaveLength(1)
    expect(data.visits[0]).toMatchObject({
      lat: expect.closeTo(41.4216106, 7),
      lng: expect.closeTo(2.1684775, 7),
    })
    expect(data.segments[0]).toMatchObject({
      activityType: 'IN_BUS',
      start: { lat: expect.closeTo(41.408359, 6), lng: expect.closeTo(2.1704229, 7) },
      end: { lat: expect.closeTo(41.3961889, 7), lng: expect.closeTo(2.1536695, 7) },
    })
    expect(data.segments[0].path).toHaveLength(3)
  })
})