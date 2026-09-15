// Trip chain (T29 / PRD 功能 13): links each stay to the movement segment that
// immediately precedes and follows it in time, so the activityType view can be
// read as a travel diary ("stayed here → moved this way → stayed there").
//
// Pairing rule (PRD): merge visits and segments, sort by start time (a segment
// sorts before a visit at the same instant), then take the nearest preceding /
// following SEGMENT for each visit. First/last visits may have a missing side.
//
// Boundary (by design): only the immediate neighbours enter the chain. A
// movement with no visit on either side, and any middle segment between two
// visits, is not represented — the chain is visit-centric. Pure and O(n): one
// sort + one forward and one backward scan (no nested loops).
import type { Point, Segment, Visit } from './types'
import type { DateRangeFilter } from './trips'
import { routeDistanceKm } from './stats'

export interface ChainMovement {
  /** Index into the `segments` array passed to `buildTripChain` (for highlighting). */
  segmentIndex: number
  activityType?: string
  startMs: number
  endMs: number
  /** Destination coordinate of the movement (segment end), for label fallbacks. */
  end: Point
  /** Duration clamped to the selected range (ms). */
  durationMs: number
  /** Haversine distance along the segment's rendered path (km). */
  distanceKm: number
}

export interface ChainVisit {
  visit: Visit
  /** Index into the `visits` array passed to `buildTripChain` (for selection). */
  visitIndex: number
  /** Stay duration clamped to the selected range (ms). */
  stayDurationMs: number
  /** Nearest preceding movement segment in time, when one exists. */
  incoming?: ChainMovement
  /** Nearest following movement segment in time, when one exists. */
  outgoing?: ChainMovement
}

export interface TripChain {
  /** Visits in ascending time order, each with its adjacent movements. */
  visits: ChainVisit[]
}

/** Distance along the segment's drawn geometry — same rule as the renderer. */
export function segmentDistanceKm(segment: Segment): number {
  // `> 0`: a segment clipped to one vertex draws a point (no line) → distance 0.
  const path: readonly Point[] =
    segment.path.length > 0 ? segment.path : [segment.start, segment.end]
  return routeDistanceKm(path)
}

/** Duration clamped to the range so out-of-range time never counts (PRD 功能 11/13). */
function clampDuration(startMs: number, endMs: number, range: DateRangeFilter): number {
  let start = startMs
  let end = endMs
  if (range.startMs !== null) start = Math.max(start, range.startMs)
  if (range.endMs !== null) end = Math.min(end, range.endMs)
  return Math.max(0, end - start)
}

type Event =
  | { kind: 'seg'; ms: number; index: number }
  | { kind: 'visit'; ms: number; index: number }

/**
 * Build the ordered trip chain for the already date-filtered records.
 *
 * @param visits   filtered stays (any order)
 * @param segments filtered movement segments (any order)
 * @param range    selected range, used to clamp displayed durations
 */
export function buildTripChain(
  visits: readonly Visit[],
  segments: readonly Segment[],
  range: DateRangeFilter,
): TripChain {
  const events: Event[] = []
  for (let i = 0; i < segments.length; i++) events.push({ kind: 'seg', ms: segments[i].startMs, index: i })
  for (let i = 0; i < visits.length; i++) events.push({ kind: 'visit', ms: visits[i].startMs, index: i })
  // Chronological; at equal times a segment sorts before a visit (a movement
  // starting as a stay begins is its incoming leg).
  events.sort((a, b) => {
    if (a.ms !== b.ms) return a.ms - b.ms
    if (a.kind === b.kind) return a.index - b.index
    return a.kind === 'seg' ? -1 : 1
  })

  // Nearest preceding / following segment index for every event position.
  const prevSeg: (number | null)[] = new Array(events.length).fill(null)
  const nextSeg: (number | null)[] = new Array(events.length).fill(null)
  let last: number | null = null
  for (let i = 0; i < events.length; i++) {
    prevSeg[i] = last
    if (events[i].kind === 'seg') last = events[i].index
  }
  last = null
  for (let i = events.length - 1; i >= 0; i--) {
    nextSeg[i] = last
    if (events[i].kind === 'seg') last = events[i].index
  }

  const movementOf = (index: number): ChainMovement => {
    const s = segments[index]
    return {
      segmentIndex: index,
      activityType: s.activityType,
      startMs: s.startMs,
      endMs: s.endMs,
      end: s.end,
      durationMs: clampDuration(s.startMs, s.endMs, range),
      distanceKm: segmentDistanceKm(s),
    }
  }

  const chain: ChainVisit[] = []
  for (let i = 0; i < events.length; i++) {
    const event = events[i]
    if (event.kind !== 'visit') continue
    const incoming = prevSeg[i]
    const outgoing = nextSeg[i]
    chain.push({
      visit: visits[event.index],
      visitIndex: event.index,
      stayDurationMs: clampDuration(visits[event.index].startMs, visits[event.index].endMs, range),
      incoming: incoming === null ? undefined : movementOf(incoming),
      outgoing: outgoing === null ? undefined : movementOf(outgoing),
    })
  }
  return { visits: chain }
}
