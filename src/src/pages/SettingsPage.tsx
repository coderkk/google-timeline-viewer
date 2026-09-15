// Settings panel: choose a map tile source (default OpenStreetMap), switch
// theme (light/dark/system), and read the privacy statement. Everything here is
// in-memory only — the tile selection and any imported data vanish on refresh,
// matching the product's no-persistence guarantee.
import { useState } from 'react'
import { CUSTOM_TILE_NANE, OSM_TILE_URL, tileUrlError, tileUrlNotes } from '../lib/tiles'
import { type ThemeMode, useTimelineStore } from '../store/timelineStore'

const TILE_PLACEHOLDER = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

export default function SettingsPage() {
  const tileSource = useTimelineStore((state) => state.tileSource)
  const setTileSource = useTimelineStore((state) => state.setTileSource)
  const resetTileSource = useTimelineStore((state) => state.resetTileSource)
  const themeMode = useTimelineStore((state) => state.themeMode)
  const setThemeMode = useTimelineStore((state) => state.setThemeMode)

  // Local draft so the store only changes on an explicit apply; typing stays
  // cheap and invalid text never enters the store.
  const [draft, setDraft] = useState(tileSource.url)

  const error = tileUrlError(draft)
  const notes = tileUrlNotes(draft)
  const isDefault = tileSource.url === OSM_TILE_URL
  const isCustom = tileSource.name === CUSTOM_TILE_NANE

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
    { value: 'system', label: '跟随系统' },
    { value: 'light', label: '浅色' },
    { value: 'dark', label: '深色' },
  ]

  return (
    <section className="page settings-page">
      <h1>设置</h1>
      <p className="settings-lead">
        地图瓦片源选择、主题切换与隐私说明。所有设置仅保存在当前页面的内存里，刷新页面即恢复默认。
      </p>

      <section className="settings-section">
        <h2>主题</h2>
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
        <h2>地图瓦片源</h2>
        <p className="settings-hint">
          当前来源：
          <strong>{tileSource.name}</strong>
          {isCustom && <span className="settings-custom-badge">自定义</span>}
          {isDefault && <span className="settings-default-badge">默认 OpenStreetMap</span>}
        </p>
        <div className="tile-form">
          <label className="tile-field">
            <span>瓦片 URL（需包含 <code>{'{z}/{x}/{y}'}</code> 占位符）</span>
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
              应用
            </button>
            <button type="button" className="btn btn-secondary" onClick={reset}>
              恢复默认
            </button>
          </div>
        </div>
        {error !== null && <p className="tile-error">{error}</p>}
        {draft.trim() !== '' && error === null && (
          <p className="tile-ok">URL 格式正确，点击「应用」后生效。</p>
        )}
        {notes.map((note) => (
          <p key={note.kind} className={error === null ? 'tile-note tile-note-warn' : 'tile-error'}>
            {note.text}
          </p>
        ))}
        <p className="tile-note">
          自定义瓦片源 = 自担风险：瓦片请求会把你的 IP 与当前地图视野的坐标范围发送给瓦片服务器。默认使用
          OpenStreetMap 公共服务器；如需彻底本地，可配置自托管/内网瓦片服务器。
          若 URL 含 <code>{'{s}'}</code> 占位符，瓦片将向 a/b/c 等多个主机发起请求；OSM 公共服务器不支持，应省略。
        </p>
      </section>

      <section className="settings-section">
        <h2>数据生命周期</h2>
        <div className="privacy-card">
          <ul>
            <li>导入的位置数据只在你浏览器的内存中处理，不会写入本地磁盘。</li>
            <li>不写入 localStorage / IndexedDB——刷新或关闭页面后数据即被丢弃，这是预期行为。</li>
            <li>不上传任何服务器；没有登录、没有账号，也没有分析 / 遥测 / 错误上报 SDK。</li>
            <li>唯一的对外请求是地图瓦片，默认发往 OpenStreetMap 公共服务器。</li>
            <li>
              外部链接例外：点选地点时默认「复制坐标」——纯本机操作，不联网；若你主动点「在 Google
              Maps 開啟」，该坐标与你的 IP 会发送给 Google。
            </li>
          </ul>
        </div>
      </section>
    </section>
  )
}