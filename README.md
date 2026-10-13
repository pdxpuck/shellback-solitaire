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

Klondike (Draw-1) playable since v0.3.1.
