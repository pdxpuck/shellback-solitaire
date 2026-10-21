/**
 * HomeView — collection landing page: game grid + highlight panel.
 * Tiles select; the panel below shows the selected game's summary and,
 * when a game is playable, its Play/Preview button plus a Rules button
 * (v0.5.3): the rules open as an overlay IN PLACE on the home page so a
 * player can review them BEFORE committing to play — user ruling,
 * verbatim: "Never deal cards to a player until they decide to play."
 */
import { useState } from 'react'
import { FAMILY_LABELS, REGISTRY, WINNABILITY_LABELS } from '../games/registry'
import type { GameMeta, GameStatus, Winnability } from '../games/registry'
import { gameConfigFor } from '../games/gameViews'
import RulesPanel from './RulesPanel'

interface HomeViewProps {
  onOpenSettings: () => void
  /** Open the game screen for the given registry id. */
  onPlay: (gameId: string) => void
}

const STATUS_LABELS: Record<GameStatus, string> = {
  available: 'Available',
  development: 'In development',
  planned: 'Planned',
}

/** Subtle badge color coding: green-ish high, amber middle, red-ish low. */
const WINNABILITY_LEVEL: Record<Winnability, 'high' | 'moderate' | 'low'> = {
  'very-low': 'low',
  low: 'low',
  moderate: 'moderate',
  high: 'high',
  'very-high': 'high',
}

function HomeView({ onOpenSettings, onPlay }: HomeViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected: GameMeta | null = selectedId
    ? (REGISTRY.find((g) => g.id === selectedId) ?? null)
    : null
  /** The game whose rules are open as a home-page overlay; null = closed.
   *  Rules is review-only — it never navigates into the game. */
  const [rulesGameId, setRulesGameId] = useState<string | null>(null)
  /** The open overlay's config — present only when rulesGameId names a
   *  game with a view config (the same gate as the Rules button itself). */
  const rulesConfig = rulesGameId !== null ? gameConfigFor(rulesGameId) : undefined
  const rulesTitle =
    rulesGameId !== null ? (REGISTRY.find((g) => g.id === rulesGameId)?.title ?? rulesGameId) : ''

  return (
    <>
      <header className="home-header">
        <h1>Shellback Solitaire Collection</h1>
        <button type="button" className="secondary-btn" onClick={onOpenSettings}>
          Settings
        </button>
      </header>

      <section className="games" aria-label="Games">
        {REGISTRY.map((game) => (
          <button
            key={game.id}
            type="button"
            className={`game-tile${selectedId === game.id ? ' selected' : ''}`}
            aria-pressed={selectedId === game.id}
            onClick={() => setSelectedId(game.id)}
          >
            <span className="game-title">{game.title}</span>
            <span className={`badge status-${game.status}`}>
              {STATUS_LABELS[game.status]}
            </span>
            <span className="game-family">{FAMILY_LABELS[game.family]}</span>
            <span className={`badge winnability-${WINNABILITY_LEVEL[game.winnability]}`}>
              Winnability: {WINNABILITY_LABELS[game.winnability]}
            </span>
          </button>
        ))}
      </section>

      {selected && (
        <section className="game-summary" aria-label={`About ${selected.title}`}>
          <h2>{selected.title}</h2>
          <p className="summary-text">{selected.summary}</p>
          <p className="summary-meta">
            {FAMILY_LABELS[selected.family]} · Winnability:{' '}
            {WINNABILITY_LABELS[selected.winnability]}
          </p>
          {selected.status !== 'planned' && (
            <button type="button" className="primary-btn" onClick={() => onPlay(selected.id)}>
              {selected.status === 'development' ? 'Preview' : 'Play'}
            </button>
          )}
          {/* Review-before-play (v0.5.3): shown only for games that have a
              view config to show — in practice the same games as Play (a
              config exists exactly when status !== 'planned'), gated on the
              config itself so a future registry/config drift degrades to a
              missing Rules button, never a blank overlay. */}
          {gameConfigFor(selected.id) !== undefined && (
            <button
              type="button"
              className="secondary-btn"
              onClick={() => setRulesGameId(selected.id)}
            >
              Rules
            </button>
          )}
        </section>
      )}

      {/* The home rules overlay: the SAME panel the game screen uses, in
          place — no navigation, no deal (see the header ruling). */}
      {rulesConfig !== undefined && (
        <RulesPanel
          title={rulesTitle}
          definition={rulesConfig.definition}
          config={rulesConfig}
          onClose={() => setRulesGameId(null)}
        />
      )}

      <footer className="version-footer">
        Shellback Solitaire Collection v{__APP_VERSION__}
      </footer>
    </>
  )
}

export default HomeView
