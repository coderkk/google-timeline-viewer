import { useMemo, useState } from 'react'
import DateRangePicker from '../components/DateRangePicker'
import StopList from '../components/StopList'
import TimelineList from '../components/TimelineList'
import TripMap, { type LatLngBoundsMatrix } from '../components/TripMap'
import {
  boundsOf,
  boundsIncludeRawPoints,
  bridgeLines,
  dayKeyOf,
  fmtRangeLabel,
  legendTypes,
  LIST_LIMIT,
  prepareTimeline,
  prepareTripsForData,
  startOfDayMs,
  type DateRangeFilter,
} from '../lib/trips'
import { SAMPLE_LABEL } from '../lib/sample'
import type { PreparedTrips, BridgeLine, TimelinePayload, TimelineVertex } from '../lib/trips'
import type { TimelineData, Visit, Segment, Point } from '../lib/types'
import { useTimelineStore } from '../store/timelineStore'
import EmptyState from './EmptyState'

const DAY_MS = 24 * 60 * 60 * 1000

interface TripsViewProps {
  data: TimelineData
  dataSource: 'none' | 'user' | 'sample'
  dateRange: DateRangeFilter
}

// Own selection state + the map. Keyed by the fit signature so an out-of-range
// selected stop is dropped whenever the filtered window changes to different
// days (the map mounts afresh and re-fits — the intended behavior).
function MapPane({
  prepared,
  fitBounds,
  fitKey,
  showRoutePoints,
  bridges,
  mode,
  segments,
  route,
}: {
  prepared: PreparedTrips | TimelinePayload
  fitBounds: LatLngBoundsMatrix | null
  fitKey: string
  showRoutePoints: boolean
  bridges: readonly BridgeLine[]
  mode: 'activityType' | 'timeline'
  segments: readonly Segment[]
  route: readonly TimelineVertex[]
}) {
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null)
  // Generic camera target: a stop or a timeline point (both just need lat/lng).
  const [flyTarget, setFlyTarget] = useState<Point | null>(null)

  const highlightedSegments = useMemo(() => {
    const set = new Set<number>()
    if (!selectedVisit || mode !== 'activityType') return set
    const dayStart = startOfDayMs(selectedVisit.startMs)
    segments.forEach((segment, index) => {
      const sameDay = startOfDayMs(segment.startMs) === dayStart
      const overlaps = segment.startMs <= selectedVisit.endMs && segment.endMs >= selectedVisit.startMs
      if (sameDay || overlaps) set.add(index)
    })
    return set
  }, [selectedVisit, segments, mode])

  const selectedMarkerIndex = useMemo(() => {
    if (!selectedVisit) return null
    const index = prepared.markers.findIndex((marker) => Object.is(marker, selectedVisit))
    return index === -1 ? null : index
  }, [selectedVisit, prepared.markers])

  const selectedVisitIndex = useMemo(() => {
    if (!selectedVisit) return null
    const index = prepared.visits.findIndex((visit) => Object.is(visit, selectedVisit))
    return index === -1 ? null : index
  }, [selectedVisit, prepared.visits])

  return (
    <>
      <div className="trips-side">
        <DateRangePicker />
        {mode === 'timeline' ? (
          <TimelineList
            points={route}
            visits={prepared.visits}
            limit={LIST_LIMIT}
            selectedVisitIndex={selectedVisitIndex}
            onSelectPoint={(point) => setFlyTarget({ lat: point.lat, lng: point.lng })}
            onSelectVisit={(_, visit) => {
              setSelectedVisit(visit)
              setFlyTarget(visit)
            }}
          />
        ) : (
          <StopList
            visits={prepared.visits}
            limit={LIST_LIMIT}
            selectedVisitIndex={selectedVisitIndex}
            onSelect={(_, visit) => {
              setSelectedVisit(visit)
              setFlyTarget(visit)
            }}
          />
        )}
      </div>
      <div className="trips-map-wrap">
        {segments.length === 0 && prepared.visits.length === 0 && (
          <div className="trips-empty">该日期范围内没有行程数据</div>
        )}
        <TripMap
          segments={segments}
          markers={prepared.markers}
          rawPoints={prepared.points}
          route={route}
          bridges={bridges}
          highlightedSegments={highlightedSegments}
          selectedMarkerIndex={selectedMarkerIndex}
          onSelectMarker={(_, visit) => setSelectedVisit(visit)}
          fitBounds={fitBounds}
          fitKey={fitKey}
          invalidateKey="static"
          flyTarget={flyTarget}
          showRoutePoints={showRoutePoints}
          mode={mode}
        />
      </div>
    </>
  )
}

