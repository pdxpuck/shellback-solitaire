/**
 * Config invariants for the gameViews map (v0.4.10): every shipped game
 * must carry rules-panel content (GAME_CHECKLIST section 7) and a fully
 * labeled layout diagram. A new game config that forgets either fails here,
 * not in front of a player. v0.5.3 adds the chip-diagram invariant: the
 * run grouping must cover every layout pile exactly once.
 */

import { describe, expect, it } from 'vitest'
import { GAME_VIEWS } from './gameViews'
import { runGrouping } from '../views/rulesLayout'

/** Mirrors RulesPanel's role-name fallback (RulesPanel ROLE_NAMES — moved
 *  here from GameView with the v0.5.3 panel extraction). */
const ROLE_NAMES: Record<string, string> = {
  stock: 'Stock',
  waste: 'Waste',
  reserve: 'Reserve',
  foundation: 'Foundation',
  tableau: 'Working stack',
}

describe('gameViews config invariants — rules panel (v0.4.10)', () => {
  it('every game config exposes rules content: non-empty intro, >= 1 section of >= 1 item', () => {
    const entries = Object.entries(GAME_VIEWS)
    expect(entries.length).toBeGreaterThanOrEqual(2)
    for (const [id, config] of entries) {
      expect(config, id).toBeDefined()
      expect(config!.rules.intro.length, `${id}: intro`).toBeGreaterThan(0)
      expect(config!.rules.sections.length, `${id}: sections`).toBeGreaterThanOrEqual(1)
      for (const section of config!.rules.sections) {
        expect(section.heading.length, `${id}: section heading`).toBeGreaterThan(0)
        expect(section.items.length, `${id}: ${section.heading} items`).toBeGreaterThanOrEqual(1)
        for (const item of section.items) {
          expect(item.length, `${id}: ${section.heading} item`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('every layout pile is labelable — a pileLabels entry or a role fallback exists', () => {
    for (const [id, config] of Object.entries(GAME_VIEWS)) {
      expect(config, id).toBeDefined()
      const roles = new Map(config!.definition.piles.map((pile) => [pile.id, pile.role]))
      for (const hint of config!.definition.layout) {
        const role = roles.get(hint.pileId) ?? ''
        const label = config!.pileLabels[hint.pileId] ?? ROLE_NAMES[role]
        expect(label, `${id}: label for ${hint.pileId}`).toBeTruthy()
      }
    }
  })

  it('INVARIANT (v0.5.3): runGrouping over every definition.layout covers every pile exactly once', () => {
    // The rules map renders one chip per run; a pile outside every run
    // would render unlabeled, and a pile in two runs would double-place.
    for (const [id, config] of Object.entries(GAME_VIEWS)) {
      expect(config, id).toBeDefined()
      const roles = new Map(config!.definition.piles.map((pile) => [pile.id, pile.role]))
      const runs = runGrouping(config!.definition.layout, (pileId) => roles.get(pileId) ?? '')
      const covered = runs.flatMap((run) => run.pileIds)
      expect(covered, `${id}: every pile in exactly one run`).toHaveLength(
        config!.definition.layout.length,
      )
      expect(new Set(covered).size, `${id}: no pile twice`).toBe(covered.length)
    }
  })
})
