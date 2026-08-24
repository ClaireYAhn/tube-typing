/**
 * Free-roam mode — the real Tube Challenge.
 *
 * You pick a station to start at and then drive the network yourself: the stations you
 * can reach from where you are stand ready as candidates, and *typing one of their names
 * is how you travel there*. Interchange comes out of that for free — at King's Cross the
 * candidates include stations on all six lines, so choosing a line is just choosing which
 * name to type. The goal is to visit all 337.
 *
 * The engine difference from `session.ts` is that there is no queue. Several names are
 * live at once and the player's keystrokes disambiguate between them, exactly the way a
 * prefix search does:
 *
 *   type "s"  → "South Kensington" and "Sloane Square" both stay alive
 *   type "o"  → only "South Kensington" survives
 *   …finish it → the train moves there
 *
 * A key that no live candidate accepts triggers one retry against a fresh set, so
 * changing your mind mid-word costs nothing. Only a key that can neither continue nor
 * start any neighbour counts as a mistake.
 *
 * Finishing a name is not enough to travel: you confirm with Enter (or space). Without
 * that, a name which is a prefix of a longer one — "Euston" and "Euston Square", "Bow
 * Road" and "Bow Church" — would fire the moment the shorter one completed, making the
 * longer station impossible to choose. Confirmation is specific to this mode; the queued
 * modes have only one possible answer and so need none.
 */

import { getStation } from '../data/network.ts'
import type { LineId, StationId } from '../data/types.ts'
import { linesAt, nodeId, parseNodeId, sharedGraph, type Graph } from '../routing/graph.ts'
import { applyKey, createMatch, type MatchMode, type MatchState } from './matcher.ts'

export type FreeRoamStatus = 'ready' | 'running' | 'finished'

export interface Candidate {
  stationId: StationId
  name: string
  /** Lines that will take you there from the current station. */
  lines: LineId[]
  match: MatchState
  /** False once a keystroke has ruled this candidate out for the current word. */
  live: boolean
  visited: boolean
}

/** Keys that commit a fully-typed name and move the train. */
export function isConfirmKey(key: string): boolean {
  return key === 'Enter' || key === ' '
}

export interface Hop {
  from: StationId
  to: StationId
  /** Null when the two stations share no line — which the graph should never produce. */
  lineId: LineId | null
  atMs: number
}

export interface FreeRoamState {
  status: FreeRoamStatus
  matchMode: MatchMode
  current: StationId
  /** Insertion-ordered; the first entry is where the run began. */
  visited: StationId[]
  candidates: Candidate[]
  /** The line the last hop used, so the map can colour the train and trail. */
  lastLineId: LineId | null
  hops: Hop[]
  startedAt: number | null
  now: number
  correctKeys: number
  errors: number
  combo: number
  bestCombo: number
  comboBroken: boolean
  errorPulse: number
  /** Bumped whenever the train arrives somewhere, for arrival effects. */
  arrivals: number
  /**
   * A fully-typed name waiting on Enter. Non-null means the UI should prompt to confirm.
   */
  readyToConfirm: StationId | null
}

export type FreeRoamAction =
  | { type: 'start'; at: number }
  | { type: 'key'; key: string; at: number }
  | { type: 'tick'; at: number }
  | { type: 'quit' }

export interface FreeRoamConfig {
  start: StationId
  matchMode: MatchMode
  /** Stations already banked from earlier sessions. */
  alreadyVisited?: readonly StationId[]
  graph?: Graph
}

/** Total stations in the challenge. */
export function challengeSize(graph: Graph = sharedGraph()): number {
  return graph.nodesAtStation.size
}

export function createFreeRoam(config: FreeRoamConfig): FreeRoamState {
  const graph = config.graph ?? sharedGraph()
  const visited = [...new Set([...(config.alreadyVisited ?? []), config.start])]

  return {
    status: 'ready',
    matchMode: config.matchMode,
    current: config.start,
    visited,
    candidates: buildCandidates(graph, config.start, config.matchMode, new Set(visited)),
    lastLineId: null,
    hops: [],
    startedAt: null,
    now: 0,
    correctKeys: 0,
    errors: 0,
    combo: 0,
    bestCombo: 0,
    comboBroken: false,
    errorPulse: 0,
    arrivals: 0,
    readyToConfirm: null,
  }
}

