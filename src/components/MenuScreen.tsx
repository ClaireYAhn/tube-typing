import { useState } from 'react'
import { MapBackdrop } from './MapBackdrop.tsx'
import { Roundel, ROUNDEL_BLUE, ROUNDEL_RED } from './Roundel.tsx'
import { useLines } from '../hooks/useColorScheme.ts'
import type { LineId } from '../data/types.ts'
import type { MatchMode } from '../engine/matcher.ts'
import { formatAccuracy, formatDuration, formatWpm } from '../engine/scoring.ts'
import { accentVars, lineVars } from '../game/contrast.ts'
import { MODES, type ModeId, type ModeSelection } from '../game/modes.ts'
import { boardKey } from '../storage/leaderboard.ts'
import { guessBudget, todaysPuzzle } from '../game/daily.ts'
import { getStation } from '../data/network.ts'
import type { Progress } from '../storage/progress.ts'
import { useBoards } from '../hooks/useBoards.ts'
import type { Scope } from '../hooks/useScoreSubmission.ts'
import { BoardBody, ScopeTabs, ScoreTableHead } from './ScoreBoard.tsx'

interface Props {
  progress: Progress
  matchMode: MatchMode
  onMatchModeChange: (mode: MatchMode) => void
  onStart: (selection: ModeSelection) => void
  onStartJourney: () => void
  onShowProgress: () => void
}

export function MenuScreen({
  progress,
  matchMode,
  onMatchModeChange,
  onStart,
  onStartJourney,
  onShowProgress,
}: Props) {
  const lines = useLines()
  const [expanded, setExpanded] = useState<ModeId | null>(null)
  const [lineId, setLineId] = useState<LineId>('victoria')
  const [routeId, setRouteId] = useState<string | null>(null)

  const selectedLine = lines.find((l) => l.id === lineId)!
  const selectedRoute = selectedLine.routes.find((r) => r.id === routeId) ?? selectedLine.routes[0]

  const challenge = progress.tubeChallenge[matchMode]

  // Reloaded whenever the punctuation toggle moves, because the two modes keep separate
  // boards and showing a lenient table under a strict heading would be a lie.
  const boards = useBoards(boardKey('random-sprint', matchMode))
  const [scope, setScope] = useState<Scope>('global')

  // Today is the landing tab. The daily journey is the thing there is a reason to come
  // back for, and burying it under a grid of practice modes would waste that.
  const [tab, setTab] = useState<'today' | 'practice'>('today')
  const puzzle = todaysPuzzle()
  const shown = scope === 'global' ? boards.global : boards.local

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

      <div className="menu__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'today'}
          className={`menu__tab${tab === 'today' ? ' is-active' : ''}`}
          onClick={() => setTab('today')}
        >
          Today
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'practice'}
          className={`menu__tab${tab === 'practice' ? ' is-active' : ''}`}
          onClick={() => setTab('practice')}
        >
          Practice
        </button>
      </div>

      {tab === 'today' ? (
        <>
          <section className="daily">
            <p className="daily__date">Daily journey · {puzzle.date}</p>
            <h2 className="daily__route">
              <span className="daily__station">{getStation(puzzle.from).name}</span>
              <span className="daily__arrow" aria-label="to">→</span>
              <span className="daily__station">{getStation(puzzle.to).name}</span>
            </h2>
            <p className="daily__meta">
              {puzzle.toName} stations to name · {puzzle.transfers}{' '}
              {puzzle.transfers === 1 ? 'change' : 'changes'} · {guessBudget(puzzle)} guesses
            </p>
            <button type="button" className="button button--primary" onClick={onStartJourney}>
              Plan the journey
            </button>
            <p className="daily__note">
              Everyone gets the same journey today. Name the stations in between.
            </p>
          </section>

      {/* The board sits on the menu so the first thing you see is what there is to beat.
          Random Sprint only, for now: sixty seconds fixed makes every run on it directly
          comparable, which a Line Run of the Victoria against one of the Northern is not.
          Adding another mode is a matter of listing its recordKey here and in
          ALLOWED_BOARDS. */}
      <section className="menu__scores">
        <h2 className="menu__scores-heading">
          Random Sprint high scores
          <span className="menu__scores-mode">{matchMode === 'strict' ? 'Strict' : 'Lenient'}</span>
        </h2>
        <ScopeTabs
          scope={scope}
          onScope={setScope}
          globalCount={boards.global.unavailable ? null : boards.global.entries.length}
        />
        <ScoreTableHead />
        <BoardBody
          board={shown}
          emptyMessage={
            scope === 'global'
              ? 'Nobody has posted a score yet. Run a sprint and be the first.'
              : 'Nothing on this browser yet. Run a sprint and put your name up.'
          }
        />
      </section>

        </>
      ) : (
        <>
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

        </>
      )}

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
