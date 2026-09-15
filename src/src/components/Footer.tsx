import { Link } from 'react-router-dom'
import { SITE_NAME } from '../lib/site'
import { useI18n } from '../lib/i18n'

export default function Footer() {
  const { t } = useI18n()
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <span>
          {SITE_NAME} — {t('site.tagline')}
        </span>
        {/* Router link with an explicit hash: on the landing page it scrolls in
            place; from other pages it navigates to "/" first and the landing's
            scrollIntoView effect picks the hash up. Works under both
            BrowserRouter and the HashRouter used for static hosting. */}
        <Link className="site-footer-brand" to={{ pathname: '/', hash: '#built-with-opc' }}>
          {t('footer.createdBy')}
        </Link>
      </div>
    </footer>
  )
}