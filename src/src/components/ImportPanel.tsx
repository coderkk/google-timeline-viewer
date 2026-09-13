// Import panel used by the empty state: click to pick files, or drag & drop
// them anywhere on the drop zone. Multiple JSON exports are accepted; progress
// from the parsing worker is shown as a bar, and errors offer a retry path.
import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useTimelineStore } from '../store/timelineStore'

const SUPPORTED_FORMATS =
  '支持格式：Timeline.json / Records.json / YYYY_MM.json / Location History.json（可一次选择多个文件）'

export default function ImportPanel() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const status = useTimelineStore((state) => state.status)
  const parseProgress = useTimelineStore((state) => state.parseProgress)
  const errorMsg = useTimelineStore((state) => state.errorMsg)
  const importFiles = useTimelineStore((state) => state.importFiles)

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
          <p className="progress-label">正在解析（{parseProgress}%）… 大文件可能需要一小段时间</p>
        </div>
      ) : status === 'error' ? (
        <div className="error-area">
          <p className="error-title">无法载入数据</p>
          <p className="error-msg">{errorMsg}</p>
          <p className="error-hint">请重新选择文件，或改用上方列出的受支持格式。若文件另有加密，请先解锁。</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => inputRef.current?.click()}>
            重新选择文件
          </button>
        </div>
      ) : (
        <>
          <button type="button" className="btn btn-primary btn-lg" onClick={() => inputRef.current?.click()}>
            导入 Timeline 数据
          </button>
          <p className="drop-hint">或把文件拖拽到此处</p>
          <p className="file-support">{SUPPORTED_FORMATS}</p>
        </>
      )}
    </div>
  )
}