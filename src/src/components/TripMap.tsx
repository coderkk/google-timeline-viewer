// Leaflet map for the Trips view. Routes are polylines tinted by transport
// mode and stops are round markers with hover tooltips. Everything draws on a
// single shared Canvas renderer so decade-spanning datasets stay fluid. Fit /
// fly helpers are imperative (fitBounds/flyTo) so user pan/zoom is never
// overwritten by props — the map only auto-fits when the filtered window's
// structure (which days are selected) changes. The map boots on a fixed
// center/zoom rather than a `bounds` prop: fitting at init against a container
// that is not yet laid out crashes the renderer.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { CircleMarker as LeafletCircleMarker } from 'leaflet'
import type { Point, RawPoint, Segment, Visit } from '../lib/types'
import { googleMapsUrl, writeCoordsToClipboard } from '../lib/coords'
import CopyCoordsButton from './CopyCoordsButton'
import { useI18n, type MessageKey } from '../lib/i18n'
import { useResetZoomAnimOnUnmount } from '../lib/useResetZoomAnimOnUnmount'
import {
  activityColor,
  bridgeGapParts,
  budgetRoutePoints,
  hasRenderablePath,
  ROUTE_POINT_CAP,
  segmentPathOrEndpoints,
  type BridgeLine,
  type TimelineVertex,
} from '../lib/trips'
import { useTimelineStore } from '../store/timelineStore'

type Translate = (key: MessageKey, params?: Record<string, string | number>) => string

/** Localized "Link +Nd Nh" style label for a bridge gap. */
function bridgeLabel(t: Translate, gapMs: number): string {
  const parts = bridgeGapParts(gapMs)
  if (parts.kind === 'link') return t('map.bridge')
  if (parts.days > 0) {
    return parts.hours > 0
      ? t('map.bridgeGapDays', { days: parts.days, hours: parts.hours })
      : t('map.bridgeGapDaysOnly', { days: parts.days })
  }
  if (parts.hours > 0) {
    return parts.minutes > 0
      ? t('map.bridgeGapHours', { hours: parts.hours, minutes: parts.minutes })
      : t('map.bridgeGapHoursOnly', { hours: parts.hours })
  }
  return t('map.bridgeGapMinutes', { minutes: parts.minutes })
}

type LatLngExpression = [number, number]
export type LatLngBoundsMatrix = [[number, number], [number, number]]

export interface TripMapProps {
  segments: readonly Segment[]
  markers: readonly Visit[]
  /** Raw GPS fixes (rawSignals) to draw as a faint dense trail. */
  rawPoints?: readonly RawPoint[]
  /**
   * Timeline-mode route vertices (T16). Already time-ordered by
   * `prepareTimeline`; may come from rawSignals or, for dates outside Google's
   * ~30-day raw retention, from semantic segment paths. Every vertex is drawn
   * as a dot. Falls back to `rawPoints` when omitted.
   */
  route?: readonly TimelineVertex[]
  /**
   * Start of the selected range, or null when open-ended. Used to label a stop
   * that began before the range (an overnight stay) instead of silently showing
   * it as part of the selected day (T22).
   */
  rangeStartMs?: number | null
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
  flyTarget: Point | null
  /** Draw a small circle at every route vertex. Defaults to true. */
  showRoutePoints?: boolean
  /**
   * Rendering mode: "activityType" (default) = segments colored by activity + bridges;
   * "timeline" = single continuous polyline of rawSignals + visit markers.
   */
  mode?: 'activityType' | 'timeline'
  /**
   * Reports the current zoom level (on mount and on every `zoomend`). The page
   * uses it to disable the "trajectory points" toggle below `DOT_MIN_ZOOM`,
   * where the dot layers are intentionally not drawn (T23).
   */
  onZoomChange?: (zoom: number) => void
}

interface ControllerProps {
  fitBounds: LatLngBoundsMatrix | null
  fitKey: string | null
  invalidateKey: string
  flyTarget: Point | null
}

