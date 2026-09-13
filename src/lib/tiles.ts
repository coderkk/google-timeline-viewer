// Tile source configuration: the OpenStreetMap default plus the validation
// helpers used by the settings page. The map reads the active source from the
// global store, so swapping the URL live re-renders every <TileLayer>. Loading
// tiles always leaks the viewer's IP + visible bounding box to the chosen
// server — that trade-off is declared openly next to the custom-source input.

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

export const CUSTOM_TILE_NANE = '自定义'

const TILE_TOKENS = ['{z}', '{x}', '{y}'] as const

/**
 * Validate a candidate tile URL. Returns a user-facing message when the URL is
 * unusable, or null when it may be applied. Empty input is intentionally
 * treated as valid — the UI maps it onto "reset to default".
 */
export function tileUrlError(url: string): string | null {
  const trimmed = url.trim()
  if (trimmed === '') return null
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return 'URL 无法解析，请以 http:// 或 https:// 开头'
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return '瓦片地址必须使用 http:// 或 https://'
  }
  const missing = TILE_TOKENS.filter((token) => !trimmed.includes(token))
  if (missing.length > 0) {
    return `URL 缺少瓦片占位符 ${missing.join(' / ')}（Leaflet 需要 {z}/{x}/{y}）`
  }
  return null
}