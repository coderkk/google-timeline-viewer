import { Outlet, useLocation } from 'react-router-dom'
import Header from './Header'
import Footer from './Footer'

export default function Layout() {
  const location = useLocation()
  // Only the two map viewports (/app Trips, /app/places Places) break out of
  // the centered column and hide the footer. Sibling /app/* sub-pages (e.g.
  // /app/merge) keep the standard .app-main layout (T44).
  const isMapPage = location.pathname === '/app' || location.pathname === '/app/places'
  return (
    <div className="app-shell">
      <Header />
      <main className={isMapPage ? 'app-main app-main--app' : 'app-main'}>
        <Outlet />
      </main>
      {!isMapPage && <Footer />}
    </div>
  )
}
