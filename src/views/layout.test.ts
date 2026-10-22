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
  boardPads,
  cardWidthFor,
  columnHeightFor,
  fanOffsetIn,
  gameScreenPadX,
  gapFor,
  reserveSliverOffsets,
  sliverExtent,
  wasteFanStep,
} from './layout'

/** Verbatim replica of layout.ts's private two-pass solve (solveCardWidth
 *  is un-exported, so the assertions replicate it — if the real core and
 *  this replica drift, these tests silently stop fencing it; both carry
 *  this comment). Takes the BOARD OUTER separately: the guarded pass-2
 *  upgrade checks the full row INCLUDING the w2-consistent chrome against
 *  the actual outer, not the stale-chrome content box. */
const solve = (content: number, boardOuter: number): number => {
  const w1 = Math.min(MAX_CARD_WIDTH, Math.max(MIN_CARD_WIDTH, Math.floor(content / 7.8)))
  const g1 = gapFor(w1)
  const w2 = Math.min(
    MAX_CARD_WIDTH,
    Math.max(MIN_CARD_WIDTH, Math.floor((content - 6 * g1) / 7)),
  )
  const pads2 = boardPads(w2)
  return gapFor(w2) <= g1 && 7 * w2 + 6 * gapFor(w2) + pads2.left + pads2.right <= boardOuter
    ? w2
    : Math.min(w1, w2)
}

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

describe('layout — mount-time card sizing (L2 mobile pass, v0.5.1 proportional chrome)', () => {
  it('gapFor: flat tap-gutter floor on phones, linear ramp to the 12px keeper gap', () => {
    expect(gapFor(42)).toBe(4) // the solve's card-width floor: gutter floor
    expect(gapFor(48)).toBe(4) // the phone regime: flat 4px tap gutter
    expect(gapFor(60)).toBe(5) // round((60-42)/4) — the ramp begins
    expect(gapFor(80)).toBe(10)
    expect(gapFor(86)).toBe(11)
    expect(gapFor(90)).toBe(12) // the laptop keeper: exactly the CSS gap
    expect(gapFor(20)).toBe(4) // floor clamp
    expect(gapFor(200)).toBe(12) // ceiling clamp
  })

  it('wasteFanStep / sliverExtent / boardPads: desktop identity at 90, phone rescale at 48', () => {
    // THE desktop-identity assertion (D10): at the keeper 90px card every
    // derived chrome equals the fixed constant it replaced — if this
    // regresses, the laptop layout is no longer byte-identical.
    expect(wasteFanStep(90)).toBe(14)
    expect(sliverExtent(90)).toBe(12)
    expect(boardPads(90)).toEqual({ left: 16, right: 32 })
    // Phone rescale: the chrome shrinks with the cards.
    expect(wasteFanStep(48)).toBe(7)
    expect(sliverExtent(48)).toBe(6)
    expect(boardPads(48)).toEqual({ left: 10, right: 18 })
  })

  it('cardWidthFor fixpoints: desktop 960 → 90 (D10), phone 388 → 48 (exact fit), tablet 720 → 86', () => {
    // 960 = the desktop board outer (min(1920 − 2×24, 960)) — the stable
    // keeper fixed point: boardPads(90) = {16,32} → content 912 → solve → 90.
    expect(cardWidthFor(960)).toBe(MAX_CARD_WIDTH)
    // 388 = a 412px phone's board outer (412 − 2×gameScreenPadX(412)).
    // Exact-fit fixed point 48: boardPads(48) = {10,18} → content 360 →
    // solve → 48. The guarded two-pass solve takes w2 = floor(360/7) = 48
    // because the chrome is FLAT across 46→48 ({10, 18} at both widths):
    // the full row 7*48 + 6*4 + 10 + 18 = 388 lands exactly on the outer —
    // zero margin. (The old min(w1, w2) conservatism returned
    // w1 = floor(360/7.8) = 46 and left 2px of the phone's slack on the
    // table.)
    expect(cardWidthFor(388)).toBe(48)
    // 720 mid tablet: whatever the solve produces, it must FIT its outer
    // box (row + its own chrome), and it lands at 86.
    const tablet = cardWidthFor(720)
    const tabletPads = boardPads(tablet)
    expect(
      7 * tablet + 6 * gapFor(tablet) + tabletPads.left + tabletPads.right,
    ).toBeLessThanOrEqual(720)
    expect(tablet).toBe(86)
    // Clamps: tiny outers floor at MIN, huge outers stay at the keeper.
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
    // The pinned chain: 412 − 2×12 (gameScreenPadX) = 388 board outer →
    // cardWidthFor derives the chrome internally and lands on 48 (the
    // v0.5.1 proportional-chrome phone card at its exact-fit fixed point;
    // was 43 under the fixed 48px chrome reservation, 46 under the
    // unguarded min() tie-break).
    expect(412 - 2 * gameScreenPadX(412)).toBe(388)
    expect(cardWidthFor(412 - 2 * gameScreenPadX(412))).toBe(48)
  })

  it('INVARIANT: 7 cards + 6 gaps + chrome fit the outer width — at BOTH emitted answers (w and the re-solved w\') — for every width 280..1400 step 1 — the fits-a-phone fence', () => {
    // Below the physical floor the MIN clamp binds by design (no 7-column
    // row + chrome fits) — the solve must return the floor itself, never
    // invent a wider card; the board's internal scroller absorbs the
    // overflow. The floor is OUTER-space since v0.5.1 (row + chrome at
    // MIN — the 42px-clamp band grew with the proportional reservation),
    // recomputed here from the functions.
    const floorPads = boardPads(MIN_CARD_WIDTH)
    const physicalFloor =
      7 * MIN_CARD_WIDTH + 6 * gapFor(MIN_CARD_WIDTH) + floorPads.left + floorPads.right // 346
    for (let outer = 280; outer <= 1400; outer += 1) {
      const cardWidth = cardWidthFor(outer)
      const pads = boardPads(cardWidth)
      if (outer < physicalFloor) {
        expect(cardWidth).toBe(MIN_CARD_WIDTH)
      } else {
        // (a) fit at the returned w: row + the w-consistent chrome.
        expect(7 * cardWidth + 6 * gapFor(cardWidth) + pads.left + pads.right).toBeLessThanOrEqual(
          outer,
        )
        // (b) fit at the re-solved w'. Production semantics (planner
        // ruling): cardWidthFor runs ONCE per view mount — there is no
        // re-solve — so the invariant is NOT w' == w (orbit identity) but
        // USABLE GEOMETRY: wherever the 3-round orbit lands, what it
        // emitted must fit. Solve once more against the same outer
        // context (the returned width's own chrome) and demand fit at w'
        // too — any solution the algorithm can emit is a usable geometry.
        // If either fit assertion ever fails, do NOT loosen the test —
        // report the failing outer values and stop (planner decides).
        const wPrime = solve(outer - pads.left - pads.right, outer)
        const padsPrime = boardPads(wPrime)
        expect(
          7 * wPrime + 6 * gapFor(wPrime) + padsPrime.left + padsPrime.right,
        ).toBeLessThanOrEqual(outer)
      }
    }
  })

  it('FIXPOINT stability: one extra chrome iteration never changes the returned width', () => {
    // solve(solve(x)) == solve(x) semantics: recompute the chrome at the
    // returned width and re-run the two-pass solve on the content box that
    // chrome implies — a genuine fixed point reproduces itself. (The
    // two-pass solve is cardWidthFor's un-exported core; the shared
    // module-level `solve` replica stands in for it.) The step-1 sweep
    // above now fences the FIT invariant for every outer 280..1400 —
    // w' == w is no longer a requirement (the mount solve runs once;
    // planner ruling) — so these named fixtures stay as the readable
    // canaries pinning outers that ARE exact fixed points.
    for (const outer of [960, 388, 720]) {
      const w = cardWidthFor(outer)
      const pads = boardPads(w)
      expect(solve(outer - pads.left - pads.right, outer)).toBe(w)
    }
  })
})

