// Trip export (T25): turn the CURRENTLY FILTERED trajectory + stays into a
// GeoJSON or KML document the user can open in another map tool.
//
// Privacy guardrails (PRD 功能 10):
// - Only the current filter range is exported; the caller passes the already
//   filtered route/visits.
// - No source-file name, device identifier, filesystem path or app metadata is
//   emitted — only geometry and the timestamps/place names that are the data
//   itself. This module deliberately has no access to the store's `dataLabel`.
// - The document is built in memory and handed to the browser as a Blob; there
//   is no upload, no share link and no network request anywhere in this path.
import type { TimelineVertex } from './trips'
import type { Visit } from './types'

export interface ExportInput {
  route: readonly TimelineVertex[]
  visits: readonly Visit[]
}

export type ExportFormat = 'geojson' | 'kml'

/** Range shown in the confirmation dialog and the suggested file name. */
export interface ExportRange {
  startMs: number | null
  endMs: number | null
}

/** Coordinates as GeoJSON expects them: [lng, lat]. */
function lonLat(lat: number, lng: number): [number, number] {
  return [lng, lat]
}

/** Escape the five XML predefined entities so place names can't break the KML. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

interface GeoJsonFeature {
  type: 'Feature'
  properties: Record<string, string | number>
  geometry:
    | { type: 'LineString'; coordinates: [number, number][] }
    | { type: 'Point'; coordinates: [number, number] }
}

/**
 * GeoJSON FeatureCollection: one LineString for the trajectory plus one Point
 * per stay. `properties` carries only data content (kind, time, place name) —
 * never a file name or device field.
 */
export function buildGeoJson(input: ExportInput): string {
  const features: GeoJsonFeature[] = []
  if (input.route.length >= 2) {
    features.push({
      type: 'Feature',
      properties: { kind: 'route', pointCount: input.route.length },
      geometry: {
        type: 'LineString',
        coordinates: input.route.map((p) => lonLat(p.lat, p.lng)),
      },
    })
  }
  for (const visit of input.visits) {
    const properties: Record<string, string | number> = {
      kind: 'stay',
      startMs: visit.startMs,
      endMs: visit.endMs,
    }
    if (visit.name !== undefined) properties.name = visit.name
    if (visit.address !== undefined) properties.address = visit.address
    features.push({
      type: 'Feature',
      properties,
      geometry: { type: 'Point', coordinates: lonLat(visit.lat, visit.lng) },
    })
  }
  return JSON.stringify({ type: 'FeatureCollection', features }, null, 2)
}

export interface ExportLabels {
  /** Placemark name for the trajectory LineString. */
  routeName: string
  /** KML <Document><name>. */
  docName: string
}

const DEFAULT_LABELS: ExportLabels = { routeName: 'Trajectory', docName: 'Timeline trip export' }

/**
 * KML document: one LineString Placemark for the trajectory plus a Point
 * Placemark per stay. Built as strings (KML is XML) with every interpolated
 * text value escaped.
 */
export function buildKml(input: ExportInput, labels: ExportLabels = DEFAULT_LABELS): string {
  const placemarks: string[] = []
  if (input.route.length >= 2) {
    const coords = input.route.map((p) => `${p.lng},${p.lat},0`).join(' ')
    placemarks.push(
      [
        '    <Placemark>',
        `      <name>${escapeXml(labels.routeName)}</name>`,
        '      <LineString>',
        '        <tessellate>1</tessellate>',
        `        <coordinates>${coords}</coordinates>`,
        '      </LineString>',
        '    </Placemark>',
      ].join('\n'),
    )
  }
  for (const visit of input.visits) {
    const label = visit.name ?? visit.address ?? `${visit.lat.toFixed(5)}, ${visit.lng.toFixed(5)}`
    placemarks.push(
      [
        '    <Placemark>',
        `      <name>${escapeXml(label)}</name>`,
        '      <Point>',
        `        <coordinates>${visit.lng},${visit.lat},0</coordinates>`,
        '      </Point>',
        '    </Placemark>',
      ].join('\n'),
    )
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2">',
    '  <Document>',
    `    <name>${escapeXml(labels.docName)}</name>`,
    ...placemarks,
    '  </Document>',
    '</kml>',
    '',
  ].join('\n')
}

export function buildExport(format: ExportFormat, input: ExportInput, labels?: ExportLabels): string {
  return format === 'geojson' ? buildGeoJson(input) : buildKml(input, labels)
}

export function exportMimeType(format: ExportFormat): string {
  return format === 'geojson' ? 'application/geo+json' : 'application/vnd.google-earth.kml+xml'
}

export function exportExtension(format: ExportFormat): string {
  return format === 'geojson' ? 'geojson' : 'kml'
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function dateStamp(ms: number | null): string {
  if (ms === null) return 'all'
  const d = new Date(ms)
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`
}

/**
 * Suggested download name derived ONLY from the selected range — never from the
 * imported file name, so the export cannot leak the original file name.
 */
export function exportFileName(format: ExportFormat, range: ExportRange): string {
  return `timeline-${dateStamp(range.startMs)}-${dateStamp(range.endMs)}.${exportExtension(format)}`
}
