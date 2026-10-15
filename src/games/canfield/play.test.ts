/**
 * Canfield (Draw-3) session-layer suite. GameState rigs are built on real
 * deals, since every query replays from deal(seed); the one exception is
 * isWonState, whose rigged states are stacked via applyPlayerMove (verbatim
 * append) — replay is structural, so whole-pile foundation counts can be
 * crafted directly. Storage tests stub globalThis.localStorage with an
 * in-memory map (no jsdom in this suite).
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Action } from 'deckhand/engine'
import { topCard } from 'deckhand/engine'
import { canfield as game } from './definition'
import {
  applyPlayerMove,
  clearGame,
  DEAL_MAX,
  DEAL_MIN,
  initialState,
  isWonState,
  loadGame,
  moveGroup,
  parseDealNumber,
  randomDealNumber,
  safeFlights,
  saveGame,
  worldFor,
  type GameState,
} from './play'

// The opening click on any fresh deal: the stock always holds 34, so the
// draw is exactly count 3.
const DRAW: readonly Action[] = [{ type: 'move', from: 'stock', to: 'waste', count: 3, faceUp: true }]

// --- initialState / worldFor -------------------------------------------------

describe('initialState / worldFor', () => {
  it('same seed → identical states and identical worlds, matching the deal', () => {
    const a = initialState('determinism')
    const b = initialState('determinism')
    expect(a).toEqual(b)
    expect(JSON.stringify(worldFor(a))).toBe(JSON.stringify(worldFor(b)))
    expect(JSON.stringify(worldFor(a))).toBe(JSON.stringify(game.deal('determinism')))
  })
})

// --- deal numbers --------------------------------------------------------------

describe('randomDealNumber', () => {
  it('500 draws: all integers within [DEAL_MIN, DEAL_MAX]', () => {
    for (let i = 0; i < 500; i++) {
      const n = randomDealNumber()
      expect(Number.isInteger(n)).toBe(true)
      expect(n).toBeGreaterThanOrEqual(DEAL_MIN)
      expect(n).toBeLessThanOrEqual(DEAL_MAX)
    }
  })
})

describe('parseDealNumber', () => {
  it('accepts trimmed integers within range', () => {
    expect(parseDealNumber('1')).toBe(DEAL_MIN)
    expect(parseDealNumber(' 42 ')).toBe(42)
    expect(parseDealNumber('1000000')).toBe(DEAL_MAX)
  })

  it('rejects empty, non-numeric, fractional, and out-of-range input with null', () => {
    expect(parseDealNumber('')).toBeNull()
    expect(parseDealNumber('abc')).toBeNull()
    expect(parseDealNumber('1.5')).toBeNull()
    expect(parseDealNumber('0')).toBeNull()
    expect(parseDealNumber('1000001')).toBeNull()
  })
})

// --- safeFlights -------------------------------------------------------------

describe('safeFlights', () => {
  it('always [] — Canfield has no auto-fly (DC5); the fixpoint settles on the first pass', () => {
    expect(safeFlights(game.deal(3))).toEqual([])
    const played = moveGroup(initialState('22'), DRAW)
    expect(safeFlights(worldFor(played))).toEqual([])
  })
})

// --- moveGroup ---------------------------------------------------------------

describe('moveGroup', () => {
  it('the draw lands as ONE group — rule actions only (no flights exist to compose)', () => {
    const state = moveGroup(initialState('22'), DRAW)
    expect(state.moves).toHaveLength(1)
    expect(state.moves[0]).toEqual([...DRAW])
    const world = worldFor(state)
    expect(world.piles.waste.cards).toHaveLength(3)
    expect(topCard(world, 'waste')?.faceUp).toBe(true)
    expect(world.piles.stock.cards).toHaveLength(31)
    // The next click is again exactly one more group.
    expect(moveGroup(state, DRAW).moves).toHaveLength(2)
  })

  it('autoFly: false behaves identically (there is no auto-fly to suppress)', () => {
    const state = moveGroup(initialState('22'), DRAW, { autoFly: false })
    expect(state.moves).toHaveLength(1)
    expect(state.moves[0]).toEqual([...DRAW])
  })

  it('applyPlayerMove appends verbatim — no flights composed', () => {
    const state = applyPlayerMove(initialState('22'), DRAW)
    expect(state.moves).toHaveLength(1)
    expect(state.moves[0]).toEqual([...DRAW])
    expect(worldFor(state).piles.waste.cards).toHaveLength(3)
  })
})

// --- undo by slice -------------------------------------------------------------

describe('undo by slice', () => {
  it('dropping later groups replays to exactly the earlier world', () => {
    let state = initialState('22')
    state = moveGroup(state, DRAW)
    const afterOne = worldFor(state)
    state = moveGroup(state, DRAW)
    state = moveGroup(state, DRAW)
    expect(state.moves).toHaveLength(3)
    const undone: GameState = { ...state, moves: state.moves.slice(0, 1) }
    expect(JSON.stringify(worldFor(undone))).toBe(JSON.stringify(afterOne))
  })
})

// --- save / load / clear ------------------------------------------------------

describe('save / load / clear', () => {
  const SAVE_KEY = 'shellback.canfield.save.v1'

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubStorage(): Map<string, string> {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    })
    return store
  }

  /** A played state: seed 22, one click (the draw-3). */
  const playedState = (): GameState => moveGroup(initialState('22'), DRAW)

  it('round-trip: loadGame(saveGame(state)) deep-equals the state', () => {
    stubStorage()
    const state = playedState()
    saveGame(state)
    expect(loadGame()).toEqual(state)
  })

  it('missing save → null; clearGame empties the slot', () => {
    stubStorage()
    expect(loadGame()).toBeNull()
    saveGame(playedState())
    expect(loadGame()).not.toBeNull()
    clearGame()
    expect(loadGame()).toBeNull()
  })

  it('corrupt JSON → null', () => {
    const store = stubStorage()
    store.set(SAVE_KEY, '{not json')
    expect(loadGame()).toBeNull()
  })

  it('wrong shapes → null', () => {
    const store = stubStorage()
    const bad = [
      '[]',
      '{"seed":"22"}',
      '{"seed":22,"moves":[]}',
      '{"seed":"22","moves":["nope"]}',
      '{"seed":"22","moves":[[1,2]]}',
      '{"seed":"22","moves":[[{"type":5}]]}',
    ]
    for (const raw of bad) {
      store.set(SAVE_KEY, raw)
      expect(loadGame()).toBeNull()
    }
  })

  it('structurally valid but rule-breaking log → null', () => {
    const store = stubStorage()
    const state = playedState()
    // t0 holds a single card; pulling 99 raises EngineError in replay.
    const moves = [...state.moves, [{ type: 'move', from: 't0', to: 'found-0', count: 99 }]]
    store.set(SAVE_KEY, JSON.stringify({ seed: state.seed, moves }))
    expect(loadGame()).toBeNull()
  })
})

