import { SAMPLE_LABEL } from '../lib/sample'
import { useTimelineStore } from '../store/timelineStore'
import EmptyState from './EmptyState'

export default function TripsPage() {
  const data = useTimelineStore((state) => state.data)
  const dataSource = useTimelineStore((state) => state.dataSource)
  if (!data) return <EmptyState />
  return (
    <section className="page">
      <div className="page-head">
        <h2>Trips 主视图</h2>
        {dataSource === 'sample' && <span className="badge-sample">{SAMPLE_LABEL}</span>}
      </div>
      <p className="page-lead">
        行程回放（占位 — T5 实现）。已载入 {data.meta.pointCount} 点 / {data.meta.segmentCount} 段 /{' '}
        {data.meta.visitCount} 个停留点。
      </p>
    </section>
  )
}