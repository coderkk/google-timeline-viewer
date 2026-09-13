import { Outlet, useLocation } from 'react-router-dom'
import Header from './Header'
import Footer from './Footer'

export default function Layout() {
  const location = useLocation()
  const isApp = location.pathname.startsWith('/app')
  return (
    <div className="app-shell">
      <Header />
      <main className={isApp ? 'app-main app-main--app' : 'app-main'}>
        <Outlet />
      </main>
      {!isApp && <Footer />}
    </div>
  )
}