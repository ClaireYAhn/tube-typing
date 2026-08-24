import { describe, expect, it } from 'vitest'
import { sharedGraph } from '../routing/graph.ts'
import {
  activeCandidate,
  buildCandidates,
  createFreeRoam,
  freeRoamReducer,
  type FreeRoamState,
} from './freeRoam.ts'

const graph = sharedGraph()

function start(at = 'oval', alreadyVisited: string[] = []): FreeRoamState {
  const state = createFreeRoam({ start: at, matchMode: 'lenient', alreadyVisited })
  return freeRoamReducer(state, { type: 'start', at: 0 })
}

function type(state: FreeRoamState, text: string, from = 1): FreeRoamState {
  return text
    .split('')
    .reduce((s, key, i) => freeRoamReducer(s, { type: 'key', key, at: from + i }), state)
}

/** Types a name and confirms it — the normal way to travel in this mode. */
function travel(state: FreeRoamState, text: string, from = 1): FreeRoamState {
  const typed = type(state, text, from)
  return freeRoamReducer(typed, { type: 'key', key: 'Enter', at: from + text.length })
}

const names = (state: FreeRoamState) => state.candidates.map((c) => c.name).sort()

describe('candidates', () => {
  it('offers the neighbours of a single-line station', () => {
    // Oval sits between Kennington and Stockwell on the Northern line.
    expect(names(start('oval'))).toEqual(['Kennington', 'Stockwell'])
  })

  it('offers neighbours on every line at an interchange — this is the free interchange', () => {
    const state = start('kings-cross-st-pancras')
    const lines = new Set(state.candidates.flatMap((c) => c.lines))
    // King's Cross is served by six lines; its neighbours should span all of them.
    expect(lines.size).toBeGreaterThanOrEqual(5)
    expect(state.candidates.length).toBeGreaterThan(5)
  })

  it('never offers the station you are standing at', () => {
    const state = start('kings-cross-st-pancras')
    expect(state.candidates.some((c) => c.stationId === 'kings-cross-st-pancras')).toBe(false)
  })

  it('hides stations already visited', () => {
    // Oval's neighbours are Kennington and Stockwell; with Kennington banked only
    // Stockwell should be on offer.
    const state = start('oval', ['kennington'])
    expect(names(state)).toEqual(['Stockwell'])
  })

  it('offers visited stations again when there is nothing new adjacent', () => {
    // Both neighbours done. Hiding them here would strand the player, so they come
    // back and you double back through them.
    const state = start('oval', ['kennington', 'stockwell'])
    expect(names(state)).toEqual(['Kennington', 'Stockwell'])
    expect(state.candidates.every((c) => c.visited)).toBe(true)
  })
})

describe('typing to travel', () => {
  it('moves when a neighbour name is completed', () => {
    let state = start('oval')
    state = travel(state, 'stockwell')

    expect(state.current).toBe('stockwell')
    expect(state.visited).toEqual(['oval', 'stockwell'])
    expect(state.hops).toHaveLength(1)
    expect(state.hops[0]).toMatchObject({ from: 'oval', to: 'stockwell', lineId: 'northern' })
    expect(state.errors).toBe(0)
  })

  it('rebuilds the candidate list on arrival', () => {
    let state = start('oval')
    state = travel(state, 'stockwell')
    // Stockwell adds the Victoria line, so its neighbours differ from Oval's.
    expect(names(state)).not.toEqual(['Kennington', 'Stockwell'])
    expect(state.candidates.some((c) => c.lines.includes('victoria'))).toBe(true)
  })

  it('keeps several candidates alive while a prefix is ambiguous', () => {
    // Both neighbours of Gloucester Road on this stretch start differently, so use
    // King's Cross where several neighbours share a first letter.
    const state = start('kings-cross-st-pancras')
    const firstLetters = new Map<string, number>()
    for (const c of state.candidates) {
      const key = c.name[0].toLowerCase()
      firstLetters.set(key, (firstLetters.get(key) ?? 0) + 1)
    }
    const shared = [...firstLetters].find(([, n]) => n > 1)
    expect(shared).toBeDefined()

    const after = type(state, shared![0])
    expect(after.candidates.filter((c) => c.live).length).toBe(shared![1])
    expect(after.errors).toBe(0)
  })

  it('narrows to one candidate as the name is spelled out', () => {
    let state = start('oval')
    state = type(state, 'st')
    const alive = state.candidates.filter((c) => c.live)
    expect(alive).toHaveLength(1)
    expect(alive[0].name).toBe('Stockwell')
    expect(activeCandidate(state)?.name).toBe('Stockwell')
  })

  it('lets a half-typed name be abandoned without penalty', () => {
    let state = start('oval')
    state = type(state, 'sto') // committing to Stockwell…
    state = travel(state, 'kennington', 10) // …then changing to the other neighbour
    expect(state.current).toBe('kennington')
    expect(state.errors).toBe(0)
  })

  it('counts a key that no neighbour accepts as a mistake', () => {
    let state = start('oval')
    state = type(state, 'z')
    expect(state.errors).toBe(1)
    expect(state.current).toBe('oval')
    expect(state.combo).toBe(0)
  })

  it('tracks combo across hops and breaks it on a mistake', () => {
    let state = start('oval')
    state = travel(state, 'stockwell')
    // Enter confirms; it is not a typed character, so it does not add to the combo.
    expect(state.combo).toBe('stockwell'.length)

    state = type(state, 'z', 100)
    expect(state.comboBroken).toBe(true)
    expect(state.combo).toBe(0)
    expect(state.bestCombo).toBe('stockwell'.length)
  })

  it('ignores keys before the run has started', () => {
    const ready = createFreeRoam({ start: 'oval', matchMode: 'lenient' })
    const after = travel(ready, 'stockwell')
    expect(after.current).toBe('oval')
    expect(after.correctKeys).toBe(0)
  })
})

