/**
 * Klondike (Draw-1) — rules/logic game module. No UI.
 *
 * Rules (locked with the user 2026-10-13):
 * - Draw-1 from stock onto the waste; unlimited redeals.
 * - Recycle: stock empty + waste nonempty → ONE reverse move action of the
 *   whole waste pile back to the stock, face down — the physical flip-over,
 *   so the same draw sequence repeats each cycle, matching standard
 *   implementations (user-approved update to the 2026-10-13 rulesheet,
 *   which originally specified an order-preserving move).
 * - Tableau builds DOWN in alternating colors; any face-up run moves together
 *   (legality is judged at the destination, by the run's bottom card); only
 *   Kings land on empty piles.
 * - Foundations are suit-keyed, ace → king, no wrap; foundation → tableau
 *   pulls are allowed (standard).
 * - A move that leaves a tableau pile whose new top is face-down composes a
 *   flip action after the move.
 * - Safe auto-fly uses the classic safety rule: rank ≤ 2 is always safe;
 *   rank r is safe iff BOTH opposite-color rank-(r-1) cards are already on
 *   their foundations.
 * - Won when all four foundations hold 13 cards. No scoring.
 *
 * `legalMoves` enumerates EVERY legal player move — the single source of
 * truth for the future click-click UX and hint search. Deterministic emit
 * order: draws/recycle, foundation moves (waste→foundation, then
 * tableau→foundation, then foundation→tableau), then tableau moves
 * (waste→tableau, then run→tableau by source pile t0..t6, top-run first,
 * destinations t0..t6).
 */

import type { Action, Card, PileId, Seed, Suit, World } from 'deckhand/engine'
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

const TABLEAU_IDS: readonly PileId[] = ['t0', 't1', 't2', 't3', 't4', 't5', 't6']
const FOUNDATION_IDS: readonly PileId[] = ['found-S', 'found-H', 'found-D', 'found-C']

/** The suit-keyed foundation pile for each suit. */
const FOUNDATION_OF: Record<Suit, PileId> = {
  S: 'found-S',
  H: 'found-H',
  D: 'found-D',
  C: 'found-C',
}

const PILE_IDS: readonly PileId[] = ['stock', 'waste', ...FOUNDATION_IDS, ...TABLEAU_IDS]

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

/** Tableau rule: empty accepts a King only; else face-up top, opposite color, rank one lower. */
function canDropOnTableau(world: World, target: PileId, card: Card): boolean {
  const top = topCard(world, target)
  if (!top) return rankOf(card) === 13
  if (!top.faceUp) return false
  return isRed(suitOf(top.card)) !== isRed(suitOf(card)) && rankOf(card) === rankOf(top.card) - 1
}

/**
 * A tableau move plus a flip when it exposes a face-down card: if the pile
 * keeps a card beneath the moved run and that card is face-down, the flip
 * action follows the move.
 */
function movePlusFlip(world: World, from: PileId, to: PileId, count: number): Action[] {
  const actions: Action[] = [{ type: 'move', from, to, count }]
  const cards = world.piles[from].cards
  if (cards.length > count && !cards[cards.length - count - 1].faceUp) {
    actions.push({ type: 'flip', pile: from })
  }
  return actions
}

/**
 * Classic safety rule: rank ≤ 2 always safe; otherwise both opposite-color
 * rank-(r-1) cards must already sit on their foundations. Foundations are
 * suit-pure and sequential in reachable states, so "on the foundation" is
 * checked by membership (keeps crafted rigs honest too).
 */
function isSafeToAutoFly(world: World, card: Card): boolean {
  const rank = rankOf(card)
  if (rank <= 2) return true
  const red = isRed(suitOf(card))
  for (const suit of SUITS) {
    if (isRed(suit) === red) continue
    const foundation = world.piles[FOUNDATION_OF[suit]].cards
    const needed = rank - 1
    const flown = foundation.some((pc) => pc.card.suit === suit && pc.card.rank === needed)
    if (!flown) return false
  }
  return true
}

