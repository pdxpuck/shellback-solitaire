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

## Game contract (pointer)
The six-part contract lives in deckhand (see deckhand/SCOPING_NOTES.md): deck spec →
pile topology → move validator → auto-move policy → win/loss detector → layout hints.
Klondike (C2) is its first real implementation; expect the contract to churn.
