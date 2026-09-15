import { useEffect, useMemo, useState } from 'react'
import DataBar from '../components/DataBar'
import DateRangePicker from '../components/DateRangePicker'
import TimelineList from '../components/TimelineList'
import TripChainList from '../components/TripChainList'
import TripStatsPanel from '../components/TripStatsPanel'
import TripMap, { DOT_MIN_ZOOM, type LatLngBoundsMatrix } from '../components/TripMap'
import {
  boundsOf,
  boundsIncludeRawPoints,
  bridgeLines,
  dayKeyOf,
  legendTypes,
  LIST_LIMIT,
  prepareTimeline,
  prepareTripsForData,
  segmentPathOrEndpoints,
  startOfDayMs,
  type DateRangeFilter,
} from '../lib/trips'
import { buildTripChain, type TripChain } from '../lib/tripChain'
import { useI18n } from '../lib/i18n'
import { activityMessageKey } from '../lib/i18n/activity'
import type { PreparedTrips, BridgeLine, TimelinePayload, TimelineVertex } from '../lib/trips'
import type { TimelineData, Visit, Segment, Point } from '../lib/types'
import { useTimelineStore } from '../store/timelineStore'
import EmptyState from './EmptyState'

const DAY_MS = 24 * 60 * 60 * 1000

/** Stable empty chain so the timeline mode does not rebuild one every render. */
const EMPTY_CHAIN: TripChain = { visits: [] }

interface TripsViewProps {
  data: TimelineData
  dataSource: 'none' | 'user' | 'sample'
  dateRange: DateRangeFilter
}

// Own selection state + the map. Not keyed anymore (the map re-fits itself
// through TripMap's internal FitController). An out-of-range selected stop is
// still dropped whenever the filtered window or the data changes — see the
// subscribe effect below. Keeping this mounted lets the DateRangePicker popover
// survive a single day-click (T30.2), which a fitKey remount would destroy.
function MapPane({
  prepared,
  fitBounds,
  fitKey,
  showRoutePoints,
  bridges,
  mode,
  segments,
  route,
  rangeStartMs,
  dateRange,
  chain,
  onZoomChange,
}: {
  prepared: PreparedTrips | TimelinePayload
  fitBounds: LatLngBoundsMatrix | null
  fitKey: string
  showRoutePoints: boolean
  bridges: readonly BridgeLine[]
  mode: 'activityType' | 'timeline'
  segments: readonly Segment[]
  route: readonly TimelineVertex[]
  rangeStartMs: number | null
  dateRange: DateRangeFilter
  chain: TripChain
  onZoomChange: (zoom: number) => void
}) {
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null)
  // A movement row click selects a single segment (highlighted on the map);
  // selecting a stay clears it and vice versa.
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState<number | null>(null)
  // Generic camera target: a stop or a timeline point (both just need lat/lng).
  const [flyTarget, setFlyTarget] = useState<Point | null>(null)
  const { t } = useI18n()

  // Selection is scoped to the current filtered window: whenever the date range
  // or the loaded data changes (the old fitKey remount used to drop the stale
  // stop), clear the selected stay/segment and any in-flight camera target.
  useEffect(
    () =>
      useTimelineStore.subscribe((state, prevState) => {
        if (state.dateRange !== prevState.dateRange || state.data !== prevState.data) {
          setSelectedVisit(null)
          setSelectedSegmentIndex(null)
          setFlyTarget(null)
        }
      }),
    [],
  )

  const highlightedSegments = useMemo(() => {
    const set = new Set<number>()
    if (selectedSegmentIndex !== null) {
      set.add(selectedSegmentIndex)
      return set
    }
    if (!selectedVisit || mode !== 'activityType') return set
    const dayStart = startOfDayMs(selectedVisit.startMs)
    segments.forEach((segment, index) => {
      const sameDay = startOfDayMs(segment.startMs) === dayStart
      const overlaps = segment.startMs <= selectedVisit.endMs && segment.endMs >= selectedVisit.startMs
      if (sameDay || overlaps) set.add(index)
    })
    return set
  }, [selectedVisit, selectedSegmentIndex, segments, mode])

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
        <DataBar />
        <DateRangePicker />
        <TripStatsPanel
          route={route}
          segments={segments}
          visits={prepared.visits}
          mode={mode}
          range={dateRange}
        />
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
          <TripChainList
            chain={chain}
            limit={LIST_LIMIT}
            selectedVisitIndex={selectedVisitIndex}
            selectedSegmentIndex={selectedSegmentIndex}
            onSelectVisit={(_, visit) => {
              setSelectedSegmentIndex(null)
              setSelectedVisit(visit)
              setFlyTarget(visit)
            }}
            onSelectSegment={(segmentIndex) => {
              const segment = segments[segmentIndex]
              if (!segment) return
              setSelectedVisit(null)
              setSelectedSegmentIndex(segmentIndex)
              const path = segmentPathOrEndpoints(segment)
              const mid = path[Math.floor(path.length / 2)]
              setFlyTarget({ lat: mid.lat, lng: mid.lng })
            }}
          />
        )}
      </div>
      <div className="trips-map-wrap">
        {segments.length === 0 && prepared.visits.length === 0 && (
          <div className="trips-empty">{t('trips.empty')}</div>
        )}
        <TripMap
          segments={segments}
          markers={prepared.markers}
          rawPoints={prepared.points}
          route={route}
          rangeStartMs={rangeStartMs}
          bridges={bridges}
          highlightedSegments={highlightedSegments}
          selectedMarkerIndex={selectedMarkerIndex}
          onSelectMarker={(_, visit) => {
            setSelectedSegmentIndex(null)
            setSelectedVisit(visit)
          }}
          fitBounds={fitBounds}
          fitKey={fitKey}
          invalidateKey="static"
          flyTarget={flyTarget}
          showRoutePoints={showRoutePoints}
          mode={mode}
          onZoomChange={onZoomChange}
        />
      </div>
    </>
  )
}

