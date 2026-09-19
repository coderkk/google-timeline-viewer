// Renders the app shell to static markup (node env, react-dom/server, same
// technique as MergePage.test / ImportPanel.test) and asserts the
// full-viewport-vs-standard-column split fixed in T44:
//   - /app (Trips) and /app/places (Places) are the ONLY full-viewport map
//     pages: <main class="app-main app-main--app"> and no footer,
//   - every other route (/app/merge included) keeps the centered .app-main
//     column and renders the footer,
//   - the header highlight stays exact-match (NavLink `end`): /app/merge must
//     not steal the active state from /app, and vice versa.
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '../lib/i18n'
import Layout from './Layout'

function renderLayout(initialPath: string): string {
  return renderToString(
    <MemoryRouter initialEntries={[initialPath]}>
      <I18nProvider>
        <Layout />
      </I18nProvider>
    </MemoryRouter>,
  )
}

/** href → class of every <a> in the shell (nav links only, no <main>/<footer>). */
function linkStates(html: string): Record<string, string> {
  const states: Record<string, string> = {}
  for (const m of html.matchAll(/<a([^>]*)>/g)) {
    const attrs = m[1]
    const href = attrs.match(/href="([^"]*)"/)?.[1]
    const cls = attrs.match(/class="([^"]*)"/)?.[1]
    if (href) states[href] = cls ?? ''
  }
  return states
}

describe('Layout full-viewport vs standard column (T44)', () => {
  it.each(['/app', '/app/places'])(
    'treats %s as a full-viewport map page without footer',
    (path) => {
      const html = renderLayout(path)
      expect(html).toContain('<main class="app-main app-main--app">')
      expect(html).not.toContain('<footer')
    },
  )

  it.each(['/', '/app/merge', '/help', '/settings'])(
    'keeps %s in the centered column with the footer',
    (path) => {
      const html = renderLayout(path)
      expect(html).toContain('<main class="app-main">')
      expect(html).not.toContain('app-main--app')
      expect(html).toContain('<footer class="site-footer">')
    },
  )

  it('highlights only "merge" on /app/merge (no /app prefix bleed)', () => {
    const states = linkStates(renderLayout('/app/merge'))
    expect(states['/app/merge']).toBe('site-nav-link active')
    expect(states['/app']).toBe('site-nav-link')
    expect(states['/app/places']).toBe('site-nav-link')
  })

  it('highlights only Trips on /app', () => {
    const states = linkStates(renderLayout('/app'))
    expect(states['/app']).toBe('site-nav-link active')
    expect(states['/app/places']).toBe('site-nav-link')
    expect(states['/app/merge']).toBe('site-nav-link')
  })
})