// Small "copy coordinate" button shared by the map tooltips. Copying is the
// privacy-safe default action (local only); the Google Maps link next to it is
// an explicit external action and is labelled separately.
import { useState } from 'react'
import { writeCoordsToClipboard } from '../lib/coords'

export default function CopyCoordsButton({
  lat,
  lng,
  className = 'trip-tip-copy',
}: {
  lat: number
  lng: number
  className?: string
}) {
  const [state, setState] = useState<'idle' | 'done' | 'error'>('idle')
  return (
    <button
      type="button"
      className={className}
      aria-live="polite"
      onClick={(event) => {
        event.stopPropagation()
        writeCoordsToClipboard(lat, lng)
          .then(() => setState('done'))
          .catch(() => setState('error'))
          .finally(() => {
            window.setTimeout(() => setState('idle'), 1500)
          })
      }}
    >
      {state === 'done' ? '已复制' : state === 'error' ? '复制失败' : '复制坐标'}
    </button>
  )
}
