import { describe, expect, it } from 'vitest'
import { fmtDistanceKm, PLACE_RADII_KM, PLACES_RESULT_LIMIT } from './places'

describe('places helpers', () => {
  it('formats distance with adaptive decimals', () => {
    expect(fmtDistanceKm(3.256)).toBe('3.26 km')
    expect(fmtDistanceKm(45.678)).toBe('45.7 km')
    expect(fmtDistanceKm(1000)).toBe('1000.0 km')
  })

  it('formats invalid distances as dash', () => {
    expect(fmtDistanceKm(Number.NaN)).toBe('—')
  })

  it('exposes the four radius bands and the result cap', () => {
    expect(PLACE_RADII_KM).toEqual([10, 100, 1000, 5000])
    expect(PLACES_RESULT_LIMIT).toBe(200)
  })
})