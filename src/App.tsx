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
import { CardView, DEFAULT_THEME_ID, getTheme } from 'deckhand/renderer'

/** Home-screen game grid. Games appear here as modules land (C2: Klondike). */
interface GameTile {
  id: string
  title: string
  status: string
}

const GAMES: readonly GameTile[] = [
  { id: 'klondike', title: 'Klondike', status: 'in development' },
]

const theme = getTheme(DEFAULT_THEME_ID)

/** Framework-check strip: A♠ K♥ 10♦ 7♣ Joker1 through the deckhand renderer. */
const CHECK_CARDS: readonly Card[] = [
  { id: cardId('S', 1), suit: 'S', rank: 1, copy: 1 },
  { id: cardId('H', 13), suit: 'H', rank: 13, copy: 1 },
  { id: cardId('D', 10), suit: 'D', rank: 10, copy: 1 },
  { id: cardId('C', 7), suit: 'C', rank: 7, copy: 1 },
  { id: jokerId(1), suit: null, rank: null, copy: 1 },
]

function App() {
  const [deal, setDeal] = useState<readonly Card[] | null>(null)

  const dealCheck = () => {
    const deck = buildDeck(STANDARD)
    setDeal(shuffle(deck, createRng('demo')).slice(0, 5))
  }

  return (
    <main className="shell">
      <h1>Shellback Solitaire Collection</h1>
      <section className="games" aria-label="Games">
        {GAMES.map((game) => (
          <button key={game.id} type="button" className="game-tile" disabled>
            <span className="game-title">{game.title}</span>
            <span className="game-status">{game.status}</span>
          </button>
        ))}
      </section>

      <section className="check-section" aria-label="Framework check">
        <h2>Framework check</h2>
        <div className="card-row">
          {CHECK_CARDS.map((card) => (
            <CardView key={card.id} card={card} faceUp theme={theme} width={90} />
          ))}
        </div>
        <div className="check-toolbar">
          <button type="button" className="check-btn" onClick={dealCheck}>
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
            <p
              className="deal-result"
              style={{ marginTop: 8, fontSize: '0.8rem', color: '#555' }}
            >
              {deal.map((card) => cardLabel(card)).join(', ')}
            </p>
          </>
        )}
      </section>
    </main>
  )
}

export default App
