/** Pure board-layout math for GameView — the fixed-box fan model.
 *  A fan pile's SLOT BOX is constant for a view's lifetime (columnHeight);
 *  the card fan compresses strictly inside it as the pile grows. Slot
 *  heights never depend on live card counts, so grid rows and the felt
 *  table never move during play, and flight predictions computed from
 *  these same functions always agree with the board. */
export const FAN_RATIO = 0.28
export const COLUMN_HEIGHT_LIMIT = 0.7

/** The constant fan-column height for a view: 70% of the viewport height
 *  at mount, never shorter than two card heights. Captured ONCE per view
 *  mount — viewport changes mid-game must not reflow the table. */
export function columnHeightFor(innerHeight: number, cardHeight: number): number {
  return Math.max(Math.round(innerHeight * COLUMN_HEIGHT_LIMIT), cardHeight * 2)
}

/** The per-card vertical offset for a fan of `count` cards: the base fan
 *  spread, compressed as needed so cardHeight + (count-1)*offset ALWAYS
 *  fits columnHeight — for every count up to a full 52-card deck. A deep
 *  pile compresses (cards overlap more tightly); the box never grows.
 *  count <= 1 yields 0 (a single card fans with no offset). */
export function fanOffsetIn(count: number, cardHeight: number, columnHeight: number): number {
  if (count <= 1) return 0
  const base = cardHeight * FAN_RATIO
  const fit = (columnHeight - cardHeight) / (count - 1)
  return Math.min(base, Math.max(fit, 0))
}

/** The solved card-width floor: below this a 7-column row is unreadable,
 *  so the solve clamps here even when the content box is narrower (the
 *  row then overflows into the board's internal scroller). */
export const MIN_CARD_WIDTH = 42
/** The laptop-era keeper card width (D10) — the solve's ceiling. */
export const MAX_CARD_WIDTH = 90

/** The inter-column gap for a card width (v0.5.1): a linear ramp from the
 *  42px card-width floor — round((w − 42)/4), clamped to [4, 12]. Phones
 *  get a flat 4px tap-gutter floor (the old proportional 12/90 gap shrank
 *  toward 4 only near the floor and starved the row of breathing room);
 *  the ramp preserves the proportional-above-keeper feel at the top end
 *  (86 → 11, 90 → 12 — byte-identical desktop). Pure; no window reads. */
export function gapFor(cardWidth: number): number {
  return Math.min(12, Math.max(4, Math.round((cardWidth - 42) / 4)))
}

/** The waste right-fan step for a card width (v0.5.1): round(w · 14/90) —
 *  the desktop 90px card keeps the v0.4.8 14px step byte-identical; a
 *  48px phone card fans at 7px. THE shared fan geometry: the board render
 *  AND the flight-landing offsets both consume this function (the v0.4.3
 *  lesson — predictions must use the same pure function the board
 *  renders, or flights misland). Pure; no window reads. */
export function wasteFanStep(cardWidth: number): number {
  return Math.round((cardWidth * 14) / 90)
}

/** The depth-sliver extent for a card width (v0.5.1): round(w · 12/90) —
 *  12px at the desktop 90px card (byte-identical to the v0.4.8/v0.4.9
 *  fixed extents), 6px at 48. The board renders the >3-cards sliver at
 *  half this extent and the >10-cards sliver at the full extent, peeking
 *  left of the pile; boardPads reserves extent + 4 on the board's left.
 *  Pure; no window reads. */
export function sliverExtent(cardWidth: number): number {
  return Math.round((cardWidth * 12) / 90)
}

/** The reserve depth-sliver LEFT offsets for a squared stack of
 *  `cardCount` cards (v0.5.2): the 3px .waste-depth strips peeking left of
 *  the reserve slot, negative relative to the slot's left edge. Ladder:
 *  [] at count <= 1 (nothing to cue), one at -extent/3 for 2-3 cards (the
 *  v0.5.1 gap — a 2-3-card reserve had no cue at all and read as a single
 *  card, per the field report), two at -extent/3 and -2·extent/3 for 4-10,
 *  and three through the full extent at >= 11. Each offset is Math.round-
 *  ed (sliverExtent's rounding style); the deepest never exceeds
 *  sliverExtent, so the board's reserved left pad (sliverExtent + 4)
 *  contains every band — no boardPads change, no layout shift. Pure; no
 *  window reads. */
export function reserveSliverOffsets(cardCount: number, sliverExtent: number): number[] {
  if (cardCount <= 1) return []
  const third = Math.round(-sliverExtent / 3)
  const twoThirds = Math.round((-2 * sliverExtent) / 3)
  if (cardCount <= 3) return [third]
  if (cardCount <= 10) return [third, twoThirds]
  return [third, twoThirds, -sliverExtent]
}

/** The .board inline horizontal paddings for a card width (v0.5.1): the
 *  proportional chrome reserved for the depth slivers (left =
 *  sliverExtent + 4) and the waste right-fan (right = 2 fan steps + 4) —
 *  both exist solely to keep the fan/sliver overhangs inside the board's
 *  box so the scroller never grows a horizontal bar. At the desktop 90px
 *  card this yields {left: 16, right: 32} — byte-identical to the fixed
 *  CSS constants it replaced (which remain as the no-JS fallback).
 *  Pure; no window reads. */
