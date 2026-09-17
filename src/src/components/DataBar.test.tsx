// Locks the three DataBar display-label states (T43, A10):
//   sample    → i18n 'data.sample'  ("Sample data")
//   unnamed   → user import without a name → i18n 'data.unnamed' ("Unnamed data")
//   fileName  → user import with a file name → the file name verbatim
// The store hook is mocked because zustand's SSR snapshot always returns the
// initial state, so the real store could never render non-'none' branches
// (same pattern as ImportPanel.test.tsx). DataBar embeds ExportButton, which
// returns null while `data` is null — the mock supplies data: null so the
// label assertions stay focused on DataBar itself.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { I18nProvider } from '../lib/i18n'
import DataBar from './DataBar'

const { mockState } = vi.hoisted(() => ({
  mockState: {
    dataSource: 'none' as string,
    dataLabel: null as string | null,
    data: null as unknown,
    dateRange: { startMs: null, endMs: null },
    clearData: () => undefined,
  },
}))

vi.mock('../store/timelineStore', () => ({
  useTimelineStore: (selector: (state: Record<string, unknown>) => unknown) => selector(mockState),
}))

beforeEach(() => {
  mockState.dataSource = 'none'
  mockState.dataLabel = null
})

function renderDataBar(): string {
  return renderToString(
    <I18nProvider>
      <DataBar />
    </I18nProvider>,
  )
}

describe('DataBar label resolution (three states)', () => {
  it('renders the i18n "Sample data" label for the built-in sample', () => {
    mockState.dataSource = 'sample'
    mockState.dataLabel = null
    const html = renderDataBar()
    expect(html).toContain('Sample data')
    expect(html).not.toContain('Unnamed data')
  })

  it('renders the i18n "Unnamed data" label for a user import without a file name', () => {
    mockState.dataSource = 'user'
    mockState.dataLabel = null
    const html = renderDataBar()
    expect(html).toContain('Unnamed data')
    expect(html).not.toContain('Sample data')
  })

  it('renders the imported file name verbatim as the label', () => {
    mockState.dataSource = 'user'
    mockState.dataLabel = 'Timeline_2024.json'
    const html = renderDataBar()
    expect(html).toContain('Timeline_2024.json')
    expect(html).not.toContain('Unnamed data')
    expect(html).not.toContain('Sample data')
  })
})