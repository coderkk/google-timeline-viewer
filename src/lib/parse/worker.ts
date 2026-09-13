// Main-thread facade for parsing files on a Web Worker so large exports never
// block the UI. Files are transferred to the worker; progress and the final
// merged dataset come back through messages. Oversized files (>100MB by
// default) emit a `large` notice first so the UI can warn the user.
import type { TimelineData } from '../types'
import ParseWorker from './parse.worker?worker'
import type { ParseFilesRequest, WorkerResponse } from './parse.worker'

export type ParseProgressEvent =
  | {
      type: 'large'
      fileName: string
      sizeBytes: number
      thresholdBytes: number
      fileCount: number
      progress: number
    }
  | WorkerResponse

export interface ParseFilesOptions {
  largeFileThresholdBytes?: number
  onProgress?: (event: ParseProgressEvent) => void
}

const DEFAULT_LARGE_FILE_THRESHOLD_BYTES = 100 * 1024 * 1024

export function parseFilesInWorker(
  files: File[],
  options: ParseFilesOptions = {},
): Promise<TimelineData> {
  const thresholdBytes = options.largeFileThresholdBytes ?? DEFAULT_LARGE_FILE_THRESHOLD_BYTES
  const onProgress = options.onProgress
  return new Promise<TimelineData>((resolve, reject) => {
    const worker = new ParseWorker()
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data
      onProgress?.(message)
      if (message.type === 'done') {
        worker.terminate()
        resolve(message.data)
      }
    }
    worker.onerror = (event) => {
      worker.terminate()
      reject(new Error(event.message || 'Worker 解析失败'))
    }

    for (const file of files) {
      if (file.size > thresholdBytes) {
        onProgress?.({
          type: 'large',
          fileName: file.name,
          sizeBytes: file.size,
          thresholdBytes,
          fileCount: files.length,
          progress: 0,
        })
      }
    }

    const request: ParseFilesRequest = { type: 'parse-files', files }
    worker.postMessage(request)
  })
}