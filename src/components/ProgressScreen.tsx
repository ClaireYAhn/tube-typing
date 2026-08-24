import { useMemo } from 'react'
import { allStations } from '../data/network.ts'
import type { MatchMode } from '../engine/matcher.ts'
import { formatAccuracy, formatDuration, formatWpm } from '../engine/scoring.ts'
import { lineCompletion } from '../game/modes.ts'
import { useLines } from '../hooks/useColorScheme.ts'
import type { Progress } from '../storage/progress.ts'

interface Props {
  progress: Progress
  matchMode: MatchMode
  onBack: () => void
  onResetChallenge: () => void
}

export function ProgressScreen({ progress, matchMode, onBack, onResetChallenge }: Props) {
  const lines = useLines()
  const challenge = progress.tubeChallenge[matchMode]
  const completed = useMemo(() => new Set(challenge.completed), [challenge.completed])
  const byLine = useMemo(() => lineCompletion(completed, lines), [completed, lines])
  const records = Object.entries(progress.records[matchMode])

  const total = allStations.length
  const done = completed.size
  const overall = total === 0 ? 0 : done / total

  return (
    <div className="progress-screen">
      <header className="progress-screen__header">
        <button type="button" className="button button--ghost" onClick={onBack}>
          ← Menu
        </button>
        <h1>Progress</h1>
        <p className="progress-screen__mode">
          {matchMode === 'strict' ? 'Strict' : 'Lenient'} mode
        </p>
      </header>

      <section className="challenge-summary">
        <div className="challenge-summary__figure">
          <span className="challenge-summary__count">{done}</span>
          <span className="challenge-summary__total">/ {total}</span>
        </div>
        <div className="challenge-summary__body">
          <h2>Tube Challenge</h2>
          <div className="meter">
            <div className="meter__fill" style={{ width: `${overall * 100}%` }} />
          </div>
          <p className="challenge-summary__meta">
            {(overall * 100).toFixed(1)}% complete
            {challenge.totalMs > 0 ? ` · ${formatDuration(challenge.totalMs)} spent` : ''}
            {challenge.totalErrors > 0 ? ` · ${challenge.totalErrors} mistakes` : ''}
          </p>
        </div>
      </section>

      <section className="line-progress">
        <h2>By line</h2>
        <ul>
          {byLine.map(({ line, done: lineDone, total: lineTotal }) => (
            <li key={line.id} className="line-progress__row">
              <span className="line-progress__name">
                <span
                  className={`line-progress__swatch${line.lightColor ? ' is-light' : ''}`}
                  style={{ background: line.color }}
                />
                {line.name}
              </span>
              <div className="meter meter--slim">
                <div
                  className="meter__fill"
                  style={{
                    width: `${lineTotal === 0 ? 0 : (lineDone / lineTotal) * 100}%`,
                    background: line.color,
                  }}
                />
              </div>
              <span className="line-progress__count">
                {lineDone}/{lineTotal}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="records">
        <h2>Best runs</h2>
        {records.length === 0 ? (
          <p className="records__empty">Nothing recorded yet in {matchMode} mode.</p>
        ) : (
          <ul>
            {records
              .sort(([, a], [, b]) => b.wpm - a.wpm)
              .map(([key, record]) => (
                <li key={key} className="records__row">
                  <span className="records__key">{key.replace(/^line-run:/, '')}</span>
                  <span className="records__value">{formatWpm(record.wpm)} wpm</span>
                  <span className="records__value">{formatAccuracy(record.accuracy)}</span>
                  <span className="records__value">{formatDuration(record.durationMs)}</span>
                </li>
              ))}
          </ul>
        )}
      </section>

      {done > 0 ? (
        <button type="button" className="button button--danger" onClick={onResetChallenge}>
          Reset Tube Challenge ({matchMode})
        </button>
      ) : null}
    </div>
  )
}
