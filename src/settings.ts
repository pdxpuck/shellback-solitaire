/**
 * App settings, persisted to localStorage. C1 scope was theme selection;
 * C2 adds autoFly — safe cards fly to the foundations automatically (see
 * GameView / moveGroup); C3 adds flightSpeed — the card-flight pace (see
 * GameView / FLIGHT_TIMING). Win/loss stats are deliberately deferred:
 * they imply the persistence decision (D6), which stays open until C2
 * (see SCOPING_NOTES.md).
 */
import { DEFAULT_THEME_ID, getTheme } from 'deckhand/renderer'

/** Card-flight animation pace: slow / medium ('med', the default) / fast. */
export type FlightSpeed = 'slow' | 'med' | 'fast'

const isFlightSpeed = (value: unknown): value is FlightSpeed =>
  value === 'slow' || value === 'med' || value === 'fast'

export interface AppSettings {
  themeId: string
  /** Safe auto-fly to foundations on (true, default) or manual-only (false). */
  autoFly: boolean
  /** Card-flight pace (GameView FLIGHT_TIMING); 'med' is the default. */
  flightSpeed: FlightSpeed
}

export const DEFAULT_SETTINGS: AppSettings = {
  themeId: DEFAULT_THEME_ID,
  autoFly: true,
  flightSpeed: 'med',
}

const STORAGE_KEY = 'shellback.settings.v1'

/**
 * Validate parsed-JSON-shaped input into AppSettings. Pure — no storage
 * access — so it is testable without jsdom. Fields validate INDEPENDENTLY:
 * each falls back to its own default when invalid while valid siblings are
 * kept (an unknown themeId no longer discards a valid autoFly). Anything
 * that is not an object falls back to the whole default set.
 */
export function validateSettings(raw: unknown): AppSettings {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_SETTINGS }
  const { themeId, autoFly, flightSpeed } = raw as {
    themeId?: unknown
    autoFly?: unknown
    flightSpeed?: unknown
  }
  let validThemeId = DEFAULT_SETTINGS.themeId
  if (typeof themeId === 'string') {
    try {
      getTheme(themeId)
      validThemeId = themeId
    } catch {
      // Unknown theme id → keep the theme default.
    }
  }
  return {
    themeId: validThemeId,
    autoFly: typeof autoFly === 'boolean' ? autoFly : DEFAULT_SETTINGS.autoFly,
    flightSpeed: isFlightSpeed(flightSpeed) ? flightSpeed : DEFAULT_SETTINGS.flightSpeed,
  }
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
