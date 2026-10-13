/**
 * Klondike (Draw-1) pure-logic suite. Crafted worlds are built with engine
 * primitives (createWorld/dealCards) — small deterministic rigs, no random
 * deals except where the spec calls for one.
 */

import { describe, expect, it } from 'vitest'
import type { Action, Card, Suit, World } from 'deckhand/engine'
import { cardId, createWorld, dealCards, replay, topCard } from 'deckhand/engine'
import { klondikeDraw1 as game } from './definition'

// --- rig helpers -----------------------------------------------------------

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
 * The composed player move from→to (a move action plus its trailing flip, if
 * any), as legalMoves enumerates it. Undefined when no such move exists.
 */
function findSequence(
  world: World,
  from: string,
  to: string,
  count?: number,
): readonly Action[] | undefined {
  const moves = game.legalMoves(world)
  const idx = moves.findIndex(
    (a) => isMove(a, from, to) && (count === undefined || (a.type === 'move' && a.count === count)),
  )
  if (idx === -1) return undefined
  const seq = [moves[idx]]
  const next = moves[idx + 1]
  if (next && next.type === 'flip' && next.pile === from) seq.push(next)
  return seq
}

// --- deal ------------------------------------------------------------------

describe('klondike deal', () => {
  it('same seed → JSON-identical worlds', () => {
    expect(JSON.stringify(game.deal('seed-a'))).toBe(JSON.stringify(game.deal('seed-a')))
  })

  it('counts: stock 24, t_i holds i+1 (top face-up), foundations + waste empty, 52 distinct cards', () => {
    const world = game.deal(42)
    expect(world.piles.stock.cards).toHaveLength(24)
    expect(world.piles.waste.cards).toHaveLength(0)
    for (const foundation of ['found-S', 'found-H', 'found-D', 'found-C']) {
      expect(world.piles[foundation].cards).toHaveLength(0)
    }
    for (let i = 0; i < 7; i++) {
      const pile = world.piles[`t${i}`]
      expect(pile.cards).toHaveLength(i + 1)
      for (let j = 0; j < i; j++) expect(pile.cards[j].faceUp).toBe(false)
      expect(topCard(world, `t${i}`)?.faceUp).toBe(true)
    }
    const ids = Object.values(world.piles).flatMap((pile) => pile.cards.map((pc) => pc.card.id))
    expect(ids).toHaveLength(52)
    expect(new Set(ids).size).toBe(52)
  })

  it('different seeds → different tableaus (almost surely)', () => {
    expect(JSON.stringify(game.deal(1))).not.toBe(JSON.stringify(game.deal(2)))
  })
})

// --- legalMoves ------------------------------------------------------------

