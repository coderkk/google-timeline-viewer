export const SITE_NAME = 'Timeline Map'

export const SITE_TAGLINE = 'Google Timeline 位置历史本地查看器'

/**
 * OPC 3.0 introduction link used by the landing "了解更多 →" CTA. Points at the
 * author's site (coderkk.net) — the OPC 3.0 repo is private, so linking it
 * publicly would 404 for visitors.
 */
export const OPC_3_LINK = 'https://coderkk.net'

export const NAV_LINKS = [
  { label: '首页', to: '/' },
  { label: 'Trips', to: '/app' },
  { label: 'Places', to: '/app/places' },
  { label: '教程', to: '/help' },
  { label: '设置', to: '/settings' },
] as const