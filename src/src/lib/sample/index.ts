// Sample data loader: the bundled sample-timeline.json is inlined as a raw
// string and run through the regular parsing pipeline (format 1), so sample
// and real user imports share the exact same code path.
import { parseTimelineFile } from '../parse'
import type { TimelineData } from '../types'
import sampleRaw from './sample-timeline.json?raw'

/** Badge shown next to any UI that is using the bundled sample data. */
export const SAMPLE_LABEL = '模拟数据 · 非真实轨迹'

export const SAMPLE_FILE_NAME = 'sample-timeline.json'

/**
 * Load the bundled simulated timeline. Resolves once the file has been parsed
 * into the unified TimelineData model through `parseTimelineFile`.
 */
export async function loadSampleTimeline(): Promise<TimelineData> {
  const { data } = parseTimelineFile(SAMPLE_FILE_NAME, sampleRaw)
  return data
}