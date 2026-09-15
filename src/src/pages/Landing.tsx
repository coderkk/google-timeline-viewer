// Portfolio landing page: hero with dual CTA, the "why" story, three feature
// highlights, tech stack + tutorial entry + privacy promise, and the
// "Built with OPC 3.0" section telling how the product was shaped by an
// AI-driven product flow.
import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { OPC_3_LINK, SITE_NAME } from '../lib/site'
import { useI18n } from '../lib/i18n'
import { useTimelineStore } from '../store/timelineStore'

export default function Landing() {
  const loadSample = useTimelineStore((state) => state.loadSample)
  const status = useTimelineStore((state) => state.status)
  const { hash } = useLocation()
  const { t } = useI18n()
  const busy = status === 'parsing'

  // When reached via the footer link ("Created by OPC 3.0") from another page,
  // the router remounts this page after load, so native fragment scrolling may
  // miss the target; scroll to the section explicitly instead.
  useEffect(() => {
    if (hash === '#built-with-opc') {
      document.getElementById('built-with-opc')?.scrollIntoView({ block: 'start' })
    }
  }, [hash])

  // loadSample itself navigates to /app on success, so no extra navigate call
  // is needed here (avoids a double redirect).
  const handleTryIt = () => {
    void loadSample()
  }

  return (
    <section className="page page-landing">
      <div className="landing-hero">
        <p className="empty-eyebrow">{SITE_NAME}</p>
        <h1>{t('landing.heroTitle')}</h1>
        <p className="hero-lead">{t('landing.heroLead')}</p>
        <div className="hero-cta">
          <button type="button" className="btn btn-primary btn-lg" disabled={busy} onClick={handleTryIt}>
            {busy ? t('landing.loading') : t('landing.tryIt')}
          </button>
          <Link className="btn btn-secondary btn-lg" to="/help">
            {t('landing.howToExport')}
          </Link>
        </div>
        <p className="hero-note">{t('landing.heroNote')}</p>
      </div>

      <div className="landing-section">
        <h2>{t('landing.whyTitle')}</h2>
        <p className="landing-text">{t('landing.whyText')}</p>
      </div>

      <div className="landing-section">
        <h2>{t('landing.featuresTitle')}</h2>
        <div className="feature-cards">
          <div className="feature-card">
            <p className="fc-tag">Trips</p>
            <h3>{t('landing.f1Title')}</h3>
            <p>{t('landing.f1Text')}</p>
          </div>
          <div className="feature-card">
            <p className="fc-tag">Places</p>
            <h3>{t('landing.f2Title')}</h3>
            <p>{t('landing.f2Text')}</p>
          </div>
          <div className="feature-card">
            <p className="fc-tag">Privacy</p>
            <h3>{t('landing.f3Title')}</h3>
            <p>{t('landing.f3Text')}</p>
          </div>
        </div>
      </div>

      <div className="landing-section">
        <h2>{t('landing.techTitle')}</h2>
        <p className="tech-line">React · TypeScript · Vite · Leaflet · Web Worker · Zustand</p>
        <p className="landing-text">
          {t('landing.techText')}
          <Link to="/help">{t('landing.techLink')}</Link>
        </p>
        <p className="privacy-promise">{t('landing.privacy')}</p>
      </div>

      <section id="built-with-opc" className="landing-section landing-builtwith">
        <h2>Built with OPC 3.0</h2>
        <p className="landing-text">{t('landing.opcText')}</p>
        <ol className="opc-steps">
          <li><strong>{t('landing.opcStep1')}</strong>{t('landing.opcStep1Text')}</li>
          <li><strong>{t('landing.opcStep2')}</strong>{t('landing.opcStep2Text')}</li>
          <li><strong>{t('landing.opcStep3')}</strong>{t('landing.opcStep3Text')}</li>
          <li><strong>{t('landing.opcStep4')}</strong>{t('landing.opcStep4Text')}</li>
          <li><strong>{t('landing.opcStep5')}</strong>{t('landing.opcStep5Text')}</li>
        </ol>
        <p className="landing-text">
          {t('landing.opcIntro')}{` `}
          <a href={OPC_3_LINK}>{t('landing.opcMore')}</a>
        </p>
      </section>
    </section>
  )
}
