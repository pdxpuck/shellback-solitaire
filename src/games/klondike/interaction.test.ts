/**
 * groupMoves + foundationMove + quickMove suite (C3 batch B double-click
 * quick-fly; v0.3.5 smartens it — foundation-first, else the unique legal
 * destination; v0.3.16 resolves ambiguity to the LEFT-MOST legal
 * destination (lowest layout column, ties → first group) and excludes stock
 * targets — recycle stays a deliberate stock click).
 * Worlds come in the two flavors the other suites use: crafted rigs built
 * with engine primitives (as in flights.test.ts) for precise grouping and
 * null-case scenarios, and real deals via klondikeDraw1.deal where a natural
 * foundation move is needed — seed 4's dealt tops are TWO foundation-playable
 * aces (t2's ♦A over 2 face-down, t6's ♣A over 6 — both groups carry a
 * trailing flip), and seed 22's first draw turns up the ♠A (waste→foundation;
 * see play.test.ts). Every expectation is a fixed seed or verified-from-deal
 * fact; nothing random.
 */

import { describe, expect, it } from 'vitest'
import type { Action, Card, PileId, Suit, World } from 'deckhand/engine'
import type { PileRole } from 'deckhand/contract'
import { cardId, createWorld, dealCards, replay } from 'deckhand/engine'
import { klondikeDraw1 as game } from './definition'
import { foundationMove, groupMoves, quickMove, type MoveGroup } from './interaction'

// --- rig helpers (mirrors flights.test.ts) -----------------------------------

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

/** Pile id → role, straight from the game definition's topology. */
const ROLES = new Map(game.piles.map((pile) => [pile.id, pile.role]))
const roleOf = (pileId: PileId): PileRole | undefined => ROLES.get(pileId)

/** Pile id → layout column, straight from the game definition's layout. */
const COLS = new Map(game.layout.map((hint) => [hint.pileId, hint.col]))
const colOf = (pileId: PileId): number => COLS.get(pileId) ?? 99

// --- groupMoves --------------------------------------------------------------

describe('groupMoves', () => {
  it('a bare move → one group carrying just that action', () => {
    const move: Extract<Action, { type: 'move' }> = { type: 'move', from: 'waste', to: 't3', count: 1 }
    expect(groupMoves([move])).toEqual([{ move, actions: [move] }])
  })

  it('a move + flip on the same source pile → ONE group with 2 actions', () => {
    const move: Extract<Action, { type: 'move' }> = { type: 'move', from: 't0', to: 't1', count: 1 }
    const flip: Extract<Action, { type: 'flip' }> = { type: 'flip', pile: 't0' }
    expect(groupMoves([move, flip])).toEqual([{ move, actions: [move, flip] }])
  })

  it('a flip NOT preceded by a matching move is ignored (never starts or joins a group)', () => {
    // Leading flip — no group at all.
    const stray: Extract<Action, { type: 'flip' }> = { type: 'flip', pile: 't5' }
    expect(groupMoves([stray])).toEqual([])
    // A preceding move on a DIFFERENT pile does not adopt it either.
    const move: Extract<Action, { type: 'move' }> = { type: 'move', from: 't0', to: 't1', count: 1 }
    expect(groupMoves([move, stray])).toEqual([{ move, actions: [move] }])
  })

  it('two independent moves → two groups', () => {
    const a: Extract<Action, { type: 'move' }> = { type: 'move', from: 'waste', to: 't3', count: 1 }
    const b: Extract<Action, { type: 'move' }> = { type: 'move', from: 't0', to: 't1', count: 1 }
    expect(groupMoves([a, b])).toEqual([
      { move: a, actions: [a] },
      { move: b, actions: [b] },
    ])
  })
})

// --- foundationMove ----------------------------------------------------------

