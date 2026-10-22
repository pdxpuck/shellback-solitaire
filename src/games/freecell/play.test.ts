/**
 * FreeCell session-layer suite. GameState rigs are built on real deals,
 * since every query replays from deal(seed); the one exception is
 * isWonState, whose rigged states are stacked via applyPlayerMove (verbatim
 * append) — replay is structural, so whole-pile foundation counts can be
 * crafted directly. Storage tests stub globalThis.localStorage with an
 * in-memory map (no jsdom in this suite).
 *
 * Deal #1 is the workhorse seed, verified against the engine's deal:
 * t5 reads H10 D4 C1 D5 D1 S5 bottom→top, so parking the ♠5 exposes the
 * ♦1 — a safe flight (aces are always safe, DC5) and the first real one
 * since Klondike (Canfield's safeAutoMoves returns [], DC5 there).
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Action } from 'deckhand/engine'
import { replay, topCard } from 'deckhand/engine'
import { freecell as game } from './definition'
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

/**
 * The opening click on deal #1's t5: ♠5 parks in the empty cell-0 (any card
 * plays to any empty cell) — exposing the ♦1 beneath for the safe flight.
 */
const PARK: readonly Action[] = [{ type: 'move', from: 't5', to: 'cell-0', count: 1 }]

/** A flight-free opening click: ♦8 parks off t0, exposing ♥9 — nothing safe. */
const QUIET_PARK: readonly Action[] = [{ type: 'move', from: 't0', to: 'cell-0', count: 1 }]

/** Follow-up parks for clicks 2 and 3 (cell-0 holds ♠5 after PARK). */
const PARK_2: readonly Action[] = [{ type: 'move', from: 't0', to: 'cell-1', count: 1 }] // ♥9 parks
const PARK_3: readonly Action[] = [{ type: 'move', from: 't0', to: 'cell-2', count: 1 }] // ♠7 parks

// --- initialState / worldFor -------------------------------------------------

