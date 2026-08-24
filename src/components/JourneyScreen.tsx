/**
 * The daily journey screen.
 *
 * Two stations at the top and a chain building between them. Unlike the queued modes
 * there is nothing to read off and copy: the whole point is that you have to know, or
 * work out, what sits in between. So the board along the bottom shows what you are
 * currently typing and what it could still become, rather than the answer.
 */

import { useCallback, useEffect, useMemo, useReducer } from 'react'
import { getStation } from '../data/network.ts'
import type { StationId } from '../data/types.ts'
import type { MatchMode } from '../engine/matcher.ts'
import { isTypeableKey } from '../engine/matcher.ts'
import {
  activeCandidate,
  createJourney,
  elapsedMs,
  guessesLeft,
  isConfirmKey,
  journeyReducer,
  suggestions,
  type JourneyState,
} from '../engine/journey.ts'
import { accuracy, formatAccuracy, formatDuration, kpm } from '../engine/scoring.ts'
import type { DailyPuzzle } from '../game/daily.ts'
import { accentVars, inkOn } from '../game/contrast.ts'
import { lineColor } from '../data/lineColors.ts'
import { useColorScheme, useLineMap } from '../hooks/useColorScheme.ts'
import { TubeMap, type CandidatePill } from './TubeMap.tsx'

const TICK_MS = 100

interface Props {
  puzzle: DailyPuzzle
  matchMode: MatchMode
  onFinish: (state: JourneyState) => void
}

