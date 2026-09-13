// Empty-state landing shown by Trips/Places until a dataset is loaded: welcome,
// import panel, one-click sample load (with badge), tutorial link and privacy
// promise.
import { Link } from 'react-router-dom'
import ImportPanel from '../components/ImportPanel'
import { SAMPLE_LABEL } from '../lib/sample'
import { useTimelineStore } from '../store/timelineStore'

export default function EmptyState() {
  const loadSample = useTimelineStore((state) => state.loadSample)
  const status = useTimelineStore((state) => state.status)
  const busy = status === 'parsing'

  return (
    <section className="page">
      <div className="empty-state">
        <p className="empty-eyebrow">Google Timeline 本地查看器</p>
        <h1>把你的位置历史变成可回放的地图</h1>
        <p className="empty-lead">
          导入 Google 导出的位置历史 JSON，在本机浏览器中回放行程轨迹，并在地图上按位置查询历史停留点。
        </p>
        <ImportPanel />
        <div className="empty-options">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void loadSample()}>
            载入示例数据
          </button>
          <span className="badge-sample">{SAMPLE_LABEL}</span>
        </div>
        <p className="empty-help">
          不知道怎么导出？<Link to="/help">查看导出教程 →</Link>
        </p>
        <p className="privacy-note">所有数据仅在本机浏览器内存中处理，不会上传到任何服务器。</p>
      </div>
    </section>
  )
}