import { useMemo, useState } from 'react'
import DateRangePicker from '../components/DateRangePicker'
import StopList from '../components/StopList'
import TripMap, { type LatLngBoundsMatrix } from '../components/TripMap'
import {
  boundsOf,
  bridgeLines,
  dayKeyOf,
  fmtRangeLabel,
  legendTypes,
  LIST_LIMIT,
  prepareTripsForData,
  startOfDayMs,
  type DateRangeFilter,
} from '../lib/trips'
import { SAMPLE_LABEL } from '../lib/sample'
import type { PreparedTrips, BridgeLine } from '../lib/trips'
import type { TimelineData, Visit } from '../lib/types'
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
}: {
  prepared: PreparedTrips
  fitBounds: LatLngBoundsMatrix | null
  fitKey: string
  showRoutePoints: boolean
  bridges: readonly BridgeLine[]
}) {
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null)

  const highlightedSegments = useMemo(() => {
    const set = new Set<number>()
    if (!selectedVisit) return set
    const dayStart = startOfDayMs(selectedVisit.startMs)
    prepared.segments.forEach((segment, index) => {
      const sameDay = startOfDayMs(segment.startMs) === dayStart
      const overlaps = segment.startMs <= selectedVisit.endMs && segment.endMs >= selectedVisit.startMs
      if (sameDay || overlaps) set.add(index)
    })
    return set
  }, [selectedVisit, prepared.segments])

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
        <StopList
          visits={prepared.visits}
          limit={LIST_LIMIT}
          selectedVisitIndex={selectedVisitIndex}
          onSelect={(_, visit) => setSelectedVisit(visit)}
        />
      </div>
      <div className="trips-map-wrap">
        {prepared.segments.length === 0 && prepared.visits.length === 0 && (
          <div className="trips-empty">该日期范围内没有行程数据</div>
        )}
        <TripMap
          segments={prepared.segments}
          markers={prepared.markers}
          rawPoints={prepared.points}
          bridges={bridges}
          highlightedSegments={highlightedSegments}
          selectedMarkerIndex={selectedMarkerIndex}
          onSelectMarker={(_, visit) => setSelectedVisit(visit)}
          fitBounds={fitBounds}
          fitKey={fitKey}
          invalidateKey="static"
          flyTarget={selectedVisit}
          showRoutePoints={showRoutePoints}
        />
      </div>
    </>
  )
}

function TripsView({ data, dataSource, dateRange }: TripsViewProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showRoutePoints, setShowRoutePoints] = useState(true)

  const prepared = useMemo(
    () => prepareTripsForData(data, dateRange),
    [data, dateRange],
  )

  // Dashed links between the consecutive (timeline-sorted) segments that close
  // the visual breaks between separate legs of a trip.
  const bridges = useMemo(() => bridgeLines(prepared.segments), [prepared.segments])

  const fitBounds = useMemo<LatLngBoundsMatrix | null>(() => {
    const bounds = boundsOf(prepared.segments, prepared.markers)
    return bounds ? [[bounds.minLat, bounds.minLng], [bounds.maxLat, bounds.maxLng]] : null
  }, [prepared.segments, prepared.markers])

  const fitKey = useMemo(() => {
    const minMs = dateRange.startMs ?? data.meta.timeRange.minMs
    const maxMs = dateRange.endMs ?? data.meta.timeRange.maxMs
    const days = Math.round((startOfDayMs(maxMs) + DAY_MS - 1 - startOfDayMs(minMs)) / DAY_MS) + 1
    return `${dayKeyOf(minMs)}:${dayKeyOf(maxMs)}:${days}`
  }, [dateRange, data.meta.timeRange])

  const noData = prepared.segments.length === 0 && prepared.visits.length === 0
  const legend = useMemo(() => legendTypes(prepared.segments), [prepared.segments])

  return (
    <section className="trips-shell">
      <div className="trips-topbar">
        <h2 className="trips-title">Trips</h2>
        {dataSource === 'sample' && <span className="badge-sample">{SAMPLE_LABEL}</span>}
        <span className="trips-summary">
          {fmtRangeLabel(dateRange)} · {prepared.segments.length} 段 · {prepared.visits.length} 停留 ·{' '}
          {prepared.totalPathPoints.toLocaleString()} 点
          {prepared.points.length > 0 && ` · ${prepared.points.length.toLocaleString()} 原始点`}
          {bridges.length > 0 && ` · ${bridges.length} 处衔接`}
        </span>
        {prepared.downsampled && <span className="trips-note">已降采样显示</span>}
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
        <button
          type="button"
          className="trips-toggle trips-toggle--plain"
          onClick={() => setShowRoutePoints((visible) => !visible)}
        >
          {showRoutePoints ? '隐藏轨迹点 ●' : '显示轨迹点 ○'}
        </button>
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
            prepared={prepared}
            fitBounds={fitBounds}
            fitKey={fitKey}
            showRoutePoints={showRoutePoints}
            bridges={bridges}
          />
        ) : (
          <div className="trips-map-wrap">
            {noData && <div className="trips-empty">该日期范围内没有行程数据</div>}
            <TripMap
              segments={prepared.segments}
              markers={prepared.markers}
              rawPoints={prepared.points}
              bridges={bridges}
              highlightedSegments={new Set<number>()}
              selectedMarkerIndex={null}
              onSelectMarker={() => undefined}
              fitBounds={fitBounds}
              fitKey={fitKey}
              invalidateKey="static"
              flyTarget={null}
              showRoutePoints={showRoutePoints}
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