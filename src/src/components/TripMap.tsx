// Leaflet map for the Trips view. Routes are polylines tinted by transport
// mode and stops are round markers with hover tooltips. Everything draws on a
// single shared Canvas renderer so decade-spanning datasets stay fluid. Fit /
// fly helpers are imperative (fitBounds/flyTo) so user pan/zoom is never
// overwritten by props — the map only auto-fits when the filtered window's
// structure (which days are selected) changes. The map boots on a fixed
// center/zoom rather than a `bounds` prop: fitting at init against a container
// that is not yet laid out crashes the renderer.
import { useEffect, useMemo, useRef } from 'react'
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { CircleMarker as LeafletCircleMarker } from 'leaflet'
import type { RawPoint, Segment, Visit } from '../lib/types'
import {
  activityColor,
  bridgeGapLabel,
  budgetRoutePoints,
  fmtDateTime,
  fmtDuration,
  ROUTE_POINT_CAP,
  type BridgeLine,
} from '../lib/trips'
import { useTimelineStore } from '../store/timelineStore'

type LatLngExpression = [number, number]
export type LatLngBoundsMatrix = [[number, number], [number, number]]

export interface TripMapProps {
  segments: readonly Segment[]
  markers: readonly Visit[]
  /** Raw GPS fixes (rawSignals) to draw as a faint dense trail. */
  rawPoints?: readonly RawPoint[]
  /**
   * Dashed "no-record" links between consecutive timeline segments, aligned
   * with `segments` (indices point into that same list, which must therefore
   * be in timeline order — `prepareTrips` sorts it).
   */
  bridges?: readonly BridgeLine[]
  /** Segment indices (into `segments`) to emphasize when a stop is selected. */
  highlightedSegments: ReadonlySet<number>
  /** Index into `markers` that is currently selected, or null. */
  selectedMarkerIndex: number | null
  onSelectMarker: (index: number, visit: Visit) => void
  fitBounds: LatLngBoundsMatrix | null
  /** Changes only when the selected window spans a different set of days. */
  fitKey: string | null
  /** Bumped (e.g. sidebar collapse) to force a Leaflet re-layout. */
  invalidateKey: string
  /** Visit to fly the camera onto (list or marker click). */
  flyTarget: Visit | null
  /** Draw a small circle at every route vertex. Defaults to true. */
  showRoutePoints?: boolean
}

interface ControllerProps {
  fitBounds: LatLngBoundsMatrix | null
  fitKey: string | null
  invalidateKey: string
  flyTarget: Visit | null
}

function FitController({ fitBounds, fitKey, invalidateKey, flyTarget }: ControllerProps) {
  const map = useMap()
  const lastFitKey = useRef<string | null>(null)
  const lastInvalidate = useRef<string>(invalidateKey)
  const lastTarget = useRef<Visit | null>(null)

  // The map often mounts mid-layout (EmptyState -> view swap), when its
  // container may not have real pixels yet. Deferring the fit until a size is
  // available is also a correctness guard: fitting a 0-size map produces an
  // undefined center + NaN view, which corrupts the canvas transform (and can
  // crash the rasterizer).
  useEffect(() => {
    let raf = 0
    let attempts = 0

    const fit = () => {
      const size = map.getSize()
      if ((size.x < 2 || size.y < 2) && attempts++ < 120) {
        raf = requestAnimationFrame(fit)
        return
      }
      if (fitBounds && lastFitKey.current !== fitKey) {
        lastFitKey.current = fitKey
        map.invalidateSize()
        map.fitBounds(fitBounds, { padding: [32, 32], maxZoom: 15 })
      }
      if (lastInvalidate.current !== invalidateKey) {
        lastInvalidate.current = invalidateKey
        map.invalidateSize()
      }
    }

    raf = requestAnimationFrame(fit)
    return () => cancelAnimationFrame(raf)
  }, [fitBounds, fitKey, invalidateKey, map])

  useEffect(() => {
    if (!flyTarget) return
    const prev = lastTarget.current
    if (prev && prev.lat === flyTarget.lat && prev.lng === flyTarget.lng) return
    const size = map.getSize()
    if (size.x < 2 || size.y < 2) return
    lastTarget.current = flyTarget
    map.flyTo([flyTarget.lat, flyTarget.lng], Math.max(map.getZoom(), 15), { duration: 0.7 })
  }, [flyTarget, map])

  return null
}

// Single shared Canvas renderer: leaflet redraws every vector layer (routes and
// stop circles) on one <canvas>, which keeps pan/zoom smooth for the capped
// budgets instead of creating thousands of SVG paths. Module-level so creating
// it is a one-time import side effect, never a render-time mutation.
const canvasRenderer = L.canvas({ padding: 0.5 })

