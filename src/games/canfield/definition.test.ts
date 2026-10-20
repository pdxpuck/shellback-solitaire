/**
 * Canfield (Draw-3) pure-logic suite. Crafted worlds are built with engine
 * primitives (createWorld/dealCards) — small deterministic rigs, no random
 * deals except where the spec calls for one.
 */

import { describe, expect, it } from 'vitest'
import type { Action, Card, Suit, World } from 'deckhand/engine'
import { EngineError, cardId, createWorld, dealCards, replay, topCard } from 'deckhand/engine'
import { baseRank, canfield as game } from './definition'

// --- rig helpers -----------------------------------------------------------

const PILE_IDS = [
  'stock',
  'waste',
  'reserve',
  'found-0',
  'found-1',
  'found-2',
  'found-3',
  't0',
  't1',
  't2',
  't3',
]

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

const isMove = (a: Action, from: string, to: string): boolean =>
  a.type === 'move' && a.from === from && a.to === to

/**
 * The single move action from→to (Canfield composes no flips), as
 * legalMoves enumerates it. Undefined when no such move exists.
 */
function findMove(world: World, from: string, to: string, count?: number): Action | undefined {
  return game.legalMoves(world).find(
    (a) => isMove(a, from, to) && (count === undefined || (a.type === 'move' && a.count === count)),
  )
}

// --- deal ------------------------------------------------------------------

describe('canfield deal', () => {
  it('same seed → JSON-identical worlds', () => {
    expect(JSON.stringify(game.deal('seed-a'))).toBe(JSON.stringify(game.deal('seed-a')))
  })

  it('different seeds → different worlds (almost surely)', () => {
    expect(JSON.stringify(game.deal(1))).not.toBe(JSON.stringify(game.deal(2)))
  })

  it('counts: reserve 13 (12 down, top up), found-0 1 face-up, t0..t3 1 face-up each, stock 34, waste empty; 52 distinct cards', () => {
    const world = game.deal(42)
    expect(world.piles.waste.cards).toHaveLength(0)
    const reserve = world.piles.reserve.cards
    expect(reserve).toHaveLength(13)
    for (let j = 0; j < 12; j++) expect(reserve[j].faceUp).toBe(false)
    expect(topCard(world, 'reserve')?.faceUp).toBe(true)
    expect(world.piles['found-0'].cards).toHaveLength(1)
    expect(world.piles['found-0'].cards[0].faceUp).toBe(true)
    for (const id of ['found-1', 'found-2', 'found-3']) {
      expect(world.piles[id].cards).toHaveLength(0)
    }
    for (let i = 0; i < 4; i++) {
      const pile = world.piles[`t${i}`]
      expect(pile.cards).toHaveLength(1)
      expect(pile.cards[0].faceUp).toBe(true)
    }
    expect(world.piles.stock.cards).toHaveLength(34)
    expect(world.piles.stock.cards.every((pc) => !pc.faceUp)).toBe(true)
    const ids = Object.values(world.piles).flatMap((pile) => pile.cards.map((pc) => pc.card.id))
    expect(ids).toHaveLength(52)
    expect(new Set(ids).size).toBe(52)
  })

  it('baseRank is the rank of found-0\'s bottom card; an empty found-0 throws EngineError', () => {
    const world = game.deal(42)
    expect(baseRank(world)).toBe(world.piles['found-0'].cards[0].card.rank)
    expect(() => baseRank(rig())).toThrow(EngineError)
  })
})

// --- legalMoves ------------------------------------------------------------

