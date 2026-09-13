export const SITE_NAME = 'GT Viewer'

export const SITE_TAGLINE = 'Google Timeline 位置历史本地查看器'

/** Placeholder replaced at T10 deployment with real OPC 3.0 introduction URL. */
export const OPC_3_LINK = '#'

export const NAV_LINKS = [
  { label: '首页', to: '/' },
  { label: 'Trips', to: '/app' },
  { label: 'Places', to: '/app/places' },
  { label: '教程', to: '/help' },
  { label: '设置', to: '/settings' },
] as const