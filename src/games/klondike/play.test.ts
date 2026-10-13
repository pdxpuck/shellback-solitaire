/**
 * Klondike (Draw-1) session-layer suite. Worlds handed to safeFlights are
 * crafted with engine primitives (as in definition.test.ts); GameState rigs
 * are built on real deals, since every query replays from deal(seed). The
 * one exception is isWonState, whose rigged states are stacked via
 * applyPlayerMove (verbatim append) — replay is structural, so whole-pile
 * foundation counts can be crafted directly. Storage tests stub
 * globalThis.localStorage with an in-memory map (no jsdom in this suite).
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Action, Card, Suit, World } from 'deckhand/engine'
import { cardId, createWorld, dealCards, replay, topCard } from 'deckhand/engine'
import { klondikeDraw1 as game } from './definition'
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

// --- rig helpers (mirrors definition.test.ts) -------------------------------

const PILE_IDS = [
  'stock',
  'waste',
  'found-S',
  'found-H',
  'found-D',
  'found-C',
  't0',
  't1',
  't2',
  't3',
  't4',
  't5',
  't6',
]

const card = (suit: Suit, rank: number): Card => ({ id: cardId(suit, rank), suit, rank, copy: 1 })

type Spot = readonly [Suit, number]

interface RigEntry {
  readonly pile: string
  readonly cards: readonly Spot[]
  readonly faceUp: boolean
}

const up = (pile: string, cards: readonly Spot[]): RigEntry => ({ pile, cards, faceUp: true })

/** Build a world by appending face-state groups to piles, in order. */
function rig(...entries: readonly RigEntry[]): World {
  let world = createWorld(PILE_IDS)
  for (const entry of entries) {
    world = dealCards(
      world,
      entry.pile,
      entry.cards.map(([suit, rank]) => card(suit, rank)),
      entry.faceUp,
    )
  }
  return world
}

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
  it('a 2♠ exposed with its ace already flown flies exactly once', () => {
    const world = rig(up('found-S', [['S', 1]]), up('t0', [['S', 2]]))
    expect(safeFlights(world)).toEqual([
      { type: 'move', from: 't0', to: 'found-S', count: 1 },
    ])
  })

  it('fixpoint: flying an exposed ace exposes the 2 beneath, which flies next — then it settles', () => {
    // found-D holds D1; t0 = [D2, H1] both face-up. Only the TOP (H1) is a
    // candidate on pass one; D2 only becomes one once H1 has flown off.
    const world = rig(up('found-D', [['D', 1]]), up('t0', [['D', 2], ['H', 1]]))
    const flights = safeFlights(world)
    expect(flights).toEqual([
      { type: 'move', from: 't0', to: 'found-H', count: 1 },
      { type: 'move', from: 't0', to: 'found-D', count: 1 },
    ])
    // The fixpoint is real: replaying the batch leaves nothing safe to fly.
    expect(safeFlights(replay(world, flights))).toEqual([])
  })

  it('nothing safe → []', () => {
    expect(safeFlights(rig(up('t0', [['D', 7]])))).toEqual([])
    expect(safeFlights(rig())).toEqual([])
  })
})

// --- moveGroup ---------------------------------------------------------------

// Seed 22's first draw turns up the ace of spades — a safe flight; seed 40's
// first legal click (t3 ace → foundation + flip) unlocks nothing. Both
// verified deterministically against the engine's deal.
const DRAW: readonly Action[] = [{ type: 'move', from: 'stock', to: 'waste', count: 1, faceUp: true }]

