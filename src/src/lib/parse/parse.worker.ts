// Web Worker entry: receives File objects, parses each one defensively on a
// background thread, and reports per-file progress plus a merged TimelineData
// back to the main thread. `globalThis` is the dedicated worker scope at
// runtime; it is typed locally to avoid mixing DOM and WebWorker libs.
import type { TimelineData } from '../types'
import { mergeTimelineData, parseTimelineFile } from './index'
import { emptyTimelineData } from './common'

export interface ParseFilesRequest {
  type: 'parse-files'
  files: File[]
}

export type WorkerResponse =
  | { type: 'start'; fileCount: number; progress: number }
  | {
      type: 'reading'
      fileIndex: number
      fileCount: number
      fileName: string
      progress: number
    }
  | {
      type: 'parsing'
      fileIndex: number
      fileCount: number
      fileName: string
      progress: number
    }
  | {
      type: 'warning'
      fileIndex: number
      fileCount: number
      fileName: string
      warning: string
      progress: number
    }
  | { type: 'done'; fileCount: number; data: TimelineData; warnings: string[]; progress: number }

interface WorkerScope {
  onmessage: ((event: MessageEvent<ParseFilesRequest>) => void) | null
  postMessage(message: WorkerResponse): void
}

const scope = globalThis as unknown as WorkerScope

/** Upper bound on per-file warning events forwarded to the main thread. */
const MAX_WARNING_EVENTS = 200

scope.onmessage = async (event: MessageEvent<ParseFilesRequest>) => {
  if (event.data?.type !== 'parse-files') return
  const files = event.data.files ?? []
  const fileCount = files.length
  scope.postMessage({ type: 'start', fileCount, progress: 0 })

  const results: TimelineData[] = []
  const allWarnings: string[] = []
  for (let index = 0; index < fileCount; index++) {
    const file = files[index]
    const progress = fileCount === 0 ? 1 : index / fileCount
    try {
      scope.postMessage({
        type: 'reading',
        fileIndex: index,
        fileCount,
        fileName: file.name,
        progress,
      })
      const text = await file.text()
      scope.postMessage({
        type: 'parsing',
        fileIndex: index,
        fileCount,
        fileName: file.name,
        progress,
      })
      const parsed = parseTimelineFile(file.name, text)
      for (const warning of parsed.warnings) {
        if (allWarnings.length < MAX_WARNING_EVENTS) {
          scope.postMessage({
            type: 'warning',
            fileIndex: index,
            fileCount,
            fileName: file.name,
            warning,
            progress,
          })
        }
        allWarnings.push(warning)
      }
      results.push(parsed.data)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      allWarnings.push(`${file.name}: ${message}`)
      results.push(emptyTimelineData())
    }
  }
  scope.postMessage({
    type: 'done',
    fileCount,
    data: mergeTimelineData(results, allWarnings),
    warnings: allWarnings,
    progress: 1,
  })
}