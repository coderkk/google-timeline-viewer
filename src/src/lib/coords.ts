// Coordinate-copy helpers shared by every map popup/tooltip. Copying is the
// product's privacy-safe default for "I want this location elsewhere": it is a
// pure local operation (no network request), so it keeps the "data never leaves
// the device" promise. External Google Maps links stay available but must be
// labelled — see `COORDS_PRIVACY_NOTE`.

export const COORDS_PRIVACY_NOTE = '外部链接会把坐标与你的 IP 发送给 Google'

/**
 * Copy `lat,lng` to the clipboard.
 *
 * Guards against a missing `navigator.clipboard` (non-secure contexts) so a
 * click degrades to a rejected promise the caller can surface instead of
 * throwing synchronously out of the event handler.
 */
export function writeCoordsToClipboard(lat: number, lng: number): Promise<void> {
  const text = `${lat},${lng}`
  const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
  if (clipboard !== undefined && typeof clipboard.writeText === 'function') {
    return clipboard.writeText(text)
  }
  return Promise.reject(new Error('clipboard unavailable'))
}

/** Build a Google Maps deep link for a coordinate (external, opt-in). */
export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`
}