function FitController({ fitBounds, fitKey, invalidateKey, flyTarget }: ControllerProps) {
  const map = useMap()
  const lastFitKey = useRef<string | null>(null)
  const lastInvalidate = useRef<string>(invalidateKey)
  const lastTarget = useRef<Point | null>(null)

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
    // NOTE: never call map methods (e.g. map.stop()) in this cleanup. React
    // tears the pane down around the same time, so Leaflet's `_getMapPanePos`
    // can read a detached pane and throw `_leaflet_pos` — which previously
    // crashed the whole React tree (blank screen) when collapsing the sidebar.
    // The only safe cleanup here is cancelling our own rAF.
    return () => cancelAnimationFrame(raf)
  }, [fitBounds, fitKey, invalidateKey, map])

  // T39/N1 — reset Leaflet's `_animatingZoom` on the final unmount so a
  // pending zoom transition (e.g. a re-import re-fit) cannot fire its 250ms
  // timer after `Map.remove()` deleted `_mapPane`. Full root-cause chain in the
  // shared hook; both map views (Trips + Places) mount the same belt so the
  // race cannot resurface in a third view.
  useResetZoomAnimOnUnmount(map)

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

/**
 * Leaflet draws every vector layer on one shared canvas, so each pan/zoom
 * repaints all of them. At a low zoom (the decade-spanning "全部" view) the
 * per-vertex dots are a dense blob that costs tens of thousands of canvas arcs
 * per frame while adding little visually — the polyline already shows the
 * route. The dots are therefore only mounted once the user zooms in far enough
 * for individual points to be meaningful. Reported on `zoomend` so the dot
 * layers mount/unmount once per zoom level, never per frame.
 */
export const DOT_MIN_ZOOM = 6

function ZoomWatcher({ onZoom }: { onZoom: (zoom: number) => void }) {
  const map = useMap()
  useEffect(() => {
    onZoom(map.getZoom())
    const handler = (): void => onZoom(map.getZoom())
    map.on('zoomend', handler)
    return () => {
      map.off('zoomend', handler)
    }
  }, [map, onZoom])
  return null
}

/** Small clipboard button used inside the shared map popup (plain DOM). */
function makeCopyButton(lat: number, lng: number, t: Translate): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'trip-popup-copy'
  button.textContent = t('map.copyCoords')
  button.addEventListener('click', (event) => {
    event.stopPropagation()
    writeCoordsToClipboard(lat, lng)
      .then(() => {
        button.textContent = t('map.copied')
      })
      .catch(() => {
        button.textContent = t('map.copyFailed')
      })
      .finally(() => {
        window.setTimeout(() => {
          button.textContent = t('map.copyCoords')
        }, 1500)
      })
  })
  return button
}

/**
 * Build the popup DOM for a picked map point. Built as real DOM (not an HTML
 * string) so the coordinate text can never be interpreted as markup, and so the
 * Google Maps link is a genuine anchor. Canvas circle markers do not fire DOM
 * hover events, so a click-opened popup is the reliable way to expose the GPS
 * fix — one shared popup is opened imperatively to avoid mounting a Popup
 * element per vertex (routes can hold tens of thousands of them).
 */
function pointPopupContent(opts: {
  lat: number
  lng: number
  t: Translate
  title?: string
  address?: string
  meta?: string
}): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'trip-popup'

  const hasTitle = opts.title !== undefined
  const title = document.createElement('div')
  title.className = 'trip-popup-title'
  title.textContent = opts.title ?? `${opts.lat.toFixed(5)}, ${opts.lng.toFixed(5)}`
  wrap.appendChild(title)

  if (opts.address) {
    const addr = document.createElement('div')
    addr.className = 'trip-popup-addr'
    addr.textContent = opts.address
    wrap.appendChild(addr)
  }

  // Only repeat the coordinates when a distinct title (e.g. a place name) was
  // given; for a bare route vertex the title already IS the coordinate.
  if (hasTitle) {
    const coords = document.createElement('div')
    coords.className = 'trip-popup-meta'
    coords.textContent = `${opts.lat.toFixed(5)}, ${opts.lng.toFixed(5)}`
    wrap.appendChild(coords)
  }

  if (opts.meta) {
    const meta = document.createElement('div')
    meta.className = 'trip-popup-meta'
    meta.textContent = opts.meta
    wrap.appendChild(meta)
  }

  const actions = document.createElement('div')
  actions.className = 'trip-popup-actions'
  actions.appendChild(makeCopyButton(opts.lat, opts.lng, opts.t))

  const link = document.createElement('a')
  link.className = 'trip-popup-link'
  link.href = googleMapsUrl(opts.lat, opts.lng)
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  link.textContent = opts.t('map.openGoogleMaps')
  link.addEventListener('click', (event) => event.stopPropagation())
  actions.appendChild(link)
  wrap.appendChild(actions)

  const note = document.createElement('div')
  note.className = 'trip-popup-note'
  note.textContent = opts.t('map.coordsPrivacyNote')
  wrap.appendChild(note)

  return wrap
}

