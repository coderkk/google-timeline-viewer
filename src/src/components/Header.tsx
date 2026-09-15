import { Link, NavLink } from 'react-router-dom'
import { NAV_LINKS, SITE_NAME } from '../lib/site'
import { useI18n } from '../lib/i18n'

export default function Header() {
  const { t } = useI18n()
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link to="/" className="site-brand">
          {SITE_NAME}
        </Link>
        <nav className="site-nav">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              // Always exact-match (PRD 功能 7 acceptance): /app must not stay
              // highlighted while /app/places is active (T30.1).
              end
              className={({ isActive }) => (isActive ? 'site-nav-link active' : 'site-nav-link')}
            >
              {t(link.labelKey)}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  )
}