// Merge archive page (T36 / PRD 功能 14): combine a previous merged file
// (optional) with a freshly exported Timeline.json into ONE new merged
// Timeline.json, downloaded locally. The merge itself runs on a Web Worker so
// the indeterminate progress animation stays alive for 100MB+ files; the file
// is generated in-browser — nothing is uploaded and no network request is made.
import { useState, type ChangeEvent } from 'react'
import { useI18n, type MessageKey } from '../lib/i18n'
import { mergeInWorker } from '../lib/merge/worker'
import { MergeError } from '../lib/merge'
import type { MergeStats } from '../lib/merge'

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** Suggested download name from the merged window's latest fix. */
function mergeFileName(windowEndMs: number): string {
  if (windowEndMs <= 0) return 'timeline-merged.json'
  const d = new Date(windowEndMs)
  return `timeline-merged-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}.json`
}

const FILE_ACCEPT = '.json,application/json,application/octet-stream'

interface MergeErrorState {
  key: MessageKey
  params: Record<string, string | number>
}

export default function MergePage() {
  const { t, formatDate } = useI18n()
  const [mainFile, setMainFile] = useState<File | null>(null)
  const [newFile, setNewFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<MergeStats | null>(null)
  const [error, setError] = useState<MergeErrorState | null>(null)

  const canMerge = newFile !== null && !busy

  const pickMain = (event: ChangeEvent<HTMLInputElement>): void => {
    setMainFile(event.target.files?.[0] ?? null)
    // Reset so re-picking the same file still fires the change event.
    event.target.value = ''
  }

  const pickNew = (event: ChangeEvent<HTMLInputElement>): void => {
    setNewFile(event.target.files?.[0] ?? null)
    event.target.value = ''
  }

  const onMerge = async (): Promise<void> => {
    if (!newFile) return
    setBusy(true)
    setDone(null)
    setError(null)
    try {
      const { json, stats } = await mergeInWorker(mainFile, newFile)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = mergeFileName(stats.windowEndMs)
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      // Revoke on the next macrotask (Firefox/older Safari cancel downloads if
      // the blob URL dies synchronously).
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setDone(stats)
    } catch (err) {
      if (err instanceof MergeError) {
        setError({ key: err.key as MessageKey, params: err.params })
      } else {
        setError({ key: 'merge.error.unexpected', params: {} })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="page settings-page merge-page">
      <h1>{t('merge.title')}</h1>
      <p className="settings-lead">{t('merge.lead')}</p>

      <section className="settings-section">
        <div className="tile-form merge-form">
          <label className="tile-field">
            <span>
              <strong>{t('merge.mainArchive')}</strong> — {t('merge.mainHint')}
            </span>
            <input type="file" accept={FILE_ACCEPT} onChange={pickMain} disabled={busy} />
            {mainFile && <p className="merge-file-name">{mainFile.name}</p>}
          </label>
          <label className="tile-field">
            <span>
              <strong>{t('merge.newExport')}</strong> — {t('merge.newHint')}
            </span>
            <input type="file" accept={FILE_ACCEPT} onChange={pickNew} disabled={busy} required />
            {newFile && <p className="merge-file-name">{newFile.name}</p>}
          </label>
        </div>
      </section>

      <section className="settings-section">
        <button
          type="button"
          className="btn btn-primary btn-lg"
          onClick={() => void onMerge()}
          disabled={!canMerge}
        >
          {t('merge.mergeButton')}
        </button>
        {!newFile && !busy && <p className="merge-hint">{t('merge.buttonHint')}</p>}
      </section>

      {busy && (
        <section className="settings-section merge-progress">
          <div className="progress-track">
            <div className="progress-fill progress-fill--indeterminate" />
          </div>
          <p className="progress-label">{t('merge.parsing')}</p>
        </section>
      )}

      {done && (
        <section className="settings-section merge-result">
          <p className="merge-ok">
            {t('merge.success', {
              segments: done.semanticSegments,
              raw: done.rawSignals,
              points: done.points,
              date: formatDate(done.windowEndMs),
            })}
          </p>
        </section>
      )}

      {error && (
        <section className="settings-section">
          <p className="error-title">{t('import.errorTitle')}</p>
          <p className="error-msg">{t(error.key, error.params)}</p>
        </section>
      )}

      <p className="privacy-note">{t('merge.privacy')}</p>
    </section>
  )
}