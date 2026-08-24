/**
 * The daily journey: one puzzle a day, the same one for everybody.
 *
 * Everything here is a pure function of a date string, so two people opening the site in
 * London and Seoul get the same pair of stations and can compare how they did. That is
 * the whole reason the puzzle is generated rather than stored: no server, no content to
 * publish, and it works offline.
 *
 * The date is taken in UTC rather than the viewer's timezone. A local date would hand
 * friends in different countries different puzzles, which defeats the point of sharing
 * one. UTC also keeps the rollover at a fixed moment rather than sweeping around the
 * world.
 */

import { allStations, getStation } from '../data/network.ts'
import type { StationId } from '../data/types.ts'
import { sharedGraph, type Graph } from '../routing/graph.ts'
import { findJourney, stationsOf, type SearchResult } from '../routing/search.ts'

export interface DailyPuzzle {
  /** `YYYY-MM-DD`, UTC. Also the seed and the leaderboard key. */
  date: string
  from: StationId
  to: StationId
  /** The cheapest route, which is what the guess budget is measured against. */
  optimal: SearchResult
  /** Stations on that route, ends included. */
  route: StationId[]
  /** Stations the player actually has to name, so the route minus the two ends. */
  toName: number
  transfers: number
}

/**
 * What makes a puzzle worth playing.
 *
 * Too short and it is one obvious hop; too long and it is a typing chore rather than a
 * question about the network. At least one change is required because a single-line
 * journey only asks you to read a line in order, where a change asks you to know how the
 * network fits together, which is the interesting thing.
 */
const MIN_TO_NAME = 4
const MAX_TO_NAME = 11
const MIN_TRANSFERS = 1
const MAX_TRANSFERS = 2

/** Attempts before the constraints are relaxed. Comfortably more than ever needed. */
const ATTEMPTS = 400

export function dateKey(at: Date = new Date()): string {
  return at.toISOString().slice(0, 10)
}

/**
 * A small, fast, deterministic PRNG.
 *
 * `Math.random` cannot be used for any of this: the puzzle has to come out identical on
 * every machine, and identical again tomorrow if someone reopens yesterday's date.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

interface Constraints {
  minToName: number
  maxToName: number
  minTransfers: number
  maxTransfers: number
}

const IDEAL: Constraints = {
  minToName: MIN_TO_NAME,
  maxToName: MAX_TO_NAME,
  minTransfers: MIN_TRANSFERS,
  maxTransfers: MAX_TRANSFERS,
}

/**
 * Widened constraints, used only if the ideal ones somehow find nothing. Keeps the
 * function total: a day must always have a puzzle, even a mediocre one.
 */
const FALLBACK: Constraints = {
  minToName: 2,
  maxToName: 20,
  minTransfers: 0,
  maxTransfers: 4,
}

function fits(result: SearchResult, route: StationId[], limits: Constraints): boolean {
  const toName = route.length - 2
  return (
    toName >= limits.minToName &&
    toName <= limits.maxToName &&
    result.journey.transfers >= limits.minTransfers &&
    result.journey.transfers <= limits.maxTransfers
  )
}

export function puzzleFor(date: string, graph: Graph = sharedGraph()): DailyPuzzle {
  const random = mulberry32(hash(`tube-typing:${date}`))
  const pool = allStations

  const search = (limits: Constraints): DailyPuzzle | null => {
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const from = pool[Math.floor(random() * pool.length)]
      const to = pool[Math.floor(random() * pool.length)]
      if (from.id === to.id) continue

      const result = findJourney(graph, from.id, to.id)
      if (!result) continue

      const route = stationsOf(result)
      if (!fits(result, route, limits)) continue

      return {
        date,
        from: from.id,
        to: to.id,
        optimal: result,
        route,
        toName: route.length - 2,
        transfers: result.journey.transfers,
      }
    }
    return null
  }

  const puzzle = search(IDEAL) ?? search(FALLBACK)
  if (puzzle) return puzzle

  // Unreachable with a connected network, but a thrown error on the menu would be a far
  // worse failure than a dull puzzle.
  const from = pool[0]
  const to = pool[pool.length - 1]
  const result = findJourney(graph, from.id, to.id)!
  const route = stationsOf(result)
  return {
    date,
    from: from.id,
    to: to.id,
    optimal: result,
    route,
    toName: Math.max(0, route.length - 2),
    transfers: result.journey.transfers,
  }
}

export function todaysPuzzle(graph: Graph = sharedGraph()): DailyPuzzle {
  return puzzleFor(dateKey(), graph)
}

/**
 * How many stations the player may name before the run ends.
 *
 * The optimal count plus a margin, so a route that is one station off the best still wins
 * and only a genuinely lost player runs out. Travle does the same thing, and it is what
 * keeps the puzzle a question rather than an exam.
 */
export const GUESS_MARGIN = 4

export function guessBudget(puzzle: DailyPuzzle): number {
  return puzzle.toName + GUESS_MARGIN
}

/** `Heathrow Terminal 5 → Epping`, for headings and share text. */
export function describePuzzle(puzzle: DailyPuzzle): string {
  return `${getStation(puzzle.from).name} → ${getStation(puzzle.to).name}`
}
