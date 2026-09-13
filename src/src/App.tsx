import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import RouterBridge from './components/RouterBridge'
import Landing from './pages/Landing'
import TripsPage from './pages/TripsPage'
import PlacesPage from './pages/PlacesPage'
import HelpPage from './pages/HelpPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
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