describe('canfield legalMoves — draw / recycle / reserve refill', () => {
  it('draw-3: the full stock emits count 3; a shorter stock emits min(3, length)', () => {
    expect(findMove(game.deal(42), 'stock', 'waste', 3)).toEqual({
      type: 'move',
      from: 'stock',
      to: 'waste',
      count: 3,
      faceUp: true,
    })
    expect(findMove(rig(down('stock', [['S', 1], ['H', 2]])), 'stock', 'waste', 2)).toEqual({
      type: 'move',
      from: 'stock',
      to: 'waste',
      count: 2,
      faceUp: true,
    })
    expect(findMove(rig(down('stock', [['S', 1]])), 'stock', 'waste', 1)).toEqual({
      type: 'move',
      from: 'stock',
      to: 'waste',
      count: 1,
      faceUp: true,
    })
  })

  it('recycle: only when the stock is empty — whole waste, face down, REVERSED (physical flip-over)', () => {
    // Stock nonempty → the draw, never a recycle.
    const midDeal = game.deal(42)
    expect(findMove(midDeal, 'waste', 'stock')).toBeUndefined()
    expect(findMove(midDeal, 'stock', 'waste')).toBeDefined()
    // Stock empty → the flip-over, and it replays as one.
    const exhausted = rig(up('found-0', [['D', 7]]), up('waste', [['S', 1], ['H', 5], ['D', 9]]))
    const recycle = findMove(exhausted, 'waste', 'stock')
    expect(recycle).toEqual({
      type: 'move',
      from: 'waste',
      to: 'stock',
      count: 3,
      faceUp: false,
      reverse: true,
    })
    if (!recycle) throw new Error('unreachable')
    const played = replay(exhausted, [recycle])
    expect(played.piles.stock.cards.map((pc) => pc.card.id)).toEqual(['D9', 'H5', 'S1'])
    expect(played.piles.stock.cards.every((pc) => !pc.faceUp)).toBe(true)
  })

  it('reserve refill: only when the reserve is EMPTY — whole waste, face down, REVERSED', () => {
    // The dealt reserve holds 13 → no refill.
    expect(findMove(game.deal(42), 'waste', 'reserve')).toBeUndefined()
    // Reserve empty + waste nonempty → the flip-over into the reserve.
    const drained = rig(up('found-0', [['D', 7]]), up('waste', [['S', 1], ['H', 5]]))
    expect(findMove(drained, 'waste', 'reserve')).toEqual({
      type: 'move',
      from: 'waste',
      to: 'reserve',
      count: 2,
      faceUp: false,
      reverse: true,
    })
    // A nonempty waste is required even when the reserve is empty.
    expect(findMove(rig(down('stock', [['S', 1]])), 'waste', 'reserve')).toBeUndefined()
  })

  it('emit order: the recycle precedes the reserve refill when both are legal', () => {
    const moves = game.legalMoves(rig(up('found-0', [['D', 7]]), up('waste', [['S', 1], ['H', 5], ['D', 9]])))
    expect(moves[0]).toEqual({
      type: 'move',
      from: 'waste',
      to: 'stock',
      count: 3,
      faceUp: false,
      reverse: true,
    })
    expect(moves[1]).toEqual({
      type: 'move',
      from: 'waste',
      to: 'reserve',
      count: 3,
      faceUp: false,
      reverse: true,
    })
  })
})

