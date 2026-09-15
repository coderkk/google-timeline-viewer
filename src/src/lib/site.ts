export const SITE_NAME = 'Timeline Map'

export const SITE_TAGLINE = 'Google Timeline 位置历史本地查看器'

/**
 * OPC 3.0 introduction link used by the landing "了解更多 →" CTA. The repo is
 * currently PRIVATE, so public visitors get a 404 — a known and accepted
 * trade-off (see docs/NOTES.md 2026-09-15). Do not remove/redirect.
 */
export const OPC_3_LINK = 'https://github.com/coderkk/opc-3.0'

export const NAV_LINKS = [
  { label: '首页', to: '/' },
  { label: 'Trips', to: '/app' },
  { label: 'Places', to: '/app/places' },
  { label: '教程', to: '/help' },
  { label: '设置', to: '/settings' },
] as const