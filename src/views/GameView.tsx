/**
 * GameView — the playable Klondike (Draw-1) screen (C2). Click-click UX:
 * click a face-up tableau card to select its run (or a waste/foundation top
 * card to select it), legal destinations highlight, click one to move.
 * A stock click draws; an empty-stock click (waste nonempty) recycles the
 * waste; a click elsewhere deselects. Every player click commits as ONE
 * moveGroup (rule actions + its safe flights when the settings autoFly
 * toggle is on) — which is exactly one undo group. The board is placed from
 * klondikeDraw1.layout on a 7-column CSS grid.
 *
 * Every deal carries a game # (the seed, 1..1,000,000): the toolbar shows it
 * (or "Practice deal" for legacy string seeds) and the "Play #" input
 * replays any deal exactly by number.
 */
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react'
import type { Action, PileId } from 'deckhand/engine'
import type { LayoutHint } from 'deckhand/contract'
import type { CardTheme } from 'deckhand/renderer'
import { CardView } from 'deckhand/renderer'
import type { GameMeta } from '../games/registry'
import { klondikeDraw1 } from '../games/klondike/definition'
import {
  clearGame,
  initialState,
  isWonState,
  loadGame,
  moveGroup,
  parseDealNumber,
  randomDealNumber,
  saveGame,
  worldFor,
  type GameState,
} from '../games/klondike/play'

interface GameViewProps {
  meta: GameMeta
  theme: CardTheme
  onBack: () => void
  /** Settings toggle: safe cards fly to the foundations automatically. */
  autoFly: boolean
}

const CARD_WIDTH = 90
/** Per-card fan offset as a fraction of card height. */
const FAN_RATIO = 0.28
/** A tableau column stays ≤ ~70vh — taller piles compress their fan. */
const COLUMN_HEIGHT_LIMIT = 0.7
/** Compressed piles never squeeze tighter than this many px per card. */
const MIN_FAN_OFFSET = 16

/** Faint glyph on an empty foundation slot (presentation chrome only). */
const FOUNDATION_GLYPHS: Partial<Record<PileId, string>> = {
  'found-S': '♠',
  'found-H': '♥',
  'found-D': '♦',
  'found-C': '♣',
}

/** Pile id → role, from the game definition's pile topology. */
const ROLES = new Map(klondikeDraw1.piles.map((pile) => [pile.id, pile.role]))

/**
 * The deal # for a seed, when the seed is numeric: Number() parses it and
 * round-trips back to the exact same string. Legacy seeds (arbitrary
 * strings) yield null and render as a "Practice deal".
 */
function dealNumberOf(seed: string): number | null {
  const n = Number(seed)
  return Number.isInteger(n) && String(n) === seed ? n : null
}

/** Fan offset for a pile of `count` cards, compressing toward the ~70vh cap. */
function fanOffset(count: number, cardHeight: number): number {
  if (count <= 1) return 0
  const base = cardHeight * FAN_RATIO
  const cap = (window.innerHeight * COLUMN_HEIGHT_LIMIT - cardHeight) / (count - 1)
  return Math.min(base, Math.max(cap, MIN_FAN_OFFSET))
}

/** One legal player click: the move proper + any flip composed after it. */
interface MoveGroup {
  readonly move: Extract<Action, { type: 'move' }>
  readonly actions: readonly Action[]
}

/**
 * Group the engine's flat legal-move list into player clicks. legalMoves
 * emits a flip only immediately after its own move, on the same source pile
 * (see movePlusFlip in the definition), so grouping is a single pass.
 */
function groupMoves(moves: readonly Action[]): readonly MoveGroup[] {
  const groups: MoveGroup[] = []
  for (const action of moves) {
    if (action.type === 'move') {
      groups.push({ move: action, actions: [action] })
    } else if (action.type === 'flip' && groups.length > 0) {
      const last = groups[groups.length - 1]
      if (last.move.from === action.pile) {
        groups[groups.length - 1] = { ...last, actions: [...last.actions, action] }
      }
    }
  }
  return groups
}