describe('klondike legalMoves', () => {
  // Seed 3's tops (D10 D7 H8 D13 D12 H5 H12) include no ace and no
  // opposite-color consecutive-rank pair, so the draw is the ONLY legal move
  // on a fresh deal (verified deterministically via the engine).
  it('fresh deal: exactly one legal move — the draw', () => {
    const moves = game.legalMoves(game.deal(3))
    expect(moves).toHaveLength(1)
    expect(moves[0]).toEqual({ type: 'move', from: 'stock', to: 'waste', count: 1, faceUp: true })
  })

  it('draw-exhaust: 24 draws empty the stock; recycle rebuilds it (unlimited redeals)', () => {
    let world = game.deal('exhaust')
    for (let i = 0; i < 24; i++) {
      const draw = game.legalMoves(world).find((a) => isMove(a, 'stock', 'waste'))
      if (!draw) throw new Error('draw must stay legal while the stock is nonempty')
      world = replay(world, [draw])
    }
    expect(world.piles.stock.cards).toHaveLength(0)
    expect(world.piles.waste.cards).toHaveLength(24)

    const moves = game.legalMoves(world)
    expect(moves.some((a) => isMove(a, 'stock', 'waste'))).toBe(false)
    expect(moves).toContainEqual({
      type: 'move',
      from: 'waste',
      to: 'stock',
      count: 24,
      faceUp: false,
      reverse: true,
    })

    const recycle = moves.find((a) => isMove(a, 'waste', 'stock'))
    if (!recycle) throw new Error('recycle must be enumerated when stock is empty')
    world = replay(world, [recycle])
    expect(world.piles.stock.cards).toHaveLength(24)
    expect(world.piles.waste.cards).toHaveLength(0)
    expect(world.piles.stock.cards.every((pc) => !pc.faceUp)).toBe(true)
    expect(game.legalMoves(world).some((a) => isMove(a, 'stock', 'waste'))).toBe(true)
  })

  it('recycle is a physical flip-over: the next 24 draws repeat the first 24 in the SAME order', () => {
    const drawWhileStockHasCards = (w: World): Action => {
      const draw = game.legalMoves(w).find((a) => isMove(a, 'stock', 'waste'))
      if (!draw) throw new Error('draw must stay legal while the stock is nonempty')
      return draw
    }
    /** Draw the stock dry, appending each drawn card's id in draw order. */
    const drawLabels = (start: World, labels: string[]): World => {
      let world = start
      for (let i = 0; i < 24; i++) {
        world = replay(world, [drawWhileStockHasCards(world)])
        const drawn = topCard(world, 'waste')
        if (!drawn) throw new Error('waste must hold the just-drawn card')
        labels.push(drawn.card.id)
      }
      return world
    }

    // Deterministic seeded deal: draw the full stock, recording draw order.
    const firstPass: string[] = []
    let world = drawLabels(game.deal(3), firstPass)
    expect(world.piles.stock.cards).toHaveLength(0)
    expect(firstPass).toHaveLength(24)

    const recycle = game.legalMoves(world).find((a) => isMove(a, 'waste', 'stock'))
    if (!recycle) throw new Error('recycle must be enumerated when stock is empty')
    world = replay(world, [recycle])
    expect(world.piles.waste.cards).toHaveLength(0)

    const secondPass: string[] = []
    drawLabels(world, secondPass)
    expect(secondPass).toEqual(firstPass)
  })

  it('tableau: red 6 onto black 7 is legal', () => {
    const world = rig(up('t0', [['S', 7]]), up('t1', [['H', 6]]))
    expect(findSequence(world, 't1', 't0', 1)).toEqual([
      { type: 'move', from: 't1', to: 't0', count: 1 },
    ])
  })

  it('tableau: black 6 onto black 7 is illegal (same color)', () => {
    const world = rig(up('t0', [['S', 7]]), up('t1', [['C', 6]]))
    expect(findSequence(world, 't1', 't0')).toBeUndefined()
  })

  it('tableau: right color, wrong rank is illegal', () => {
    const world = rig(up('t0', [['S', 9]]), up('t1', [['H', 6]]))
    expect(findSequence(world, 't1', 't0')).toBeUndefined()
  })

  it('tableau: King onto an empty pile is legal; non-King is not', () => {
    expect(findSequence(rig(up('t1', [['H', 13]])), 't1', 't0', 1)).toEqual([
      { type: 'move', from: 't1', to: 't0', count: 1 },
    ])
    expect(findSequence(rig(up('t1', [['H', 5]])), 't1', 't0')).toBeUndefined()
  })

  it('tableau run: composed with a flip on exposure, and the pair replays cleanly', () => {
    // t1 = [3♣ down, 9♥ up, 8♠ up]; the 9♥+8♠ run lands on 10♠, exposing 3♣.
    const world = rig(up('t0', [['S', 10]]), down('t1', [['C', 3]]), up('t1', [['H', 9], ['S', 8]]))
    const seq = findSequence(world, 't1', 't0', 2)
    expect(seq).toEqual([
      { type: 'move', from: 't1', to: 't0', count: 2 },
      { type: 'flip', pile: 't1' },
    ])
    if (!seq) throw new Error('unreachable')
    const played = replay(world, seq)
    expect(played.piles.t0.cards.map((pc) => pc.card.id)).toEqual(['S10', 'H9', 'S8'])
    expect(played.piles.t1.cards).toHaveLength(1)
    expect(played.piles.t1.cards[0].card.rank).toBe(3)
    expect(played.piles.t1.cards[0].faceUp).toBe(true)
  })

  it('tableau run: no flip composed when nothing face-down is exposed', () => {
    const world = rig(up('t0', [['S', 10]]), up('t1', [['H', 9], ['S', 8]]))
    expect(findSequence(world, 't1', 't0', 2)).toEqual([
      { type: 'move', from: 't1', to: 't0', count: 2 },
    ])
  })

  it('foundation: an ace lands only on its own suit foundation', () => {
    const world = rig(up('t0', [['S', 1]]))
    expect(findSequence(world, 't0', 'found-S', 1)).toEqual([
      { type: 'move', from: 't0', to: 'found-S', count: 1 },
    ])
    expect(findSequence(world, 't0', 'found-H')).toBeUndefined()
    expect(findSequence(world, 't0', 'found-D')).toBeUndefined()
    expect(findSequence(world, 't0', 'found-C')).toBeUndefined()
  })

  it('foundation: builds up in suit from the ace', () => {
    const world = rig(up('found-S', [['S', 1]]), up('t0', [['S', 2]]))
    expect(findSequence(world, 't0', 'found-S', 1)).toBeDefined()
  })

  it('foundation: wrong suit is illegal', () => {
    const world = rig(up('found-S', [['S', 1]]), up('t0', [['H', 2]]))
    expect(findSequence(world, 't0', 'found-S')).toBeUndefined()
  })

  it('foundation: skipping a rank is illegal', () => {
    const world = rig(up('found-S', [['S', 1]]), up('t0', [['S', 3]]))
    expect(findSequence(world, 't0', 'found-S')).toBeUndefined()
  })

  it('foundation → tableau: pulls appear when a spot exists, King to empty included', () => {
    const world = rig(up('found-S', [['S', 1], ['S', 2], ['S', 3]]), up('t0', [['H', 4]]))
    expect(findSequence(world, 'found-S', 't0', 1)).toEqual([
      { type: 'move', from: 'found-S', to: 't0', count: 1 },
    ])
    expect(findSequence(rig(up('found-S', [['S', 13]])), 'found-S', 't0', 1)).toBeDefined()
  })
})