export const klondikeDraw1: GameDefinition = {
  meta: { ...getGame('klondike'), id: 'klondike-draw1' },

  deckSpec: STANDARD,

  piles: [
    { id: 'stock', role: 'stock' },
    { id: 'waste', role: 'waste' },
    ...FOUNDATION_IDS.map((id) => ({ id, role: 'foundation' as const })),
    ...TABLEAU_IDS.map((id) => ({ id, role: 'tableau' as const })),
  ],

  deal(seed: Seed): World {
    const deck = shuffle(buildDeck(STANDARD), createRng(seed))
    let world = createWorld(PILE_IDS)
    let cursor = 0
    for (let i = 0; i < TABLEAU_IDS.length; i++) {
      world = dealCards(world, TABLEAU_IDS[i], deck.slice(cursor, cursor + i), false)
      cursor += i
      world = dealCards(world, TABLEAU_IDS[i], deck.slice(cursor, cursor + 1), true)
      cursor += 1
    }
    world = dealCards(world, 'stock', deck.slice(cursor), false)
    return world
  },

  legalMoves(world: World): readonly Action[] {
    const moves: Action[] = []

    // Draws / recycle.
    if (world.piles.stock.cards.length > 0) {
      moves.push({ type: 'move', from: 'stock', to: 'waste', count: 1, faceUp: true })
    } else if (world.piles.waste.cards.length > 0) {
      moves.push({
        type: 'move',
        from: 'waste',
        to: 'stock',
        count: world.piles.waste.cards.length,
        faceUp: false,
        // Physical flip-over — the same draw sequence repeats each cycle,
        // matching standard implementations.
        reverse: true,
      })
    }

    // Foundation moves.
    const wasteTop = topCard(world, 'waste')
    if (wasteTop) {
      for (const foundation of FOUNDATION_IDS) {
        if (canDropOnFoundation(world, foundation, wasteTop.card)) {
          moves.push({ type: 'move', from: 'waste', to: foundation, count: 1 })
        }
      }
    }
    for (const pile of TABLEAU_IDS) {
      const top = topCard(world, pile)
      if (!top || !top.faceUp) continue
      const foundation = FOUNDATION_OF[suitOf(top.card)]
      if (canDropOnFoundation(world, foundation, top.card)) {
        moves.push(...movePlusFlip(world, pile, foundation, 1))
      }
    }
    for (const foundation of FOUNDATION_IDS) {
      const top = topCard(world, foundation)
      if (!top) continue
      for (const target of TABLEAU_IDS) {
        if (canDropOnTableau(world, target, top.card)) {
          moves.push({ type: 'move', from: foundation, to: target, count: 1 })
        }
      }
    }

    // Tableau moves.
    if (wasteTop) {
      for (const target of TABLEAU_IDS) {
        if (canDropOnTableau(world, target, wasteTop.card)) {
          moves.push({ type: 'move', from: 'waste', to: target, count: 1 })
        }
      }
    }
    for (const source of TABLEAU_IDS) {
      const cards = world.piles[source].cards
      const firstFaceUp = cards.findIndex((pc) => pc.faceUp)
      if (firstFaceUp === -1) continue
      for (let k = cards.length - 1; k >= firstFaceUp; k--) {
        const runBottom = cards[k].card
        for (const target of TABLEAU_IDS) {
          if (target === source) continue
          if (!canDropOnTableau(world, target, runBottom)) continue
          moves.push(...movePlusFlip(world, source, target, cards.length - k))
        }
      }
    }

    return moves
  },

  isWon(world: World): boolean {
    return FOUNDATION_IDS.every((foundation) => world.piles[foundation].cards.length === 13)
  },

  safeAutoMoves(world: World): readonly Action[] {
    const moves: Action[] = []
    const candidates: Array<{ from: PileId; card: Card }> = []
    const wasteTop = topCard(world, 'waste')
    if (wasteTop) candidates.push({ from: 'waste', card: wasteTop.card })
    for (const pile of TABLEAU_IDS) {
      const top = topCard(world, pile)
      if (top && top.faceUp) candidates.push({ from: pile, card: top.card })
    }
    for (const { from, card } of candidates) {
      const foundation = FOUNDATION_OF[suitOf(card)]
      if (!canDropOnFoundation(world, foundation, card)) continue
      if (!isSafeToAutoFly(world, card)) continue
      if (from === 'waste') {
        moves.push({ type: 'move', from, to: foundation, count: 1 })
      } else {
        moves.push(...movePlusFlip(world, from, foundation, 1))
      }
    }
    return moves
  },

  layout: [
    { pileId: 'stock', row: 0, col: 0, fan: 'none' },
    { pileId: 'waste', row: 0, col: 1, fan: 'right' },
    { pileId: 'found-S', row: 0, col: 3, fan: 'none' },
    { pileId: 'found-H', row: 0, col: 4, fan: 'none' },
    { pileId: 'found-D', row: 0, col: 5, fan: 'none' },
    { pileId: 'found-C', row: 0, col: 6, fan: 'none' },
    ...TABLEAU_IDS.map((pileId, col) => ({ pileId, row: 1, col, fan: 'down' as const })),
  ],
}