describe('layout — reserve depth-sliver ladder (v0.5.2)', () => {
  it('ladder table: 0-1 cards cue nothing, 2-3 one sliver, 4-10 two, 11+ three', () => {
    // The v0.4.9 squared reserve showed zero cues below 4 cards (the field
    // report: a 2-3-card reserve read as a single face-up card). The ladder
    // must cue every populated count up to the full 13-card deal.
    expect(reserveSliverOffsets(0, 12)).toEqual([])
    expect(reserveSliverOffsets(1, 12)).toEqual([])
    expect(reserveSliverOffsets(2, 12)).toHaveLength(1)
    expect(reserveSliverOffsets(3, 12)).toHaveLength(1)
    expect(reserveSliverOffsets(4, 12)).toHaveLength(2)
    expect(reserveSliverOffsets(10, 12)).toHaveLength(2)
    expect(reserveSliverOffsets(11, 12)).toHaveLength(3)
    expect(reserveSliverOffsets(13, 12)).toHaveLength(3)
  })

  it('exact offsets at the desktop extent 12: [-4] / [-4,-8] / [-4,-8,-12]', () => {
    expect(reserveSliverOffsets(2, 12)).toEqual([-4])
    expect(reserveSliverOffsets(3, 12)).toEqual([-4])
    expect(reserveSliverOffsets(4, 12)).toEqual([-4, -8])
    expect(reserveSliverOffsets(10, 12)).toEqual([-4, -8])
    expect(reserveSliverOffsets(11, 12)).toEqual([-4, -8, -12])
    expect(reserveSliverOffsets(13, 12)).toEqual([-4, -8, -12])
  })

  it('exact offsets at the phone extent 6: [-2] / [-2,-4] / [-2,-4,-6]', () => {
    expect(reserveSliverOffsets(2, 6)).toEqual([-2])
    expect(reserveSliverOffsets(3, 6)).toEqual([-2])
    expect(reserveSliverOffsets(4, 6)).toEqual([-2, -4])
    expect(reserveSliverOffsets(10, 6)).toEqual([-2, -4])
    expect(reserveSliverOffsets(11, 6)).toEqual([-2, -4, -6])
    expect(reserveSliverOffsets(13, 6)).toEqual([-2, -4, -6])
  })

  it('MONOTONE-EXTENDS: each band is a prefix of the next, and every offset stays within sliverExtent', () => {
    // Prefix property: the render never moves an existing sliver when the
    // count crosses a band boundary — cards only ever ADD strips. The
    // bound fence pins the containment contract: no offset peeks right of
    // the slot and the deepest never exceeds sliverExtent, so the board's
    // reserved left pad (sliverExtent + 4) holds every band with no layout
    // shift. (Math.round can yield -0 at sub-production extents — 0 is the
    // correct bound, not -1; production extents are sliverExtent(42..90)
    // = 6..12.)
    for (let extent = 1; extent <= 12; extent++) {
      const one = reserveSliverOffsets(2, extent)
      const two = reserveSliverOffsets(4, extent)
      const three = reserveSliverOffsets(11, extent)
      expect(two.slice(0, one.length)).toEqual(one)
      expect(three.slice(0, two.length)).toEqual(two)
      for (const left of three) {
        expect(left).toBeLessThanOrEqual(0)
        expect(left).toBeGreaterThanOrEqual(-extent)
      }
    }
  })
})

