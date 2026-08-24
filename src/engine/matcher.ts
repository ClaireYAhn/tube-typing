/**
 * Keystroke matching for station names.
 *
 * London station names are already Latin, so unlike the Japanese and Korean originals
 * there is no romaji/hangul conversion layer to supply difficulty. What is left is
 * punctuation, and punctuation is where a typing game either feels good or feels unfair:
 * nobody wants to lose a run to the apostrophe in "King's Cross St Pancras".
 *
 * So there are two modes:
 *
 *   lenient — punctuation and spaces are optional. `Kings Cross St Pancras`,
 *             `King's Cross St Pancras` and `kingscrossstpancras` all count.
 *             `&` accepts either `&` or the word `and`.
 *   strict  — the name exactly as printed, case-insensitive only.
 *
 * A wrong key does NOT advance the cursor — it increments the error count and the player
 * simply tries again. This is how the Japanese typing games behave, and it means there is
 * no backspace to handle and no half-committed wrong state to render.
 *
 * Everything here is pure and immutable so React can hold the state directly.
 */

export type MatchMode = 'lenient' | 'strict'

/** Per-character render state. `skipped` means lenient mode let the player past it. */
export type CharStatus = 'pending' | 'correct' | 'skipped'

export interface MatchState {
  readonly target: string
  readonly mode: MatchMode
  /** Index of the next character to consume. Equals `target.length` when finished. */
  readonly index: number
  /** Progress through a multi-character expansion at `index` (only `&` → `and`). */
  readonly sub: number
  readonly chars: readonly CharStatus[]
  readonly correctKeys: number
  readonly errors: number
  readonly done: boolean
}

export interface KeyResult {
  readonly state: MatchState
  /** False when the key was rejected — the UI uses this to flash the error. */
  readonly ok: boolean
  /** True on the keystroke that finished the name. */
  readonly completed: boolean
}

/** Characters lenient mode will walk past if the player just types the next letter. */
const OPTIONAL_CHARS = new Set([' ', "'", '.', '-', '(', ')', ','])

/** `Harrow-on-the-Hill` should accept a space where the hyphen is. */
const ALSO_ACCEPTS: Record<string, string[]> = {
  '-': [' '],
  ' ': ['-'],
}

const AMPERSAND_WORD = 'and'

export function createMatch(target: string, mode: MatchMode): MatchState {
  const chars: CharStatus[] = target.split('').map(() => 'pending')
  const base: MatchState = {
    target,
    mode,
    index: 0,
    sub: 0,
    chars,
    correctKeys: 0,
    errors: 0,
    done: false,
  }
  // A name could in principle open with an optional character.
  return settle(base, 0, chars)
}

/**
 * Whether a key event should reach the matcher at all. Filters out modifiers,
 * arrows, F-keys and friends without swallowing ordinary punctuation.
 */
export function isTypeableKey(key: string): boolean {
  return key.length === 1 && key >= ' ' && key !== ''
}

export function applyKey(state: MatchState, rawKey: string): KeyResult {
  if (state.done) return { state, ok: true, completed: false }

  const key = rawKey.toLowerCase()
  const lenient = state.mode === 'lenient'

  // Mid-expansion: the player started spelling out "and" for an `&`.
  if (state.sub > 0) {
    if (key === AMPERSAND_WORD[state.sub]) {
      const sub = state.sub + 1
      if (sub < AMPERSAND_WORD.length) {
        return {
          state: { ...state, sub, correctKeys: state.correctKeys + 1 },
          ok: true,
          completed: false,
        }
      }
      return consume(state, state.index)
    }
    return reject(state)
  }

  // Try the cursor first, then any optional characters it could be hiding behind.
  const limit = lenient ? furthestReachable(state) : state.index
  for (let i = state.index; i <= limit && i < state.target.length; i++) {
    const target = state.target[i].toLowerCase()

    if (target === '&' && lenient && key === AMPERSAND_WORD[0]) {
      // Begin the `and` expansion; nothing is consumed until the "d" arrives.
      const chars = state.chars.slice()
      for (let s = state.index; s < i; s++) chars[s] = 'skipped'
      return {
        state: { ...state, index: i, sub: 1, chars, correctKeys: state.correctKeys + 1 },
        ok: true,
        completed: false,
      }
    }

    if (accepts(target, key, lenient)) {
      const chars = state.chars.slice()
      for (let s = state.index; s < i; s++) chars[s] = 'skipped'
      return consume({ ...state, chars }, i)
    }

    if (!lenient || !OPTIONAL_CHARS.has(state.target[i])) break
  }

  return reject(state)
}

/** Feeds a whole string through the matcher. Used by tests and for replaying input. */
export function applyKeys(state: MatchState, keys: string): MatchState {
  let current = state
  for (const key of keys) current = applyKey(current, key).state
  return current
}

export function progress(state: MatchState): number {
  if (state.target.length === 0) return 1
  return Math.min(1, state.index / state.target.length)
}

// --- internals --------------------------------------------------------------

function accepts(targetChar: string, key: string, lenient: boolean): boolean {
  if (targetChar === key) return true
  if (!lenient) return false
  return ALSO_ACCEPTS[targetChar]?.includes(key) ?? false
}

/**
 * The last index the cursor may jump to, given the run of optional characters
 * starting at the cursor. Stops at the first mandatory character.
 */
function furthestReachable(state: MatchState): number {
  let i = state.index
  while (i < state.target.length && OPTIONAL_CHARS.has(state.target[i])) i++
  return i
}

/** Marks `at` as correct, advances past it, then settles on the next real character. */
function consume(state: MatchState, at: number): KeyResult {
  const chars = state.chars.slice()
  chars[at] = 'correct'
  const next = settle(
    { ...state, sub: 0, correctKeys: state.correctKeys + 1 },
    at + 1,
    chars,
  )
  return { state: next, ok: true, completed: next.done && !state.done }
}

/**
 * Places the cursor at `from`, skipping trailing optional characters when nothing
 * mandatory remains — otherwise "Kensington (Olympia)" could never finish, since its
 * final `)` is optional and the player has no reason to type it.
 */
function settle(state: MatchState, from: number, chars: CharStatus[]): MatchState {
  let index = from
  if (state.mode === 'lenient') {
    let probe = index
    while (probe < state.target.length && OPTIONAL_CHARS.has(state.target[probe])) probe++
    if (probe >= state.target.length) {
      for (let s = index; s < state.target.length; s++) chars[s] = 'skipped'
      index = state.target.length
    }
  }
  return { ...state, index, sub: 0, chars, done: index >= state.target.length }
}

/**
 * Wrong key: count it and leave the cursor put. `sub` resets so a player who starts
 * spelling "and" and fumbles it can begin the ampersand again rather than being stuck
 * mid-expansion with only "n" accepted.
 */
function reject(state: MatchState): KeyResult {
  return { state: { ...state, sub: 0, errors: state.errors + 1 }, ok: false, completed: false }
}
