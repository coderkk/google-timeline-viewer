// Lightweight, dependency-free i18n. A React context holds the active language
// and exposes a `t()` lookup plus locale-aware formatters. The language is
// in-memory only (defaults to the browser language on load) — nothing is
// persisted, matching the product's no-storage privacy guarantee.
//
// This module intentionally exports both the provider component and pure
// helpers (detectLang/translate); fast-refresh granularity is not a concern for
// a lib module that rarely changes.
/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { en } from './en'
import { zh, type MessageKey } from './zh'

export type Lang = 'en' | 'zh'
export type { MessageKey }

const CATALOGS: Record<Lang, Record<MessageKey, string>> = { en, zh }

/** zh* browser language → Simplified Chinese; everything else → English. */
export function detectLang(): Lang {
  const nav = typeof navigator !== 'undefined' ? navigator.language : ''
  return nav.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  )
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

const WEEKDAYS: Record<Lang, readonly string[]> = {
  zh: ['一', '二', '三', '四', '五', '六', '日'],
  en: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
}

const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function formatDate(lang: Lang, ms: number): string {
  const d = new Date(ms)
  if (lang === 'zh') return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  return `${MONTHS_EN[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`
}

export function formatDateTime(lang: Lang, ms: number): string {
  const d = new Date(ms)
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  if (lang === 'zh') return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${time}`
  return `${MONTHS_EN[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()} ${time}`
}

export function formatDay(lang: Lang, ms: number): string {
  const d = new Date(ms)
  if (lang === 'zh') return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  return `${MONTHS_EN[d.getMonth()].slice(0, 3)} ${d.getDate()}`
}

export function formatMonthTitle(lang: Lang, year: number, monthIndex: number): string {
  return lang === 'zh' ? `${year} 年 ${monthIndex + 1} 月` : `${MONTHS_EN[monthIndex]} ${year}`
}

export function formatDuration(lang: Lang, ms: number): string {
  if (ms < 60000) return lang === 'zh' ? '<1分钟' : '<1m'
  const minutes = Math.round(ms / 60000)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (lang === 'zh') {
    if (h === 0) return `${m}分钟`
    return m === 0 ? `${h}小时` : `${h}小时${m}分`
  }
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export function formatNumber(lang: Lang, n: number): string {
  return new Intl.NumberFormat(lang === 'zh' ? 'zh-CN' : 'en-US').format(n)
}

export function formatDistanceKm(lang: Lang, km: number): string {
  const value = km < 10 ? km.toFixed(1) : Math.round(km).toString()
  return lang === 'zh' ? `${value} 公里` : `${value} km`
}

export interface I18n {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: MessageKey, params?: Record<string, string | number>) => string
  formatDate: (ms: number) => string
  formatDateTime: (ms: number) => string
  formatDay: (ms: number) => string
  formatMonthTitle: (year: number, monthIndex: number) => string
  formatDuration: (ms: number) => string
  formatNumber: (n: number) => string
  formatDistanceKm: (km: number) => string
  formatRangeLabel: (range: { startMs: number | null; endMs: number | null }) => string
  weekdayLabels: readonly string[]
}

function makeI18n(lang: Lang, setLang: (lang: Lang) => void): I18n {
  const catalog = CATALOGS[lang]
  return {
    lang,
    setLang,
    t: (key, params) => interpolate(catalog[key], params),
    formatDate: (ms) => formatDate(lang, ms),
    formatDateTime: (ms) => formatDateTime(lang, ms),
    formatDay: (ms) => formatDay(lang, ms),
    formatMonthTitle: (year, monthIndex) => formatMonthTitle(lang, year, monthIndex),
    formatDuration: (ms) => formatDuration(lang, ms),
    formatNumber: (n) => formatNumber(lang, n),
    formatDistanceKm: (km) => formatDistanceKm(lang, km),
    formatRangeLabel: (range) =>
      `${range.startMs === null ? catalog['drp.any'] : formatDate(lang, range.startMs)} ~ ${
        range.endMs === null ? catalog['drp.any'] : formatDay(lang, range.endMs)
      }`,
    weekdayLabels: WEEKDAYS[lang],
  }
}

const I18nContext = createContext<I18n | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => detectLang())
  const value = useMemo(() => makeI18n(lang, setLang), [lang])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>')
  return ctx
}

/**
 * Non-React lookup for lib code that only needs a couple of strings (e.g. tile
 * validation messages). Prefer `useI18n()` inside components so language
 * switches re-render.
 */
export function translate(lang: Lang, key: MessageKey, params?: Record<string, string | number>): string {
  return interpolate(CATALOGS[lang][key], params)
}
