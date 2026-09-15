// Tile source configuration: the OpenStreetMap default plus the validation
// helpers used by the settings page. The map reads the active source from the
// global store, so swapping the URL live re-renders every <TileLayer>. Loading
// tiles always leaks the viewer's IP + visible bounding box to the chosen
// server — that trade-off is declared openly next to the custom-source input.
//
// Validation returns message KEYS (not prose) so the UI can render them in the
// active language.
import type { MessageKey } from './i18n'

export interface TileSource {
  /** Display name shown in the settings panel. */
  name: string
  /** Leaflet template with {z}/{x}/{y} (optionally {s}) placeholders. */
  url: string
  /** Attribution text rendered on the map. */
  attribution: string
}

export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

export const OSM_ATTRIBUTION = '&copy; OpenStreetMap contributors'

export const OSM_TILE_SOURCE: TileSource = {
  name: 'OpenStreetMap',
  url: OSM_TILE_URL,
  attribution: OSM_ATTRIBUTION,
}

/** Language-neutral sentinel name for a user-supplied tile source. */
export const CUSTOM_TILE_NAME = 'custom'

const TILE_TOKENS = ['{z}', '{x}', '{y}'] as const

export interface TileUrlError {
  key: MessageKey
  params?: Record<string, string | number>
}

/**
 * Validate a candidate tile URL. Returns a message key when the URL is
 * unusable, or null when it may be applied. Empty input is intentionally
 * treated as valid — the UI maps it onto "reset to default".
 */
export function tileUrlError(url: string): TileUrlError | null {
  const trimmed = url.trim()
  if (trimmed === '') return null
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return { key: 'tiles.error.unparseable' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { key: 'tiles.error.scheme' }
  }
  const missing = TILE_TOKENS.filter((token) => !trimmed.includes(token))
  if (missing.length > 0) {
    return { key: 'tiles.error.missingPlaceholders', params: { missing: missing.join(' / ') } }
  }
  return null
}

export interface TileUrlNote {
  kind: 'cleartext' | 'subdomains' | 'osm-subdomains'
  /** Message key for the warning / explanation shown next to the input. */
  key: MessageKey
  params?: Record<string, string | number>
}

/** Unnamed hosts commonly exposing {z}/{x}/{y} {s}. */
const OSM_PUBLIC_HOST = 'openstreetmap.org'

/**
 * Non-blocking advisory notes for a candidate tile URL. Mirrors of the input
 * help the user understand two risky choices: plaintext http:// transport
 * (network middlemen can rewrite tiles) and the {s} subdomain placeholder
 * (which spawns requests to a/b/c hosts — unsupported by the OSM public
 * servers, which no longer answer {s} subdomains).
 */
export function tileUrlNotes(url: string): TileUrlNote[] {
  const trimmed = url.trim()
  const notes: TileUrlNote[] = []
  if (trimmed === '') return notes
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return notes
  }
  if (parsed.protocol === 'http:') {
    notes.push({ kind: 'cleartext', key: 'tiles.note.insecure' })
  }
  if (trimmed.includes('{s}')) {
    notes.push({ kind: 'subdomains', key: 'tiles.note.subdomains', params: { s: '{s}' } })
    if (parsed.hostname.includes(OSM_PUBLIC_HOST)) {
      notes.push({ kind: 'osm-subdomains', key: 'tiles.note.osmNoSubdomains', params: { s: '{s}' } })
    }
  }
  return notes
}
