// Renders ImportPanel to static markup (node env, no DOM testing library
// needed) and asserts the parsing-state contract fixed in T35:
//   - the progress bar uses the indeterminate animated class (no width %),
//   - the copy carries no percentage / placeholder,
//   - the file input no longer allows multiple selection (single-file import).
// The store hook is mocked because zustand's SSR snapshot always returns the
// initial state, so the real store could never render the 'parsing' branch.
import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { I18nProvider } from '../lib/i18n'
import ImportPanel from './ImportPanel'

vi.mock('../store/timelineStore', () => ({
  useTimelineStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      status: 'parsing',
      dataSource: 'user',
      dataLabel: 'Timeline.json',
      dataFileCount: 1,
      errorMsg: null,
      errorWarning: null,
      importFiles: () => undefined,
    }),
}))

function renderImportPanel(): string {
  return renderToString(
    <I18nProvider>
      <ImportPanel />
    </I18nProvider>,
  )
}

describe('ImportPanel parsing state', () => {
  it('renders the indeterminate animated progress bar (no static width block)', () => {
    const html = renderImportPanel()
    expect(html).toContain('progress-fill progress-fill--indeterminate')
    // No inline width is set (the determinate bar used style={{width: "N%"}}).
    expect(html).not.toContain('width:')
  })

  it('shows "Parsing…" without any percentage in the label', () => {
    const html = renderImportPanel()
    expect(html).toContain('Parsing… large files may take a moment')
    expect(html).not.toMatch(/%|\(0%\)/)
  })

  it('renders the file input without the multiple attribute (single-file import)', () => {
    const html = renderImportPanel()
    expect(html).toContain('type="file"')
    expect(html).not.toMatch(/multiple/)
  })
})
