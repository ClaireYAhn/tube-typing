/**
 * The daily journey: one route a day, the same one for everybody, typed end to end.
 *
 * This is a typing challenge rather than a quiz. An earlier version asked the player to
 * work out which stations lay between two ends, which turned out to be the wrong question
 * twice over: nobody can name Maryland or Seven Kings from memory, and anyone outside
 * London cannot name the lines either. Showing the route and asking only for speed is
 * what the game has always been, and it means a friend who has never been to London can
 * play the same daily as a commuter.
 *
 * Because everyone types exactly the same stations in the same order, time and KPM are
 * directly comparable, which is what makes a shared daily leaderboard meaningful.
 *
 * Everything here is a pure function of a date string, so there is no server, no content
 * to publish, and it works offline. The date is UTC rather than local: a local date would
 * hand friends in London and Seoul different routes and leave them nothing to compare.
 */

import { allStations, getStation } from '../data/network.ts'
import type { LineId, StationId } from '../data/types.ts'
import { sharedGraph, type Graph } from '../routing/graph.ts'
import { findJourney, stationsOf } from '../routing/search.ts'
import type { Leg } from '../routing/types.ts'

export interface DailyJourney {
  /** `YYYY-MM-DD`, UTC. Also the seed and the leaderboard key. */
  date: string
  from: StationId
  to: StationId
  /** Every station to type, in order, both ends included. */
  route: StationId[]
  /** The journey broken into single-line stretches, for the map and the description. */
  legs: Leg[]
  /**
   * The line ridden between each pair of consecutive stations, so
   * `segmentLines[i]` covers `route[i]` to `route[i + 1]`. The map colours by this.
   */
  segmentLines: LineId[]
  transfers: number
}

/**
 * What makes a route worth typing.
 *
 * Long enough to be a run rather than a warm-up, short enough that a daily is a minute
 * and not a chore. At around thirteen characters a station, twenty stations is roughly a
 * minute at a comfortable speed. At least one change so the map has something to do and
 * the route is a journey rather than a stretch of one line.
 *
 * `MIN_LEG_STOPS` exists because the cheapest path sometimes changes line to ride a
 * single stop and then changes straight back. That is a real route and Dijkstra is right
 * to find it, but it reads as a mistake to anyone who knows the network, and it makes a
 * mess of the coloured map for one hop's worth of track.
 */
const MIN_STATIONS = 15
const MAX_STATIONS = 25
const MIN_TRANSFERS = 1
const MAX_TRANSFERS = 3
const MIN_LEG_STOPS = 2

const ATTEMPTS = 600

export function dateKey(at: Date = new Date()): string {
  return at.toISOString().slice(0, 10)
}

/**
 * A small, fast, deterministic PRNG.
 *
 * `Math.random` cannot be used for any of this: the route has to come out identical on
 * every machine, and identical again if someone reopens the same date tomorrow.
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

interface Limits {
  minStations: number
  maxStations: number
  minTransfers: number
  maxTransfers: number
}

const IDEAL: Limits = {
  minStations: MIN_STATIONS,
  maxStations: MAX_STATIONS,
  minTransfers: MIN_TRANSFERS,
  maxTransfers: MAX_TRANSFERS,
}

/** Widened, used only if the ideal limits somehow find nothing. Keeps the day playable. */
const FALLBACK: Limits = {
  minStations: 8,
  maxStations: 40,
  minTransfers: 0,
  maxTransfers: 5,
}

/** One entry per hop, so the map can colour each stretch of track separately. */
function segmentsOf(legs: readonly Leg[]): LineId[] {
  const lines: LineId[] = []
  for (const leg of legs) {
    for (let i = 0; i < leg.stops; i++) lines.push(leg.lineId)
  }
  return lines
}

export function journeyFor(date: string, graph: Graph = sharedGraph()): DailyJourney {
  const random = mulberry32(hash(`tube-typing:${date}`))
  const pool = allStations

  const search = (limits: Limits): DailyJourney | null => {
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const from = pool[Math.floor(random() * pool.length)]
      const to = pool[Math.floor(random() * pool.length)]
      if (from.id === to.id) continue

      const result = findJourney(graph, from.id, to.id)
      if (!result) continue

      const route = stationsOf(result)
      const transfers = result.journey.transfers
      if (route.length < limits.minStations || route.length > limits.maxStations) continue
      if (transfers < limits.minTransfers || transfers > limits.maxTransfers) continue

      if (result.journey.legs.some((leg) => leg.stops < MIN_LEG_STOPS)) continue

      const segmentLines = segmentsOf(result.journey.legs)
      // A mismatch would mean the map colours the wrong stretch, so refuse rather than
      // draw something misleading.
      if (segmentLines.length !== route.length - 1) continue

      return {
        date,
        from: from.id,
        to: to.id,
        route,
        legs: result.journey.legs,
        segmentLines,
        transfers,
      }
    }
    return null
  }

  const journey = search(IDEAL) ?? search(FALLBACK)
  if (journey) return journey

  // Unreachable on a connected network, but a thrown error on the menu would be a much
  // worse failure than a dull route.
  const result = findJourney(graph, 'morden', 'high-barnet')!
  const route = stationsOf(result)
  return {
    date,
    from: route[0],
    to: route[route.length - 1],
    route,
    legs: result.journey.legs,
    segmentLines: segmentsOf(result.journey.legs),
    transfers: result.journey.transfers,
  }
}

export function todaysJourney(graph: Graph = sharedGraph()): DailyJourney {
  return journeyFor(dateKey(), graph)
}

/** `Wanstead → Goodmayes`, for headings and share text. */
export function describeJourney(journey: DailyJourney): string {
  return `${getStation(journey.from).name} → ${getStation(journey.to).name}`
}

/** The board this day's runs are ranked on. Match mode matters; see `boardKey`. */
export function dailyRecordKey(journey: DailyJourney): string {
  return `daily:${journey.date}`
}
