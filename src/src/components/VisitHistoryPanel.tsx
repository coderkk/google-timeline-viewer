// Visit history panel: shows all historical visits to a single location
// when a marker is clicked in the Places view. Rendered as a floating card
// anchored to the bottom-right of the map, above the Leaflet controls.
import type { Visit } from '../lib/types'
import { fmtDateTime, fmtDuration } from '../lib/trips'

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
  return (
    <div className="visit-history-panel">
      <div className="visit-history-header">
        <h3 className="visit-history-title">{locationName}</h3>
        <button
          type="button"
          className="visit-history-close"
          onClick={onClose}
          aria-label="Close"
        >
          &times;
        </button>
      </div>
      <div className="visit-history-count">{visits.length} visits</div>
      <ul className="visit-history-list">
        {visits.map((visit, i) => (
          <li key={`${visit.startMs}-${i}`} className="visit-history-item">
            <div className="visit-history-time">
              {fmtDateTime(visit.startMs)} — {fmtDateTime(visit.endMs)}
            </div>
            <div className="visit-history-duration">
              {fmtDuration(visit.endMs - visit.startMs)}
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