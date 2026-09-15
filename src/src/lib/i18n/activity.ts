// Maps a Google Timeline activity type to its i18n message key, with a
// language-neutral fallback for unknown/empty types.
import type { MessageKey } from './zh'

const ACTIVITY_KEYS = new Set<MessageKey>([
  'activity.IN_PASSENGER_VEHICLE',
  'activity.IN_VEHICLE',
  'activity.IN_BUS',
  'activity.IN_SUBWAY',
  'activity.IN_TRAIN',
  'activity.IN_TRAM',
  'activity.IN_FERRY',
  'activity.WALKING',
  'activity.RUNNING',
  'activity.CYCLING',
  'activity.MOTORCYCLING',
  'activity.IN_FLIGHT',
  'activity.FLYING',
])

export function activityMessageKey(type?: string): MessageKey {
  if (type) {
    const key = `activity.${type}` as MessageKey
    if (ACTIVITY_KEYS.has(key)) return key
  }
  return 'activity.other'
}
