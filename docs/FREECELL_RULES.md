# FreeCell — Rules Digest (game #3)

- **Captured:** 2026-10-22 (pre-code, per GAME_CHECKLIST §1)
- **Primary source:** Wikipedia, "FreeCell" (revision 1372643794, 2026-09-01) — https://en.wikipedia.org/wiki/FreeCell — rules + supermove sections
- **Secondary context (same article):** ~99.999% of deals solvable (Keller, FreeCell FAQ, solitairelaboratory.com/fcfaq.html); FreeCell Pro study (Pringle & Fish 2018): ~1 unsolvable deal in 84,000

## The game

One standard 52-card deck, all cards dealt FACE-UP from the start. Four open
CELLS, four suit-keyed FOUNDATIONS, eight TABLEAU cascades — four cascades of
seven cards, four of six (row-wise deal). Tableaus build DOWN in alternating
colors; foundations build UP by suit from Ace. Any cell card or cascade top
may move to a tableau, an empty cell, an empty cascade, or its foundation.
Won when all 52 cards sit on the foundations.

## Supermoves (DC2)

Only ONE card moves at a time; a "supermove" is the compound sequence a
computer performs to present a whole-run move. Maximum run length that can
move to another cascade: C = 2^M × (N + 1), where M = number of empty
cascades and N = number of empty cells (Wikipedia, citing boardgames
stackexchange 45157). Moving TO an EMPTY cascade: capacity is C/2 (the
destination cannot serve as its own intermediate). Empties are counted in
the position BEFORE the move; the destination is excluded from M when the
destination itself is empty (that is what the C/2 half expresses).

## Decisions locked with the user (2026-10-22)

- **DC1 — layout:** 8 tableau cascades t0..t7 (deal 7-7-7-7-6-6-6-6 row-wise:
  card i of the shuffled deck lands on cascade i mod 8), 4 free cells
  cell-0..cell-3, 4 suit-keyed foundations found-S/found-H/found-D/found-C
  (A→K by suit). No stock, no waste.
- **DC2 — supermoves:** MS-FreeCell style compound moves, capacity per the
  formula above. Valid moved sequences only: a run must itself be a
  descending alternating-color sequence (FreeCell's face-up cards are NOT
  automatically sequenced, unlike Canfield).
- **DC3 — cells:** max 1 card each; any card to any empty cell; cell cards
  play to cascades or foundations freely.
- **DC4 — empty cascades:** accept any card / run head — no King restriction.
- **DC5 — auto-fly (safeAutoMoves):** the classic safety rule — a card of
  rank r may auto-fly to its foundation iff r ≤ min(opposite-color
  foundation ranks) + 1, an empty foundation counting as rank 0. (Aces are
  therefore always safe.) Candidates: cascade tops + cell tops. Honors the
  existing safe-fly settings toggle.
- **DC6 — one-way foundations:** cards may NOT be pulled back off a
  foundation (Wikipedia's move list omits foundation→tableau; matches MS
  FreeCell and this codebase's Canfield locked-foundations precedent).
- **DC7 — cell→cell moves are NOT enumerated:** legal under the raw rules,
  but excluded from legalMoves — the enumeration drives click UX,
  quick-move, and hints, and a cell→cell legal move would make single-tap
  quick-move waste a tap shuffling cards between cells. Dragging a cell
  card onto another cell will snap back (acceptable); revisit if it ever
  bothers anyone in play.

## Deal numbers

Standard collection range 1..1,000,000 (the # IS the seed). Microsoft's
famous 32,000-deal numbering (its own LCG) is OUT OF SCOPE for v1 — our
deal numbers are our own; MS-deal compatibility could be a future
variant feature, not silently assumed.

## Expected deckhand game-contract / view churn (checklist §1 item 3)

1. NOTHING in deckhand: the contract already has the 'cell' PileRole, and
   deckSpec STANDARD covers the 52-card deck. Zero deckhand changes expected.
2. Collection-side generalization (the CB3 "zero GameView code changes" rule
   is respected by DERIVING from config, never special-casing):
   - Board grid columns: GameView's inline `repeat(7, …)` becomes
     `repeat(max(layout.col)+1, …)` — derived from definition.layout.
   - layout.ts card solve: solveCardWidth/cardWidthFor hard-code 7 columns;
     parameterize (columns, default 7) — existing callers byte-identical.
   - layout.ts boardPads: FreeCell has no waste fan and no depth slivers, so
     its reserved chrome is zero — boardPads gains a depth-chrome flag
     (default true); GameView derives the flag from the definition's pile
     roles (waste/reserve present?).
   - RulesPanel diagram grid: verify whether its column count is derived or
     hard-coded 7; derive from layout if hard-coded.
3. Auto-fly is ACTIVE for the first time since Klondike (Canfield's returned
   [] — DC5 there): play.ts's safeFlights fixpoint machinery (already
   written) gets its second real consumer.

## Test inventory (checklist §6)

- Deal: same seed → JSON-identical; different seeds differ; 52 distinct
  cards; all face-up; cascade counts 7×4 + 6×4; cells/foundations empty.
- legalMoves positive+negative: foundation builds (suit-keyed, ace-open,
  no wrap, one-way per DC6); tableau builds (alternating colors, rank-1,
  negatives for same-color and wrong-rank); cell capacity (full cells
  reject); empty-cascade acceptance (any card per DC4, not just kings);
  run-sequence validity (non-sequenced face-up run rejected per DC2);
  supermove capacity boundaries (L = C passes, C+1 rejected; empty
  destination L = C/2 passes, C/2+1 rejected); cell→cell ABSENT (DC7).
- Emit-order test (deterministic order documented in the definition header).
- Replay consistency: scripted legal walks, stepwise == batched.
- safeAutoMoves: ace flies; 2 flies only when both opposite aces are up;
  unsafe card stays; fixpoint via play.ts.
- play.ts: save/load round-trip, corrupt-save → null, deal numbers,
  flights fixpoint with real batches.
- gameViews config invariants pick up FreeCell automatically (rules content
  + label coverage gates iterate GAME_VIEWS).
