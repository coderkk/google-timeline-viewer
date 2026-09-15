import { useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import RouterBridge from './components/RouterBridge'
import Landing from './pages/Landing'
import TripsPage from './pages/TripsPage'
import PlacesPage from './pages/PlacesPage'
import HelpPage from './pages/HelpPage'
import SettingsPage from './pages/SettingsPage'
import { useI18n } from './lib/i18n'
import { useTimelineStore } from './store/timelineStore'

export default function App() {
  const themeMode = useTimelineStore((state) => state.themeMode)
  const { t, lang } = useI18n()

  useEffect(() => {
    const root = document.documentElement
    if (themeMode === 'system') {
      root.removeAttribute('data-theme')
    } else {
      root.setAttribute('data-theme', themeMode)
    }
  }, [themeMode])

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : 'en'
    document.title = t('app.title')
  }, [t, lang])

  return (
    <>
      <RouterBridge />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/app" element={<TripsPage />} />
          <Route path="/app/places" element={<PlacesPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Landing />} />
        </Route>
      </Routes>
    </>
  )
}