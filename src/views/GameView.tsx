/**
 * GameView — the playable Klondike (Draw-1) screen. Two interaction modes
 * (C3): click-click — click a face-up tableau card to select its run (or a
 * waste/foundation top card to select it), legal destinations highlight,
 * click one to move — and double-click smart move, which quick-flies the
 * clicked card/run to the first legal foundation move, else to its unique
 * legal destination (an ambiguous position moves nothing; the stock keeps
 * its exclusive click semantics). A stock click draws; an empty-stock click
 * (waste nonempty) recycles the waste; a click elsewhere deselects. Every
 * player click commits as ONE
 * moveGroup (rule actions + its safe flights when the settings autoFly
 * toggle is on) — which is exactly one undo group. Flight pacing is a user
 * setting too (slow/med/fast, default med — see FLIGHT_TIMING). The board
 * is placed from klondikeDraw1.layout on a 7-column CSS grid.
 *
 * Card flights (C3) are purely cosmetic: commit applies the final state
 * instantly and authoritatively, and a fixed-position overlay flies ONE
 * merged ghost arc per card — from its measured pre-move spot to its final
 * landing, even across back-to-back legs (a draw that continues onto a
 * foundation is one sweep) — while the moved board cards stay hidden until
 * their arc's settle timer fires. Any cancel (new commit, undo, new deal,
 * unmount) just snaps to the final layout. While an incoming card is in
 * flight (hidden on the board), its destination pile renders the topmost
 * VISIBLE card down — never blank.
 *
 * Every deal carries a game # (the seed, 1..1,000,000): the toolbar shows it
 * (or "Practice deal" for legacy string seeds) and the "Play #" input
 * replays any deal exactly by number.
 *
 * Settings is reachable from the toolbar; its Back returns to wherever it
 * was opened from (the game — state survives via the per-commit save).
 */
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react'
import type { Action, PileCard, PileId } from 'deckhand/engine'
import type { LayoutHint } from 'deckhand/contract'
import type { CardTheme } from 'deckhand/renderer'
import { CardView } from 'deckhand/renderer'
import type { GameMeta } from '../games/registry'
import type { FlightSpeed } from '../settings'
import { klondikeDraw1 } from '../games/klondike/definition'
import { groupMoves, quickMove } from '../games/klondike/interaction'
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
import { flightSteps } from './flights'

interface GameViewProps {
  meta: GameMeta
  theme: CardTheme
  onBack: () => void
  /** Settings toggle: safe cards fly to the foundations automatically. */
  autoFly: boolean
  /** Settings pick: card-flight pace — slow, med (default), or fast. */
  flightSpeed: FlightSpeed
  /** Open the Settings view; its Back returns to wherever it was opened. */
  onOpenSettings: () => void
}

const CARD_WIDTH = 90
/** Per-card fan offset as a fraction of card height. */
const FAN_RATIO = 0.28
/** A tableau column stays ≤ ~70vh — taller piles compress their fan. */
const COLUMN_HEIGHT_LIMIT = 0.7
/** Compressed piles never squeeze tighter than this many px per card. */
const MIN_FAN_OFFSET = 16

/** Per-speed flight timing: one leg's duration + the start-to-start cadence. */
const FLIGHT_TIMING: Record<FlightSpeed, { leg: number; step: number }> = {
  slow: { leg: 400, step: 480 },
  med: { leg: 280, step: 340 },
  fast: { leg: 180, step: 220 },
}

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

/** One card's flight leg: viewport source position + delta to its landing spot. */
interface FlightSpec {
  readonly cardId: string
  readonly srcLeft: number
  readonly srcTop: number
  readonly dx: number
  readonly dy: number
  readonly delayMs: number
}

/** The active flight overlay: per-card arcs, settle progression, generation guard. */
interface FlightsState {
  /** Bumped per commit — stale settle timers must never touch a newer overlay. */
  readonly gen: number
  readonly specs: readonly FlightSpec[]
  /** cardId → its LAST leg's step index; the board hides the card until then. */
  readonly hideUntil: Readonly<Record<string, number>>
  readonly stepCount: number
  /** Steps that have fully landed so far (moved board cards unhide past theirs). */
  readonly settled: number
}

