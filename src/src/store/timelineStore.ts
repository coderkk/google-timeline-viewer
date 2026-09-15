// Global app state: the imported dataset plus the date-range filter shared by
// the Trips and Places views. Import parsing runs on the Web Worker; progress
// messages are forwarded here and surfaced by the import panel.
import { create } from 'zustand'
import { loadSampleTimeline } from '../lib/sample'
import { parseFilesInWorker } from '../lib/parse/worker'
import { detectLang, translate } from '../lib/i18n'
import type { TileSource } from '../lib/tiles'
import { CUSTOM_TILE_NAME, OSM_TILE_SOURCE } from '../lib/tiles'
import type { TimelineData } from '../lib/types'
import { lastNDaysRange } from '../lib/trips'

export type DataSource = 'none' | 'user' | 'sample'
export type TimelineStatus = 'empty' | 'parsing' | 'ready' | 'error'
export type ThemeMode = 'system' | 'light' | 'dark'

export interface DateRange {
  startMs: number | null
  endMs: number | null
}

const RESET_RANGE: DateRange = { startMs: null, endMs: null }

// Default post-import filter is the trailing 30 days of the data (PRD 功能 2,
// T30.3), switchable back to "all" via the quick presets.
const DEFAULT_RANGE_DAYS = 30

const LARGE_FILE_THRESHOLD_BYTES = 100 * 1024 * 1024

// The store cannot call the `useNavigate` hook, so a small bridge component
// (RouterBridge) registers an imperative navigator once the router is alive.
let navigateFn: ((to: string) => void) | null = null

export function registerNavigator(navigate: (to: string) => void): void {
  navigateFn = navigate
}

function goToApp(): void {
  navigateFn?.('/app')
}

interface TimelineStore {
  data: TimelineData | null
  status: TimelineStatus
  dataSource: DataSource
  /**
   * Language-neutral dataset label: the first imported file name, or null for
   * the built-in sample. The UI resolves the display text (sample name / file
   * count suffix) through i18n at render time.
   */
  dataLabel: string | null
  /** Number of imported files (1 for a single file or the sample). */
  dataFileCount: number
  errorMsg: string | null
  /** Raw parser warning behind an "unrecognized data" error, localized in the UI. */
  errorWarning: string | null
  parseProgress: number
  dateRange: DateRange
  tileSource: TileSource
  themeMode: ThemeMode
  importFiles: (files: File[]) => void
  loadSample: () => Promise<boolean>
  clearData: () => void
  setDateRange: (startMs: number | null, endMs: number | null) => void
  resetDateRange: () => void
  setTileSource: (url: string, attribution?: string) => void
  resetTileSource: () => void
  setThemeMode: (mode: ThemeMode) => void
}

function parseErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** True when the parsed dataset carries no usable records at all. */
function isEmptyData(data: TimelineData): boolean {
  return data.points.length === 0 && data.visits.length === 0 && data.segments.length === 0
}

export const useTimelineStore = create<TimelineStore>((set) => ({
  data: null,
  status: 'empty',
  dataSource: 'none',
  dataLabel: null,
  dataFileCount: 1,
  errorMsg: null,
  errorWarning: null,
  parseProgress: 0,
  dateRange: RESET_RANGE,
  tileSource: OSM_TILE_SOURCE,
  themeMode: 'system',

  importFiles: (files) => {
    if (files.length === 0) return
    const lang = detectLang()
    const large = files.find((file) => file.size > LARGE_FILE_THRESHOLD_BYTES)
    if (
      large &&
      !window.confirm(
        translate(lang, 'import.largeConfirm', {
          name: large.name,
          size: (large.size / (1024 * 1024)).toFixed(1),
        }),
      )
    ) {
      set({ status: 'empty', parseProgress: 0, errorMsg: null, errorWarning: null })
      return
    }

    const warnings: string[] = []
    set({
      status: 'parsing',
      parseProgress: 0,
      errorMsg: null,
      errorWarning: null,
      dataSource: 'user',
      dataLabel: files[0].name,
      dataFileCount: files.length,
    })
    parseFilesInWorker(files, {
      onProgress: (event) => {
        if (event.type === 'large') return
        set({ parseProgress: Math.round(event.progress * 100) })
        if (event.type === 'warning') warnings.push(event.warning)
        if (event.type === 'done') {
          if (isEmptyData(event.data) && warnings.length > 0) {
            set({
              status: 'error',
              data: null,
              parseProgress: 100,
              errorMsg: null,
              // Raw warning; the UI localizes it in the active language so a
              // later language switch updates the message too.
              errorWarning: warnings[0],
            })
            return
          }
          set({
            data: event.data,
            status: 'ready',
            parseProgress: 100,
            errorMsg: null,
            errorWarning: null,
            // Default to the last 30 days of the parsed data (T30.3);
            // `lastNDaysRange` falls back to the open range when maxMs is not
            // finite (no usable timestamps).
            dateRange: lastNDaysRange(event.data.meta.timeRange.maxMs, DEFAULT_RANGE_DAYS),
          })
          goToApp()
        }
      },
    }).catch((err) => {
      set({ status: 'error', errorMsg: parseErrorMessage(err), errorWarning: null })
    })
  },

  loadSample: async () => {
    set({
      status: 'parsing',
      parseProgress: 0,
      errorMsg: null,
      errorWarning: null,
      dataSource: 'sample',
      dataLabel: null,
      dataFileCount: 1,
    })
    try {
      const data = await loadSampleTimeline()
      set({
        data,
        status: 'ready',
        parseProgress: 100,
        errorMsg: null,
        errorWarning: null,
        dateRange: lastNDaysRange(data.meta.timeRange.maxMs, DEFAULT_RANGE_DAYS),
      })
      goToApp()
      return true
    } catch (err) {
      set({ status: 'error', errorMsg: parseErrorMessage(err), errorWarning: null })
      return false
    }
  },

  clearData: () => {
    set({
      data: null,
      status: 'empty',
      dataSource: 'none',
      dataLabel: null,
      dataFileCount: 1,
      errorMsg: null,
      errorWarning: null,
      parseProgress: 0,
      dateRange: RESET_RANGE,
    })
  },

  setDateRange: (startMs, endMs) => set({ dateRange: { startMs, endMs } }),

  resetDateRange: () => set({ dateRange: RESET_RANGE }),

  // Tile source is intentionally in-memory only: refreshing the page resets it
  // to the OpenStreetMap default. Persisting it would require localStorage,
  // which the product deliberately avoids for every piece of mutable state.
  // `name` is language-neutral: the settings UI derives the display label from
  // whether the URL is the OSM default (see SettingsPage).
  setTileSource: (url, attribution) =>
    set({
      tileSource: {
        name: CUSTOM_TILE_NAME,
        url: url.trim(),
        attribution: attribution ?? '',
      },
    }),

  resetTileSource: () => set({ tileSource: OSM_TILE_SOURCE }),

  setThemeMode: (mode) => set({ themeMode: mode }),
}))