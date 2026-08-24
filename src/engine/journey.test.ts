import { describe, expect, it } from 'vitest'
import { puzzleFor } from '../game/daily.ts'
import { sharedGraph } from '../routing/graph.ts'
import { findJourney, stationsOf } from '../routing/search.ts'
import { getStation } from '../data/network.ts'
import {
  createJourney,
  guessesLeft,
  journeyReducer,
  overPar,
  suggestions,
  type JourneyState,
} from './journey.ts'

const graph = sharedGraph()
const puzzle = puzzleFor('2026-09-01', graph)

function start(matchMode: 'lenient' | 'strict' = 'lenient'): JourneyState {
  return journeyReducer(createJourney({ puzzle, matchMode }), { type: 'start', at: 0 })
}

function type(state: JourneyState, text: string, from = 1): JourneyState {
  return text
    .split('')
    .reduce((s, key, i) => journeyReducer(s, { type: 'key', key, at: from + i }), state)
}

/** Type a station's name and commit it, which is how a guess is made. */
function name(state: JourneyState, stationId: string, from = 1): JourneyState {
  const text = getStation(stationId).name
  const typed = type(state, text, from)
  return journeyReducer(typed, { type: 'key', key: 'Enter', at: from + text.length })
}

/** The stations between the two ends of the optimal route. */
const middle = puzzle.route.slice(1, -1)

describe('setup', () => {
  it('starts with a budget above the optimal count', () => {
    const state = start()
    expect(state.budget).toBeGreaterThan(puzzle.toName)
    expect(guessesLeft(state)).toBe(state.budget)
    expect(state.status).toBe('running')
  })

  it('ignores keys before the run has started', () => {
    const ready = createJourney({ puzzle, matchMode: 'lenient' })
    const after = name(ready, middle[0])
    expect(after.named).toEqual([])
    expect(after.correctKeys).toBe(0)
  })
})

describe('naming stations', () => {
  it('accepts any station on the network, not only neighbours', () => {
    // Nothing about this station has to be adjacent to anything already named.
    const state = name(start(), 'morden')
    expect(state.named).toEqual(['morden'])
    expect(state.spent).toBe(1)
  })

  it('narrows candidates as the name is spelled out', () => {
    const state = type(start(), 'wimbledon')
    const live = state.candidates.filter((c) => c.live)
    expect(live.length).toBeGreaterThan(0)
    for (const candidate of live) {
      expect(candidate.name.toLowerCase()).toContain('wimbledon')
    }
  })

  it('does not commit until Enter', () => {
    const state = type(start(), getStation('morden').name)
    expect(state.readyToConfirm).toBe('morden')
    expect(state.named).toEqual([])
  })

  it('keeps a longer station reachable past a shorter prefix', () => {
    // "Euston" is a prefix of "Euston Square", so the space has to keep typing rather
    // than commit.
    let state = type(start(), 'euston')
    expect(state.readyToConfirm).toBe('euston')
    state = type(state, ' square', 100)
    expect(state.readyToConfirm).toBe('euston-square')
  })

  it('counts a key no station accepts as a mistake', () => {
    const state = type(start(), 'zzzz')
    expect(state.errors).toBeGreaterThan(0)
    expect(state.named).toEqual([])
  })

  it('lets a half-typed name be abandoned without penalty', () => {
    let state = type(start(), 'mor')
    state = name(state, 'oval', 50)
    expect(state.named).toEqual(['oval'])
    expect(state.errors).toBe(0)
  })

  it('offers suggestions once a prefix narrows the field', () => {
    const state = type(start(), 'padd')
    const names = suggestions(state).map((c) => c.name)
    expect(names).toContain('Paddington')
  })
})

describe('spending guesses', () => {
  it('does not charge for naming the same station twice', () => {
    let state = name(start(), 'morden')
    expect(state.spent).toBe(1)
    state = name(state, 'morden', 100)
    expect(state.spent).toBe(1)
    expect(state.named).toEqual(['morden'])
  })

  it('does not charge for naming an endpoint', () => {
    // Both ends are on the route by definition, so naming one is free and pointless.
    const state = name(start(), puzzle.from)
    expect(state.spent).toBe(0)
    expect(state.named).toEqual([])
  })

  it('ends the run when the budget is gone', () => {
    let state = start()
    // Stations far from the answer, so none of them completes the chain by accident.
    const wrong = ['morden', 'high-barnet', 'amersham', 'upminster', 'epping', 'brixton',
      'watford', 'chesham', 'uxbridge', 'stanmore', 'edgware', 'barking', 'richmond',
      'wimbledon', 'heathrow-terminal-5', 'cockfosters']
    let at = 1
    for (const id of wrong) {
      if (state.status !== 'running') break
      state = name(state, id, at)
      at += 200
    }
    expect(state.status).toBe('lost')
    expect(guessesLeft(state)).toBe(0)
    expect(state.solution).toEqual(puzzle.route)
  })
})

describe('winning', () => {
  it('wins the moment the named stations join the two ends', () => {
    let state = start()
    let at = 1
    for (const id of middle) {
      expect(state.status).toBe('running')
      state = name(state, id, at)
      at += 200
    }
    expect(state.status).toBe('won')
    expect(state.solution).not.toBeNull()
  })

  it('does not win early on a partial chain', () => {
    // Every station but the last one still leaves a gap.
    let state = start()
    let at = 1
    for (const id of middle.slice(0, -1)) {
      state = name(state, id, at)
      at += 200
    }
    expect(state.status).toBe('running')
  })

  it('scores the optimal route as par', () => {
    let state = start()
    let at = 1
    for (const id of middle) {
      state = name(state, id, at)
      at += 200
    }
    expect(state.spent).toBe(puzzle.toName)
    expect(overPar(state)).toBe(0)
  })

  it('scores a detour as over par', () => {
    let state = name(start(), 'morden')
    let at = 200
    for (const id of middle) {
      state = name(state, id, at)
      at += 200
    }
    expect(state.status).toBe('won')
    expect(overPar(state)).toBe(1)
  })

  it('reports a solution that really connects the two ends', () => {
    let state = start()
    let at = 1
    for (const id of middle) {
      state = name(state, id, at)
      at += 200
    }
    const route = findJourney(graph, puzzle.from, puzzle.to, { via: new Set(state.named) })
    expect(route).not.toBeNull()
    expect(state.solution).toEqual(stationsOf(route!))
  })
})

describe('giving up', () => {
  it('ends the run and reveals the route', () => {
    const state = journeyReducer(start(), { type: 'give-up' })
    expect(state.status).toBe('lost')
    expect(state.solution).toEqual(puzzle.route)
  })

  it('does nothing to a finished run', () => {
    let state = start()
    let at = 1
    for (const id of middle) {
      state = name(state, id, at)
      at += 200
    }
    expect(state.status).toBe('won')
    expect(journeyReducer(state, { type: 'give-up' }).status).toBe('won')
  })
})
