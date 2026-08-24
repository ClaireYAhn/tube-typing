/**
 * The daily journey puzzle.
 *
 * You are given two stations and have to name the ones in between. Name any station on
 * the network; the ones you name accumulate; you win the moment they join the two ends
 * into a continuous route. Naming costs a guess whether or not it helped, and running out
 * ends the run.
 *
 * The win condition is one call: `findJourney(from, to, { via: named })`. If a route
 * exists using only the stations named so far, the chain is complete. That is the whole
 * rule, and it is why `via` exists on the search. Nothing here re-implements adjacency or
 * walks the graph itself.
 *
 * Input works like the Tube Challenge: every station is a live candidate and keystrokes
 * narrow the field, with Enter to commit. The difference is the candidate set. Free roam
 * offers the handful of stations you can reach in one hop; here all 337 are fair game,
 * because a guess is a guess.
 */

import { allStations, getStation } from '../data/network.ts'
import type { StationId } from '../data/types.ts'
import { sharedGraph, type Graph } from '../routing/graph.ts'
import { findJourney, stationsOf } from '../routing/search.ts'
import type { DailyPuzzle } from '../game/daily.ts'
import { guessBudget } from '../game/daily.ts'
import { applyKey, createMatch, type MatchMode, type MatchState } from './matcher.ts'

export type JourneyStatus = 'ready' | 'running' | 'won' | 'lost'

export interface Guess {
  stationId: StationId
  name: string
  /** True when this guess was the one that completed the chain. */
  connected: boolean
  /** False when the station was already named, so it cost nothing. */
  counted: boolean
  atMs: number
}

export interface JourneyCandidate {
  stationId: StationId
  name: string
  match: MatchState
  live: boolean
  /** Already named, so choosing it again would waste a guess. */
  used: boolean
}

export interface JourneyState {
  status: JourneyStatus
  puzzle: DailyPuzzle
  matchMode: MatchMode
  /** Stations named, in the order they were named. */
  named: StationId[]
  guesses: Guess[]
  /** Guesses spent. Repeats and the two endpoints do not count. */
  spent: number
  budget: number
  candidates: JourneyCandidate[]
  /** The completed route, once won. */
  solution: StationId[] | null
  startedAt: number | null
  now: number
  correctKeys: number
  errors: number
  errorPulse: number
  /** A fully typed name waiting on Enter. */
  readyToConfirm: StationId | null
}

export type JourneyAction =
  | { type: 'start'; at: number }
  | { type: 'key'; key: string; at: number }
  | { type: 'tick'; at: number }
  | { type: 'give-up' }

export interface JourneyConfig {
  puzzle: DailyPuzzle
  matchMode: MatchMode
  graph?: Graph
}

export function createJourney(config: JourneyConfig): JourneyState {
  return {
    status: 'ready',
    puzzle: config.puzzle,
    matchMode: config.matchMode,
    named: [],
    guesses: [],
    spent: 0,
    budget: guessBudget(config.puzzle),
    candidates: buildCandidates(config.matchMode, new Set()),
    solution: null,
    startedAt: null,
    now: 0,
    correctKeys: 0,
    errors: 0,
    errorPulse: 0,
    readyToConfirm: null,
  }
}

/** Strictly two arguments, so it can be handed straight to `useReducer`. */
export function journeyReducer(state: JourneyState, action: JourneyAction): JourneyState {
  switch (action.type) {
    case 'start':
      if (state.status !== 'ready') return state
      return { ...state, status: 'running', startedAt: action.at, now: action.at }

    case 'tick':
      if (state.status !== 'running') return state
      return { ...state, now: action.at }

    case 'give-up':
      if (state.status === 'won' || state.status === 'lost') return state
      return { ...state, status: 'lost', solution: state.puzzle.route }

    case 'key': {
      if (state.status !== 'running') return state

      if (isConfirmKey(action.key)) {
        const ready = state.readyToConfirm
          ? state.candidates.find((c) => c.stationId === state.readyToConfirm)
          : undefined

        // Space may only commit when nothing live could still take one, or "Euston" would
        // depart before "Euston Square" could be spelled out.
        const spaceWanted =
          action.key === ' ' &&
          advance(state.candidates.filter((c) => c.live), ' ').length > 0

        if (ready && !spaceWanted) return commit(state, ready, action.at)
        if (action.key === 'Enter') return { ...state, now: action.at }
      }

      return typeKey(state, action.key, action.at)
    }
  }
}

export function isConfirmKey(key: string): boolean {
  return key === 'Enter' || key === ' '
}

// --- internals --------------------------------------------------------------

function buildCandidates(matchMode: MatchMode, used: ReadonlySet<StationId>): JourneyCandidate[] {
  return allStations.map((station) => ({
    stationId: station.id,
    name: station.name,
    match: createMatch(station.name, matchMode),
    live: true,
    used: used.has(station.id),
  }))
}