// --- safeAutoMoves ----------------------------------------------------------

describe('klondike safeAutoMoves', () => {
  it('a 2 always flies to its foundation', () => {
    const world = rig(up('found-S', [['S', 1]]), up('t0', [['S', 2]]))
    expect(game.safeAutoMoves(world)).toEqual([
      { type: 'move', from: 't0', to: 'found-S', count: 1 },
    ])
  })

  it('black 5 with only one red 4 flown is legal but NOT safe → []', () => {
    const world = rig(
      up('found-S', [['S', 1], ['S', 2], ['S', 3], ['S', 4]]),
      up('found-D', [['D', 4]]),
      up('t0', [['S', 5]]),
    )
    expect(game.safeAutoMoves(world)).toEqual([])
  })

  it('black 5 with both red 4s flown IS safe', () => {
    const world = rig(
      up('found-S', [['S', 1], ['S', 2], ['S', 3], ['S', 4]]),
      up('found-D', [['D', 4]]),
      up('found-H', [['H', 4]]),
      up('t0', [['S', 5]]),
    )
    expect(game.safeAutoMoves(world)).toEqual([
      { type: 'move', from: 't0', to: 'found-S', count: 1 },
    ])
  })

  it('nothing safe → []', () => {
    expect(game.safeAutoMoves(rig(up('t0', [['D', 7]])))).toEqual([])
    expect(game.safeAutoMoves(rig())).toEqual([])
  })
})

// --- isWon -------------------------------------------------------------------

describe('klondike isWon', () => {
  const run = (suit: Suit): Spot[] =>
    Array.from({ length: 13 }, (_, i) => [suit, i + 1] as const)

  it('true only when all four foundations hold 13 cards', () => {
    const won = rig(
      up('found-S', run('S')),
      up('found-H', run('H')),
      up('found-D', run('D')),
      up('found-C', run('C')),
    )
    expect(game.isWon(won)).toBe(true)

    const almost = rig(
      up('found-S', run('S').slice(0, 12)),
      up('found-H', run('H')),
      up('found-D', run('D')),
      up('found-C', run('C')),
    )
    expect(game.isWon(almost)).toBe(false)
    expect(game.isWon(game.deal(7))).toBe(false)
  })
})

// --- replay consistency ------------------------------------------------------

describe('klondike replay consistency', () => {
  /** The last full player move in a legalMoves batch (a move + its trailing flip, if any). */
  function lastPlayerMove(moves: readonly Action[]): readonly Action[] {
    const last = moves[moves.length - 1]
    if (last.type === 'flip') return [moves[moves.length - 2], last]
    return [last]
  }

  it('scripted real moves fold to the stepwise result, composed flips included', () => {
    let sawComposed = false
    for (let seed = 0; seed < 20; seed++) {
      const start = game.deal(seed)
      let world = start
      const actions: Action[] = []
      for (let i = 0; i < 10; i++) {
        const moves = game.legalMoves(world)
        if (moves.length === 0) break
        const chosen = lastPlayerMove(moves)
        if (chosen.length === 2) sawComposed = true
        actions.push(...chosen)
        world = replay(world, chosen)
      }
      expect(actions.length).toBeGreaterThanOrEqual(10)
      expect(replay(start, actions)).toEqual(world)
    }
    // At least one scripted seed exercised a move+flip composition.
    expect(sawComposed).toBe(true)
  })
})
