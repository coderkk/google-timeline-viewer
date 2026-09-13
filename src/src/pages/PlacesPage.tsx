import { useCallback, useEffect, useMemo, useState } from 'react'
import DateRangePicker from '../components/DateRangePicker'
import PlacesMap from '../components/PlacesMap'
import VisitHistoryPanel from '../components/VisitHistoryPanel'
import { SpatialGrid, type CircleHit } from '../lib/geo/SpatialGrid'
import { groupVisitsByLocation, visitGroupKey } from '../lib/geo/visitHistory'
import { fmtDistanceKm, PLACE_RADII_KM, PLACES_RESULT_LIMIT } from '../lib/geo/places'
import { SAMPLE_LABEL } from '../lib/sample'
import { filterVisits, fmtDateTime, fmtDuration, type DateRangeFilter } from '../lib/trips'
import type { Point, TimelineData, Visit } from '../lib/types'
import { useTimelineStore } from '../store/timelineStore'
import EmptyState from './EmptyState'

const QUERY_DEBOUNCE_MS = 200
const QUERY_SLOW_MS = 500

interface PlacesViewProps {
  data: TimelineData
  dataSource: 'none' | 'user' | 'sample'
  dateRange: DateRangeFilter
}

interface QuerySignature {
  lat: number
  lng: number
  radiusKm: number
}

interface QueryState {
  /** Signature of the last completed query; null before the first pick. */
  sig: QuerySignature | null
  /** True when the last completed query actually took >= QUERY_SLOW_MS. */
  slow: boolean
  results: CircleHit<Visit>[]
}

/** True when a completed query matches the currently active center + radius. */
function matchesSignature(state: QuerySignature | null, sig: QuerySignature): boolean {
  return (
    state !== null && state.lat === sig.lat && state.lng === sig.lng && state.radiusKm === sig.radiusKm
  )
}

/**
 * Resolve the full visit history for a given visit by looking up the grouped
 * visits from the current dataset. Uses the same date filter as the query.
 */
function getVisitHistory(visit: Visit, groups: Map<string, Visit[]> = new Map()): Visit[] {
  const key = visitGroupKey(visit)
  return groups.get(key) ?? [visit]
}

