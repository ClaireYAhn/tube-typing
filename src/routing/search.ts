/**
 * The journey search: Dijkstra over the station × line graph.
 *
 * This is the piece `graph.ts` was built to accept. It consumes a `Graph` and produces a
 * `NodeId[]`, which `legs.ts` already turns into a `Journey`, so nothing else had to
 * change to add it.
 *
 * Seeded with *every* node at the origin, and stopping at *any* node at the destination.
 * That is what lets the search choose which line to board and which platform to arrive
 * on, rather than having the caller guess. Because transfers are real edges with a real
 * cost, "cheapest path" already means "sensible number of changes" without a special case
 * anywhere: at `TRANSFER_SECONDS` of 270 against `RIDE_SECONDS` of 120, one change has to
 * save more than two stops to be worth making, which is about right for London.
 *
 * A binary heap rather than a linear scan of the frontier. The network is 337 stations but
 * around 500 nodes and several thousand edges, and the daily puzzle runs a search on every
 * guess to check whether a station is on *some* optimal route, so this is called far more
 * often than once per journey.
 */

import { neighbours, parseNodeId, type Graph } from './graph.ts'
import type { Journey, NodeId } from './types.ts'
import { toJourney } from './legs.ts'
import type { StationId } from '../data/types.ts'

/** Min-heap keyed on cost. Small and specific; a general priority queue is not needed. */
class Frontier {
  private heap: { id: NodeId; cost: number }[] = []

  get size(): number {
    return this.heap.length
  }

  push(id: NodeId, cost: number): void {
    this.heap.push({ id, cost })
    let i = this.heap.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.heap[parent].cost <= this.heap[i].cost) break
      ;[this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]]
      i = parent
    }
  }

  pop(): { id: NodeId; cost: number } | undefined {
    if (this.heap.length === 0) return undefined
    const top = this.heap[0]
    const last = this.heap.pop()!
    if (this.heap.length > 0) {
      this.heap[0] = last
      let i = 0
      for (;;) {
        const left = i * 2 + 1
        const right = left + 1
        let smallest = i
        if (left < this.heap.length && this.heap[left].cost < this.heap[smallest].cost) {
          smallest = left
        }
        if (right < this.heap.length && this.heap[right].cost < this.heap[smallest].cost) {
          smallest = right
        }
        if (smallest === i) break
        ;[this.heap[smallest], this.heap[i]] = [this.heap[i], this.heap[smallest]]
        i = smallest
      }
    }
    return top
  }
}

export interface SearchResult {
  path: NodeId[]
  journey: Journey
  seconds: number
}

/**
 * Cheapest journey between two stations, or null when they are not connected.
 *
 * `via` restricts the search to a set of stations, which is what the puzzle uses to ask
 * "is there still a route from here using only what has been named so far?". The origin
 * and destination are always allowed regardless.
 */
export function findJourney(
  graph: Graph,
  from: StationId,
  to: StationId,
  options: { via?: ReadonlySet<StationId> } = {},
): SearchResult | null {
  if (from === to) {
    return { path: [], journey: { legs: [], transfers: 0, seconds: 0 }, seconds: 0 }
  }

  const starts = graph.nodesAtStation.get(from) ?? []
  const targets = new Set(graph.nodesAtStation.get(to) ?? [])
  if (starts.length === 0 || targets.size === 0) return null

  const allowed = options.via
  const passable = (stationId: StationId) =>
    !allowed || stationId === from || stationId === to || allowed.has(stationId)

  const best = new Map<NodeId, number>()
  const cameFrom = new Map<NodeId, NodeId>()
  const frontier = new Frontier()

  for (const start of starts) {
    // Boarding is free; the choice of which line to start on is the search's to make.
    best.set(start, 0)
    frontier.push(start, 0)
  }

  while (frontier.size > 0) {
    const current = frontier.pop()!
    // Stale heap entry: a cheaper route to this node was found after it was pushed.
    if (current.cost > (best.get(current.id) ?? Infinity)) continue

    if (targets.has(current.id)) {
      const path = rebuild(cameFrom, current.id)
      return { path, journey: toJourney(path), seconds: current.cost }
    }

    for (const edge of neighbours(graph, current.id)) {
      if (!passable(parseNodeId(edge.to).stationId)) continue
      const cost = current.cost + edge.cost
      if (cost >= (best.get(edge.to) ?? Infinity)) continue
      best.set(edge.to, cost)
      cameFrom.set(edge.to, current.id)
      frontier.push(edge.to, cost)
    }
  }

  return null
}

function rebuild(cameFrom: ReadonlyMap<NodeId, NodeId>, end: NodeId): NodeId[] {
  const path = [end]
  let at = end
  while (cameFrom.has(at)) {
    at = cameFrom.get(at)!
    path.push(at)
  }
  return path.reverse()
}

/** The stations of a journey in order, transfers collapsed to a single appearance. */
export function stationsOf(result: SearchResult): StationId[] {
  const stations: StationId[] = []
  for (const leg of result.journey.legs) {
    for (const stationId of leg.stations) {
      if (stations[stations.length - 1] !== stationId) stations.push(stationId)
    }
  }
  return stations
}

/**
 * Stops between two stations on the cheapest route, or null if unreachable.
 *
 * Counts hops rather than stations, so adjacent stations are 1 and the puzzle's "how many
 * stations do you need to name" is this minus one.
 */
export function stopsBetween(graph: Graph, from: StationId, to: StationId): number | null {
  const result = findJourney(graph, from, to)
  if (!result) return null
  return Math.max(0, stationsOf(result).length - 1)
}
