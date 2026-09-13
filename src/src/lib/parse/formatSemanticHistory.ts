// Format 3: Semantic Location History YYYY_MM.json (Takeout 旧). Top level is
// an object whose `timelineObjects[]` entries are either `{ placeVisit }` or
// `{ activitySegment }`.
import { asRecord, parseSemanticElement, stitchSegments, type ParseState } from './common'

export function parseFormat3(root: unknown, state: ParseState, ctx: string): void {
  const record = asRecord(root)
  if (!record) {
    state.warnings.push(`${ctx}: Semantic Location History 顶层应为对象`)
    return
  }
  const timelineObjects = record['timelineObjects']
  if (!Array.isArray(timelineObjects)) {
    state.warnings.push(`${ctx}: 缺少 timelineObjects 数组`)
    return
  }
  timelineObjects.forEach((element, index) =>
    parseSemanticElement(element, state, `${ctx} timelineObjects[${index}]`),
  )
  // Same final stitching pass as formats 1/2 (no-op when the pool is empty).
  stitchSegments(state)
}
