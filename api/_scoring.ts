/**
 * Score types and rules, shared by the browser and the `api/scores` function.
 *
 * **This file lives under `api/` for one reason: Vercel's Edge bundler will not follow an
 * import out of the function's own directory.** Putting it in `src/` and importing it
 * across failed the deployment with "referencing unsupported modules", and the front end
 * has no such restriction, so the shared code lives on the side that does. The leading
 * underscore keeps Vercel from treating it as an endpoint.
 *
 * Both sides importing the same file is the point. Two copies of a rule is two rules, and
 * the one that drifts is always the one nobody is looking at.
 */

export interface ScoreEntry {
  name: string
  kpm: number
  wpm: number
  accuracy: number
  stations: number
  durationMs: number
  achievedAt: string
}

/**
 * Ranks two scores. KPM first, since that is the score the game is actually about.
 *
 * Accuracy breaks ties, which matters more than it looks: in a fixed-length sprint two
 * players often finish on the same round number of keys, and rewarding the cleaner run is
 * the right call. An earlier timestamp breaks the remainder, so holding a place means
 * someone has to genuinely beat you rather than merely equal you.
 *
 * Used by both boards, so the local table and the shared one order identically.
 */
export function compareScores(a: ScoreEntry, b: ScoreEntry): number {
  if (a.kpm !== b.kpm) return b.kpm - a.kpm
  if (a.accuracy !== b.accuracy) return b.accuracy - a.accuracy
  return a.achievedAt.localeCompare(b.achievedAt)
}

/** Fastest sustained typing on record is around 216 wpm. This is well clear of it. */
export const MAX_KPM = 1400
export const MAX_STATIONS = 400
export const MIN_DURATION_MS = 3_000
export const MAX_DURATION_MS = 30 * 60_000

/**
 * Mean station name length across the network, near enough. Used to sanity-check a claimed
 * speed against the work it claims to have done: "five stations at 5000 KPM" is not a fast
 * run, it is a typo or a forgery.
 */
const MEAN_NAME_LENGTH = 13

/**
 * How far the claimed speed may sit from the speed implied by stations and time.
 *
 * Wide on purpose. Lenient mode skips punctuation, station names vary from Bank to
 * Heathrow Terminals 2 & 3, and a short run has a lot of variance. The band only has to
 * be tight enough to catch a number that was never typed at all.
 */
const IMPLIED_LOW = 0.25
const IMPLIED_HIGH = 4

export interface SubmittedScore {
  name: string
  kpm: number
  wpm: number
  accuracy: number
  stations: number
  durationMs: number
}

export type Validation = { ok: true } | { ok: false; reason: string }

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function validateScore(score: Partial<SubmittedScore>): Validation {
  if (typeof score.name !== 'string') return { ok: false, reason: 'name must be a string' }

  for (const field of ['kpm', 'wpm', 'accuracy', 'stations', 'durationMs'] as const) {
    if (!finite(score[field])) return { ok: false, reason: `${field} must be a number` }
  }

  const { kpm, accuracy, stations, durationMs } = score as SubmittedScore

  if (kpm <= 0 || kpm > MAX_KPM) return { ok: false, reason: 'kpm out of range' }
  if (accuracy < 0 || accuracy > 1) return { ok: false, reason: 'accuracy out of range' }
  if (stations <= 0 || stations > MAX_STATIONS) return { ok: false, reason: 'stations out of range' }
  if (durationMs < MIN_DURATION_MS || durationMs > MAX_DURATION_MS) {
    return { ok: false, reason: 'duration out of range' }
  }

  const minutes = durationMs / 60_000
  const implied = (stations * MEAN_NAME_LENGTH) / minutes
  const ratio = kpm / implied
  if (ratio < IMPLIED_LOW || ratio > IMPLIED_HIGH) {
    return { ok: false, reason: 'kpm does not match the stations typed in that time' }
  }

  return { ok: true }
}

/** Fixed boards the API will accept. An open key space would let anyone create tables. */
export const ALLOWED_BOARDS = new Set([
  'random-sprint:lenient',
  'random-sprint:strict',
  'circle-loop:lenient',
  'circle-loop:strict',
])

/**
 * The daily journey gets a board per date, which cannot be enumerated ahead of time.
 * Matching the shape instead keeps the key space bounded in practice: one key per day per
 * match mode, and `DAILY_BOARD_TTL_SECONDS` clears them out again.
 */
const DAILY_BOARD = /^daily:\d{4}-\d{2}-\d{2}:(lenient|strict)$/

/** Daily boards are set to expire, so the store does not grow a key a day forever. */
export const DAILY_BOARD_TTL_SECONDS = 60 * 60 * 24 * 60

export function isDailyBoard(board: string): boolean {
  return DAILY_BOARD.test(board)
}

export function isAllowedBoard(board: unknown): board is string {
  if (typeof board !== 'string') return false
  return ALLOWED_BOARDS.has(board) || isDailyBoard(board)
}
