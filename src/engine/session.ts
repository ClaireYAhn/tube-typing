/**
 * The run state machine, shared by every game mode.
 *
 * A mode is just a queue of stations plus an optional time limit — Circle Loop, Line Run,
 * Random Sprint and Tube Challenge all reduce to that, so the timing, scoring and
 * keystroke plumbing live here once.
 *
 * Pure reducer: `useSession` owns the clock, this owns the rules.
 */

import type { Station, StationId } from '../data/types.ts'
import { applyKey, createMatch, type MatchMode, type MatchState } from './matcher.ts'

export type SessionStatus = 'ready' | 'running' | 'finished'

/** Why the run ended — the result screen reads differently for each. */
export type FinishReason = 'completed' | 'time-up' | 'quit'

export interface Attempt {
  stationId: StationId
  name: string
  errors: number
  durationMs: number
}

export interface SessionConfig {
  queue: Station[]
  matchMode: MatchMode
  /** Null for untimed modes; Random Sprint sets 60s. */
  timeLimitMs: number | null
}

export interface SessionState {
  status: SessionStatus
  matchMode: MatchMode
  queue: Station[]
  /** Index into `queue` of the station being typed. */
  position: number
  match: MatchState
  timeLimitMs: number | null
  startedAt: number | null
  /** Latest observed clock reading, fed by `tick` and `key`. */
  now: number
  stationStartedAt: number | null
  attempts: Attempt[]
  correctKeys: number
  errors: number
  /** Consecutive correct keystrokes. Resets to zero on any mistake. */
  combo: number
  bestCombo: number
  /** True for one keystroke after a combo is broken, so the UI can flash "BREAK". */
  comboBroken: boolean
  finishReason: FinishReason | null
  /** Bumped on every rejected key so the UI can retrigger its error animation. */
  errorPulse: number
}

export type SessionAction =
  | { type: 'start'; at: number }
  | { type: 'key'; key: string; at: number }
  | { type: 'tick'; at: number }
  | { type: 'quit'; at: number }

export function createSession(config: SessionConfig): SessionState {
  const first = config.queue[0]
  return {
    status: 'ready',
    matchMode: config.matchMode,
    queue: config.queue,
    position: 0,
    match: createMatch(first?.name ?? '', config.matchMode),
    timeLimitMs: config.timeLimitMs,
    startedAt: null,
    now: 0,
    stationStartedAt: null,
    attempts: [],
    correctKeys: 0,
    errors: 0,
    combo: 0,
    bestCombo: 0,
    comboBroken: false,
    finishReason: null,
    errorPulse: 0,
  }
}

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'start': {
      if (state.status !== 'ready' || state.queue.length === 0) return state
      return {
        ...state,
        status: 'running',
        startedAt: action.at,
        now: action.at,
        stationStartedAt: action.at,
      }
    }

    case 'tick': {
      if (state.status !== 'running') return state
      const next = { ...state, now: action.at }
      return expired(next) ? finish(next, 'time-up') : next
    }

    case 'quit': {
      if (state.status === 'finished') return state
      return finish({ ...state, now: action.at }, 'quit')
    }

    case 'key': {
      if (state.status !== 'running') return state

      const result = applyKey(state.match, action.key)
      const combo = result.ok ? state.combo + 1 : 0
      let next: SessionState = {
        ...state,
        now: action.at,
        match: result.state,
        correctKeys: result.ok ? state.correctKeys + 1 : state.correctKeys,
        errors: result.ok ? state.errors : state.errors + 1,
        combo,
        bestCombo: Math.max(state.bestCombo, combo),
        // Only counts as a break if there was a streak to lose.
        comboBroken: !result.ok && state.combo > 0,
        errorPulse: result.ok ? state.errorPulse : state.errorPulse + 1,
      }

      if (result.completed) next = advance(next, action.at)
      // The time limit is checked after the station is banked, so a name finished on the
      // final tick still counts.
      return expired(next) && next.status === 'running' ? finish(next, 'time-up') : next
    }
  }
}

// --- helpers ----------------------------------------------------------------

function expired(state: SessionState): boolean {
  if (state.timeLimitMs === null || state.startedAt === null) return false
  return state.now - state.startedAt >= state.timeLimitMs
}

/** Banks the finished station and loads the next one, or ends the run. */
function advance(state: SessionState, at: number): SessionState {
  const station = state.queue[state.position]
  const attempt: Attempt = {
    stationId: station.id,
    name: station.name,
    errors: state.match.errors,
    durationMs: at - (state.stationStartedAt ?? at),
  }
  const attempts = [...state.attempts, attempt]
  const position = state.position + 1

  if (position >= state.queue.length) {
    return finish({ ...state, attempts, position }, 'completed')
  }

  return {
    ...state,
    attempts,
    position,
    match: createMatch(state.queue[position].name, state.matchMode),
    stationStartedAt: at,
  }
}

function finish(state: SessionState, reason: FinishReason): SessionState {
  return { ...state, status: 'finished', finishReason: reason }
}

// --- derived values ---------------------------------------------------------

export function elapsedMs(state: SessionState): number {
  if (state.startedAt === null) return 0
  return Math.max(0, state.now - state.startedAt)
}

export function remainingMs(state: SessionState): number | null {
  if (state.timeLimitMs === null) return null
  return Math.max(0, state.timeLimitMs - elapsedMs(state))
}

export function currentStation(state: SessionState): Station | null {
  return state.queue[state.position] ?? null
}

export function upcomingStations(state: SessionState, count: number): Station[] {
  return state.queue.slice(state.position + 1, state.position + 1 + count)
}

/** Progress across the whole run, blending finished stations with the current name. */
export function runProgress(state: SessionState): number {
  if (state.queue.length === 0) return 1
  const partial = state.match.target.length > 0 ? state.match.index / state.match.target.length : 0
  return Math.min(1, (state.position + partial) / state.queue.length)
}

/** Stations that cost the most mistakes, worst first. */
export function troubleSpots(state: SessionState, count: number): Attempt[] {
  return state.attempts
    .filter((a) => a.errors > 0)
    .sort((a, b) => b.errors - a.errors || b.durationMs - a.durationMs)
    .slice(0, count)
}
