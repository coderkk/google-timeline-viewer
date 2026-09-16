// Web Worker entry for the merge archive page (T36 / PRD 功能 14). Files of
// 100MB+ take seconds to read/parse/stringify; running the merge off the main
// thread keeps the indeterminate progress animation genuinely animating (the
// T35 lesson for the import page) and the UI responsive. The pure algorithm
// lives in ./index; this file only wires File handling + message protocol.
import { mergeTimelineExports, MergeError } from './index'
import type { MergeStats } from './index'

export interface MergeRequest {
  type: 'merge'
  mainArchive: File | null
  newExport: File
}

export type MergeWorkerResponse =
  | { type: 'done'; json: string; stats: MergeStats }
  | { type: 'error'; key: string; params: Record<string, string | number> }

interface WorkerScope {
  onmessage: ((event: MessageEvent<MergeRequest>) => void) | null
  postMessage(message: MergeWorkerResponse): void
}

const scope = globalThis as unknown as WorkerScope

scope.onmessage = async (event: MessageEvent<MergeRequest>) => {
  if (event.data?.type !== 'merge') return
  try {
    const { mainArchive, newExport } = event.data
    const mainText = mainArchive ? await mainArchive.text() : null
    const newText = await newExport.text()
    const outcome = mergeTimelineExports(
      mainArchive && mainText !== null ? { name: mainArchive.name, text: mainText } : null,
      { name: newExport.name, text: newText },
    )
    scope.postMessage({ type: 'done', json: outcome.json, stats: outcome.stats })
  } catch (err) {
    if (err instanceof MergeError) {
      scope.postMessage({ type: 'error', key: err.key, params: err.params })
    } else {
      const reason = err instanceof Error ? err.message : String(err)
      scope.postMessage({ type: 'error', key: 'merge.error.unexpected', params: { reason } })
    }
  }
}