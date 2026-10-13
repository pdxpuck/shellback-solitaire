import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME_ID, THEMES } from 'deckhand/renderer'
import { DEFAULT_SETTINGS, validateSettings } from './settings'

const OTHER_THEME_ID = THEMES.find((t) => t.id !== DEFAULT_THEME_ID)!.id

describe('settings validation (pure — no storage)', () => {
  it('DEFAULT_SETTINGS uses deckhand default theme', () => {
    expect(DEFAULT_SETTINGS).toEqual({ themeId: DEFAULT_THEME_ID })
  })

  it('accepts a payload carrying the default theme id', () => {
    expect(validateSettings({ themeId: DEFAULT_THEME_ID })).toEqual(DEFAULT_SETTINGS)
  })

  it('accepts a payload carrying any known theme id', () => {
    expect(validateSettings({ themeId: OTHER_THEME_ID })).toEqual({ themeId: OTHER_THEME_ID })
  })

  it('falls back to defaults on an unknown themeId', () => {
    expect(validateSettings({ themeId: 'not-a-theme' })).toEqual(DEFAULT_SETTINGS)
  })

  it('falls back to defaults on a missing or non-string themeId', () => {
    expect(validateSettings({})).toEqual(DEFAULT_SETTINGS)
    expect(validateSettings({ themeId: 42 })).toEqual(DEFAULT_SETTINGS)
    expect(validateSettings({ themeId: null })).toEqual(DEFAULT_SETTINGS)
  })

  it('falls back to defaults on malformed JSON shapes', () => {
    for (const raw of [null, undefined, 42, 'byron', true, [], ['byron']]) {
      expect(validateSettings(raw)).toEqual(DEFAULT_SETTINGS)
    }
  })
})