/**
 * Strictly two-argument so it can be handed straight to `useReducer` — React's types
 * reject a reducer with extra parameters. The graph is a process-wide constant anyway.
 */
export function freeRoamReducer(state: FreeRoamState, action: FreeRoamAction): FreeRoamState {
  const graph = sharedGraph()

  switch (action.type) {
    case 'start':
      if (state.status !== 'ready') return state
      return { ...state, status: 'running', startedAt: action.at, now: action.at }

    case 'tick':
      if (state.status !== 'running') return state
      return { ...state, now: action.at }

    case 'quit':
      if (state.status === 'finished') return state
      return { ...state, status: 'finished' }

    case 'key': {
      if (state.status !== 'running') return state

      if (isConfirmKey(action.key)) {
        const ready = state.readyToConfirm
          ? state.candidates.find((c) => c.stationId === state.readyToConfirm)
          : undefined

        // Space is a character inside plenty of station names, so it may only confirm
        // when no other live candidate could still take a space — otherwise finishing
        // "Euston" would depart before "Euston Square" could be spelled out.
        const spaceIsWanted =
          action.key === ' ' && tryAdvance(state.candidates.filter((c) => c.live), ' ').length > 0

        if (ready && !spaceIsWanted) {
          return travelTo({ ...state, now: action.at }, ready, action.at, graph)
        }
        // Enter with nothing armed is simply ignored rather than counted as a mistake.
        if (action.key === 'Enter') return { ...state, now: action.at }
      }

      return applyRoamKey(state, action.key, action.at)
    }
  }
}

// --- internals --------------------------------------------------------------

function applyRoamKey(state: FreeRoamState, key: string, at: number): FreeRoamState {
  const live = state.candidates.filter((c) => c.live)
  const pool = live.length > 0 ? live : state.candidates

  const advanced = tryAdvance(pool, key)

  if (advanced.length > 0) {
    return afterAccepted(state, advanced, at)
  }

  // Nothing continued. Treat it as starting a different name from scratch — this is what
  // lets a player abandon a half-typed station without a penalty.
  const fresh = state.candidates.map((c) => ({
    ...c,
    match: createMatch(c.name, state.matchMode),
    live: true,
  }))
  const restarted = tryAdvance(fresh, key)

  if (restarted.length > 0) {
    return afterAccepted(state, restarted, at)
  }

  // Genuinely wrong: no neighbour continues or begins with this key.
  return {
    ...state,
    now: at,
    readyToConfirm: null,
    errors: state.errors + 1,
    combo: 0,
    bestCombo: state.bestCombo,
    comboBroken: state.combo > 0,
    errorPulse: state.errorPulse + 1,
  }
}

/**
 * Feeds `key` to every candidate, returning those that accepted it.
 *
 * Finished candidates are skipped: the matcher treats a completed name as accepting
 * anything, so leaving them in would make every subsequent key look correct.
 */
function tryAdvance(candidates: readonly Candidate[], key: string): Candidate[] {
  const accepted: Candidate[] = []
  for (const candidate of candidates) {
    if (candidate.match.done) continue
    const result = applyKey(candidate.match, key)
    if (result.ok) accepted.push({ ...candidate, match: result.state, live: true })
  }
  return accepted
}

function afterAccepted(state: FreeRoamState, accepted: Candidate[], at: number): FreeRoamState {
  const combo = state.combo + 1
  const base: FreeRoamState = {
    ...state,
    now: at,
    correctKeys: state.correctKeys + 1,
    combo,
    bestCombo: Math.max(state.bestCombo, combo),
    comboBroken: false,
  }

  // Narrow the field: only candidates that took this key stay live.
  const acceptedIds = new Set(accepted.map((c) => c.stationId))
  const candidates = state.candidates.map((c) => {
    const hit = accepted.find((a) => a.stationId === c.stationId)
    return hit ?? { ...c, live: acceptedIds.has(c.stationId) }
  })

  // A finished name arms confirmation instead of departing immediately, so a longer name
  // sharing its prefix stays reachable.
  const finished = accepted.find((c) => c.match.done)

  return { ...base, candidates, readyToConfirm: finished?.stationId ?? null }
}

