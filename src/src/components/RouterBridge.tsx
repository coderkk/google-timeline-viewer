// Bridges the imperative navigate captured by the timeline store with the
// react-router hook, so store actions (e.g. "import done") can switch views.
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { registerNavigator } from '../store/timelineStore'

export default function RouterBridge() {
  const navigate = useNavigate()
  useEffect(() => {
    registerNavigator((to) => navigate(to))
  }, [navigate])
  return null
}