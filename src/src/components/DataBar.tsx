// Shows the loaded dataset's file name plus a "change data" action. Sits above
// the shared date-range picker in the Trips/Places sidebars so the user can see
// what is loaded and swap it without refreshing the page.
import { useTimelineStore } from '../store/timelineStore'
import { useI18n } from '../lib/i18n'
import ExportButton from './ExportButton'

export default function DataBar() {
  const dataSource = useTimelineStore((state) => state.dataSource)
  const dataLabel = useTimelineStore((state) => state.dataLabel)
  const dataFileCount = useTimelineStore((state) => state.dataFileCount)
  const clearData = useTimelineStore((state) => state.clearData)
  const { t } = useI18n()

  if (dataSource === 'none') return null

  // The store keeps only language-neutral values; the display label is resolved
  // here so it follows the active language.
  const label =
    dataSource === 'sample'
      ? t('data.sample')
      : dataLabel === null
        ? t('data.unnamed')
        : dataFileCount > 1
          ? `${dataLabel} ${t('data.filesSuffix', { count: dataFileCount })}`
          : dataLabel

  return (
    <div className="data-bar">
      <div className="data-bar-info">
        <span className="data-bar-caption">{t('data.current')}</span>
        <span className="data-bar-file" title={label}>
          {label}
        </span>
      </div>
      <ExportButton />
      <button type="button" className="data-bar-btn" onClick={clearData}>
        {t('data.change')}
      </button>
    </div>
  )
}
