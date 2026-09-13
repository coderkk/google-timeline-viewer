// Date-range filter for the Trips/Places views. Writes the shared store
// `dateRange` (null = open side), exposes quick presets anchored to the end of
// the loaded dataset, and renders the current span summary.
import { useMemo } from 'react'
import { endOfDayMs, parseInputDate, toInputDate, type DateRangeFilter } from '../lib/trips'
import { useTimelineStore } from '../store/timelineStore'

const DAY_MS = 24 * 60 * 60 * 1000

interface Preset {
  label: string
  active: boolean
  apply: () => void
}

export default function DateRangePicker() {
  const dateRange: DateRangeFilter = useTimelineStore((state) => state.dateRange)
  const setDateRange = useTimelineStore((state) => state.setDateRange)
  const resetDateRange = useTimelineStore((state) => state.resetDateRange)
  const dataTimeRange = useTimelineStore((state) => state.data?.meta.timeRange)

  const presets: Preset[] = useMemo(() => {
    const endAnchor = dataTimeRange ? endOfDayMs(dataTimeRange.maxMs) : 0
    const last30: DateRangeFilter = { startMs: endAnchor - 30 * DAY_MS + 1, endMs: endAnchor }
    const last365: DateRangeFilter = { startMs: endAnchor - 365 * DAY_MS + 1, endMs: endAnchor }
    const same = (a: DateRangeFilter, b: DateRangeFilter): boolean =>
      a.startMs === b.startMs && a.endMs === b.endMs
    return [
      {
        label: '全部',
        active: dateRange.startMs === null && dateRange.endMs === null,
        apply: () => resetDateRange(),
      },
      {
        label: '近 30 天',
        active: same(dateRange, last30),
        apply: () => setDateRange(last30.startMs, last30.endMs),
      },
      {
        label: '近 1 年',
        active: same(dateRange, last365),
        apply: () => setDateRange(last365.startMs, last365.endMs),
      },
    ]
  }, [dataTimeRange, dateRange, setDateRange, resetDateRange])

  const handleStart = (value: string): void => {
    const parsed = value === '' ? null : parseInputDate(value)
    setDateRange(parsed === null ? null : parsed, dateRange.endMs)
  }

  const handleEnd = (value: string): void => {
    const parsed = value === '' ? null : parseInputDate(value)
    setDateRange(dateRange.startMs, parsed === null ? null : parsed + DAY_MS - 1)
  }

  return (
    <div className="drp">
      <div className="drp-title">日期范围</div>
      <div className="drp-presets">
        {presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className={preset.active ? 'drp-preset active' : 'drp-preset'}
            onClick={preset.apply}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="drp-fields">
        <label className="drp-field">
          <span>起</span>
          <input
            type="date"
            value={dateRange.startMs === null ? '' : toInputDate(dateRange.startMs)}
            onChange={(event) => handleStart(event.target.value)}
          />
        </label>
        <label className="drp-field">
          <span>止</span>
          <input
            type="date"
            value={dateRange.endMs === null ? '' : toInputDate(dateRange.endMs)}
            onChange={(event) => handleEnd(event.target.value)}
          />
        </label>
      </div>
      <div className="drp-hint">起止任填其一即按单边筛选；留空 = 不限</div>
    </div>
  )
}