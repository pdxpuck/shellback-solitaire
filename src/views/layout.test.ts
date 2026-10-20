/**
 * Unit tests for the pure board-layout math (the fixed-box fan model).
 * Test 3 is THE regression fence for the felt-resizing field bug: a fan
 * must fit its constant box for every pile size up to a full deck — if it
 * ever overflows, the box (and the felt with it) starts growing again.
 */

import { describe, expect, it } from 'vitest'
import { COLUMN_HEIGHT_LIMIT, FAN_RATIO, columnHeightFor, fanOffsetIn } from './layout'

describe('layout — fixed-box fan model', () => {
  it('a pile with count <= 1 fans with no offset', () => {
    expect(fanOffsetIn(0, 126, 800)).toBe(0)
    expect(fanOffsetIn(1, 126, 800)).toBe(0)
  })

  it('a small fan keeps the full base spread when the column is generous', () => {
    // 4 cards in a tall column: the fit constraint is nowhere near binding.
    expect(fanOffsetIn(4, 126, 800)).toBe(126 * FAN_RATIO)
  })

  it('INVARIANT: cardHeight + (count-1)*offset fits columnHeight for every count 2..52 — the stable-felt regression fence', () => {
    const cardHeight = 126
    for (const columnHeight of [300, 400, 630, 800, 1200]) {
      for (let count = 2; count <= 52; count++) {
        const offset = fanOffsetIn(count, cardHeight, columnHeight)
        // +1e-9: float slack for (col-h)/(n-1)*(n-1) round-trips.
        expect(cardHeight + (count - 1) * offset).toBeLessThanOrEqual(columnHeight + 1e-9)
      }
    }
  })

  it('offsets are non-increasing as the pile deepens (fixed cardHeight/columnHeight)', () => {
    // count <= 1 is the no-fan case (0, covered above); the offset sequence
    // is monotone from the first fanned pair onward.
    let prev = Infinity
    for (let count = 2; count <= 52; count++) {
      const offset = fanOffsetIn(count, 126, 630)
      expect(offset).toBeLessThanOrEqual(prev)
      prev = offset
    }
  })

  it('columnHeightFor: 0.7 of the viewport, floored at two card heights', () => {
    expect(columnHeightFor(800, 126)).toBe(Math.round(800 * COLUMN_HEIGHT_LIMIT)) // 560
    expect(columnHeightFor(1000, 126)).toBe(700)
    // Tiny viewport: 100*0.7 = 70 < 2*126 — the two-card floor kicks in.
    expect(columnHeightFor(100, 126)).toBe(252)
  })
})
