/**
 * The shared board, over `/api/scores`.
 *
 * Implements the same `LeaderboardStore` interface as the local one, which is why this
 * file is short: the async shape was there from the start, so nothing that renders a
 * table or submits a score needed changing to accommodate it.
 *
 * `available` is the part worth reading carefully. A shared board can be missing for
 * reasons that are nobody's fault (no credentials configured, running `vite dev` with no
 * functions, an outage), and none of those should look like an error the player caused.
 * The store reports unavailability as a distinct state so the UI can say "local scores
 * only" instead of showing a failure.
 */

import type { LeaderboardStore, ScoreEntry, SubmitResult } from './leaderboard.ts'

const ENDPOINT = '/api/scores'

/** Long enough for a cold function, short enough that the menu is not held hostage. */
const TIMEOUT_MS = 6_000

export class BoardUnavailable extends Error {
  constructor(message = 'The shared board is unavailable.') {
    super(message)
    this.name = 'BoardUnavailable'
  }
}

async function call(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(path, { ...init, signal: controller.signal })
  } catch {
    // Offline, aborted, or no function behind the path at all.
    throw new BoardUnavailable()
  } finally {
    clearTimeout(timer)
  }

  // `vite dev` serves index.html for unknown paths, so a 200 full of HTML is the normal
  // way this fails in development. Parsing before trusting the status catches it.
  let payload: Record<string, unknown>
  try {
    payload = (await response.json()) as Record<string, unknown>
  } catch {
    throw new BoardUnavailable()
  }

  if (payload.available === false) {
    throw new BoardUnavailable(String(payload.reason ?? 'The shared board is unavailable.'))
  }
  if (!response.ok) {
    throw new Error(String(payload.error ?? `Request failed (${response.status})`))
  }
  return payload
}

export const remoteLeaderboard: LeaderboardStore = {
  async top(board, limit) {
    const payload = await call(`${ENDPOINT}?board=${encodeURIComponent(board)}`)
    const entries = (payload.board as ScoreEntry[]) ?? []
    return limit === undefined ? entries : entries.slice(0, limit)
  },

  async submit(board, entry): Promise<SubmitResult> {
    const payload = await call(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ board, entry }),
    })
    return {
      rank: Number(payload.rank ?? 0),
      placed: Boolean(payload.placed),
      board: (payload.board as ScoreEntry[]) ?? [],
    }
  },

  async clear() {
    // Deliberately not supported. Wiping a shared table from the client is not a feature.
    throw new Error('The shared board cannot be cleared from here.')
  },
}
