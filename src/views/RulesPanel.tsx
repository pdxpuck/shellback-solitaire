/**
 * RulesPanel — the game-agnostic rules overlay. Shipped inside GameView
 * (v0.4.10); extracted verbatim in v0.5.3 so the HOME page can open the
 * identical panel BEFORE a player commits to playing — user ruling,
 * verbatim: "Never deal cards to a player until they decide to play."
 * Everything shown is player-facing config: the prose from the game
 * config (intro + sections) and a layout diagram GENERATED from
 * definition.layout + pile labels — the component never names a game.
 *
 * The diagram (v0.5.3): one tinted cell per pile (unchanged geometry),
 * but labels are now ONE chip per horizontal RUN of same-role piles
 * (rulesLayout runGrouping), centered over its run of boxes — the
 * v0.4.10 label-under-every-box rows read as clutter. A run's chip shows
 * the pileLabels entry shared by every pile in the run, else the role's
 * generic name, else the first pile id — the same fallback chain the
 * per-pile labels used.
 *
 * The component OWNS Esc-to-dismiss while mounted (moved from GameView,
 * where the listener rode the showRules flag — here the mount itself is
 * the flag). Backdrop click and Close call onClose; the parent owns the
 * visibility state.
 */
import { useEffect } from 'react'
import type { GameDefinition } from 'deckhand/contract'
import type { GameViewConfig } from '../games/gameViews'
import { runGrouping } from './rulesLayout'
import type { RulesRun } from './rulesLayout'

interface RulesPanelProps {
  /** The game's display title — the head line ("How to play {title}"). */
  title: string
  /** Layout hints + pile roles — the diagram's entire geometry. */
  definition: GameDefinition
  /** Player-facing content: pileLabels + rules (the GameViewConfig slice
   *  this panel consumes; passing the whole config also works). */
  config: Pick<GameViewConfig, 'pileLabels' | 'rules'>
  /** Dismissal: backdrop click, Close button, and Esc all land here. */
  onClose: () => void
}

/** Generic pile name per role — the rules-diagram label fallback when the
 *  game config carries no explicit name for a pile id (v0.4.10; moved
 *  here from GameView with the panel extraction). */
const ROLE_NAMES: Record<string, string> = {
  stock: 'Stock',
  waste: 'Waste',
  reserve: 'Reserve',
  foundation: 'Foundation',
  tableau: 'Working stack',
}

function RulesPanel({ title, definition, config, onClose }: RulesPanelProps) {
  // Esc closes the panel while it is mounted (v0.4.10 semantics; the
  // listener's lifetime IS the panel's now that the panel owns it).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  /** Pile id → role, from the game definition's pile topology. */
  const roleOf = (pileId: string): string =>
    definition.piles.find((pile) => pile.id === pileId)?.role ?? ''

  /** Pile id → display name — the per-pile fallback chain (v0.4.10), kept
   *  for the cells' aria-labels (the visible labels are the run chips). */
  const labelOf = (pileId: string): string =>
    config.pileLabels[pileId] ?? ROLE_NAMES[roleOf(pileId)] ?? pileId

  // Rules-diagram grid geometry: derived from the definition's own layout
  // hints — session-independent by construction (moved from GameView).
  const mapCols = 1 + Math.max(...definition.layout.map((hint) => hint.col))
  const mapRows = 1 + Math.max(...definition.layout.map((hint) => hint.row))

  const runs = runGrouping(definition.layout, roleOf)

  /** The chip label for one run: the config's pileLabels entry when EVERY
   *  pile in the run shares one, else the role's generic name, else the
   *  first pile id — the per-pile fallback chain, applied per run. */
  const runLabel = (run: RulesRun): string => {
    const first = config.pileLabels[run.pileIds[0]]
    if (first !== undefined && run.pileIds.every((id) => config.pileLabels[id] === first)) {
      return first
    }
    return ROLE_NAMES[run.role] ?? run.pileIds[0]
  }

  return (
    <div className="rules-overlay" onClick={onClose}>
      <div className="rules-panel" onClick={(e) => e.stopPropagation()}>
        <div className="rules-head">
          <h2>How to play {title}</h2>
          <button type="button" className="secondary-btn" onClick={onClose}>
            Close
          </button>
        </div>
        <div
          className="rules-map"
          style={{
            // Cell size lives in index.css (.rules-map: 44px, shrunk to
            // 38px on phones by the ≤520px media query) — the inline
            // template only covers layouts off the 7-column default.
            ...(mapCols === 7 ? {} : { gridTemplateColumns: `repeat(${mapCols}, 44px)` }),
            gridTemplateRows: `repeat(${mapRows}, auto)`,
          }}
        >
          {definition.layout.map((hint) => (
            <div
              key={hint.pileId}
              className={`rules-cell rules-${roleOf(hint.pileId)}`}
              aria-label={labelOf(hint.pileId)}
              style={{ gridColumn: hint.col + 1, gridRow: hint.row + 1 }}
            />
          ))}
          {/* One chip per same-role horizontal run (v0.5.3), spanning its
              run's columns and centered OVER the boxes; pointer-events
              none (CSS) keeps the decorative diagram inert. */}
          {runs.map((run) => (
            <span
              key={run.pileIds[0]}
              className="rules-chip"
              style={{
                gridColumn: `${run.colStart + 1} / ${run.colEnd + 2}`,
                gridRow: run.row + 1,
              }}
            >
              {runLabel(run)}
            </span>
          ))}
        </div>
        <p className="rules-intro">{config.rules.intro}</p>
        {config.rules.sections.map((s) => (
          <div key={s.heading} className="rules-section">
            <h3>{s.heading}</h3>
            <ul>
              {s.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

export default RulesPanel
