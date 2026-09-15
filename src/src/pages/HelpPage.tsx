// Export guide for Google Timeline data: step-by-step Android / iOS paths,
// old vs new file format comparison and an FAQ accordion.
import { Link } from 'react-router-dom'
import FAQ from '../components/FAQ'
import { useI18n, type MessageKey } from '../lib/i18n'

const ANDROID_STEPS: MessageKey[] = [
  'help.step.a1',
  'help.step.a2',
  'help.step.a3',
  'help.step.a4',
  'help.step.a5',
  'help.step.a6',
]

const IOS_STEPS: MessageKey[] = [
  'help.step.i1',
  'help.step.i2',
  'help.step.i3',
  'help.step.i4',
  'help.step.i5',
  'help.step.i6',
]

const FAQ_ITEMS: { q: MessageKey; a: MessageKey }[] = [
  { q: 'help.faq.q1', a: 'help.faq.a1' },
  { q: 'help.faq.q2', a: 'help.faq.a2' },
  { q: 'help.faq.q3', a: 'help.faq.a3' },
  { q: 'help.faq.q4', a: 'help.faq.a4' },
]

export default function HelpPage() {
  const { t } = useI18n()
  const faqItems = FAQ_ITEMS.map((item) => ({ q: t(item.q), a: t(item.a) }))

  return (
    <section className="page page-help">
      <h1>{t('help.title')}</h1>
      <p className="help-lead">{t('help.lead')}</p>

      <section className="help-section">
        <h2>{t('help.androidTitle')}</h2>
        <p className="help-hint">{t('help.androidHint')}</p>
        <ol className="step-cards">
          {ANDROID_STEPS.map((step) => (
            <li key={step}>{t(step)}</li>
          ))}
        </ol>
        <p className="help-tip">{t('help.androidTip')}</p>
        <pre className="code-block">
          <code>{t('help.androidFile')}</code>
        </pre>
      </section>

      <section className="help-section">
        <h2>{t('help.iosTitle')}</h2>
        <p className="help-hint">{t('help.iosHint')}</p>
        <ol className="step-cards">
          {IOS_STEPS.map((step) => (
            <li key={step}>{t(step)}</li>
          ))}
        </ol>
        <p className="help-tip">{t('help.iosTip')}</p>
        <pre className="code-block">
          <code>{t('help.iosFile')}</code>
        </pre>
      </section>

      <section className="help-section">
        <h2>{t('help.formatsTitle')}</h2>
        <p className="help-hint">{t('help.formatsHint')}</p>
        <div className="format-rows">
          <div className="format-row">
            <code>Timeline.json</code>
            <span>{t('help.format1')}</span>
          </div>
          <div className="format-row">
            <code>Records.json</code>
            <span>{t('help.format2')}</span>
          </div>
          <div className="format-row">
            <code>YYYY_MM.json</code>
            <span>{t('help.format3')}</span>
          </div>
          <div className="format-row">
            <code>Location History.json</code>
            <span>{t('help.format4')}</span>
          </div>
        </div>
        <pre className="code-block">
          <code>{t('help.formatTree')}</code>
        </pre>
        <p className="help-tip">{t('help.formatsTip')}</p>
      </section>

      <section className="help-section">
        <h2>{t('help.faqTitle')}</h2>
        <FAQ items={faqItems} />
      </section>

      <div className="help-cta">
        <Link className="btn btn-primary btn-lg" to="/">
          {t('help.cta')}
        </Link>
      </div>
    </section>
  )
}
