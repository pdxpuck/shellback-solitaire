/**
 * flightSteps suite (C3 animation groundwork). Worlds come in the two flavors
 * the other suites use: crafted rigs built with engine primitives (as in
 * definition.test.ts) for precise run/flip/ordering scenarios, and real deals
 * via klondikeDraw1.deal for end-to-end moves — seed 1 anchors the first
 * tableau→tableau move in legalMoves' emit order, seed 22 the first draw
 * (its top card is the ace of spades; see play.test.ts). Every expectation is
 * a fixed seed or verified-from-deal fact; nothing random.
 */

import { describe, expect, it } from 'vitest'
import type { Action, Card, PileId, Suit, World } from 'deckhand/engine'
import { EngineError, cardId, createWorld, dealCards, replay, topCard } from 'deckhand/engine'
import { klondikeDraw1 as game } from '../games/klondike/definition'
import { flightSteps } from './flights'

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

const TABLEAU_IDS: readonly PileId[] = ['t0', 't1', 't2', 't3', 't4', 't5', 't6']

const card = (suit: Suit, rank: number): Card => ({ id: cardId(suit, rank), suit, rank, copy: 1 })

type Spot = readonly [Suit, number]

interface RigEntry {
  readonly pile: string
  readonly cards: readonly Spot[]
  readonly faceUp: boolean
}

const down = (pile: string, cards: readonly Spot[]): RigEntry => ({ pile, cards, faceUp: false })
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

const isTableau = (pile: PileId): boolean => TABLEAU_IDS.includes(pile)

// --- flightSteps ------------------------------------------------------------

describe('flightSteps', () => {
  it('empty actions → []', () => {
    expect(flightSteps(game.deal('1'), [])).toEqual([])
  })

  it('a real deal: the first tableau→tableau move animates its top card', () => {
    const before = game.deal('1')
    const move = game
      .legalMoves(before)
      .find(
        (action): action is Extract<Action, { type: 'move' }> =>
          action.type === 'move' && isTableau(action.from) && isTableau(action.to),
      )!
    // Seed 1's first such move in legalMoves' emit order: t0's 9♠ onto t2,
    // landing on t2's dealt 3 cards.
    expect(move).toEqual({ type: 'move', from: 't0', to: 't2', count: 1 })
    expect(flightSteps(before, [move])).toEqual([
      { cardIds: ['S9'], fromPile: 't0', toPile: 't2', landedOnCount: 4 },
    ])
  })

  it('a flip emits no step but advances the world for the following move', () => {
    // t0 = [C1d, C2d, H5u]: moving the 5♥ onto the 6♠ exposes the face-down
    // 2♣ — the click composes move + flip — and the flipped 2♣ then flies to
    // the 3♦. That follow-up is legal ONLY in the post-flip world (the dealt
    // top, 5♥, does not fit on the 3♦), so its step proves the world advanced.
    const before = rig(
      down('t0', [
        ['C', 1],
        ['C', 2],
      ]),
      up('t0', [['H', 5]]),
      up('t1', [['S', 6]]),
      up('t2', [['D', 3]]),
    )
    const move: Extract<Action, { type: 'move' }> = { type: 'move', from: 't0', to: 't1', count: 1 }
    const followUp: Extract<Action, { type: 'move' }> = {
      type: 'move',
      from: 't0',
      to: 't2',
      count: 1,
    }
    expect(game.legalMoves(before)).toContainEqual(move)
    expect(game.legalMoves(before)).not.toContainEqual(followUp)
    const after = replay(before, [move, { type: 'flip', pile: 't0' }])
    expect(game.legalMoves(after)).toContainEqual(followUp)
    expect(flightSteps(before, [move, { type: 'flip', pile: 't0' }, followUp])).toEqual([
      { cardIds: ['H5'], fromPile: 't0', toPile: 't1', landedOnCount: 2 },
      { cardIds: ['C2'], fromPile: 't0', toPile: 't2', landedOnCount: 2 },
    ])
  })

  it('a multi-card run moves as ONE step, ids in bottom-to-top order', () => {
    // t0 = [H7u, S6u, H5u]: the face-up run 6♠+5♥ flies together onto the 7♦.
    const before = rig(
      up('t0', [
        ['H', 7],
        ['S', 6],
        ['H', 5],
      ]),
      up('t1', [['D', 7]]),
    )
    const move: Extract<Action, { type: 'move' }> = { type: 'move', from: 't0', to: 't1', count: 2 }
    expect(game.legalMoves(before)).toContainEqual(move)
    expect(flightSteps(before, [move])).toEqual([
      { cardIds: ['S6', 'H5'], fromPile: 't0', toPile: 't1', landedOnCount: 3 },
    ])
  })

  it('two sequential moves: each step reads its own intermediate world', () => {
    // t0 = [S6u, H5u]. Move 1 sends the 5♥ to t1; step 2 must then read the
    // INTERMEDIATE world — its card is the exposed 6♠, not the dealt top 5♥.
    const before = rig(
      up('t0', [
        ['S', 6],
        ['H', 5],
      ]),
      up('t1', [['C', 6]]),
      up('t2', [['D', 7]]),
    )
    const moves: readonly Action[] = [
      { type: 'move', from: 't0', to: 't1', count: 1 },
      { type: 'move', from: 't0', to: 't2', count: 1 },
    ]
    expect(topCard(before, 't0')?.card.id).toBe('H5') // the dealt top…
    expect(game.legalMoves(replay(before, [moves[0]]))).toContainEqual(moves[1]) // …legal only mid-flight
    expect(flightSteps(before, moves)).toEqual([
      { cardIds: ['H5'], fromPile: 't0', toPile: 't1', landedOnCount: 2 },
      { cardIds: ['S6'], fromPile: 't0', toPile: 't2', landedOnCount: 2 },
    ])
  })

  it('a stock draw animates stock → waste, exactly one card', () => {
    // Seed 22's first draw turns up the ace of spades (see play.test.ts).
    const before = game.deal('22')
    const draw: Extract<Action, { type: 'move' }> = {
      type: 'move',
      from: 'stock',
      to: 'waste',
      count: 1,
      faceUp: true,
    }
    expect(game.legalMoves(before)).toContainEqual(draw)
    expect(flightSteps(before, [draw])).toEqual([
      { cardIds: ['S1'], fromPile: 'stock', toPile: 'waste', landedOnCount: 1 },
    ])
  })

  it('a move deeper than its from-pile throws from the engine replay', () => {
    // Seed 1's t0 holds a single card; pulling 99 raises EngineError in
    // takeTop via replay — flightSteps adds no validation of its own.
    const before = game.deal('1')
    expect(() =>
      flightSteps(before, [{ type: 'move', from: 't0', to: 't2', count: 99 }]),
    ).toThrow(EngineError)
  })
})
