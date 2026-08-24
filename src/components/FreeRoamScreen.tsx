/**
 * The Tube Challenge screen.
 *
 * Unlike the other modes there is no queue and no "current station name" to type — the
 * map is the interface. Every reachable neighbour is a pill, and typing one takes you
 * there. The band along the bottom therefore shows where you *are* and what you could
 * type, rather than a single word.
 */

import { useCallback, useEffect, useMemo, useReducer } from 'react'
import { getStation } from '../data/network.ts'
import type { MatchMode } from '../engine/matcher.ts'
import { isTypeableKey } from '../engine/matcher.ts'
import {
  activeCandidate,
  challengeSize,
  confirmable,
  createFreeRoam,
  isConfirmKey,
  elapsedMs,
  freeRoamReducer,
  remainingStations,
  type FreeRoamState,
} from '../engine/freeRoam.ts'
import { accuracy, formatAccuracy, formatDuration, kpm } from '../engine/scoring.ts'
import { accentVars, inkOn } from '../game/contrast.ts'
import { useLineMap } from '../hooks/useColorScheme.ts'
import type { StationId } from '../data/types.ts'
import { TubeMap, type CandidatePill } from './TubeMap.tsx'

const TICK_MS = 100

interface Props {
  start: StationId
  matchMode: MatchMode
  alreadyVisited: readonly StationId[]
  onFinish: (state: FreeRoamState) => void
}

export function FreeRoamScreen({ start, matchMode, alreadyVisited, onFinish }: Props) {
  const [state, dispatch] = useReducer(
    freeRoamReducer,
    { start, matchMode, alreadyVisited },
    createFreeRoam,
  )
  const lineMap = useLineMap()

  const quit = useCallback(() => dispatch({ type: 'quit' }), [])

  useEffect(() => {
    if (state.status === 'finished') return
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key === 'Escape') {
        event.preventDefault()
        dispatch({ type: 'quit' })
        return
      }
      // Enter is not a typeable character but it is the confirm key here, so it has to
      // reach the reducer alongside ordinary letters.
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
    if (state.status === 'finished') onFinish(state)
    // Keyed on status alone so it fires once, not on every settling render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status])

  const here = getStation(state.current)
  const elapsed = elapsedMs(state)
  const total = challengeSize()
  const active = activeCandidate(state)
  const ready = confirmable(state)

  const pills: CandidatePill[] = useMemo(
    () =>
      state.candidates.map((c) => ({
        stationId: c.stationId,
        name: c.name,
        lines: c.lines,
        live: c.live,
        visited: c.visited,
        typed: c.match.index,
      })),
    [state.candidates],
  )

  const color = state.lastLineId
    ? (lineMap.get(state.lastLineId)?.color ?? '#0098D4')
    : (lineMap.get(here.lines[0])?.color ?? '#0098D4')

  return (
    <div className="game" style={accentVars(color) as React.CSSProperties}>
      <header className="game__header">
        <div className="run-card">
          <div className="run-card__terminus">
            <span className="run-card__tag" style={{ background: color, color: inkOn(color) }}>
              At
            </span>
            <span className="run-card__name">{here.name}</span>
          </div>
          <div className="run-card__middle">
            <strong>
              {state.visited.length} / {total}
            </strong>
            <span>stations visited</span>
          </div>
        </div>
        <button type="button" className="button button--ghost game__quit" onClick={quit}>
          Quit <kbd>Esc</kbd>
        </button>
      </header>

      <div className="game__map">
        <TubeMap
          routeStationIds={[]}
          position={0}
          progress={0}
          activeLineId={state.lastLineId}
          candidates={pills}
          trail={state.hops}
          atStationId={state.current}
          /* Pulled back so the trail spreading across London is actually visible — at
             the run-mode zoom only the last couple of hops fit on screen. Not so far
             back that the network turns into hairlines; the labels hold their size
             independently, so this only has to frame the map. */
          zoom={1.35}
        />

        {state.status === 'ready' ? (
          <p className="game__overlay">Type a station next to you to set off</p>
        ) : null}

        <dl className="strip">
          <Figure label="Time" value={formatDuration(elapsed)} />
          <Figure label="KPM" value={String(Math.round(kpm(state.correctKeys, elapsed)))} />
          <Figure label="Accuracy" value={formatAccuracy(accuracy(state.correctKeys, state.errors))} />
          <Figure label="Mistakes" value={String(state.errors)} />
          <Figure
            label={state.comboBroken ? 'Break' : 'Combo'}
            value={state.comboBroken ? String(state.bestCombo) : String(state.combo)}
            accent={!state.comboBroken && state.combo > 0}
            broken={state.comboBroken}
          />
          <Figure label="Left" value={String(remainingStations(state))} />
        </dl>
      </div>

      <div className="banner banner--roam">
        <p className="banner__line" style={{ background: color, color: inkOn(color) }}>
          {state.lastLineId ? lineMap.get(state.lastLineId)?.name : 'Choose your line'}
        </p>
        <div className="banner__band" style={{ background: color }}>
          <div className="banner__capsule banner__capsule--roam">
            <span className="banner__badge" style={{ background: color, color: inkOn(color) }}>
              {state.visited.length}
              <span className="banner__badge-total">/{total}</span>
            </span>
            <div className="roam-options">
              <p className="roam-options__label">
                {ready ? (
                  <span className="roam-confirm">
                    {ready.name} — press <kbd>Enter</kbd> to go
                  </span>
                ) : active ? (
                  `Heading for ${active.name}`
                ) : (
                  'Where next?'
                )}
              </p>
              <ul className="roam-options__list">
                {state.candidates.map((candidate) => {
                  const lineColor = lineMap.get(candidate.lines[0])?.color ?? '#666'
                  const classes = ['roam-option']
                  if (!candidate.live) classes.push('is-dead')
                  if (candidate.visited) classes.push('is-visited')
                  if (candidate.match.index > 0 && candidate.live) classes.push('is-active')
                  if (candidate.stationId === state.readyToConfirm) classes.push('is-ready')
                  return (
                    <li key={candidate.stationId} className={classes.join(' ')}>
                      <span className="roam-option__swatches">
                        {candidate.lines.map((id) => (
                          <span
                            key={id}
                            className="roam-option__swatch"
                            style={{ background: lineMap.get(id)?.color }}
                          />
                        ))}
                      </span>
                      <span className="roam-option__name" style={{ borderColor: lineColor }}>
                        <b>{candidate.name.slice(0, candidate.match.index)}</b>
                        {candidate.name.slice(candidate.match.index)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Figure({
  label,
  value,
  accent,
  broken,
}: {
  label: string
  value: string
  accent?: boolean
  broken?: boolean
}) {
  const classes = ['strip__item']
  if (accent) classes.push('is-accent')
  if (broken) classes.push('is-broken')
  return (
    <div className={classes.join(' ')}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