describe('moveGroup', () => {
  it('rule actions + unlocked flights land as ONE group', () => {
    const state = moveGroup(initialState('22'), DRAW)
    expect(state.moves).toHaveLength(1)
    expect(state.moves[0]).toEqual([
      { type: 'move', from: 'stock', to: 'waste', count: 1, faceUp: true },
      { type: 'move', from: 'waste', to: 'found-S', count: 1 },
    ])
    expect(topCard(worldFor(state), 'found-S')?.card.id).toBe('S1')
    // The next click is again exactly one more group.
    expect(moveGroup(state, DRAW).moves).toHaveLength(2)
  })

  it('a click that unlocks nothing appends just the rule actions', () => {
    const CLICK: readonly Action[] = [
      { type: 'move', from: 't3', to: 'found-D', count: 1 },
      { type: 'flip', pile: 't3' },
    ]
    const state = moveGroup(initialState('40'), CLICK)
    expect(state.moves).toHaveLength(1)
    expect(state.moves[0]).toEqual([...CLICK])
  })

  it('autoFly: false → rule actions ONLY, even when flights exist', () => {
    // Seed 22's first draw exposes the ace of spades — with auto-fly on it
    // flies in the same group (see the test above); with it off, the ace
    // stays on the waste and foundations stay untouched.
    const state = moveGroup(initialState('22'), DRAW, { autoFly: false })
    expect(state.moves).toHaveLength(1)
    expect(state.moves[0]).toEqual([...DRAW])
    expect(topCard(worldFor(state), 'waste')?.card.id).toBe('S1')
    expect(topCard(worldFor(state), 'found-S')).toBeNull()
  })

  it('applyPlayerMove appends verbatim — no flights composed', () => {
    const state = applyPlayerMove(initialState('22'), DRAW)
    expect(state.moves).toHaveLength(1)
    expect(state.moves[0]).toEqual([...DRAW])
    expect(topCard(worldFor(state), 'waste')?.card.id).toBe('S1')
  })
})

// --- save / load / clear ------------------------------------------------------

describe('save / load / clear', () => {
  const SAVE_KEY = 'shellback.klondike-draw1.save.v1'

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

  /** A played state: seed 22, one click (draw + its ace flight). */
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
    const moves = [...state.moves, [{ type: 'move', from: 't0', to: 'found-S', count: 99 }]]
    store.set(SAVE_KEY, JSON.stringify({ seed: state.seed, moves }))
    expect(loadGame()).toBeNull()
  })
})

// --- isWonState ----------------------------------------------------------------

describe('isWonState', () => {
  /** Stack whole piles into the four foundations, 13 apiece (structural replay). */
  const FOUNDATION_STACKS: readonly (readonly Action[])[] = [
    [{ type: 'move', from: 't0', to: 'found-S', count: 1 }],
    [{ type: 'move', from: 't1', to: 'found-S', count: 2 }],
    [{ type: 'move', from: 't2', to: 'found-S', count: 3 }],
    [{ type: 'move', from: 't3', to: 'found-S', count: 4 }],
    [{ type: 'move', from: 't4', to: 'found-S', count: 3 }], // t4 keeps 2
    [{ type: 'move', from: 't4', to: 'found-H', count: 2 }],
    [{ type: 'move', from: 't5', to: 'found-H', count: 6 }],
    [{ type: 'move', from: 't6', to: 'found-H', count: 5 }], // t6 keeps 2
    [{ type: 'move', from: 't6', to: 'found-D', count: 2 }],
    [{ type: 'move', from: 'stock', to: 'found-D', count: 11 }], // stock keeps 13
    [{ type: 'move', from: 'stock', to: 'found-C', count: 13 }],
  ]

  const stacked = (groups: readonly (readonly Action[])[]): GameState =>
    groups.reduce((state, group) => applyPlayerMove(state, group), initialState('craft'))

  it('all four foundations at 13 → true', () => {
    expect(isWonState(stacked(FOUNDATION_STACKS))).toBe(true)
  })

  it('one foundation a card short → false; a fresh deal → false', () => {
    const short = [...FOUNDATION_STACKS.slice(0, -1)]
    short.push([{ type: 'move', from: 'stock', to: 'found-C', count: 12 }])
    expect(isWonState(stacked(short))).toBe(false)
    expect(isWonState(initialState('craft'))).toBe(false)
  })
})
