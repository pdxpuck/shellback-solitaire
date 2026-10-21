/**
 * Pure rules-diagram grouping (v0.5.3): merges same-role piles that sit on
 * the same row in consecutive columns into horizontal RUNS, so the rules
 * map renders ONE label chip per run instead of a label under every pile
 * box (v0.4.10's per-pile labels read as clutter). The grouping rule is
 * deliberately simple — user directive "don't overcomplicate it but keep
 * it readable": piles group ONLY when role, row, and column+1 all match;
 * any break (role change, row change, column gap) splits the run, and
 * everything else degrades to single-pile runs. A split-roles layout
 * (future FreeCell: cells left + foundations right) therefore gets two
 * natural chips without special-casing.
 * Pure: no DOM, no window reads (layout.ts contract).
 */
import type { LayoutHint } from 'deckhand/contract'

/** One horizontal run of same-role piles, spanning colStart..colEnd (the
 *  diagram chip renders over exactly this grid-column span). */
export interface RulesRun {
  readonly role: string
  readonly row: number
  readonly colStart: number
  readonly colEnd: number
  readonly pileIds: readonly string[]
}

/**
 * Group a definition's layout hints into horizontal same-role runs: sort
 * by (row, col), then walk — a hint continues the open run only when role
 * AND row match AND its column is exactly colEnd + 1; otherwise the run
 * closes and a fresh one opens. Every input pile appears in exactly one
 * output run, in (row, col) order.
 */
export function runGrouping(
  layout: readonly LayoutHint[],
  roleOf: (pileId: string) => string,
): RulesRun[] {
  const sorted = [...layout].sort((a, b) => a.row - b.row || a.col - b.col)
  const runs: RulesRun[] = []
  let open = false
  let role = ''
  let row = -1
  let colStart = -1
  let colEnd = -1
  let pileIds: string[] = []
  for (const hint of sorted) {
    const hintRole = roleOf(hint.pileId)
    if (open && hintRole === role && hint.row === row && colEnd + 1 === hint.col) {
      colEnd = hint.col
      pileIds = [...pileIds, hint.pileId]
    } else {
      if (open) runs.push({ role, row, colStart, colEnd, pileIds })
      role = hintRole
      row = hint.row
      colStart = hint.col
      colEnd = hint.col
      pileIds = [hint.pileId]
      open = true
    }
  }
  if (open) runs.push({ role, row, colStart, colEnd, pileIds })
  return runs
}
