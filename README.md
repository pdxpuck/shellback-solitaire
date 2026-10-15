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

## Deployment

Push to `main` triggers the GitHub Actions workflow
([.github/workflows/deploy.yml](./.github/workflows/deploy.yml)): it builds
the app and ships it to GitHub Pages at
https://pdxpuck.github.io/shellback-solitaire/.

The Vite `base` path is env-overridable — set `BASE_PATH=/` for a future
custom domain (e.g. solitaire.shellbackstudio.xyz).

## Card art

`public/cards/byron/` is a **real copy** of deckhand's byron theme assets,
duplicated per-consumer by design — deckhand ships no assets. License and
credits: [public/cards/byron/LICENSE.md](./public/cards/byron/LICENSE.md).

C1 (v0.2.0) delivers the collection shell — landing page with the game catalog (metadata + summaries), theme settings, and the in-game screen skeleton; version convention is phase Cn → 0.n.x, same as deckhand's phase convention.

Klondike (Draw-1) playable since v0.3.1. Deal numbers (game #) with replay-by-number since v0.3.2. Card-flight animation — sequenced 200 ms steps at a 220 ms cadence — since v0.3.3. Double-click-to-foundation quick-fly since v0.3.4. Smart-move quick-fly (foundation-first, else the unique legal destination) + single-arc multi-leg flights since v0.3.5; flight-speed setting (slow/med/fast, default medium) since v0.3.6; in-game Settings entry (Back returns to the game) + flights no longer blank their destination piles since v0.3.7; win banner gains Back to main + pile-local card stacking (ghosts fly above deep piles) since v0.3.8; drag-and-drop (runs move together; illegal drops snap back; drop commits land without re-animating) since v0.3.9; staggered flip reveals (a flipped card shows face-up only when its exposing flight lands) since v0.3.10; card art honors the Pages base path (setThemeBase) + ES2023 method removal for older mobile browsers since v0.3.13; single React instance in the production bundle (deckhand 0.4.5 peers — fixes the live null-useState blank page) since v0.3.14; resolve.dedupe pins one React instance across the deckhand graph (fixes the live GameView mount crash) since v0.3.15; quick-fly ambiguity resolves LEFT-MOST (Kings fly to the left-most open column) and never auto-recycles via stock since v0.3.16; PWA — web manifest, installable app, offline-capable service worker, real icon set, OG/share tags — since v0.3.17; green felt table (--felt variable — table presets/unlockables later) since v0.3.19; ghost stacking follows flight order (later flights paint above earlier — cascade z-order fix from a slow-mo screenshot) since v0.3.20; Canfield (Draw-3) playable in Preview — GameView is now game-agnostic (v0.4.1).

## PWA

Installable since v0.3.17: use the browser's "Install app" menu entry
([public/manifest.webmanifest](./public/manifest.webmanifest) + the icon set under
[public/icons/](./public/icons/)). The service worker
([public/sw.js](./public/sw.js)) is cache-first for content-hashed `assets/`
bundles and static `cards/` art, network-first for page navigations with a
cached-page offline fallback. Icons are generated from
[public/icon.svg](./public/icon.svg) — edit it, then run `npm run icons` (sharp devDep).