describe('initialState / worldFor', () => {
  it('same seed → identical states and identical worlds, matching the deal', () => {
    const a = initialState('determinism')
    const b = initialState('determinism')
    expect(a).toEqual(b)
    expect(JSON.stringify(worldFor(a))).toBe(JSON.stringify(worldFor(b)))
    expect(JSON.stringify(worldFor(a))).toBe(JSON.stringify(game.deal('determinism')))
  })

  it('a fresh deal: cascades 7-7-7-7-6-6-6-6, cells and foundations empty', () => {
    const world = worldFor(initialState('42'))
    const cascades = ['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7'].map(
      (id) => world.piles[id].cards.length,
    )
    expect(cascades).toEqual([7, 7, 7, 7, 6, 6, 6, 6])
    for (const cell of ['cell-0', 'cell-1', 'cell-2', 'cell-3']) {
      expect(world.piles[cell].cards, cell).toHaveLength(0)
    }
    for (const foundation of ['found-S', 'found-H', 'found-D', 'found-C']) {
      expect(world.piles[foundation].cards, foundation).toHaveLength(0)
    }
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

// --- safe flights (DC5 — first real auto-fly consumer since Klondike) ---------

describe('safeFlights', () => {
  it('the exposed ♦1 flies exactly once, then the fixpoint settles', () => {
    const exposed = applyPlayerMove(initialState('1'), PARK) // ♠5 → cell-0; ♦1 now tops t5
    const flights = safeFlights(worldFor(exposed))
    expect(flights).toEqual([{ type: 'move', from: 't5', to: 'found-D', count: 1 }])
    // The fixpoint is real: replaying the batch leaves nothing safe to fly.
    expect(safeFlights(replay(worldFor(exposed), flights))).toEqual([])
  })

  it('a click that unlocks nothing flies nothing', () => {
    const state = applyPlayerMove(initialState('1'), QUIET_PARK)
    expect(safeFlights(worldFor(state))).toEqual([])
  })
})

// --- moveGroup ---------------------------------------------------------------

describe('moveGroup', () => {
  it('rule actions + unlocked flights land as ONE group', () => {
    const state = moveGroup(initialState('1'), PARK)
    expect(state.moves).toHaveLength(1)
    expect(state.moves[0]).toEqual([
      { type: 'move', from: 't5', to: 'cell-0', count: 1 },
      { type: 'move', from: 't5', to: 'found-D', count: 1 },
    ])
    const world = worldFor(state)
    expect(topCard(world, 'found-D')?.card.id).toBe('D1')
    expect(topCard(world, 't5')?.card.id).toBe('D5') // exposed by the flight
    expect(topCard(world, 'cell-0')?.card.id).toBe('S5')
    // The next click is again exactly one more group.
    expect(moveGroup(state, PARK_2).moves).toHaveLength(2)
  })

  it('autoFly: false → rule actions ONLY, even when flights exist', () => {
    const state = moveGroup(initialState('1'), PARK, { autoFly: false })
    expect(state.moves).toHaveLength(1)
    expect(state.moves[0]).toEqual([...PARK])
    const world = worldFor(state)
    expect(topCard(world, 'found-D')).toBeNull() // the ace stays put...
    expect(topCard(world, 't5')?.card.id).toBe('D1') // ...where it landed exposed
  })

  it('a click that unlocks nothing appends just the rule actions', () => {
    const state = moveGroup(initialState('1'), QUIET_PARK)
    expect(state.moves).toHaveLength(1)
    expect(state.moves[0]).toEqual([...QUIET_PARK])
    expect(topCard(worldFor(state), 'cell-0')?.card.id).toBe('D8')
  })

  it('applyPlayerMove appends verbatim — no flights composed', () => {
    const state = applyPlayerMove(initialState('1'), PARK)
    expect(state.moves).toHaveLength(1)
    expect(state.moves[0]).toEqual([...PARK])
    expect(topCard(worldFor(state), 't5')?.card.id).toBe('D1')
  })
})

// --- replay consistency (checklist §6) -----------------------------------------

describe('replay consistency', () => {
  /**
   * A scripted legal walk on deal #1 (verified against the engine's deal):
   * four cascade tops park into the four cells, then four single-card
   * builds unwind two of them — ♦8→cell-0, ♥6→cell-1, ♠10→cell-2, ♠6→cell-3;
   * ♥2 onto ♣3; ♠6 onto ♥7; ♣2 onto ♥3; ♠10 onto ♦11. Flight-free by
   * construction: no ace is ever a cell or cascade top, so safeAutoMoves
   * stays empty throughout and every group is exactly its rule action.
   */
  const WALK: readonly (readonly Action[])[] = [
    [{ type: 'move', from: 't0', to: 'cell-0', count: 1 }], // ♦8 parks
    [{ type: 'move', from: 't1', to: 'cell-1', count: 1 }], // ♥6 parks
    [{ type: 'move', from: 't2', to: 'cell-2', count: 1 }], // ♠10 parks
    [{ type: 'move', from: 't3', to: 'cell-3', count: 1 }], // ♠6 parks
    [{ type: 'move', from: 't2', to: 't1', count: 1 }], // ♥2 onto ♣3
    [{ type: 'move', from: 'cell-3', to: 't3', count: 1 }], // ♠6 onto ♥7
    [{ type: 'move', from: 't6', to: 't4', count: 1 }], // ♣2 onto ♥3
    [{ type: 'move', from: 'cell-2', to: 't7', count: 1 }], // ♠10 onto ♦11
  ]

  it('stepwise moveGroup walk == one batched state with all groups concatenated', () => {
    let stepwise = initialState('1')
    for (const group of WALK) stepwise = moveGroup(stepwise, group)
    // The walk is flight-free: every group is exactly the scripted action.
    expect(stepwise.moves).toEqual(WALK)
    const batched = applyPlayerMove(initialState('1'), WALK.flat())
    expect(JSON.stringify(worldFor(stepwise))).toBe(JSON.stringify(worldFor(batched)))
    // Spot-check the walked world: the parks that survived, the builds that landed.
    const world = worldFor(stepwise)
    expect(world.piles['cell-0'].cards.map((pc) => pc.card.id)).toEqual(['D8'])
    expect(world.piles['cell-1'].cards.map((pc) => pc.card.id)).toEqual(['H6'])
    expect(topCard(world, 't7')?.card.id).toBe('S10')
    expect(topCard(world, 't4')?.card.id).toBe('C2')
    expect(topCard(world, 't1')?.card.id).toBe('H2')
  })
})

// --- undo by slice -------------------------------------------------------------

describe('undo by slice', () => {
  it('dropping later groups replays to exactly the earlier world', () => {
    let state = initialState('1')
    state = moveGroup(state, PARK)
    const afterOne = worldFor(state)
    state = moveGroup(state, PARK_2)
    state = moveGroup(state, PARK_3)
    expect(state.moves).toHaveLength(3)
    const undone: GameState = { ...state, moves: state.moves.slice(0, 1) }
    expect(JSON.stringify(worldFor(undone))).toBe(JSON.stringify(afterOne))
  })
})

// --- save / load / clear ------------------------------------------------------

describe('save / load / clear', () => {
  const SAVE_KEY = 'shellback.freecell.save.v1'

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

  /** A played state: seed 1, one click (the park + its composed ace flight). */
  const playedState = (): GameState => moveGroup(initialState('1'), PARK)

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
      '{"seed":"1"}',
      '{"seed":1,"moves":[]}',
      '{"seed":"1","moves":["nope"]}',
      '{"seed":"1","moves":[[1,2]]}',
      '{"seed":"1","moves":[[{"type":5}]]}',
    ]
    for (const raw of bad) {
      store.set(SAVE_KEY, raw)
      expect(loadGame()).toBeNull()
    }
  })

  it('structurally valid but rule-breaking log → null', () => {
    const store = stubStorage()
    const state = playedState()
    // t0 holds 7 cards; pulling 99 raises EngineError in replay.
    const moves = [...state.moves, [{ type: 'move', from: 't0', to: 'found-S', count: 99 }]]
    store.set(SAVE_KEY, JSON.stringify({ seed: state.seed, moves }))
    expect(loadGame()).toBeNull()
  })
})

// --- isWonState ----------------------------------------------------------------

describe('isWonState', () => {
  /**
   * Stack whole cascades into the four suit-keyed foundations, 13 apiece
   * (structural replay — card identity is irrelevant to the win check, only
   * the 13-per-foundation counts). Deal #1: t0..t3 hold 7 cards, t4..t7
   * hold 6 — each 7-cascade pairs with a 6-cascade to drain exactly 13.
   */
  const FOUNDATION_STACKS: readonly (readonly Action[])[] = [
    [{ type: 'move', from: 't0', to: 'found-S', count: 7 }], // found-S = 7
    [{ type: 'move', from: 't4', to: 'found-S', count: 6 }], // found-S = 13
    [{ type: 'move', from: 't1', to: 'found-H', count: 7 }], // found-H = 7
    [{ type: 'move', from: 't5', to: 'found-H', count: 6 }], // found-H = 13
    [{ type: 'move', from: 't2', to: 'found-D', count: 7 }], // found-D = 7
    [{ type: 'move', from: 't6', to: 'found-D', count: 6 }], // found-D = 13
    [{ type: 'move', from: 't3', to: 'found-C', count: 7 }], // found-C = 7
    [{ type: 'move', from: 't7', to: 'found-C', count: 6 }], // found-C = 13
  ]

  const stacked = (groups: readonly (readonly Action[])[]): GameState =>
    groups.reduce((state, group) => applyPlayerMove(state, group), initialState('1'))

  it('all four foundations at 13 → true', () => {
    expect(isWonState(stacked(FOUNDATION_STACKS))).toBe(true)
  })

  it('one foundation a card short → false; a fresh deal → false', () => {
    expect(isWonState(stacked(FOUNDATION_STACKS.slice(0, -1)))).toBe(false)
    expect(isWonState(initialState('1'))).toBe(false)
  })
})
