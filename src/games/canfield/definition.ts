/**
 * Canfield (Draw-3) — rules/logic game module. No UI.
 *
 * Rules (locked with the user 2026-10-15; digest at docs/CANFIELD_RULES.md —
 * Wikipedia "Canfield (solitaire)", citing Parlett 1979 pp. 149-150):
 * - Deal: 13 cards to the reserve with the TOP face-up (implemented as 12
 *   face-down dealt, then the 13th face-up — the pre-log equivalent of
 *   dealing 13 face-down and flipping the top), the next card FACE-UP onto
 *   found-0 — the BASE CARD whose RANK (any suit) opens all four
 *   foundations — then one face-up card to each tableau, the rest
 *   face-down to the stock.
 * - Foundations: empty accepts ANY card of the base rank; else same suit,
 *   rank one higher, WRAPPING (a King accepts an Ace). The base rank is
 *   derived from found-0's bottom card — never stored; foundations are
 *   LOCKED once fed (DC5: no foundation → tableau pulls, the gambling-
 *   origin rule), so found-0.cards[0] stays the base card for the whole game.
 * - Tableau: builds DOWN in alternating colors, WRAPPING (an Ace accepts a
 *   King); any face-up run moves whole (judged at the destination by the
 *   run's bottom card). EMPTY tableaus accept ONLY a reserve card — never
 *   the waste, never a tableau run (the gap-filling rule). Reserve plays
 *   carry faceUp: true — the card turns face up as it is placed, which is
 *   what keeps gaps refilled face-up after the dealt top is spent.
 * - Draw-3 (DC2): the stock deals min(3, stock length) face-up onto the
 *   waste; only the waste top is playable; unlimited redeals.
 * - Recycle: stock empty + waste nonempty → ONE reverse move of the whole
 *   waste back to the stock, face down — the physical flip-over (the
 *   Klondike-approved precedent), so the same draw sequence repeats.
 * - Reserve: the top card only is playable (count always 1, never a run
 *   source) → foundation or tableau per the rules above. When the reserve
 *   is EMPTY it refills from the waste: ONE reverse move of the whole
 *   waste, face down (DC3: an explicit player action; the same flip-over
 *   precedent). "Use the reserve whenever possible" is advisory only —
 *   not enforced (DC1).
 * - No auto-fly: safeAutoMoves returns [] (DC5 — wrapping builds + a
 *   dynamic base rank make the Klondike safety rule inapplicable; future
 *   work). No scoring — win/lose only (DC4).
 * - NO flip composition: after the deal no tableau card is ever face-down
 *   (all 4 tableau cards are dealt face-up and gaps refill face-up from
 *   the reserve), so legalMoves emits moves only.
 * - Won when all four foundations hold 13 cards.
 *
 * `legalMoves` enumerates EVERY legal player move — the single source of
 * truth for the future click-click UX and hint search. Deterministic emit
 * order: draw/recycle, reserve refill, foundation moves (reserve top, waste
 * top, then tableau tops), then tableau moves (reserve top → any target incl. empty
 * gaps, waste top → non-empty targets, runs → targets by source t0..t3,
 * top-run first, destinations t0..t3).
 */

