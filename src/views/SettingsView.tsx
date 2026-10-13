/**
 * SettingsView — card-theme selection (C1) + gameplay settings (C2:
 * auto-fly toggle), persisted via ../settings (loadSettings/saveSettings).
 * Footer shows the app version (injected as __APP_VERSION__ by Vite).
 * Win/loss stats: deliberately absent — no placeholder.
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

      <section aria-label="Gameplay">
        <h2>Gameplay</h2>
        <div className="setting-row">
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.autoFly}
              onChange={(e) => onChange({ ...settings, autoFly: e.target.checked })}
            />
            <span className="switch-slider" />
          </label>
          <div className="setting-text">
            <span className="setting-label">Auto-complete to foundations</span>
            <span className="setting-hint">Safe cards fly to the foundations automatically.</span>
          </div>
        </div>
      </section>

      <footer className="version-footer">
        Shellback Solitaire Collection v{__APP_VERSION__}
      </footer>
    </>
  )
}

export default SettingsView
