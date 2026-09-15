// Settings panel: choose a map tile source (default OpenStreetMap), switch
// theme (light/dark/system), switch language, and read the privacy statement.
// Everything here is in-memory only — tile selection, language and any imported
// data vanish on refresh, matching the product's no-persistence guarantee.
import { useState } from 'react'
import { OSM_TILE_SOURCE, OSM_TILE_URL, tileUrlError, tileUrlNotes } from '../lib/tiles'
import { useI18n, type Lang } from '../lib/i18n'
import { type ThemeMode, useTimelineStore } from '../store/timelineStore'

const TILE_PLACEHOLDER = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

export default function SettingsPage() {
  const tileSource = useTimelineStore((state) => state.tileSource)
  const setTileSource = useTimelineStore((state) => state.setTileSource)
  const resetTileSource = useTimelineStore((state) => state.resetTileSource)
  const themeMode = useTimelineStore((state) => state.themeMode)
  const setThemeMode = useTimelineStore((state) => state.setThemeMode)
  const { t, lang, setLang } = useI18n()

  // Local draft so the store only changes on an explicit apply; typing stays
  // cheap and invalid text never enters the store.
  const [draft, setDraft] = useState(tileSource.url)

  const error = tileUrlError(draft)
  const notes = tileUrlNotes(draft)
  const isDefault = tileSource.url === OSM_TILE_URL
  const isCustom = !isDefault
  // Language-neutral store value → display label resolved here.
  const sourceName = isDefault ? OSM_TILE_SOURCE.name : t('settings.customTileName')

  const apply = () => {
    const url = draft.trim()
    if (url === '') {
      // An empty URL means "keep the default": reset in-place, no error.
      resetTileSource()
      setDraft(OSM_TILE_URL)
      return
    }
    if (tileUrlError(url) !== null) return
    setTileSource(url)
  }

  const reset = () => {
    resetTileSource()
    setDraft(OSM_TILE_URL)
  }

  const themeOptions: { value: ThemeMode; label: string }[] = [
    { value: 'system', label: t('settings.theme.system') },
    { value: 'light', label: t('settings.theme.light') },
    { value: 'dark', label: t('settings.theme.dark') },
  ]

  const langOptions: { value: Lang; label: string }[] = [
    { value: 'en', label: t('lang.english') },
    { value: 'zh', label: t('lang.chinese') },
  ]

  return (
    <section className="page settings-page">
      <h1>{t('settings.title')}</h1>
      <p className="settings-lead">{t('settings.lead')}</p>

      <section className="settings-section">
        <h2>{t('settings.language')}</h2>
        <div className="theme-selector">
          {langOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`theme-btn ${lang === option.value ? 'theme-btn-active' : ''}`}
              onClick={() => setLang(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h2>{t('settings.theme')}</h2>
        <div className="theme-selector">
          {themeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`theme-btn ${themeMode === option.value ? 'theme-btn-active' : ''}`}
              onClick={() => setThemeMode(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h2>{t('settings.tiles')}</h2>
        <p className="settings-hint">
          {t('settings.currentSource')}
          <strong>{sourceName}</strong>
          {isCustom && <span className="settings-custom-badge">{t('settings.customBadge')}</span>}
          {isDefault && <span className="settings-default-badge">{t('settings.defaultBadge')}</span>}
        </p>
        <div className="tile-form">
          <label className="tile-field">
            <span>{t('settings.tileUrlLabel', { placeholder: '{z}/{x}/{y}' })}</span>
            <input
              type="url"
              spellCheck={false}
              placeholder={TILE_PLACEHOLDER}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') apply()
              }}
            />
          </label>
          <div className="tile-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={apply}
              disabled={error !== null}
            >
              {t('settings.apply')}
            </button>
            <button type="button" className="btn btn-secondary" onClick={reset}>
              {t('settings.reset')}
            </button>
          </div>
        </div>
        {error !== null && <p className="tile-error">{t(error.key, error.params)}</p>}
        {draft.trim() !== '' && error === null && (
          <p className="tile-ok">{t('settings.tileOk')}</p>
        )}
        {notes.map((note) => (
          <p key={note.kind} className={error === null ? 'tile-note tile-note-warn' : 'tile-error'}>
            {t(note.key, note.params)}
          </p>
        ))}
        <p className="tile-note">{t('settings.tileWarn', { s: '{s}' })}</p>
      </section>

      <section className="settings-section">
        <h2>{t('settings.lifecycle')}</h2>
        <div className="privacy-card">
          <ul>
            <li>{t('settings.life1')}</li>
            <li>{t('settings.life2')}</li>
            <li>{t('settings.life3')}</li>
            <li>{t('settings.life4')}</li>
            <li>{t('settings.life5')}</li>
          </ul>
        </div>
      </section>
    </section>
  )
}
