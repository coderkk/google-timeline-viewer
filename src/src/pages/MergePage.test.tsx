// Renders MergePage to static markup (node env, react-dom/server) and asserts
// the T36 contract without touching the DOM or the worker machinery:
//   - the page describes both archive slots (main optional, new required),
//   - the merge button starts disabled until a new export is picked,
//   - the privacy note promises zero uploads / zero network,
//   - no progress bar until merging starts (worker facade is mocked, and the
//     page's busy state only flips after a click).
// Like ImportPanel.test, the i18n provider renders the en catalog (node env),
// so assertions use the English copy.
import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { I18nProvider, translate } from '../lib/i18n'
import { isLargeMerge, mergeInputBytes } from '../lib/merge/largeFile'
import MergePage, { formatBytes } from './MergePage'

// The real facade statically imports './merge.worker?worker'; mocking the
// facade keeps vitest's node env away from the Vite ?worker transform.
vi.mock('../lib/merge/worker', () => ({
  mergeInWorker: () =>
    Promise.resolve({
      json: '{"semanticSegments":[],"rawSignals":[]}',
      stats: { semanticSegments: 0, rawSignals: 0, points: 0, windowEndMs: 0 },
    }),
}))

function renderMergePage(): string {
  return renderToString(
    <I18nProvider>
      <MergePage />
    </I18nProvider>,
  )
}

describe('MergePage', () => {
  it('renders the page title, both archive slots, and the privacy note', () => {
    const html = renderMergePage()
    expect(html).toContain('Merge timeline archives')
    expect(html).toContain('Main archive (optional)')
    expect(html).toContain('New export')
    expect(html).toContain('nothing is uploaded and no network request is made')
  })

  it('starts with a disabled merge button and no progress bar', () => {
    const html = renderMergePage()
    expect(html).toContain('Merge &amp; download')
    // Button disabled attribute rendered by react-dom/server.
    expect(html).toContain('disabled=""')
    // No indeterminate progress animation outside the busy state.
    expect(html).not.toContain('progress-fill--indeterminate')
    // Hint tells the user to pick the new export first.
    expect(html).toContain('Pick the new export file to enable merging.')
  })

  it('renders both file inputs with the JSON accept filter', () => {
    const html = renderMergePage()
    const inputs = html.match(/type="file"/g)
    expect(inputs).toHaveLength(2)
    expect(html).toContain('accept=".json,application/json,application/octet-stream"')
  })
})

// -- large-file guard (T36 fix #3) ------------------------------------------

describe('MergePage large-file guard', () => {
  it('flags combined inputs over 200MB (either side or the sum)', () => {
    // 2025 livedata 108MB + 2026 livedata 123MB = 231MB → triggers.
    const main108 = { size: 113_456_038 }
    const fresh123 = { size: 129_395_377 }
    expect(mergeInputBytes(main108, fresh123)).toBeGreaterThan(200 * 1024 * 1024)
    expect(isLargeMerge(main108, fresh123)).toBe(true)
    // A single over-200MB export (no main archive) also triggers.
    expect(isLargeMerge(null, { size: 250 * 1024 * 1024 })).toBe(true)
    // Small inputs never trigger.
    expect(isLargeMerge(null, { size: 1024 })).toBe(false)
    expect(isLargeMerge(null, null)).toBe(false)
  })

  it('localizes the confirm copy with the combined MB (en + zh)', () => {
    const enMsg = translate('en', 'merge.largeConfirm', { size: '231.6' })
    const zhMsg = translate('zh', 'merge.largeConfirm', { size: '231.6' })
    expect(enMsg).toContain('231.6')
    expect(enMsg).toMatch(/200MB/)
    expect(enMsg).toMatch(/300MB/)
    expect(zhMsg).toContain('231.6')
    expect(zhMsg).toMatch(/200MB/)
    expect(zhMsg).toMatch(/300MB/)
  })
})

// -- formatBytes (T48) -------------------------------------------------------

describe('formatBytes', () => {
  it('formats 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
  })

  it('formats bytes under 1 KB', () => {
    expect(formatBytes(512)).toBe('512 B')
  })

  it('formats KB with 1 decimal', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
  })

  it('formats MB with 1 decimal', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
    expect(formatBytes(101_500_000)).toBe('96.8 MB')
  })

  it('formats GB with 1 decimal', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB')
  })
})