// --- isWonState ----------------------------------------------------------------

describe('isWonState', () => {
  /**
   * Stack whole piles into the four foundations, 13 apiece (structural
   * replay on the 'craft' deal: stock 34, reserve 13, found-0 1, t0..t3 1).
   */
  const FOUNDATION_STACKS: readonly (readonly Action[])[] = [
    [{ type: 'move', from: 't0', to: 'found-0', count: 1 }], // found-0 = 2
    [{ type: 'move', from: 't1', to: 'found-0', count: 1 }], // found-0 = 3
    [{ type: 'move', from: 't2', to: 'found-0', count: 1 }], // found-0 = 4
    [{ type: 'move', from: 't3', to: 'found-0', count: 1 }], // found-0 = 5
    [{ type: 'move', from: 'reserve', to: 'found-1', count: 13 }], // found-1 = 13
    [{ type: 'move', from: 'stock', to: 'found-0', count: 8 }], // found-0 = 13, stock = 26
    [{ type: 'move', from: 'stock', to: 'found-2', count: 13 }], // found-2 = 13, stock = 13
    [{ type: 'move', from: 'stock', to: 'found-3', count: 13 }], // found-3 = 13, stock = 0
  ]

  const stacked = (groups: readonly (readonly Action[])[]): GameState =>
    groups.reduce((state, group) => applyPlayerMove(state, group), initialState('craft'))

  it('all four foundations at 13 → true', () => {
    expect(isWonState(stacked(FOUNDATION_STACKS))).toBe(true)
  })

  it('one foundation a card short → false; a fresh deal → false', () => {
    const short = [...FOUNDATION_STACKS.slice(0, -1)]
    short.push([{ type: 'move', from: 'stock', to: 'found-3', count: 12 }])
    expect(isWonState(stacked(short))).toBe(false)
    expect(isWonState(initialState('craft'))).toBe(false)
  })
})
