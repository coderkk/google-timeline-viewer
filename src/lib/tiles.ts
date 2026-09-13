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

export interface TileUrlNote {
  kind: 'cleartext' | 'subdomains' | 'osm-subdomains'
  /** User-facing warning / explanation shown next to the input. */
  text: string
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
    notes.push({
      kind: 'cleartext',
      text: '⚠ 明文传输：数据可能被网络中间人篡改，建议使用 https 或内网瓦片源',
    })
  }
  if (trimmed.includes('{s}')) {
    notes.push({
      kind: 'subdomains',
      text: '{s} 将向 a/b/c 多个主机发起请求',
    })
    if (parsed.hostname.includes(OSM_PUBLIC_HOST)) {
      notes.push({
        kind: 'osm-subdomains',
        text: 'OSM 公共服务器不支持 {s}，瓦片将加载失败',
      })
    }
  }
  return notes
}