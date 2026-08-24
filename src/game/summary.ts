/**
 * A single shape the result screen can render, whichever mode produced it.
 *
 * Line Run and the Tube Challenge keep quite different state — one has a queue, the other
 * a graph walk — so normalising here keeps the result screen from having to know about
 * either.
 */

import { getStation } from '../data/network.ts'
import type { LineId } from '../data/types.ts'
import { accuracy, kpm, wpm } from '../engine/scoring.ts'
import { elapsedMs as roamElapsed, type FreeRoamState } from '../engine/freeRoam.ts'
import { elapsedMs, troubleSpots, type SessionState } from '../engine/session.ts'
import type { MatchMode } from '../engine/matcher.ts'
import { elapsedMs as journeyElapsed, overPar, type JourneyState } from '../engine/journey.ts'
import { describePuzzle } from './daily.ts'
import { sharedGraph } from '../routing/graph.ts'
import { findJourney } from '../routing/search.ts'
import { formatDuration } from '../engine/scoring.ts'

export interface TroubleSpot {
  id: string
  name: string
  errors: number
}

/** Which lines a run touched, and how much of it was spent on each. */
export interface LineUse {
  lineId: LineId
  stations: number
}

/**
 * Counts up a journey, busiest line first.
 *
 * Always derived from the same ordered path the bar draws, so the legend can never credit
 * a line the bar has no stripe for. Tallying each station's *whole* line list instead put
 * Victoria in the legend for a run that only ever touched Finsbury Park on the Piccadilly
 * — a colour in the key with nothing to point at.
 */
function tally(path: readonly LineId[]): LineUse[] {
  const counts = new Map<LineId, number>()
  for (const lineId of path) {
    counts.set(lineId, (counts.get(lineId) ?? 0) + 1)
  }
  return [...counts]
    .map(([lineId, stations]) => ({ lineId, stations }))
    .sort((a, b) => b.stations - a.stations)
}

export interface RunSummary {
  title: string
  headline: string
  matchMode: MatchMode
  wpm: number
  kpm: number
  accuracy: number
  durationMs: number
  stations: number
  errors: number
  bestCombo: number
  trouble: TroubleSpot[]
  /** Lines travelled, busiest first — the legend under the bar. */
  linesUsed: LineUse[]
  /**
   * The same journey in the order it happened, one entry per stop. The bar draws this
   * rather than `linesUsed` so pink-yellow-pink comes out pink, yellow, pink instead of
   * being collapsed into one pink block and one yellow block.
   */
  linePath: LineId[]
  accentColor: string
  /** Whether this counts as a record attempt at all — an abandoned run does not. */
  scoreable: boolean
  /**
   * Wordle-style text for the clipboard, where the mode has something worth sharing.
   * Only the daily journey does: it is the only mode where everyone played the same
   * thing, which is what makes a score comparable without a leaderboard.
   */
  share?: string
}

const HEADLINE: Record<string, string> = {
  completed: 'Run complete',
  'time-up': "Time's up",
  quit: 'Run abandoned',
}

export function summariseSession(
  state: SessionState,
  title: string,
  accentColor: string,
  /**
   * The one line the run follows, if it follows one. Circle Loop and Line Run report no
   * lines travelled at all: you already know which line it was, and tallying it by station
   * would credit you with every *other* line those interchanges happen to serve — passing
   * through Baker Street is not riding the Metropolitan.
   */
  lineId: LineId | null,
): RunSummary {
  const durationMs = elapsedMs(state)
  const path = lineId ? [] : primaryLines(state.attempts.map((a) => a.stationId))
  return {
    title,
    headline: HEADLINE[state.finishReason ?? 'completed'],
    matchMode: state.matchMode,
    wpm: wpm(state.correctKeys, durationMs),
    kpm: kpm(state.correctKeys, durationMs),
    accuracy: accuracy(state.correctKeys, state.errors),
    durationMs,
    stations: state.attempts.length,
    errors: state.errors,
    bestCombo: state.bestCombo,
    trouble: troubleSpots(state, 5).map((a) => ({
      id: a.stationId,
      name: a.name,
      errors: a.errors,
    })),
    linesUsed: tally(path),
    linePath: path,
    accentColor,
    scoreable: state.finishReason !== 'quit' && state.attempts.length > 0,
  }
}

