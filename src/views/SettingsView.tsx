/**
 * SettingsView — C1 scope: card-theme selection only, persisted via
 * ../settings (loadSettings/saveSettings). Win/loss stats: deliberately
 * absent — no placeholder.
 */
import { THEMES } from 'deckhand/renderer'
import type { AppSettings } from '../settings'

interface SettingsViewProps {
  settings: AppSettings
  onChange: (next: AppSettings) => void
  onBack: () => void
}

function SettingsView({ settings, onChange, onBack }: SettingsViewProps) {
  return (
    <>
      <header className="home-header">
        <button type="button" className="secondary-btn" onClick={onBack}>
          Back
        </button>
        <h1>Settings</h1>
      </header>

      <section aria-label="Card theme">
        <h2>Card theme</h2>
        <div className="theme-list">
          {THEMES.map((theme) => (
            <label
              key={theme.id}
              className={`theme-option${settings.themeId === theme.id ? ' selected' : ''}`}
            >
              <input
                type="radio"
                name="theme"
                value={theme.id}
                checked={settings.themeId === theme.id}
                onChange={() => onChange({ ...settings, themeId: theme.id })}
              />
              <span className="theme-label">{theme.label}</span>
              <span className="theme-details">
                {theme.id} · {theme.license}
              </span>
            </label>
          ))}
        </div>
        <p className="settings-note">More settings arrive with the games.</p>
      </section>
    </>
  )
}

export default SettingsView