export function JourneyScreen({ puzzle, matchMode, onFinish }: Props) {
  const [state, dispatch] = useReducer(journeyReducer, { puzzle, matchMode }, createJourney)
  const scheme = useColorScheme()
  const lineMap = useLineMap()

  const giveUp = useCallback(() => dispatch({ type: 'give-up' }), [])

  useEffect(() => {
    if (state.status === 'won' || state.status === 'lost') return
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key === 'Escape') {
        event.preventDefault()
        dispatch({ type: 'give-up' })
        return
      }
      // Enter is the commit key, so it has to reach the reducer alongside letters.
      if (!isTypeableKey(event.key) && !isConfirmKey(event.key)) return
      event.preventDefault()
      const at = performance.now()
      dispatch({ type: 'start', at })
      dispatch({ type: 'key', key: event.key, at })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [state.status])

  useEffect(() => {
    if (state.status !== 'running') return
    const id = window.setInterval(() => dispatch({ type: 'tick', at: performance.now() }), TICK_MS)
    return () => window.clearInterval(id)
  }, [state.status])

  useEffect(() => {
    if (state.status === 'won' || state.status === 'lost') onFinish(state)
    // Fires once on the transition rather than on every settling render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status])

  const from = getStation(puzzle.from)
  const to = getStation(puzzle.to)
  const elapsed = elapsedMs(state)
  const active = activeCandidate(state)
  const ready = state.readyToConfirm ? getStation(state.readyToConfirm) : null
  const options = suggestions(state, 6)

  // The accent follows the line the journey ends on, which is a nicer tie to the map than
  // a fixed colour and changes as the puzzle does.
  const accent = lineColor(puzzle.optimal.journey.legs[0]?.lineId ?? 'elizabeth', scheme)

  // Stations named so far, shown on the map as filled markers. The route itself stays
  // hidden until the run is over; showing it would be showing the answer.
  const pills: CandidatePill[] = useMemo(
    () =>
      state.named.map((id) => {
        const station = getStation(id)
        return {
          stationId: id,
          name: station.name,
          lines: station.lines,
          live: true,
          visited: false,
          typed: 0,
        }
      }),
    [state.named],
  )

  const revealed = state.status === 'won' || state.status === 'lost'

  return (
    <div className="game" style={accentVars(accent) as React.CSSProperties}>
      <header className="game__header">
        <div className="run-card">
          <div className="run-card__terminus">
            <span className="run-card__tag" style={{ background: accent, color: inkOn(accent) }}>
              From
            </span>
            <span className="run-card__name">{from.name}</span>
          </div>
          <div className="run-card__middle">
            <strong>
              {state.spent} / {state.budget}
            </strong>
            <span>
              {puzzle.toName} needed, {puzzle.transfers}{' '}
              {puzzle.transfers === 1 ? 'change' : 'changes'}
            </span>
          </div>
          <div className="run-card__terminus">
            <span className="run-card__tag" style={{ background: accent, color: inkOn(accent) }}>
              To
            </span>
            <span className="run-card__name">{to.name}</span>
          </div>
        </div>
        <button type="button" className="button button--ghost game__quit" onClick={giveUp}>
          Give up <kbd>Esc</kbd>
        </button>
      </header>

      <div className="game__map">
        <TubeMap
          routeStationIds={revealed ? (state.solution ?? []) : []}
          position={revealed ? (state.solution?.length ?? 1) - 1 : 0}
          progress={1}
          activeLineId={null}
          candidates={pills}
          trail={[]}
          atStationId={state.named[state.named.length - 1] ?? puzzle.from}
          zoom={1.6}
        />

        {state.status === 'ready' ? (
          <p className="game__overlay">Type a station between the two to begin</p>
        ) : null}

        <dl className="strip">
          <Figure label="Time" value={formatDuration(elapsed)} />
          <Figure label="Named" value={String(state.named.length)} />
          <Figure label="Left" value={String(guessesLeft(state))} urgent={guessesLeft(state) <= 2} />
          <Figure label="Mistakes" value={String(state.errors)} />
          <Figure label="KPM" value={String(Math.round(kpm(state.correctKeys, elapsed)))} />
          <Figure
            label="Accuracy"
            value={formatAccuracy(accuracy(state.correctKeys, state.errors))}
          />
        </dl>
      </div>

      <div className="banner banner--journey">
        <p className="banner__line" style={{ background: accent, color: inkOn(accent) }}>
          {from.name} → {to.name}
        </p>
        <div className="banner__band" style={{ background: accent }}>
          <div className="banner__capsule banner__capsule--roam">
            <span className="banner__badge" style={{ background: accent, color: inkOn(accent) }}>
              {state.named.length}
              <span className="banner__badge-total">/{puzzle.toName}</span>
            </span>
            <div className="roam-options">
              <p className="roam-options__label">
                {ready ? (
                  <span className="roam-confirm">
                    {ready.name} — press <kbd>Enter</kbd> to name it
                  </span>
                ) : active ? (
                  `${active.name.slice(0, active.match.index)}…`
                ) : (
                  'Name a station on the route'
                )}
              </p>
              <ul className="roam-options__list">
                {options.map((option) => {
                  const lineId = getStation(option.stationId).lines[0]
                  const classes = ['roam-option']
                  if (option.used) classes.push('is-visited')
                  if (option.stationId === state.readyToConfirm) classes.push('is-ready')
                  return (
                    <li key={option.stationId} className={classes.join(' ')}>
                      <span className="roam-option__swatches">
                        <span
                          className="roam-option__swatch"
                          style={{ background: lineMap.get(lineId)?.color }}
                        />
                      </span>
                      <span
                        className="roam-option__name"
                        style={{ borderColor: lineMap.get(lineId)?.color }}
                      >
                        <b>{option.name.slice(0, option.match.index)}</b>
                        {option.name.slice(option.match.index)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        </div>

        {/* The chain so far, in route order where it can be worked out. Stations that
            turn out not to be on any sensible route sit at the end, which is itself a
            hint that they were a detour. */}
        <ul className="chain">
          <li className="chain__end">{from.name}</li>
          {state.named.map((id) => (
            <ChainLink key={id} stationId={id} />
          ))}
          <li className="chain__end">{to.name}</li>
        </ul>
      </div>
    </div>
  )
}

function ChainLink({ stationId }: { stationId: StationId }) {
  return <li className="chain__link">{getStation(stationId).name}</li>
}

function Figure({ label, value, urgent }: { label: string; value: string; urgent?: boolean }) {
  const classes = ['strip__item']
  if (urgent) classes.push('is-urgent')
  return (
    <div className={classes.join(' ')}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