describe('canfield legalMoves — foundations', () => {
  it('a reserve card of the base rank lands on ANY empty foundation (any suit)', () => {
    // Base card 7♦ → base rank 7; the reserve top 7♣ is base-rank, wrong suit.
    const world = rig(
      up('found-0', [['D', 7]]),
      down('reserve', [['S', 2]]),
      up('reserve', [['C', 7]]),
    )
    expect(findMove(world, 'reserve', 'found-1', 1)).toEqual({
      type: 'move',
      from: 'reserve',
      to: 'found-1',
      count: 1,
      faceUp: true,
    })
    expect(findMove(world, 'reserve', 'found-3', 1)).toBeDefined()
    // found-0 is nonempty (holds the base card): it wants D8 only, not C7.
    expect(findMove(world, 'reserve', 'found-0')).toBeUndefined()
  })

  it('an empty foundation rejects a non-base-rank card', () => {
    const world = rig(up('found-0', [['D', 7]]), up('reserve', [['C', 8]]))
    expect(findMove(world, 'reserve', 'found-1')).toBeUndefined()
  })

  it('builds up in suit from the base card; wrong suit or a skipped rank is illegal', () => {
    const world = rig(up('found-0', [['D', 7], ['D', 8]]), up('t0', [['D', 9]]), up('t1', [['H', 9]]), up('t2', [['D', 10]]))
    expect(findMove(world, 't0', 'found-0', 1)).toEqual({
      type: 'move',
      from: 't0',
      to: 'found-0',
      count: 1,
    })
    expect(findMove(world, 't1', 'found-0')).toBeUndefined() // wrong suit
    expect(findMove(world, 't2', 'found-0')).toBeUndefined() // skipped a rank
  })

  it('wraps: an ace lands on a king of its own suit (base rank ≠ ace rig)', () => {
    const world = rig(up('found-0', [['D', 5]]), up('found-1', [['S', 12], ['S', 13]]), up('t0', [['S', 1]]))
    expect(findMove(world, 't0', 'found-1', 1)).toEqual({
      type: 'move',
      from: 't0',
      to: 'found-1',
      count: 1,
    })
  })

  it('no foundation → tableau pulls, ever — placed foundation cards are LOCKED (DC5)', () => {
    const world = rig(up('found-0', [['D', 5]]), up('found-1', [['S', 5], ['S', 6]]), up('t0', [['H', 7]]))
    // 6♠ would fit 7♥ under the bare tableau rule; the LOCK forbids the pull.
    expect(findMove(world, 'found-1', 't0')).toBeUndefined()
    // Even an empty tableau takes nothing from a foundation (reserve-only gaps).
    expect(findMove(world, 'found-1', 't2')).toBeUndefined()
    expect(findMove(world, 'found-0', 't2')).toBeUndefined()
  })

  it('the waste top of the base rank lands on ANY empty foundation; a non-base-rank waste card does not', () => {
    // Base card 7♦ → base rank 7; the waste top 7♥ is base-rank (any suit).
    const world = rig(up('found-0', [['D', 7]]), up('waste', [['H', 7]]))
    expect(findMove(world, 'waste', 'found-1', 1)).toEqual({
      type: 'move',
      from: 'waste',
      to: 'found-1',
      count: 1,
    })
    // 9♥ is not the base rank: it lands on no empty foundation.
    const wrong = rig(up('found-0', [['D', 7]]), up('waste', [['H', 9]]))
    expect(findMove(wrong, 'waste', 'found-1', 1)).toBeUndefined()
  })

  it('the waste top builds in suit onto a BUILT foundation; a wrong-suit next-rank card does not', () => {
    // found-1 holds 7♥+8♥; the waste top 9♥ is the next rank in suit.
    const world = rig(
      up('found-0', [['D', 7]]),
      up('found-1', [['H', 7], ['H', 8]]),
      up('waste', [['H', 9]]),
    )
    expect(findMove(world, 'waste', 'found-1', 1)).toEqual({
      type: 'move',
      from: 'waste',
      to: 'found-1',
      count: 1,
    })
    // 9♠ is the next rank after 8♥ but the wrong suit, and the empty
    // foundations want the base rank only.
    const wrongSuit = rig(
      up('found-0', [['D', 7]]),
      up('found-1', [['H', 7], ['H', 8]]),
      up('waste', [['S', 9]]),
    )
    expect(findMove(wrongSuit, 'waste', 'found-1', 1)).toBeUndefined()
  })
})

