// Main-thread facade for the merge worker (T36 / PRD 功能 14). The heavy
// merge runs on a background thread so a multi-hundred-MB archive merge never
// blocks the page; the done payload is the serialized merged file + stats, and
// merge-time errors come back as i18n key/params.
import { detectLang, translate } from '../i18n'
import { MergeError } from './index'
import type { MergeStats } from './index'
import MergeWorker from './merge.worker?worker'
import type { MergeWorkerResponse } from './merge.worker'

export interface MergeDone {
  json: string
  stats: MergeStats
}

export function mergeInWorker(mainArchive: File | null, newExport: File): Promise<MergeDone> {
  return new Promise<MergeDone>((resolve, reject) => {
    const worker = new MergeWorker()
    worker.onmessage = (event: MessageEvent<MergeWorkerResponse>) => {
      const message = event.data
      if (message.type === 'done') {
        worker.terminate()
        resolve({ json: message.json, stats: message.stats })
      } else {
        worker.terminate()
        reject(new MergeError(message.key, message.params))
      }
    }
    worker.onerror = (event) => {
      worker.terminate()
      reject(
        new MergeError('merge.error.unexpected', {
          reason: event.message || translate(detectLang(), 'import.workerFailed'),
        }),
      )
    }
    worker.postMessage({ type: 'merge', mainArchive, newExport })
  })
}