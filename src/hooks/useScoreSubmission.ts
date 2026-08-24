/**
 * Works out whether a finished run belongs on the high score tables, and puts it there.
 *
 * Two boards, always both. The local one is the browser's own and never fails; the shared
 * one is everyone's and can be missing for reasons the player did not cause. Writing to
 * both means a run is never lost to an outage, and the local table is still there when
 * you are on a train with no signal, which for a game about trains seemed worth having.
 *
 * The boards are read as soon as the result appears, so "did I place?" is answered before
 * the player has finished reading their stats. The entry is only written when they submit
 * a name: a table full of "Anon" from people who did not want to be on it is worse than a
 * short table.
 */

import { useCallback, useEffect, useState } from 'react'
import type { RunSummary } from '../game/summary.ts'
import { localLeaderboard, rankFor, type ScoreEntry } from '../storage/leaderboard.ts'
import { BoardUnavailable, remoteLeaderboard } from '../storage/remoteLeaderboard.ts'

export type Scope = 'global' | 'local'

export interface BoardState {
  entries: ScoreEntry[]
  loading: boolean
  /** Set when the shared board could not be reached. Never set for the local board. */
  unavailable: string | null
  /** Set when a submission was refused, which is something the player can act on. */
  error: string | null
  /** 1-based position of the run just submitted, once it has been. */
  yourRank: number | null
}

export type Phase = 'idle' | 'placing' | 'submitting' | 'done'

export interface ScoreSubmission {
  phase: Phase
  /** Best rank across the two boards, used to word the prompt. */
  bestRank: number
  global: BoardState
  local: BoardState
  submit: (name: string) => void
  skip: () => void
}

const blank: BoardState = {
  entries: [],
  loading: true,
  unavailable: null,
  error: null,
  yourRank: null,
}

function candidate(summary: RunSummary, name: string): ScoreEntry {
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

export function useScoreSubmission(boardKey: string | null, summary: RunSummary): ScoreSubmission {
  const [phase, setPhase] = useState<Phase>('idle')
  const [global, setGlobal] = useState<BoardState>(blank)
  const [local, setLocal] = useState<BoardState>(blank)
  const [bestRank, setBestRank] = useState(0)

  // An abandoned run is not a score. `scoreable` already encodes that.
  const ranked = boardKey !== null && summary.scoreable

  useEffect(() => {
    if (!ranked || boardKey === null) {
      setGlobal({ ...blank, loading: false })
      setLocal({ ...blank, loading: false })
      return
    }
    let cancelled = false
    const provisional = candidate(summary, '')

    localLeaderboard
      .top(boardKey)
      .then((entries) => {
        if (cancelled) return
        const rank = rankFor(entries, provisional)
        setLocal({ entries, loading: false, unavailable: null, error: null, yourRank: null })
        setBestRank((best) => (rank > 0 && (best === 0 || rank < best) ? rank : best))
        if (rank > 0) setPhase((p) => (p === 'idle' ? 'placing' : p))
      })
      .catch(() => {
        if (!cancelled) setLocal({ ...blank, loading: false })
      })

    remoteLeaderboard
      .top(boardKey)
      .then((entries) => {
        if (cancelled) return
        const rank = rankFor(entries, provisional)
        setGlobal({ entries, loading: false, unavailable: null, error: null, yourRank: null })
        setBestRank((best) => (rank > 0 && (best === 0 || rank < best) ? rank : best))
        if (rank > 0) setPhase((p) => (p === 'idle' ? 'placing' : p))
      })
      .catch((cause) => {
        if (cancelled) return
        const unavailable =
          cause instanceof BoardUnavailable ? cause.message : 'The shared board is unavailable.'
        setGlobal({ ...blank, loading: false, unavailable })
      })

    return () => {
      cancelled = true
    }
    // Keyed on the board alone: `summary` is a fresh object every render and a finished
    // run's numbers never change, so depending on it would reload forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardKey, ranked])

  const submit = useCallback(
    (name: string) => {
      if (boardKey === null) return
      setPhase('submitting')
      const entry = candidate(summary, name)

      // Settled, not all: the shared board failing must not lose the local placing.
      Promise.allSettled([
        localLeaderboard.submit(boardKey, entry),
        remoteLeaderboard.submit(boardKey, entry),
      ]).then(([localResult, globalResult]) => {
        if (localResult.status === 'fulfilled') {
          setLocal({
            entries: localResult.value.board,
            loading: false,
            unavailable: null,
            error: null,
            yourRank: localResult.value.placed ? localResult.value.rank : null,
          })
        }

        if (globalResult.status === 'fulfilled') {
          setGlobal({
            entries: globalResult.value.board,
            loading: false,
            unavailable: null,
            error: null,
            yourRank: globalResult.value.placed ? globalResult.value.rank : null,
          })
        } else {
          const cause = globalResult.reason
          const unreachable = cause instanceof BoardUnavailable
          setGlobal((current) => ({
            ...current,
            loading: false,
            unavailable: unreachable ? String(cause.message) : current.unavailable,
            error: unreachable ? null : String(cause?.message ?? 'Could not save to the shared board.'),
          }))
        }

        setPhase('done')
      })
    },
    // Same reasoning as above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [boardKey],
  )

  const skip = useCallback(() => setPhase('done'), [])

  return { phase, bestRank, global, local, submit, skip }
}