function TripsView({ data, dataSource, dateRange }: TripsViewProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showRoutePoints, setShowRoutePoints] = useState(true)
  const [mode, setMode] = useState<'activityType' | 'timeline'>('timeline')

  const preparedTrips = useMemo(
    () => prepareTripsForData(data, dateRange),
    [data, dateRange],
  )

  const preparedTimeline = useMemo(
    () => prepareTimeline(data.visits, dateRange, data.points, data.segments),
    [data, dateRange],
  )

  // Dashed links between the consecutive (timeline-sorted) segments that close
  // the visual breaks between separate legs of a trip.
  const bridges = useMemo(() => bridgeLines(preparedTrips.segments), [preparedTrips.segments])

  const currentPrepared = mode === 'timeline' ? preparedTimeline : preparedTrips

  const fitBounds = useMemo<LatLngBoundsMatrix | null>(() => {
    const baseBounds = boundsOf(preparedTrips.segments, currentPrepared.markers)
    // In timeline mode, also include the route vertices in the bounds so the
    // map auto-fits to the actual trace (raw or semantic) instead of staying at
    // the default [14, 112] centre.
    const bounds =
      mode === 'timeline' && preparedTimeline.route.length > 0
        ? boundsIncludeRawPoints(baseBounds, preparedTimeline.route)
        : baseBounds
    return bounds ? [[bounds.minLat, bounds.minLng], [bounds.maxLat, bounds.maxLng]] : null
  }, [preparedTrips.segments, currentPrepared.markers, mode, preparedTimeline.route])

  const fitKey = useMemo(() => {
    const minMs = dateRange.startMs ?? data.meta.timeRange.minMs
    const maxMs = dateRange.endMs ?? data.meta.timeRange.maxMs
    const days = Math.round((startOfDayMs(maxMs) + DAY_MS - 1 - startOfDayMs(minMs)) / DAY_MS) + 1
    return `${dayKeyOf(minMs)}:${dayKeyOf(maxMs)}:${days}`
  }, [dateRange, data.meta.timeRange])

  const noData = preparedTrips.segments.length === 0 && currentPrepared.visits.length === 0
  const legend = useMemo(() => (mode === 'activityType' ? legendTypes(preparedTrips.segments) : []), [preparedTrips.segments, mode])

  // Timeline summary is honest about where the route came from: rawSignals are
  // only kept ~30 days, so older ranges fall back to the semantic segment paths.
  const timelineSummary = useMemo(() => {
    const n = preparedTimeline.route.length.toLocaleString()
    if (preparedTimeline.routeSource === 'segments') return `${n} 轨迹点（行程段）`
    if (preparedTimeline.routeSource === 'mixed') return `${n} 轨迹点（GPS+行程段）`
    return `${n} 原始点`
  }, [preparedTimeline.route.length, preparedTimeline.routeSource])

  // The "trajectory points" toggle only has something to toggle when the
  // current view actually draws per-point dots: the timeline route (raw or
  // semantic), or the activity-type segments/raw fixes.
  const showPointsToggle =
    mode === 'timeline'
      ? preparedTimeline.route.length > 0
      : preparedTrips.segments.length > 0 || preparedTrips.points.length > 0

  return (
    <section className="trips-shell">
      <div className="trips-topbar">
        <h2 className="trips-title">Trips</h2>
        {dataSource === 'sample' && <span className="badge-sample">{SAMPLE_LABEL}</span>}
        <span className="trips-summary">
          {fmtRangeLabel(dateRange)} · {mode === 'timeline' ? timelineSummary : `${preparedTrips.segments.length} 段 · ${preparedTrips.totalPathPoints.toLocaleString()} 点`} · {currentPrepared.visits.length} 停留
          {mode === 'activityType' && preparedTrips.points.length > 0 && ` · ${preparedTrips.points.length.toLocaleString()} 原始点`}
          {mode === 'activityType' && bridges.length > 0 && ` · ${bridges.length} 处衔接`}
        </span>
        {currentPrepared.downsampled && <span className="trips-note">已降采样显示</span>}
        {legend.length > 1 && (
          <span className="trips-legend">
            {legend.map((entry) => (
              <span key={entry.type} className="chip">
                <i style={{ background: entry.color }} />
                {entry.label}
              </span>
            ))}
          </span>
        )}
        <div className="trips-mode-toggle">
          <button
            type="button"
            className={`trips-mode-btn ${mode === 'timeline' ? 'active' : ''}`}
            onClick={() => setMode('timeline')}
          >
            时间轴
          </button>
          <button
            type="button"
            className={`trips-mode-btn ${mode === 'activityType' ? 'active' : ''}`}
            onClick={() => setMode('activityType')}
          >
            按活动类型
          </button>
        </div>
        {showPointsToggle && (
          <button
            type="button"
            className="trips-toggle trips-toggle--plain"
            onClick={() => setShowRoutePoints((visible) => !visible)}
          >
            {showRoutePoints ? '隐藏轨迹点 ●' : '显示轨迹点 ○'}
          </button>
        )}
        <button
          type="button"
          className="trips-toggle"
          onClick={() => setSidebarOpen((open) => !open)}
        >
          {sidebarOpen ? '收起面板 «' : '展开面板 »'}
        </button>
      </div>
      <div className="trips-body">
        {sidebarOpen ? (
          <MapPane
            key={fitKey}
            prepared={currentPrepared}
            fitBounds={fitBounds}
            fitKey={fitKey}
            showRoutePoints={showRoutePoints}
            bridges={bridges}
            mode={mode}
            segments={preparedTrips.segments}
            route={preparedTimeline.route}
          />
        ) : (
          <div className="trips-map-wrap">
            {noData && <div className="trips-empty">该日期范围内没有行程数据</div>}
            <TripMap
              segments={preparedTrips.segments}
              markers={currentPrepared.markers}
              rawPoints={currentPrepared.points}
              route={preparedTimeline.route}
              bridges={bridges}
              highlightedSegments={new Set<number>()}
              selectedMarkerIndex={null}
              onSelectMarker={() => undefined}
              fitBounds={fitBounds}
              fitKey={fitKey}
              invalidateKey="static"
              flyTarget={null}
              showRoutePoints={showRoutePoints}
              mode={mode}
            />
          </div>
        )}
      </div>
    </section>
  )
}

export default function TripsPage() {
  const data = useTimelineStore((state) => state.data)
  const dataSource = useTimelineStore((state) => state.dataSource)
  const dateRange = useTimelineStore((state) => state.dateRange)
  if (!data) return <EmptyState />
  return <TripsView data={data} dataSource={dataSource} dateRange={dateRange} />
}