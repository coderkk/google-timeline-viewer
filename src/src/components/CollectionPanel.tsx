// Collection panel — bookmark date ranges per dataset file.
//
// Sits between DataBar and DateRangePicker in the Trips/Places sidebar.
// Provides:
//   - "Save" button: saves the current date range with a label prompt.
//   - Collection list: shows saved bookmarks with label + date range.
//   - Load: clicking a bookmark applies its date range (DRR联动).
//   - Delete: confirmation dialog then removes the bookmark.
//
// The panel collapses when there are no collections (showing only the
// save button); it expands when there are saved items.

import { useEffect, useState } from 'react'
import { useTimelineStore } from '../store/timelineStore'
import { useI18n } from '../lib/i18n'
import {
  getCollections,
  addCollection,
  deleteCollection,
  type CollectionEntry,
} from '../lib/collections'

export default function CollectionPanel() {
  const dataLabel = useTimelineStore((state) => state.dataLabel)
  const dateRange = useTimelineStore((state) => state.dateRange)
  const setDateRange = useTimelineStore((state) => state.setDateRange)
  const dataSource = useTimelineStore((state) => state.dataSource)
  const { t, formatDay } = useI18n()

  const [saved, setSaved] = useState<CollectionEntry[]>(() => {
    if (!dataLabel) return []
    return getCollections(dataLabel)
  })
  const [labelInput, setLabelInput] = useState('')
  const [showInput, setShowInput] = useState(false)

  // Re-sync when the dataset changes (filename / dataLabel).
  // Zustand subscribers fire outside React's render cycle so this is lint-safe.
  useEffect(() => {
    const unsub = useTimelineStore.subscribe((state, prevState) => {
      if (state.dataLabel !== prevState.dataLabel) {
        if (state.dataLabel) {
          setSaved(getCollections(state.dataLabel))
        } else {
          setSaved([])
        }
      }
    })
    return unsub
  }, [])

  if (dataSource === 'none' || !dataLabel) return null

  const filename = dataLabel

  const handleSave = () => {
    // Reject partial range: both start and end must be set
    if (dateRange.startMs === null || dateRange.endMs === null) return
    const entry = addCollection(filename, {
      label: labelInput.trim() || t('collection.defaultLabel'),
      startMs: dateRange.startMs,
      endMs: dateRange.endMs,
    })
    setSaved((prev) => [...prev, entry])
    setLabelInput('')
    setShowInput(false)
  }

  const handleLoad = (entry: CollectionEntry) => {
    setDateRange(entry.startMs, entry.endMs)
  }

  const handleDelete = (entry: CollectionEntry) => {
    if (!window.confirm(t('collection.confirmDelete', { label: entry.label }))) return
    deleteCollection(filename, entry.id)
    setSaved((prev) => prev.filter((item) => item.id !== entry.id))
  }

  const hasSaved = saved.length > 0

  return (
    <div className="collection-panel">
      {/* Panel header */}
      <div className="collection-header">
        <span className="collection-icon">★</span>
        <span className="collection-title">{t('collection.title')}</span>
        {!showInput ? (
          <button
            type="button"
            className="collection-add-btn"
            onClick={() => setShowInput(true)}
            disabled={dateRange.startMs === null && dateRange.endMs === null}
            title={t('collection.saveTitle')}
          >
            {t('collection.add')}
          </button>
        ) : (
          <div className="collection-input-row">
            <input
              type="text"
              className="collection-input"
              placeholder={t('collection.labelPlaceholder')}
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave()
                if (e.key === 'Escape') {
                  setShowInput(false)
                  setLabelInput('')
                }
              }}
              autoFocus
            />
            <div className="collection-input-actions">
              <button type="button" className="collection-input-btn collection-input-btn--ok" onClick={handleSave}>
                {t('collection.save')}
              </button>
              <button type="button" className="collection-input-btn collection-input-btn--cancel" onClick={() => { setShowInput(false); setLabelInput('') }}>
                {t('common.close')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Saved collections list */}
      {hasSaved && (
        <div className="collection-list">
          {saved.map((entry) => (
            <div key={entry.id} className="collection-item">
              <div className="collection-item-info">
                <span className="collection-item-label">{entry.label}</span>
                <span className="collection-item-range">
                  {entry.startMs === 0 ? t('drp.any') : formatDay(entry.startMs)}
                  {' → '}
                  {entry.endMs === 0 ? t('drp.any') : formatDay(entry.endMs)}
                </span>
              </div>
              <div className="collection-item-actions">
                <button
                  type="button"
                  className="collection-load-btn"
                  onClick={() => handleLoad(entry)}
                >
                  {t('collection.load')}
                </button>
                <button
                  type="button"
                  className="collection-delete-btn"
                  onClick={() => handleDelete(entry)}
                >
                  {t('collection.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state hint */}
      {!hasSaved && (
        <div className="collection-empty-hint">{t('collection.emptyHint')}</div>
      )}
    </div>
  )
}