function PlacesView({ data, dataSource, dateRange }: PlacesViewProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [center, setCenter] = useState<Point | null>(null)
  const [radiusKm, setRadiusKm] = useState<number>(100)
  const [selected, setSelected] = useState<Visit | null>(null)
  const [historyVisit, setHistoryVisit] = useState<Visit | null>(null)
  // All query updates happen inside timer callbacks (never synchronously in an
  // effect) to satisfy the strict react-hooks set-state-in-effect rule.
  const [queryState, setQueryState] = useState<QueryState>({ sig: null, slow: false, results: [] })

  // Rebuilds only when the dataset or the global date filter changes: both are
  // stable store references, so the memo re-runs exactly then.
  const grid = useMemo(() => {
    const visits = filterVisits(data.visits, dateRange)
    return new SpatialGrid<Visit>().build(visits)
  }, [data, dateRange])

  // Pre-compute visit groups keyed by location for the history panel.
  const visitGroups = useMemo(() => {
    const visits = filterVisits(data.visits, dateRange)
    return groupVisitsByLocation(visits)
  }, [data, dateRange])

  useEffect(() => {
    if (!center) return
    let cancelled = false
    const slowTimer = setTimeout(() => {
      if (!cancelled) {
        setQueryState((current) =>
          matchesSignature(current.sig, { lat: center.lat, lng: center.lng, radiusKm })
            ? { ...current, slow: true }
            : current,
        )
      }
    }, QUERY_SLOW_MS)
    const timer = setTimeout(() => {
      const hits = grid
        .queryCircle(center.lat, center.lng, radiusKm)
        .sort((a, b) => b.record.startMs - a.record.startMs)
      if (!cancelled) {
        setQueryState({ sig: { lat: center.lat, lng: center.lng, radiusKm }, slow: false, results: hits })
      }
    }, QUERY_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
      clearTimeout(slowTimer)
    }
  }, [center, radiusKm, grid])

  const handlePick = useCallback((point: Point) => {
    setSelected(null)
    setHistoryVisit(null)
    setCenter(point)
  }, [])

  const handleSelect = useCallback((visit: Visit) => {
    setSelected(visit)
  }, [])

  const handleVisitClick = useCallback((visit: Visit) => {
    setHistoryVisit(visit)
  }, [])

  const handleHistoryClose = useCallback(() => {
    setHistoryVisit(null)
  }, [])

  const sig = center ? { lat: center.lat, lng: center.lng, radiusKm } : null
  const fresh = sig !== null && matchesSignature(queryState.sig, sig)
  const results = queryState.sig === null ? [] : queryState.results
  const awaitingSlow = center !== null && !fresh && queryState.slow

  const shown = results.slice(0, PLACES_RESULT_LIMIT)
  const hidden = results.length - shown.length
  const overlayText =
    center && awaitingSlow
      ? '查询中…'
      : center && fresh && results.length === 0
        ? '此处无停留记录'
        : null

  const map = (
    <div className="trips-map-wrap">
      {overlayText && <div className="places-overlay">{overlayText}</div>}
      <PlacesMap
        center={center}
        radiusKm={radiusKm}
        selected={selected}
        visits={results.map((r) => r.record)}
        onPick={handlePick}
        onVisitClick={handleVisitClick}
        invalidateKey={sidebarOpen ? 'open' : 'collapsed'}
      />
      {historyVisit && (
        <VisitHistoryPanel
          locationName={historyVisit.name ?? historyVisit.address ?? 'Unknown location'}
          visits={getVisitHistory(historyVisit, visitGroups)}
          onClose={handleHistoryClose}
        />
      )}
    </div>
  )

  const sidebar = (
    <aside className="trips-side">
      <DateRangePicker />
      <div className="places-help">点击地图任意位置，查看该处历史上的停留点及访问时间。</div>
      <div className="places-controls">
        <div className="stop-list-head">查询半径</div>
        <div className="places-radii-label">1–100 KM</div>
        <div className="places-radii">
          {PLACE_RADII_KM.map((radius) => (
            <button
              key={radius}
              type="button"
              className={radius === radiusKm ? 'places-radius active' : 'places-radius'}
              onClick={() => setRadiusKm(radius)}
            >
              {radius}
            </button>
          ))}
        </div>
      </div>
      {center && (
        <div className="places-card">
          <div className="places-card-coord">
            {center.lat.toFixed(5)}, {center.lng.toFixed(5)}
          </div>
          <div className="places-card-count">
            {awaitingSlow || !fresh ? '查询中…' : `${results.length} 个停留点在此范围内`}
          </div>
        </div>
      )}
      <div className="stop-list">
        <div className="stop-list-head">
          {center ? `范围内停留点（${results.length}）` : '停留点'}
        </div>
        {!center ? (
          <div className="stop-list-empty">点击地图开始查询</div>
        ) : awaitingSlow || !fresh ? (
          <div className="stop-list-empty">查询中…</div>
        ) : results.length === 0 ? (
          <div className="stop-list-empty">此处无停留记录</div>
        ) : (
          <ul className="stop-list-items">
            {shown.map((hit, index) => {
              const visit = hit.record
              const active =
                selected !== null &&
                selected.lat === visit.lat &&
                selected.lng === visit.lng &&
                selected.startMs === visit.startMs
              return (
                <li key={index}>
                  <button
                    type="button"
                    className={active ? 'stop-item selected' : 'stop-item'}
                    onClick={() => handleSelect(visit)}
                  >
                    <span className="stop-name">{visit.name ?? '坐标附近'}</span>
                    {visit.address !== undefined && <span className="stop-address">{visit.address}</span>}
                    <span className="stop-meta">
                      {fmtDateTime(visit.startMs)} → {fmtDateTime(visit.endMs)} ·{' '}
                      {fmtDuration(visit.endMs - visit.startMs)} · 距离 {fmtDistanceKm(hit.distanceKm)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {hidden > 0 && (
          <div className="stop-list-more">
            仅显示前 {shown.length} 条，还有 {hidden} 条 — 请缩小半径或日期范围
          </div>
        )}
      </div>
    </aside>
  )

  return (
    <section className="trips-shell">
      <div className="trips-topbar">
        <h2 className="trips-title">Places</h2>
        {dataSource === 'sample' && <span className="badge-sample">{SAMPLE_LABEL}</span>}
        <span className="trips-summary">
          {grid.recordCount} 停留（总 {data.meta.visitCount}）· 当前半径 {radiusKm} km · 1–100 KM 可选
        </span>
        <span className="trips-legend">
          <span className="chip">
            <i style={{ background: '#f59e0b' }} />
            查询范围
          </span>
        </span>
        <button
          type="button"
          className="trips-toggle"
          onClick={() => setSidebarOpen((open) => !open)}
        >
          {sidebarOpen ? '收起面板 «' : '展开面板 »'}
        </button>
      </div>
      <div className="trips-body">{sidebarOpen ? <>{sidebar}{map}</> : map}</div>
    </section>
  )
}

export default function PlacesPage() {
  const data = useTimelineStore((state) => state.data)
  const dataSource = useTimelineStore((state) => state.dataSource)
  const dateRange = useTimelineStore((state) => state.dateRange)
  if (!data) return <EmptyState />
  return <PlacesView data={data} dataSource={dataSource} dateRange={dateRange} />
}