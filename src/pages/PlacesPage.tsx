import { SAMPLE_LABEL } from '../lib/sample'
import { useTimelineStore } from '../store/timelineStore'
import EmptyState from './EmptyState'

export default function PlacesPage() {
  const data = useTimelineStore((state) => state.data)
  const dataSource = useTimelineStore((state) => state.dataSource)
  if (!data) return <EmptyState />
  return (
    <section className="page">
      <div className="page-head">
        <h2>Places</h2>
        {dataSource === 'sample' && <span className="badge-sample">{SAMPLE_LABEL}</span>}
      </div>
      <p className="page-lead">
        地图点击查询历史停留点（占位 — T6 实现）。已载入 {data.meta.visitCount} 个停留点。
      </p>
    </section>
  )
}