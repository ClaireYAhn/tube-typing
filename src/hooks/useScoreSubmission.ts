/**
 * Works out whether a finished run belongs on the high-score table, and puts it there.
 *
 * The board is read as soon as the result appears so the "did I place?" question is
 * answered before the player has finished reading their stats. The entry itself is only
 * written when they submit a name, since a table full of "Anon" from people who did not
 * want to be on it is worse than a short table.
 *
 * Everything here awaits the store even though the local one resolves immediately. That
 * is deliberate: swapping in an online board should be a change of implementation, not a
 * change of shape.
 */

import { useCallback, useEffect, useState } from 'react'
import type { RunSummary } from '../game/summary.ts'
import {
  localLeaderboard,
  rankFor,
  type ScoreEntry,
  type LeaderboardStore,
} from '../storage/leaderboard.ts'

export type ScoreStatus =
  /** Not a ranked run, or the board is still loading. */
  | { state: 'none' }
  /** The score would place here; waiting on a name. */
  | { state: 'placing'; rank: number; board: ScoreEntry[] }
  | { state: 'submitting'; rank: number; board: ScoreEntry[] }
  /** Done, either submitted or skipped. */
  | { state: 'listed'; rank: number; board: ScoreEntry[] }
  /** Ranked run that did not make the table. */
  | { state: 'missed'; board: ScoreEntry[] }
  | { state: 'failed'; message: string }

export interface ScoreSubmission {
  status: ScoreStatus
  submit: (name: string) => void
  skip: () => void
}

function candidateFrom(summary: RunSummary, name: string): ScoreEntry {
  return {
    name,
    kpm: summary.kpm,
    wpm: summary.wpm,
    accuracy: summary.accuracy,
    stations: summary.stations,
    durationMs: summary.durationMs,
    achievedAt: new Date().toISOString(),
  }
}

export function useScoreSubmission(
  boardKey: string | null,
  summary: RunSummary,
  store: LeaderboardStore = localLeaderboard,
): ScoreSubmission {
  const [status, setStatus] = useState<ScoreStatus>({ state: 'none' })

  // An abandoned run is not a score. `scoreable` already encodes that.
  const ranked = boardKey !== null && summary.scoreable

  useEffect(() => {
    if (!ranked || boardKey === null) return
    let cancelled = false

    store
      .top(boardKey)
      .then((board) => {
        if (cancelled) return
        const rank = rankFor(board, candidateFrom(summary, ''))
        setStatus(rank > 0 ? { state: 'placing', rank, board } : { state: 'missed', board })
      })
      .catch(() => {
        if (!cancelled) setStatus({ state: 'failed', message: 'Could not read the score table.' })
      })

    return () => {
      cancelled = true
    }
    // Deliberately keyed on the board alone. The summary is a fresh object every render
    // and a finished run's numbers never change, so depending on it would reload forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardKey, ranked])

  const submit = useCallback(
    (name: string) => {
      if (boardKey === null) return
      setStatus((current) =>
        current.state === 'placing'
          ? { state: 'submitting', rank: current.rank, board: current.board }
          : current,
      )
      store
        .submit(boardKey, candidateFrom(summary, name))
        .then((result) => setStatus({ state: 'listed', rank: result.rank, board: result.board }))
        .catch(() =>
          setStatus({ state: 'failed', message: 'Could not save the score. It stays on this run.' }),
        )
    },
    // Same reasoning as above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [boardKey],
  )

  const skip = useCallback(() => {
    setStatus((current) =>
      current.state === 'placing' ? { state: 'missed', board: current.board } : current,
    )
  }, [])

  return { status, submit, skip }
}
