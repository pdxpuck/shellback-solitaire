/**
 * Flight plan — the renderer's animation groundwork (C3). A player click
 * commits a whole action group at once (rule move(s) + trailing flips + safe
 * flights — see moveGroup in ../games/klondike/play), but the board should
 * animate it as one sequenced step per card flight. flightPlan folds that
 * action list over progressively-replayed worlds (same pattern as safeFlights)
 * and answers the only questions animation needs: which cards fly, from where,
 * to where, in what order — and when a flip's reveal may show.
 *
 * One FlightStep = one move action's card run at the moment it moved: the top
 * `count` cards of the from-pile in the world BEFORE that action, ids in pile
 * order (bottom-to-top of the run). Non-move actions (flips) emit no step but
 * still advance the world, so a later step in the same group reflects the
 * state its move actually saw. A flip instead records its flipped card in
 * `revealAt` — cardId → the step index of the move that EXPOSED the flip —
 * and the card renders face-down until that exposing leg's settle timer fires
 * (the real-life sequence: the uncovering card lifts, lands, THEN the reveal).
 * No pre-validation: each action is applied through the engine's replay first,
 * so an illegal action raises exactly as committing it would.
 */

import type { Action, PileId, World } from 'deckhand/engine'
import { replay } from 'deckhand/engine'

/** One card flight: a run of cards moving together between two piles. */
export interface FlightStep {
  /** Ids of ALL cards moving together in this step, run order bottom-to-top. */
  readonly cardIds: readonly string[]
  readonly fromPile: PileId
  readonly toPile: PileId
  /** Cards in the DESTINATION pile immediately AFTER this move lands. */
  readonly landedOnCount: number
}

/**
 * The flight plan for one click's actions: one step per move action, in
 * order, each computed against the world its own move saw, plus the reveal
 * map — a recorded card renders face-down until its exposing leg lands.
 */
export interface FlightPlan {
  readonly steps: readonly FlightStep[]
  /** cardId → the step index of the move that EXPOSED the flip; the card
   *  renders face-down until that leg's settle timer fires. */
  readonly revealAt: Readonly<Record<string, number>>
}

/**
 * Fold one click's actions into the board's flight plan (see the module
 * header): one step per move, one revealAt entry per flip.
 */
export function flightPlan(before: World, actions: readonly Action[]): FlightPlan {
  const steps: FlightStep[] = []
  const revealAt: Record<string, number> = {}
  let world = before
  // The step index of the most recent move — the move a trailing flip's card
  // was exposed BY (a flip between moves reveals with its preceding move).
  let lastMoveStep: number | null = null
  for (const action of actions) {
    // Advance first: an illegal action raises from replay (EngineError)
    // before anything is emitted — a move the engine would reject never
    // produces a step.
    const pre = world
    world = replay(world, [action])
    if (action.type === 'move') {
      const cards = pre.piles[action.from].cards
      lastMoveStep = steps.length
      steps.push({
        // The top `count` cards of the from-pile as this move found them —
        // the same slice, in the same order, takeTop takes.
        cardIds: cards.slice(cards.length - action.count).map((pc) => pc.card.id),
        fromPile: action.from,
        toPile: action.to,
        // The replayed world IS the post-move world, so its destination pile
        // size is the landed count.
        landedOnCount: world.piles[action.to].cards.length,
      })
    } else if (action.type === 'flip') {
      // The flipped card is the NEW top card of the flip's pile in the
      // replayed world. It reveals only when its exposing move's leg lands
      // (?? 0: a leading flip is malformed but non-fatal — it reveals with
      // step 0's settle).
      const flipped = world.piles[action.pile].cards.at(-1)
      if (flipped !== undefined) revealAt[flipped.card.id] = lastMoveStep ?? 0
    }
  }
  return { steps, revealAt }
}
