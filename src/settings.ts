/**
 * App settings — C1 scope is theme selection only, persisted to localStorage.
 * Win/loss stats are deliberately deferred: they imply the persistence
 * decision (D6), which stays open until C2 (see SCOPING_NOTES.md).
 */
import { DEFAULT_THEME_ID, getTheme } from 'deckhand/renderer'

export interface AppSettings {
  themeId: string
}

export const DEFAULT_SETTINGS: AppSettings = { themeId: DEFAULT_THEME_ID }

const STORAGE_KEY = 'shellback.settings.v1'

/**
 * Validate parsed-JSON-shaped input into AppSettings. Pure — no storage
 * access — so it is testable without jsdom. Anything that is not an object
 * carrying a known theme id falls back to the defaults.
 */
export function validateSettings(raw: unknown): AppSettings {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_SETTINGS }
  const themeId = (raw as { themeId?: unknown }).themeId
  if (typeof themeId === 'string') {
    try {
      getTheme(themeId)
      return { themeId }
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
