// Trip statistics panel (T27 / PRD 功能 11). Sits in the Trips sidebar directly
// under the date-range picker so the numbers are read in the same place the
// range is chosen, and update live with the shared filter. All computation is
// local and memoized on the filtered inputs.
import { useMemo } from 'react'
import { computeTripStats } from '../lib/stats'
import type { Segment, Visit } from '../lib/types'
import type { DateRangeFilter, TimelineVertex } from '../lib/trips'
import { useI18n } from '../lib/i18n'

export interface TripStatsPanelProps {
  route: readonly TimelineVertex[]
  segments: readonly Segment[]
  visits: readonly Visit[]
  /** Which map mode is active — the distance must match what is drawn. */
  mode: 'activityType' | 'timeline'
  range: DateRangeFilter
}

export default function TripStatsPanel({ route, segments, visits, mode, range }: TripStatsPanelProps) {
  const { t, formatNumber, formatDuration, formatDistanceKm } = useI18n()
  const stats = useMemo(
    () =>
      computeTripStats({
        route,
        segments,
        visits,
        range,
        distanceSource: mode === 'timeline' ? 'route' : 'segments',
      }),
    [route, segments, visits, range, mode],
  )

  return (
    <section className="trip-stats">
      <div className="stop-list-head">{t('trips.stats.title')}</div>
      <dl className="trip-stats-grid">
        <div>
          <dt>{t('trips.stats.totalDistance')}</dt>
          <dd>{formatDistanceKm(stats.totalDistanceKm)}</dd>
        </div>
        <div>
          <dt>{t('trips.stats.activeDays')}</dt>
          <dd>{t('trips.stats.days', { n: formatNumber(stats.activeDays) })}</dd>
        </div>
        <div>
          <dt>{t('trips.stats.dailyDistance')}</dt>
          <dd>{formatDistanceKm(stats.avgDistanceKmPerDay)}</dd>
        </div>
        <div>
          <dt>{t('trips.stats.dailyStay')}</dt>
          <dd>{formatDuration(stats.avgStayMsPerDay)}</dd>
        </div>
      </dl>
      <div className="trip-stats-places">
        <div className="trip-stats-places-head">{t('trips.stats.topPlaces', { n: 5 })}</div>
        {stats.topPlaces.length === 0 ? (
          <div className="trip-stats-empty">{t('trips.stats.noPlaces')}</div>
        ) : (
          <ul className="trip-stats-places-list">
            {stats.topPlaces.map((place) => (
              <li key={place.key}>
                <span className="trip-stats-place-name" title={place.name}>
                  {place.name}
                </span>
                <span className="trip-stats-place-meta">
                  {t('trips.stats.visits', { n: formatNumber(place.count) })} ·{' '}
                  {formatDuration(place.totalDurationMs)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
