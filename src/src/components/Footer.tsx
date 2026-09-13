import { Link } from 'react-router-dom'
import { SITE_NAME, SITE_TAGLINE } from '../lib/site'

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <span>
          {SITE_NAME} — {SITE_TAGLINE}
        </span>
        {/* Router link with an explicit hash: on the landing page it scrolls in
            place; from other pages it navigates to "/" first and the landing's
            scrollIntoView effect picks the hash up. Works under both
            BrowserRouter and the HashRouter used for static hosting. */}
        <Link className="site-footer-brand" to={{ pathname: '/', hash: '#built-with-opc' }}>
          Created by OPC 3.0
        </Link>
      </div>
    </footer>
  )
}