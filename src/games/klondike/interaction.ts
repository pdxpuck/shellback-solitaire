/**
 * Klondike interaction helpers (C3) — pure grouping/lookup over the engine's
 * flat legal-move list. No React, no DOM: GameView composes these with its
 * click handlers.
 *
 * groupMoves folds legalMoves' flat action list into player clicks: a move
 * plus any flip composed after it on the same source pile (see movePlusFlip
 * in the definition) is ONE MoveGroup = ONE click = ONE undo group.
 *
 * foundationMove is the foundation-first primitive: the first legal move
 * group sending a run straight to a foundation. Sources already on a
 * foundation never fly again (only a deliberate click-click can pull a card
 * back off a foundation). quickMove is the full double-click smart move:
 * foundation first, else the run's LEFT-MOST legal destination (lowest
 * layout column; ties keep the first group in order) — ambiguity never
 * blocks the fly, and a stock target is never auto-chosen (recycle stays a
 * deliberate stock click).
 */
import type { Action, PileId } from 'deckhand/engine'
import type { PileRole } from 'deckhand/contract'

/** One legal player click: the move proper + any flip composed after it. */
export interface MoveGroup {
  readonly move: Extract<Action, { type: 'move' }>
  readonly actions: readonly Action[]
}

/**
 * Group the engine's flat legal-move list into player clicks. legalMoves
 * emits a flip only immediately after its own move, on the same source pile
 * (see movePlusFlip in the definition), so grouping is a single pass.
 */
export function groupMoves(moves: readonly Action[]): readonly MoveGroup[] {
  const groups: MoveGroup[] = []
  for (const action of moves) {
    if (action.type === 'move') {
      groups.push({ move: action, actions: [action] })
    } else if (action.type === 'flip' && groups.length > 0) {
      const last = groups[groups.length - 1]
      if (last.move.from === action.pile) {
        groups[groups.length - 1] = { ...last, actions: [...last.actions, action] }
      }
    }
  }
  return groups
}

/**
 * The first move group sending `count` cards from `from` straight to a
 * foundation — the double-click quick-fly target, or null when the position
 * offers none (or when `from` is itself a foundation: cards never auto-fly
 * FROM a foundation). Returns the WHOLE group, so its `.actions` carries any
 * trailing flip.
 */
export function foundationMove(
  groups: readonly MoveGroup[],
  from: PileId,
  count: number,
  roleOf: (pileId: PileId) => PileRole | undefined,
): MoveGroup | null {
  return (
    groups.find(
      (group) =>
        group.move.from === from &&
        group.move.count === count &&
        roleOf(from) !== 'foundation' &&
        roleOf(group.move.to) === 'foundation',
    ) ?? null
  )
}

/**
 * The double-click smart move for `count` cards from `from`: the first
 * legal foundation move when one exists, else the LEFT-MOST legal
 * destination — the candidate whose target sits on the LOWEST layout column
 * (`colOf`), with ties keeping the FIRST group in order (deterministic).
 * Stock targets are never auto-chosen: recycling the waste is a deliberate
 * stock click, not a fly (user ruling 2026-10-15 — ambiguity must not block
 * the quick action). Null only when nothing matches or when `from` is
 * itself a foundation (pull-backs stay deliberate click-click). Returns the
 * WHOLE group, so its `.actions` carries any trailing flip.
 */
export function quickMove(
  groups: readonly MoveGroup[],
  from: PileId,
  count: number,
  roleOf: (pileId: PileId) => PileRole | undefined,
  colOf: (pileId: PileId) => number,
): MoveGroup | null {
  const foundation = foundationMove(groups, from, count, roleOf)
  if (foundation !== null) return foundation
  const candidates = groups.filter(
    (group) =>
      group.move.from === from &&
      group.move.count === count &&
      roleOf(from) !== 'foundation' &&
      roleOf(group.move.to) !== 'stock',
  )
  if (candidates.length === 0) return null
  return candidates.reduce((best, g) => (colOf(g.move.to) < colOf(best.move.to) ? g : best))
}
