/**
 * The shared high score table.
 *
 * `GET  /api/scores?board=random-sprint:lenient` returns the top entries.
 * `POST /api/scores` with `{ board, entry }` adds one and returns the new table.
 *
 * Backed by a Redis sorted set per board, over Upstash's REST API. A sorted set is
 * exactly this data structure, so there is no schema and no migration: ZADD to submit,
 * ZREVRANGE to read, ZREMRANGEBYRANK to keep it bounded.
 *
 * Redis orders by the numeric score alone, which is KPM here. The finer ordering
 * (accuracy, then who got there first) is applied after reading, using the same
 * comparator the local board uses, so both tables break ties identically.
 *
 * With no credentials configured the endpoint reports itself unavailable rather than
 * failing. The client then runs on its local board alone, which is how the game worked
 * before this existed and is a much better outcome than a broken menu.
 */

/*
 * No `.ts` on the end of this specifier, unlike everywhere else in the project.
 *
 * Vercel's Edge bundler will not resolve an explicit `.ts` extension and fails the build
 * with "referencing unsupported modules". Extensionless resolves fine, and TypeScript is
 * happy either way under `moduleResolution: bundler`, so the odd one out lives here with
 * a note rather than in the style guide.
 */
import { compareScores, isAllowedBoard, validateScore, type ScoreEntry } from './_scoring'

export const config = { runtime: 'edge' }

/** Kept per board. Larger than the table shown, so ties still have material to sort. */
const KEEP = 100
const RETURN = 25

/** Submissions allowed from one address per hour. A friends-and-family sort of limit. */
const RATE_LIMIT = 30
const RATE_WINDOW_SECONDS = 3600

const MAX_BODY_BYTES = 2_000

function credentials(): { url: string; token: string } | null {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env
  // Vercel's Upstash integration has used both names; accept either rather than making
  // the deploy depend on which era of the dashboard set it up.
  const url = env?.KV_REST_API_URL ?? env?.UPSTASH_REDIS_REST_URL
  const token = env?.KV_REST_API_TOKEN ?? env?.UPSTASH_REDIS_REST_TOKEN
  return url && token ? { url: url.replace(/\/$/, ''), token } : null
}

type Command = (string | number)[]

async function redis(commands: Command[]): Promise<unknown[]> {
  const creds = credentials()
  if (!creds) throw new Error('no-credentials')

  const response = await fetch(`${creds.url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${creds.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  })

  if (!response.ok) {
    throw new Error(`redis ${response.status}`)
  }

  const payload = (await response.json()) as ({ result: unknown } | { error: string })[]
  return payload.map((item) => {
    if ('error' in item) throw new Error(item.error)
    return item.result
  })
}

function json(body: unknown, status = 200): Response {
  // 204 and 205 must not carry a body; constructing one with a body throws rather than
  // being quietly ignored, which took out the CORS preflight.
  const empty = status === 204 || status === 205
  return new Response(empty ? null : JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      // The board is public data and the site is served from one origin, but a preview
      // deployment is a different origin against the same store, so allow any reader.
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Cache-Control': 'no-store',
    },
  })
}

/** Reads a board back, applying the full ordering rather than Redis's score-only one. */
function parseBoard(members: unknown): ScoreEntry[] {
  if (!Array.isArray(members)) return []
  const entries: ScoreEntry[] = []
  for (const member of members) {
    if (typeof member !== 'string') continue
    try {
      entries.push(JSON.parse(member) as ScoreEntry)
    } catch {
      // A member that will not parse is somebody else's problem from a previous schema.
      continue
    }
  }
  return entries.sort(compareScores).slice(0, RETURN)
}

async function withinRateLimit(address: string): Promise<boolean> {
  const key = `ratelimit:${address}`
  // One round trip. `NX` sets the expiry only when the key has none, which is the same
  // thing as "only on the first hit of the window" without needing to read the counter
  // first and decide.
  const [count] = await redis([
    ['INCR', key],
    ['EXPIRE', key, RATE_WINDOW_SECONDS, 'NX'],
  ])
  return typeof count === 'number' && count <= RATE_LIMIT
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return json({}, 204)

  if (!credentials()) {
    // Not an error the player caused, and not one they can do anything about.
    return json({ available: false, reason: 'The shared board is not configured.' }, 503)
  }

  const url = new URL(request.url)

  try {
    if (request.method === 'GET') {
      const board = url.searchParams.get('board')
      if (!isAllowedBoard(board)) return json({ error: 'unknown board' }, 400)

      const [members] = await redis([['ZREVRANGE', `board:${board}`, 0, KEEP - 1]])
      return json({ available: true, board: parseBoard(members) })
    }

    if (request.method === 'POST') {
      const raw = await request.text()
      if (raw.length > MAX_BODY_BYTES) return json({ error: 'body too large' }, 413)

      let body: { board?: unknown; entry?: Partial<ScoreEntry> }
      try {
        body = JSON.parse(raw)
      } catch {
        return json({ error: 'invalid json' }, 400)
      }

      if (!isAllowedBoard(body.board)) return json({ error: 'unknown board' }, 400)

      const entry = body.entry
      if (!entry || typeof entry !== 'object') return json({ error: 'missing entry' }, 400)

      const check = validateScore(entry)
      if (!check.ok) return json({ error: check.reason }, 422)

      const address =
        request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
      if (!(await withinRateLimit(address))) {
        return json({ error: 'too many submissions, try again later' }, 429)
      }

      // Trust the server's clock rather than the browser's, so nobody can win a tie by
      // claiming to have played in 1970.
      const stored: ScoreEntry = {
        name: String(entry.name).slice(0, 12),
        kpm: entry.kpm as number,
        wpm: entry.wpm as number,
        accuracy: entry.accuracy as number,
        stations: entry.stations as number,
        durationMs: entry.durationMs as number,
        achievedAt: new Date().toISOString(),
      }
      const member = JSON.stringify(stored)
      const key = `board:${body.board}`

      const [, , members] = await redis([
        ['ZADD', key, Math.round(stored.kpm), member],
        // Sorted sets are ascending, so the slowest sit at the bottom. Dropping
        // everything below the last KEEP ranks is what bounds the key.
        ['ZREMRANGEBYRANK', key, 0, -(KEEP + 1)],
        ['ZREVRANGE', key, 0, KEEP - 1],
      ])

      const board = parseBoard(members)
      const rank = board.findIndex((e) => e.achievedAt === stored.achievedAt && e.name === stored.name)

      return json({ available: true, board, rank: rank + 1, placed: rank >= 0 })
    }

    return json({ error: 'method not allowed' }, 405)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown'
    if (message === 'no-credentials') {
      return json({ available: false, reason: 'The shared board is not configured.' }, 503)
    }
    return json({ available: false, reason: 'The shared board is unavailable.' }, 502)
  }
}
