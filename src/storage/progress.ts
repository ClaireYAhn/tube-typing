/**
 * localStorage persistence.
 *
 * Records are kept per match mode, because a lenient run and a strict run of the same
 * route are not comparable — strict makes you type every apostrophe.
 *
 * Everything is defensive: a corrupt or outdated blob is discarded rather than crashing
 * the app, since losing a best time is a much smaller problem than a white screen.
 */

import type { MatchMode } from '../engine/matcher.ts'
import type { StationId } from '../data/types.ts'

const KEY = 'tube-typing:progress'
const VERSION = 1

export interface BestRecord {
  wpm: number
  accuracy: number
  durationMs: number
  errors: number
  stations: number
  achievedAt: string
}

export interface TubeChallengeProgress {
  completed: StationId[]
  totalMs: number
  totalErrors: number
  totalCorrectKeys: number
}

export interface Settings {
  matchMode: MatchMode
}

export interface Progress {
  version: number
  settings: Settings
  /** `records[mode][recordKey]` — see `BuiltRun.recordKey`. */
  records: Record<MatchMode, Record<string, BestRecord>>
  tubeChallenge: Record<MatchMode, TubeChallengeProgress>
}

export function emptyProgress(): Progress {
  return {
    version: VERSION,
    settings: { matchMode: 'lenient' },
    records: { lenient: {}, strict: {} },
    tubeChallenge: {
      lenient: blankChallenge(),
      strict: blankChallenge(),
    },
  }
}

function blankChallenge(): TubeChallengeProgress {
  return { completed: [], totalMs: 0, totalErrors: 0, totalCorrectKeys: 0 }
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptyProgress()
    const parsed = JSON.parse(raw) as Partial<Progress>
    if (parsed.version !== VERSION) return emptyProgress()
    return {
      version: VERSION,
      settings: { matchMode: parsed.settings?.matchMode === 'strict' ? 'strict' : 'lenient' },
      records: {
        lenient: parsed.records?.lenient ?? {},
        strict: parsed.records?.strict ?? {},
      },
      tubeChallenge: {
        lenient: parsed.tubeChallenge?.lenient ?? blankChallenge(),
        strict: parsed.tubeChallenge?.strict ?? blankChallenge(),
      },
    }
  } catch {
    // Private browsing, a quota error, or hand-edited junk — start clean.
    return emptyProgress()
  }
}

export function saveProgress(progress: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress))
  } catch {
    // Nothing useful to do; the run still works, it just won't be remembered.
  }
}

export function clearProgress(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Returns the updated progress and whether this run beat the stored best.
 * WPM is the tiebreaker; a run that types more stations at the same speed also wins.
 */
export function recordRun(
  progress: Progress,
  mode: MatchMode,
  recordKey: string,
  candidate: BestRecord,
): { progress: Progress; isBest: boolean; previous: BestRecord | null } {
  const previous = progress.records[mode][recordKey] ?? null
  const isBest =
    previous === null ||
    candidate.wpm > previous.wpm ||
    (candidate.wpm === previous.wpm && candidate.stations > previous.stations)

  if (!isBest) return { progress, isBest, previous }

  return {
    progress: {
      ...progress,
      records: {
        ...progress.records,
        [mode]: { ...progress.records[mode], [recordKey]: candidate },
      },
    },
    isBest,
    previous,
  }
}

/** Tube Challenge accumulates across sessions rather than keeping a single best. */
export function recordChallengeProgress(
  progress: Progress,
  mode: MatchMode,
  newlyCompleted: readonly StationId[],
  addMs: number,
  addErrors: number,
  addCorrectKeys: number,
): Progress {
  const current = progress.tubeChallenge[mode]
  const completed = [...new Set([...current.completed, ...newlyCompleted])]
  return {
    ...progress,
    tubeChallenge: {
      ...progress.tubeChallenge,
      [mode]: {
        completed,
        totalMs: current.totalMs + addMs,
        totalErrors: current.totalErrors + addErrors,
        totalCorrectKeys: current.totalCorrectKeys + addCorrectKeys,
      },
    },
  }
}

export function resetChallenge(progress: Progress, mode: MatchMode): Progress {
  return {
    ...progress,
    tubeChallenge: { ...progress.tubeChallenge, [mode]: blankChallenge() },
  }
}