describe('visiting', () => {
  it('does not double-count a station visited twice', () => {
    // Both of Oval's neighbours are banked, so the fallback offers them again and
    // Stockwell can be revisited. The hop is recorded; the visited list is not extended.
    let state = start('oval', ['kennington', 'stockwell'])
    expect(state.visited).toHaveLength(3)

    state = travel(state, 'stockwell')
    expect(state.current).toBe('stockwell')
    expect(state.visited).toHaveLength(3)
    expect(state.hops).toHaveLength(1)
  })

  it('carries stations banked in an earlier session', () => {
    const state = start('oval', ['bank', 'angel'])
    expect(state.visited).toContain('bank')
    expect(state.visited).toContain('angel')
    expect(state.visited).toContain('oval')
  })

  it('stays on the same line where it can', () => {
    let state = start('oval')
    state = travel(state, 'stockwell')
    expect(state.lastLineId).toBe('northern')
    // Brixton is Victoria-line only from Stockwell, so the line has to change.
    state = travel(state, 'brixton', 100)
    expect(state.lastLineId).toBe('victoria')
  })
})

describe('buildCandidates', () => {
  it('reports every line that reaches a neighbour', () => {
    const candidates = buildCandidates(graph, 'kings-cross-st-pancras', 'lenient', new Set())
    for (const candidate of candidates) {
      expect(candidate.lines.length).toBeGreaterThan(0)
    }
  })

  it('is reachable in both directions', () => {
    const forward = buildCandidates(graph, 'oval', 'lenient', new Set())
    expect(forward.some((c) => c.stationId === 'stockwell')).toBe(true)
    const back = buildCandidates(graph, 'stockwell', 'lenient', new Set())
    expect(back.some((c) => c.stationId === 'oval')).toBe(true)
  })
})

describe('confirming a destination', () => {
  it('does not depart until Enter is pressed', () => {
    let state = start('oval')
    state = type(state, 'stockwell')

    expect(state.current).toBe('oval') // still waiting
    expect(state.readyToConfirm).toBe('stockwell')

    state = freeRoamReducer(state, { type: 'key', key: 'Enter', at: 50 })
    expect(state.current).toBe('stockwell')
    expect(state.readyToConfirm).toBeNull()
  })

  it('accepts space as confirmation too', () => {
    // Neither neighbour of Oval contains a space, so space is unambiguous here.
    let state = start('oval')
    state = type(state, 'stockwell')
    state = freeRoamReducer(state, { type: 'key', key: ' ', at: 50 })
    expect(state.current).toBe('stockwell')
  })

  it('keeps a longer station reachable past a shorter prefix', () => {
    // The bug this exists for: typing "Euston" used to depart instantly, making
    // "Euston Square" impossible to pick from King's Cross.
    let state = start('kings-cross-st-pancras')
    state = type(state, 'euston')
    expect(state.readyToConfirm).toBe('euston')
    expect(state.current).toBe('kings-cross-st-pancras')

    // Carry on into the longer name — the space is part of it, not a confirmation.
    state = type(state, ' square', 100)
    expect(state.readyToConfirm).toBe('euston-square')

    state = freeRoamReducer(state, { type: 'key', key: 'Enter', at: 300 })
    expect(state.current).toBe('euston-square')
  })

  it('still lets the shorter name be chosen', () => {
    let state = start('kings-cross-st-pancras')
    state = type(state, 'euston')
    state = freeRoamReducer(state, { type: 'key', key: 'Enter', at: 100 })
    expect(state.current).toBe('euston')
  })

  it('ignores Enter when nothing is finished', () => {
    let state = start('oval')
    state = type(state, 'stock')
    const before = state.current
    state = freeRoamReducer(state, { type: 'key', key: 'Enter', at: 50 })
    expect(state.current).toBe(before)
    expect(state.errors).toBe(0)
  })

  it('disarms confirmation after a wrong key', () => {
    let state = start('oval')
    state = type(state, 'stockwell')
    state = type(state, 'z', 100)
    expect(state.readyToConfirm).toBeNull()
    state = freeRoamReducer(state, { type: 'key', key: 'Enter', at: 200 })
    expect(state.current).toBe('oval')
  })
})
