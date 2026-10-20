import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME_ID, THEMES } from 'deckhand/renderer'
import { DEFAULT_SETTINGS, validateSettings } from './settings'

const OTHER_THEME_ID = THEMES.find((t) => t.id !== DEFAULT_THEME_ID)!.id

describe('settings validation (pure — no storage)', () => {
  it('DEFAULT_SETTINGS uses deckhand default theme + auto-fly on + medium flight speed + single-tap move on', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      themeId: DEFAULT_THEME_ID,
      autoFly: true,
      flightSpeed: 'med',
      singleTapMove: true,
    })
  })

  it('accepts a payload carrying the default theme id', () => {
    expect(validateSettings({ themeId: DEFAULT_THEME_ID })).toEqual(DEFAULT_SETTINGS)
  })

  it('accepts a payload carrying any known theme id', () => {
    expect(validateSettings({ themeId: OTHER_THEME_ID })).toEqual({
      themeId: OTHER_THEME_ID,
      autoFly: true,
      flightSpeed: 'med',
      singleTapMove: true,
    })
  })

  it('keeps an explicit autoFly: true when the theme id is valid', () => {
    expect(validateSettings({ themeId: OTHER_THEME_ID, autoFly: true })).toEqual({
      themeId: OTHER_THEME_ID,
      autoFly: true,
      flightSpeed: 'med',
      singleTapMove: true,
    })
  })

  it('keeps an explicit autoFly: false when the theme id is valid', () => {
    expect(validateSettings({ themeId: OTHER_THEME_ID, autoFly: false })).toEqual({
      themeId: OTHER_THEME_ID,
      autoFly: false,
      flightSpeed: 'med',
      singleTapMove: true,
    })
  })

  it('falls back to the autoFly default (true) on a non-boolean autoFly', () => {
    expect(validateSettings({ themeId: DEFAULT_THEME_ID, autoFly: 'yes' })).toEqual({
      themeId: DEFAULT_THEME_ID,
      autoFly: true,
      flightSpeed: 'med',
      singleTapMove: true,
    })
    expect(validateSettings({ themeId: DEFAULT_THEME_ID, autoFly: 7 })).toEqual({
      themeId: DEFAULT_THEME_ID,
      autoFly: true,
      flightSpeed: 'med',
      singleTapMove: true,
    })
    expect(validateSettings({ themeId: DEFAULT_THEME_ID, autoFly: null })).toEqual({
      themeId: DEFAULT_THEME_ID,
      autoFly: true,
      flightSpeed: 'med',
      singleTapMove: true,
    })
  })

  it('falls back to the flightSpeed default (med) on a missing or invalid flightSpeed', () => {
    for (const flightSpeed of [undefined, 'instant', 42, null]) {
      expect(validateSettings({ themeId: OTHER_THEME_ID, autoFly: false, flightSpeed })).toEqual({
        themeId: OTHER_THEME_ID,
        autoFly: false,
        flightSpeed: 'med',
        singleTapMove: true,
      })
    }
  })

  it('round-trips each flight speed (slow/med/fast)', () => {
    for (const flightSpeed of ['slow', 'med', 'fast'] as const) {
      expect(validateSettings({ themeId: OTHER_THEME_ID, autoFly: true, flightSpeed })).toEqual({
        themeId: OTHER_THEME_ID,
        autoFly: true,
        flightSpeed,
        singleTapMove: true,
      })
    }
  })

  it('singleTapMove defaults to true when missing (old saves predate the field)', () => {
    expect(validateSettings({ themeId: OTHER_THEME_ID, autoFly: false, flightSpeed: 'fast' })).toEqual(
      {
        themeId: OTHER_THEME_ID,
        autoFly: false,
        flightSpeed: 'fast',
        singleTapMove: true,
      },
    )
  })

  it('keeps an explicit singleTapMove: false', () => {
    expect(
      validateSettings({ themeId: OTHER_THEME_ID, autoFly: false, singleTapMove: false }),
    ).toEqual({
      themeId: OTHER_THEME_ID,
      autoFly: false,
      flightSpeed: 'med',
      singleTapMove: false,
    })
    expect(
      validateSettings({ themeId: OTHER_THEME_ID, autoFly: false, singleTapMove: true }),
    ).toEqual({
      themeId: OTHER_THEME_ID,
      autoFly: false,
      flightSpeed: 'med',
      singleTapMove: true,
    })
  })

  it('falls back to the singleTapMove default (true) on garbage — valid siblings are KEPT', () => {
    for (const singleTapMove of ['yes', 7, null, undefined]) {
      expect(validateSettings({ themeId: OTHER_THEME_ID, autoFly: false, singleTapMove })).toEqual({
        themeId: OTHER_THEME_ID,
        autoFly: false,
        flightSpeed: 'med',
        singleTapMove: true,
      })
    }
  })

  it('falls back to the theme default on an unknown themeId — per-field, valid siblings are KEPT', () => {
    // Per-field validation (v0.3.6): an unknown themeId no longer discards a
    // valid autoFly/flightSpeed — each field falls back independently.
    expect(validateSettings({ themeId: 'not-a-theme' })).toEqual(DEFAULT_SETTINGS)
    expect(validateSettings({ themeId: 'not-a-theme', autoFly: false, flightSpeed: 'fast' })).toEqual(
      {
        themeId: DEFAULT_THEME_ID,
        autoFly: false,
        flightSpeed: 'fast',
        singleTapMove: true,
      },
    )
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