export default function TripMap(props: TripMapProps) {
  const {
    segments,
    markers,
    rawPoints = [],
    bridges = [],
    highlightedSegments,
    selectedMarkerIndex,
    onSelectMarker,
    fitBounds,
    fitKey,
    invalidateKey,
    flyTarget,
    showRoutePoints = true,
  } = props

  const positions = useMemo(
    () =>
      segments.map((segment) => {
        const source = segment.path.length >= 2 ? segment.path : [segment.start, segment.end]
        return source.map((point): LatLngExpression => [point.lat, point.lng])
      }),
    [segments],
  )

  // Route vertices are already DP-simplified + globally budgeted by
  // `prepareTrips`; this memo just flattens them into drawable points (with a
  // dedicated marker cap) so small circles never outnumber the shared budget.
  const routePoints = useMemo(
    () => (showRoutePoints ? budgetRoutePoints(segments, ROUTE_POINT_CAP) : []),
    [segments, showRoutePoints],
  )

  const hasSelection = highlightedSegments.size > 0

  // Read the active tile source from the store so settings changes apply to
  // maps that are already open; a changed TileLayer url rebuilds the layer.
  const tileSource = useTimelineStore((state) => state.tileSource)

  // Canvas circles do not fire DOM hover events, so a selection's tooltip must
  // be opened/closed imperatively instead of relying on mouseover.
  const circles = useRef(new Map<number, LeafletCircleMarker>())
  const lastOpened = useRef<LeafletCircleMarker | null>(null)
  useEffect(() => {
    lastOpened.current?.closeTooltip()
    const next = selectedMarkerIndex === null ? null : (circles.current.get(selectedMarkerIndex) ?? null)
    next?.openTooltip()
    lastOpened.current = next
  }, [selectedMarkerIndex])

  return (
    <MapContainer
      className="trip-map"
      center={[14, 112]}
      zoom={5}
      scrollWheelZoom
      maxZoom={19}
    >
      <TileLayer url={tileSource.url} attribution={tileSource.attribution} />
      <FitController
        fitBounds={fitBounds}
        fitKey={fitKey}
        invalidateKey={invalidateKey}
        flyTarget={flyTarget}
      />
      {/* Raw GPS fixes (rawSignals) render as a faint dense trail underneath
          the stitched/activity polylines. Gated by the same trajectory-points
          toggle since both are raw dot trails. */}
      {showRoutePoints &&
        rawPoints.map((point, index) => (
          <CircleMarker
            key={`raw-${index}`}
            center={[point.lat, point.lng]}
            radius={2}
            pathOptions={{
              color: '#9ca3af',
              weight: 1,
              opacity: hasSelection ? 0.12 : 0.4,
              fillColor: '#9ca3af',
              fillOpacity: hasSelection ? 0.08 : 0.35,
            }}
            renderer={canvasRenderer}
          />
        ))}
      {/* Dashed "no-record" bridges between consecutive timeline segments.
          Deliberately distinct from real traces: thin, light grey, dashed, and
          dimmed with the rest of the geometry when a stop is selected. Each
          carries a tooltip that honestly labels the gap duration. */}
      {bridges.map((bridge, index) => (
        <Polyline
          key={`bridge-${index}`}
          positions={[
            [bridge.from.lat, bridge.from.lng],
            [bridge.to.lat, bridge.to.lng],
          ]}
          pathOptions={{
            color: '#9ca3af',
            weight: 1.5,
            opacity: hasSelection ? 0.15 : 0.45,
            dashArray: '8 8',
            lineCap: 'round',
          }}
          renderer={canvasRenderer}
        >
          <Tooltip direction="top" offset={[0, -4]} className="trip-tooltip">
            <span className="trip-tip-title">{bridgeGapLabel(bridge.gapMs)}</span>
            <span className="trip-tip-meta">
              {fmtDateTime(bridge.fromMs)} {bridge.gapMs <= 0 ? '↔' : '→'} {fmtDateTime(bridge.toMs)}
            </span>
          </Tooltip>
        </Polyline>
      ))}
      {segments.map((segment, index) => {
        const latLngs = positions[index]
        if (latLngs.length < 2) return null
        const highlighted = highlightedSegments.has(index)
        const color = activityColor(segment.activityType)
        return (
          <Polyline
            key={index}
            positions={latLngs}
            pathOptions={{
              color,
              weight: highlighted ? 5 : hasSelection ? 1.75 : 2.5,
              opacity: highlighted ? 1 : hasSelection ? 0.22 : 0.72,
            }}
            renderer={canvasRenderer}
          />
        )
      })}
      {routePoints.map((point, index) => (
        <CircleMarker
          key={`rp-${index}`}
          center={[point.lat, point.lng]}
          radius={3}
          pathOptions={{
            color: point.color,
            weight: 1,
            opacity: hasSelection ? 0.2 : 0.75,
            fillColor: point.color,
            // Route points sit between the polylines and the stop markers in
            // the children tree, so stop markers (bigger, later) stay on top.
            fillOpacity: hasSelection ? 0.15 : 0.6,
          }}
          renderer={canvasRenderer}
        />
      ))}
      {markers.map((visit, index) => {
        const selected = selectedMarkerIndex === index
        const title = visit.name ?? `${visit.lat.toFixed(5)}, ${visit.lng.toFixed(5)}`
        return (
<CircleMarker
              key={index}
              center={[visit.lat, visit.lng]}
              radius={selected ? 9 : 6}
              pathOptions={{
                color: '#fff',
                weight: 1.5,
                fillColor: selected ? '#f87171' : '#3b82f6',
                fillOpacity: selected ? 1 : 0.75,
                opacity: 0.95,
              }}
              renderer={canvasRenderer}
              eventHandlers={{ click: () => onSelectMarker(index, visit) }}
              ref={(el) => {
                if (el) circles.current.set(index, el)
              }}
            >
            <Tooltip direction="top" offset={[0, -4]} className="trip-tooltip" permanent={selected}>
              <span className="trip-tip-title">{title}</span>
              {visit.address !== undefined && <span className="trip-tip-addr">{visit.address}</span>}
              <span className="trip-tip-meta">
                {fmtDateTime(visit.startMs)} · {fmtDuration(visit.endMs - visit.startMs)}
              </span>
            </Tooltip>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}