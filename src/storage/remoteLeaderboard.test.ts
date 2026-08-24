import { afterEach, describe, expect, it, vi } from 'vitest'
import { BoardUnavailable, remoteLeaderboard } from './remoteLeaderboard.ts'
import type { ScoreEntry } from './leaderboard.ts'

function entry(over: Partial<ScoreEntry> = {}): ScoreEntry {
  return {
    name: 'Claire',
    kpm: 700,
    wpm: 140,
    accuracy: 0.98,
    stations: 55,
    durationMs: 60_000,
    achievedAt: '2026-08-24T12:00:00.000Z',
    ...over,
  }
}

/** Stands in for the network. `body` is what the endpoint returns. */
function respondWith(body: unknown, status = 200, contentType = 'application/json') {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    contentType === 'application/json'
      ? new Response(JSON.stringify(body), { status, headers: { 'Content-Type': contentType } })
      : new Response(String(body), { status, headers: { 'Content-Type': contentType } }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('remoteLeaderboard.top', () => {
  it('returns the board the endpoint sends', async () => {
    respondWith({ available: true, board: [entry({ name: 'Ada' })] })
    const board = await remoteLeaderboard.top('random-sprint:lenient')
    expect(board.map((e) => e.name)).toEqual(['Ada'])
  })

  it('asks for the board it was given', async () => {
    const fetchMock = respondWith({ available: true, board: [] })
    await remoteLeaderboard.top('random-sprint:strict')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('board=random-sprint%3Astrict')
  })

  it('applies a limit', async () => {
    respondWith({
      available: true,
      board: [entry({ kpm: 900 }), entry({ kpm: 800 }), entry({ kpm: 700 })],
    })
    expect(await remoteLeaderboard.top('random-sprint:lenient', 2)).toHaveLength(2)
  })

  it('reports an unconfigured board as unavailable, not as an error', async () => {
    respondWith({ available: false, reason: 'The shared board is not configured.' }, 503)
    await expect(remoteLeaderboard.top('random-sprint:lenient')).rejects.toBeInstanceOf(
      BoardUnavailable,
    )
  })

  it('treats a network failure as unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline')
      }),
    )
    await expect(remoteLeaderboard.top('random-sprint:lenient')).rejects.toBeInstanceOf(
      BoardUnavailable,
    )
  })

  it('treats an HTML response as unavailable', async () => {
    // `vite dev` answers unknown paths with index.html, so this is the everyday case
    // when running the front end without the functions alongside it.
    respondWith('<!doctype html><title>Tube Typing</title>', 200, 'text/html')
    await expect(remoteLeaderboard.top('random-sprint:lenient')).rejects.toBeInstanceOf(
      BoardUnavailable,
    )
  })
})

describe('remoteLeaderboard.submit', () => {
  it('posts the board and entry, and returns the rank', async () => {
    const fetchMock = respondWith({
      available: true,
      board: [entry({ name: 'Ada' }), entry({ name: 'Claire' })],
      rank: 2,
      placed: true,
    })

    const result = await remoteLeaderboard.submit('random-sprint:lenient', entry())

    expect(result).toMatchObject({ rank: 2, placed: true })
    expect(result.board).toHaveLength(2)

    const init = fetchMock.mock.calls[0]?.[1]
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toMatchObject({
      board: 'random-sprint:lenient',
      entry: { name: 'Claire' },
    })
  })

  it('surfaces a rejected score as a real error', async () => {
    // A refused submission is something the player can act on, so it is not the same
    // thing as the board being missing.
    respondWith({ error: 'kpm does not match the stations typed in that time' }, 422)
    await expect(remoteLeaderboard.submit('random-sprint:lenient', entry())).rejects.toThrow(
      /does not match/,
    )
  })

  it('surfaces rate limiting', async () => {
    respondWith({ error: 'too many submissions, try again later' }, 429)
    await expect(remoteLeaderboard.submit('random-sprint:lenient', entry())).rejects.toThrow(
      /too many/,
    )
  })
})

describe('remoteLeaderboard.clear', () => {
  it('refuses, because wiping a shared table from a browser is not a feature', async () => {
    await expect(remoteLeaderboard.clear('random-sprint:lenient')).rejects.toThrow()
  })
})
