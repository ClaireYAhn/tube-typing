/**
 * Reads both high score tables for the menu.
 *
 * The result screen has `useScoreSubmission`, which also decides about placing and
 * submitting. The menu only ever reads, so it gets its own smaller hook rather than
 * pulling in machinery for a submission that is not happening.
 */

import { useEffect, useState } from 'react'
import { localLeaderboard, type ScoreEntry } from '../storage/leaderboard.ts'
import { BoardUnavailable, remoteLeaderboard } from '../storage/remoteLeaderboard.ts'
import type { BoardState } from './useScoreSubmission.ts'

interface Loaded {
  /** Which board these entries are for. See the note on staleness below. */
  key: string
  entries: ScoreEntry[]
  unavailable: string | null
}

const pending: BoardState = {
  entries: [],
  loading: true,
  unavailable: null,
  error: null,
  yourRank: null,
}

/**
 * Results carry the board they came from, and anything for a different board reads as
 * still loading. That is what keeps the lenient table from flashing up under the strict
 * heading for one frame after the toggle moves, without clearing state inside the effect
 * and paying for an extra render on the way past.
 */
function stateFor(loaded: Loaded | null, key: string): BoardState {
  if (!loaded || loaded.key !== key) return pending
  return {
    entries: loaded.entries,
    loading: false,
    unavailable: loaded.unavailable,
    error: null,
    yourRank: null,
  }
}

export function useBoards(boardKey: string): { global: BoardState; local: BoardState } {
  const [globalLoaded, setGlobalLoaded] = useState<Loaded | null>(null)
  const [localLoaded, setLocalLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    let cancelled = false

    localLeaderboard
      .top(boardKey)
      .then((entries) => {
        if (!cancelled) setLocalLoaded({ key: boardKey, entries, unavailable: null })
      })
      .catch(() => {
        if (!cancelled) setLocalLoaded({ key: boardKey, entries: [], unavailable: null })
      })

    remoteLeaderboard
      .top(boardKey)
      .then((entries) => {
        if (!cancelled) setGlobalLoaded({ key: boardKey, entries, unavailable: null })
      })
      .catch((cause) => {
        if (cancelled) return
        setGlobalLoaded({
          key: boardKey,
          entries: [],
          unavailable:
            cause instanceof BoardUnavailable ? cause.message : 'The shared board is unavailable.',
        })
      })

    return () => {
      cancelled = true
    }
  }, [boardKey])

  return {
    global: stateFor(globalLoaded, boardKey),
    local: stateFor(localLoaded, boardKey),
  }
}
