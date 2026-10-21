# New Game Checklist — Shellback Solitaire Collection

Every item checked before a game ships from 'development' to 'available' on the home grid.
Lessons baked in are marked LESSON with their origin. Maintained by the planner; games are
added by working top to bottom.

## 1. Rules first (no code yet)
- [ ] Authoritative rules digest written to `docs/<game>_RULES.md` with source citations, BEFORE any code (LESSON, from carwars: read the rules first — a rulebook found mid-build forces a rebuild)
- [ ] Rule decisions locked with the user, recorded as D-numbers in the digest (precedent: Canfield DC1–DC5)
- [ ] Expected deckhand game-contract churn listed (what these rules need that the contract does not express yet — precedent: reverse-move + game-contract v1 came out of Klondike)

## 2. Rules module — `src/games/<game>/definition.ts`
- [ ] Registry entry (`src/games/registry.ts`): id, title, family, winnability bucket, status 'planned' → 'development', summary (powers the home grid)
- [ ] `piles`: full topology (ids + roles)
- [ ] `deckSpec`
- [ ] `deal(seed)`: fully deterministic from the seed
- [ ] `legalMoves(world)`: enumerates EVERY legal player move — the single source of truth for click UX, quick-move, and hints; deterministic emit order documented in the header. LESSON (Canfield waste→foundation bug): the header's emit-order line rots silently — update it in the same commit as any enumeration change
- [ ] `isWon(world)`
- [ ] `safeAutoMoves(world)` — the auto-fly policy (`[]` when wrapping builds/dynamic base ranks make Klondike's safety rule inapplicable, DC5 precedent)
- [ ] `layout` hints: row/col/fan per pile (`'down'` | `'right'` | `'none'`; stacks render via `'none'`; the v0.4.3 fixed-box model makes every fan-'down' box a constant column — pick fans for the LAYOUT you want at rest, not just accuracy)
- [ ] Header comment: rules summary + decision IDs

## 3. Session layer — `src/games/<game>/play.ts`
- [ ] `GameState {seed, moves}` + `worldFor` (replay is the state)
- [ ] `moveGroup` — one player click = rule actions + that click's safe flights, one undo group
- [ ] `safeFlights` fixpoint with the iteration cap
- [ ] Own save slot `shellback.<game>.save.v1` + guarded load (malformed or rule-breaking save → null, never a throw)
- [ ] Deal numbers (integer seed IS the deal #; `parseDealNumber` / `randomDealNumber`; range 1..1,000,000)

## 4. View config — `src/games/gameViews.ts`
- [ ] GameViewConfig: definition + play session + `emptyFoundationGlyph` (if the game has foundations)
- [ ] groupMoves/quickMove re-exported so GameView has no per-game import paths
- [ ] GameView needs ZERO code changes — the CB3 contract. LESSON: any GameView edit for one game's behavior is a smell; generalize the config instead

## 5. Interaction helpers (only if quick-move semantics differ)
- [ ] `src/games/<game>/interaction.ts`: quickMove / groupMoves / foundationMove extracted pure + unit-tested (Klondike pattern; Canfield reuses Klondike's)

## 6. Tests — `definition.test.ts`, `play.test.ts`, `interaction.test.ts`
- [ ] Deal: same seed → JSON-identical worlds; different seeds differ; pile counts + face states + 52 distinct cards
- [ ] legalMoves: every rule with positive AND negative cases (draws, recycles/refills, foundation builds incl. wrapping, tableau builds, gap-filling rules, whole-run moves)
- [ ] Emit-order test
- [ ] Replay consistency: scripted legal-move walks — stepwise replay == batched replay
- [ ] Rig invariant honored: every crafted rig satisfies the game's structural invariants (LESSON, Canfield: every rig carries the found-0 base card — baseRank throws on empty by design, and any new enumeration path may reach it)
- [ ] specialClick semantics verified (prefer draw from the clicked pile, else whole-pile flip-over — Klondike recycle and Canfield reserve refill both live here)

## 7. Rules panel (shipped v0.4.10; per-game content is enforced by the gameViews config-invariant tests)
- [ ] Player-facing rules text distilled from the digest
- [ ] Pile labels for the layout diagram (reserve, working stacks, stock, waste, foundations — the user could not name the reserve; the panel is the fix). Since v0.5.3 the labels render as chips overlapping horizontal runs of same-role piles (rulesLayout runGrouping) — provide a pileLabels entry per pile; same-role neighbors sharing one entry merge into a single chip automatically

## 8. Ship gates
- [ ] `npm run build` / `test` / `lint` green
- [ ] Registry status → 'development' (Preview live) → user play gate → 'available' (home grid)
- [ ] Version bump + SCOPING_NOTES section + tracker update (same commit batch)
- [ ] After the mobile pass lands: phone check via the live PWA — a game is not done until it plays on the phone
