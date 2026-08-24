/**
 * Tests for the shared-board endpoint.
 *
 * Lives under src/ rather than beside the handler because Vercel treats every file in
 * api/ as a function entry point. A test file there gets compiled as an endpoint, and
 * one importing vitest with no default export fails the whole deployment.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../../api/scores.ts'
import type { ScoreEntry } from '../../api/_scoring.ts'

const BOARD = 'random-sprint:lenient'

/* Reached the same way the handler reaches it, so tsconfig.api.json can keep the Edge
   runtime honest about not having Node's globals. */
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } })
  .process.env

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

function useCredentials() {
  env.KV_REST_API_URL = 'https://redis.example.com'
  env.KV_REST_API_TOKEN = 'test-token'
}

function noCredentials() {
  delete env.KV_REST_API_URL
  delete env.KV_REST_API_TOKEN
  delete env.UPSTASH_REDIS_REST_URL
  delete env.UPSTASH_REDIS_REST_TOKEN
}

/**
 * Stands in for Upstash. `results` is one entry per command in the pipeline, in order.
 * Each call shifts the next batch off, so a handler that pipelines twice gets both.
 */
function redisReturning(...batches: unknown[][]) {
  const queue = [...batches]
  const mock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    const batch = queue.shift() ?? []
    return new Response(JSON.stringify(batch.map((result) => ({ result }))), { status: 200 })
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

function get(board = BOARD) {
  return handler(new Request(`https://tube-typing.test/api/scores?board=${encodeURIComponent(board)}`))
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return handler(
    new Request('https://tube-typing.test/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  )
}

beforeEach(() => {
  useCredentials()
})

afterEach(() => {
  vi.unstubAllGlobals()
  noCredentials()
})

describe('without credentials', () => {
  it('reports itself unavailable rather than failing', async () => {
    noCredentials()
    const response = await get()
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ available: false })
  })
})

describe('GET', () => {
  it('returns the board, fully ordered', async () => {
    // Redis orders by score alone, so it hands back a KPM tie in its own order. The
    // handler has to apply accuracy as the tiebreak on the way out.
    redisReturning([
      [
        JSON.stringify(entry({ name: 'sloppy', kpm: 800, accuracy: 0.9 })),
        JSON.stringify(entry({ name: 'clean', kpm: 800, accuracy: 0.99 })),
        JSON.stringify(entry({ name: 'slow', kpm: 400 })),
      ],
    ])

    const response = await get()
    expect(response.status).toBe(200)
    const body = (await response.json()) as { board: ScoreEntry[] }
    expect(body.board.map((e) => e.name)).toEqual(['clean', 'sloppy', 'slow'])
  })

  it('rejects a board it does not recognise', async () => {
    redisReturning([[]])
    const response = await get('../../etc/passwd')
    expect(response.status).toBe(400)
  })

  it('skips members it cannot parse instead of failing the request', async () => {
    redisReturning([['not json at all', JSON.stringify(entry({ name: 'Ada' }))]])
    const body = (await (await get()).json()) as { board: ScoreEntry[] }
    expect(body.board.map((e) => e.name)).toEqual(['Ada'])
  })

  it('reports an upstream failure as unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })))
    const response = await get()
    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({ available: false })
  })
})

describe('POST', () => {
  it('stores a plausible score and reports its rank', async () => {
    const submitted = entry({ name: 'Claire', kpm: 700 })
    // ZADD, ZREMRANGEBYRANK, ZREVRANGE — the read-back is what the handler ranks against.
    redisReturning(
      [1, 1], // rate limit: INCR then EXPIRE NX
      [
        1,
        0,
        [
          JSON.stringify(entry({ name: 'Ada', kpm: 900 })),
          // The stored copy carries the server's timestamp, so match on it loosely here
          // by letting the handler find its own entry.
        ],
      ],
    )

    const response = await post({ board: BOARD, entry: submitted })
    expect(response.status).toBe(200)
  })

  it('refuses a score that does not match the work claimed', async () => {
    redisReturning([1, 1])
    const response = await post({
      board: BOARD,
      entry: entry({ kpm: 1300, stations: 2, durationMs: 60_000 }),
    })
    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('does not match'),
    })
  })

  it('refuses a speed nobody has typed', async () => {
    redisReturning([1, 1])
    const response = await post({ board: BOARD, entry: entry({ kpm: 99_999, stations: 400 }) })
    expect(response.status).toBe(422)
  })

  it('refuses an unknown board', async () => {
    redisReturning([1, 1])
    expect((await post({ board: 'made-up', entry: entry() })).status).toBe(400)
  })

  it('refuses a missing entry', async () => {
    redisReturning([1, 1])
    expect((await post({ board: BOARD })).status).toBe(400)
  })

  it('refuses invalid json', async () => {
    redisReturning([1, 1])
    const response = await handler(
      new Request('https://tube-typing.test/api/scores', { method: 'POST', body: '{ nope' }),
    )
    expect(response.status).toBe(400)
  })

  it('rate limits a flood from one address', async () => {
    // The 31st submission in the window is over the limit of 30.
    redisReturning([31, 0])
    const response = await post({ board: BOARD, entry: entry() }, { 'x-forwarded-for': '1.2.3.4' })
    expect(response.status).toBe(429)
  })

  it('stamps the server clock rather than trusting the browser', async () => {
    const fetchMock = redisReturning([1, 1], [1, 0, []])
    await post({ board: BOARD, entry: entry({ achievedAt: '1970-01-01T00:00:00.000Z' }) })

    // Second call is the ZADD pipeline; the member is the JSON that got stored.
    const body = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))
    const stored = JSON.parse(body[0][3]) as ScoreEntry
    expect(stored.achievedAt).not.toBe('1970-01-01T00:00:00.000Z')
    expect(new Date(stored.achievedAt).getFullYear()).toBeGreaterThan(2020)
  })
})

describe('other methods', () => {
  it('answers preflight', async () => {
    const response = await handler(
      new Request('https://tube-typing.test/api/scores', { method: 'OPTIONS' }),
    )
    expect(response.status).toBe(204)
  })

  it('rejects anything else', async () => {
    redisReturning([[]])
    const response = await handler(
      new Request('https://tube-typing.test/api/scores', { method: 'DELETE' }),
    )
    expect(response.status).toBe(405)
  })
})