describe('foundationMove', () => {
  it('a real deal: tableau→foundation for (from, count) returns the WHOLE group, flip included', () => {
    // Seed 4 deals the ace of diamonds atop t2 (3 cards) and the ace of
    // clubs atop t6 (7 cards): each fly exposes a face-down card, so both
    // groups compose move + flip.
    const groups = groupMoves(game.legalMoves(game.deal('4')))
    const t2 = foundationMove(groups, 't2', 1, roleOf)
    expect(t2?.move).toEqual({ type: 'move', from: 't2', to: 'found-D', count: 1 })
    expect(t2?.actions).toEqual([
      { type: 'move', from: 't2', to: 'found-D', count: 1 },
      { type: 'flip', pile: 't2' },
    ])
    const t6 = foundationMove(groups, 't6', 1, roleOf)
    expect(t6?.move).toEqual({ type: 'move', from: 't6', to: 'found-C', count: 1 })
    expect(t6?.actions).toHaveLength(2)
    expect(t6?.actions[1]).toEqual({ type: 'flip', pile: 't6' })
  })

  it('a real deal: waste→foundation after the first draw', () => {
    // Seed 22's first draw turns up the ace of spades (established fact).
    const drawn = replay(game.deal('22'), [
      { type: 'move', from: 'stock', to: 'waste', count: 1, faceUp: true },
    ])
    const groups = groupMoves(game.legalMoves(drawn))
    expect(foundationMove(groups, 'waste', 1, roleOf)?.actions).toEqual([
      { type: 'move', from: 'waste', to: 'found-S', count: 1 },
    ])
  })

  it('count mismatch → null (a real run the UI could double-click never flies)', () => {
    // Seed 4: t2's whole 3-card run is selectable in the UI, but foundation
    // moves are single-card — asking for the run must not fly its ace.
    const groups = groupMoves(game.legalMoves(game.deal('4')))
    expect(foundationMove(groups, 't2', 3, roleOf)).toBeNull()
    // Positive control: the same world DOES offer the (t2, 1) fly.
    expect(foundationMove(groups, 't2', 1, roleOf)).not.toBeNull()
  })

  it('a source whose only groups target tableaux → null', () => {
    // t0 = [H7u, S6u, H5u], t1 = [D7u]: the (t0, 2) group lands on t1 — a
    // tableau — so no foundation fly exists for it.
    const before = rig(
      up('t0', [
        ['H', 7],
        ['S', 6],
        ['H', 5],
      ]),
      up('t1', [['D', 7]]),
    )
    const groups = groupMoves(game.legalMoves(before))
    expect(groups).toHaveLength(1)
    expect(foundationMove(groups, 't0', 2, roleOf)).toBeNull()
  })

  it('a source ON a foundation → null, even though its pull move is a live group', () => {
    // found-S = [S2u], t0 = [H3u]: the standard foundation→tableau pull is
    // legal, but a double-click on a foundation card must never auto-fly it.
    const before = rig(up('found-S', [['S', 2]]), up('t0', [['H', 3]]))
    const groups = groupMoves(game.legalMoves(before))
    expect(groups).toHaveLength(1) // the pull exists — the null is not vacuous
    expect(foundationMove(groups, 'found-S', 1, roleOf)).toBeNull()
  })

  it('first match wins when multiple foundation targets share (from, count)', () => {
    // Suit-keyed foundations mean real positions offer one target per card,
    // so the ordering contract is pinned with crafted groups: the scan stops
    // at the EARLIEST matching group.
    const first: MoveGroup = {
      move: { type: 'move', from: 't0', to: 'found-H', count: 1 },
      actions: [{ type: 'move', from: 't0', to: 'found-H', count: 1 }],
    }
    const second: MoveGroup = {
      move: { type: 'move', from: 't0', to: 'found-S', count: 1 },
      actions: [{ type: 'move', from: 't0', to: 'found-S', count: 1 }],
    }
    const decoy: MoveGroup = {
      move: { type: 'move', from: 't0', to: 't1', count: 1 },
      actions: [{ type: 'move', from: 't0', to: 't1', count: 1 }],
    }
    expect(foundationMove([decoy, first, second], 't0', 1, roleOf)).toBe(first)
  })
})

// --- quickMove ---------------------------------------------------------------

