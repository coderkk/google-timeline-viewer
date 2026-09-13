// Format 4: Location History.json (Takeout 最旧). Top level is an object whose
// `locations[]` entries are raw trajectory points.
import { addRawPoint, asRecord, type ParseState } from './common'

export function parseFormat4(root: unknown, state: ParseState, ctx: string): void {
  const record = asRecord(root)
  if (!record) {
    state.warnings.push(`${ctx}: Location History.json 顶层应为对象`)
    return
  }
  const locations = record['locations']
  if (!Array.isArray(locations)) {
    state.warnings.push(`${ctx}: 缺少 locations 数组`)
    return
  }
  locations.forEach((location, index) => {
    const loc = asRecord(location)
    if (loc) addRawPoint(loc, state, `${ctx} locations[${index}]`)
  })
}