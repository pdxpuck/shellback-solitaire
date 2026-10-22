/**
 * FreeCell game-state helpers — the pure session layer between the rules
 * module (definition.ts) and the UI. A game is just its seed plus the log
 * of player-move groups; every other question (current world, win,
 * legality) is answered by replaying that log through the engine.
 *
 * One moves group = ONE player click: the rule actions the click resolved
 * to followed by that click's safe-flight batch (see safeFlights). FreeCell
 * is the second real safeFlights consumer (Canfield returns [] — DC5
 * there): exposed aces and safe cards genuinely fly, and flying can expose
 * further tops, so the fixpoint loop does real work — the machinery is
 * unchanged from Klondike/Canfield. Undo/UI can slice whole groups.
 *
 * Persistence is a single localStorage slot: {seed, moves}. Loading is
 * guarded twice — loose structural validation, then a full replay that must
 * not throw — so a corrupt or rule-breaking save degrades to "no save".
 */

import type { Action, World } from 'deckhand/engine'
import { replay } from 'deckhand/engine'
import { freecell } from './definition'

/**
 * One safe-flight fixpoint pass can only FLY cards (at most 52 total), so
 * the batch chain must settle well under this cap. The cap exists purely so
 * a rules bug can never hang the app — if it is ever hit, we stop and keep
 * what accumulated.
 */
const MAX_FLIGHT_ITERATIONS = 60

const SAVE_KEY = 'shellback.freecell.save.v1'

/** Seed + move-group log; the entire serializable game state. */
export interface GameState {
  readonly seed: string
  /** One group per player click: rule actions + that click's safe flights. */
  readonly moves: readonly (readonly Action[])[]
}

/** A fresh, untouched game for the given seed. */
export function initialState(seed: string): GameState {
  return { seed, moves: [] }
}

// --- deal numbers ------------------------------------------------------------

/**
 * Every deal carries an integer game # in [DEAL_MIN, DEAL_MAX]; the number
 * IS the seed, so quoting a deal # replays that exact layout. Legacy seeds
 * (arbitrary strings from pre-0.3.2) remain valid and simply have no #.
 */
export const DEAL_MIN = 1
export const DEAL_MAX = 1_000_000

/** A uniform-random deal number — the # for a fresh deal. */
export function randomDealNumber(): number {
  return DEAL_MIN + Math.floor(Math.random() * (DEAL_MAX - DEAL_MIN + 1))
}

/**
 * Parse user input as a deal number: trimmed, digits-only, within range.
 * Returns the integer, or null when anything is off (empty, non-numeric,
 * fractional, out of range).
 */
export function parseDealNumber(input: string): number | null {
  const trimmed = input.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const n = Number(trimmed)
  if (n < DEAL_MIN || n > DEAL_MAX) return null
  return n
}

/** The current world: the dealt layout folded through every logged action. */
export function worldFor(state: GameState): World {
  return replay(freecell.deal(state.seed), state.moves.flat())
}

/**
 * Append a player click's actions verbatim (no auto-flights). For clicks
 * that should compose safe flights, use moveGroup instead.
 */
export function applyPlayerMove(state: GameState, actions: readonly Action[]): GameState {
  return { ...state, moves: [...state.moves, [...actions]] }
}

/**
 * Safe auto-fly to fixpoint: query safeAutoMoves, apply, re-query, until a
 * query comes back empty. Capped at MAX_FLIGHT_ITERATIONS — if the cap is
 * ever hit (a rules bug; 52 cards max), stop and return what accumulated.
 */
export function safeFlights(world: World): readonly Action[] {
  const flown: Action[] = []
  let current = world
  for (let i = 0; i < MAX_FLIGHT_ITERATIONS; i++) {
    const batch = freecell.safeAutoMoves(current)
    if (batch.length === 0) break
    flown.push(...batch)
    current = replay(current, batch)
  }
  return flown
}

/**
 * A full player click: the given rule actions, then — unless opts.autoFly is
 * exactly false — the safe flights they unlock, appended as ONE moves group.
 * With autoFly off, the group is the rule actions ONLY (manual foundations).
 */
export function moveGroup(
  state: GameState,
  actions: readonly Action[],
  opts?: { autoFly?: boolean },
): GameState {
  const world = replay(worldFor(state), actions)
  const flights = opts?.autoFly === false ? [] : safeFlights(world)
  return applyPlayerMove(state, [...actions, ...flights])
}

/** Won when all four foundations hold 13 cards (per the game definition). */
export function isWonState(state: GameState): boolean {
  return freecell.isWon(worldFor(state))
}

/** Persist to localStorage; failures (quota, privacy mode) are ignored. */
export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ seed: state.seed, moves: state.moves }))
  } catch {
    // Storage unavailable — the save stays session-only.
  }
}

/**
 * A move-group log entry, loosely validated: an array of action-shaped
 * objects (each carrying a string `type`). Full rule-validity is checked by
 * replaying the log, not by structural inspection.
 */
function isActionLike(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  )
}

/**
 * Read the saved game back. Any failure — missing slot, malformed JSON,
 * wrong shape, or a log that will not replay (EngineError, i.e. not
 * rule-valid) — yields null ("no save"), never a throw.
 */
export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { seed, moves } = parsed as { seed?: unknown; moves?: unknown }
    if (typeof seed !== 'string' || !Array.isArray(moves)) return null
    for (const group of moves) {
      if (!Array.isArray(group)) return null
      if (!group.every(isActionLike)) return null
    }
    const state: GameState = { seed, moves: moves as Action[][] }
    worldFor(state) // Must replay cleanly — raises EngineError on a rule-breaking log.
    return state
  } catch {
    return null // Malformed JSON or a rule-breaking log → no save.
  }
}

/** Drop the saved game, if any. */
export function clearGame(): void {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    // Storage unavailable — nothing to clear.
  }
}
