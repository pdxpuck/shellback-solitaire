/**
 * FreeCell pure-logic suite. Crafted worlds are built with engine
 * primitives (createWorld/dealCards) — small deterministic rigs, no random
 * deals except where the spec calls for one. FreeCell deals everything
 * face-up and nothing is ever turned, so rigs carry face-up cards only.
 */

import { describe, expect, it } from 'vitest'
import type { Action, Card, Suit, World } from 'deckhand/engine'
import { cardId, createWorld, dealCards, replay } from 'deckhand/engine'
import { freecell as game } from './definition'

// --- rig helpers -----------------------------------------------------------

const PILE_IDS = [
  'cell-0',
  'cell-1',
  'cell-2',
  'cell-3',
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
  't7',
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

const isMove = (a: Action, from: string, to: string): boolean =>
  a.type === 'move' && a.from === from && a.to === to

/**
 * The single move action from→to (FreeCell composes no flips), as
 * legalMoves enumerates it. Undefined when no such move exists.
 */
function findMove(world: World, from: string, to: string, count?: number): Action | undefined {
  return game.legalMoves(world).find(
    (a) => isMove(a, from, to) && (count === undefined || (a.type === 'move' && a.count === count)),
  )
}

// --- deal ------------------------------------------------------------------

describe('freecell deal', () => {
  it('same seed → JSON-identical worlds', () => {
    expect(JSON.stringify(game.deal('seed-a'))).toBe(JSON.stringify(game.deal('seed-a')))
  })

  it('different seeds → different worlds (almost surely)', () => {
    expect(JSON.stringify(game.deal(1))).not.toBe(JSON.stringify(game.deal(2)))
  })

  it('counts exactly [7,7,7,7,6,6,6,6]; cells/foundations empty; 52 distinct cards, ALL face-up', () => {
    const world = game.deal(42)
    for (const cell of ['cell-0', 'cell-1', 'cell-2', 'cell-3']) {
      expect(world.piles[cell].cards, cell).toHaveLength(0)
    }
    for (const foundation of ['found-S', 'found-H', 'found-D', 'found-C']) {
      expect(world.piles[foundation].cards, foundation).toHaveLength(0)
    }
    const counts = ['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7'].map(
      (id) => world.piles[id].cards.length,
    )
    expect(counts).toEqual([7, 7, 7, 7, 6, 6, 6, 6])
    const all = Object.values(world.piles).flatMap((pile) => pile.cards)
    expect(all).toHaveLength(52)
    expect(all.every((pc) => pc.faceUp)).toBe(true)
    const ids = all.map((pc) => pc.card.id)
    expect(new Set(ids).size).toBe(52)
  })
})

// --- legalMoves: foundations -------------------------------------------------

describe('freecell legalMoves — foundations', () => {
  it('suit-keyed: the next rank lands only on its OWN foundation', () => {
    const world = rig(up('found-H', [['H', 7]]), up('t0', [['H', 8]]), up('t1', [['S', 8]]))
    expect(findMove(world, 't0', 'found-H', 1)).toEqual({
      type: 'move',
      from: 't0',
      to: 'found-H',
      count: 1,
    })
    expect(findMove(world, 't1', 'found-H')).toBeUndefined() // wrong suit
    expect(findMove(world, 't1', 'found-S')).toBeUndefined() // found-S is empty and wants an ace
  })

  it('an empty foundation accepts only the ace of its suit', () => {
    const world = rig(up('t0', [['D', 1]]), up('t1', [['D', 5]]))
    expect(findMove(world, 't0', 'found-D', 1)).toEqual({
      type: 'move',
      from: 't0',
      to: 'found-D',
      count: 1,
    })
    expect(findMove(world, 't1', 'found-D')).toBeUndefined() // not an ace
  })

  it('builds rank+1 in suit; a skipped rank is illegal', () => {
    const world = rig(up('found-H', [['H', 7]]), up('t0', [['H', 9]]))
    expect(findMove(world, 't0', 'found-H')).toBeUndefined() // 9 skips 8
  })

  it('no wrap: an ace never lands on a king', () => {
    const world = rig(up('found-S', [['S', 13]]), up('t0', [['S', 1]]))
    expect(findMove(world, 't0', 'found-S')).toBeUndefined()
  })

  it('DC6: foundations are one-way — no pull is enumerated even when the tableau would accept', () => {
    const world = rig(up('found-S', [['S', 5], ['S', 6]]), up('t0', [['H', 7]]))
    // 6♠ fits 7♥ under the bare tableau rule — the lock forbids the pull.
    expect(findMove(world, 'found-S', 't0')).toBeUndefined()
    // Empty cascades and cells take nothing from a foundation either.
    expect(findMove(world, 'found-S', 't2')).toBeUndefined()
    expect(findMove(world, 'found-S', 'cell-0')).toBeUndefined()
  })
})

// --- legalMoves: tableau -----------------------------------------------------

describe('freecell legalMoves — tableau', () => {
  it('builds down in alternating color, rank exactly one lower', () => {
    expect(findMove(rig(up('t0', [['S', 7]]), up('t1', [['H', 6]])), 't1', 't0', 1)).toEqual({
      type: 'move',
      from: 't1',
      to: 't0',
      count: 1,
    })
    expect(findMove(rig(up('t0', [['S', 7]]), up('t1', [['C', 6]])), 't1', 't0')).toBeUndefined() // same color
    expect(findMove(rig(up('t0', [['S', 7]]), up('t1', [['H', 8]])), 't1', 't0')).toBeUndefined() // wrong rank
  })

  it('DC4: an EMPTY cascade accepts ANY card — no King restriction', () => {
    // 5♥ is no king, yet the empty t2 takes it.
    expect(findMove(rig(up('t0', [['H', 5]])), 't0', 't2', 1)).toEqual({
      type: 'move',
      from: 't0',
      to: 't2',
      count: 1,
    })
  })
})

// --- legalMoves: cells -------------------------------------------------------

describe('freecell legalMoves — cells', () => {
  it('a cascade top plays to EVERY empty cell', () => {
    const world = rig(up('t0', [['S', 7]]))
    for (const cell of ['cell-0', 'cell-1', 'cell-2', 'cell-3']) {
      expect(findMove(world, 't0', cell, 1), cell).toEqual({
        type: 'move',
        from: 't0',
        to: cell,
        count: 1,
      })
    }
  })

  it('full cells reject a cascade top', () => {
    const world = rig(
      up('cell-0', [['S', 13]]),
      up('cell-1', [['H', 13]]),
      up('cell-2', [['D', 13]]),
      up('cell-3', [['C', 13]]),
      up('t0', [['S', 7]]),
    )
    for (const cell of ['cell-0', 'cell-1', 'cell-2', 'cell-3']) {
      expect(findMove(world, 't0', cell), cell).toBeUndefined()
    }
  })

  it('a cell card plays to a cascade', () => {
    const world = rig(up('cell-0', [['D', 5]]), up('t0', [['S', 6]]))
    expect(findMove(world, 'cell-0', 't0', 1)).toEqual({
      type: 'move',
      from: 'cell-0',
      to: 't0',
      count: 1,
    })
  })

  it('DC7: cell→cell is NEVER enumerated — not to an empty cell, not to an occupied one', () => {
    const world = rig(up('cell-0', [['D', 5]]), up('cell-1', [['H', 1]]))
    expect(findMove(world, 'cell-0', 'cell-2')).toBeUndefined() // empty cell
    expect(findMove(world, 'cell-0', 'cell-1')).toBeUndefined() // occupied cell
  })
})

// --- legalMoves: supermoves --------------------------------------------------

describe('freecell legalMoves — supermoves (DC2)', () => {
  it('a valid alternating run moves whole, judged by its bottom card', () => {
    const world = rig(up('t0', [['H', 9], ['S', 8]]), up('t1', [['C', 10]]))
    const run = findMove(world, 't0', 't1', 2)
    expect(run).toEqual({ type: 'move', from: 't0', to: 't1', count: 2 })
    if (!run) throw new Error('unreachable')
    const played = replay(world, [run])
    expect(played.piles.t1.cards.map((pc) => pc.card.id)).toEqual(['C10', 'H9', 'S8'])
    expect(played.piles.t0.cards).toHaveLength(0)
  })

  it('a non-sequenced face-up pair is rejected; enumeration stops at the first broken pair', () => {
    // t0: ♥9+♦8 are both RED — the pair is broken, so no count-2 run exists.
    const broken = rig(up('t0', [['H', 9], ['D', 8]]), up('t1', [['C', 10]]))
    expect(findMove(broken, 't0', 't1', 2)).toBeUndefined()
    expect(findMove(broken, 't0', 't1', 1)).toBeUndefined() // ♦8 alone doesn't fit ♣10 either
    // t3: the pair (♣11, ♥9) is broken; every deeper start contains it, so
    // only the starts ABOVE the break enumerate — count 3 never appears.
    const deepBreak = rig(up('t3', [['C', 11], ['H', 9], ['S', 8]]), up('t1', [['C', 10]]))
    expect(findMove(deepBreak, 't3', 't1', 3)).toBeUndefined()
    expect(findMove(deepBreak, 't3', 't1', 2)).toBeDefined() // ♥9+♠8, above the break
  })

  it('capacity C = 2^M × (N+1): N=0, M=2 → C=4 — len-4 to a non-empty cascade lands, len-5 does not', () => {
    const world = rig(
      up('cell-0', [['S', 13]]),
      up('cell-1', [['H', 13]]),
      up('cell-2', [['D', 13]]),
      up('cell-3', [['C', 13]]),
      up('t0', [['S', 7], ['D', 6], ['C', 5], ['H', 4], ['S', 3]]),
      up('t1', [['H', 8]]),
      up('t2', [['C', 7]]),
      up('t3', [['H', 2]]),
      up('t4', [['D', 2]]),
      up('t5', [['C', 2]]),
      // t6, t7 empty → M = 2 for any non-empty target.
    )
    // ♦6-led run (4 cards) onto ♣7: fits, and 4 ≤ C = 2² × (0+1) = 4 → ACCEPTED.
    expect(findMove(world, 't0', 't2', 4)).toEqual({ type: 'move', from: 't0', to: 't2', count: 4 })
    // ♠7-led run (5 cards) onto ♥8: fits, but 5 > 4 → REJECTED.
    expect(findMove(world, 't0', 't1', 5)).toBeUndefined()
  })

  it('an EMPTY destination halves capacity: same rig → C/2 = 2 — len-2 lands, len-3 does not', () => {
    const world = rig(
      up('cell-0', [['S', 13]]),
      up('cell-1', [['H', 13]]),
      up('cell-2', [['D', 13]]),
      up('cell-3', [['C', 13]]),
      up('t0', [['S', 7], ['D', 6], ['C', 5], ['H', 4], ['S', 3]]),
      up('t1', [['H', 8]]),
      up('t2', [['C', 7]]),
      up('t3', [['H', 2]]),
      up('t4', [['D', 2]]),
      up('t5', [['C', 2]]),
      // t6, t7 empty.
    )
    // Onto EMPTY t6 the destination cannot serve as its own intermediate:
    // M excludes t6 → capacity 2¹ × (0+1) = 2.
    expect(findMove(world, 't0', 't6', 2)).toEqual({ type: 'move', from: 't0', to: 't6', count: 2 })
    expect(findMove(world, 't0', 't6', 3)).toBeUndefined()
  })

  it('capacity with every cell empty: N=4, M=0 → N+1 = 5 — len-5 lands, len-6 does not', () => {
    const world = rig(
      up('t0', [['S', 7], ['D', 6], ['C', 5], ['H', 4], ['S', 3], ['D', 2]]),
      up('t1', [['H', 8]]),
      up('t2', [['C', 7]]),
      up('t3', [['H', 2]]),
      up('t4', [['D', 2]]),
      up('t5', [['C', 2]]),
      up('t6', [['S', 2]]),
      up('t7', [['H', 3]]),
      // All four cells empty → N = 4; no empty cascades → M = 0.
    )
    // ♦6-led run (5 cards) onto ♣7: fits, and 5 ≤ 2⁰ × (4+1) = 5 → ACCEPTED.
    expect(findMove(world, 't0', 't2', 5)).toEqual({ type: 'move', from: 't0', to: 't2', count: 5 })
    // ♠7-led run (6 cards) onto ♥8: fits, but 6 > 5 → REJECTED.
    expect(findMove(world, 't0', 't1', 6)).toBeUndefined()
  })
})

// --- emit order --------------------------------------------------------------

describe('freecell legalMoves — emit order', () => {
  it('emits the full array in the documented class order: 1 cells→found, 2 cascades→found, 3 cascades→empty cells, 4 cells→cascades, 5 runs', () => {
    // Position: cell-0 ♦5, cell-1 ♥1, cell-2 ♣13, cell-3 EMPTY;
    // found-S ♠1; t0 ♠2, t1 ♥4, t2 [♦10 ♠9], t3 ♣11, t4 ♦7, t5 ♥13, t6 ♠5, t7 EMPTY.
    const world = rig(
      up('cell-0', [['D', 5]]),
      up('cell-1', [['H', 1]]),
      up('cell-2', [['C', 13]]),
      up('found-S', [['S', 1]]),
      up('t0', [['S', 2]]),
      up('t1', [['H', 4]]),
      up('t2', [['D', 10], ['S', 9]]),
      up('t3', [['C', 11]]),
      up('t4', [['D', 7]]),
      up('t5', [['H', 13]]),
      up('t6', [['S', 5]]),
    )
    expect(game.legalMoves(world)).toEqual([
      // (1) cell tops → foundations: the ♥1 ace is the only flier.
      { type: 'move', from: 'cell-1', to: 'found-H', count: 1 },
      // (2) cascade tops → foundations: ♠2 onto ♠1.
      { type: 'move', from: 't0', to: 'found-S', count: 1 },
      // (3) cascade tops → the one EMPTY cell (cell-3), t0..t6.
      { type: 'move', from: 't0', to: 'cell-3', count: 1 },
      { type: 'move', from: 't1', to: 'cell-3', count: 1 },
      { type: 'move', from: 't2', to: 'cell-3', count: 1 },
      { type: 'move', from: 't3', to: 'cell-3', count: 1 },
      { type: 'move', from: 't4', to: 'cell-3', count: 1 },
      { type: 'move', from: 't5', to: 'cell-3', count: 1 },
      { type: 'move', from: 't6', to: 'cell-3', count: 1 },
      // (4) cell tops → cascades, c0..c2 outer, t0..t7 inner (t7 is EMPTY).
      { type: 'move', from: 'cell-0', to: 't7', count: 1 },
      { type: 'move', from: 'cell-1', to: 't0', count: 1 }, // ♥1 on ♠2
      { type: 'move', from: 'cell-1', to: 't7', count: 1 },
      { type: 'move', from: 'cell-2', to: 't7', count: 1 },
      // (5) cascade → cascade runs, sources t0..t6 (t7 is empty).
      { type: 'move', from: 't0', to: 't7', count: 1 },
      { type: 'move', from: 't1', to: 't6', count: 1 }, // ♥4 on ♠5
      { type: 'move', from: 't1', to: 't7', count: 1 },
      { type: 'move', from: 't2', to: 't7', count: 1 }, // ♠9 alone
      { type: 'move', from: 't2', to: 't3', count: 2 }, // ♦10+♠9 onto ♣11
      { type: 'move', from: 't2', to: 't7', count: 2 },
      { type: 'move', from: 't3', to: 't7', count: 1 },
      { type: 'move', from: 't4', to: 't7', count: 1 },
      { type: 'move', from: 't5', to: 't7', count: 1 },
      { type: 'move', from: 't6', to: 't7', count: 1 },
    ])
  })
})

// --- isWon -------------------------------------------------------------------

describe('freecell isWon', () => {
  const run = (suit: Suit): Spot[] => Array.from({ length: 13 }, (_, i) => [suit, i + 1] as const)

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

// --- safeAutoMoves -----------------------------------------------------------

describe('freecell safeAutoMoves (DC5)', () => {
  it('an ace always flies — from a cascade AND from a cell', () => {
    expect(game.safeAutoMoves(rig(up('t0', [['S', 1]])))).toEqual([
      { type: 'move', from: 't0', to: 'found-S', count: 1 },
    ])
    expect(game.safeAutoMoves(rig(up('cell-0', [['H', 1]])))).toEqual([
      { type: 'move', from: 'cell-0', to: 'found-H', count: 1 },
    ])
  })

  it('a 2 flies only when BOTH opposite-color aces are up', () => {
    const black2 = up('t0', [['S', 2]])
    const legalSpot = up('found-S', [['S', 1]]) // ♠1 must be up for the ♠2 fly to be legal at all
    expect(game.safeAutoMoves(rig(legalSpot, black2))).toEqual([]) // no red aces up
    expect(game.safeAutoMoves(rig(legalSpot, up('found-H', [['H', 1]]), black2))).toEqual([]) // one of two
    expect(
      game.safeAutoMoves(
        rig(legalSpot, up('found-H', [['H', 1]]), up('found-D', [['D', 1]]), black2),
      ),
    ).toEqual([{ type: 'move', from: 't0', to: 'found-S', count: 1 }])
  })

  it('a mid-rank card that is LEGAL to fly but unsafe stays put', () => {
    // ♠5: the red 4s — ♦4 flown, ♥4 not. min(opposite) = 3 → 5 > 3 + 1 → stays.
    const world = rig(
      up('found-S', [['S', 1], ['S', 2], ['S', 3], ['S', 4]]),
      up('found-D', [['D', 1], ['D', 2], ['D', 3], ['D', 4]]),
      up('found-H', [['H', 1], ['H', 2], ['H', 3]]),
      up('t0', [['S', 5]]),
    )
    expect(game.safeAutoMoves(world)).toEqual([])
    // …yet the move itself is legal — only the safety gate holds it back.
    expect(findMove(world, 't0', 'found-S')).toBeDefined()
  })

  it('batch-all: every safe flight emits, cell tops before cascade tops', () => {
    const world = rig(up('cell-0', [['D', 1]]), up('t0', [['C', 1]]))
    expect(game.safeAutoMoves(world)).toEqual([
      { type: 'move', from: 'cell-0', to: 'found-D', count: 1 },
      { type: 'move', from: 't0', to: 'found-C', count: 1 },
    ])
  })
})
