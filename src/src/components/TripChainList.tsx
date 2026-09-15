// Trip-chain sidebar for the Trips view's activityType mode (T29 / PRD 功能 13).
// Renders each stay followed by the movement that leaves it, so the list reads
// as a travel diary. Clicking a stay flies to it; clicking a movement row flies
// to that segment and highlights it on the map.
import type { Visit } from '../lib/types'
import type { ChainMovement, TripChain } from '../lib/tripChain'
import { activityMessageKey } from '../lib/i18n/activity'
import { useI18n } from '../lib/i18n'

export interface TripChainListProps {
  chain: TripChain
  limit: number
  selectedVisitIndex: number | null
  selectedSegmentIndex: number | null
  onSelectVisit: (visitIndex: number, visit: Visit) => void
  onSelectSegment: (segmentIndex: number) => void
}

/** Display label for a stay: place name, falling back to coordinates. */
function stayLabel(visit: Visit): string {
  return visit.name ?? `${visit.lat.toFixed(4)}, ${visit.lng.toFixed(4)}`
}

export default function TripChainList({
  chain,
  limit,
  selectedVisitIndex,
  selectedSegmentIndex,
  onSelectVisit,
  onSelectSegment,
}: TripChainListProps) {
  const { t, formatNumber, formatDateTime, formatDuration, formatDistanceKm } = useI18n()
  const shown = chain.visits.slice(0, limit)
  const hidden = chain.visits.length - shown.length

  const movementLine = (movement: ChainMovement, incoming: boolean, dest: string): string =>
    t(incoming ? 'chain.incoming' : 'chain.outgoing', {
      mode: t(activityMessageKey(movement.activityType)),
      duration: formatDuration(movement.durationMs),
      distance: formatDistanceKm(movement.distanceKm),
      dest,
    })

  // A movement is rendered once: as the previous stay's outgoing row, or (when
  // it is not that) as this stay's incoming row. Precomputed (pure) so the
  // render map has no reassignment.
  const rows = shown.map((node, i) => {
    const previousOutgoing = i > 0 ? shown[i - 1].outgoing?.segmentIndex : undefined
    const incoming = node.incoming
    const showIncoming = incoming !== undefined && incoming.segmentIndex !== previousOutgoing
    return { node, incoming: showIncoming ? incoming : undefined, next: chain.visits[i + 1]?.visit }
  })

  return (
    <div className="chain-list">
      <div className="stop-list-head">{t('chain.head', { n: formatNumber(chain.visits.length) })}</div>
      {shown.length === 0 ? (
        <div className="stop-list-empty">{t('chain.empty')}</div>
      ) : (
        <ul className="chain-items">
          {rows.map(({ node, incoming, next }) => {
            const selected = node.visitIndex === selectedVisitIndex
            const outgoing = node.outgoing
            const outgoingDest =
              outgoing === undefined
                ? ''
                : next !== undefined
                  ? stayLabel(next)
                  : `${outgoing.end.lat.toFixed(4)}, ${outgoing.end.lng.toFixed(4)}`
            return (
              <li key={node.visitIndex} className="chain-item">
                {incoming !== undefined && (
                  <button
                    type="button"
                    className={`chain-move chain-move--in${incoming.segmentIndex === selectedSegmentIndex ? ' selected' : ''}`}
                    onClick={() => onSelectSegment(incoming.segmentIndex)}
                  >
                    {movementLine(incoming, true, t('chain.destHere'))}
                  </button>
                )}
                <button
                  type="button"
                  className={`chain-stay${selected ? ' selected' : ''}`}
                  onClick={() => onSelectVisit(node.visitIndex, node.visit)}
                >
                  <span className="chain-stay-title">{stayLabel(node.visit)}</span>
                  {node.visit.address !== undefined && (
                    <span className="chain-stay-address">{node.visit.address}</span>
                  )}
                  <span className="chain-stay-meta">
                    {formatDateTime(node.visit.startMs)} → {formatDateTime(node.visit.endMs)} ·{' '}
                    {formatDuration(node.stayDurationMs)}
                  </span>
                </button>
                {outgoing !== undefined && (
                  <button
                    type="button"
                    className={`chain-move chain-move--out${outgoing.segmentIndex === selectedSegmentIndex ? ' selected' : ''}`}
                    onClick={() => onSelectSegment(outgoing.segmentIndex)}
                  >
                    {movementLine(outgoing, false, outgoingDest)}
                  </button>
                )}
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
