import { describe, expect, it } from 'vitest'
import { circleLoop, getStations } from '../data/network.ts'
import type { Station } from '../data/types.ts'
import {
  createSession,
  elapsedMs,
  remainingMs,
  runProgress,
  sessionReducer,
  troubleSpots,
  type SessionAction,
  type SessionConfig,
  type SessionState,
} from './session.ts'

const station = (id: string, name: string): Station => ({
  id,
  name,
  lines: ['victoria'],
  zone: '1',
  lat: 0,
  lon: 0,
  naptanIds: [],
})

const QUEUE = [station('bank', 'Bank'), station('oval', 'Oval'), station('angel', 'Angel')]

function session(overrides: Partial<SessionConfig> = {}): SessionState {
  return createSession({ queue: QUEUE, matchMode: 'lenient', timeLimitMs: null, ...overrides })
}

function drive(state: SessionState, actions: SessionAction[]): SessionState {
  return actions.reduce(sessionReducer, state)
}

/** Types `text` one key at a time, one millisecond apart. */
function type(state: SessionState, text: string, startAt = 0): SessionState {
  return drive(
    state,
    text.split('').map((key, i) => ({ type: 'key' as const, key, at: startAt + i + 1 })),
  )
}

describe('session lifecycle', () => {
  it('ignores keys until started', () => {
    const state = type(session(), 'bank')
    expect(state.status).toBe('ready')
    expect(state.correctKeys).toBe(0)
  })

  it('advances through the queue and finishes', () => {
    let state = sessionReducer(session(), { type: 'start', at: 0 })
    expect(state.status).toBe('running')

    state = type(state, 'bank')
    expect(state.position).toBe(1)
    expect(state.match.target).toBe('Oval')

    state = type(state, 'oval', 100)
    state = type(state, 'angel', 200)

    expect(state.status).toBe('finished')
    expect(state.finishReason).toBe('completed')
    expect(state.attempts.map((a) => a.name)).toEqual(['Bank', 'Oval', 'Angel'])
  })

  it('records per-station mistakes without advancing on a wrong key', () => {
    let state = sessionReducer(session(), { type: 'start', at: 0 })
    state = type(state, 'bxxank')

    expect(state.errors).toBe(2)
    expect(state.attempts[0].errors).toBe(2)
    expect(state.position).toBe(1)
    expect(troubleSpots(state, 5)[0].name).toBe('Bank')
  })

  it('times each station from when it appeared', () => {
    let state = sessionReducer(session(), { type: 'start', at: 1_000 })
    state = type(state, 'bank', 1_000) // keys land at 1001..1004
    expect(state.attempts[0].durationMs).toBe(4)

    state = type(state, 'oval', 5_000)
    expect(state.attempts[1].durationMs).toBe(5_004 - 1_004)
  })
})

describe('time limit', () => {
  const timed = () => session({ timeLimitMs: 1_000 })

  it('counts down and ends the run', () => {
    let state = sessionReducer(timed(), { type: 'start', at: 0 })
    expect(remainingMs(state)).toBe(1_000)

    state = sessionReducer(state, { type: 'tick', at: 400 })
    expect(remainingMs(state)).toBe(600)
    expect(state.status).toBe('running')

    state = sessionReducer(state, { type: 'tick', at: 1_000 })
    expect(state.status).toBe('finished')
    expect(state.finishReason).toBe('time-up')
  })

  it('banks a station finished on the final keystroke', () => {
    let state = sessionReducer(timed(), { type: 'start', at: 0 })
    state = drive(state, [
      { type: 'key', key: 'b', at: 996 },
      { type: 'key', key: 'a', at: 997 },
      { type: 'key', key: 'n', at: 998 },
      { type: 'key', key: 'k', at: 1_000 }, // completes exactly as time runs out
    ])

    expect(state.attempts).toHaveLength(1)
    expect(state.status).toBe('finished')
    expect(state.finishReason).toBe('time-up')
  })

  it('ignores keys once finished', () => {
    let state = sessionReducer(timed(), { type: 'start', at: 0 })
    state = sessionReducer(state, { type: 'tick', at: 2_000 })
    const after = type(state, 'bank', 2_000)
    expect(after.correctKeys).toBe(0)
    expect(after).toEqual(state)
  })

  it('has no limit for untimed modes', () => {
    const state = sessionReducer(session(), { type: 'start', at: 0 })
    expect(remainingMs(state)).toBeNull()
    expect(sessionReducer(state, { type: 'tick', at: 10 ** 9 }).status).toBe('running')
  })
})

describe('quitting', () => {
  it('keeps the stations already banked', () => {
    let state = sessionReducer(session(), { type: 'start', at: 0 })
    state = type(state, 'bank')
    state = sessionReducer(state, { type: 'quit', at: 500 })

    expect(state.status).toBe('finished')
    expect(state.finishReason).toBe('quit')
    expect(state.attempts).toHaveLength(1)
    expect(elapsedMs(state)).toBe(500)
  })
})

describe('progress', () => {
  it('blends completed stations with the current name', () => {
    let state = sessionReducer(session(), { type: 'start', at: 0 })
    expect(runProgress(state)).toBe(0)

    state = type(state, 'bank')
    expect(runProgress(state)).toBeCloseTo(1 / 3)

    state = type(state, 'ov', 100) // half of "Oval"
    expect(runProgress(state)).toBeCloseTo((1 + 0.5) / 3)
  })
})

describe('with real network data', () => {
  it('runs the Circle line loop end to end without a single mistake', () => {
    const loop = circleLoop()
    const queue = getStations(loop.stationIds)
    let state = createSession({ queue, matchMode: 'lenient', timeLimitMs: null })
    state = sessionReducer(state, { type: 'start', at: 0 })

    let clock = 0
    for (const station of queue) {
      state = type(state, station.name.toLowerCase(), clock)
      clock += station.name.length + 1
    }

    expect(state.status).toBe('finished')
    expect(state.finishReason).toBe('completed')
    expect(state.errors).toBe(0)
    expect(state.attempts).toHaveLength(loop.stationIds.length)
  })

  it('types a real interchange name', () => {
    const queue = getStations(['kings-cross-st-pancras', 'angel', 'oval'])
    let state = createSession({ queue, matchMode: 'lenient', timeLimitMs: null })
    state = sessionReducer(state, { type: 'start', at: 0 })

    state = type(state, 'kings cross st pancras')
    expect(state.errors).toBe(0)
    expect(state.position).toBe(1)
  })
})
