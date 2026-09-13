// Group visits by a stable location key: prefer `name`, fall back to
// `address`, then to a coarse coordinate bucket (0.01° ≈ 1 km).
// Returns a map from key → visits sharing that key, sorted newest first.
import type { Visit } from '../types'

/**
 * Group key for a visit.
 * - `name` if present and non-empty
 * - `address` if name is absent
 * - coarse lat/lng bucket (0.01° ≈ 1 km) when both are missing
 */
export function visitGroupKey(v: Visit): string {
  if (v.name && v.name.trim()) return v.name.trim()
  if (v.address && v.address.trim()) return v.address.trim()
  return `(${v.lat.toFixed(2)},${v.lng.toFixed(2)})`
}

/**
 * Group visits by location key and return them sorted newest-first.
 */
export function groupVisitsByLocation(visits: Visit[]): Map<string, Visit[]> {
  const groups = new Map<string, Visit[]>()
  for (const v of visits) {
    const key = visitGroupKey(v)
    const existing = groups.get(key)
    if (existing) {
      existing.push(v)
    } else {
      groups.set(key, [v])
    }
  }
  // Sort each group newest-first
  for (const visits of groups.values()) {
    visits.sort((a, b) => b.startMs - a.startMs)
  }
  return groups
}