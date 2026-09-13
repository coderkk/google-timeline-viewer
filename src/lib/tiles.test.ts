import { describe, expect, it } from 'vitest'
import {
  CUSTOM_TILE_NANE,
  OSM_ATTRIBUTION,
  OSM_TILE_SOURCE,
  OSM_TILE_URL,
  tileUrlError,
} from './tiles'

describe('tiles', () => {
  it('exposes the OpenStreetMap default with official attribution', () => {
    expect(OSM_TILE_URL).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png')
    expect(OSM_ATTRIBUTION).toContain('OpenStreetMap contributors')
    expect(OSM_TILE_SOURCE).toEqual({
      name: 'OpenStreetMap',
      url: OSM_TILE_URL,
      attribution: OSM_ATTRIBUTION,
    })
  })

  it('marks user-entered sources as custom', () => {
    expect(CUSTOM_TILE_NANE).toBe('自定义')
  })

  it('accepts a well-formed tile URL', () => {
    expect(tileUrlError('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png')).toBeNull()
    expect(tileUrlError(OSM_TILE_URL)).toBeNull()
    expect(tileUrlError('  http://localhost:8080/tiles/{z}/{x}/{y}.png  ')).toBeNull()
  })

  it('treats empty input as valid (reset-to-default signal)', () => {
    expect(tileUrlError('')).toBeNull()
    expect(tileUrlError('   ')).toBeNull()
  })

  it('rejects URLs that miss any of the {z}/{x}/{y} tokens', () => {
    const message = tileUrlError('https://example.com/tiles.png')
    expect(message).not.toBeNull()
    expect(message).toContain('{z}')
    expect(message).toContain('{x}')
    expect(message).toContain('{y}')
  })

  it('rejects URLs missing only a subset of the tokens', () => {
    const message = tileUrlError('https://example.com/{z}/{x}.png')
    expect(message).not.toBeNull()
    expect(message).toContain('缺少瓦片占位符 {y}（')
  })

  it('rejects unparsable or non-http(s) URLs', () => {
    expect(tileUrlError('not a url')).not.toBeNull()
    expect(tileUrlError('ftp://example.com/{z}/{x}/{y}.png')).not.toBeNull()
    expect(tileUrlError('file:///tmp/{z}/{x}/{y}.png')).not.toBeNull()
    expect(tileUrlError('javascript:alert(1)')).not.toBeNull()
  })
})