/**
 * Flight steps — the renderer's animation groundwork (C3). A player click
 * commits a whole action group at once (rule move(s) + trailing flips + safe
 * flights — see moveGroup in ../games/klondike/play), but the board should
 * animate it as one sequenced step per card flight. flightSteps folds that
 * action list over progressively-replayed worlds (same pattern as safeFlights)
 * and answers the only question animation needs: which cards fly, from where,
 * to where, in what order.
 *
 * One FlightStep = one move action's card run at the moment it moved: the top
 * `count` cards of the from-pile in the world BEFORE that action, ids in pile
 * order (bottom-to-top of the run). Non-move actions (flips) emit nothing but
 * still advance the world, so a later step in the same group reflects the
 * state its move actually saw. No pre-validation: each action is applied
 * through the engine's replay first, so an illegal action raises exactly as
 * committing it would.
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
 * order, each computed against the world its own move saw.
 */
export function flightSteps(before: World, actions: readonly Action[]): readonly FlightStep[] {
  const steps: FlightStep[] = []
  let world = before
  for (const action of actions) {
    // Advance first: an illegal action raises from replay (EngineError)
    // before anything is emitted — a move the engine would reject never
    // produces a step.
    const pre = world
    world = replay(world, [action])
    if (action.type === 'move') {
      const cards = pre.piles[action.from].cards
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
    }
  }
  return steps
}
