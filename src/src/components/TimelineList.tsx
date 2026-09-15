// Sidebar timeline for the Trips view's timeline mode: the filtered route
// vertices and stops merged into one chronological list, so the user can read
// "where was I at what time" (and jump the map there) instead of only seeing
// the handful of stops. Rows are grouped under local-day headers.
import type { Visit } from '../lib/types'
import type { TimelineVertex } from '../lib/trips'
import { useI18n } from '../lib/i18n'
import { useTimelineStore } from '../store/timelineStore'

export interface TimelineListProps {
  points: readonly TimelineVertex[]
  visits: readonly Visit[]
  limit: number
  selectedVisitIndex: number | null
  onSelectPoint: (point: TimelineVertex) => void
  onSelectVisit: (index: number, visit: Visit) => void
}

interface Row {
  key: string
  timeMs: number
  kind: 'point' | 'visit'
  title: string
  meta?: string
  /** Set on a visit that started before the selected range (overnight). */
  overnight?: string
  visitIndex?: number
  visit?: Visit
  point?: TimelineVertex
}

function timeLabel(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function TimelineList({
  points,
  visits,
  limit,
  selectedVisitIndex,
  onSelectPoint,
  onSelectVisit,
}: TimelineListProps) {
  // A record that starts before the selected range but overlaps it (an
  // overnight stay) is kept — but must be labelled, not silently shown as if it
  // belonged to the selected day (T22).
  const rangeStartMs = useTimelineStore((state) => state.dateRange.startMs)
  const { t, formatNumber, formatDate, formatDay, formatDuration } = useI18n()

  const rows: Row[] = []
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    if (p.timestampMs === undefined) continue
    rows.push({
      key: `p-${i}`,
      timeMs: p.timestampMs,
      kind: 'point',
      title: `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`,
      point: p,
    })
  }
  visits.forEach((visit, index) => {
    const overnight = rangeStartMs !== null && visit.startMs < rangeStartMs
    rows.push({
      key: `v-${index}`,
      timeMs: visit.startMs,
      kind: 'visit',
      title: visit.name ?? `${visit.lat.toFixed(5)}, ${visit.lng.toFixed(5)}`,
      meta: `${timeLabel(visit.startMs)}–${timeLabel(visit.endMs)} · ${formatDuration(visit.endMs - visit.startMs)}`,
      overnight: overnight ? t('list.overnight', { date: formatDay(visit.startMs) }) : undefined,
      visitIndex: index,
      visit,
    })
  })
  rows.sort((a, b) => a.timeMs - b.timeMs)

  const shown = rows.slice(0, limit)
  const hidden = rows.length - shown.length

  let lastDay = ''

  return (
    <div className="timeline-list">
      <div className="stop-list-head">{t('list.timelineHead', { n: formatNumber(rows.length) })}</div>
      {shown.length === 0 ? (
        <div className="stop-list-empty">{t('list.timelineEmpty')}</div>
      ) : (
        <ul className="timeline-items">
          {shown.map((row) => {
            const day = formatDate(row.timeMs)
            const showDay = day !== lastDay
            lastDay = day
            const selected = row.kind === 'visit' && row.visitIndex === selectedVisitIndex
            return (
              <li key={row.key}>
                {showDay && <div className="timeline-day">{day}</div>}
                <button
                  type="button"
                  className={`timeline-item ${row.kind}${selected ? ' selected' : ''}`}
                  onClick={() => {
                    if (row.kind === 'visit' && row.visit !== undefined && row.visitIndex !== undefined) {
                      onSelectVisit(row.visitIndex, row.visit)
                    } else if (row.point !== undefined) {
                      onSelectPoint(row.point)
                    }
                  }}
                >
                  <span className="timeline-time">{timeLabel(row.timeMs)}</span>
                  <span className="timeline-body">
                    <span className="timeline-title">
                      {row.title}
                      {row.overnight !== undefined && (
                        <span className="timeline-badge">{row.overnight}</span>
                      )}
                    </span>
                    {row.meta !== undefined && <span className="timeline-meta">{row.meta}</span>}
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
