/**
 * GameView — in-game screen skeleton (C1). The toolbar's game controls are
 * disabled placeholders; the table area holds the framework-check strip
 * relocated from the C0 landing page, proving the deckhand engine + renderer
 * still work inside a game screen.
 */
import { useState } from 'react'
import type { Card } from 'deckhand/engine'
import {
  STANDARD,
  buildDeck,
  cardId,
  cardLabel,
  createRng,
  jokerId,
  shuffle,
} from 'deckhand/engine'
import type { CardTheme } from 'deckhand/renderer'
import { CardView } from 'deckhand/renderer'
import type { GameMeta } from '../games/registry'

interface GameViewProps {
  meta: GameMeta
  theme: CardTheme
  onBack: () => void
}

/** Framework-check strip: A♠ K♥ 10♦ 7♣ Joker1 through the deckhand renderer. */
const CHECK_CARDS: readonly Card[] = [
  { id: cardId('S', 1), suit: 'S', rank: 1, copy: 1 },
  { id: cardId('H', 13), suit: 'H', rank: 13, copy: 1 },
  { id: cardId('D', 10), suit: 'D', rank: 10, copy: 1 },
  { id: cardId('C', 7), suit: 'C', rank: 7, copy: 1 },
  { id: jokerId(1), suit: null, rank: null, copy: 1 },
]

function GameView({ meta, theme, onBack }: GameViewProps) {
  const [deal, setDeal] = useState<readonly Card[] | null>(null)

  const dealCheck = () => {
    const deck = buildDeck(STANDARD)
    setDeal(shuffle(deck, createRng('demo')).slice(0, 5))
  }

  return (
    <>
      <header className="home-header">
        <h1>{meta.title}</h1>
        <div className="toolbar">
          <button
            type="button"
            className="secondary-btn"
            disabled
            title={`New deal arrives with ${meta.title} in C2`}
          >
            New deal
          </button>
          <button
            type="button"
            className="secondary-btn"
            disabled
            title={`Undo arrives with ${meta.title} in C2`}
          >
            Undo
          </button>
          <button
            type="button"
            className="secondary-btn"
            disabled
            title={`Hint arrives with ${meta.title} in C2`}
          >
            Hint
          </button>
          <button type="button" className="secondary-btn" onClick={onBack}>
            Back to main
          </button>
        </div>
      </header>

      <p className="game-note">{meta.title} arrives in C2 — the table below is a placeholder.</p>

      <section className="check-section" aria-label="Placeholder table">
        <h2>Framework check</h2>
        <div className="card-row">
          {CHECK_CARDS.map((card) => (
            <CardView key={card.id} card={card} faceUp theme={theme} width={90} />
          ))}
        </div>
        <div className="toolbar check-toolbar">
          <button type="button" className="secondary-btn" onClick={dealCheck}>
            Deal check
          </button>
        </div>
        {deal && (
          <>
            <div className="card-row">
              {deal.map((card) => (
                <CardView key={card.id} card={card} faceUp theme={theme} width={90} />
              ))}
            </div>
            <p className="deal-result">{deal.map((card) => cardLabel(card)).join(', ')}</p>
          </>
        )}
      </section>
    </>
  )
}

export default GameView
