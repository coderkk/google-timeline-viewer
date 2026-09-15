// Shared date-range filter for the Trips/Places views, written as a dual-month
// calendar range picker: click a start day, then an end day (the first click
// alone leaves the end open — a one-sided filter). Quick presets (all / last 30
// days / last year) are kept. Writes the shared store `dateRange`; null = open
// side, so both views stay in sync.
import { useState } from 'react'
import { endOfDayMs, startOfDayMs, type DateRangeFilter } from '../lib/trips'
import { useI18n } from '../lib/i18n'
import { useTimelineStore } from '../store/timelineStore'

const DAY_MS = 24 * 60 * 60 * 1000

interface ViewMonth {
  year: number
  month: number
}

function monthOf(ms: number): ViewMonth {
  const d = new Date(ms)
  return { year: d.getFullYear(), month: d.getMonth() }
}

function shiftMonth(view: ViewMonth, delta: number): ViewMonth {
  const d = new Date(view.year, view.month + delta, 1)
  return { year: d.getFullYear(), month: d.getMonth() }
}

/** Day cells for a month, Monday-first, with leading blanks. */
function monthCells(view: ViewMonth): (number | null)[] {
  const lead = (new Date(view.year, view.month, 1).getDay() + 6) % 7
  const days = new Date(view.year, view.month + 1, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let d = 1; d <= days; d++) cells.push(new Date(view.year, view.month, d).getTime())
  return cells
}

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
  const { t, formatDate, formatDay, formatMonthTitle, weekdayLabels } = useI18n()

  const [view, setView] = useState<ViewMonth>(() =>
    monthOf(dateRange.startMs ?? dataTimeRange?.maxMs ?? Date.now()),
  )
  // "Today" is captured once per mount (lazy initializer) rather than read
  // during render, which the react-hooks purity rule disallows.
  const [todayStart] = useState(() => startOfDayMs(Date.now()))

  const startDay = dateRange.startMs === null ? null : startOfDayMs(dateRange.startMs)
  const endDay = dateRange.endMs === null ? null : startOfDayMs(dateRange.endMs)

  const presets: Preset[] = (() => {
    const endAnchor = dataTimeRange ? endOfDayMs(dataTimeRange.maxMs) : 0
    const last30: DateRangeFilter = { startMs: endAnchor - 30 * DAY_MS + 1, endMs: endAnchor }
    const last365: DateRangeFilter = { startMs: endAnchor - 365 * DAY_MS + 1, endMs: endAnchor }
    const same = (a: DateRangeFilter, b: DateRangeFilter): boolean =>
      a.startMs === b.startMs && a.endMs === b.endMs
    return [
      {
        label: t('drp.all'),
        active: dateRange.startMs === null && dateRange.endMs === null,
        apply: () => {
          resetDateRange()
          if (dataTimeRange) setView(monthOf(dataTimeRange.maxMs))
        },
      },
      {
        label: t('drp.last30'),
        active: same(dateRange, last30),
        apply: () => {
          setDateRange(last30.startMs, last30.endMs)
          setView(monthOf(endAnchor))
        },
      },
      {
        label: t('drp.last365'),
        active: same(dateRange, last365),
        apply: () => {
          setDateRange(last365.startMs, last365.endMs)
          setView(monthOf(endAnchor))
        },
      },
    ]
  })()

  const pick = (dayMs: number): void => {
    if (startDay === null || endDay !== null) {
      // Start a fresh selection: this day becomes the (open-ended) start.
      setDateRange(dayMs, null)
      return
    }
    if (dayMs < startDay) {
      setDateRange(dayMs, endOfDayMs(startDay))
    } else {
      setDateRange(startDay, endOfDayMs(dayMs))
    }
  }

  const renderMonth = (vm: ViewMonth) => (
    <div className="drp-cal-month">
      <div className="drp-cal-month-title">{formatMonthTitle(vm.year, vm.month)}</div>
      <div className="drp-cal-weekdays">
        {weekdayLabels.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="drp-cal-grid">
        {monthCells(vm).map((dayMs, i) => {
          if (dayMs === null) return <span key={`b-${i}`} className="drp-day is-blank" />
          const classes = ['drp-day']
          if (startDay !== null && dayMs === startDay) classes.push('is-start')
          if (endDay !== null && dayMs === endDay) classes.push('is-end')
          if (startDay !== null && endDay !== null && dayMs > startDay && dayMs < endDay) {
            classes.push('in-range')
          }
          if (dayMs === todayStart) classes.push('is-today')
          return (
            <button
              key={dayMs}
              type="button"
              className={classes.join(' ')}
              aria-label={formatDate(dayMs)}
              onClick={() => pick(dayMs)}
            >
              {new Date(dayMs).getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )

  const startLabel = dateRange.startMs === null ? t('drp.any') : formatDate(dateRange.startMs)
  const endLabel = dateRange.endMs === null ? t('drp.any') : formatDay(dateRange.endMs)

  return (
    <div className="drp">
      <div className="drp-title">{t('drp.title')}</div>

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

      <div className="drp-cal-head">
        <button type="button" className="drp-cal-nav" aria-label={t('drp.prevYear')} onClick={() => setView(shiftMonth(view, -12))}>
          «
        </button>
        <button type="button" className="drp-cal-nav" aria-label={t('drp.prevMonth')} onClick={() => setView(shiftMonth(view, -1))}>
          ‹
        </button>
        <button type="button" className="drp-cal-nav" aria-label={t('drp.nextMonth')} onClick={() => setView(shiftMonth(view, 1))}>
          ›
        </button>
        <button type="button" className="drp-cal-nav" aria-label={t('drp.nextYear')} onClick={() => setView(shiftMonth(view, 12))}>
          »
        </button>
      </div>

      <div className="drp-cal-months">
        {renderMonth(view)}
        {renderMonth(shiftMonth(view, 1))}
      </div>

      <div className="drp-range">
        <span className="drp-range-label">
          {startLabel} → {endLabel}
        </span>
        <button
          type="button"
          className="drp-clear"
          onClick={() => resetDateRange()}
          disabled={dateRange.startMs === null && dateRange.endMs === null}
        >
          {t('drp.clear')}
        </button>
      </div>
      <div className="drp-hint">{t('drp.hint')}</div>
    </div>
  )
}
