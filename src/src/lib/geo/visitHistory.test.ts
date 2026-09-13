import { describe, expect, it } from 'vitest'
import { groupVisitsByLocation, visitGroupKey } from './visitHistory'
import type { Visit } from '../types'

function makeVisit(overrides: Partial<Visit> = {}): Visit {
  return {
    lat: 25.033,
    lng: 121.565,
    startMs: 1000,
    endMs: 2000,
    ...overrides,
  }
}

describe('visitGroupKey', () => {
  it('uses name when present', () => {
    const v = makeVisit({ name: 'Home' })
    expect(visitGroupKey(v)).toBe('Home')
  })

  it('falls back to address when name is empty', () => {
    const v = makeVisit({ name: '', address: '123 Main St' })
    expect(visitGroupKey(v)).toBe('123 Main St')
  })

  it('falls back to coordinate bucket when both are absent', () => {
    const v = makeVisit({ name: '', address: '' })
    expect(visitGroupKey(v)).toBe('(25.03,121.56)')
  })

  it('trims whitespace from name', () => {
    const v = makeVisit({ name: '  Home  ' })
    expect(visitGroupKey(v)).toBe('Home')
  })
})

describe('groupVisitsByLocation', () => {
  it('groups visits with the same name', () => {
    const visits = [
      makeVisit({ name: 'Home', startMs: 1000 }),
      makeVisit({ name: 'Home', startMs: 2000 }),
      makeVisit({ name: 'Work', startMs: 3000 }),
    ]
    const groups = groupVisitsByLocation(visits)
    expect(groups.get('Home')?.length).toBe(2)
    expect(groups.get('Work')?.length).toBe(1)
  })

  it('sorts groups newest-first', () => {
    const visits = [
      makeVisit({ name: 'Home', startMs: 1000 }),
      makeVisit({ name: 'Home', startMs: 3000 }),
      makeVisit({ name: 'Home', startMs: 2000 }),
    ]
    const groups = groupVisitsByLocation(visits)
    const home = groups.get('Home')!
    expect(home[0].startMs).toBe(3000)
    expect(home[1].startMs).toBe(2000)
    expect(home[2].startMs).toBe(1000)
  })

  it('uses address as fallback key', () => {
    const visits = [
      makeVisit({ name: '', address: 'A', startMs: 1000 }),
      makeVisit({ name: '', address: 'A', startMs: 2000 }),
      makeVisit({ name: '', address: 'B', startMs: 3000 }),
    ]
    const groups = groupVisitsByLocation(visits)
    expect(groups.get('A')?.length).toBe(2)
    expect(groups.get('B')?.length).toBe(1)
  })

  it('returns empty map for empty input', () => {
    const groups = groupVisitsByLocation([])
    expect(groups.size).toBe(0)
  })
})