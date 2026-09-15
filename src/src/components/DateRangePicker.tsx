// Shared date-range filter for the Trips/Places views. The always-visible part
// is a single compact trigger row ("当前范围 ▾"); clicking it opens a popover
// containing the dual-month calendar range picker (T30.2): click a start day,
// then an end day — a lone first click leaves the end open (a one-sided
// filter) — with quick presets (all / last 30 days / last year). Writes the
// shared store `dateRange`; null = open side, so both views stay in sync. The
// popover closes on Esc, an outside click (transparent backdrop), a completed
// double pick and preset application; it is also force-closed when the dataset
// is replaced or cleared so an open popover never describes a stale range.
import { useEffect, useState } from 'react'
import { endOfDayMs, lastNDaysRange, startOfDayMs, type DateRangeFilter } from '../lib/trips'
import { useI18n } from '../lib/i18n'
import { useTimelineStore } from '../store/timelineStore'

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

  const [open, setOpen] = useState(false)
  const [view, setView] = useState<ViewMonth>(() =>
    monthOf(dateRange.startMs ?? dataTimeRange?.maxMs ?? Date.now()),
  )
  // "Today" is captured once per mount (lazy initializer) rather than read
  // during render, which the react-hooks purity rule disallows.
  const [todayStart] = useState(() => startOfDayMs(Date.now()))

  // When the dataset is replaced or cleared, the store resets `dateRange`
  // (importFiles / loadSample write a fresh range, clearData returns to the
  // open one). Both TripsPage and PlacesPage keep this picker mounted across
  // those swaps, so a popover left open would describe a stale range. Watching
  // the immutable `data` reference is the smallest reliable signal — it changes
  // on exactly those three actions. Zustand invokes subscribers outside the
  // React effect/render cycle, so `setOpen` here is lint-safe (it is not a
  // synchronous setState inside the effect body — see PlacesPage's rule note).
  useEffect(
    () =>
      useTimelineStore.subscribe((state, prevState) => {
        if (state.data !== prevState.data) setOpen(false)
      }),
    [],
  )

  // Esc closes the popover (listener attached only while it is open).
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  const startDay = dateRange.startMs === null ? null : startOfDayMs(dateRange.startMs)
  const endDay = dateRange.endMs === null ? null : startOfDayMs(dateRange.endMs)

  const presets: Preset[] = (() => {
    const endAnchor = dataTimeRange ? endOfDayMs(dataTimeRange.maxMs) : 0
    // Same formula as the imported default range (T30.3): recomputing through
    // `lastNDaysRange` keeps the "active" highlight consistent with the store.
    const last30 = lastNDaysRange(endAnchor, 30)
    const last365 = lastNDaysRange(endAnchor, 365)
    const same = (a: DateRangeFilter, b: DateRangeFilter): boolean =>
      a.startMs === b.startMs && a.endMs === b.endMs
    const close = (): void => setOpen(false)
    return [
      {
        label: t('drp.all'),
        active: dateRange.startMs === null && dateRange.endMs === null,
        apply: () => {
          resetDateRange()
          if (dataTimeRange) setView(monthOf(dataTimeRange.maxMs))
          close()
        },
      },
      {
        label: t('drp.last30'),
        active: same(dateRange, last30),
        apply: () => {
          setDateRange(last30.startMs, last30.endMs)
          setView(monthOf(endAnchor))
          close()
        },
      },
      {
        label: t('drp.last365'),
        active: same(dateRange, last365),
        apply: () => {
          setDateRange(last365.startMs, last365.endMs)
          setView(monthOf(endAnchor))
          close()
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
    // Double-click pattern complete: hide the popover (T30.2). "Clear" stays
    // open on purpose (the user may keep picking another range).
    setOpen(false)
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

  // Trigger text: whole-range "不限" alone; one-sided "2026-08-01 → 不限";
  // both sides "2026-08-01 → 08-15" (T30.2).
  const startLabel = dateRange.startMs === null ? t('drp.any') : formatDate(dateRange.startMs)
  const endLabel = dateRange.endMs === null ? t('drp.any') : formatDay(dateRange.endMs)
  const rangeText =
    dateRange.startMs === null && dateRange.endMs === null
      ? t('drp.any')
      : `${startLabel} → ${endLabel}`

  return (
    <div className="drp">
      <button
        type="button"
        className="drp-trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="drp-trigger-label">{t('drp.title')}</span>
        <span className="drp-trigger-range">{rangeText}</span>
        <span className="drp-trigger-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <>
          {/* Transparent full-screen click-catcher: any click outside the
              popover (map, topbar, sidebar content) closes it. */}
          <div className="drp-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="drp-popover" role="dialog" aria-label={t('drp.title')}>
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
        </>
      )}
    </div>
  )
}