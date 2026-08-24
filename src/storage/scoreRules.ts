/**
 * What a submitted score is allowed to look like.
 *
 * **This does not stop cheating and cannot.** The score is computed in the browser, so
 * anyone with a console open can post whatever number they like, and no amount of
 * server-side checking changes that. What these rules do is keep the obvious nonsense off
 * the board, which for a game friends play is the whole of the problem worth solving.
 *
 * Imported by both the client and the API function on purpose. Two copies of a rule is
 * two rules, and the one that drifts is always the one nobody is looking at.
 */

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

/** Boards the API will accept. An open key space would let anyone create junk tables. */
export const ALLOWED_BOARDS = new Set([
  'random-sprint:lenient',
  'random-sprint:strict',
  'circle-loop:lenient',
  'circle-loop:strict',
])

export function isAllowedBoard(board: unknown): board is string {
  return typeof board === 'string' && ALLOWED_BOARDS.has(board)
}
