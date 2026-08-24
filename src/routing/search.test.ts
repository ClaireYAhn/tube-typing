import { describe, expect, it } from 'vitest'
import { getStation } from '../data/network.ts'
import { buildGraph, sharedGraph } from './graph.ts'
import { findJourney, stationsOf, stopsBetween } from './search.ts'
import { RIDE_SECONDS, TRANSFER_SECONDS } from './types.ts'

const graph = sharedGraph()

const names = (ids: string[]) => ids.map((id) => getStation(id).name)

describe('findJourney', () => {
  it('finds a straight run along one line', () => {
    // Oval, Kennington, Elephant & Castle are consecutive on the Northern line.
    const result = findJourney(graph, 'oval', 'elephant-and-castle')
    expect(result).not.toBeNull()
    expect(result!.journey.legs).toHaveLength(1)
    expect(result!.journey.legs[0].lineId).toBe('northern')
    expect(result!.journey.transfers).toBe(0)
    expect(names(stationsOf(result!))).toEqual(['Oval', 'Kennington', 'Elephant & Castle'])
  })

  it('is symmetric', () => {
    const there = findJourney(graph, 'oval', 'elephant-and-castle')!
    const back = findJourney(graph, 'elephant-and-castle', 'oval')!
    expect(back.seconds).toBe(there.seconds)
    expect(names(stationsOf(back))).toEqual(names(stationsOf(there)).reverse())
  })

  it('returns an empty journey for a station to itself', () => {
    const result = findJourney(graph, 'bank', 'bank')
    expect(result).not.toBeNull()
    expect(result!.seconds).toBe(0)
    expect(result!.journey.legs).toEqual([])
  })

  it('chooses which line to board without being told', () => {
    // King's Cross is served by six lines. The search has to pick the useful one.
    const result = findJourney(graph, 'kings-cross-st-pancras', 'oxford-circus')
    expect(result).not.toBeNull()
    expect(result!.journey.transfers).toBe(0)
    expect(result!.journey.legs[0].lineId).toBe('victoria')
  })

  it('changes line when it has to, and says where', () => {
    const result = findJourney(graph, 'heathrow-terminal-5', 'epping')
    expect(result).not.toBeNull()
    expect(result!.journey.transfers).toBeGreaterThan(0)
    // Every leg is a real stretch of travel, never a zero-stop artefact.
    for (const leg of result!.journey.legs) {
      expect(leg.stops).toBeGreaterThan(0)
    }
    // Consecutive legs meet at the interchange station.
    for (let i = 1; i < result!.journey.legs.length; i++) {
      expect(result!.journey.legs[i].from).toBe(result!.journey.legs[i - 1].to)
    }
  })

  it('prefers a longer ride to a needless change', () => {
    // A transfer costs more than two stops, so the search should not change line to save
    // one or two of them.
    const result = findJourney(graph, 'notting-hill-gate', 'liverpool-street')!
    const direct = result.journey.legs.length === 1
    expect(direct || result.journey.transfers <= 1).toBe(true)
  })

  it('reports the cost as rides plus transfers', () => {
    const result = findJourney(graph, 'heathrow-terminal-5', 'epping')!
    const rides = result.journey.legs.reduce((n, leg) => n + leg.stops, 0)
    expect(result.seconds).toBe(rides * RIDE_SECONDS + result.journey.transfers * TRANSFER_SECONDS)
  })

  it('reaches every corner of the network', () => {
    // If any of these fail the graph has a disconnected component, which would make a
    // daily puzzle unsolvable.
    const corners = ['amersham', 'upminster', 'morden', 'high-barnet', 'woolwich-arsenal']
    for (const corner of corners) {
      expect(findJourney(graph, 'bank', corner), corner).not.toBeNull()
    }
  })

  it('returns null for a station that is not on the network', () => {
    expect(findJourney(graph, 'bank', 'gare-du-nord')).toBeNull()
    expect(findJourney(graph, 'gare-du-nord', 'bank')).toBeNull()
  })
})

describe('via, the puzzle constraint', () => {
  it('routes through the stations it is given', () => {
    const full = findJourney(graph, 'oval', 'elephant-and-castle')!
    const middle = stationsOf(full).slice(1, -1)
    const result = findJourney(graph, 'oval', 'elephant-and-castle', { via: new Set(middle) })
    expect(result).not.toBeNull()
    expect(names(stationsOf(result!))).toEqual(names(stationsOf(full)))
  })

  it('finds nothing when the stations in between are withheld', () => {
    // Kennington is the only way between the two, so barring it disconnects them.
    const result = findJourney(graph, 'oval', 'elephant-and-castle', { via: new Set() })
    expect(result).toBeNull()
  })

  it('always allows the origin and destination themselves', () => {
    // Adjacent stations need nothing in between, so an empty set still connects them.
    const result = findJourney(graph, 'oval', 'kennington', { via: new Set() })
    expect(result).not.toBeNull()
    expect(result!.journey.legs[0].stops).toBe(1)
  })
})

describe('stopsBetween', () => {
  it('counts hops, so neighbours are one apart', () => {
    expect(stopsBetween(graph, 'oval', 'kennington')).toBe(1)
    expect(stopsBetween(graph, 'oval', 'elephant-and-castle')).toBe(2)
    expect(stopsBetween(graph, 'bank', 'bank')).toBe(0)
  })

  it('is null when there is no route', () => {
    expect(stopsBetween(graph, 'bank', 'gare-du-nord')).toBeNull()
  })
})

describe('edge costs', () => {
  it('takes the change when riding round would be far longer', () => {
    // With transfers made almost free, a route that changes line should win wherever
    // changing genuinely shortens the ride.
    const cheap = buildGraph({ rideSeconds: 120, transferSeconds: 1 })
    const dear = buildGraph({ rideSeconds: 120, transferSeconds: 100_000 })

    const withCheapChanges = findJourney(cheap, 'heathrow-terminal-5', 'epping')!
    const avoidingChanges = findJourney(dear, 'heathrow-terminal-5', 'epping')!

    expect(withCheapChanges.journey.transfers).toBeGreaterThanOrEqual(
      avoidingChanges.journey.transfers,
    )
  })
})