function GameView({ meta, theme, onBack, autoFly, flightSpeed, onOpenSettings }: GameViewProps) {
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
  /** The board section — the DOM hooks flights measure against. */
  const boardRef = useRef<HTMLElement | null>(null)
  /** Active flight overlay, or null when the board is instant (see header). */
  const [flights, setFlights] = useState<FlightsState | null>(null)
  /** All pending flight settle timers — cleared on every cancel path. */
  const flightTimers = useRef<number[]>([])
  /** Monotonic overlay generation; captured by each settle timer. */
  const flightsGen = useRef(0)

  const world = worldFor(state)
  const won = isWonState(state)
  const dealNumber = dealNumberOf(state.seed)
  const groups = groupMoves(klondikeDraw1.legalMoves(world))

  const cardHeight = Math.round(CARD_WIDTH * theme.ratio)
  /** The active speed's flight timing: leg duration + start-to-start cadence. */
  const timing = FLIGHT_TIMING[flightSpeed]

  /** Distinct drop targets for the current selection. */
  const targets = new Set<PileId>()
  if (selected !== null) {
    for (const group of groups) {
      if (group.move.from === selected.pileId && group.move.count === selected.count) {
        targets.add(group.move.to)
      }
    }
  }

  /** Cards whose flight arc has not landed yet — hidden on the board. */
  const hiddenCards = new Set<string>()
  if (flights !== null) {
    for (const [cardId, lastLeg] of Object.entries(flights.hideUntil)) {
      if (lastLeg >= flights.settled) hiddenCards.add(cardId)
    }
  }

  /** Flight ghost art, looked up from the FINAL world (id → card + face-up). */
  const flyingCardById = new Map<string, PileCard>()
  if (flights !== null) {
    for (const pile of Object.values(world.piles)) {
      for (const pc of pile.cards) flyingCardById.set(pc.card.id, pc)
    }
  }

  // A win drops the save (win/loss stats stay deferred, D6) — idempotent.
  useEffect(() => {
    if (won) clearGame()
  }, [won])

  // Clear pending timers (invalid-feedback + flight settle chain) on unmount.
  useEffect(
    () => () => {
      if (dealInvalidTimer.current !== null) window.clearTimeout(dealInvalidTimer.current)
      for (const timer of flightTimers.current) window.clearTimeout(timer)
    },
    [],
  )

  const deselect = () => setSelected(null)

  /** Cancel any active flight overlay: clear timers + drop it (board snaps). */
  const cancelFlights = () => {
    for (const timer of flightTimers.current) window.clearTimeout(timer)
    flightTimers.current = []
    setFlights(null)
  }

  /**
   * Begin the cosmetic flight overlay for one committed action group,
   * measured against the render-time DOM BEFORE the final state renders.
   * Each card flies ONE merged arc — its first leg's source to its last
   * leg's destination, delayed at its first leg — so back-to-back legs
   * (draw then fly, a run whose top continues onward) never blink as two
   * sequential motions. The state update stays instant and authoritative:
   * any abort (missing DOM hook, reduced motion, no move steps) just leaves
   * the instant board.
   */
  const startFlights = (group: readonly Action[]) => {
    for (const timer of flightTimers.current) window.clearTimeout(timer)
    flightTimers.current = []
    const steps = flightSteps(world, group)
    if (
      steps.length === 0 ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setFlights(null)
      return
    }
    const board = boardRef.current
    if (board === null) {
      setFlights(null)
      return
    }
    // Pre-move position of every card that will fly, from the pre-setState
    // DOM: a merged arc always starts where the card sits now (its first
    // leg's origin) — never a re-query (the DOM already shows the final
    // layout by the time anything animates).
    const domPos = new Map<string, { left: number; top: number }>()
    for (const step of steps) {
      for (const cardId of step.cardIds) {
        if (domPos.has(cardId)) continue
        const el = board.querySelector(`[data-card-id="${cardId}"]`)
        if (el === null) {
          setFlights(null) // Missing hook → today's instant behavior.
          return
        }
        const rect = el.getBoundingClientRect()
        domPos.set(cardId, { left: rect.left, top: rect.top })
      }
    }
    const gen = ++flightsGen.current
    // Per-step destination computation (unchanged): the viewport spot each
    // card occupies after its most recent leg — flownTo's last write per
    // card IS the final landing its merged arc aims at — plus each card's
    // first/last leg steps.
    const flownTo = new Map<string, { left: number; top: number }>()
    const firstLeg = new Map<string, number>()
    const lastLeg = new Map<string, number>()
    for (let k = 0; k < steps.length; k++) {
      const step = steps[k]
      const slot = board.querySelector(`[data-pile-id="${step.toPile}"]`)
      if (slot === null) {
        setFlights(null)
        return
      }
      const rect = slot.getBoundingClientRect()
      // Tableaux land the run at its final fan indices (the landed count sets
      // the fan); other piles land the top card at the slot origin.
      const fan =
        ROLES.get(step.toPile) === 'tableau' ? fanOffset(step.landedOnCount, cardHeight) : 0
      const run = step.cardIds.length
      for (let i = 0; i < run; i++) {
        const cardId = step.cardIds[i]
        if (!firstLeg.has(cardId)) firstLeg.set(cardId, k)
        lastLeg.set(cardId, k)
        const left = rect.left
        const top = rect.top + (step.landedOnCount - run + i) * fan
        flownTo.set(cardId, { left, top })
      }
    }
    // One spec per card, emitted at its FIRST leg: source = its measured
    // pre-move spot, destination = its final landing. A run whose top card
    // continues onward still splits: the run's other cards land at the
    // tableau while the top card arcs straight to its final spot — the
    // expected shape of a per-card merged arc.
    const specs: FlightSpec[] = []
    for (let k = 0; k < steps.length; k++) {
      for (const cardId of steps[k].cardIds) {
        if (firstLeg.get(cardId) !== k) continue // one arc, emitted once
        const src = domPos.get(cardId)
        const to = flownTo.get(cardId)
        if (src === undefined || to === undefined) {
          setFlights(null) // Unmeasured card — unreachable, but never guess.
          return
        }
        specs.push({
          cardId,
          srcLeft: src.left,
          srcTop: src.top,
          dx: to.left - src.left,
          dy: to.top - src.top,
          delayMs: k * timing.step,
        })
      }
    }
    // Board hiding is per card too: hidden until its LAST leg's settle timer
    // fires (hideUntil[cardId] >= settled) — exactly when its arc lands.
    const hideUntil: Record<string, number> = {}
    for (const [cardId, leg] of lastLeg) hideUntil[cardId] = leg
    setFlights({ gen, specs, hideUntil, stepCount: steps.length, settled: 0 })
    // One settle timer per step: leg k lands at k * step + leg ms (the
    // active flight timing). The gen guard makes a stale chain a no-op
    // against a newer overlay.
    for (let k = 0; k < steps.length; k++) {
      const landed = k + 1
      flightTimers.current.push(
        window.setTimeout(
          () =>
            setFlights((current) => {
              if (current === null || current.gen !== gen) return current
              return landed >= current.stepCount ? null : { ...current, settled: landed }
            }),
          k * timing.step + timing.leg,
        ),
      )
    }
  }

  /** Execute one grouped legal move as a single player click. */
  const commit = (actions: readonly Action[]) => {
    const next = moveGroup(state, actions, { autoFly })
    // Animate the WHOLE committed group (rule actions + moveGroup's safe
    // flights) against the render-time world, then apply the state instantly.
    startFlights(next.moves[next.moves.length - 1])
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

  /**
   * Double-click smart move: the first legal foundation move, else the
   * unique legal destination. Ambiguous positions move nothing.
   */
  const quickFly = (from: PileId, count: number) => {
    const g = quickMove(groups, from, count, (id) => ROLES.get(id))
    if (g) commit(g.actions)
  }

  const newDeal = () => {
    cancelFlights()
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
    cancelFlights()
    const fresh = initialState(String(n))
    setState(fresh)
    saveGame(fresh)
    setSelected(null)
    setDealInput('')
  }

  const undo = () => {
    cancelFlights()
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
          data-pile-id={hint.pileId}
          className={`pile-slot${clickable ? ' clickable' : ''}`}
          style={cellStyle(hint, cardHeight)}
          onClick={clickable ? stockClick : undefined}
        >
          {top !== null && (
            <div
              className="fan-card"
              data-card-id={top.card.id}
              style={{
                zIndex: 1,
                ...(hiddenCards.has(top.card.id) ? { visibility: 'hidden' as const } : {}),
              }}
            >
              <CardView card={top.card} faceUp={false} theme={theme} width={CARD_WIDTH} />
            </div>
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
          data-pile-id={hint.pileId}
          className={slotClass}
          style={cellStyle(hint, height)}
          onClick={isTarget ? () => drop(hint.pileId) : undefined}
        >
          {cards.map((pc, i) => (
            <div
              key={pc.card.id}
              data-card-id={pc.card.id}
              className={
                `fan-card${isTarget && i === cards.length - 1 ? ' drop-target' : ''}` +
                `${selectedCount > 0 && i >= cards.length - selectedCount ? ' selected-run' : ''}` +
                `${!isTarget && pc.faceUp ? ' selectable' : ''}`
              }
              style={{
                top: i * offset,
                zIndex: i,
                ...(hiddenCards.has(pc.card.id) ? { visibility: 'hidden' as const } : {}),
              }}
              onClick={(e: ReactMouseEvent) => {
                e.stopPropagation()
                if (isTarget) drop(hint.pileId)
                else if (pc.faceUp) setSelected({ pileId: hint.pileId, count: cards.length - i })
              }}
              onDoubleClick={(e) => {
                e.stopPropagation()
                quickFly(hint.pileId, cards.length - i)
              }}
            >
              <CardView card={pc.card} faceUp={pc.faceUp} theme={theme} width={CARD_WIDTH} />
            </div>
          ))}
        </div>
      )
    }

    // Waste / foundation: render the topmost VISIBLE card down — an incoming
    // (still-flying, hidden) top card must never blank the pile (see header).
    // Empty or all-hidden keeps the empty-slot fallback (foundation glyph).
    const visibleIdx = cards.findLastIndex((pc) => !hiddenCards.has(pc.card.id))
    const selectedTop = selected !== null && selected.pileId === hint.pileId
    return (
      <div
        key={hint.pileId}
        data-pile-id={hint.pileId}
        className={slotClass}
        style={cellStyle(hint, cardHeight)}
        onClick={isTarget ? () => drop(hint.pileId) : undefined}
      >
        {visibleIdx >= 0 ? (
          cards.slice(visibleIdx).map((pc) => (
            <div
              key={pc.card.id}
              data-card-id={pc.card.id}
              className={
                `fan-card${isTarget ? ' drop-target' : ''}` +
                `${selectedTop ? ' selected-run' : ''}` +
                `${!isTarget && pc.faceUp ? ' selectable' : ''}`
              }
              style={{
                zIndex: 1,
                ...(hiddenCards.has(pc.card.id) ? { visibility: 'hidden' as const } : {}),
              }}
              onClick={(e: ReactMouseEvent) => {
                e.stopPropagation()
                if (isTarget) drop(hint.pileId)
                else if (pc.faceUp) setSelected({ pileId: hint.pileId, count: 1 })
              }}
              onDoubleClick={(e) => {
                e.stopPropagation()
                quickFly(hint.pileId, 1)
              }}
            >
              <CardView card={pc.card} faceUp={pc.faceUp} theme={theme} width={CARD_WIDTH} />
            </div>
          ))
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
          <button type="button" className="secondary-btn" onClick={onOpenSettings}>
            Settings
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

      <section className="board" ref={boardRef} aria-label={`${meta.title} table`}>
        {klondikeDraw1.layout.map(renderPile)}
      </section>

      {/* Cosmetic flight ghosts — one merged arc per card; clicks pass through. */}
      {flights !== null && (
        <div className="flight-layer" aria-hidden="true">
          {flights.specs.map((spec) => {
            const pc = flyingCardById.get(spec.cardId)
            if (pc === undefined) return null
            return (
              <div
                key={spec.cardId}
                className="flight-card"
                style={
                  {
                    left: spec.srcLeft,
                    top: spec.srcTop,
                    width: CARD_WIDTH,
                    animationDelay: `${spec.delayMs}ms`,
                    '--flight-dur': `${timing.leg}ms`,
                    '--dx': `${spec.dx}px`,
                    '--dy': `${spec.dy}px`,
                  } as CSSProperties
                }
              >
                <CardView card={pc.card} faceUp={pc.faceUp} theme={theme} width={CARD_WIDTH} />
              </div>
            )
          })}
        </div>
      )}

      {/* The banner waits until the winning flights have landed. */}
      {won && flights === null && (
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
