/**
 * The high score table, in its two flavours.
 *
 * `Everyone` is the shared board and `This browser` is the local one. Both are always
 * offered, because they answer different questions: whether you are any good, and whether
 * you are getting better. The local tab also means the feature still does something when
 * the shared board is unreachable, rather than showing an apology where a table should be.
 */

import type { ScoreEntry } from '../storage/leaderboard.ts'
import type { BoardState, Scope } from '../hooks/useScoreSubmission.ts'

export function ScopeTabs({
  scope,
  onScope,
  globalCount,
}: {
  scope: Scope
  onScope: (scope: Scope) => void
  globalCount: number | null
}) {
  return (
    <div className="scope-tabs" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={scope === 'global'}
        className={`scope-tab${scope === 'global' ? ' is-active' : ''}`}
        onClick={() => onScope('global')}
      >
        Everyone
        {globalCount !== null ? <span className="scope-tab__count">{globalCount}</span> : null}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={scope === 'local'}
        className={`scope-tab${scope === 'local' ? ' is-active' : ''}`}
        onClick={() => onScope('local')}
      >
        This browser
      </button>
    </div>
  )
}

export function BoardBody({
  board,
  emptyMessage,
}: {
  board: BoardState
  emptyMessage: string
}) {
  if (board.loading) return <p className="score-table__empty">Loading…</p>

  if (board.unavailable) {
    return (
      <p className="score-table__empty">
        {board.unavailable} Your scores are still being kept in this browser.
      </p>
    )
  }

  return (
    <>
      {board.error ? <p className="score-board__error">{board.error}</p> : null}
      <ScoreTable
        entries={board.entries}
        highlight={board.yourRank ?? undefined}
        emptyMessage={emptyMessage}
      />
    </>
  )
}

export function ScoreTable({
  entries,
  highlight,
  emptyMessage = 'No scores yet. Be the first.',
}: {
  entries: readonly ScoreEntry[]
  /** 1-based row to mark as the run just finished. */
  highlight?: number
  emptyMessage?: string
}) {
  if (entries.length === 0) {
    return <p className="score-table__empty">{emptyMessage}</p>
  }

  return (
    <ol className="score-table">
      {entries.map((entry, i) => (
        <li
          key={`${entry.achievedAt}-${entry.name}-${i}`}
          className={`score-table__row${highlight === i + 1 ? ' is-you' : ''}`}
        >
          <span className="score-table__rank">{i + 1}</span>
          <span className="score-table__name">{entry.name}</span>
          <span className="score-table__kpm">{Math.round(entry.kpm)}</span>
          <span className="score-table__stations">{entry.stations}</span>
        </li>
      ))}
    </ol>
  )
}

export function ScoreTableHead() {
  return (
    <div className="score-table__head" aria-hidden="true">
      <span />
      <span>Name</span>
      <span>KPM</span>
      <span>Stations</span>
    </div>
  )
}
