/**
 * Types for interchange-aware journey planning.
 *
 * The important modelling decision is that a graph node is **a station on a line**, not a
 * station. King's Cross St Pancras is six nodes, one per line serving it.
 *
 * Why: if nodes were stations, the graph would lose the line you arrived on, and a
 * shortest path could silently "teleport" between lines at no cost — so it could never
 * count interchanges, price them, or tell you which platform to walk to. With station ×
 * line nodes, a change of line is an explicit edge with an explicit cost, and the set of
 * lines you may board at a station is simply the set of nodes sharing its `stationId`.
 *
 * Results are legs, not a flat station list, because the journey needs to render as
 * "Victoria, 3 stops → change at King's Cross → Piccadilly, 5 stops", with each segment
 * in its own line colour. A flat list would throw that structure away.
 */

import type { LineId, StationId } from '../data/types.ts'

/** `${stationId}@${lineId}` — see `nodeId`. */
export type NodeId = string

export interface RouteNode {
  id: NodeId
  stationId: StationId
  lineId: LineId
}

/** `ride` moves one stop along a line; `transfer` changes line within one station. */
export type EdgeKind = 'ride' | 'transfer'

export interface Edge {
  from: NodeId
  to: NodeId
  kind: EdgeKind
  /** Seconds. */
  cost: number
}

/** One continuous stretch on a single line. */
export interface Leg {
  lineId: LineId
  from: StationId
  to: StationId
  /** Every station passed through, `from` first and `to` last. */
  stations: StationId[]
  /** Stops travelled — always `stations.length - 1`. */
  stops: number
  seconds: number
}

export interface Journey {
  legs: Leg[]
  /** Number of line changes, i.e. `legs.length - 1`. */
  transfers: number
  seconds: number
}

/**
 * Edge costs, in seconds.
 *
 * These are deliberately uniform rather than timetable-derived: the app has no timetable
 * data, and a flat cost still produces sensible routes because what actually decides a
 * London journey is how many changes it involves, not the exact dwell time.
 */
export const RIDE_SECONDS = 120
export const TRANSFER_SECONDS = 270