/** Each station's own line, in play order — Random Sprint's version of a route. */
function primaryLines(stationIds: readonly string[]): LineId[] {
  const path: LineId[] = []
  for (const id of stationIds) {
    try {
      const line = getStation(id).lines[0]
      if (line) path.push(line)
    } catch {
      continue
    }
  }
  return path
}

export function summariseRoam(
  state: FreeRoamState,
  total: number,
  accentColor: string,
): RunSummary {
  const durationMs = roamElapsed(state)
  const complete = state.visited.length >= total
  // For a graph walk the hops say which line was actually ridden, which is better than
  // guessing from the stations.
  const path = state.hops.map((h) => h.lineId).filter((id): id is LineId => id !== null)
  return {
    title: 'Tube Challenge',
    // Stopping partway is normal here — the challenge is saved and picked up later, so
    // it reads as progress rather than failure.
    headline: complete ? 'Every station visited' : 'Progress saved',
    matchMode: state.matchMode,
    wpm: wpm(state.correctKeys, durationMs),
    kpm: kpm(state.correctKeys, durationMs),
    accuracy: accuracy(state.correctKeys, state.errors),
    durationMs,
    stations: state.visited.length,
    errors: state.errors,
    bestCombo: state.bestCombo,
    trouble: [],
    linesUsed: tally(path),
    linePath: path,
    accentColor,
    scoreable: complete,
  }
}

// --- the daily journey ------------------------------------------------------

/**
 * The daily puzzle's result.
 *
 * Scored against par rather than against the clock. Everyone gets the same journey, so
 * "how many stations did it take you" is the comparable number and speed is incidental.
 */
export function summariseJourney(state: JourneyState, accentColor: string): RunSummary {
  const durationMs = journeyElapsed(state)
  const won = state.status === 'won'
  const over = overPar(state)

  return {
    title: 'Daily journey',
    headline: won
      ? over === 0
        ? 'Perfect route'
        : `Home in ${state.spent}`
      : 'Route not found',
    matchMode: state.matchMode,
    wpm: wpm(state.correctKeys, durationMs),
    kpm: kpm(state.correctKeys, durationMs),
    accuracy: accuracy(state.correctKeys, state.errors),
    durationMs,
    stations: state.named.length,
    errors: state.errors,
    bestCombo: 0,
    trouble: [],
    // The solution's lines, in the order they are ridden.
    linesUsed: tally(journeyLines(state)),
    linePath: journeyLines(state),
    accentColor,
    // No leaderboard: a board per calendar day would be an unbounded key space, and the
    // share text already does the job of comparing with friends.
    scoreable: false,
    share: shareText(state),
  }
}

/** Lines of the route that was actually found, or of the optimal one when the run was lost. */
function journeyLines(state: JourneyState): LineId[] {
  const route = state.solution ?? state.puzzle.route
  const result = findJourney(sharedGraph(), route[0], route[route.length - 1], {
    via: new Set(route.slice(1, -1)),
  })
  if (!result) return []
  const lines: LineId[] = []
  for (const leg of result.journey.legs) {
    for (let i = 0; i < leg.stops; i++) lines.push(leg.lineId)
  }
  return lines
}

/**
 * Wordle-style share text.
 *
 * One square per guess in the order they were made: filled for a station that turned out
 * to be on the finished route, hollow for a detour. That shows the shape of someone's
 * thinking without giving away a single station name, so it is safe to paste into a group
 * chat where other people have not played yet.
 */
export function shareText(state: JourneyState): string {
  const onRoute = new Set(state.solution ?? [])
  const squares = state.guesses
    .filter((guess) => guess.counted)
    .map((guess) => (onRoute.has(guess.stationId) ? '🟩' : '⬜'))
    .join('')

  const won = state.status === 'won'
  // Golf, not Wordle: "7/6" reads as seven guesses out of six allowed, which is the
  // opposite of what it means. Par is the target, and going over it is the score.
  const score = won
    ? `${state.spent} stations (par ${state.puzzle.toName})`
    : `Gave up (par ${state.puzzle.toName})`

  return [
    `Tube Typing ${state.puzzle.date}`,
    describePuzzle(state.puzzle),
    `${score} · ${formatDuration(journeyElapsed(state))}`,
    squares,
  ].join('\n')
}
