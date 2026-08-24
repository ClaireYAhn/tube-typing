import { useState } from 'react'
import { MapBackdrop } from './MapBackdrop.tsx'
import { Roundel, ROUNDEL_BLUE, ROUNDEL_RED } from './Roundel.tsx'
import { useLines } from '../hooks/useColorScheme.ts'
import type { LineId } from '../data/types.ts'
import type { MatchMode } from '../engine/matcher.ts'
import { formatAccuracy, formatDuration, formatWpm } from '../engine/scoring.ts'
import { accentVars, lineVars } from '../game/contrast.ts'
import { MODES, type ModeId, type ModeSelection } from '../game/modes.ts'
import type { Progress } from '../storage/progress.ts'

interface Props {
  progress: Progress
  matchMode: MatchMode
  onMatchModeChange: (mode: MatchMode) => void
  onStart: (selection: ModeSelection) => void
  onShowProgress: () => void
}

export function MenuScreen({
  progress,
  matchMode,
  onMatchModeChange,
  onStart,
  onShowProgress,
}: Props) {
  const lines = useLines()
  const [expanded, setExpanded] = useState<ModeId | null>(null)
  const [lineId, setLineId] = useState<LineId>('victoria')
  const [routeId, setRouteId] = useState<string | null>(null)

  const selectedLine = lines.find((l) => l.id === lineId)!
  const selectedRoute = selectedLine.routes.find((r) => r.id === routeId) ?? selectedLine.routes[0]

  const challenge = progress.tubeChallenge[matchMode]

  function recordFor(key: string) {
    return progress.records[matchMode][key] ?? null
  }

  function handleMode(id: ModeId) {
    if (id === 'line-run') {
      setExpanded(expanded === 'line-run' ? null : 'line-run')
      return
    }
    onStart({ mode: id })
  }

  return (
    <div className="menu">
      <MapBackdrop />
      <header className="menu__header">
        <Roundel size={84} className="menu__roundel" />
        <h1 className="menu__title">
          {/* Roundel red and Corporate Blue, so the wordmark ties to the mark above it. */}
          <span style={{ color: ROUNDEL_RED }}>Tube</span>{' '}
          <span style={{ color: ROUNDEL_BLUE }}>Typing</span>
        </h1>
        <p className="menu__tagline">
          Type your way around the London Underground, the DLR and the Elizabeth line —
          337 stations across 13 lines.
        </p>
      </header>

      <div className="menu__toolbar">
        <fieldset className="toggle">
          <legend className="toggle__legend">Punctuation</legend>
          <div className="toggle__options">
            {(['lenient', 'strict'] as const).map((mode) => (
              <label
                key={mode}
                className={`toggle__option${matchMode === mode ? ' is-active' : ''}`}
              >
                <input
                  type="radio"
                  name="match-mode"
                  checked={matchMode === mode}
                  onChange={() => onMatchModeChange(mode)}
                />
                {mode === 'lenient' ? 'Lenient' : 'Strict'}
              </label>
            ))}
          </div>
        </fieldset>
        <p className="menu__hint">
          {matchMode === 'lenient'
            ? 'Apostrophes, hyphens and spaces are optional. “&” accepts “and”.'
            : 'Every character exactly as printed. Records are kept separately.'}
        </p>
        <button type="button" className="button button--ghost" onClick={onShowProgress}>
          Progress
        </button>
      </div>

      <ul className="mode-grid">
        {MODES.map((mode) => {
          const record = recordFor(mode.id === 'line-run' ? `line-run:${selectedRoute.id}` : mode.id)
          return (
            <li key={mode.id}>
              <button
                type="button"
                className={`mode-card${expanded === mode.id ? ' is-expanded' : ''}`}
                onClick={() => handleMode(mode.id)}
              >
                <h2 className="mode-card__title">{mode.title}</h2>
                <p className="mode-card__blurb">{mode.blurb}</p>
                <p className="mode-card__meta">
                  {mode.id === 'tube-challenge'
                    ? `${challenge.completed.length} / 337 stations done`
                    : record
                      ? `Best ${formatWpm(record.wpm)} wpm · ${formatAccuracy(record.accuracy)} · ${formatDuration(record.durationMs)}`
                      : 'No record yet'}
                </p>
              </button>
            </li>
          )
        })}
      </ul>

      {expanded === 'line-run' ? (
        <section className="line-picker">
          <h3 className="line-picker__heading">Choose a line</h3>
          <ul className="line-picker__lines">
            {lines.map((line) => (
              <li key={line.id}>
                <button
                  type="button"
                  className={`line-chip${line.id === lineId ? ' is-active' : ''}`}
                  style={lineVars(line.color) as React.CSSProperties}
                  onClick={() => {
                    setLineId(line.id)
                    setRouteId(null)
                  }}
                >
                  {line.name}
                </button>
              </li>
            ))}
          </ul>

          <h3 className="line-picker__heading">
            Route
            {selectedLine.routes.length > 1 ? (
              <span className="line-picker__note">
                {selectedLine.name} branches — pick one to run
              </span>
            ) : null}
          </h3>
          <ul className="line-picker__routes">
            {selectedLine.routes.map((route) => (
              <li key={route.id}>
                <button
                  type="button"
                  className={`route-option${route.id === selectedRoute.id ? ' is-active' : ''}`}
                  onClick={() => setRouteId(route.id)}
                >
                  <span className="route-option__label">{route.label}</span>
                  <span className="route-option__count">{route.stationIds.length} stations</span>
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="button button--primary"
            style={accentVars(selectedLine.color) as React.CSSProperties}
            onClick={() => onStart({ mode: 'line-run', lineId, routeId: selectedRoute.id })}
          >
            Run the {selectedLine.name} line
          </button>
        </section>
      ) : null}

      <footer className="menu__footer">
        <p>
          Station data from the TfL Unified API. Powered by TfL Open Data. Contains OS data
          © Crown copyright and database rights.
        </p>
        <p>
          Not affiliated with, or endorsed by, Transport for London. A personal project,
          inspired by 電車でタイピング and 메트로 타이핑.
        </p>
      </footer>
    </div>
  )
}
