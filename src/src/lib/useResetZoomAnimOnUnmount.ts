// T39/N1 family — single "belt" against the mobile `_leaflet_pos` teardown
// race. Every map-backed view must mount this hook (Trips FitController,
// Places ResetZoomAnimController) so a third view cannot leak the same bug
// again (already hit twice: T27 warning at the FitController cleanup, T38/T39
// the full crash).
import { useEffect } from 'react'
import type { Map as LeafletMap } from 'leaflet'

/**
 * Resets Leaflet's private `_animatingZoom` flag on the FINAL unmount so a
 * pending animated zoom transition cannot fire after the map pane is torn
 * down.
 *
 * Root cause (captured stack, Leaflet 1.9.4):
 *   _onZoomTransitionEnd → _move → _getNewPixelOrigin → _getMapPanePos
 *   → getPosition(undefined) → "Cannot read properties of undefined
 *   (reading '_leaflet_pos')"
 *
 * `_animateZoom` schedules `setTimeout(_onZoomTransitionEnd, 250)` and sets
 * `_animatingZoom = true`. `Map.remove()` deletes `_mapPane` but neither
 * cancels that timer nor resets the flag; `_onZoomTransitionEnd` guards
 * `this._mapPane` only for the `removeClass` step, then calls `_move`
 * unconditionally, which reads the now-deleted pane. Flipping the flag back
 * makes the timer's first line (`if (!this._animatingZoom) return`) a no-op.
 *
 * Discipline (team lessons, do not regress):
 * - Plain private-field reset ONLY — never a Leaflet method call. The T27
 *   `map.stop()` attempt read the detaching pane and white-screened the app.
 * - The effect depends only on the stable `map` instance (empty-deps pattern):
 *   the cleanup runs exclusively on the final unmount, never on
 *   fit/invalidate/fly re-runs, so a transition still running in a LIVE map is
 *   untouched. A pending transition completes normally; only the teardown
 *   (view swap / sidebar collapse / data re-import + instant navigate away)
 *   path is neutralized.
 */
export function useResetZoomAnimOnUnmount(map: LeafletMap): void {
  useEffect(() => {
    const mapRef = map as LeafletMap & { _animatingZoom: boolean }
    return () => {
      mapRef._animatingZoom = false
    }
  }, [map])
}