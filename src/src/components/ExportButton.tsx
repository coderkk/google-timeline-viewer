// Trip export entry (T25). Renders the trigger button plus a confirmation
// dialog that lists exactly what will leave the tool before anything is
// written. Everything is client-side: the document is built in memory and
// handed to the browser as a Blob download — no upload, no share link.
//
// The dialog is intentionally explicit about the privacy boundary: the export
// file itself is NOT protected by this app once it lands on disk, so the user
// must confirm the range and contents first (PRD 功能 10).
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  buildExport,
  exportExtension,
  exportFileName,
  exportMimeType,
  type ExportFormat,
} from '../lib/export'
import { fmtRangeLabel, prepareTimeline } from '../lib/trips'
import { useTimelineStore } from '../store/timelineStore'

const FORMAT_LABEL: Record<ExportFormat, string> = {
  geojson: 'GeoJSON',
  kml: 'KML',
}

export default function ExportButton() {
  const [open, setOpen] = useState(false)
  const data = useTimelineStore((state) => state.data)
  const dateRange = useTimelineStore((state) => state.dateRange)
  const [format, setFormat] = useState<ExportFormat>('geojson')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Only computed while the dialog is open, so the (potentially heavy) filter
  // pass never runs on ordinary page renders.
  const payload = useMemo(
    () => (open && data ? prepareTimeline(data.visits, dateRange, data.points, data.segments) : null),
    [open, data, dateRange],
  )

  const close = (): void => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  // Modal basics: move focus into the dialog on open, close on Escape, and let
  // Escape be handled here (stopPropagation) so it never reaches the map/router.
  useEffect(() => {
    if (!open) return
    dialogRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  if (!data) return null

  const rangeLabel = fmtRangeLabel(dateRange)
  const routePoints = payload?.route.length ?? 0
  const visitCount = payload?.visits.length ?? 0

  const download = (): void => {
    if (!payload) return
    const content = buildExport(format, { route: payload.route, visits: payload.visits })
    const blob = new Blob([content], { type: exportMimeType(format) })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = exportFileName(format, dateRange)
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    // Revoke on the next macrotask, not synchronously: Firefox/older Safari can
    // cancel an in-flight download if the blob URL is revoked immediately.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="data-bar-btn"
        onClick={() => setOpen(true)}
        title="导出当前筛选范围内的轨迹与停留"
      >
        导出
      </button>
      {open && (
        <div className="export-overlay" role="dialog" aria-modal="true" aria-label="导出行程">
          <div className="export-dialog" ref={dialogRef} tabIndex={-1}>
            <h3 className="export-title">导出行程</h3>

            <dl className="export-facts">
              <div>
                <dt>范围</dt>
                <dd>{rangeLabel}</dd>
              </div>
              <div>
                <dt>内容</dt>
                <dd>
                  {routePoints.toLocaleString()} 个轨迹点（LineString）· {visitCount.toLocaleString()} 个停留点（Point）
                </dd>
              </div>
            </dl>

            <div className="export-format" role="radiogroup" aria-label="导出格式">
              {(['geojson', 'kml'] as const).map((option) => (
                <label key={option} className={format === option ? 'export-radio active' : 'export-radio'}>
                  <input
                    type="radio"
                    name="export-format"
                    value={option}
                    checked={format === option}
                    onChange={() => setFormat(option)}
                  />
                  {FORMAT_LABEL[option]}
                </label>
              ))}
            </div>

            <ul className="export-notes">
              <li>只导出当前筛选范围内的数据（可在上方日期范围调整）。</li>
              <li>已剥离原始文件名、装置标识与文件路径等 metadata，不含任何本工具内部信息。</li>
              <li>导出文件不受本工具保护：一旦下载到磁盘，请自行妥善保管，切勿上传到不可信的第三方服务。</li>
              <li>本工具全程在本机生成文件，不会上传、不产生任何网络请求。</li>
            </ul>

            <div className="export-actions">
              <button type="button" className="export-cancel" onClick={close}>
                取消
              </button>
              <button type="button" className="export-confirm" onClick={download}>
                下载 {FORMAT_LABEL[format]} (.{exportExtension(format)})
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
