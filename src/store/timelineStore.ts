// Global app state: the imported dataset plus the date-range filter shared by
// the Trips and Places views. Import parsing runs on the Web Worker; progress
// messages are forwarded here and surfaced by the import panel.
import { create } from 'zustand'
import { loadSampleTimeline } from '../lib/sample'
import { parseFilesInWorker } from '../lib/parse/worker'
import type { TimelineData } from '../lib/types'

export type DataSource = 'none' | 'user' | 'sample'
export type TimelineStatus = 'empty' | 'parsing' | 'ready' | 'error'

export interface DateRange {
  startMs: number | null
  endMs: number | null
}

const RESET_RANGE: DateRange = { startMs: null, endMs: null }

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
  errorMsg: string | null
  parseProgress: number
  dateRange: DateRange
  importFiles: (files: File[]) => void
  loadSample: () => Promise<boolean>
  clearData: () => void
  setDateRange: (startMs: number | null, endMs: number | null) => void
  resetDateRange: () => void
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
  errorMsg: null,
  parseProgress: 0,
  dateRange: RESET_RANGE,

  importFiles: (files) => {
    if (files.length === 0) return
    const large = files.find((file) => file.size > LARGE_FILE_THRESHOLD_BYTES)
    if (
      large &&
      !window.confirm(
        `「${large.name}」超过 100MB（${(large.size / (1024 * 1024)).toFixed(1)}MB），解析可能较慢。仍要继续吗？`,
      )
    ) {
      set({ status: 'empty', parseProgress: 0, errorMsg: null })
      return
    }

    const warnings: string[] = []
    set({ status: 'parsing', parseProgress: 0, errorMsg: null, dataSource: 'user' })
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
              errorMsg: `未识别到可用数据：${warnings[0]}`,
            })
            return
          }
          set({
            data: event.data,
            status: 'ready',
            parseProgress: 100,
            errorMsg: null,
            dateRange: RESET_RANGE,
          })
          goToApp()
        }
      },
    }).catch((err) => {
      set({ status: 'error', errorMsg: parseErrorMessage(err) })
    })
  },

  loadSample: async () => {
    set({ status: 'parsing', parseProgress: 0, errorMsg: null, dataSource: 'sample' })
    try {
      const data = await loadSampleTimeline()
      set({
        data,
        status: 'ready',
        parseProgress: 100,
        errorMsg: null,
        dateRange: RESET_RANGE,
      })
      goToApp()
      return true
    } catch (err) {
      set({ status: 'error', errorMsg: parseErrorMessage(err) })
      return false
    }
  },

  clearData: () => {
    set({
      data: null,
      status: 'empty',
      dataSource: 'none',
      errorMsg: null,
      parseProgress: 0,
      dateRange: RESET_RANGE,
    })
  },

  setDateRange: (startMs, endMs) => set({ dateRange: { startMs, endMs } }),

  resetDateRange: () => set({ dateRange: RESET_RANGE }),
}))