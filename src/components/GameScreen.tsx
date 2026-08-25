/**
 * The run, laid out the way the reference games do it: the map is the stage, a compact
 * stat strip floats over its bottom edge, and the station board sits along the bottom.
 *
 * Desktop-first — the map wants width to be worth looking at.
 */

import { useMemo } from 'react'
import type { MatchMode } from '../engine/matcher.ts'
import { currentStation, elapsedMs, remainingMs, type SessionState } from '../engine/session.ts'
import { accuracy, formatAccuracy, formatDuration, kpm } from '../engine/scoring.ts'
import { useSession } from '../hooks/useSession.ts'
import { useLineMap } from '../hooks/useColorScheme.ts'
import { accentVars, inkOn } from '../game/contrast.ts'
import type { BuiltRun } from '../game/modes.ts'
import { StationBanner } from './StationBanner.tsx'
import { TubeMap } from './TubeMap.tsx'

interface Props {
  run: BuiltRun
  matchMode: MatchMode
  onFinish: (state: SessionState) => void
}

export function GameScreen({ run, matchMode, onFinish }: Props) {
  const config = useMemo(
    () => ({ queue: run.queue, matchMode, timeLimitMs: run.timeLimitMs }),
    [run, matchMode],
  )
  // Both the button and Escape end the run through the session, so stations already
  // banked are still reported — Tube Challenge progress must survive giving up.
  const { state, quit } = useSession(config, onFinish)
  const lineMap = useLineMap()

  const station = currentStation(state)
  const elapsed = elapsedMs(state)
  const remaining = remainingMs(state)

  const routeStationIds = useMemo(() => run.queue.map((s) => s.id), [run.queue])
  // How far through the current name, used to glide the train between stops.
  const nameProgress =
    state.match.target.length > 0 ? state.match.index / state.match.target.length : 0

  // The route's line and the train's livery are not the same question. Random Sprint has
  // no route at all — passing the current station's line as the route made the map draw a
  // "line" joining two hundred random stations — but the train can still wear whatever
  // line it has just pulled into.
  const routeLineId = run.lineId
  const trainLineId = run.lineId ?? station?.lines[0] ?? null
  // On a route that crosses lines the train wears the line it is currently riding, so
  // its waist band changes colour at the interchange along with the track.
  const segmentLineId = run.segmentLines?.[Math.max(0, state.position - 1)] ?? null
  // On a multi-line route the accent follows the leg too, so the board along the bottom
  // is always the colour of the line you are actually on. Leaving it fixed meant sitting
  // at Euston on a black Northern line stretch with a purple Elizabeth board underneath.
  const color =
    (segmentLineId ? lineMap.get(segmentLineId)?.color : undefined) ?? run.accentColor
  const ink = inkOn(color)

  return (
    <div className="game" style={accentVars(color) as React.CSSProperties}>
      <header className="game__header">
        <div className="run-card">
          <Terminus label="From" name={run.queue[0]?.name ?? ''} color={color} />
          <div className="run-card__middle">
            <strong>{run.queue.length} stations</strong>
            <span>{run.subtitle}</span>
          </div>
          <Terminus label="To" name={run.queue[run.queue.length - 1]?.name ?? ''} color={color} />
        </div>
        <button type="button" className="button button--ghost game__quit" onClick={quit}>
          Quit <kbd>Esc</kbd>
        </button>
      </header>

      <div className="game__map">
        <TubeMap
          routeStationIds={routeStationIds}
          position={state.position}
          progress={nameProgress}
          activeLineId={routeLineId}
          trainLineId={segmentLineId ?? trainLineId}
          segmentLines={run.segmentLines}
        />

        {state.status === 'ready' ? (
          <p className="game__overlay">Press any key to depart</p>
        ) : null}

        <dl className="strip">
          <Figure label={remaining === null ? 'Time' : 'Left'} value={formatDuration(remaining ?? elapsed)} urgent={remaining !== null && remaining <= 10_000} />
          <Figure label="KPM" value={String(Math.round(kpm(state.correctKeys, elapsed)))} />
          <Figure label="Accuracy" value={formatAccuracy(accuracy(state.correctKeys, state.errors))} />
          <Figure label="Mistakes" value={String(state.errors)} />
          <Figure
            label={state.comboBroken ? 'Break' : 'Combo'}
            value={state.comboBroken ? String(state.bestCombo) : String(state.combo)}
            accent={!state.comboBroken && state.combo > 0}
            broken={state.comboBroken}
          />
          <Figure label="Left" value={String(state.queue.length - state.position)} />
        </dl>
      </div>

      {station ? (
        <StationBanner
          station={station}
          previous={state.queue[state.position - 1] ?? null}
          next={state.queue[state.position + 1] ?? null}
          match={state.match}
          errorPulse={state.errorPulse}
          index={state.position + 1}
          total={state.queue.length}
          lineName={trainLineId ? (lineMap.get(trainLineId)?.name ?? run.title) : run.title}
          color={color}
          ink={ink}
        />
      ) : null}
    </div>
  )
}

function Terminus({ label, name, color }: { label: string; name: string; color: string }) {
  return (
    <div className="run-card__terminus">
      <span className="run-card__tag" style={{ background: color, color: inkOn(color) }}>
        {label}
      </span>
      <span className="run-card__name">{name}</span>
    </div>
  )
}

function Figure({
  label,
  value,
  urgent,
  accent,
  broken,
}: {
  label: string
  value: string
  urgent?: boolean
  accent?: boolean
  broken?: boolean
}) {
  const classes = ['strip__item']
  if (urgent) classes.push('is-urgent')
  if (accent) classes.push('is-accent')
  if (broken) classes.push('is-broken')
  return (
    <div className={classes.join(' ')}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