function TripsView({ data, dataSource, dateRange }: TripsViewProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showRoutePoints, setShowRoutePoints] = useState(true)
  const [mode, setMode] = useState<'activityType' | 'timeline'>('timeline')
  // Reported by the map. Below DOT_MIN_ZOOM the dot layers are intentionally
  // not drawn (T23), so the toggle is disabled rather than silently doing
  // nothing.
  const [mapZoom, setMapZoom] = useState(0)
  const pointsToggleDisabled = mapZoom < DOT_MIN_ZOOM
  const { t, formatNumber, formatRangeLabel } = useI18n()

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

  // Trip chain (T29): visit ↔ adjacent movement, used by the activityType list.
  // Only computed in activityType mode — the timeline view never reads it.
  const chain = useMemo(
    () =>
      mode === 'activityType'
        ? buildTripChain(preparedTrips.visits, preparedTrips.segments, dateRange)
        : EMPTY_CHAIN,
    [mode, preparedTrips.visits, preparedTrips.segments, dateRange],
  )

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
    const n = formatNumber(preparedTimeline.route.length)
    if (preparedTimeline.routeSource === 'segments') return t('trips.summary.routeSegments', { n })
    if (preparedTimeline.routeSource === 'mixed') return t('trips.summary.routeMixed', { n })
    return t('trips.summary.routeRaw', { n })
  }, [preparedTimeline.route.length, preparedTimeline.routeSource, t, formatNumber])

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
        <h2 className="trips-title">{t('trips.title')}</h2>
        {dataSource === 'sample' && <span className="badge-sample">{t('landing.sampleLabel')}</span>}
        <span className="trips-summary">
          {formatRangeLabel(dateRange)} ·{' '}
          {mode === 'timeline'
            ? timelineSummary
            : t('trips.summary.segments', {
                n: formatNumber(preparedTrips.segments.length),
                points: formatNumber(preparedTrips.totalPathPoints),
              })}{' '}
          · {t('trips.summary.stays', { n: formatNumber(currentPrepared.visits.length) })}
          {mode === 'activityType' && preparedTrips.points.length > 0 &&
            ` · ${t('trips.summary.rawPoints', { n: formatNumber(preparedTrips.points.length) })}`}
          {mode === 'activityType' && bridges.length > 0 &&
            ` · ${t('trips.summary.bridges', { n: formatNumber(bridges.length) })}`}
        </span>
        {currentPrepared.downsampled && <span className="trips-note">{t('trips.downsampled')}</span>}
        {legend.length > 1 && (
          <span className="trips-legend">
            {legend.map((entry) => (
              <span key={entry.type} className="chip">
                <i style={{ background: entry.color }} />
                {t(activityMessageKey(entry.type))}
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
            {t('trips.mode.timeline')}
          </button>
          <button
            type="button"
            className={`trips-mode-btn ${mode === 'activityType' ? 'active' : ''}`}
            onClick={() => setMode('activityType')}
          >
            {t('trips.mode.activity')}
          </button>
        </div>
        {showPointsToggle && (
          <span
            className="trips-toggle-wrap"
            title={pointsToggleDisabled ? t('trips.toggle.zoomHint', { zoom: DOT_MIN_ZOOM }) : undefined}
          >
            <button
              type="button"
              className="trips-toggle trips-toggle--plain"
              disabled={pointsToggleDisabled}
              onClick={() => setShowRoutePoints((visible) => !visible)}
            >
              {showRoutePoints ? t('trips.toggle.hide') : t('trips.toggle.show')}
            </button>
          </span>
        )}
        <button
          type="button"
          className="trips-toggle"
          onClick={() => setSidebarOpen((open) => !open)}
        >
          {sidebarOpen ? t('trips.panel.collapse') : t('trips.panel.expand')}
        </button>
      </div>
      <div className="trips-body">
        {sidebarOpen ? (
          <MapPane
            prepared={currentPrepared}
            fitBounds={fitBounds}
            fitKey={fitKey}
            showRoutePoints={showRoutePoints}
            bridges={bridges}
            mode={mode}
            segments={preparedTrips.segments}
            route={preparedTimeline.route}
            rangeStartMs={dateRange.startMs}
            dateRange={dateRange}
            chain={chain}
            onZoomChange={setMapZoom}
          />
        ) : (
          <div className="trips-map-wrap">
            {noData && <div className="trips-empty">{t('trips.empty')}</div>}
            <TripMap
              segments={preparedTrips.segments}
              markers={currentPrepared.markers}
              rawPoints={currentPrepared.points}
              route={preparedTimeline.route}
              rangeStartMs={dateRange.startMs}
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
              onZoomChange={setMapZoom}
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