function advance(candidates: readonly JourneyCandidate[], key: string): JourneyCandidate[] {
  const accepted: JourneyCandidate[] = []
  for (const candidate of candidates) {
    // A finished match reports every key as correct, so leaving one in would make the
    // rest of the word look right whatever was typed.
    if (candidate.match.done) continue
    const result = applyKey(candidate.match, key)
    if (result.ok) accepted.push({ ...candidate, match: result.state, live: true })
  }
  return accepted
}

function typeKey(state: JourneyState, key: string, at: number): JourneyState {
  const live = state.candidates.filter((c) => c.live)
  const pool = live.length > 0 ? live : state.candidates

  let accepted = advance(pool, key)

  if (accepted.length === 0) {
    // Nothing continued. Treat the key as the start of a different name, which is what
    // lets a player abandon a half-typed station without a penalty.
    const fresh = state.candidates.map((c) => ({
      ...c,
      match: createMatch(c.name, state.matchMode),
      live: true,
    }))
    accepted = advance(fresh, key)
  }

  if (accepted.length === 0) {
    return {
      ...state,
      now: at,
      readyToConfirm: null,
      errors: state.errors + 1,
      errorPulse: state.errorPulse + 1,
    }
  }

  const acceptedIds = new Set(accepted.map((c) => c.stationId))
  const candidates = state.candidates.map((c) => {
    const hit = accepted.find((a) => a.stationId === c.stationId)
    return hit ?? { ...c, live: acceptedIds.has(c.stationId) }
  })

  const finished = accepted.find((c) => c.match.done)

  return {
    ...state,
    now: at,
    correctKeys: state.correctKeys + 1,
    candidates,
    readyToConfirm: finished?.stationId ?? null,
  }
}

function commit(state: JourneyState, candidate: JourneyCandidate, at: number): JourneyState {
  const graph = sharedGraph()
  const { from, to } = state.puzzle
  const stationId = candidate.stationId

  // Naming an endpoint is free and pointless; it is already on the route by definition.
  // Re-naming something is free too, so a slip of memory is not punished.
  const isEndpoint = stationId === from || stationId === to
  const alreadyNamed = state.named.includes(stationId)
  const counted = !isEndpoint && !alreadyNamed

  const named = counted ? [...state.named, stationId] : state.named
  const spent = counted ? state.spent + 1 : state.spent

  const route = findJourney(graph, from, to, { via: new Set(named) })
  const connected = route !== null

  const guess: Guess = {
    stationId,
    name: candidate.name,
    connected,
    counted,
    atMs: at,
  }

  const base: JourneyState = {
    ...state,
    now: at,
    named,
    spent,
    guesses: [...state.guesses, guess],
    candidates: buildCandidates(state.matchMode, new Set(named)),
    readyToConfirm: null,
  }

  if (connected) {
    return { ...base, status: 'won', solution: stationsOf(route) }
  }
  if (spent >= state.budget) {
    return { ...base, status: 'lost', solution: state.puzzle.route }
  }
  return base
}

// --- derived ----------------------------------------------------------------

export function elapsedMs(state: JourneyState): number {
  if (state.startedAt === null) return 0
  return Math.max(0, state.now - state.startedAt)
}

export function guessesLeft(state: JourneyState): number {
  return Math.max(0, state.budget - state.spent)
}

/** The candidate part-way through being typed, if any. */
export function activeCandidate(state: JourneyState): JourneyCandidate | null {
  const started = state.candidates.filter((c) => c.live && c.match.index > 0)
  if (started.length === 0) return null
  return started.reduce((best, c) => (c.match.index > best.match.index ? c : best))
}

/** Live candidates, best first, for the on-screen suggestion list. */
export function suggestions(state: JourneyState, limit = 6): JourneyCandidate[] {
  return state.candidates
    .filter((c) => c.live && c.match.index > 0)
    .sort((a, b) => b.match.index - a.match.index || a.name.localeCompare(b.name))
    .slice(0, limit)
}

/**
 * How well the run went, as a par score. Zero is the optimal route; higher means stations
 * named that were not needed.
 */
export function overPar(state: JourneyState): number {
  return Math.max(0, state.spent - state.puzzle.toName)
}

/** The named stations in route order, for showing the chain as it builds. */
export function namedInOrder(state: JourneyState): StationId[] {
  return [...state.named].sort((a, b) => {
    const ia = state.puzzle.route.indexOf(a)
    const ib = state.puzzle.route.indexOf(b)
    // Stations not on the optimal route sort last, keeping the useful ones readable.
    return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib)
  })
}

export function stationName(id: StationId): string {
  return getStation(id).name
}
