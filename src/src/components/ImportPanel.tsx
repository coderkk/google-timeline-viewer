// Import panel used by the empty state: click to pick files, or drag & drop
// them anywhere on the drop zone. Multiple JSON exports are accepted; progress
// from the parsing worker is shown as a bar, and errors offer a retry path.
import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useI18n } from '../lib/i18n'
import { localizeWarning } from '../lib/i18n/warnings'
import { useTimelineStore } from '../store/timelineStore'

export default function ImportPanel() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const status = useTimelineStore((state) => state.status)
  const parseProgress = useTimelineStore((state) => state.parseProgress)
  const errorMsg = useTimelineStore((state) => state.errorMsg)
  const errorWarning = useTimelineStore((state) => state.errorWarning)
  const importFiles = useTimelineStore((state) => state.importFiles)
  const { t, lang } = useI18n()

  const errorText = errorWarning
    ? t('import.unrecognized', { reason: localizeWarning(lang, errorWarning) })
    : errorMsg

  const handleFiles = (files: FileList | null): void => {
    if (files && files.length > 0) importFiles(Array.from(files))
  }

  const onChange = (event: ChangeEvent<HTMLInputElement>): void => {
    handleFiles(event.target.files)
    // Reset so picking the same file again still triggers change.
    event.target.value = ''
  }

  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setDragging(false)
    handleFiles(event.dataTransfer.files)
  }

  const onDragOver = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    if (!dragging) setDragging(true)
  }

  const onDragLeave = (): void => setDragging(false)

  return (
    <div
      className={`drop-zone${dragging ? ' dragging' : ''}`}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json,application/octet-stream"
        multiple
        hidden
        onChange={onChange}
      />
      {status === 'parsing' ? (
        <div className="parse-area">
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${parseProgress}%` }} />
          </div>
          <p className="progress-label">{t('import.parsing', { progress: parseProgress })}</p>
        </div>
      ) : status === 'error' ? (
        <div className="error-area">
          <p className="error-title">{t('import.errorTitle')}</p>
          <p className="error-msg">{errorText}</p>
          <p className="error-hint">{t('import.errorHint')}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => inputRef.current?.click()}>
            {t('import.retry')}
          </button>
        </div>
      ) : (
        <>
          <button type="button" className="btn btn-primary btn-lg" onClick={() => inputRef.current?.click()}>
            {t('import.button')}
          </button>
          <p className="drop-hint">{t('import.dropHint')}</p>
          <p className="file-support">{t('import.supported')}</p>
        </>
      )}
    </div>
  )
}