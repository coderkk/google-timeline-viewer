// Format 1: Timeline.json direct-array export (Android 系统设置 / iOS Maps App).
// Top level is an array; each element bundles `semanticSegments` made of trips
// (`activityType` + start/endLocation + timelinePath / waypointPath) and
// place-visits (`location` + `duration`).
import { asRecord, parseSemanticElement, type ParseState } from './common'

export function parseFormat1(root: unknown, state: ParseState, ctx: string): void {
  if (!Array.isArray(root)) {
    state.warnings.push(`${ctx}: 顶层应为数组`)
    return
  }
  root.forEach((element, index) => {
    const record = asRecord(element)
    if (!record) return
    const semanticSegments = record['semanticSegments']
    if (Array.isArray(semanticSegments)) {
      semanticSegments.forEach((segment, segIndex) =>
        parseSemanticElement(segment, state, `${ctx} 条目[${index}].semanticSegments[${segIndex}]`),
      )
    } else if (
      ['activityType', 'placeVisit', 'location', 'startLocation'].some(
        (key) => record[key] !== undefined,
      )
    ) {
      // Some exports place segments directly on the top-level element.
      parseSemanticElement(element, state, `${ctx} 条目[${index}]`)
    }
  })
}