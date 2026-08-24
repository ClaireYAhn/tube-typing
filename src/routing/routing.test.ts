import { describe, expect, it } from 'vitest'
import { getStation } from '../data/network.ts'
import { buildGraph, linesAt, neighbours, nodeId, parseNodeId, sharedGraph } from './graph.ts'
import { toJourney } from './legs.ts'
import { RIDE_SECONDS, TRANSFER_SECONDS } from './types.ts'

describe('node ids', () => {
  it('round-trips', () => {
    const id = nodeId('kings-cross-st-pancras', 'piccadilly')
    expect(id).toBe('kings-cross-st-pancras@piccadilly')
    expect(parseNodeId(id)).toEqual({
      stationId: 'kings-cross-st-pancras',
      lineId: 'piccadilly',
    })
  })

  it('survives a station id containing a hyphen', () => {
    const id = nodeId('hammersmith-city-placeholder', 'hammersmith-city')
    expect(parseNodeId(id).lineId).toBe('hammersmith-city')
  })
})

describe('graph shape', () => {
  const graph = sharedGraph()

  it('creates one node per station per line', () => {
    const kingsCross = graph.nodesAtStation.get('kings-cross-st-pancras')!
    const station = getStation('kings-cross-st-pancras')
    expect(kingsCross.length).toBe(station.lines.length)
    expect(linesAt(graph, 'kings-cross-st-pancras').sort()).toEqual([...station.lines].sort())
  })

  it('gives a single-line station no transfer edges', () => {
    // Oval is Northern-only.
    const oval = getStation('oval')
    expect(oval.lines).toEqual(['northern'])
    const edges = neighbours(graph, nodeId('oval', 'northern'))
    expect(edges.every((e) => e.kind === 'ride')).toBe(true)
  })

  it('connects every line pair at an interchange', () => {
    const id = nodeId('kings-cross-st-pancras', 'victoria')
    const transfers = neighbours(graph, id).filter((e) => e.kind === 'transfer')
    const station = getStation('kings-cross-st-pancras')
    expect(transfers).toHaveLength(station.lines.length - 1)
    expect(transfers.every((e) => e.cost === TRANSFER_SECONDS)).toBe(true)
    // Never a transfer back to the same line.
    expect(transfers.some((e) => parseNodeId(e.to).lineId === 'victoria')).toBe(false)
  })

  it('makes ride edges bidirectional', () => {
    const [a, b] = ['victoria', 'pimlico'].map((s) => nodeId(s, 'victoria'))
    expect(neighbours(graph, a).some((e) => e.to === b && e.kind === 'ride')).toBe(true)
    expect(neighbours(graph, b).some((e) => e.to === a && e.kind === 'ride')).toBe(true)
  })

  it('closes the Circle line loop', () => {
    // Every node on the loop must have two ride neighbours on the Circle line, including
    // the stored endpoints — otherwise the "loop" is really a line with two dead ends.
    const loopNodes = [...graph.nodes.values()].filter((n) => n.lineId === 'circle')
    const openEnds = loopNodes.filter(
      (n) => neighbours(graph, n.id).filter((e) => e.kind === 'ride').length < 2,
    )
    // The Hammersmith branch legitimately terminates; the loop itself must not.
    expect(openEnds.length).toBeLessThanOrEqual(1)
  })

  it('honours custom costs', () => {
    const custom = buildGraph({ rideSeconds: 60, transferSeconds: 30 })
    const edges = neighbours(custom, nodeId('kings-cross-st-pancras', 'victoria'))
    expect(edges.find((e) => e.kind === 'ride')?.cost).toBe(60)
    expect(edges.find((e) => e.kind === 'transfer')?.cost).toBe(30)
  })

  it('has no self-edges', () => {
    for (const [id, list] of graph.edges) {
      expect(list.some((e) => e.to === id)).toBe(false)
    }
  })
})

describe('toJourney', () => {
  it('returns nothing for an empty path', () => {
    expect(toJourney([])).toEqual({ legs: [], transfers: 0, seconds: 0 })
  })

  it('builds a single leg for a straight run', () => {
    const path = ['a', 'b', 'c'].map((s) => nodeId(s, 'victoria'))
    const journey = toJourney(path)

    expect(journey.legs).toHaveLength(1)
    expect(journey.transfers).toBe(0)
    expect(journey.legs[0]).toMatchObject({
      lineId: 'victoria',
      from: 'a',
      to: 'c',
      stops: 2,
      stations: ['a', 'b', 'c'],
    })
    expect(journey.seconds).toBe(2 * RIDE_SECONDS)
  })

  it('splits at an interchange and prices the change', () => {
    const path = [
      nodeId('victoria', 'victoria'),
      nodeId('green-park', 'victoria'),
      nodeId('kings-cross-st-pancras', 'victoria'),
      nodeId('kings-cross-st-pancras', 'piccadilly'), // the transfer step
      nodeId('russell-square', 'piccadilly'),
      nodeId('holborn', 'piccadilly'),
    ]
    const journey = toJourney(path)

    expect(journey.legs).toHaveLength(2)
    expect(journey.transfers).toBe(1)
    expect(journey.legs[0]).toMatchObject({ lineId: 'victoria', stops: 2, to: 'kings-cross-st-pancras' })
    expect(journey.legs[1]).toMatchObject({ lineId: 'piccadilly', stops: 2, from: 'kings-cross-st-pancras' })
    expect(journey.seconds).toBe(4 * RIDE_SECONDS + TRANSFER_SECONDS)
  })

  it('drops a transfer taken before travelling anywhere', () => {
    // Boarding the wrong line then changing at the origin should not produce a 0-stop leg.
    const path = [
      nodeId('kings-cross-st-pancras', 'victoria'),
      nodeId('kings-cross-st-pancras', 'piccadilly'),
      nodeId('russell-square', 'piccadilly'),
    ]
    const journey = toJourney(path)
    expect(journey.legs).toHaveLength(1)
    expect(journey.transfers).toBe(0)
    expect(journey.legs[0].stops).toBe(1)
  })

  it('handles a two-change journey', () => {
    const path = [
      nodeId('a', 'victoria'),
      nodeId('b', 'victoria'),
      nodeId('b', 'central'),
      nodeId('c', 'central'),
      nodeId('c', 'northern'),
      nodeId('d', 'northern'),
    ]
    const journey = toJourney(path)
    expect(journey.legs.map((l) => l.lineId)).toEqual(['victoria', 'central', 'northern'])
    expect(journey.transfers).toBe(2)
    expect(journey.seconds).toBe(3 * RIDE_SECONDS + 2 * TRANSFER_SECONDS)
  })
})
