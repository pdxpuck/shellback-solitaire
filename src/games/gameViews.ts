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

/** Everything GameView needs to render + play one game — no rules knowledge. */
export interface GameViewConfig {
  readonly definition: GameDefinition
  readonly session: GameSession
  /** Glyph shown on an EMPTY foundation slot ('' → no glyph). */
  emptyFoundationGlyph(world: World, pileId: PileId): string
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

const KLONDIKE_VIEW: GameViewConfig = {
  definition: klondikeDraw1,
  session: klondikeSession,
  emptyFoundationGlyph: (_world, pileId) => KLONDIKE_FOUNDATION_GLYPHS[pileId] ?? '',
}

const CANFIELD_VIEW: GameViewConfig = {
  definition: canfield,
  session: canfieldSession,
  // Every empty foundation opens with the base rank (any suit) — show it.
  emptyFoundationGlyph: (world) => `${baseRank(world)}`,
}

const GAME_VIEWS: Readonly<Record<string, GameViewConfig | undefined>> = {
  klondike: KLONDIKE_VIEW,
  canfield: CANFIELD_VIEW,
}

/** The view config for a registry game id; throws on an unknown id. */
export function gameViewConfig(gameId: string): GameViewConfig {
  const config = GAME_VIEWS[gameId]
  if (config === undefined) throw new Error(`No game view for: "${gameId}"`)
  return config
}
