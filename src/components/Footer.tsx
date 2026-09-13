import { SITE_NAME, SITE_TAGLINE } from '../lib/site'

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <span>
          {SITE_NAME} — {SITE_TAGLINE}
        </span>
        {/* Anchor with a path-hash keeps native fragment scrolling: on the
            landing page it scrolls in place, from other pages it loads "/"
            and the browser moves to the #built-with-opc element. */}
        <a className="site-footer-brand" href="/#built-with-opc">
          Created by OPC 3.0
        </a>
      </div>
    </footer>
  )
}