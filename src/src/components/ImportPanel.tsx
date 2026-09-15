// Import panel used by the empty state: click to pick a file, or drag & drop
// it onto the drop zone. Import is a single-file viewer (PRD 功能 1, T35):
// multi-Takeout merge lives on the separate 功能 14 page. While parsing, an
// indeterminate animated bar is shown — the parser is one synchronous block
// with no honest mid-parse percentage, so no number is fabricated.
import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useI18n } from '../lib/i18n'
import { localizeWarning } from '../lib/i18n/warnings'
import { useTimelineStore } from '../store/timelineStore'

export default function ImportPanel() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const status = useTimelineStore((state) => state.status)
  const errorMsg = useTimelineStore((state) => state.errorMsg)
  const errorWarning = useTimelineStore((state) => state.errorWarning)
  const importFiles = useTimelineStore((state) => state.importFiles)
  const { t, lang } = useI18n()

  const errorText = errorWarning
    ? t('import.unrecognized', { reason: localizeWarning(lang, errorWarning) })
    : errorMsg

  const handleFiles = (files: FileList | null): void => {
    // Single-file import (PRD 功能 1): a multi-file drop takes the first file.
    if (files && files.length > 0) importFiles([files[0]])
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
        hidden
        onChange={onChange}
      />
      {status === 'parsing' ? (
        <div className="parse-area">
          <div className="progress-track">
            <div className="progress-fill progress-fill--indeterminate" />
          </div>
          <p className="progress-label">{t('import.parsing')}</p>
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