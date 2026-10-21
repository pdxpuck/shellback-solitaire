/**
 * Unit tests for the rules-diagram run grouping (v0.5.3). The grouping
 * feeds the rules map's label chips: a merge that is too eager glues
 * unrelated piles under one label; a split that is too shy re-creates the
 * per-pile label clutter. These tests pin the exact middle: same role +
 * same row + consecutive columns, nothing else.
 */

import { describe, expect, it } from 'vitest'
import type { LayoutHint } from 'deckhand/contract'
import type { PileId } from 'deckhand/engine'
import { runGrouping } from './rulesLayout'

/** A 'none'-fan hint — fan is irrelevant to grouping; the tests omit it. */
const hint = (pileId: string, row: number, col: number): LayoutHint => ({
  pileId: pileId as PileId,
  row,
  col,
  fan: 'none',
})

describe('rulesLayout — runGrouping (v0.5.3)', () => {
  it('MERGES: same role + same row + consecutive columns form one run', () => {
    // Klondike's four suit foundations sit side by side on row 0.
    const layout = [
      hint('f0', 0, 3),
      hint('f1', 0, 4),
      hint('f2', 0, 5),
      hint('f3', 0, 6),
    ]
    expect(runGrouping(layout, () => 'foundation')).toEqual([
      { role: 'foundation', row: 0, colStart: 3, colEnd: 6, pileIds: ['f0', 'f1', 'f2', 'f3'] },
    ])
  })

  it('SPLITS on a column gap even when role and row match', () => {
    // FreeCell's shape: cells left, a gap, foundations right — the gap
    // must break the run (this is why FreeCell gets two chips for free).
    const layout = [hint('c0', 0, 0), hint('c1', 0, 1), hint('f0', 0, 4), hint('f1', 0, 5)]
    expect(runGrouping(layout, () => 'cell')).toEqual([
      { role: 'cell', row: 0, colStart: 0, colEnd: 1, pileIds: ['c0', 'c1'] },
      { role: 'cell', row: 0, colStart: 4, colEnd: 5, pileIds: ['f0', 'f1'] },
    ])
  })

  it('SPLITS on a role change even when the columns are consecutive', () => {
    // Klondike row 0: stock, waste, gap, foundations — stock/waste are
    // adjacent but must never share a chip.
    const roles: Record<string, string> = {
      stock: 'stock',
      waste: 'waste',
      'f0': 'foundation',
      'f1': 'foundation',
    }
    const layout = [hint('stock', 0, 0), hint('waste', 0, 1), hint('f0', 0, 3), hint('f1', 0, 4)]
    expect(runGrouping(layout, (id) => roles[id])).toEqual([
      { role: 'stock', row: 0, colStart: 0, colEnd: 0, pileIds: ['stock'] },
      { role: 'waste', row: 0, colStart: 1, colEnd: 1, pileIds: ['waste'] },
      { role: 'foundation', row: 0, colStart: 3, colEnd: 4, pileIds: ['f0', 'f1'] },
    ])
  })

  it('NEVER merges across rows, even at the same column and role', () => {
    const layout = [hint('top', 0, 2), hint('bottom', 1, 2)]
    expect(runGrouping(layout, () => 'tableau')).toEqual([
      { role: 'tableau', row: 0, colStart: 2, colEnd: 2, pileIds: ['top'] },
      { role: 'tableau', row: 1, colStart: 2, colEnd: 2, pileIds: ['bottom'] },
    ])
  })

  it('INVARIANT: every input pile is covered by exactly one run (runs are row/col ordered)', () => {
    // A scrambled Klondike-like layout: piles arrive unsorted; the walk
    // sorts internally, so coverage must hold regardless of input order.
    const roles: Record<string, string> = {
      stock: 'stock',
      waste: 'waste',
      'f0': 'foundation',
      'f1': 'foundation',
      'f2': 'foundation',
      'f3': 'foundation',
      t0: 'tableau',
      t1: 'tableau',
      t2: 'tableau',
      t3: 'tableau',
      t4: 'tableau',
      t5: 'tableau',
      t6: 'tableau',
    }
    const layout = [
      hint('t3', 1, 3),
      hint('f1', 0, 4),
      hint('stock', 0, 0),
      hint('t0', 1, 0),
      hint('f3', 0, 6),
      hint('t6', 1, 6),
      hint('waste', 0, 1),
      hint('t1', 1, 1),
      hint('f0', 0, 3),
      hint('t4', 1, 4),
      hint('f2', 0, 5),
      hint('t2', 1, 2),
      hint('t5', 1, 5),
    ]
    const runs = runGrouping(layout, (id) => roles[id])
    const covered = runs.flatMap((run) => run.pileIds)
    // Exactly once: same membership, same count, no duplicates.
    expect(covered).toHaveLength(layout.length)
    expect(new Set(covered).size).toBe(covered.length)
    expect(new Set(covered)).toEqual(new Set(layout.map((h) => h.pileId)))
    // Runs emerge in (row, col) order — the chip placement relies on it.
    const starts = runs.map((r) => r.row * 100 + r.colStart)
    expect([...starts].sort((a, b) => a - b)).toEqual(starts)
    // And the known shape: stock, waste, foundations×4, tableaux×7.
    expect(runs.map((r) => r.pileIds)).toEqual([
      ['stock'],
      ['waste'],
      ['f0', 'f1', 'f2', 'f3'],
      ['t0', 't1', 't2', 't3', 't4', 't5', 't6'],
    ])
  })

  it('an empty layout yields no runs', () => {
    expect(runGrouping([], () => 'stock')).toEqual([])
  })
})
