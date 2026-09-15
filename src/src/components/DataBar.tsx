// Shows the loaded dataset's file name plus a "change data" action. Sits above
// the shared date-range picker in the Trips/Places sidebars so the user can see
// what is loaded and swap it without refreshing the page.
import { useTimelineStore } from '../store/timelineStore'
import ExportButton from './ExportButton'

export default function DataBar() {
  const dataSource = useTimelineStore((state) => state.dataSource)
  const dataLabel = useTimelineStore((state) => state.dataLabel)
  const clearData = useTimelineStore((state) => state.clearData)

  if (dataSource === 'none') return null

  const label = dataLabel ?? '未命名数据'

  return (
    <div className="data-bar">
      <div className="data-bar-info">
        <span className="data-bar-caption">当前数据</span>
        <span className="data-bar-file" title={label}>
          {label}
        </span>
      </div>
      <ExportButton />
      <button type="button" className="data-bar-btn" onClick={clearData}>
        更换数据
      </button>
    </div>
  )
}
