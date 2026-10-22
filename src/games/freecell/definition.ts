/**
 * FreeCell — rules/logic game module. No UI.
 *
 * Rules (locked with the user 2026-10-22; digest at docs/FREECELL_RULES.md —
 * Wikipedia "FreeCell", revision 1372643794, supermove formula citing
 * boardgames stackexchange 45157):
 * - Deal (DC1): all 52 cards dealt FACE-UP, row-wise onto eight cascades —
 *   card i of the shuffled deck lands on cascade i mod 8 (7-7-7-7-6-6-6-6).
 *   No stock, no waste — and NOTHING is ever face-down after the deal.
 * - Cells (DC3): max 1 card each; any card plays to any empty cell; cell
 *   cards play to cascades or foundations freely.
 * - Foundations: suit-keyed (found-S/H/D/C), ace → king, no wrap. ONE-WAY
 *   (DC6): cards never come back off a foundation — legalMoves enumerates
 *   no move FROM a foundation at all.
 * - Tableau: builds DOWN in alternating colors, rank EXACTLY one lower, no
 *   wrap. EMPTY cascades accept ANY card or run head (DC4 — no King rule).
 * - Supermoves (DC2): any descending alternating-color run moves whole,
 *   judged at the destination by the run's bottom card. Capacity is
 *   C = 2^M × (N + 1), with M = empty cascades and N = empty cells counted
 *   BEFORE the move; an EMPTY destination excludes itself from M (it cannot
 *   serve as its own intermediate — the classic C/2 half).
 * - No cell→cell enumeration (DC7): legal under the raw rules but excluded
 *   from legalMoves — the enumeration drives click UX, quick-move, and
 *   hints, and a cell→cell entry would make single-tap quick-move waste a
 *   tap shuffling cards between cells.
 * - Safe auto-fly (DC5): the classic safety rule — a card of rank r may
 *   auto-fly to its foundation iff r ≤ min(opposite-color foundation
 *   ranks) + 1, an empty foundation counting as rank 0 (aces are therefore
 *   always safe; a 2 needs both opposite-color aces up). Candidates: cell
 *   tops, then cascade tops; plain single moves, batch-all (suit-keyed
 *   foundations never compete — play.ts's fixpoint picks up the
 *   newly-exposed tops).
 * - NO flip composition: nothing is face-down post-deal and no move ever
 *   turns a card, so every emitted action is a plain {type:'move'} — no
 *   faceUp, no flips, no reverse.
 * - Won when all four foundations hold 13 cards.
 *
 * `legalMoves` enumerates EVERY legal player move EXCEPT cell→cell (DC7) —
 * the single source of truth for the click-click UX and hint search.
 * Deterministic emit order:
 *   1. cell tops → foundations, sources cell-0..cell-3;
 *   2. cascade tops → foundations, sources t0..t7;
 *   3. cascade tops → each EMPTY cell, cascades t0..t7 outer, cells inner;
 *   4. cell tops → cascades, cells cell-0..cell-3 outer, targets t0..t7 inner;
 *   5. cascade → cascade runs: sources t0..t7; within a source, run starts
 *      k walk from the TOP (count 1) downward and STOP at the first broken
 *      pair (every deeper start contains it); for each start, targets
 *      t0..t7 ≠ source, requiring the run bottom to build on the target AND
 *      count ≤ supermoveCapacity(world, target).
 */

import type { Action, Card, PileCard, PileId, Seed, Suit, World } from 'deckhand/engine'
import {
  STANDARD,
  SUITS,
  EngineError,
  buildDeck,
  createRng,
  createWorld,
  dealCards,
  shuffle,
  topCard,
} from 'deckhand/engine'
import type { GameDefinition } from 'deckhand/contract'
import { getGame } from '../registry'

const CELLS: readonly PileId[] = ['cell-0', 'cell-1', 'cell-2', 'cell-3']
const TABLEAU_IDS: readonly PileId[] = ['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7']
const FOUNDATION_IDS: readonly PileId[] = ['found-S', 'found-H', 'found-D', 'found-C']

/** The suit-keyed foundation pile for each suit. */
const FOUNDATION_OF: Record<Suit, PileId> = {
  S: 'found-S',
  H: 'found-H',
  D: 'found-D',
  C: 'found-C',
}

