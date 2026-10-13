/**
 * HomeView — collection landing page: game grid + highlight panel.
 * Tiles select; the panel below shows the selected game's summary and,
 * when a game is playable, its Play/Preview button.
 */
import { useState } from 'react'
import { FAMILY_LABELS, REGISTRY, WINNABILITY_LABELS } from '../games/registry'
import type { GameMeta, GameStatus, Winnability } from '../games/registry'

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
        </section>
      )}
    </>
  )
}

export default HomeView
