// Visit history panel: shows all historical visits to a single location
// when a marker is clicked in the Places view. Rendered as a floating card
// anchored to the bottom-right of the map, above the Leaflet controls.
import type { Visit } from '../lib/types'
import { useI18n } from '../lib/i18n'

interface VisitHistoryPanelProps {
  locationName: string
  visits: Visit[]
  onClose: () => void
}

export default function VisitHistoryPanel({
  locationName,
  visits,
  onClose,
}: VisitHistoryPanelProps) {
  const { t, formatNumber, formatDateTime, formatDuration } = useI18n()
  return (
    <div className="visit-history-panel">
      <div className="visit-history-header">
        <h3 className="visit-history-title">{locationName || t('places.nearby')}</h3>
        <button
          type="button"
          className="visit-history-close"
          onClick={onClose}
          aria-label={t('common.close')}
        >
          &times;
        </button>
      </div>
      <div className="visit-history-count">{t('places.visitCount', { n: formatNumber(visits.length) })}</div>
      <ul className="visit-history-list">
        {visits.map((visit, i) => (
          <li key={`${visit.startMs}-${i}`} className="visit-history-item">
            <div className="visit-history-time">
              {formatDateTime(visit.startMs)} — {formatDateTime(visit.endMs)}
            </div>
            <div className="visit-history-duration">
              {formatDuration(visit.endMs - visit.startMs)}
            </div>
            {visit.address && (
              <div className="visit-history-address">{visit.address}</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