const PILE_IDS: readonly PileId[] = [...CELLS, ...FOUNDATION_IDS, ...TABLEAU_IDS]

/** Red suits for the alternating-color build rule — game semantics live here, not in the engine. */
const RED_SUITS: ReadonlySet<Suit> = new Set<Suit>(['H', 'D'])

function isRed(suit: Suit): boolean {
  return RED_SUITS.has(suit)
}

/** Rank accessor — total over jokers (impossible in a STANDARD deck), lint-clean over `number | null`. */
function rankOf(card: Card): number {
  if (card.rank === null) throw new EngineError(`Card ${card.id} has no rank`)
  return card.rank
}

/** Suit accessor — total over jokers (impossible in a STANDARD deck). */
function suitOf(card: Card): Suit {
  if (card.suit === null) throw new EngineError(`Card ${card.id} has no suit`)
  return card.suit
}

/** Foundation rule: only its own suit; empty accepts the ace, else rank = top + 1. */
function canDropOnFoundation(world: World, foundation: PileId, card: Card): boolean {
  if (FOUNDATION_OF[suitOf(card)] !== foundation) return false
  const top = topCard(world, foundation)
  if (!top) return rankOf(card) === 1
  return suitOf(top.card) === suitOf(card) && rankOf(card) === rankOf(top.card) + 1
}

/** Tableau rule: empty accepts ANY card (DC4); else face-up top, opposite color, rank one lower. */
function canDropOnTableau(world: World, target: PileId, card: Card): boolean {
  const top = topCard(world, target)
  if (!top) return true
  if (!top.faceUp) return false
  return isRed(suitOf(top.card)) !== isRed(suitOf(card)) && rankOf(card) === rankOf(top.card) - 1
}

/**
 * The run cards[k..end]: descending, alternating colors (DC2 — FreeCell's
 * face-up cards are NOT automatically sequenced). A single card is always a
 * valid run.
 */
function runValidFrom(cards: readonly PileCard[], k: number): boolean {
  for (let i = k; i < cards.length - 1; i++) {
    const upper = cards[i].card
    const lower = cards[i + 1].card
    if (isRed(suitOf(upper)) === isRed(suitOf(lower))) return false
    if (rankOf(lower) !== rankOf(upper) - 1) return false
  }
  return true
}

/**
 * Supermove capacity (DC2): C = 2^M × (N + 1), N = empty cells, M = empty
 * cascades EXCLUDING the target when the target itself is empty — that
 * exclusion IS the classic C/2 half (the destination cannot serve as its
 * own intermediate).
 */
function supermoveCapacity(world: World, target: PileId): number {
  const emptyCells = CELLS.filter((cell) => world.piles[cell].cards.length === 0).length
  const emptyCascades = TABLEAU_IDS.filter(
    (pile) => pile !== target && world.piles[pile].cards.length === 0,
  ).length
  return 2 ** emptyCascades * (emptyCells + 1)
}

/**
 * DC5 safety rule: rank r is safe iff r ≤ min(opposite-color foundation
 * ranks) + 1, an empty foundation counting as rank 0.
 */
function isSafeToAutoFly(world: World, card: Card): boolean {
  const red = isRed(suitOf(card))
  let minOpposite = 13
  for (const suit of SUITS) {
    if (isRed(suit) === red) continue
    const top = topCard(world, FOUNDATION_OF[suit])
    const rank = top ? rankOf(top.card) : 0
    if (rank < minOpposite) minOpposite = rank
  }
  return rankOf(card) <= minOpposite + 1
}

