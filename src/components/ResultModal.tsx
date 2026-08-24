/**
 * The end-of-run result, as a dialog over the map rather than a page of its own.
 *
 * Leaving the finished run visible behind it keeps the context — you can still see the
 * route you just typed and where you stopped, which a separate screen threw away.
 */

import { useEffect, useRef } from 'react'
import { formatAccuracy, formatDuration, formatWpm } from '../engine/scoring.ts'
import { accentVars } from '../game/contrast.ts'
import type { RunSummary } from '../game/summary.ts'
import { useLineMap } from '../hooks/useColorScheme.ts'
import { useScoreSubmission } from '../hooks/useScoreSubmission.ts'
import type { BestRecord } from '../storage/progress.ts'
import { ScoreEntryForm, ScoreTable } from './ScoreEntryForm.tsx'

interface Props {
  summary: RunSummary
  isBest: boolean
  previous: BestRecord | null
  /**
   * The high-score board this run belongs to, or null for runs that are not ranked.
   * The Tube Challenge is not: it is a long-haul thing measured in stations found rather
   * than a sixty-second score, so a speed table would say nothing about it.
   */
  boardKey: string | null
  onRetry: () => void
  onMenu: () => void
}

export function ResultModal({ summary, isBest, previous, boardKey, onRetry, onMenu }: Props) {
  const dialog = useRef<HTMLDivElement>(null)
  const score = useScoreSubmission(boardKey, summary)

  // Move focus in so the dialog is immediately keyboard-operable, and let Escape close.
  useEffect(() => {
    dialog.current?.querySelector('button')?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onMenu()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onMenu])

  const lineMap = useLineMap()

  return (
    <div className="modal" role="presentation">
      <div className="modal__scrim" />
      <div
        className="modal__panel"
        role="dialog"
        aria-modal="true"
        aria-label={`${summary.title} result`}
        ref={dialog}
        style={accentVars(summary.accentColor) as React.CSSProperties}
      >
        <header className="modal__header">
          <p className="result__eyebrow">{summary.title}</p>
          <h1 className="modal__headline">{summary.headline}</h1>
          {isBest ? (
            <p className="result__badge">
              New personal best{previous ? ` — beat ${formatWpm(previous.wpm)} wpm` : ''}
            </p>
          ) : null}
        </header>

        <dl className="modal__stats">
          <Figure label="KPM" value={String(Math.round(summary.kpm))} />
          <Figure label="WPM" value={formatWpm(summary.wpm)} />
          <Figure label="Accuracy" value={formatAccuracy(summary.accuracy)} />
          <Figure label="Time" value={formatDuration(summary.durationMs)} />
          <Figure label="Stations" value={String(summary.stations)} />
          <Figure label="Mistakes" value={String(summary.errors)} />
          <Figure label="Best combo" value={String(summary.bestCombo)} />
          <Figure label="Mode" value={summary.matchMode === 'strict' ? 'Strict' : 'Lenient'} />
        </dl>

        {score.status.state === 'placing' || score.status.state === 'submitting' ? (
          <ScoreEntryForm
            rank={score.status.rank}
            submitting={score.status.state === 'submitting'}
            onSubmit={score.submit}
            onSkip={score.skip}
          />
        ) : null}

        {score.status.state === 'listed' || score.status.state === 'missed' ? (
          <section className="score-board">
            <h2>
              {score.status.state === 'listed'
                ? `High scores — you are #${score.status.rank}`
                : 'High scores'}
            </h2>
            <ScoreTable
              entries={score.status.board}
              highlight={score.status.state === 'listed' ? score.status.rank : undefined}
            />
          </section>
        ) : null}

        {score.status.state === 'failed' ? (
          <p className="score-board__error">{score.status.message}</p>
        ) : null}

        {summary.linesUsed.length > 0 ? (
          <section className="lines-used">
            <h2>Lines travelled</h2>
            {/* One stripe per stop, in the order they happened — so a run that went pink,
                yellow, then pink again reads as three stripes, not two blocks. The whole
                bar is the shape of the journey rather than a summary of it. */}
            <div className="lines-used__bar">
              {summary.linePath.map((lineId, i) => (
                <span
                  key={i}
                  className="lines-used__segment"
                  style={{ background: lineMap.get(lineId)?.color }}
                  title={lineMap.get(lineId)?.name}
                />
              ))}
            </div>
            <ul className="lines-used__key">
              {summary.linesUsed.map((use) => (
                <li key={use.lineId}>
                  <span
                    className="lines-used__swatch"
                    style={{ background: lineMap.get(use.lineId)?.color }}
                  />
                  {lineMap.get(use.lineId)?.name}
                  <b>{use.stations}</b>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {summary.trouble.length > 0 ? (
          <section className="result__trouble">
            <h2>Where it went wrong</h2>
            <ul>
              {summary.trouble.map((spot) => (
                <li key={spot.id}>
                  <span className="result__trouble-name">{spot.name}</span>
                  <span className="result__trouble-count">
                    {spot.errors} {spot.errors === 1 ? 'mistake' : 'mistakes'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : summary.stations > 0 && summary.errors === 0 ? (
          <p className="result__clean">Clean run — not a single wrong key.</p>
        ) : null}

        <div className="result__actions">
          <button type="button" className="button button--primary" onClick={onRetry}>
            Go again
          </button>
          <button type="button" className="button button--ghost" onClick={onMenu}>
            Back to menu <kbd>Esc</kbd>
          </button>
        </div>
      </div>
    </div>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="figure">
      <dt className="figure__label">{label}</dt>
      <dd className="figure__value">{value}</dd>
    </div>
  )
}
