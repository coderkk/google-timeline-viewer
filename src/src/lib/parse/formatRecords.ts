// Format 2: Records.json (Takeout 新). Top level is an object with
// `locations[]`, `activitySegments[]` and `savedPlaces`.
import {
  addRawPoint,
  addSegment,
  asRecord,
  stitchSegments,
  type ParseState,
} from './common'

export function parseFormat2(root: unknown, state: ParseState, ctx: string): void {
  const record = asRecord(root)
  if (!record) {
    state.warnings.push(`${ctx}: Records.json 顶层应为对象`)
    return
  }
  const locations = record['locations']
  if (Array.isArray(locations)) {
    locations.forEach((location, index) => {
      const loc = asRecord(location)
      if (loc) addRawPoint(loc, state, `${ctx} locations[${index}]`)
    })
  }
  const activitySegments = record['activitySegments']
  if (Array.isArray(activitySegments)) {
    activitySegments.forEach((segment, index) => {
      const seg = asRecord(segment)
      if (seg) addSegment(seg, state, `${ctx} activitySegments[${index}]`)
    })
  }
  const savedPlaces = record['savedPlaces']
  if (Array.isArray(savedPlaces) && savedPlaces.length > 0) {
    state.warnings.push(`${ctx}: savedPlaces 无时间戳，已忽略 ${savedPlaces.length} 处`)
  }
  // Same final stitching pass as format 1: Records.json also routes coarse
  // timelinePath segments through `addSegment`, so let the single sorted final
  // pass backfill any path-less activity segments (no-op when the pool is
  // empty).
  stitchSegments(state)
}
