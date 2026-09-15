// Sidebar stop list for the Trips view: the currently-filtered stops in
// newest-first order. Clicking an item pans the map to that stop and highlights
// the surrounding day's routes (handled by the parent).
import type { Visit } from '../lib/types'
import { useI18n } from '../lib/i18n'

export interface StopListProps {
  visits: readonly Visit[]
  limit: number
  selectedVisitIndex: number | null
  onSelect: (index: number, visit: Visit) => void
}

export default function StopList({ visits, limit, selectedVisitIndex, onSelect }: StopListProps) {
  const { t, formatNumber, formatDateTime, formatDuration } = useI18n()
  const shown = visits.slice(0, limit)
  const hidden = visits.length - shown.length

  return (
    <div className="stop-list">
      <div className="stop-list-head">{t('list.stopsHead', { n: formatNumber(visits.length) })}</div>
      {shown.length === 0 ? (
        <div className="stop-list-empty">{t('list.stopsEmpty')}</div>
      ) : (
        <ul className="stop-list-items">
          {shown.map((visit, index) => {
            const selected = selectedVisitIndex === index
            const title = visit.name ?? `${visit.lat.toFixed(4)}, ${visit.lng.toFixed(4)}`
            return (
              <li key={index}>
                <button
                  type="button"
                  className={selected ? 'stop-item selected' : 'stop-item'}
                  onClick={() => onSelect(index, visit)}
                >
                  <span className="stop-name">{title}</span>
                  {visit.address !== undefined && <span className="stop-address">{visit.address}</span>}
                  <span className="stop-meta">
                    {formatDateTime(visit.startMs)} → {formatDateTime(visit.endMs)} ·{' '}
                    {formatDuration(visit.endMs - visit.startMs)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {hidden > 0 && (
        <div className="stop-list-more">
          {t('list.more', { shown: formatNumber(shown.length), hidden: formatNumber(hidden) })}
        </div>
      )}
    </div>
  )
}
