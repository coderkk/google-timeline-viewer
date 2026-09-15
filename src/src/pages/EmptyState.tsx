// Empty-state landing shown by Trips/Places until a dataset is loaded: welcome,
// import panel, one-click sample load (with badge), tutorial link and privacy
// promise.
import { Link } from 'react-router-dom'
import ImportPanel from '../components/ImportPanel'
import { useI18n } from '../lib/i18n'
import { useTimelineStore } from '../store/timelineStore'

export default function EmptyState() {
  const loadSample = useTimelineStore((state) => state.loadSample)
  const status = useTimelineStore((state) => state.status)
  const { t } = useI18n()
  const busy = status === 'parsing'

  return (
    <section className="page">
      <div className="empty-state">
        <p className="empty-eyebrow">{t('empty.eyebrow')}</p>
        <h1>{t('empty.title')}</h1>
        <p className="empty-lead">{t('empty.lead')}</p>
        <ImportPanel />
        <div className="empty-options">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void loadSample()}>
            {t('empty.loadSample')}
          </button>
          <span className="badge-sample">{t('landing.sampleLabel')}</span>
        </div>
        <p className="empty-help">
          {t('empty.helpPrefix')}
          <Link to="/help">{t('empty.helpLink')}</Link>
        </p>
        <p className="privacy-note">{t('empty.privacy')}</p>
      </div>
    </section>
  )
}