import type { Action, Card, PileId, Seed, Suit, World } from 'deckhand/engine'
import {
  STANDARD,
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

const TABLEAU_IDS: readonly PileId[] = ['t0', 't1', 't2', 't3']
const FOUNDATION_IDS: readonly PileId[] = ['found-0', 'found-1', 'found-2', 'found-3']

const PILE_IDS: readonly PileId[] = ['stock', 'waste', 'reserve', ...FOUNDATION_IDS, ...TABLEAU_IDS]

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

/** The next rank up, wrapping King → Ace (foundation build). */
function rankAfter(rank: number): number {
  return rank === 13 ? 1 : rank + 1
}

/** The next rank down, wrapping Ace → King (tableau build). */
function rankBefore(rank: number): number {
  return rank === 1 ? 13 : rank - 1
}

/**
 * The rank every empty foundation opens with: the rank of found-0's BOTTOM
 * card (the dealt base card). Derived, never stored — foundations are
 * locked (DC5), so the bottom card cannot move. Throws on an empty found-0
 * (impossible post-deal).
 */
export function baseRank(world: World): number {
  const bottom = world.piles['found-0'].cards[0]
  if (!bottom) throw new EngineError('Canfield base card missing: found-0 is empty')
  return rankOf(bottom.card)
}

/**
 * Foundation rule: empty accepts ANY card of the base rank; else same suit,
 * rank one higher with wrapping.
 */
function canDropOnFoundation(world: World, foundation: PileId, card: Card): boolean {
  const top = topCard(world, foundation)
  if (!top) return rankOf(card) === baseRank(world)
  return suitOf(top.card) === suitOf(card) && rankOf(card) === rankAfter(rankOf(top.card))
}

/**
 * Tableau build rule: empty accepts NOTHING here (gaps are reserve-only —
 * legalMoves lets the reserve fill them); else a face-up top, opposite
 * color, rank one lower with wrapping.
 */
function canDropOnTableau(world: World, target: PileId, card: Card): boolean {
  const top = topCard(world, target)
  if (!top) return false
  if (!top.faceUp) return false
  return isRed(suitOf(top.card)) !== isRed(suitOf(card)) && rankOf(card) === rankBefore(rankOf(top.card))
}

export const canfield: GameDefinition = {
  meta: { ...getGame('canfield') },

  deckSpec: STANDARD,

  piles: [
    { id: 'stock', role: 'stock' },
    { id: 'waste', role: 'waste' },
    { id: 'reserve', role: 'reserve' },
    ...FOUNDATION_IDS.map((id) => ({ id, role: 'foundation' as const })),
    ...TABLEAU_IDS.map((id) => ({ id, role: 'tableau' as const })),
  ],

  deal(seed: Seed): World {
    const deck = shuffle(buildDeck(STANDARD), createRng(seed))
    let world = createWorld(PILE_IDS)
    let cursor = 0
    // The reserve: 13 cards, top face-up (the pre-log equivalent of dealing
    // 13 face-down and flipping the top).
    world = dealCards(world, 'reserve', deck.slice(cursor, cursor + 12), false)
    cursor += 12
    world = dealCards(world, 'reserve', deck.slice(cursor, cursor + 1), true)
    cursor += 1
    // The base card: face-up on found-0; its RANK drives all four foundations.
    world = dealCards(world, 'found-0', deck.slice(cursor, cursor + 1), true)
    cursor += 1
    // One face-up card per tableau pile.
    for (const tableau of TABLEAU_IDS) {
      world = dealCards(world, tableau, deck.slice(cursor, cursor + 1), true)
      cursor += 1
    }
    // The rest face-down to the stock.
    world = dealCards(world, 'stock', deck.slice(cursor), false)
    return world
  },

  legalMoves(world: World): readonly Action[] {
    const moves: Action[] = []

    // Draws / recycle.
    const stockCount = world.piles.stock.cards.length
    if (stockCount > 0) {
      moves.push({
        type: 'move',
        from: 'stock',
        to: 'waste',
        count: Math.min(3, stockCount),
        faceUp: true,
      })
    } else if (world.piles.waste.cards.length > 0) {
      moves.push({
        type: 'move',
        from: 'waste',
        to: 'stock',
        count: world.piles.waste.cards.length,
        faceUp: false,
        // Physical flip-over — the same draw sequence repeats each cycle.
        reverse: true,
      })
    }

    // Reserve refill (DC3: an explicit player action on the empty reserve).
    if (world.piles.reserve.cards.length === 0 && world.piles.waste.cards.length > 0) {
      moves.push({
        type: 'move',
        from: 'waste',
        to: 'reserve',
        count: world.piles.waste.cards.length,
        faceUp: false,
        // Physical flip-over into the reserve — the recycle precedent.
        reverse: true,
      })
    }

    // Foundation moves: the reserve top, then the waste top, then the
    // tableau tops. A reserve play turns the card face up as it is placed
    // (one move action, no flip — see the header).
    const reserveTop = topCard(world, 'reserve')
    const wasteTop = topCard(world, 'waste')
    if (reserveTop) {
      for (const foundation of FOUNDATION_IDS) {
        if (canDropOnFoundation(world, foundation, reserveTop.card)) {
          moves.push({ type: 'move', from: 'reserve', to: foundation, count: 1, faceUp: true })
        }
      }
    }
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
      for (const foundation of FOUNDATION_IDS) {
        if (canDropOnFoundation(world, foundation, top.card)) {
          moves.push({ type: 'move', from: pile, to: foundation, count: 1 })
        }
      }
    }

    // Tableau moves: the reserve top → any target (it is the ONLY source
    // that fills an empty gap), the waste top → non-empty targets only,
    // then runs → targets by source t0..t3, top-run first.
    if (reserveTop) {
      for (const target of TABLEAU_IDS) {
        if (
          world.piles[target].cards.length === 0 ||
          canDropOnTableau(world, target, reserveTop.card)
        ) {
          moves.push({ type: 'move', from: 'reserve', to: target, count: 1, faceUp: true })
        }
      }
    }
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
          moves.push({ type: 'move', from: source, to: target, count: cards.length - k })
        }
      }
    }

    return moves
  },

  isWon(world: World): boolean {
    return FOUNDATION_IDS.every((foundation) => world.piles[foundation].cards.length === 13)
  },

  /** No safe auto-fly in Canfield (DC5): wrapping builds + a dynamic base rank break Klondike's safety rule. */
  safeAutoMoves(): readonly Action[] {
    return []
  },

  layout: [
    { pileId: 'reserve', row: 0, col: 0, fan: 'down' },
    { pileId: 'found-0', row: 0, col: 3, fan: 'none' },
    { pileId: 'found-1', row: 0, col: 4, fan: 'none' },
    { pileId: 'found-2', row: 0, col: 5, fan: 'none' },
    { pileId: 'found-3', row: 0, col: 6, fan: 'none' },
    ...TABLEAU_IDS.map((pileId, col) => ({ pileId, row: 1, col, fan: 'down' as const })),
    { pileId: 'stock', row: 1, col: 5, fan: 'none' },
    { pileId: 'waste', row: 1, col: 6, fan: 'right' },
  ],
}
