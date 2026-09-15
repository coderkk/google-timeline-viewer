export const SITE_NAME = 'Timeline Map'

/**
 * OPC 3.0 introduction link used by the landing "了解更多 →" CTA. Points at the
 * author's site (coderkk.net) — the OPC 3.0 repo is private, so linking it
 * publicly would 404 for visitors.
 */
export const OPC_3_LINK = 'https://coderkk.net'

/** Nav items carry a message key; Header resolves it through `useI18n()`. */
export const NAV_LINKS = [
  { labelKey: 'nav.home', to: '/' },
  { labelKey: 'nav.trips', to: '/app' },
  { labelKey: 'nav.places', to: '/app/places' },
  { labelKey: 'nav.help', to: '/help' },
  { labelKey: 'nav.settings', to: '/settings' },
] as const