export function boardPads(cardWidth: number): { left: number; right: number } {
  return { left: sliverExtent(cardWidth) + 4, right: 2 * wasteFanStep(cardWidth) + 4 }
}

/** The .game-screen horizontal padding for a viewport width — the JS mirror
 *  of index.css: 24px per side on desktop (`padding: 16px 24px`), 12px per
 *  side under the phone rule (`padding: 16px 12px`). The 520 breakpoint here
 *  and the CSS `@media (max-width: 520px)` rule (index.css, the L2 phone
 *  block) MUST move together — both carry a comment saying so. Pure; no
 *  window reads (GameView passes window.innerWidth at mount). */
export function gameScreenPadX(innerWidth: number): number {
  return innerWidth <= 520 ? 12 : 24
}

/** The two-pass joint solve for one CONTENT width (card width and gap
 *  depend on each other): pass 1 sizes the card at the 7.8 divisor
 *  (7 columns + 6 gaps at the 12px keeper gap); pass 2 re-solves with the
 *  real gap that width implies. Pass 2's candidate w2 wins only under the
 *  GUARD: gapFor(w2) <= g1 AND the full row INCLUDING the w2-consistent
 *  chrome (boardPads(w2)) fits the actual board outer. Without the guard,
 *  the historical min(w1, w2) conservatism left exact-fit slack on the
 *  table (a 388 outer solved to 46 where 48 fits exactly — the chrome is
 *  flat across 46→48, so the row landed at 388 == outer only at 48);
 *  with it, the upgrade provably never overflows the outer box. Below
 *  the physical content floor 7*MIN_CARD_WIDTH +
 *  6*gapFor(MIN_CARD_WIDTH) the MIN clamp binds — the caller gets the
 *  floor and the scroller absorbs the overflow. Private core of
 *  cardWidthFor; not exported. */
function solveCardWidth(contentWidth: number, boardOuter: number): number {
  const w1 = Math.min(MAX_CARD_WIDTH, Math.max(MIN_CARD_WIDTH, Math.floor(contentWidth / 7.8)))
  const g1 = gapFor(w1)
  const w2 = Math.min(
    MAX_CARD_WIDTH,
    Math.max(MIN_CARD_WIDTH, Math.floor((contentWidth - 6 * g1) / 7)),
  )
  const pads2 = boardPads(w2)
  if (gapFor(w2) <= g1 && 7 * w2 + 6 * gapFor(w2) + pads2.left + pads2.right <= boardOuter) {
    return w2
  }
  return Math.min(w1, w2)
}

/** The card width that fits a BOARD OUTER width (v0.5.1 contract): the
 *  post-game-screen-pad board box, already capped at its 960px CSS
 *  max-width by the caller — this function knows no CSS. The board's
 *  reserved chrome (depth slivers + waste fan, via boardPads) is
 *  PROPORTIONAL to the card width, so card width and chrome co-depend:
 *  fixed-point iteration resolves it — start at the keeper width, then
 *  three rounds of { pads ← boardPads(w); content ← outer − pads;
 *  w ← solveCardWidth(content, outer) }. The guarded solve only ever
 *  returns a width whose FULL row + its own chrome fits the actual outer
 *  (or the conservative min-pass answer otherwise), and chrome is
 *  monotone in w. The orbit need not reach a fixed point (see KNOWN
 *  QUIRK below) — fit is what the sweep guarantees: the step-1 sweep in
 *  layout.test.ts fences fit at the returned width AND at the re-solved
 *  width for every outer 280..1400. The desktop 960px outer is a stable
 *  fixed point at 90 —
 *  boardPads(90) = {16, 32} → content 912 → solve → 90 (D10: byte-
 *  identical laptop layout). A 412px phone (388 outer) converges to 48 —
 *  the exact-fit fixed point: the chrome is flat across 46→48
 *  (boardPads(48) = {10, 18}), so 7*48 + 6*4 + 28 = 388 lands exactly on
 *  the outer — up from the v0.5.0 43px.
 *
 *  MOUNT-CONSTANT CONTRACT: like columnHeightFor, this is captured ONCE
 *  per view mount — viewport changes mid-game must not reflow the table.
 *
 *  KNOWN QUIRK — NOT monotone in the outer: at the gap-ramp's rounding
 *  boundaries the answer can DIP as the outer grows (18 such dips across
 *  280..1400, e.g. outer 401 → 49 but 402 → 47). Cosmetic by contract:
 *  the solve runs once per mount against the device's real viewport (see
 *  MOUNT-CONSTANT CONTRACT above), so widths are never re-ordered in the
 *  field — the invariant that matters is FIT at the returned width, which
 *  the step-1 sweep in layout.test.ts fences at both the returned w and
 *  the re-solved w' for every outer 280..1400.
 *
 *  Below the physical outer floor 7*MIN_CARD_WIDTH +
 *  6*gapFor(MIN_CARD_WIDTH) + boardPads(MIN_CARD_WIDTH) the MIN clamp
 *  binds — callers get the floor and the scroller absorbs the overflow. */
export function cardWidthFor(boardOuter: number): number {
  let w = MAX_CARD_WIDTH
  for (let i = 0; i < 3; i++) {
    const pads = boardPads(w)
    const content = boardOuter - pads.left - pads.right
    w = solveCardWidth(content, boardOuter)
  }
  return w
}
