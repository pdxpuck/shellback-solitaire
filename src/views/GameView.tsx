/**
 * GameView — the playable game screen, fully game-agnostic: every
 * rules-specific input arrives via the GameViewConfig prop (definition +
 * session + presentation glue — see games/gameViews.ts), and the view never
 * names a game. Two interaction modes
 * (C3): click-click — click a face-up fan card to select its run (or a
 * waste/foundation top card to select it), legal destinations highlight,
 * click one to move — and double-click smart move, which quick-flies the
 * clicked card/run to the first legal foundation move, else to its LEFT-MOST
 * legal destination (ambiguity resolves left-most — lowest layout column,
 * ties → first group; the stock is never auto-chosen, so recycling stays a
 * deliberate stock click). A stock click draws; an empty special slot click
 * (the stock with the waste nonempty, or Canfield's empty reserve) commits
 * the whole-pile flip-over INTO it (recycle / reserve refill); a click
 * elsewhere deselects.
 * Drag-and-drop (C3): pressing a face-up card and moving past a 6px threshold
 * drags its whole run as a ghost — a legal drop commits WITHOUT flight
 * animation (the drag was the animation), an illegal drop glides home, and a
 * press that never crosses the threshold stays an ordinary click. Every
 * player click commits as ONE
 * moveGroup (rule actions + its safe flights when the settings autoFly
 * toggle is on) — which is exactly one undo group. Flight pacing is a user
 * setting too (slow/med/fast, default med — see FLIGHT_TIMING). The board
 * is placed from definition.layout on a CSS grid. Fan geometry is constant
 * per view (layout.ts) — fans compress inside their box — and the felt is
 * the full window surface (the header stays pinned; the board scrolls
 * internally).
 *
 * Card flights (C3) are purely cosmetic: commit applies the final state
 * instantly and authoritatively, and a fixed-position overlay flies ONE
 * merged ghost arc per card — from its measured pre-move spot to its final
 * landing, even across back-to-back legs (a draw that continues onto a
 * foundation is one sweep) — while the moved board cards stay hidden until
 * their arc's settle timer fires. Any cancel (new commit, undo, new deal,
 * unmount) just snaps to the final layout. While an incoming card is in
 * flight (hidden on the board), its destination pile renders the topmost
 * VISIBLE card down — never blank. A flipped card renders face-down until
 * the flight that exposed it lands. Ghost stacking follows flight order —
 * later flights paint above earlier ones.
 *
 * Every deal carries a game # (the seed, 1..1,000,000): the toolbar shows it
 * (or "Practice deal" for legacy string seeds) and the "Play #" input
 * replays any deal exactly by number.
 *
 * Settings is reachable from the toolbar; its Back returns to wherever it
 * was opened from (the game — state survives via the per-commit save).
 */
import { useEffect, useRef, useState } from 'react'
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import type { Action, PileCard, PileId } from 'deckhand/engine'
import type { LayoutHint } from 'deckhand/contract'
import type { CardTheme, Point } from 'deckhand/renderer'
import { CardView, useDrag, withinBounds } from 'deckhand/renderer'
import type { GameMeta } from '../games/registry'
import type { FlightSpeed } from '../settings'
import { groupMoves, quickMove } from '../games/gameViews'
import type { GameViewConfig, GameState } from '../games/gameViews'
import { flightPlan } from './flights'
import { columnHeightFor, fanOffsetIn } from './layout'

