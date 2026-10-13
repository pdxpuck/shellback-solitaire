import { describe, expect, it } from 'vitest'
import { FAMILY_LABELS, REGISTRY, WINNABILITY_LABELS, getGame } from './registry'
import type { GameStatus, SolitaireFamily, Winnability } from './registry'

const FAMILIES = Object.keys(FAMILY_LABELS) as SolitaireFamily[]
const BUCKETS = Object.keys(WINNABILITY_LABELS) as Winnability[]
const STATUSES: readonly GameStatus[] = ['available', 'development', 'planned']

describe('game registry', () => {
  it('contains both launch-catalog games: klondike and canfield', () => {
    const ids = REGISTRY.map((g) => g.id)
    expect(ids).toContain('klondike')
    expect(ids).toContain('canfield')
  })

  it('every entry has a valid family, winnability bucket, status, and summary', () => {
    for (const game of REGISTRY) {
      expect(FAMILIES).toContain(game.family)
      expect(BUCKETS).toContain(game.winnability)
      expect(STATUSES).toContain(game.status)
      expect(game.title.length).toBeGreaterThan(0)
      expect(game.summary.length).toBeGreaterThan(0)
    }
  })

  it('getGame returns the matching entry by id', () => {
    expect(getGame('klondike').title).toBe('Klondike')
    expect(getGame('canfield').family).toBe('canfield')
  })

  it('getGame throws on an unknown id', () => {
    expect(() => getGame('golf-super-deluxe')).toThrow(/Unknown game/)
  })
})
