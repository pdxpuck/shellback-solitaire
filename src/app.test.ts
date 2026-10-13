import { describe, expect, it } from 'vitest'
import { STANDARD, buildDeck, createRng } from 'deckhand/engine'
// Root-barrel import — regression guard for deckhand v0.3.4: the emitted
// dist/index.d.ts must resolve its re-exports under bundler/nodenext
// resolution (previously `export * from './engine'` resolved to nothing).
import { createRng as rootCreateRng } from 'deckhand'

/**
 * C0 smoke test — proves the deckhand import graph resolves and runs under
 * vitest (engine only; no jsdom needed for pure logic).
 */
describe('deckhand engine consumption', () => {
  it('createRng is deterministic: same seed → same first 3 floats', () => {
    const a = createRng('demo')
    const b = createRng('demo')
    const firstA = [a.next(), a.next(), a.next()]
    const firstB = [b.next(), b.next(), b.next()]
    expect(firstB).toEqual(firstA)
  })

  it('root import (deckhand) exposes a working typed createRng', () => {
    const value = rootCreateRng('t').next()
    expect(value).toBeTypeOf('number')
    expect(value).toBeGreaterThanOrEqual(0)
    expect(value).toBeLessThan(1)
  })

  it('buildDeck(STANDARD) builds 52 cards', () => {
    expect(buildDeck(STANDARD)).toHaveLength(52)
  })
})
