import { Link, NavLink } from 'react-router-dom'
import { NAV_LINKS, SITE_NAME } from '../lib/site'

export default function Header() {
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
              end={link.to === '/'}
              className={({ isActive }) => (isActive ? 'site-nav-link active' : 'site-nav-link')}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  )
}