import { SITE_NAME, SITE_TAGLINE } from '../lib/site'

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <span>
          {SITE_NAME} — {SITE_TAGLINE}
        </span>
        <span className="site-footer-brand">Created by OPC 3.0</span>
      </div>
    </footer>
  )
}