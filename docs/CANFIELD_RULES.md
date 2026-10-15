# Canfield — Rules Digest (implementation reference)

Source: Wikipedia "Canfield (solitaire)", retrieved 2026-10-15 (cites Parlett 1979
pp. 149-150; Morehead & Mott-Smith 2001 p. 25). Classic US rules, draw-3.

## Layout
- Reserve ("demon"): 13 face-down cards, top card turned face-up and playable
- Foundations: 4, initially EMPTY; the card dealt after the reserve is the
  BASE CARD — all four foundations must start with that RANK
- Tableau: 4 piles, 1 face-up card each
- Stock: the remaining 35 cards

## Build rules
- Tableau: descending, alternating color, WRAPPING (Ace continues onto King)
- Foundations: ascending IN SUIT from the base rank, WRAPPING (King onto Ace)
- Moves: single cards or complete sequences; whole columns only

## Stock & waste
- Stock deals in packets of THREE face-up onto the waste; only the waste top is playable
- Unlimited redeals (re-deal the waste back into the stock)

## Reserve
- Top card playable at all times
- Rules text: "must be used whenever possible" to fill tableau gaps or build
  foundations — IMPLEMENTATION DEFAULT: advisory, not enforced (standard
  software behavior; decision DC1, open)
- When exhausted, the reserve may be refilled FROM THE WASTE (waste flips
  face-down into the reserve — decision DC3, open: player action on empty reserve)

## Win
- All 52 cards on the foundations

## Contract churn expected in deckhand
- Dynamic foundation base rank (per-deal, not always Ace) shared by all 4 foundations
- Wrapping builds, tableau AND foundation
- Reserve pile role (top-card-only playable, never a run source)
- Waste-to-reserve refill action
- Draw-3 stock behavior (current contract is draw-1)

## Open decisions
- DC1: forced reserve play — default ADVISORY (not enforced)
- DC2: draw-3 only vs a draw-1 setting — default draw-3 classic
- DC3: reserve refill as an explicit player action on the empty reserve
- DC4: no scoring — win/lose only (matches Klondike)
