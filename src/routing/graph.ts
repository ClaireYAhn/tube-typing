/**
 * Builds the station × line graph described in `types.ts`.
 *
 * This is the substrate the journey planner runs on. The search lives in `search.ts`:
 * Dijkstra over `neighbours`, seeded with every node at the origin station and stopping at
 * any node at the destination. It consumes a `Graph` and produces a `NodeId[]`, which
 * `legs.ts` turns into a `Journey`, and adding it needed no change to anything here.
 */

import { network } from '../data/network.ts'
import type { LineId, StationId } from '../data/types.ts'
import {
  RIDE_SECONDS,
  TRANSFER_SECONDS,
  type Edge,
  type NodeId,
  type RouteNode,
} from './types.ts'

export function nodeId(stationId: StationId, lineId: LineId): NodeId {
  return `${stationId}@${lineId}`
}

export function parseNodeId(id: NodeId): { stationId: StationId; lineId: LineId } {
  const at = id.lastIndexOf('@')
  return { stationId: id.slice(0, at), lineId: id.slice(at + 1) as LineId }
}

export interface Graph {
  nodes: ReadonlyMap<NodeId, RouteNode>
  /** Outgoing edges, keyed by source node. */
  edges: ReadonlyMap<NodeId, readonly Edge[]>
  /** Every node at a station — i.e. the lines you can board there. */
  nodesAtStation: ReadonlyMap<StationId, readonly NodeId[]>
}

export interface BuildOptions {
  rideSeconds?: number
  transferSeconds?: number
}

export function buildGraph(options: BuildOptions = {}): Graph {
  const rideSeconds = options.rideSeconds ?? RIDE_SECONDS
  const transferSeconds = options.transferSeconds ?? TRANSFER_SECONDS

  const nodes = new Map<NodeId, RouteNode>()
  const edges = new Map<NodeId, Edge[]>()
  const nodesAtStation = new Map<StationId, NodeId[]>()

  const ensureNode = (stationId: StationId, lineId: LineId): NodeId => {
    const id = nodeId(stationId, lineId)
    if (!nodes.has(id)) {
      nodes.set(id, { id, stationId, lineId })
      edges.set(id, [])
      const atStation = nodesAtStation.get(stationId)
      if (atStation) atStation.push(id)
      else nodesAtStation.set(stationId, [id])
    }
    return id
  }

  /** Undirected in practice — every ride and transfer is added in both directions. */
  const link = (from: NodeId, to: NodeId, kind: Edge['kind'], cost: number) => {
    const existing = edges.get(from)!
    if (existing.some((e) => e.to === to && e.kind === kind)) return
    existing.push({ from, to, kind, cost })
  }

  // --- ride edges: consecutive stations on the same line ---------------------
  for (const line of network.lines) {
    const sequences = [...line.routes, ...(line.loop ? [line.loop] : [])]
    for (const route of sequences) {
      for (let i = 0; i < route.stationIds.length; i++) {
        ensureNode(route.stationIds[i], line.id)
      }
      for (let i = 1; i < route.stationIds.length; i++) {
        const a = nodeId(route.stationIds[i - 1], line.id)
        const b = nodeId(route.stationIds[i], line.id)
        link(a, b, 'ride', rideSeconds)
        link(b, a, 'ride', rideSeconds)
      }
    }

    // The Circle line's loop is stored with its repeated terminus trimmed off, so the
    // final hop back to the start has to be closed explicitly.
    if (line.loop && line.loop.stationIds.length > 2) {
      const ids = line.loop.stationIds
      const first = nodeId(ids[0], line.id)
      const last = nodeId(ids[ids.length - 1], line.id)
      link(last, first, 'ride', rideSeconds)
      link(first, last, 'ride', rideSeconds)
    }
  }

  // --- transfer edges: every pair of lines meeting at one station ------------
  for (const ids of nodesAtStation.values()) {
    if (ids.length < 2) continue
    for (const a of ids) {
      for (const b of ids) {
        if (a !== b) link(a, b, 'transfer', transferSeconds)
      }
    }
  }

  return { nodes, edges, nodesAtStation }
}

export function neighbours(graph: Graph, id: NodeId): readonly Edge[] {
  return graph.edges.get(id) ?? []
}

/** The lines you can board at a station — the interchange options at that node. */
export function linesAt(graph: Graph, stationId: StationId): LineId[] {
  return (graph.nodesAtStation.get(stationId) ?? []).map((id) => parseNodeId(id).lineId)
}

/** Cached because building the whole graph costs a beat and it never changes. */
let cached: Graph | null = null
export function sharedGraph(): Graph {
  cached ??= buildGraph()
  return cached
}
