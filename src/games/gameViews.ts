/**
 * gameViews — the per-game view config map. GameView is game-agnostic: it
 * renders whatever `definition` + `session` it is handed, plus one piece of
 * presentation glue — the glyph on an EMPTY foundation slot (pure chrome:
 * Klondike shows the foundation's suit, Canfield shows the base rank every
 * empty foundation opens with). App resolves a registry id ('klondike',
 * 'canfield') to its config here; a game becomes Preview-able by adding one
 * entry.
 *
 * GameSession is exactly the play.ts surface GameView consumes: deal-number
 * helpers, save/load, world replay, move-group commit, win check. Both
 * games' play modules share the same shape (GameState = seed + move-group
 * log), so one interface covers them; binding each module to it at module
 * load makes any surface drift a compile error, not a runtime surprise.
 *
 * groupMoves/quickMove are game-agnostic pure helpers over the engine's
 * legal-move list that still live in klondike/interaction.ts (their
 * birthplace and test home) — re-exported here so view code keeps a
 * per-game-free import path.
 */

import type { GameDefinition } from 'deckhand/contract'
import type { Action, PileId, World } from 'deckhand/engine'
import { baseRank, canfield } from './canfield/definition'
import * as canfieldPlay from './canfield/play'
import { klondikeDraw1 } from './klondike/definition'
import * as klondikePlay from './klondike/play'

// Generic interaction helpers — see header.
export { groupMoves, quickMove } from './klondike/interaction'

/** Seed + move-group log; the entire serializable game state. Both games
 *  share this shape (enforced by the GameSession bindings below). */
export interface GameState {
  readonly seed: string
  /** One group per player click: rule actions + that click's safe flights. */
  readonly moves: readonly (readonly Action[])[]
}

/** The play.ts surface GameView consumes (members named as it calls them). */
export interface GameSession {
  /** Deal-number range: the # IS the seed (see either play.ts). */
  readonly DEAL_MIN: number
  readonly DEAL_MAX: number
  initialState(seed: string): GameState
  loadGame(): GameState | null
  saveGame(state: GameState): void
  clearGame(): void
  worldFor(state: GameState): World
  moveGroup(
    state: GameState,
    actions: readonly Action[],
    opts?: { autoFly?: boolean },
  ): GameState
  isWonState(state: GameState): boolean
  parseDealNumber(input: string): number | null
  randomDealNumber(): number
}

/** Player-facing rules content (v0.4.10 rules panel) — distilled from the
 *  rules digest, written for players, not rule-lawyers. */
export interface GameRules {
  intro: string
  sections: readonly { heading: string; items: readonly string[] }[]
}

/** Everything GameView needs to render + play one game — no rules knowledge. */
export interface GameViewConfig {
  readonly definition: GameDefinition
  readonly session: GameSession
  /** Glyph shown on an EMPTY foundation slot ('' → no glyph). */
  emptyFoundationGlyph(world: World, pileId: PileId): string
  /** Rules-panel content (v0.4.10). */
  rules: GameRules
  /** Display names for the layout diagram, keyed by pile id; any pile id
   *  without an entry falls back to its role's generic name. */
  pileLabels: Readonly<Record<string, string>>
}

// Binding each play module to GameSession here pins its surface: a member
// added, removed, or renamed in a play.ts fails THIS assignment, not the view.
const klondikeSession: GameSession = klondikePlay
const canfieldSession: GameSession = canfieldPlay

/** Klondike's suit-keyed empty-foundation glyphs, by foundation pile id. */
const KLONDIKE_FOUNDATION_GLYPHS: Partial<Record<PileId, string>> = {
  'found-S': '♠',
  'found-H': '♥',
  'found-D': '♦',
  'found-C': '♣',
}

// ---- rules-panel content (v0.4.10) ----------------------------------------
// Sources: docs/CANFIELD_RULES.md (the 2026-10-15 digest, DC1–DC5); Klondike
// written fresh (standard draw-1). Player-facing prose — the digests stay
// the rules-lawyer record.

