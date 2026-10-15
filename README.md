# Shellback Solitaire Collection

A game-collection app for solitaire variants — Klondike first, Canfield next —
built on the [deckhand](../deckhand) card framework (engine + renderer + game
contract). Games are added as modules; see [SCOPING_NOTES.md](./SCOPING_NOTES.md).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check (`tsc -b`) + production build |
| `npm run preview` | Preview the production build |
| `npm test` | Vitest, run once (`vitest run`) |
| `npm run lint` | ESLint (flat config, shared with deckhand) |

## Framework dependency

Consumes `deckhand` via `link:../deckhand` (symlink — no reinstall churn during
framework contract work). If deckhand's lib build changed, rebuild it there:

```
cd ../deckhand && npm run build:lib
```

No reinstall needed in this repo afterwards; the dev server picks up the fresh
`dist/` (deckhand is excluded from Vite dep pre-bundling).

Imports use deckhand's **subpath exports** (`deckhand/engine`,
`deckhand/renderer`) rather than the root barrel: deckhand 0.3.3's root
`dist/index.d.ts` re-exports extensionlessly, which TypeScript can't follow
under bundler resolution (upstream fix pending in deckhand).

## Card art

`public/cards/byron/` is a **real copy** of deckhand's byron theme assets,
duplicated per-consumer by design — deckhand ships no assets. License and
credits: [public/cards/byron/LICENSE.md](./public/cards/byron/LICENSE.md).

C1 (v0.2.0) delivers the collection shell — landing page with the game catalog (metadata + summaries), theme settings, and the in-game screen skeleton; version convention is phase Cn → 0.n.x, same as deckhand's phase convention.

Klondike (Draw-1) playable since v0.3.1. Deal numbers (game #) with replay-by-number since v0.3.2. Card-flight animation — sequenced 200 ms steps at a 220 ms cadence — since v0.3.3. Double-click-to-foundation quick-fly since v0.3.4. Smart-move quick-fly (foundation-first, else the unique legal destination) + single-arc multi-leg flights since v0.3.5; flight-speed setting (slow/med/fast, default medium) since v0.3.6; in-game Settings entry (Back returns to the game) + flights no longer blank their destination piles since v0.3.7; win banner gains Back to main + pile-local card stacking (ghosts fly above deep piles) since v0.3.8.
