// Inline fixtures mirroring the four real-world Google Timeline export shapes.
// Coordinates use round E7 values for easy assertion (e.g. 523719400 = 52.37194).

export const FIXTURE_TIMELINE_DIRECT_ARRAY = JSON.stringify([
  {
    semanticSegments: [
      {
        startTime: '2024-05-01T07:00:00.000Z',
        endTime: '2024-05-01T07:40:00.000Z',
        activityType: 'IN_PASSENGER_VEHICLE',
        startLocation: { latitudeE7: 523719400, longitudeE7: 13375000, name: 'Home', placeId: 'home' },
        endLocation: { latitudeE7: 524433000, longitudeE7: 13518900 },
        waypointPath: {
          waypoints: [
            { latE7: 523719400, lngE7: 13375000 },
            { latE7: 524000000, lngE7: 13400000 },
            { latE7: 524433000, lngE7: 13518900 },
          ],
        },
      },
      {
        startTime: '2024-05-01T07:40:00.000Z',
        endTime: '2024-05-01T09:10:00.000Z',
        placeVisit: {
          location: {
            name: 'Office',
            address: '1 Main St',
            latitudeE7: 524433000,
            longitudeE7: 13518900,
            placeId: 'office',
          },
          duration: {
            startTimestampMs: '2024-05-01T07:40:00.000Z',
            endTimestampMs: '2024-05-01T09:10:00.000Z',
          },
        },
      },
    ],
  },
])

export const FIXTURE_RECORDS = JSON.stringify({
  locations: [
    {
      timestampMs: 1714543200000,
      latitudeE7: 523719400,
      longitudeE7: 13375000,
      accuracyMeters: 12,
      source: 'DMS',
    },
    { timestampMs: 1714545000000, latitudeE7: 524000000, longitudeE7: 13400000, accuracy: 8 },
  ],
  activitySegments: [
    {
      startLocation: { latitudeE7: 523719400, longitudeE7: 13375000 },
      endLocation: { latitudeE7: 524433000, longitudeE7: 13518900 },
      duration: { startTimestampMs: 1714543200000, endTimestampMs: 1714545600000 },
      activityType: 'IN_PASSENGER_VEHICLE',
      waypointPath: [
        { latE7: 523719400, lngE7: 13375000 },
        { latE7: 524433000, lngE7: 13518900 },
      ],
    },
  ],
  savedPlaces: [{ name: 'Museum', latitudeE7: 525000000, longitudeE7: 13000000 }],
})

export const FIXTURE_SEMANTIC_HISTORY = JSON.stringify({
  timelineObjects: [
    {
      activitySegment: {
        startLocation: { latitudeE7: 523719400, longitudeE7: 13375000 },
        endLocation: { latitudeE7: 524433000, longitudeE7: 13518900 },
        duration: { startTimestampMs: 1714200000000, endTimestampMs: 1714203600000 },
        activityType: 'WALKING',
        waypointPath: [
          { latE7: 523719400, lngE7: 13375000 },
          { latE7: 524400000, lngE7: 13510000 },
          { latE7: 524433000, lngE7: 13518900 },
        ],
      },
    },
    {
      placeVisit: {
        location: {
          name: 'Cafe',
          address: '2 High St',
          latitudeE7: 524433000,
          longitudeE7: 13518900,
        },
        duration: { startTimestampMs: 1714203600000, endTimestampMs: 1714207200000 },
      },
    },
  ],
})

export const FIXTURE_LOCATION_HISTORY = JSON.stringify({
  locations: [
    { timestampMs: 1289894400000, latitudeE7: 523719400, longitudeE7: 13375000, accuracy: 30 },
    { timestampMs: 1289898000000, latitudeE7: 524000000, longitudeE7: 13400000, accuracy: 25 },
  ],
})

/** A known-good format-4 payload used to assert detection stays on format 4. */
export const FIXTURE_LOCATION_ONLY = JSON.stringify({
  locations: [{ timestampMs: 1289894400000, latitudeE7: 523719400, longitudeE7: 13375000 }],
})

/** A Records-shaped payload with an empty activitySegments list. */
export const FIXTURE_RECORDS_EMPTY_SEGMENTS = JSON.stringify({
  locations: [{ timestampMs: 1289894400000, latitudeE7: 523719400, longitudeE7: 13375000 }],
  activitySegments: [],
})

export const FIXTURE_EMPTY_OBJECT = '{}'
export const FIXTURE_EMPTY_ARRAY = '[]'
export const FIXTURE_EMPTY_LOCATIONS = JSON.stringify({ locations: [] })

/**
 * Format-1 variant from the 2026+ Android/iOS device export: a top-level
 * object whose `semanticSegments` items are flat `visit` / `activity` /
 * `timelinePath` records. Coordinates use the "lat°, lng°" string spelling.
 */
export const FIXTURE_DEVICE_EXPORT_2026 = JSON.stringify({
  semanticSegments: [
    {
      startTime: '2012-12-30T15:15:50.000+08:00',
      endTime: '2012-12-30T20:48:23.000+08:00',
      startTimeTimezoneUtcOffsetMinutes: 480,
      endTimeTimezoneUtcOffsetMinutes: 480,
      visit: {
        hierarchyLevel: 0,
        probability: 0.86,
        topCandidate: {
          placeId: 'ChIJ-TqqarRsOzIRqQZVixuJl8M',
          semanticType: 'UNKNOWN',
          placeLocation: { latLng: '6.060128°, 116.155137°' },
        },
      },
    },
    {
      startTime: '2013-01-02T00:57:04.000+08:00',
      endTime: '2013-01-02T09:35:40.000+08:00',
      startTimeTimezoneUtcOffsetMinutes: 480,
      endTimeTimezoneUtcOffsetMinutes: 480,
      activity: {
        distanceMeters: 12812,
        end: { latLng: '5.9616525°, 116.0972516°' },
        start: { latLng: '6.0611445°, 116.1556962°' },
        topCandidate: { type: 'IN_PASSENGER_VEHICLE', probability: 0 },
      },
    },
    {
      startTime: '2013-01-02T09:35:40.000+08:00',
      endTime: '2013-01-02T10:00:00.000+08:00',
      timelinePath: [
        { point: '6.0611385°, 116.1557205°', time: '2013-01-02T09:40:00.000+08:00' },
        { point: '6.0100000°, 116.1200000°', time: '2013-01-02T09:50:00.000+08:00' },
      ],
    },
  ],
})