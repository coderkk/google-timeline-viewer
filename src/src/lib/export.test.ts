import { describe, expect, it } from 'vitest'
import {
  buildExport,
  buildGeoJson,
  buildKml,
  exportExtension,
  exportFileName,
  exportMimeType,
} from './export'
import type { Visit } from './types'

const route = [
  { lat: 25.03, lng: 121.56 },
  { lat: 25.04, lng: 121.57 },
]

const visits: Visit[] = [
  {
    lat: 25.033,
    lng: 121.5654,
    name: '台北車站',
    address: '中正區',
    startMs: 1_700_000_000_000,
    endMs: 1_700_000_600_000,
  },
]

describe('buildGeoJson (T25)', () => {
  it('emits a LineString for the route and a Point per stay', () => {
    const doc = JSON.parse(buildGeoJson({ route, visits })) as {
      type: string
      features: { geometry: { type: string; coordinates: unknown } }[]
    }
    expect(doc.type).toBe('FeatureCollection')
    expect(doc.features).toHaveLength(2)
    expect(doc.features[0].geometry.type).toBe('LineString')
    // GeoJSON coordinates are [lng, lat], not [lat, lng].
    expect(doc.features[0].geometry.coordinates).toEqual([
      [121.56, 25.03],
      [121.57, 25.04],
    ])
    expect(doc.features[1].geometry.type).toBe('Point')
    expect(doc.features[1].geometry.coordinates).toEqual([121.5654, 25.033])
  })

  it('omits the route feature when there are fewer than two vertices', () => {
    const doc = JSON.parse(buildGeoJson({ route: [{ lat: 1, lng: 2 }], visits: [] })) as {
      features: unknown[]
    }
    expect(doc.features).toHaveLength(0)
  })

  it('carries only data content — no file/device metadata field', () => {
    const doc = buildGeoJson({ route, visits })
    expect(doc).not.toMatch(/fileName|filename|device|sourceFile|dataLabel|path/i)
  })
})

describe('buildKml (T25)', () => {
  it('emits a LineString and Point placemarks with lng,lat,0 coordinates', () => {
    const kml = buildKml({ route, visits })
    expect(kml).toContain('<LineString>')
    expect(kml).toContain('<coordinates>121.56,25.03,0 121.57,25.04,0</coordinates>')
    expect(kml).toContain('<Point>')
    expect(kml).toContain('<coordinates>121.5654,25.033,0</coordinates>')
    expect(kml.startsWith('<?xml')).toBe(true)
  })

  it('escapes XML-significant characters in place names', () => {
    const kml = buildKml({
      route: [],
      visits: [{ lat: 1, lng: 2, name: 'A & B <cafe>', startMs: 0, endMs: 1 }],
    })
    expect(kml).toContain('A &amp; B &lt;cafe&gt;')
    expect(kml).not.toContain('<cafe>')
  })
})

describe('export file naming / dispatch (T25)', () => {
  it('derives the file name from the range only, never the source file', () => {
    const name = exportFileName('geojson', {
      startMs: new Date(2025, 0, 30).getTime(),
      endMs: new Date(2025, 1, 2).getTime(),
    })
    expect(name).toBe('timeline-20250130-20250202.geojson')
  })

  it('handles open-ended ranges with "all"', () => {
    expect(exportFileName('kml', { startMs: null, endMs: null })).toBe('timeline-all-all.kml')
  })

  it('dispatches to the requested format with matching mime + extension', () => {
    expect(buildExport('geojson', { route, visits: [] })).toContain('FeatureCollection')
    expect(buildExport('kml', { route, visits: [] })).toContain('<kml')
    expect(exportMimeType('geojson')).toBe('application/geo+json')
    expect(exportMimeType('kml')).toBe('application/vnd.google-earth.kml+xml')
    expect(exportExtension('geojson')).toBe('geojson')
    expect(exportExtension('kml')).toBe('kml')
  })
})