describe('layout — parameterized boards (FreeCell: 8 columns, no waste fan, no depth slivers)', () => {
  it('boardPads with depthChrome=false reserves zero chrome on both sides', () => {
    expect(boardPads(90, false)).toEqual({ left: 0, right: 0 })
  })

  it('cardWidthFor(960, 8, false): the 8-column no-chrome row fits the desktop outer', () => {
    const w = cardWidthFor(960, 8, false)
    expect(8 * w + 7 * gapFor(w)).toBeLessThanOrEqual(960)
    expect(w).toBe(MAX_CARD_WIDTH)
  })

  it('cardWidthFor(388, 8, false): the row fits the phone outer with no chrome on either side', () => {
    const w = cardWidthFor(388, 8, false)
    // The fit invariant is the hard gate: the 8-card row (with the flat
    // 4px phone gutter) lands inside the 388 outer with zero chrome.
    expect(8 * w + 7 * gapFor(w)).toBeLessThanOrEqual(388)
    // The real value, pinned: 44 — NOT the exact-fit 45 (8*45 + 7*4 =
    // 388). The private solve's guard always prices the fan/sliver chrome
    // (boardPads(w2)), so w2 = 45 pays 28px of phantom chrome (416 > 388)
    // and loses the guard; the conservative min-pass answer 44 wins
    // (row 380, 8px slack). Fit — never overflow — is what matters.
    expect(w).toBe(44)
  })

  it('INVARIANT: every sweep point (outer 320..1400 step 60, columns 7|8, chrome on|off) either fits its outer or is the documented MIN-clamp scroller case', () => {
    // Below the physical outer floor (columns*MIN + (columns-1)*gapFor(MIN)
    // + boardPads(MIN, depthChrome)) no row fits by design — the MIN clamp
    // binds, w is the floor itself, and the board's internal scroller
    // absorbs the overflow. Anywhere else, the emitted row + its own
    // (depthChrome-consistent) pads must fit the outer.
    for (let outer = 320; outer <= 1400; outer += 60) {
      for (const columns of [7, 8]) {
        for (const depthChrome of [true, false]) {
          const w = cardWidthFor(outer, columns, depthChrome)
          const pads = boardPads(w, depthChrome)
          const fits =
            columns * w + (columns - 1) * gapFor(w) + pads.left + pads.right <= outer
          const rowAtMin = columns * MIN_CARD_WIDTH + (columns - 1) * gapFor(MIN_CARD_WIDTH)
          const padsAtMin = boardPads(MIN_CARD_WIDTH, depthChrome)
          const minClampOverflows =
            w === MIN_CARD_WIDTH && rowAtMin + padsAtMin.left + padsAtMin.right > outer
          expect(fits || minClampOverflows).toBe(true)
        }
      }
    }
  })
})
