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
import { I18nProvider } from '../lib/i18n'
import MergePage from './MergePage'

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