describe('canfield legalMoves — tableau', () => {
  it('builds down in alternating color; same color or a gap in rank is illegal', () => {
    // Every rig carries a base card on found-0 — a real Canfield position
    // always has one (baseRank throws on an empty found-0 by design).
    expect(
      findMove(rig(up('found-0', [['D', 9]]), up('t0', [['S', 7]]), up('t1', [['H', 6]])), 't1', 't0', 1),
    ).toEqual({
      type: 'move',
      from: 't1',
      to: 't0',
      count: 1,
    })
    expect(
      findMove(rig(up('found-0', [['D', 9]]), up('t0', [['S', 7]]), up('t1', [['C', 6]])), 't1', 't0'),
    ).toBeUndefined()
    expect(
      findMove(rig(up('found-0', [['D', 9]]), up('t0', [['S', 9]]), up('t1', [['H', 6]])), 't1', 't0'),
    ).toBeUndefined()
  })

  it('wraps: a king lands on an ace', () => {
    const world = rig(up('found-0', [['D', 9]]), up('t0', [['H', 1]]), up('t1', [['S', 13]]))
    expect(findMove(world, 't1', 't0', 1)).toEqual({ type: 'move', from: 't1', to: 't0', count: 1 })
  })

  it('the reserve top fills an EMPTY gap — the only legal gap fill', () => {
    const world = rig(
      up('found-0', [['D', 9]]),
      up('t1', [['H', 8]]),
      down('reserve', [['S', 2]]),
      up('reserve', [['C', 7]]),
    )
    expect(findMove(world, 'reserve', 't0', 1)).toEqual({
      type: 'move',
      from: 'reserve',
      to: 't0',
      count: 1,
      faceUp: true,
    })
    // …and it also builds onto a nonempty tableau by the normal rule (7♣ on 8♥).
    expect(findMove(world, 'reserve', 't1', 1)).toBeDefined()
  })

  it('the waste top may build on a card but NEVER fills an empty gap', () => {
    const world = rig(up('found-0', [['D', 9]]), up('t1', [['H', 1]]), up('waste', [['S', 13]]))
    expect(findMove(world, 'waste', 't0')).toBeUndefined() // empty gap: reserve-only
    expect(findMove(world, 'waste', 't1', 1)).toBeDefined() // K♠ wraps onto A♥
  })

  it('runs move whole, judged by the run\'s bottom card; a run never lands on an empty gap', () => {
    // t0 = [9♥ up, 8♠ up]; the 9♥+8♠ run lands on 10♣, judged by 9♥.
    const world = rig(up('found-0', [['D', 5]]), up('t1', [['C', 10]]), up('t0', [['H', 9], ['S', 8]]))
    const run = findMove(world, 't0', 't1', 2)
    expect(run).toEqual({ type: 'move', from: 't0', to: 't1', count: 2 })
    if (!run) throw new Error('unreachable')
    const played = replay(world, [run])
    expect(played.piles.t1.cards.map((pc) => pc.card.id)).toEqual(['C10', 'H9', 'S8'])
    expect(played.piles.t0.cards).toHaveLength(0)
    // The emptied t0 is a gap: nothing from t1 refills it (reserve-only).
    expect(findMove(played, 't1', 't0')).toBeUndefined()
    // And a run never lands on an empty gap directly.
    expect(
      findMove(rig(up('found-0', [['D', 5]]), up('t0', [['H', 9], ['S', 8]])), 't0', 't2', 2),
    ).toBeUndefined()
  })
})

// --- safeAutoMoves ----------------------------------------------------------

describe('canfield safeAutoMoves', () => {
  it('always [] — no safe auto-fly in Canfield (DC5)', () => {
    expect(game.safeAutoMoves(game.deal(3))).toEqual([])
    // A foundation-ready card that would auto-fly in Klondike stays put here.
    expect(game.safeAutoMoves(rig(up('found-0', [['D', 5]]), up('t0', [['D', 6]])))).toEqual([])
    expect(game.safeAutoMoves(rig())).toEqual([])
  })
})

// --- isWon -------------------------------------------------------------------

describe('canfield isWon', () => {
  const run = (suit: Suit): Spot[] =>
    Array.from({ length: 13 }, (_, i) => [suit, i + 1] as const)

  it('true only when all four foundations hold 13 cards', () => {
    const won = rig(
      up('found-0', run('S')),
      up('found-1', run('H')),
      up('found-2', run('D')),
      up('found-3', run('C')),
    )
    expect(game.isWon(won)).toBe(true)

    const almost = rig(
      up('found-0', run('S').slice(0, 12)),
      up('found-1', run('H')),
      up('found-2', run('D')),
      up('found-3', run('C')),
    )
    expect(game.isWon(almost)).toBe(false)
    expect(game.isWon(game.deal(7))).toBe(false)
  })
})

// --- replay consistency ------------------------------------------------------

describe('canfield replay consistency', () => {
  it('scripted real moves fold to the stepwise result', () => {
    let total = 0
    for (let seed = 0; seed < 20; seed++) {
      const start = game.deal(seed)
      let world = start
      const actions: Action[] = []
      for (let i = 0; i < 40; i++) {
        const moves = game.legalMoves(world)
        if (moves.length === 0) break
        const chosen = moves[moves.length - 1] // One move action — no flips to group.
        actions.push(chosen)
        world = replay(world, [chosen])
      }
      expect(replay(start, actions)).toEqual(world)
      total += actions.length
    }
    // The scripted seeds collectively found real moves to play (not vacuous).
    expect(total).toBeGreaterThan(100)
  })
})
