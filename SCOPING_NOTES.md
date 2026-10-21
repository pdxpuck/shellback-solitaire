# Shellback Solitaire Collection — Scoping Notes

The first game-collection consumer of the deckhand framework. Ships as a real
collection app from day one — games are added as modules, no throwaway test app.

- **Added:** 2026-10-13
- **Origin:** user directive 2026-10-13 ("start a project to contain the solitaire
  efforts... just start with the collection app and add new game instances as we
  grow it"). Name: **Shellback Solitaire Collection** — Shellback Studio umbrella
  tie-in + alliteration (user choice).

## Decisions
- **D1 — Name:** Shellback Solitaire Collection (dir `shellback-solitaire`; standalone repo).
- **D2 — Games:** Klondike first, Canfield second (carried from deckhand D2/D3 —
  the two consumers that validate the game-contract).
- **D3 — App-first:** the collection shell IS the product from day one: home screen
  game grid, games appear as modules. No test app.
- **D4 — Framework dependency:** consumes deckhand via `link:../deckhand` (symlink;
  deckhand 0.3.3+ lib build). During contract churn, rebuild deckhand
  (`npm run build:lib` there), no reinstall needed here. Card art duplicated into
  this repo's public/cards/ by design (deckhand ships no assets).
- **D5 — Theme:** default = byron (deckhand DEFAULT_THEME_ID, user verdict 2026-10-13).
  Card-back options = future theme-system feature.
- **D6 — Persistence:** localStorage vs IndexedDB decided during Klondike (C2).
- **D7 — Repo:** standalone (github.com/pdxpuck/shellback-solitaire, gh-created);
  monorepo .gitignore entry per extraction pattern.

## Phases
| Phase | Delivers | Gate |
|---|---|---|
| C0 | Scaffold + deckhand consumption (engine + renderer working in-app) | build/test/lint green + dev smoke |
| C1 | Collection home screen polish (game grid, settings) | user look |
| C2 | **Klondike playable** — first game module; game-contract types finalized in deckhand during this | user plays it |
| C3 | **Canfield** + contract validation | user plays it |
| C4+ | new games = new modules; stats/undo/persistence polish; wraps later | per feature |

New-game process: every item in `GAME_CHECKLIST.md` (repo root) is checked before a game ships to 'available'.

## C1 decisions (2026-10-13)
- **Game metadata** (family, winnability buckets, status, summary) lives collection-side
  in src/games/registry.ts for C1; migrates into deckhand's game-contract during C2
  when the contract finalizes. Family taxonomy: klondike/canfield/spider/golf/
  pyramid/freecell/yukon/other (extensible). Winnability buckets: very-low/low/
  moderate/high/very-high.
- **Settings** = theme selection only, persisted to localStorage ('shellback.settings.v1',
  validated on load). Win/loss stats DEFERRED — they imply the persistence decision (D6),
  which stays open until C2.
- **In-game toolbar** skeleton: New deal / Undo / Hint (disabled placeholders) + Back to
  main (functional). Klondike's "Preview" reaches the skeleton; full wiring at C2.
- Framework-check strip relocated from landing page into GameView placeholder.

### C2 part 2: board UI (2026-10-13, v0.3.1)
- Click-click: select run/pile -> legal targets highlight -> click target. Stock click = draw;
  empty-stock click = recycle. One click = ONE undo group (rule actions + that click's
  safe-flight batch).
- Saves = {seed, moves} in localStorage ('shellback.klondike-draw1.save.v1'); corrupt or
  rule-breaking saves discarded on load. Win clears the save; win/loss stats still deferred (D6).
- USER ADDITIONS: visible version string (Settings + home footer, __APP_VERSION__ define);
  safe auto-fly is a SETTINGS TOGGLE (default on) — off = manual foundations only.
- Hint remains a stub post-C2.

### Deal numbers (2026-10-13, v0.3.2)
- Every deal carries an integer game # (1..1,000,000) — it IS the seed. Shown in the game
  toolbar + win banner; "Play #" replays any deal exactly (repro + beatable-record
  keeping, FreeCell-style).
- Future (logged, not scheduled): "deal me a winnable hand" — needs a Klondike solver.
  Unlike FreeCell (famous known-unwinnable lists), Klondike has no canonical lookup
  lists; studies put draw-1 solvability around 80-90% with perfect play.

## Game contract (pointer)
The six-part contract lives in deckhand (see deckhand/SCOPING_NOTES.md): deck spec →
pile topology → move validator → auto-move policy → win/loss detector → layout hints.
Klondike (C2) is its first real implementation; expect the contract to churn.

### C2 play gate verdict (2026-10-13, user)
- **PASSED with UI feedback** — Klondike Draw-1 playable end-to-end; rules sound.
- **Auto-fly animation needed:** safe-fly moves happen at machine speed and are easy
  to miss — cards should visibly FLOAT to their destination (~200-300 ms per card,
  sequenced, not simultaneous). Top of the C3 polish list.
- **Interaction model re-opened for expansion:** click-click works but may not be the
  final model — add double-click (send to foundation) and/or drag-and-drop as
  additional interaction modes. Click-click remains supported.
- Deal numbers + Play-# replay + settings (theme, auto-fly) all verified in play.

### C3 batch A: flight animation (2026-10-15, v0.3.3)
- Card-flight overlay wired into GameView per the verdict above: state stays INSTANT and
  authoritative — commit applies the final state immediately; the flight layer is purely
  cosmetic and cancellable at any moment (new commit / undo / new deal / unmount all cancel;
  the board snaps to the final layout).
- Sequenced steps: one 200 ms eased leg per move action at a 220 ms cadence; a run or a
  waste recycle flies as one mass; the win banner waits until flights land.
- Geometry measured BEFORE setState via data-pile-id / data-card-id DOM hooks; tableau
  landings use the landed fan offset (landedOnCount — new flightSteps field); multi-leg
  cards chain leg-to-leg and never re-query the DOM.
- prefers-reduced-motion or any missing DOM hook skips flights entirely (instant fallback).

### C3 batch B: double-click to foundation (2026-10-15, v0.3.4)
- Double-click any playable card/run → the FIRST legal foundation move commits (quick-fly);
  click-click is byte-identical; the stock keeps its exclusive click semantics (draw/recycle).
- A foundation top card never flies FROM a foundation (rule in foundationMove) — pulling a
  card back off a foundation stays a deliberate click-click.
- groupMoves + MoveGroup extracted verbatim from GameView into games/klondike/interaction.ts,
  joined by the pure foundationMove lookup — unit-tested in interaction.test.ts.
- Playtest 2026-10-15 (v0.3.5) addendum:
  (a) animations PASSED with one defect — a card with back-to-back legs (draw→foundation)
  blinked via two sequential ghost legs; legs now collapse to ONE arc per card (hideUntil map
  replaces spec-derived hiding).
  (b) foundation-only quick-fly worked but felt unintuitive → quickMove: foundation-first,
  else the UNIQUE legal destination, ambiguous → nothing (click-click disambiguates).
  (c) user asked for slower, user-adjustable animation speed → flightSpeed setting
  (slow 400/480, med 280/340 default, fast 180/220 — leg/cadence ms); settings
  validation restructured per-field (an unknown theme no longer wipes a valid autoFly).
  (d) flights BLANKED their destination pile while a card flew into it (v0.3.7 fix):
  renderPile's waste/foundation branch rendered ONLY the pile's top card, so when
  that top was the still-flying (hidden) incoming card nothing rendered until the arc
  landed; the branch now renders the topmost VISIBLE card down (findLastIndex over
  non-hidden cards, slice from there — hidden top keeps its data-card-id hook so
  flight measurement still finds it).
  (e) settings were reachable only from Home (v0.3.7): the game toolbar gains a
  Settings button (between Hint and Back to main); Back returns to wherever
  Settings was opened from — home or the game (origin-aware return target).
  (f) win banner offered only "New deal" (v0.3.8): it gains a secondary
  "Back to main" button (New deal stays primary).
  (g) flying ghosts painted UNDER deep tableau piles (v0.3.8): root cause —
  .fan-card zIndex equals the card's pile index (0..N, unbounded) and pile
  slots never created stacking contexts, so fan-card z-indices competed
  globally across the board; any pile deeper than ~6 cards painted above the
  z-5 flight layer. Fix: .pile-slot gets isolation: isolate — card z becomes
  pile-local and can no longer race the flight layer.
  (h) a move that exposed a face-down tableau card rendered the flip INSTANTLY —
  the newly exposed card showed face-up while its uncovering card was still
  mid-flight (v0.3.10). Fix: flips are now part of the flight plan — flightSteps
  → flightPlan, which records revealAt (cardId → the step index of the move that
  EXPOSED the flip); GameView renders that card face-down until the exposing
  leg's settle timer fires (lift → land → THEN the reveal). An un-revealed card
  is also unselectable and undraggable (visually face-down = behaves face-down).
  (i) user ruling (v0.3.16) — ambiguity must not block quick-fly: quickMove now
  picks the LOWEST-LAYOUT-COLUMN destination among matching legal moves
  (left-most; ties → first group in order), and the stock is excluded as an
  auto-target (recycle stays a deliberate stock click; drag-drop onto the stock
  stays allowed — user-aimed).
  (j) slow-mo screenshot (screenshots/, user) showed a later-flying ghost painted
  UNDER an earlier ghost at a shared destination (v0.3.20) — ghost z now encodes
  flight step: FlightSpec.zIndex = 50 + step, so later flights paint above
  earlier ones (matching real stacking); within one step, DOM order is correct.

### Deployment (implemented, v0.3.11 — user intent 2026-10-15)
Published via GitHub Pages — the repo is standalone, so an Actions
push-to-deploy workflow fits; motivation was testing on a real mobile device.
Implemented as v0.3.11: `.github/workflows/deploy.yml` (build + ship on push
to main), Vite `base` path `/shellback-solitaire/` (env-overridable:
`BASE_PATH=/` for the optional-later solitaire.shellbackstudio.xyz subdomain,
same DNS pattern as shellback-studio-site), and Pages enablement via gh api
(build_type=workflow — done by the operator at deploy time). Live-URL
verification happens post-push. CI fix (v0.3.12): first deploy run failed
on the file:../deckhand dep (no sibling on the runner); workflow now checks
out deckhand, symlinks the sibling, builds the lib before installing
solitaire. Live-site fixes (v0.3.13 + deckhand 0.4.3): root-absolute art URLs
404'd under the base (setThemeBase introduced); findLastIndex/.at crashed
older mobile browsers at GameView mount (blank page) — replaced with index math.
v0.3.14 + deckhand 0.4.5: react/react-dom out of deckhand's runtime dependencies —
CI's separate deckhand npm ci produced a second React copy in the consumer bundle
(null-useState crash at GameView mount); peers are the only runtime declaration now.
v0.3.15: minified-bundle extraction proved TWO React module instances (deckhand chunk's
me.useState vs app D.useState; the deckhand copy's dispatcher is never installed) —
resolve.dedupe ['react','react-dom'] pins the app's copy. v0.3.17 PWA: manifest/SW/icons/OG;
SW scoped to the base path so sibling Pages sites are unaffected.

Canfield (C3 proper) next: rules digest captured at docs/CANFIELD_RULES.md (Wikipedia, 2026-10-15); expected deckhand contract churn listed there.
CB2 (v0.4.0): canfield definition+play modules, logic-complete + tested (85→122 tests); registry still 'planned' — GameView generalization (CB3, v0.4.1) makes it Preview-able.
CB3 (v0.4.1): GameView generalized via a gameViews.ts config map (per-game definition + play session + empty-foundation glyph; groupMoves/quickMove re-exported so view code has no per-game import paths); canfield live in Preview (registry → 'development'); reserve renders its top face-up ALWAYS (model may keep it face-down — real-Canfield look) and only the reserve top selects/drags; empty-slot special clicks generalized — specialClick(pileId) prefers a draw from the clicked pile, else commits the whole-pile flip-over into it (Klondike's waste→stock recycle, Canfield's waste→reserve refill).

Table cosmetics ladder (user idea 2026-10-15): felt default (v0.3.19) → table presets setting → unlockable tables earned by wins (chains to win-stats/D6).

### Mobile pass + single-tap interaction (NEXT SESSION, user notes 2026-10-15, v0.4.1 live)
- MOBILE SCALING: the site renders laptop-scale on a phone and overflows the screen. Known shape of the fix: CARD_WIDTH (90px) is a GameView constant and the board is a fixed 7-column grid — derive card size from the viewport/container (breakpoint or measured container width), responsive toolbar (wraps today), and verify the win overlay + settings on small screens. Test target: the user's phone via the live PWA.
- SINGLE-TAP MOVE: double-tap quick-fly is awkward on touch — add single-tap auto-move (quick-fly semantics: foundation-first, else left-most) as an ADDITIONAL mode alongside tap-select/tap-destination and drag. Open design question for that session: how single-tap auto-move coexists with tap-to-select (e.g. always auto-move when any destination exists vs a settings toggle).

### C3 batch C: drag-and-drop (2026-10-15, v0.3.9)
- First deckhand useDrag consumer (0.4.2, click-compatible: onDragStart fires on EVERY
  pointerdown, so the click/drag threshold is consumer territory) — a 6px press threshold
  gates activation; an unactivated press stays an ordinary click (native click/dblclick
  flows run unchanged).
- Per-card bindings: face-up tableau fan-cards + the waste/foundation TOP card only;
  stock and face-down cards get none. bindings' touch-action:none is per-card — the board
  itself keeps touch-scrolling.
- The ghost shows the WHOLE run (12px fan) in a fixed z-6 layer (above flights, below the
  win banner) while the originals hide via the hiddenCards union; pointer moves position it
  imperatively via a ghost ref — no setState per move.
- Drop hit-test = deckhand withinBounds over [data-pile-id] slots, source skipped (drop
  home = quiet cancel); the legal group is found exactly like click-drop → commit with
  { animate: false } (the drag WAS the animation — the ghost unmounts into the landed
  board); illegal/nowhere → 150ms ease snap-back (transitionend + 160ms timeout fallback;
  presses ignored during the glide).
- Activated-drag ends swallow the trailing browser click (dragJustEnded guard at the top of
  every card onClick); undo / new deal / play # cancel the drag alongside cancelFlights.

### Canfield waste→foundation bug — FIXED v0.4.2 (2026-10-20)
- Field report 2026-10-15 (live, Canfield Preview): base rank 7; a second 7 surfaced from the stock would NOT double-click to a foundation — it flew to a tableau instead (left-most fallback).
- Root cause: legalMoves' foundation section enumerated reserve tops + tableau tops but not the waste top (the block was omitted from the CB2 spec; the header's emit-order line inherited the omission).
- Fix (v0.4.2): the waste-top foundation block added mirroring Klondike (single wasteTop declaration hoisted beside reserveTop; block sits after the reserve-top block, before the tableau-tops loop); header + section emit-order comments updated (reserve top, waste top, then tableau tops). quickMove/quickFly needed no changes (they consume legalMoves).
- Tests 122→124: +2 (waste→empty foundation at base rank w/ non-base-rank negative; waste→built foundation in suit w/ wrong-suit negative).
- LESSON: every crafted Canfield rig must carry a face-up found-0 base card — baseRank throws on empty found-0 by design, and the waste block is now a code path that reaches it. Three pre-existing draw/recycle rigs (lines ~143/163/177) predated the invariant and were amended with up('found-0', [['D', 7]]); assertions untouched. Also repaired in this commit: package-lock.json had drifted stale at 0.3.17.
- ALSO open from earlier: the v0.3.20 ghost flight-order z fix shipped but user confirmation is PENDING (they moved to Canfield before retesting Klondike cascades — verify with ?slowmo=4).

### FIELD REPORT (2026-10-20): green felt table resizes during play — FIXED v0.4.3 (live check pending)
- User report (~09:00 PT): "something very broken about the new green table top — it keeps on resizing during the game and often looks wrong."
- Root cause (3 parts): fan-'down' slot inline heights tracked live card counts (grid rows + felt resized on many moves); fanOffset read window.innerHeight during EVERY render and its MIN_FAN_OFFSET floor let deep piles grow unbounded; flight predictions used count-derived offsets the board abandoned at commit (mislanded cards).
- Fix (v0.4.3, USER-DIRECTED DESIGN: cover the whole window with the felt — the table cannot size to content by construction): game view is a fixed full-viewport felt surface (100vh→100dvh cascade) with pinned toolbar and an internal board scroller (Route B — no App.tsx change); fan geometry is constant per view mount (new src/views/layout.ts: columnHeightFor/fanOffsetIn — pure, no window reads in render); fans compress strictly inside their constant box; flights predict with the same pure function the board renders. +5 layout tests incl. the stable-felt invariant fence (124→129).
- Status: SHIPPED to the live site via the normal push-to-deploy path (user declined the local dev-server gate); user live verification PENDING — if a visual defect surfaces, patch forward.

### FOLLOW-UP (v0.4.4, user field feedback same day): slot chrome de-noised
- User verdict on the live v0.4.3: "the full height columns look bad and when they get highlighted it is even worse... Seems very unnecessary."
- Chrome now appears only where it carries information: filled fan piles paint NOTHING (the .pile-slot div stays as the invisible hit/geometry element flights measure); empty piles get card-sized dashed outlines (.cardbox); drop targets mark a card-sized landing outline (.drop-landing at top = cards.length * offset) instead of the lit-up column; the per-card drop-target shadow on fan piles is gone (the landing outline is the affordance). Stock/waste/foundation keep card-sized boxes (visible only when empty).

### FOLLOW-UP (v0.4.5, user field feedback same day): fast flight speed re-tuned + visible slow-mo badge
- User verdict on live v0.4.4: "even at the fastest setting the cards move painfully slow... that feature has lost its way over time."
- Planner audit: FLIGHT_TIMING values are unchanged since the v0.3.6 tuning — the drift is CONTEXTAL: (a) fast was only ~1.55x med (imperceptible); (b) per-click waits are dominated by cascade length x cadence (one step per move action — auto-fly chains + reveal sequencing postdate the tuning); (c) ?slowmo=N multiplies all timings invisibly.
- Fix: fast re-tuned 180/220 → 100/120 (~2.8x med; slow/med untouched); SLOWMO > 1 now renders a "slow-mo xN" badge in the game toolbar (amber pill) so a lingering debug param can never masquerade as a bug.

### FOLLOW-UP (v0.4.6, user field feedback same day): native highlight artifacts suppressed
- User report: missing a card and clicking the felt sometimes "highlights" content that persists until the next felt click.
- Diagnosis: the app's selection state clears on felt click by design (onClick=deselect), so the persistent highlight is browser-native — text selection from click-drag/double-click, or the native image-drag ghost. The user directive: remove the ability to highlight at all from mouse actions (game view only).
- Fix: user-select none + tap-highlight transparent on .game-screen; native img/svg drag disabled (CSS) + onDragStart preventDefault backstop on the game-screen root. The app's .selected-run interaction highlight is unaffected.

### FEATURE (v0.4.7): single-tap move (the Oct 15 open question, ruled + shipped)
- User directive 2026-10-20; design ruling: a `singleTapMove` setting (default ON, autoFly's switch pattern) — tap = quick-move (foundation-first, else left-most, stock excluded; the dblclick semantics), falling back to select when the card has no legal destination; OFF = legacy select-first. Destination-tap drops, drag-and-drop, specialClicks, and the dragJustEnded swallow all unchanged; double-click stays (redundant when ON).
- FIELD VERDICT 2026-10-20 (~10:50 PT, live): PASSED — "single click is working well so far"; the left-most ambiguity ruling held at tap speed.

### FIX (v0.4.8): waste pile rendered invisible depth — cards "appeared from nowhere"
- User report mid-Canfield (draw-3): "no idea where some of the cards are." Root cause: the waste/foundation render stacked ALL waste cards at one position/zIndex — only the top was ever visible, so draw-3's other two cards (and Klondike's up-to-24) sat invisible until they surfaced as the top.
- Fix (user design: fan + depth): waste right-fans its top min(3, visible) cards at 14px steps (next two faces visible); depth slivers left of the fan at >3 and >10 cards (thickness cue); only the top card stays interactive (buried cards were never legal plays — the fan just makes them visible); .board gains padding-right so the fan never widens the scroller; draw flights land at the fanned position ((landedOnCount - run + i) - max(0, landedOnCount - 3)) * 14px — the windowed fan index the board actually renders (the naive min(2, landedOnCount - run + i) would misland the deeper members of a 3-card draw).
- Foundations intentionally unchanged (stacked — their top is the only meaningful face).

### FIX (v0.4.9): Canfield reserve rendered as a squared stack (layout top-heavy)
- User report: the most-handled cards (working stacks) sat at the bottom of the screen below a wall of green — the reserve's 13-card down-fan made its box the tallest slot, and the v0.4.3 constant-box rule made that height permanent, pinning row 1 below the fold.
- Fix: the reserve renders as a squared stack (real-Canfield look): offset 0, cardHeight box, top face-up (existing override), .waste-depth slivers at >3/>10 cards, ↻ glyph on the empty refill click. Row 0 is now one card tall — the whole board fits on screen. Zero rule-interaction changes (the covered cards' handlers were already unreachable); .board gains padding-left 16px so the slivers stay in-box.

### FEATURE (v0.4.10): in-game rules panel (user-directed)
- User report: could not name the reserve pile mid-game; directive: a Rules button showing the game's rules + the layout with pile names ("working stacks, stock, foundations, etc.").
- Shipped: toolbar Rules button → overlay (backdrop/Esc/Close all dismiss) with player-facing rules content per game (gameViews config — CB3 presentation pattern) + a GENERATED layout diagram labeled from definition.layout + config.pileLabels (role-name fallback) — game-agnostic, so future games get it free (GAME_CHECKLIST section 7 carries the content gate, enforced by gameViews tests).
- Sources: docs/CANFIELD_RULES.md digest; Klondike written fresh (standard draw-1).
- FIELD VERDICT 2026-10-20 (~11:39 PT, live): PASSED — "looks good so far" (covers v0.4.10 rules panel + v0.4.11 glyph labels).

### FIX (v0.4.11): foundation glyph showed the raw rank integer
- User report: the base-rank glyph read '11' for J and '1' for A. The glyph rendered baseRank(world) raw. Now labeled via deckhand's exported RANK_LABELS (display labels indexed by rank — the deckhand route of the two the fix spec allowed, so no local map and no new test; it is deckhand's tested surface).

### L-phase (layout pass) scoped — decisions D8-D11 recorded 2026-10-21, implementation pending
- Session goal (user): get the layout correct BEFORE adding new games — game #3 is blocked on this pass plus the GAME_CHECKLIST §8 phone gate.
- L1 audit verdict: the board math is already parameterized by card size (layout.ts pure functions, mount-time capture); the single blocker is the hard-coded CARD_WIDTH = 90 (GameView.tsx) against a fixed 7-column grid — ~750px minimum board width overflows a phone (~412px viewport). Everything downstream (cardHeight, fan compression, flights, drag ghost) is proportional to card size, so deriving card width at mount fixes the whole chain.
- D8 — card sizing: derive card width from the measured board width at view mount, clamped [~42px … 90px]. Ruling: try-and-see — land it, judge on the phone.
- D9 — portrait-first: portrait is the default/primary design target (user: "I have played many card games in portrait, it should be able to work"); no landscape-specific design work this pass.
- D10 — laptop verdict: the current laptop layout (90px cards, 960px board) is the keeper; no outstanding gripes.
- D11 — toolbar: keep it simple this pass (the existing flex-wrap is acceptable); the toolbar needs a full redesign for all platforms anyway — future work, explicitly out of this pass's scope.
- Plan: L1 spec + decisions (this section) → L2 implement (cardWidthFor pure function + tests, proportional gap scaling, responsive pass on win banner/rules panel, all 134 existing tests stay green) → L3 deploy + phone gate via the live PWA (also retires the pending v0.3.20 slow-mo ghost z-order check via ?slowmo=4) → L4 commit batch (tracker update, version 0.5.0 proposed, .gitignore screenshots/).
- Baseline at scoping: 7a4bb86 (v0.4.11), 134/134 tests, build + lint clean, tree clean except the untracked screenshots/ directory.

### L2 mobile-layout pass — SHIPPED v0.5.0 + v0.5.1 (2026-10-21), phone re-gate pending
- Implementation (v0.5.0, commit 9646c9d): cardWidthFor (two-pass joint solve, clamp 42-90) + gapFor (proportional) + gameScreenPadX (JS mirror of the CSS breakpoint) in layout.ts; GameView derives card width ONCE per view mount (mount-constant discipline as columnHeight); board tracks repeat(7, minmax(w, 1fr)) — desktop byte-identical to the D10 keeper, phones get the derived floor; <=520px media query (game-screen padding 24->12px/side, rules-map cells 44->38px). Tests 134 -> 139.
- Field verdict on v0.5.0 (user, live): "layout is correct, cards are a bit small" (43px on the 412px Pixel 8); desktop confirmed unchanged.
- Chrome rescale (v0.5.1): waste-fan step + reserve-sliver extent now proportional to card width (wasteFanStep/sliverExtent/boardPads pure exports; the FLIGHT-LANDING formula consumes the same wasteFanStep — the v0.4.3 lesson: predictions must use the function the board renders; zero literal 14/12 px remain in the waste/sliver paths); gapFor reworked to a smooth 4px-floor ramp (clamp(4,12,round((w-42)/4)) — desktop 86->11/90->12 byte-identical); board paddings now derived (inline style; CSS 32/16 remain the no-JS fallback); solveCardWidth gains a fit-guarded tie-break (upgrades to w2 only when gapFor(w2) <= g1 AND the full row + w2's own chrome fit the outer width). Phone result: 48px cards on the 412px Pixel 8 (43 -> 48, +12%), exact-fit fixed point at outer 388. Tests 139 -> 140.
- SOLVER QUIRK (accepted, documented in layout.ts): the guarded solve is non-monotonic at gap-rounding band edges (18 dips across 280-1400, e.g. 401 -> 49 but 402 -> 47) and the 3-round orbit need not fixpoint — the invariant that matters is FIT (row + chrome <= outer at the returned width AND at a re-solved width), sweep-asserted at step 1 across the range with zero failures; monotonicity dropped as cosmetic (one call per mount, devices never see each other).
- PENDING: user phone re-gate of v0.5.1 (48px glance), the pending v0.3.20 slow-mo ghost z-order confirmation (?slowmo=4), and the GAME_CHECKLIST section 8 phone-playability verdict on a real deal.

### FIX (v0.5.2): reserve depth cue blind in the 2-3 card range
- User report (laptop, Canfield): the reserve "starts out fanned, but later in the game it appears as a single face up card" — the v0.4.9 squared stack's only depth cues (.waste-depth slivers at >3/>10 cards) left the 2-3 range with zero indication.
- Fix: new pure export reserveSliverOffsets(count, extent) — a 3-band ladder ([] at ≤1 card; 1 strip at 2-3; 2 strips at 4-10; 3 strips at ≥11) at tightened offsets (−⅓ / −⅔ / −full extent) that stay inside the existing left padding (no layout shift, desktop untouched); the reserve branch maps it; the waste branch (fan + its 2-band slivers) is byte-untouched. The squared stack itself stays — the v0.4.9 real-Canfield ruling. Tests 140 → 144.

### FEATURE (v0.5.3): rules-map chips + brighter roles + home Rules access (2026-10-21)
- User feedback on the v0.4.10 rules panel: the per-pile labels beneath every
  diagram box were cluttered, and the role fills were hard to differentiate —
  stock/waste/reserve were three rgba(0,0,0,x) grays (0.25/0.10/0.35), i.e.
  shades of one color, not three colors.
- Chip-per-run diagram: labels now render as ONE translucent pill per
  horizontal RUN of same-role piles, centered over its boxes, instead of a
  label under every box. The grouping rule is deliberately simple (user
  directive: "don't overcomplicate it but keep it readable"): piles merge
  only when same role + same row + consecutive columns; any break (role,
  row, column gap) splits the run and everything else degrades to
  single-pile runs — so a split-roles layout (future FreeCell: cells left +
  foundations right) gets one chip per run with no special-casing. Pure
  grouping in src/views/rulesLayout.ts (runGrouping) + unit tests;
  gameViews.test.ts gains a coverage invariant (every layout pile in
  exactly one run). Diagram geometry unchanged: 44px cells / 8px gap /
  7-column default, 38px under the ≤520px media query.
- Brighter role hues — one hue per role, medium saturation (user: "they
  don't need to be bold, but they should be easier to differentiate"):
  stock amber rgba(217,119,6,0.30), waste teal rgba(13,148,136,0.30),
  reserve violet rgba(124,58,237,0.30), foundation blue rgba(37,99,235,0.35),
  tableau green rgba(22,163,74,0.32).
- RulesPanel extracted from GameView (owns its Esc-to-dismiss listener; the
  panel is mounted only while open) — and the HOME page gains a Rules
  button beside Play/Preview for any game with a view config
  (gameConfigFor lookup): the panel opens as an overlay IN PLACE on the
  home page, review-only, never navigating into the game. User ruling,
  recorded verbatim: "Never deal cards to a player until they decide to
  play."
- Preview/Play naming CONFIRMED unchanged (user): Preview until the game
  ships to 'available', then Play.
- Interaction contract (user clarification, same day): Play/Preview deals cards
  immediately; Rules reviews only. The rules screen carries NO play action — a
  player who wants to play returns to the games list and presses Play/Preview
  themselves. Ruled for now (user: "the latter makes more sense to me, but it
  is debatable"); revisiting later is cheap (an optional onPlay prop rendered
  only on the home usage).
- v0.4.10's in-game toolbar Rules button is unchanged — the panel is shared,
  and an action-free RulesPanel stays context-neutral between the home
  (pre-play) and in-game (mid-play) usages.

### FIX (v0.5.4): adjacent single-cell chips overlapped on Canfield
- User report (live, phone + laptop): Canfield's stock/waste chips ('Stock — deals 3' / 'Waste — top plays') collided — a max-content pill centered on one 44px cell overhangs into its neighbors, and adjacent single-pile runs left nowhere to go. Klondike's short labels never collided; this was Canfield-only in practice.
- Fix (user directive): truncate the two Canfield labels to 'Stock' / 'Waste' — the deals-3 and top-plays semantics already live in the rules prose. GAME_CHECKLIST section 7 gains the length lesson for future games.

### BACKLOG: home-grid evolution (captured 2026-10-21, user)
- Family color-coding on game tiles (a partial slice is possible pre-D6).
- Grid filtering by type / winnability / least played.
- Favorites.
- NOTE: "least played" and "favorites" are gated on the deferred D6
  persistence decision (win/loss stats) — both need per-game play history.
