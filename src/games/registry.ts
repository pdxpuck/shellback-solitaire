/**
 * Game metadata registry — the collection's catalog of solitaire variants.
 *
 * Lives collection-side for C1; migrates into deckhand's game-contract types
 * during C2 when the contract finalizes (see SCOPING_NOTES.md).
 */

export type SolitaireFamily =
  | 'klondike'
  | 'canfield'
  | 'spider'
  | 'golf'
  | 'pyramid'
  | 'freecell'
  | 'yukon'
  | 'other'

/** Coarse difficulty bucket: how often careful play wins a deal. */
export type Winnability = 'very-low' | 'low' | 'moderate' | 'high' | 'very-high'

export type GameStatus = 'available' | 'development' | 'planned'

export interface GameMeta {
  id: string
  title: string
  family: SolitaireFamily
  winnability: Winnability
  status: GameStatus
  /** 1-2 sentences shown in the home-screen highlight panel. */
  summary: string
}

export const REGISTRY: readonly GameMeta[] = [
  {
    id: 'klondike',
    title: 'Klondike',
    family: 'klondike',
    winnability: 'moderate',
    status: 'development',
    summary:
      'The classic patience game — build four foundations up from ace to king. ' +
      'Draw one at a time; most deals are winnable with careful play, but plenty are not.',
  },
  {
    id: 'canfield',
    title: 'Canfield',
    family: 'canfield',
    winnability: 'low',
    status: 'planned',
    summary:
      'A tougher cousin: foundations build up from a randomly-drawn base card and wrap ' +
      'around, fed by a 13-card reserve. History says it was named after a casino — it plays like one.',
  },
]

/** Look up a game by id; throws on an unknown id. */
export function getGame(id: string): GameMeta {
  const game = REGISTRY.find((g) => g.id === id)
  if (!game) throw new Error(`Unknown game: "${id}"`)
  return game
}

/** Human labels for the family taxonomy, e.g. klondike → 'Klondike-type'. */
export const FAMILY_LABELS: Record<SolitaireFamily, string> = {
  klondike: 'Klondike-type',
  canfield: 'Canfield-type',
  spider: 'Spider-type',
  golf: 'Golf-type',
  pyramid: 'Pyramid-type',
  freecell: 'FreeCell-type',
  yukon: 'Yukon-type',
  other: 'Other',
}

/** Human labels for the winnability buckets, 'Very low' … 'Very high'. */
export const WINNABILITY_LABELS: Record<Winnability, string> = {
  'very-low': 'Very low',
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  'very-high': 'Very high',
}
