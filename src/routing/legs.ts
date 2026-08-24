/**
 * Turns a node path into a journey of legs.
 *
 * A path alternates two kinds of step: riding (same line, next station) and transferring
 * (same station, different line). Grouping by line collapses the ride runs into legs and
 * drops the transfer steps, which is exactly the shape the UI wants —
 * "Victoria, 3 stops → change at King's Cross → Piccadilly, 5 stops".
 */

import { RIDE_SECONDS, TRANSFER_SECONDS, type Journey, type Leg, type NodeId } from './types.ts'
import { parseNodeId } from './graph.ts'

export interface ToJourneyOptions {
  rideSeconds?: number
  transferSeconds?: number
}

export function toJourney(path: readonly NodeId[], options: ToJourneyOptions = {}): Journey {
  const rideSeconds = options.rideSeconds ?? RIDE_SECONDS
  const transferSeconds = options.transferSeconds ?? TRANSFER_SECONDS

  const legs: Leg[] = []
  if (path.length === 0) return { legs, transfers: 0, seconds: 0 }

  let current = parseNodeId(path[0])
  let stations = [current.stationId]

  const flush = () => {
    // A transfer at the very first station produces a zero-length run with nothing to
    // show; only emit legs that actually move.
    if (stations.length < 2) return
    legs.push({
      lineId: current.lineId,
      from: stations[0],
      to: stations[stations.length - 1],
      stations: [...stations],
      stops: stations.length - 1,
      seconds: (stations.length - 1) * rideSeconds,
    })
  }

  for (let i = 1; i < path.length; i++) {
    const step = parseNodeId(path[i])

    if (step.lineId === current.lineId) {
      // Riding on. Guard against a repeated node, which would inflate the stop count.
      if (step.stationId !== stations[stations.length - 1]) stations.push(step.stationId)
      continue
    }

    // Line changed — close the current leg and start a new one at this station.
    flush()
    current = step
    stations = [step.stationId]
  }
  flush()

  const transfers = Math.max(0, legs.length - 1)
  const seconds = legs.reduce((total, leg) => total + leg.seconds, 0) + transfers * transferSeconds

  return { legs, transfers, seconds }
}

/** `Victoria · 3 stops` — a compact label for a leg. */
export function describeLeg(leg: Leg, lineName: string): string {
  return `${lineName} · ${leg.stops} ${leg.stops === 1 ? 'stop' : 'stops'}`
}