function GameView({ meta, theme, onBack, autoFly }: GameViewProps) {
  // A fresh visit resumes the saved game; none/corrupt → a fresh random deal.
  const [state, setState] = useState<GameState>(() =>
    loadGame() ?? initialState(String(randomDealNumber())),
  )
  /** The selected run: source pile + how many cards (from the top) move. */
  const [selected, setSelected] = useState<{ pileId: PileId; count: number } | null>(null)
  /** Deal-jump input: the typed number + whether the last parse was invalid. */
  const [dealInput, setDealInput] = useState('')
  const [dealInvalid, setDealInvalid] = useState(false)
  const dealInvalidTimer = useRef<number | null>(null)

  const world = worldFor(state)
  const won = isWonState(state)
  const dealNumber = dealNumberOf(state.seed)
  const groups = groupMoves(klondikeDraw1.legalMoves(world))

  const cardHeight = Math.round(CARD_WIDTH * theme.ratio)

  /** Distinct drop targets for the current selection. */
  const targets = new Set<PileId>()
  if (selected !== null) {
    for (const group of groups) {
      if (group.move.from === selected.pileId && group.move.count === selected.count) {
        targets.add(group.move.to)
      }
    }
  }

  // A win drops the save (win/loss stats stay deferred, D6) — idempotent.
  useEffect(() => {
    if (won) clearGame()
  }, [won])

  // Clear a pending invalid-feedback timer on unmount.
  useEffect(
    () => () => {
      if (dealInvalidTimer.current !== null) window.clearTimeout(dealInvalidTimer.current)
    },
    [],
  )

  const deselect = () => setSelected(null)

  /** Execute one grouped legal move as a single player click. */
  const commit = (actions: readonly Action[]) => {
    const next = moveGroup(state, actions, { autoFly })
    setState(next)
    saveGame(next)
    setSelected(null)
  }

  const drop = (targetId: PileId) => {
    if (selected === null) return
    const group = groups.find(
      (g) =>
        g.move.from === selected.pileId && g.move.count === selected.count && g.move.to === targetId,
    )
    if (group) commit(group.actions)
  }

  const stockClick = () => {
    const draw = groups.find((g) => g.move.from === 'stock')
    if (draw) {
      commit(draw.actions)
      return
    }
    const recycle = groups.find((g) => g.move.from === 'waste' && g.move.to === 'stock')
    if (recycle) commit(recycle.actions)
  }

  const newDeal = () => {
    const fresh = initialState(String(randomDealNumber()))
    setState(fresh)
    saveGame(fresh)
    setSelected(null)
  }

  /** Jump to the deal # typed in the toolbar; null → brief invalid feedback. */
  const playDeal = () => {
    const n = parseDealNumber(dealInput)
    if (dealInvalidTimer.current !== null) {
      window.clearTimeout(dealInvalidTimer.current)
      dealInvalidTimer.current = null
    }
    if (n === null) {
      setDealInvalid(true)
      dealInvalidTimer.current = window.setTimeout(() => setDealInvalid(false), 1600)
      return
    }
    setDealInvalid(false)
    const fresh = initialState(String(n))
    setState(fresh)
    saveGame(fresh)
    setSelected(null)
    setDealInput('')
  }

  const undo = () => {
    const next = { ...state, moves: state.moves.slice(0, -1) }
    setState(next)
    saveGame(next)
    setSelected(null)
  }

  const cellStyle = (hint: LayoutHint, height: number): CSSProperties => ({
    gridColumn: hint.col + 1,
    gridRow: hint.row + 1,
    width: CARD_WIDTH,
    height,
  })

  const renderPile = (hint: LayoutHint) => {
    const cards = world.piles[hint.pileId].cards
    const top = cards.length > 0 ? cards[cards.length - 1] : null
    const isTarget = targets.has(hint.pileId)
    const slotClass = `pile-slot${isTarget ? ' drop-target' : ''}`

    // Stock: click = draw (cards) or recycle (empty stock + waste nonempty).
    if (hint.pileId === 'stock') {
      const clickable = top !== null || world.piles.waste.cards.length > 0
      return (
        <div
          key={hint.pileId}
          className={`pile-slot${clickable ? ' clickable' : ''}`}
          style={cellStyle(hint, cardHeight)}
          onClick={clickable ? stockClick : undefined}
        >
          {top !== null && (
            <CardView card={top.card} faceUp={false} theme={theme} width={CARD_WIDTH} />
          )}
          {top === null && world.piles.waste.cards.length > 0 && (
            <span className="slot-glyph" aria-label="Recycle the waste">
              ↻
            </span>
          )}
        </div>
      )
    }

    const role = ROLES.get(hint.pileId)

    // Tableau: the full pile fans down; a face-up card selects the run beneath.
    if (role === 'tableau') {
      const offset = fanOffset(cards.length, cardHeight)
      const height = cardHeight + (cards.length - 1) * offset
      const selectedCount = selected !== null && selected.pileId === hint.pileId ? selected.count : 0
      return (
        <div
          key={hint.pileId}
          className={slotClass}
          style={cellStyle(hint, height)}
          onClick={isTarget ? () => drop(hint.pileId) : undefined}
        >
          {cards.map((pc, i) => (
            <div
              key={pc.card.id}
              className={
                `fan-card${isTarget && i === cards.length - 1 ? ' drop-target' : ''}` +
                `${selectedCount > 0 && i >= cards.length - selectedCount ? ' selected-run' : ''}` +
                `${!isTarget && pc.faceUp ? ' selectable' : ''}`
              }
              style={{ top: i * offset, zIndex: i }}
              onClick={(e: ReactMouseEvent) => {
                e.stopPropagation()
                if (isTarget) drop(hint.pileId)
                else if (pc.faceUp) setSelected({ pileId: hint.pileId, count: cards.length - i })
              }}
            >
              <CardView card={pc.card} faceUp={pc.faceUp} theme={theme} width={CARD_WIDTH} />
            </div>
          ))}
        </div>
      )
    }

    // Waste / foundation: the top card only.
    const selectedTop = selected !== null && selected.pileId === hint.pileId
    return (
      <div
        key={hint.pileId}
        className={slotClass}
        style={cellStyle(hint, cardHeight)}
        onClick={isTarget ? () => drop(hint.pileId) : undefined}
      >
        {top !== null ? (
          <div
            className={
              `fan-card${isTarget ? ' drop-target' : ''}` +
              `${selectedTop ? ' selected-run' : ''}` +
              `${!isTarget && top.faceUp ? ' selectable' : ''}`
            }
            style={{ zIndex: 1 }}
            onClick={(e: ReactMouseEvent) => {
              e.stopPropagation()
              if (isTarget) drop(hint.pileId)
              else if (top.faceUp) setSelected({ pileId: hint.pileId, count: 1 })
            }}
          >
            <CardView card={top.card} faceUp={top.faceUp} theme={theme} width={CARD_WIDTH} />
          </div>
        ) : (
          role === 'foundation' && (
            <span className="slot-glyph" aria-hidden="true">
              {FOUNDATION_GLYPHS[hint.pileId]}
            </span>
          )
        )}
      </div>
    )
  }

  return (
    <div className="game-screen" onClick={deselect}>
      <header className="home-header">
        <h1>{meta.title}</h1>
        <div className="toolbar">
          <button type="button" className="secondary-btn" onClick={newDeal}>
            New deal
          </button>
          <span className="deal-jump">
            <input
              type="text"
              inputMode="numeric"
              aria-label="Deal number"
              placeholder="Deal #"
              value={dealInput}
              aria-invalid={dealInvalid}
              onChange={(e) => {
                setDealInput(e.target.value)
                setDealInvalid(false)
              }}
              style={{
                width: 84,
                padding: '4px 8px',
                border: dealInvalid ? '1px solid #a03030' : '1px solid #999',
                borderRadius: 6,
                font: 'inherit',
                background: '#fff',
                color: '#1a1a1a',
              }}
            />
            <button type="button" className="secondary-btn" onClick={playDeal}>
              Play #
            </button>
          </span>
          <button
            type="button"
            className="secondary-btn"
            onClick={undo}
            disabled={state.moves.length === 0}
          >
            Undo
          </button>
          <button type="button" className="secondary-btn" disabled title="Hints arrive post-C2">
            Hint
          </button>
          <button type="button" className="secondary-btn" onClick={onBack}>
            Back to main
          </button>
          <span className="move-count">
            {dealNumber !== null ? `Game #${dealNumber}` : 'Practice deal'}
          </span>
          <span className="move-count">
            Moves: {state.moves.length}
          </span>
        </div>
      </header>

      <section className="board" aria-label={`${meta.title} table`}>
        {klondikeDraw1.layout.map(renderPile)}
      </section>

      {won && (
        <div className="win-overlay">
          <div className="win-banner">
            <p>
              {dealNumber !== null
                ? `🎉 You won game #${dealNumber} in ${state.moves.length} moves!`
                : `🎉 You won in ${state.moves.length} moves!`}
            </p>
            <button type="button" className="primary-btn" onClick={newDeal}>
              New deal
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default GameView
