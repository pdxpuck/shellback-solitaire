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

/** The inter-column gap for a card width: proportional to the classic
 *  12px-at-90px ratio, clamped to [4, 12] — tiny cards keep a tappable
 *  gutter, big cards never sprawl. Pure; no window reads. */
export function gapFor(cardWidth: number): number {
  return Math.min(12, Math.max(4, Math.round((cardWidth * 12) / 90)))
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

/** The card width that fits 7 columns + 6 gaps inside `contentWidth` —
 *  the board's CONTENT-BOX width (the caller unwinds the .game-screen and
 *  .board paddings first; this function knows no CSS).
 *
 *  MOUNT-CONSTANT CONTRACT: like columnHeightFor, this is captured ONCE
 *  per view mount — viewport changes mid-game must not reflow the table.
 *
 *  Two-pass joint solve (card width and gap depend on each other): pass 1
 *  sizes the card at the 7.8 divisor (7 columns + 6 gaps at the 12/90 gap
 *  ratio); pass 2 re-solves with the real gap that width implies. Returns
 *  min(w1, w2): pass 2's floor guarantees 7*w2 + 6*g1 <= contentWidth, but
 *  the returned width pays the gap of its OWN size — when pass 2 moved the
 *  width UP past w1, gapFor(w2) can exceed g1 (e.g. contentWidth = 498:
 *  w2 = 64 wants a 9px gap → 502 > 498), and in that regime w1 provably
 *  fits, so the smaller of the two is the safe answer. Below the physical
 *  floor 7*MIN_CARD_WIDTH + 6*gapFor(MIN_CARD_WIDTH) the MIN clamp binds —
 *  callers get the floor and the scroller absorbs the overflow. */
export function cardWidthFor(contentWidth: number): number {
  const w1 = Math.min(MAX_CARD_WIDTH, Math.max(MIN_CARD_WIDTH, Math.floor(contentWidth / 7.8)))
  const g1 = gapFor(w1)
  const w2 = Math.min(
    MAX_CARD_WIDTH,
    Math.max(MIN_CARD_WIDTH, Math.floor((contentWidth - 6 * g1) / 7)),
  )
  return Math.min(w1, w2)
}
