// Leaflet map for the Places view: a clean, marker-free base layer. Clicking
// anywhere records the pick point and draws a semi-transparent radius ring
// showing the active query scope; the ring is auto-fitted so the whole circle
// stays on screen. Clicking an entry in the result list flies the camera onto
// that stop and drops a temporary highlight marker, which survives until the
// next map click. Delta-versus-Trips styling: the ring and highlight use amber
// (#f59e0b) instead of the blue stop palette.
//
// T12.4: Click point uses a prominent L.marker (accent color), surrounding
// stops use L.circleMarker (default dim color) for visual hierarchy.
import { useCallback, useEffect, useRef } from 'react'
import L from 'leaflet'
import type { Circle as LeafletCircle } from 'leaflet'
import { Circle, CircleMarker, MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import type { Point, Visit } from '../lib/types'
import { useTimelineStore } from '../store/timelineStore'

export const PLACES_RING_COLOR = '#f59e0b'
export const PLACES_CLICK_MARKER_COLOR = '#3b82f6'
export const PLACES_STOP_MARKER_COLOR = '#94a3b8'

interface ClickControllerProps {
  onPick: (point: Point) => void
}

// Single listener bound to the map instance. Leaflet only fires `click` for
// plain clicks (drag gestures are suppressed internally), so picking needs no
// per-layer handlers.
function ClickController({ onPick }: ClickControllerProps) {
  const map = useMap()
  const handler = useCallback(
    (event: L.LeafletMouseEvent) => onPick({ lat: event.latlng.lat, lng: event.latlng.lng }),
    [onPick],
  )
  useEffect(() => {
    map.on('click', handler)
    return () => {
      map.off('click', handler)
    }
  }, [map, handler])
  return null
}

interface RadiusCircleProps {
  center: Point
  radiusKm: number
}

// Rings the current query scope and re-fits the viewport so the circle stays
// whole whenever the center or the radius band changes. The ref callback stores
// the Leaflet circle instance; fitting is deferred behind a rAF so the ring's
// geometry is refreshed before `getBounds()` reads it.
function RadiusCircle({ center, radiusKm }: RadiusCircleProps) {
  const map = useMap()
  const circleRef = useRef<LeafletCircle | null>(null)
  const setCircleRef = useCallback((instance: LeafletCircle | null) => {
    circleRef.current = instance
  }, [])

  useEffect(() => {
    let attempts = 0
    let raf = 0
    const fit = () => {
      const circle = circleRef.current
      const size = map.getSize()
      if ((!circle || size.x < 2 || size.y < 2) && attempts++ < 120) {
        raf = requestAnimationFrame(fit)
        return
      }
      if (circle) map.fitBounds(circle.getBounds(), { padding: [40, 40], animate: true })
    }
    raf = requestAnimationFrame(fit)
    return () => cancelAnimationFrame(raf)
  }, [center, radiusKm, map])

  return (
    <Circle
      center={[center.lat, center.lng]}
      radius={radiusKm * 1000}
      pathOptions={{
        color: PLACES_RING_COLOR,
        weight: 2,
        opacity: 0.85,
        fillColor: PLACES_RING_COLOR,
        fillOpacity: 0.07,
      }}
      ref={setCircleRef}
    />
  )
}

interface FlyControllerProps {
  selected: Visit | null
}

// Flies the camera onto the selected result stop once per selection change.
function FlyController({ selected }: FlyControllerProps) {
  const map = useMap()
  const lastTarget = useRef<Visit | null>(null)

  useEffect(() => {
    if (!selected) {
      lastTarget.current = null
      return
    }
    const prev = lastTarget.current
    if (prev && prev.lat === selected.lat && prev.lng === selected.lng && prev.startMs === selected.startMs) {
      return
    }
    lastTarget.current = selected
    const size = map.getSize()
    if (size.x < 2 || size.y < 2) return
    map.flyTo([selected.lat, selected.lng], Math.max(map.getZoom(), 14), { duration: 0.7 })
  }, [selected, map])

  return null
}

interface InvalidateControllerProps {
  invalidateKey: string
}

// Re-layouts the map when the sidebar collapses/expands so tiles render at the
// correct size.
function InvalidateController({ invalidateKey }: InvalidateControllerProps) {
  const map = useMap()
  const lastKey = useRef<string>(invalidateKey)

  useEffect(() => {
    if (lastKey.current === invalidateKey) return
    lastKey.current = invalidateKey
    requestAnimationFrame(() => map.invalidateSize())
  }, [invalidateKey, map])

  return null
}

export interface PlacesMapProps {
  center: Point | null
  radiusKm: number
  selected: Visit | null
  visits: Visit[]
  onPick: (point: Point) => void
  onVisitClick: (visit: Visit) => void
  invalidateKey: string
}

export default function PlacesMap({
  center,
  radiusKm,
  selected,
  visits,
  onPick,
  onVisitClick,
  invalidateKey,
}: PlacesMapProps) {
  const tileSource = useTimelineStore((state) => state.tileSource)
  return (
    <MapContainer className="trip-map" center={[14, 112]} zoom={5} scrollWheelZoom maxZoom={19}>
      <TileLayer url={tileSource.url} attribution={tileSource.attribution} />
      <ClickController onPick={onPick} />
      <InvalidateController invalidateKey={invalidateKey} />
      {center && <RadiusCircle center={center} radiusKm={radiusKm} />}
      {visits.map((visit, i) => (
        <CircleMarker
          key={`visit-${visit.lat}-${visit.lng}-${visit.startMs}-${i}`}
          center={[visit.lat, visit.lng]}
          radius={7}
          pathOptions={{
            color: '#fff',
            weight: 2,
            fillColor: PLACES_RING_COLOR,
            fillOpacity: 1,
            opacity: 1,
          }}
          eventHandlers={{
            click: (e: L.LeafletMouseEvent) => {
              L.DomEvent.stopPropagation(e)
              onVisitClick(visit)
            },
          }}
        />
      ))}
      {center && (
        <Marker
          key={`click-${center.lat}-${center.lng}`}
          position={[center.lat, center.lng]}
          icon={L.divIcon({
            className: 'places-click-marker',
            html: `<div style="background:${PLACES_CLICK_MARKER_COLOR};width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          })}
        />
      )}
      <FlyController selected={selected} />
    </MapContainer>
  )
}