const KLONDIKE_RULES: GameRules = {
  intro:
    'Move all 52 cards to the four foundations — ace to king in suit — and the game is won.',
  sections: [
    {
      heading: 'The deals',
      items: [
        'Tap the stock to deal one card face-up to the waste.',
        "Only the waste's top card is in play.",
        'An empty stock recycles the waste — unlimited redeals.',
      ],
    },
    {
      heading: 'Building',
      items: [
        'Foundations build UP in suit, ace to king — no wrapping.',
        'Working stacks build DOWN in alternating colors.',
        'Runs move whole — grab the deepest card you need.',
      ],
    },
    {
      heading: 'Empty columns',
      items: ['An empty working stack accepts only a King.'],
    },
    {
      heading: 'Moving',
      items: [
        'Tap a card to select it, then tap a destination.',
        'Single-tap quick-move (when the setting is on) or drag also work — foundation-first, else left-most.',
      ],
    },
  ],
}

const CANFIELD_RULES: GameRules = {
  intro:
    'Move all 52 cards to the foundations. The first card played to a foundation sets the base RANK for all four — from there each foundation builds up in suit, wrapping king to ace.',
  sections: [
    {
      heading: 'The deal',
      items: [
        '13 cards go to the reserve — its top card is face up.',
        'One card face-up starts the foundations and sets the base RANK for all four.',
        'One card face-up per working stack; the rest is the stock.',
      ],
    },
    {
      heading: 'The deals',
      items: [
        'Tap the stock to deal THREE cards face-up to the waste.',
        "Only the waste's top card is in play.",
        'An empty stock recycles the waste — unlimited redeals.',
      ],
    },
    {
      heading: 'Building',
      items: [
        'Working stacks build DOWN in alternating colors — wrapping ace to king.',
        'Runs move whole.',
        'An EMPTY working stack accepts ONLY a reserve card — never the waste, never a run.',
      ],
    },
    {
      heading: 'The reserve',
      items: [
        'Its top card plays to the foundations or working stacks and turns face up as it lands.',
        'When the reserve empties, tap it to flip the whole waste into it.',
      ],
    },
    {
      heading: 'Locked foundations',
      items: ['Cards on a foundation can never come back.'],
    },
  ],
}

const KLONDIKE_PILE_LABELS: Readonly<Record<string, string>> = {
  stock: 'Stock',
  waste: 'Waste',
  'found-S': 'Foundation',
  'found-H': 'Foundation',
  'found-D': 'Foundation',
  'found-C': 'Foundation',
  t0: 'Working stack',
  t1: 'Working stack',
  t2: 'Working stack',
  t3: 'Working stack',
  t4: 'Working stack',
  t5: 'Working stack',
  t6: 'Working stack',
}

const CANFIELD_PILE_LABELS: Readonly<Record<string, string>> = {
  reserve: 'Reserve',
  'found-0': 'Foundation',
  'found-1': 'Foundation',
  'found-2': 'Foundation',
  'found-3': 'Foundation',
  t0: 'Working stack',
  t1: 'Working stack',
  t2: 'Working stack',
  t3: 'Working stack',
  stock: 'Stock — deals 3',
  waste: 'Waste — top plays',
}

const KLONDIKE_VIEW: GameViewConfig = {
  definition: klondikeDraw1,
  session: klondikeSession,
  emptyFoundationGlyph: (_world, pileId) => KLONDIKE_FOUNDATION_GLYPHS[pileId] ?? '',
  rules: KLONDIKE_RULES,
  pileLabels: KLONDIKE_PILE_LABELS,
}

const CANFIELD_VIEW: GameViewConfig = {
  definition: canfield,
  session: canfieldSession,
  // Every empty foundation opens with the base rank (any suit) — show it.
  emptyFoundationGlyph: (world) => `${baseRank(world)}`,
  rules: CANFIELD_RULES,
  pileLabels: CANFIELD_PILE_LABELS,
}

/** Every shipped game's view config, by registry id — exported for the
 *  config-invariant tests (rules content + diagram labels are gated). */
export const GAME_VIEWS: Readonly<Record<string, GameViewConfig | undefined>> = {
  klondike: KLONDIKE_VIEW,
  canfield: CANFIELD_VIEW,
}

/** The view config for a registry game id; throws on an unknown id. */
export function gameViewConfig(gameId: string): GameViewConfig {
  const config = GAME_VIEWS[gameId]
  if (config === undefined) throw new Error(`No game view for: "${gameId}"`)
  return config
}