function travelTo(
  state: FreeRoamState,
  destination: Candidate,
  at: number,
  graph: Graph,
): FreeRoamState {
  const visited = state.visited.includes(destination.stationId)
    ? state.visited
    : [...state.visited, destination.stationId]

  // Prefer staying on the line we were already using — that is what a passenger would
  // do, and it keeps the trail's colour stable through a run of stops.
  const lineId =
    state.lastLineId && destination.lines.includes(state.lastLineId)
      ? state.lastLineId
      : (destination.lines[0] ?? null)

  const next: FreeRoamState = {
    ...state,
    current: destination.stationId,
    visited,
    lastLineId: lineId,
    hops: [...state.hops, { from: state.current, to: destination.stationId, lineId, atMs: at }],
    arrivals: state.arrivals + 1,
    readyToConfirm: null,
    candidates: buildCandidates(graph, destination.stationId, state.matchMode, new Set(visited)),
  }

  return visited.length >= challengeSize(graph) ? { ...next, status: 'finished' } : next
}

/**
 * The stations reachable in one hop, each with the lines that get you there.
 *
 * Ride edges are the moves; transfer edges are not, because changing line without going
 * anywhere is not a journey — the line choice is already implied by which neighbour you
 * pick. Neighbours are gathered across every node of the current station, which is
 * precisely what gives free interchange.
 *
 * Stations already visited are dropped: the challenge is finding new ones, and listing
 * the seven you have just come through buries the one you actually want. The exception is
 * a stop where *every* neighbour has been done — with nothing new adjacent, hiding them
 * all would strand the player, so they come back and you double back through them.
 */
export function buildCandidates(
  graph: Graph,
  from: StationId,
  matchMode: MatchMode,
  visited: ReadonlySet<StationId>,
): Candidate[] {
  const byStation = new Map<StationId, Set<LineId>>()

  for (const lineId of linesAt(graph, from)) {
    const edges = graph.edges.get(nodeId(from, lineId)) ?? []
    for (const edge of edges) {
      if (edge.kind !== 'ride') continue
      const { stationId, lineId: viaLine } = parseNodeId(edge.to)
      if (stationId === from) continue
      const lines = byStation.get(stationId)
      if (lines) lines.add(viaLine)
      else byStation.set(stationId, new Set([viaLine]))
    }
  }

  const all = [...byStation].map(([stationId, lines]) => {
    const station = getStation(stationId)
    return {
      stationId,
      name: station.name,
      lines: [...lines].sort(),
      match: createMatch(station.name, matchMode),
      live: true,
      visited: visited.has(stationId),
    }
  })

  const fresh = all.filter((c) => !c.visited)
  const offered = fresh.length > 0 ? fresh : all

  return offered.sort((a, b) => a.name.localeCompare(b.name))
}

// --- derived ----------------------------------------------------------------

export function elapsedMs(state: FreeRoamState): number {
  if (state.startedAt === null) return 0
  return Math.max(0, state.now - state.startedAt)
}

/** The finished-and-waiting candidate, if the player has one armed. */
export function confirmable(state: FreeRoamState): Candidate | null {
  if (!state.readyToConfirm) return null
  return state.candidates.find((c) => c.stationId === state.readyToConfirm) ?? null
}

/** The candidate the player is part-way through, if any. */
export function activeCandidate(state: FreeRoamState): Candidate | null {
  const started = state.candidates.filter((c) => c.live && c.match.index > 0)
  if (started.length === 0) return null
  // The most advanced one is the best guess at what they mean.
  return started.reduce((best, c) => (c.match.index > best.match.index ? c : best))
}

export function remainingStations(state: FreeRoamState, graph: Graph = sharedGraph()): number {
  return Math.max(0, challengeSize(graph) - state.visited.length)
}