describe('quickMove', () => {
  it('foundation-first: a foundation AND a tableau move on offer → the foundation group wins', () => {
    // found-H = [HA] accepts the H2 and S3 also accepts it as a tableau
    // landing — two distinct targets, and the fly must beat the shuffle.
    const before = rig(up('found-H', [['H', 1]]), up('t0', [['H', 2]]), up('t1', [['S', 3]]))
    const groups = groupMoves(game.legalMoves(before))
    expect(groups).toHaveLength(2) // both destinations are live — not vacuous
    expect(quickMove(groups, 't0', 1, roleOf, colOf)?.move).toEqual({
      type: 'move',
      from: 't0',
      to: 'found-H',
      count: 1,
    })
  })

  it('a unique tableau destination → returned', () => {
    // t0 = [H7u, S6u, H5u], t1 = [D7u]: the (t0, 2) run lands on t1 and
    // nowhere else (empty foundations take aces only; empty tableaux kings),
    // and a 2-card run never flies to a foundation.
    const before = rig(
      up('t0', [
        ['H', 7],
        ['S', 6],
        ['H', 5],
      ]),
      up('t1', [['D', 7]]),
    )
    const groups = groupMoves(game.legalMoves(before))
    expect(quickMove(groups, 't0', 2, roleOf, colOf)?.move).toEqual({
      type: 'move',
      from: 't0',
      to: 't1',
      count: 2,
    })
  })

  it('two distinct tableau destinations → the LEFT-MOST wins (lowest layout column)', () => {
    // H5 fits BOTH black sixes: (t0, 1) offers t1 (col 1) and t2 (col 2) —
    // ambiguity must not block the fly (user ruling 2026-10-15: a drawn King
    // over two empty columns flies LEFT), so the lower-column t1 lands it.
    const before = rig(up('t0', [['H', 5]]), up('t1', [['S', 6]]), up('t2', [['C', 6]]))
    const groups = groupMoves(game.legalMoves(before))
    expect(groups).toHaveLength(2) // both destinations are live — not vacuous
    expect(quickMove(groups, 't0', 1, roleOf, colOf)?.move).toEqual({
      type: 'move',
      from: 't0',
      to: 't1',
      count: 1,
    })
  })

  it('zero matching groups → null', () => {
    // Seed 4: only (t2, 1) flies — asking for the 3-card run matches nothing.
    const groups = groupMoves(game.legalMoves(game.deal('4')))
    expect(quickMove(groups, 't2', 3, roleOf, colOf)).toBeNull()
  })

  it('a source ON a foundation → null, even though a unique pull-back is live', () => {
    // found-S = [S2u], t0 = [H3u]: the pull is the only group, but a
    // double-click on a foundation card must never auto-move it.
    const before = rig(up('found-S', [['S', 2]]), up('t0', [['H', 3]]))
    const groups = groupMoves(game.legalMoves(before))
    expect(groups).toHaveLength(1) // the pull exists — the null is not vacuous
    expect(quickMove(groups, 'found-S', 1, roleOf, colOf)).toBeNull()
  })

  it('duplicate groups pointing at the SAME destination → returned (unique target, not unique group)', () => {
    // Real positions offer one group per target, so duplicates are crafted
    // (mirrors foundationMove's ordering pin): both candidates share one
    // destination, and the FIRST group wins.
    const first: MoveGroup = {
      move: { type: 'move', from: 't0', to: 't1', count: 1 },
      actions: [{ type: 'move', from: 't0', to: 't1', count: 1 }],
    }
    const second: MoveGroup = {
      move: { type: 'move', from: 't0', to: 't1', count: 1 },
      actions: [{ type: 'move', from: 't0', to: 't1', count: 1 }],
    }
    expect(quickMove([first, second], 't0', 1, roleOf, colOf)).toBe(first)
  })

  it('a stock destination is NEVER auto-chosen, even when it is the left-most column', () => {
    // Crafted (real layout: stock col 0, t3 col 3): a single-card waste with
    // an empty stock makes the recycle (waste→stock, count 1) a LIVE
    // candidate for the same (from, count) as a tableau landing — yet the
    // stock must lose (recycling is a deliberate stock click), left-most or
    // not. The recycle is listed FIRST to prove ordering does not rescue it.
    const recycle: MoveGroup = {
      move: { type: 'move', from: 'waste', to: 'stock', count: 1, faceUp: false, reverse: true },
      actions: [{ type: 'move', from: 'waste', to: 'stock', count: 1, faceUp: false, reverse: true }],
    }
    const tableau: MoveGroup = {
      move: { type: 'move', from: 'waste', to: 't3', count: 1 },
      actions: [{ type: 'move', from: 'waste', to: 't3', count: 1 }],
    }
    expect(quickMove([recycle, tableau], 'waste', 1, roleOf, colOf)).toBe(tableau)
  })

  it('two destinations on the SAME column → the FIRST group in order wins (deterministic tie-break)', () => {
    // Real layout: waste and t1 both sit on col 1 — the crafted draw
    // (stock→waste) and tableau landing (stock→t1) tie on column, so the
    // scan order decides, not the pile. Both orders pinned: first group wins.
    const draw: MoveGroup = {
      move: { type: 'move', from: 'stock', to: 'waste', count: 1, faceUp: true },
      actions: [{ type: 'move', from: 'stock', to: 'waste', count: 1, faceUp: true }],
    }
    const landing: MoveGroup = {
      move: { type: 'move', from: 'stock', to: 't1', count: 1 },
      actions: [{ type: 'move', from: 'stock', to: 't1', count: 1 }],
    }
    expect(quickMove([draw, landing], 'stock', 1, roleOf, colOf)).toBe(draw)
    expect(quickMove([landing, draw], 'stock', 1, roleOf, colOf)).toBe(landing)
  })
})
