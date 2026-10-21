/**
 * Unit tests for the pure board-layout math (the fixed-box fan model).
 * Test 3 is THE regression fence for the felt-resizing field bug: a fan
 * must fit its constant box for every pile size up to a full deck — if it
 * ever overflows, the box (and the felt with it) starts growing again.
 */

import { describe, expect, it } from 'vitest'
import {
  COLUMN_HEIGHT_LIMIT,
  FAN_RATIO,
  MAX_CARD_WIDTH,
  MIN_CARD_WIDTH,
  cardWidthFor,
  columnHeightFor,
  fanOffsetIn,
  gameScreenPadX,
  gapFor,
} from './layout'

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

describe('layout — mount-time card sizing (L2 mobile pass)', () => {
  it('gapFor: proportional at the 12/90 ratio, clamped to [4, 12]', () => {
    expect(gapFor(90)).toBe(12) // the laptop keeper: exactly the CSS gap
    expect(gapFor(43)).toBe(6) // the 412px-phone card
    expect(gapFor(20)).toBe(4) // floor clamp
    expect(gapFor(200)).toBe(12) // ceiling clamp
  })

  it('cardWidthFor: laptop content keeps the 90px card (D10), phone content fits', () => {
    // 912 = the laptop board content box (min(1920 - 48, 960) - 48).
    expect(cardWidthFor(912)).toBe(MAX_CARD_WIDTH)
    // 340 = a 412px phone's content box: 412 - 2×gameScreenPadX(412) - 48
    // (the .board paddings) — the full chain is pinned in the
    // gameScreenPadX case below.
    expect(cardWidthFor(340)).toBe(43)
    // Clamps: tiny content floors at MIN, huge content stays at the keeper.
    expect(cardWidthFor(100)).toBe(MIN_CARD_WIDTH)
    expect(cardWidthFor(5000)).toBe(MAX_CARD_WIDTH)
  })

  it('gameScreenPadX: mirrors the ≤520px media query (FIX B — truthful padding)', () => {
    // The solver's padding must equal the padding the CSS actually applies
    // at the viewport: 12px/side at ≤520 (index.css @media (max-width:
    // 520px)), 24px/side above it. The 520 here and in index.css MUST move
    // together — both comments say so.
    expect(gameScreenPadX(412)).toBe(12)
    expect(gameScreenPadX(520)).toBe(12) // max-width is inclusive — phone-side
    expect(gameScreenPadX(521)).toBe(24)
    expect(gameScreenPadX(768)).toBe(24)
    expect(gameScreenPadX(1024)).toBe(24)
    expect(gameScreenPadX(1920)).toBe(24)
    // The pinned chain: 412 - 2×12 (gameScreenPadX) - 48 (board pads) =
    // 340 content → cardWidthFor(340) = 43 — the phone derives 43, not
    // the 42 the old desktop-padding assumption produced.
    expect(412 - 2 * gameScreenPadX(412) - 48).toBe(340)
    expect(cardWidthFor(412 - 2 * gameScreenPadX(412) - 48)).toBe(43)
  })

  it('INVARIANT: 7 cards + 6 gaps fit the content width for every width 280..1400 — the fits-a-phone fence', () => {
    // Below the physical floor the MIN clamp binds by design (no 7-column
    // row fits) — the solve must return the floor itself, never invent a
    // wider card; the board's internal scroller absorbs the overflow.
    const physicalFloor = 7 * MIN_CARD_WIDTH + 6 * gapFor(MIN_CARD_WIDTH)
    for (let contentWidth = 280; contentWidth <= 1400; contentWidth += 10) {
      const cardWidth = cardWidthFor(contentWidth)
      if (contentWidth < physicalFloor) {
        expect(cardWidth).toBe(MIN_CARD_WIDTH)
        continue
      }
      expect(7 * cardWidth + 6 * gapFor(cardWidth)).toBeLessThanOrEqual(contentWidth)
    }
  })

  it('cardWidthFor is non-decreasing in contentWidth (the mount solve never surprises)', () => {
    // Spot pairs — including the 498/500 band where pass 2's gap jump used
    // to make the naive solve jump UP past its own fit.
    expect(cardWidthFor(400)).toBeLessThanOrEqual(cardWidthFor(410))
    expect(cardWidthFor(490)).toBeLessThanOrEqual(cardWidthFor(500))
    expect(cardWidthFor(690)).toBeLessThanOrEqual(cardWidthFor(700))
    // ...and the whole sweep, so no pair can hide a dip.
    let prev = MIN_CARD_WIDTH
    for (let contentWidth = 280; contentWidth <= 1400; contentWidth += 10) {
      const cardWidth = cardWidthFor(contentWidth)
      expect(cardWidth).toBeGreaterThanOrEqual(prev)
      prev = cardWidth
    }
  })
})
