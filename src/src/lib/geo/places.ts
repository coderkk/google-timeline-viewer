// Constants and small helpers shared by the Places view. Radius bands are the
// product spec's five click-to-explore scopes; the result list is capped to
// keep the sidebar light on decade-spanning datasets.
export const PLACE_RADII_KM = [1, 5, 10, 50, 100] as const

/** Maximum number of result list entries rendered for one query. */
export const PLACES_RESULT_LIMIT = 200

/**
 * Format a great-circle distance with decimals that adapt to magnitude:
 * 2 decimals under 10 km, 1 decimal from 10 km up.
 */
export function fmtDistanceKm(km: number): string {
  if (!Number.isFinite(km)) return '—'
  const digits = km < 10 ? 2 : 1
  return `${km.toFixed(digits)} km`
}