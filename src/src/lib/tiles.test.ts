import { describe, expect, it } from 'vitest'
import {
  OSM_ATTRIBUTION,
  OSM_TILE_SOURCE,
  OSM_TILE_URL,
  tileUrlError,
  tileUrlNotes,
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
    const error = tileUrlError('https://example.com/tiles.png')
    expect(error?.key).toBe('tiles.error.missingPlaceholders')
    expect(error?.params?.missing).toContain('{z}')
    expect(error?.params?.missing).toContain('{x}')
    expect(error?.params?.missing).toContain('{y}')
  })

  it('rejects URLs missing only a subset of the tokens', () => {
    const error = tileUrlError('https://example.com/{z}/{x}.png')
    expect(error?.key).toBe('tiles.error.missingPlaceholders')
    expect(error?.params?.missing).toBe('{y}')
  })

  it('rejects unparsable or non-http(s) URLs', () => {
    expect(tileUrlError('not a url')?.key).toBe('tiles.error.unparseable')
    expect(tileUrlError('ftp://example.com/{z}/{x}/{y}.png')?.key).toBe('tiles.error.scheme')
    expect(tileUrlError('file:///tmp/{z}/{x}/{y}.png')?.key).toBe('tiles.error.scheme')
    expect(tileUrlError('javascript:alert(1)')?.key).toBe('tiles.error.scheme')
  })
})

describe('tileUrlNotes', () => {
  it('returns no notes for empty or https URLs', () => {
    expect(tileUrlNotes('')).toEqual([])
    expect(tileUrlNotes(OSM_TILE_URL)).toEqual([])
    expect(tileUrlNotes('https://tiles.example.com/{z}/{x}/{y}.png')).toEqual([])
  })

  it('warns about cleartext http:// tile sources', () => {
    const notes = tileUrlNotes('http://192.168.1.10/tiles/{z}/{x}/{y}.png')
    expect(notes.map((n) => n.kind)).toEqual(['cleartext'])
    expect(notes[0].key).toBe('tiles.note.insecure')
  })

  it('explains {s} subdomains and flags the OSM conflict', () => {
    const notes = tileUrlNotes('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png')
    expect(notes.map((n) => n.kind)).toEqual(['subdomains', 'osm-subdomains'])
    expect(notes[0].key).toBe('tiles.note.subdomains')
    expect(notes[1].key).toBe('tiles.note.osmNoSubdomains')
  })

  it('combines cleartext and {s} notes, with no OSM conflict for non-OSM hosts', () => {
    const notes = tileUrlNotes('http://{s}.tiles.example.com/{z}/{x}/{y}.png')
    expect(notes.map((n) => n.kind)).toEqual(['cleartext', 'subdomains'])
  })
})
