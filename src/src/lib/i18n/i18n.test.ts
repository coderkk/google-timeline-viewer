import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  detectLang,
  formatDate,
  formatDateTime,
  formatDistanceKm,
  formatDuration,
  formatMonthTitle,
  formatNumber,
  translate,
} from './index'
import { en } from './en'
import { zh } from './zh'
import { localizeWarning } from './warnings'

describe('i18n catalogs', () => {
  it('define exactly the same key set', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('has no empty messages', () => {
    for (const [key, value] of Object.entries(en)) expect(value, `en.${key}`).not.toBe('')
    for (const [key, value] of Object.entries(zh)) expect(value, `zh.${key}`).not.toBe('')
  })

  it('has no CJK left in the English catalog', () => {
    const offenders = Object.entries(en)
      .filter(([, value]) => /[\u4e00-\u9fff]/.test(value))
      .map(([key]) => key)
    // 'lang.chinese' intentionally shows the Chinese language name.
    expect(offenders).toEqual(['lang.chinese'])
  })
})

describe('detectLang', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('maps zh* to Simplified Chinese', () => {
    vi.stubGlobal('navigator', { language: 'zh-CN' })
    expect(detectLang()).toBe('zh')
    vi.stubGlobal('navigator', { language: 'zh-Hant-TW' })
    expect(detectLang()).toBe('zh')
  })

  it('maps everything else to English', () => {
    vi.stubGlobal('navigator', { language: 'en-US' })
    expect(detectLang()).toBe('en')
    vi.stubGlobal('navigator', { language: 'ja-JP' })
    expect(detectLang()).toBe('en')
  })
})

describe('translate', () => {
  it('looks up per language and interpolates params', () => {
    expect(translate('en', 'map.copied')).toBe('Copied')
    expect(translate('zh', 'map.copied')).toBe('已复制')
    expect(translate('en', 'import.parsing', { progress: 42 })).toContain('42%')
    expect(translate('en', 'trips.summary.stays', { n: 3 })).toContain('3')
  })
})

describe('locale formatters', () => {  it('formats durations per language', () => {
    const ms = 9 * 3600_000 + 5 * 60_000
    expect(formatDuration('zh', ms)).toBe('9小时5分')
    expect(formatDuration('en', ms)).toBe('9h 5m')
    expect(formatDuration('zh', 45 * 60_000)).toBe('45分钟')
    expect(formatDuration('en', 45 * 60_000)).toBe('45m')
    expect(formatDuration('en', 30_000)).toBe('<1m')
  })

  it('formats dates and month titles per language', () => {
    const ms = new Date(2026, 8, 15, 14, 5).getTime()
    expect(formatDate('zh', ms)).toBe('2026-09-15')
    expect(formatDate('en', ms)).toBe('Sep 15, 2026')
    expect(formatDateTime('zh', ms)).toBe('2026-09-15 14:05')
    expect(formatDateTime('en', ms)).toBe('Sep 15, 2026 14:05')
    expect(formatMonthTitle('zh', 2026, 8)).toBe('2026 年 9 月')
    expect(formatMonthTitle('en', 2026, 8)).toBe('September 2026')
  })

  it('formats numbers and distances per language', () => {
    expect(formatNumber('en', 12345)).toBe('12,345')
    expect(formatDistanceKm('zh', 1.23)).toBe('1.2 公里')
    expect(formatDistanceKm('en', 1.23)).toBe('1.2 km')
    expect(formatDistanceKm('en', 42.6)).toBe('43 km')
  })
})

describe('localizeWarning', () => {
  it('renders known parser-warning templates in English with no residual CJK', () => {
    const out = localizeWarning('en', '"file.json": 条目[3]: 缺少坐标字段')
    expect(out).toBe('"file.json": entry[3]: missing coordinate fields')
    expect(/[\u4e00-\u9fff]/.test(out)).toBe(false)
  })

  it('translates the truncation warning (万 → M conversion)', () => {
    const out = localizeWarning('en', '累计 raw points 超过 200 万，已截断')
    expect(out).toBe('Cumulative raw points exceeded 2M, truncated')
  })

  it('passes Chinese through unchanged', () => {
    expect(localizeWarning('zh', '"f": 缺少坐标字段')).toBe('"f": 缺少坐标字段')
  })
})
