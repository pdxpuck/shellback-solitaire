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