/** Clipboard button for the React-rendered visit tooltip. */
export default function TripMap(props: TripMapProps) {
  const {
    segments,
    markers,
    rawPoints = [],
    route,
    bridges = [],
    highlightedSegments,
    selectedMarkerIndex,
    onSelectMarker,
    fitBounds,
    fitKey,
    invalidateKey,
    flyTarget,
    showRoutePoints = true,
    mode = 'activityType',
    rangeStartMs = null,
    onZoomChange,
  } = props

  const { t, formatDateTime, formatDuration, formatDay } = useI18n()

  // Current zoom level, reported by ZoomWatcher. Starts below DOT_MIN_ZOOM so
  // the first paint never mounts tens of thousands of dot layers; the initial
  // fit (or the first zoomend) reports the real level.
  const [zoom, setZoom] = useState(0)
  const dotsVisible = showRoutePoints && zoom >= DOT_MIN_ZOOM

  // Stable so ZoomWatcher's effect (which depends on this callback) does not
  // re-subscribe on every render.
  //
  // `onZoomChange` is only called when the dot-availability boolean
  // (`zoom >= DOT_MIN_ZOOM`) flips — not on every zoom level. Reporting every
  // `zoomend` would re-render the whole TripsView (the page state it feeds)
  // on each zoom step for no reason.
  const lastDotsAvailable = useRef<boolean | null>(null)
  const handleZoom = useCallback(
    (next: number): void => {
      setZoom(next)
      const available = next >= DOT_MIN_ZOOM
      if (lastDotsAvailable.current !== available) {
        lastDotsAvailable.current = available
        onZoomChange?.(next)
      }
    },
    [onZoomChange],
  )

  // Timeline mode: single polyline through the prepared route, plus a dot for
  // every vertex (the "trail of points"). The route may be raw GPS fixes or
  // semantic segment paths (older dates), so it falls back to `rawPoints` when
  // no explicit route is supplied.
  const timelineRoute = useMemo(
    () => (route && route.length > 0 ? route : rawPoints),
    [route, rawPoints],
  )

  const timelinePath = useMemo(
    () => timelineRoute.map((p): LatLngExpression => [p.lat, p.lng]),
    [timelineRoute],
  )

  const positions = useMemo(
    () =>
      segments.map((segment) => {
        // A-class fallback (`MIN_PATH_LEN = 1`): a segment clipped to a single
        // in-range vertex must draw just that vertex — falling back to the
        // (unclipped) semantic start/end would reintroduce the previous day's
        // geometry (T22/S2). Leaflet renders a 1-point polyline safely.
        const source = segmentPathOrEndpoints(segment)
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
  // Map instance for imperative one-off popups (route-point GPS fixes). Avoids
  // mounting a <Popup> element for every route vertex.
  const mapRef = useRef<L.Map | null>(null)
  useEffect(() => {
    lastOpened.current?.closeTooltip()
    const next = selectedMarkerIndex === null ? null : (circles.current.get(selectedMarkerIndex) ?? null)
    next?.openTooltip()
    lastOpened.current = next
  }, [selectedMarkerIndex])

  return (
    <MapContainer
      ref={mapRef}
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
      <ZoomWatcher onZoom={handleZoom} />
      {/* Timeline mode: single continuous route line + a dot at every vertex
          (the trail of points). The line is drawn regardless of the
          "trajectory points" toggle — that toggle only controls the dots. */}
      {mode === 'timeline' && hasRenderablePath(timelinePath) && (
        <>
          <Polyline
            positions={timelinePath}
            pathOptions={{
              color: '#3b82f6',
              weight: 2,
              opacity: 1,
            }}
            renderer={canvasRenderer}
          />
          {dotsVisible &&
            timelineRoute.map((point, index) => (
              <CircleMarker
                key={`tl-${index}`}
                center={[point.lat, point.lng]}
                radius={4}
                pathOptions={{
                  color: '#3b82f6',
                  weight: 1,
                  opacity: 0.6,
                  fillColor: '#3b82f6',
                  fillOpacity: 0.5,
                }}
                renderer={canvasRenderer}
                eventHandlers={{
                  click: () => {
                    // Close any existing popup first (single-popup behavior).
                    mapRef.current?.closePopup()
                    mapRef.current?.openPopup(
                      pointPopupContent({
                        lat: point.lat,
                        lng: point.lng,
                        t,
                        meta:
                          point.timestampMs !== undefined
                            ? formatDateTime(point.timestampMs)
                            : t('map.segmentTrace'),
                      }),
                      [point.lat, point.lng],
                    )
                  },
                }}
              />
            ))}
        </>
      )}
      {/* Raw GPS fixes (rawSignals) render as a faint dense trail underneath
          the stitched/activity polylines. Gated by the same trajectory-points
          toggle since both are raw dot trails. */}
      {mode === 'activityType' && dotsVisible &&
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
      {mode === 'activityType' && bridges.map((bridge, index) => (
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
            <span className="trip-tip-title">{bridgeLabel(t, bridge.gapMs)}</span>
            <span className="trip-tip-meta">
              {formatDateTime(bridge.fromMs)} {bridge.gapMs <= 0 ? '↔' : '→'} {formatDateTime(bridge.toMs)}
            </span>
          </Tooltip>
        </Polyline>
      ))}
      {mode === 'activityType' && segments.map((segment, index) => {
        const latLngs = positions[index]
        if (!hasRenderablePath(latLngs)) return null
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
      {mode === 'activityType' && dotsVisible && routePoints.map((point, index) => (
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
              radius={selected ? 12 : 8}
              pathOptions={{
                color: '#fff',
                weight: 2,
                // Stops are deliberately NOT the route blue: they are places,
                // not movement, and must be distinguishable from the trail.
                fillColor: selected ? '#f59e0b' : '#ef4444',
                fillOpacity: selected ? 1 : 0.9,
                opacity: 0.95,
              }}
              renderer={canvasRenderer}
              eventHandlers={{ click: () => onSelectMarker(index, visit) }}
              ref={(el) => {
                if (el) circles.current.set(index, el)
              }}
            >
            <Tooltip direction="top" offset={[0, -4]} className="trip-tooltip" permanent={selected} interactive>
              <span className="trip-tip-title">{title}</span>
              {visit.address !== undefined && <span className="trip-tip-addr">{visit.address}</span>}
              {rangeStartMs !== null && visit.startMs < rangeStartMs && (
                <span className="trip-tip-overnight">
                  {t('list.overnight', { date: formatDay(visit.startMs) })}
                </span>
              )}
              {visit.name !== undefined && (
                <span className="trip-tip-meta">
                  {visit.lat.toFixed(5)}, {visit.lng.toFixed(5)}
                </span>
              )}
              <span className="trip-tip-meta">
                {formatDateTime(visit.startMs)} · {formatDuration(visit.endMs - visit.startMs)}
              </span>
              <span className="trip-tip-actions">
                <CopyCoordsButton lat={visit.lat} lng={visit.lng} />
                <a
                  className="trip-tip-link"
                  href={googleMapsUrl(visit.lat, visit.lng)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  {t('map.openGoogleMaps')}
                </a>
              </span>
              <span className="trip-tip-note">{t('map.coordsPrivacyNote')}</span>
            </Tooltip>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}