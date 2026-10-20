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

### FIELD REPORT (2026-10-20, OPEN): green felt table resizes during play
- User report (~09:00 PT): "something very broken about the new green table top — it keeps on resizing during the game and often looks wrong."
- The felt table default shipped v0.3.19 (table cosmetics ladder: felt default → table presets → unlockable tables). No root cause identified yet; investigation queued this session. Suspects to check when picked up: felt element sizing driven by board content, interaction with the flight-overlay layer, .pile-slot isolation:isolate (v0.3.8), win-banner/overlay sizing, mobile-viewport handling.
