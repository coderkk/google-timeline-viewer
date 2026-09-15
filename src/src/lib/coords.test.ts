import { afterEach, describe, expect, it, vi } from 'vitest'
import { COORDS_PRIVACY_NOTE, googleMapsUrl, writeCoordsToClipboard } from './coords'

describe('writeCoordsToClipboard (privacy-safe default action)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects (instead of throwing) when the clipboard API is unavailable', async () => {
    vi.stubGlobal('navigator', {})
    await expect(writeCoordsToClipboard(25.03, 121.56)).rejects.toThrow('clipboard unavailable')
  })

  it('writes "lat,lng" when the clipboard API exists', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    await writeCoordsToClipboard(25.03, 121.56)
    expect(writeText).toHaveBeenCalledWith('25.03,121.56')
  })
})

describe('googleMapsUrl', () => {
  it('builds a coordinate deep link', () => {
    expect(googleMapsUrl(25.03, 121.56)).toBe('https://www.google.com/maps?q=25.03,121.56')
  })
})

describe('COORDS_PRIVACY_NOTE', () => {
  it('names Google explicitly so the external-link caveat is unambiguous', () => {
    expect(COORDS_PRIVACY_NOTE).toContain('Google')
    expect(COORDS_PRIVACY_NOTE).toContain('坐标')
  })
})