interface GameViewProps {
  /** The per-game view config (definition + session + presentation glue). */
  config: GameViewConfig
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

/** Press-to-drag threshold: a press moving beyond this many px is a drag. */
const DRAG_THRESHOLD_PX = 6
/** Fan offset between consecutive cards in the dragged run's ghost. */
const DRAG_FAN_OFFSET = 12
/** Snap-back fallback: clear the drag if transitionend never fires. */
const SNAP_BACK_MS = 160

/** Per-speed flight timing: one leg's duration + the start-to-start cadence.
 *  Both values are scaled by the ?slowmo multiplier (see SLOWMO). */
const FLIGHT_TIMING: Record<FlightSpeed, { leg: number; step: number }> = {
  slow: { leg: 400, step: 480 },
  med: { leg: 280, step: 340 },
  fast: { leg: 180, step: 220 },
}

/** ?slowmo=N multiplies every flight timing (legs + cadence) by N — debug aid
 *  for observing cascades. Defaults to 1 (no effect). Clamped to 1..10. */
const SLOWMO = Math.min(
  10,
  Math.max(1, Number(new URLSearchParams(window.location.search).get('slowmo') ?? '1') || 1),
)

/**
 * The deal # for a seed, when the seed is numeric: Number() parses it and
 * round-trips back to the exact same string. Legacy seeds (arbitrary
 * strings) yield null and render as a "Practice deal".
 */
function dealNumberOf(seed: string): number | null {
  const n = Number(seed)
  return Number.isInteger(n) && String(n) === seed ? n : null
}

/** One card's flight leg: viewport source position + delta to its landing spot. */
interface FlightSpec {
  readonly cardId: string
  readonly srcLeft: number
  readonly srcTop: number
  readonly dx: number
  readonly dy: number
  readonly delayMs: number
  readonly zIndex: number
}

/** The active flight overlay: per-card arcs, settle progression, generation guard. */
interface FlightsState {
  /** Bumped per commit — stale settle timers must never touch a newer overlay. */
  readonly gen: number
  readonly specs: readonly FlightSpec[]
  /** cardId → its LAST leg's step index; the board hides the card until then. */
  readonly hideUntil: Readonly<Record<string, number>>
  /** cardId → the step index of the move that EXPOSED its flip; the board
   *  renders it face-down until that leg's settle timer fires. */
  readonly revealAt: Readonly<Record<string, number>>
  readonly stepCount: number
  /** Steps that have fully landed so far (moved board cards unhide past theirs). */
  readonly settled: number
}

/** An activated drag: the grabbed run + the ghost's origin geometry. */
interface DragState {
  readonly cardId: string
  readonly pileId: PileId
  /** Cards in the dragged run (tableau: everything from the grab down). */
  readonly count: number
  /** Pointer position at activation — the ghost transform's origin. */
  readonly startX: number
  readonly startY: number
  /** The grabbed card's measured rect — where the ghost mounts. */
  readonly left: number
  readonly top: number
  /** True while the ghost glides back home after an unresolved drop. */
  readonly snapBack: boolean
}

function GameView({
  config,
  meta,
  theme,
  onBack,
  autoFly,
  flightSpeed,
  onOpenSettings,
}: GameViewProps) {
  // The game-agnostic surface, destructured once: `definition` drives the
  // board (pile topology, layout, legal moves), `session` drives play
  // (replay, save/load, move groups). Every call site below is identical
  // for every game.
  const { definition } = config
  const {
    clearGame,
    initialState,
    isWonState,
    loadGame,
    moveGroup,
    parseDealNumber,
    randomDealNumber,
    saveGame,
    worldFor,
  } = config.session
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
  /** The activated drag (ghost + run), or null — set only past the threshold. */
  const [drag, setDrag] = useState<DragState | null>(null)
  /** Pointer origin of the press — a ref, NOT state: pointerdown fires on
   * every click, and only the 6px threshold turns a press into a drag. */
  const dragOrigin = useRef<Point | null>(null)
  /** The pressed card, read off the wrapper's data attributes at pointerdown. */
  const dragPress = useRef<{ cardId: string; pileId: PileId } | null>(null)
  /** True once the press crossed the threshold and became a real drag. */
  const dragActivated = useRef(false)
  /** Set when an ACTIVATED drag ends; swallows the trailing browser click. */
  const dragJustEnded = useRef(false)
  /** True during the snap-back glide — further presses are ignored. */
  const dragSnapping = useRef(false)
  /** Fallback timer clearing the snap-back if transitionend never fires. */
  const snapTimer = useRef<number | null>(null)
  /** The ghost element — moves are positioned imperatively (no setState). */
  const ghostRef = useRef<HTMLDivElement | null>(null)

  const world = worldFor(state)
  const won = isWonState(state)
  const dealNumber = dealNumberOf(state.seed)
  const groups = groupMoves(definition.legalMoves(world))

  /** Pile id → role, from the game definition's pile topology. */
  const ROLES = new Map(definition.piles.map((pile) => [pile.id, pile.role]))

  /** Pile id → layout column, from the game definition's layout hints. */
  const LAYOUT_COL = new Map(definition.layout.map((hint) => [hint.pileId, hint.col]))

  const cardHeight = Math.round(CARD_WIDTH * theme.ratio)
  // The fan box: constant for this view's lifetime. Captured ONCE from the
  // viewport at mount — viewport changes mid-game must not reflow piles
  // (layout.ts contract: no window reads during render).
  const [columnHeight] = useState(() => columnHeightFor(window.innerHeight, cardHeight))
  /** The active speed's flight timing (leg + cadence), scaled by the ?slowmo
   *  multiplier — every downstream use (spec delayMs, settle timers,
   *  --flight-dur) derives from this one object. */
  const timing = ((t) => ({ leg: t.leg * SLOWMO, step: t.step * SLOWMO }))(
    FLIGHT_TIMING[flightSpeed],
  )

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
  /** Cards whose EXPOSING flight has not landed yet — still rendered face-down. */
  const unrevealedCards = new Set<string>()
  if (flights !== null) {
    for (const [cardId, lastLeg] of Object.entries(flights.hideUntil)) {
      if (lastLeg >= flights.settled) hiddenCards.add(cardId)
    }
    for (const [cardId, revealStep] of Object.entries(flights.revealAt)) {
      if (revealStep >= flights.settled) unrevealedCards.add(cardId)
    }
  }

  /** True while the card's exposing flight is still airborne — the board
   *  renders it face-down until that leg lands (same >= gate as hiding). */
  const unrevealed = (cardId: string): boolean => unrevealedCards.has(cardId)

  /** The dragged run's cards (render-time world) — the ghost's contents. */
  const dragRun: readonly PileCard[] =
    drag === null ? [] : world.piles[drag.pileId].cards.slice(-drag.count)
  /** True while dragging the reserve's top card — a reserve drag is always
   *  exactly that card, and its face-up override carries into the ghost. */
  const reserveDrag = drag !== null && ROLES.get(drag.pileId) === 'reserve'
  // An activated drag hides its whole run on the board: it lives in the ghost.
  if (drag !== null) {
    for (const pc of dragRun) hiddenCards.add(pc.card.id)
  }

  /** Flight ghost art, looked up from the FINAL world (id → card + face-up). */
  const flyingCardById = new Map<string, PileCard>()
  if (flights !== null) {
    for (const pile of Object.values(world.piles)) {
      for (const pc of pile.cards) flyingCardById.set(pc.card.id, pc)
    }
  }

  // A win drops the save (win/loss stats stay deferred, D6) — idempotent.
  // clearGame is the session's stable module function, so this still runs
  // only on a won→(re)render transition.
  useEffect(() => {
    if (won) clearGame()
  }, [won, clearGame])

  // Clear pending timers (invalid-feedback + flight settle chain + drag
  // snap-back fallback) on unmount.
  useEffect(
    () => () => {
      if (dealInvalidTimer.current !== null) window.clearTimeout(dealInvalidTimer.current)
      for (const timer of flightTimers.current) window.clearTimeout(timer)
      if (snapTimer.current !== null) window.clearTimeout(snapTimer.current)
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

  /** Clear the drag state; dragJustEnded survives — the trailing browser
   * click of a just-ended drag still needs swallowing. */
  const clearDrag = () => {
    if (snapTimer.current !== null) {
      window.clearTimeout(snapTimer.current)
      snapTimer.current = null
    }
    dragSnapping.current = false
    setDrag(null)
  }

  /** Cancel paths (undo / new deal / deal jump): drop the drag entirely. */
  const cancelDrag = () => {
    dragJustEnded.current = false
    dragOrigin.current = null
    dragPress.current = null
    dragActivated.current = false
    clearDrag()
  }

  /** Unresolved drop: glide the ghost home (CSS), then fully clear the drag
   * on transitionend — or via the fallback timer if the event never fires. */
  const beginSnapBack = () => {
    dragSnapping.current = true
    setDrag((current) => (current === null ? null : { ...current, snapBack: true }))
    snapTimer.current = window.setTimeout(clearDrag, SNAP_BACK_MS)
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
    const plan = flightPlan(world, group)
    const steps = plan.steps
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
        ROLES.get(step.toPile) === 'tableau'
          ? fanOffsetIn(step.landedOnCount, cardHeight, columnHeight)
          : 0
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
    // zIndex encodes the flight step (50 + k): later flights paint ABOVE
    // earlier ones (a landed/holding ghost is covered by the next card
    // flying onto the same pile, matching real stacking); within one step,
    // run order is DOM order, which is correct bottom-to-top.
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
          zIndex: 50 + k,
        })
      }
    }
    // Board hiding is per card too: hidden until its LAST leg's settle timer
    // fires (hideUntil[cardId] >= settled) — exactly when its arc lands.
    const hideUntil: Record<string, number> = {}
    for (const [cardId, leg] of lastLeg) hideUntil[cardId] = leg
    setFlights({
      gen,
      specs,
      hideUntil,
      revealAt: plan.revealAt,
      stepCount: steps.length,
      settled: 0,
    })
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
  const commit = (actions: readonly Action[], opts?: { animate?: boolean }) => {
    const next = moveGroup(state, actions, { autoFly })
    // Animate the WHOLE committed group (rule actions + moveGroup's safe
    // flights) against the render-time world, then apply the state instantly.
    // A drag-drop commit passes { animate: false } — the drag WAS the
    // animation; the ghost unmounts straight into the landed board.
    if (opts?.animate !== false) startFlights(next.moves[next.moves.length - 1])
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

  /**
   * The special whole-pile click, wired to the stock slot and the EMPTY
   * reserve slot. A draw FROM the clicked pile wins when one exists (the
   * stock deals); otherwise the whole-pile flip-over INTO the clicked pile
   * commits — Klondike's waste→stock recycle and Canfield's waste→reserve
   * refill are the same shape: one reverse move of the whole waste, face
   * down. Both are deliberate clicks on the empty slot, never auto-chosen.
   */
  const specialClick = (pileId: PileId) => {
    const draw = groups.find((g) => g.move.from === pileId)
    if (draw) {
      commit(draw.actions)
      return
    }
    const refill = groups.find(
      (g) => (g.move.from === 'waste' || g.move.from === 'stock') && g.move.to === pileId,
    )
    if (refill) commit(refill.actions)
  }

  /**
   * Double-click smart move: the first legal foundation move, else the
   * LEFT-MOST legal destination (lowest layout column; ties → first group)
   * — ambiguity never blocks the fly, and the stock is never auto-chosen
   * (recycling stays a deliberate stock click).
   */
  const quickFly = (from: PileId, count: number) => {
    const g = quickMove(groups, from, count, (id) => ROLES.get(id), (id) => LAYOUT_COL.get(id) ?? 99)
    if (g) commit(g.actions)
  }

  const newDeal = () => {
    cancelFlights()
    cancelDrag()
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
    cancelDrag()
    const fresh = initialState(String(n))
    setState(fresh)
    saveGame(fresh)
    setSelected(null)
    setDealInput('')
  }

  const undo = () => {
    cancelFlights()
    cancelDrag()
    const next = { ...state, moves: state.moves.slice(0, -1) }
    setState(next)
    saveGame(next)
    setSelected(null)
  }

  // ---- drag-and-drop (C3) --------------------------------------------------
  // ONE useDrag instance serves every draggable card: bindings carry only
  // pointer plumbing, and card identity is read off the pressed wrapper's
  // data attributes (data-card-id, closest [data-pile-id]). Click vs drag is
  // OUR job: onDragStart fires on every pointerdown, so the origin + pressed
  // card live in refs, and only a move past the 6px threshold activates a
  // real drag (one setState to mount the ghost; every further move positions
  // it imperatively — no setState per move).

  /** Threshold crossed: mount the ghost via one setState, planted at the
   * grabbed card's measured rect. The ghost mounts at translate(0,0) —
   * exactly the card's spot — and the next pointermove positions it. */
  const activateDrag = (point: Point, e: ReactPointerEvent<HTMLElement>) => {
    const press = dragPress.current
    if (press === null) return
    const pile = world.piles[press.pileId]
    const idx = pile.cards.findIndex((pc) => pc.card.id === press.cardId)
    const grabbed = idx >= 0 ? pile.cards[idx] : null
    if (grabbed === null) return
    // View-level face-up — exactly the bindings condition: the model's flag
    // (still pre-reveal), plus the reserve's TOP card, which renders and
    // plays face-up ALWAYS (real-Canfield look) and so drags like it looks.
    const faceUp =
      (grabbed.faceUp && !unrevealed(grabbed.card.id)) ||
      (ROLES.get(press.pileId) === 'reserve' && idx === pile.cards.length - 1)
    if (!faceUp) return
    const rect = e.currentTarget.getBoundingClientRect()
    setDrag({
      cardId: press.cardId,
      pileId: press.pileId,
      count: pile.cards.length - idx, // same run formula as click-select
      startX: point.x,
      startY: point.y,
      left: rect.left,
      top: rect.top,
      snapBack: false,
    })
  }

  /** pointerdown on a drag source: record origin + pressed card (refs). */
  const handleDragStart = (point: Point, e: ReactPointerEvent<HTMLElement>) => {
    if (dragSnapping.current) return // the snap-back glide ignores presses
    dragJustEnded.current = false // a fresh press outlives any swallow window
    const cardId = e.currentTarget.dataset.cardId
    const pileEl = e.currentTarget.closest<HTMLElement>('[data-pile-id]')
    const pileId = pileEl?.dataset.pileId
    if (cardId === undefined || pileId === undefined) return
    dragOrigin.current = point
    dragPress.current = { cardId, pileId }
    dragActivated.current = false
  }

  /** Ghost follow: imperative transform only — no setState per move. */
  const handleDragMove = (point: Point, e: ReactPointerEvent<HTMLElement>) => {
    const origin = dragOrigin.current
    if (origin === null) return
    if (!dragActivated.current) {
      const dx = point.x - origin.x
      const dy = point.y - origin.y
      if (dx * dx + dy * dy <= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return
      dragActivated.current = true
      activateDrag(point, e)
      return
    }
    const d = drag
    const ghost = ghostRef.current
    if (d !== null && ghost !== null) {
      ghost.style.transform = `translate(${point.x - d.startX}px, ${point.y - d.startY}px)`
    }
  }

  /** Drop resolution: hit-test the pile slots, commit the legal group
   * without re-animating, else glide the ghost back home. */
  const handleDragEnd = (point: Point) => {
    dragOrigin.current = null
    dragPress.current = null
    const activated = dragActivated.current
    dragActivated.current = false
    if (!activated) return // never activated → ordinary click; onClick runs
    dragJustEnded.current = true // swallow the trailing browser click
    const d = drag
    const board = boardRef.current
    if (d === null || board === null) {
      clearDrag()
      return
    }
    // First slot containing the drop point wins (slots never overlap); the
    // SOURCE pile is skipped — dropping home is a quiet cancel, no glide.
    let targetId: string | null = null
    for (const slot of board.querySelectorAll<HTMLElement>('[data-pile-id]')) {
      const id = slot.dataset.pileId
      if (id === undefined || id === d.pileId) continue
      if (withinBounds(point, slot.getBoundingClientRect())) {
        targetId = id
        break
      }
    }
    if (targetId !== null) {
      const target = targetId
      const group = groups.find(
        (g) => g.move.from === d.pileId && g.move.count === d.count && g.move.to === target,
      )
      if (group !== undefined) {
        clearDrag()
        commit(group.actions, { animate: false })
        return
      }
    }
    beginSnapBack()
  }

  const dragHandle = useDrag({
    onDragStart: handleDragStart,
    onDragMove: handleDragMove,
    onDragEnd: handleDragEnd,
  })

  // Snap-back: once the .snapping transition class is committed, glide the
  // imperatively-positioned ghost back to its origin (translate(0, 0)).
  useEffect(() => {
    if (drag !== null && drag.snapBack && ghostRef.current !== null) {
      ghostRef.current.style.transform = 'translate(0, 0)'
    }
  }, [drag])

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

    // Stock: click = draw (cards) or, when empty with the waste nonempty,
    // the whole-pile flip-over recycle into the stock (specialClick).
    if (hint.pileId === 'stock') {
      const clickable = top !== null || world.piles.waste.cards.length > 0
      return (
        <div
          key={hint.pileId}
          data-pile-id={hint.pileId}
          className={`pile-slot${clickable ? ' clickable' : ''}`}
          style={cellStyle(hint, cardHeight)}
          onClick={clickable ? () => specialClick(hint.pileId) : undefined}
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

    // Fan piles (hint.fan 'down' — the tableaux, plus Canfield's reserve):
    // the full pile fans down; a face-up card selects the run beneath it.
    // The reserve's TOP card renders face-up ALWAYS — the playable top of
    // the (model-)face-down stack — and is the only reserve card that
    // selects or drags; deeper cards stay face-down chrome. The empty
    // reserve's slot click is its whole-pile refill (specialClick).
    if (hint.fan === 'down') {
      // Fixed-box fan model (layout.ts): the slot box is CONSTANT for the
      // view. Empty boxes stay card-sized; the box takes full column height
      // on the FIRST card and then never changes — one stable jump per pile,
      // never per move. The fan compresses inside the box as the pile grows.
      const offset = fanOffsetIn(cards.length, cardHeight, columnHeight)
      const height = cards.length === 0 ? cardHeight : columnHeight
      const selectedCount = selected !== null && selected.pileId === hint.pileId ? selected.count : 0
      const emptyReserveClick =
        role === 'reserve' && cards.length === 0 ? () => specialClick(hint.pileId) : undefined
      return (
        <div
          key={hint.pileId}
          data-pile-id={hint.pileId}
          className={slotClass}
          style={cellStyle(hint, height)}
          onClick={isTarget ? () => drop(hint.pileId) : emptyReserveClick}
        >
          {cards.map((pc, i) => {
            // A flip not yet revealed by its exposing flight's landing renders
            // face-down — not selectable, not a drag source, not click-select.
            // The reserve's top card overrides to face-up unconditionally.
            const isTop = i === cards.length - 1
            const faceUp =
              (pc.faceUp && !unrevealed(pc.card.id)) || (role === 'reserve' && isTop)
            return (
              <div
                key={pc.card.id}
                data-card-id={pc.card.id}
                className={
                  `fan-card${isTarget && i === cards.length - 1 ? ' drop-target' : ''}` +
                  `${selectedCount > 0 && i >= cards.length - selectedCount ? ' selected-run' : ''}` +
                  `${!isTarget && faceUp ? ' selectable' : ''}`
                }
                {...(faceUp ? dragHandle.bindings : {})}
                style={{
                  ...(faceUp ? dragHandle.bindings.style : {}),
                  top: i * offset,
                  zIndex: i,
                  ...(hiddenCards.has(pc.card.id) ? { visibility: 'hidden' as const } : {}),
                }}
                onClick={(e: ReactMouseEvent) => {
                  e.stopPropagation()
                  if (dragJustEnded.current) {
                    dragJustEnded.current = false // swallow the click a drag emits
                    return
                  }
                  if (isTarget) drop(hint.pileId)
                  else if (faceUp) setSelected({ pileId: hint.pileId, count: cards.length - i })
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  quickFly(hint.pileId, cards.length - i)
                }}
              >
                <CardView card={pc.card} faceUp={faceUp} theme={theme} width={CARD_WIDTH} />
              </div>
            )
          })}
        </div>
      )
    }

    // Waste / foundation: render the topmost VISIBLE card down — an incoming
    // (still-flying, hidden) top card must never blank the pile (see header).
    // Empty or all-hidden keeps the empty-slot fallback (foundation glyph).
    // ES2023 findLastIndex is polyfill-free in esbuild builds and crashes older mobile browsers — plain reverse index scan instead.
    let visibleIdx = -1
    for (let i = cards.length - 1; i >= 0; i--) {
      if (!hiddenCards.has(cards[i].card.id)) {
        visibleIdx = i
        break
      }
    }
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
          cards.slice(visibleIdx).map((pc) => {
            // Only the pile's actual top card drags — a still-flying (hidden)
            // top gets bindings but is unhit-testable while invisible.
            const draggable = top !== null && pc === top && top.faceUp
            return (
              <div
                key={pc.card.id}
                data-card-id={pc.card.id}
                className={
                  `fan-card${isTarget ? ' drop-target' : ''}` +
                  `${selectedTop ? ' selected-run' : ''}` +
                  `${!isTarget && pc.faceUp ? ' selectable' : ''}`
                }
                {...(draggable ? dragHandle.bindings : {})}
                style={{
                  ...(draggable ? dragHandle.bindings.style : {}),
                  zIndex: 1,
                  ...(hiddenCards.has(pc.card.id) ? { visibility: 'hidden' as const } : {}),
                }}
                onClick={(e: ReactMouseEvent) => {
                  e.stopPropagation()
                  if (dragJustEnded.current) {
                    dragJustEnded.current = false // swallow the click a drag emits
                    return
                  }
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
            )
          })
        ) : (
          role === 'foundation' && (
            <span className="slot-glyph" aria-hidden="true">
              {config.emptyFoundationGlyph(world, hint.pileId)}
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

      {/* The board scrolls INTERNALLY inside the fixed felt surface — the
          green never resizes; the header above stays pinned. */}
      <div className="board-scroll">
        <section className="board" ref={boardRef} aria-label={`${meta.title} table`}>
          {definition.layout.map(renderPile)}
        </section>
      </div>

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
                    zIndex: spec.zIndex,
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

      {/* The dragged run's ghost — its own fixed layer above the flight layer
          (z-6) and below the win overlay; pointer-transparent, driven by the
          pointer capture on the pressed card. Snap-back adds a glide class. */}
      {drag !== null && (
        <div className="drag-layer" aria-hidden="true">
          <div
            ref={ghostRef}
            className={`drag-ghost${drag.snapBack ? ' snapping' : ''}`}
            style={{ left: drag.left, top: drag.top, width: CARD_WIDTH }}
            onTransitionEnd={(e) => {
              if (e.target === e.currentTarget && e.propertyName === 'transform') clearDrag()
            }}
          >
            {dragRun.map((pc, i) => (
              <div key={pc.card.id} className="drag-card" style={{ top: i * DRAG_FAN_OFFSET }}>
                <CardView card={pc.card} faceUp={pc.faceUp || reserveDrag} theme={theme} width={CARD_WIDTH} />
              </div>
            ))}
          </div>
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
            <button type="button" className="secondary-btn" onClick={onBack}>
              Back to main
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default GameView