export const freecell: GameDefinition = {
  meta: { ...getGame('freecell') },

  deckSpec: STANDARD,

  piles: [
    ...CELLS.map((id) => ({ id, role: 'cell' as const })),
    ...FOUNDATION_IDS.map((id) => ({ id, role: 'foundation' as const })),
    ...TABLEAU_IDS.map((id) => ({ id, role: 'tableau' as const })),
  ],

  deal(seed: Seed): World {
    const deck = shuffle(buildDeck(STANDARD), createRng(seed))
    let world = createWorld(PILE_IDS)
    // DC1: row-wise — card i of the shuffled deck lands on cascade i mod 8;
    // every card face-up, cells and foundations empty.
    for (let i = 0; i < 52; i++) {
      world = dealCards(world, TABLEAU_IDS[i % 8], deck.slice(i, i + 1), true)
    }
    return world
  },

  legalMoves(world: World): readonly Action[] {
    const moves: Action[] = []

    // (1) Cell tops → foundations.
    for (const cell of CELLS) {
      const top = topCard(world, cell)
      if (!top) continue
      const foundation = FOUNDATION_OF[suitOf(top.card)]
      if (canDropOnFoundation(world, foundation, top.card)) {
        moves.push({ type: 'move', from: cell, to: foundation, count: 1 })
      }
    }

    // (2) Cascade tops → foundations.
    for (const pile of TABLEAU_IDS) {
      const top = topCard(world, pile)
      if (!top) continue
      const foundation = FOUNDATION_OF[suitOf(top.card)]
      if (canDropOnFoundation(world, foundation, top.card)) {
        moves.push({ type: 'move', from: pile, to: foundation, count: 1 })
      }
    }

    // (3) Cascade tops → each EMPTY cell (DC3).
    for (const pile of TABLEAU_IDS) {
      const top = topCard(world, pile)
      if (!top) continue
      for (const cell of CELLS) {
        if (world.piles[cell].cards.length === 0) {
          moves.push({ type: 'move', from: pile, to: cell, count: 1 })
        }
      }
    }

    // (4) Cell tops → cascades (DC3; DC4 lets any card open an empty cascade).
    for (const cell of CELLS) {
      const top = topCard(world, cell)
      if (!top) continue
      for (const target of TABLEAU_IDS) {
        if (canDropOnTableau(world, target, top.card)) {
          moves.push({ type: 'move', from: cell, to: target, count: 1 })
        }
      }
    }

    // (5) Cascade → cascade runs. Starts walk from the TOP downward and stop
    // at the first broken pair — every deeper start contains it.
    for (const source of TABLEAU_IDS) {
      const cards = world.piles[source].cards
      if (cards.length === 0) continue
      for (let k = cards.length - 1; k >= 0; k--) {
        if (!runValidFrom(cards, k)) break
        const runBottom = cards[k].card
        const count = cards.length - k
        for (const target of TABLEAU_IDS) {
          if (target === source) continue
          if (!canDropOnTableau(world, target, runBottom)) continue
          if (count > supermoveCapacity(world, target)) continue
          moves.push({ type: 'move', from: source, to: target, count })
        }
      }
    }

    return moves
  },

  isWon(world: World): boolean {
    return FOUNDATION_IDS.every((foundation) => world.piles[foundation].cards.length === 13)
  },

  /**
   * DC5 safe auto-fly: cell tops then cascade tops, flown when legal AND
   * safe. Batch-all plain single moves — the fixpoint in play.ts reapplies
   * as newly-exposed tops become safe.
   */
  safeAutoMoves(world: World): readonly Action[] {
    const moves: Action[] = []
    const candidates: Array<{ from: PileId; card: Card }> = []
    for (const cell of CELLS) {
      const top = topCard(world, cell)
      if (top) candidates.push({ from: cell, card: top.card })
    }
    for (const pile of TABLEAU_IDS) {
      const top = topCard(world, pile)
      if (top) candidates.push({ from: pile, card: top.card })
    }
    for (const { from, card } of candidates) {
      const foundation = FOUNDATION_OF[suitOf(card)]
      if (!canDropOnFoundation(world, foundation, card)) continue
      if (!isSafeToAutoFly(world, card)) continue
      moves.push({ type: 'move', from, to: foundation, count: 1 })
    }
    return moves
  },

  layout: [
    ...CELLS.map((pileId, col) => ({ pileId, row: 0, col, fan: 'none' as const })),
    { pileId: 'found-S', row: 0, col: 4, fan: 'none' },
    { pileId: 'found-H', row: 0, col: 5, fan: 'none' },
    { pileId: 'found-D', row: 0, col: 6, fan: 'none' },
    { pileId: 'found-C', row: 0, col: 7, fan: 'none' },
    ...TABLEAU_IDS.map((pileId, col) => ({ pileId, row: 1, col, fan: 'down' as const })),
  ],
}
