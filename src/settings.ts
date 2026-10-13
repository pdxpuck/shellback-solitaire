/**
 * App settings, persisted to localStorage. C1 scope was theme selection;
 * C2 adds autoFly — safe cards fly to the foundations automatically (see
 * GameView / moveGroup). Win/loss stats are deliberately deferred: they
 * imply the persistence decision (D6), which stays open until C2
 * (see SCOPING_NOTES.md).
 */
import { DEFAULT_THEME_ID, getTheme } from 'deckhand/renderer'

export interface AppSettings {
  themeId: string
  /** Safe auto-fly to foundations on (true, default) or manual-only (false). */
  autoFly: boolean
}

export const DEFAULT_SETTINGS: AppSettings = { themeId: DEFAULT_THEME_ID, autoFly: true }

const STORAGE_KEY = 'shellback.settings.v1'

/**
 * Validate parsed-JSON-shaped input into AppSettings. Pure — no storage
 * access — so it is testable without jsdom. Anything that is not an object
 * carrying a known theme id falls back to the defaults; a non-boolean
 * autoFly falls back to the autoFly default while a valid theme id is kept.
 */
export function validateSettings(raw: unknown): AppSettings {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_SETTINGS }
  const { themeId, autoFly } = raw as { themeId?: unknown; autoFly?: unknown }
  if (typeof themeId === 'string') {
    try {
      getTheme(themeId)
      return { themeId, autoFly: typeof autoFly === 'boolean' ? autoFly : DEFAULT_SETTINGS.autoFly }
    } catch {
      // Unknown theme id → default below.
    }
  }
  return { ...DEFAULT_SETTINGS }
}

/** Read settings from localStorage, validating; missing/corrupt → defaults. */
export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return { ...DEFAULT_SETTINGS }
    return validateSettings(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/** Persist settings to localStorage; failures (quota, privacy mode) are ignored. */
export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Storage unavailable — settings stay session-only.
  }
}
