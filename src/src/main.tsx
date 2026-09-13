import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import 'leaflet/dist/leaflet.css'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* HashRouter keeps every route reachable on static hosts (GitHub Pages)
        where server-side path rewrites are unavailable: refresh of any page
        stays inside the single index.html document. */}
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)