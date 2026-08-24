/**
 * The high-score table.
 *
 * Modelled on an arcade cabinet: finish a run, and if it made the table you type a name
 * onto it. The board is shown on the menu, so the first thing you see is what there is to
 * beat.
 *
 * **Every method is async even though this implementation only touches localStorage.**
 * That is the whole point of the interface. A shared online board is the obvious next
 * step, and when it arrives it replaces `localLeaderboard` and nothing that calls this
 * has to change: the components already handle a pending state and a rejected promise.
 * Writing the local version synchronously would have meant rewriting every call site to
 * make it await later.
 *
 * Boards are keyed by run *and* match mode. A lenient sprint and a strict sprint are not
 * comparable, so they never share a table.
 */

import type { MatchMode } from '../engine/matcher.ts'

const KEY = 'tube-typing:scores'
const VERSION = 1

/** How many entries a board keeps. Beyond this the slowest fall off. */
export const BOARD_SIZE = 10

/** Longest name accepted. Arcade-short, and it has to fit the table on the menu. */
export const MAX_NAME = 12

export interface ScoreEntry {
  name: string
  kpm: number
  wpm: number
  accuracy: number
  stations: number
  durationMs: number
  achievedAt: string
}

export interface SubmitResult {
  /** 1-based position, or 0 when the score did not make the table. */
  rank: number
  placed: boolean
  /** The board after the submission, so the caller can render without re-reading. */
  board: ScoreEntry[]
}

export interface LeaderboardStore {
  top(board: string, limit?: number): Promise<ScoreEntry[]>
  submit(board: string, entry: ScoreEntry): Promise<SubmitResult>
  clear(board: string): Promise<void>
}

/** The board a run belongs to. Both parts matter; see the note on match modes above. */
export function boardKey(recordKey: string, matchMode: MatchMode): string {
  return `${recordKey}:${matchMode}`
}

/**
 * Ranks two scores. KPM first, since that is the score the game is actually about.
 *
 * Accuracy breaks ties, which matters more than it looks: in a fixed-length sprint two
 * players often finish on the same round number of keys, and rewarding the cleaner run is
 * the right call. An earlier timestamp breaks the remainder, so holding a place means
 * someone has to genuinely beat you rather than merely equal you.
 */
export function compareScores(a: ScoreEntry, b: ScoreEntry): number {
  if (a.kpm !== b.kpm) return b.kpm - a.kpm
  if (a.accuracy !== b.accuracy) return b.accuracy - a.accuracy
  return a.achievedAt.localeCompare(b.achievedAt)
}

/**
 * Trims a name to something that will fit and cannot break the table.
 *
 * Control characters become spaces rather than being deleted. Deleting them welds the
 * words either side together, so a pasted "Claire\n\tY Ahn" came out as "ClaireY Ahn".
 * Turning them into whitespace first and collapsing afterwards gets the intended name.
 */
export function cleanName(raw: string): string {
  const trimmed = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME)
    .trim()
  return trimmed.length > 0 ? trimmed : 'Anon'
}

/** Where a score would land on a board, 1-based. `0` means it would not place. */
export function rankFor(board: readonly ScoreEntry[], entry: ScoreEntry): number {
  const above = board.filter((existing) => compareScores(existing, entry) < 0).length
  const rank = above + 1
  return rank <= BOARD_SIZE ? rank : 0
}

// --- localStorage implementation --------------------------------------------

type Stored = { version: number; boards: Record<string, ScoreEntry[]> }

function read(): Stored {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { version: VERSION, boards: {} }
    const parsed = JSON.parse(raw) as Partial<Stored>
    if (parsed.version !== VERSION) return { version: VERSION, boards: {} }
    return { version: VERSION, boards: parsed.boards ?? {} }
  } catch {
    // Private browsing, a quota error, or hand-edited junk. A lost table is a far
    // smaller problem than a menu that will not render.
    return { version: VERSION, boards: {} }
  }
}

function write(stored: Stored): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(stored))
  } catch {
    /* The run still counted; it just will not be remembered. */
  }
}

export const localLeaderboard: LeaderboardStore = {
  async top(board, limit = BOARD_SIZE) {
    const entries = read().boards[board] ?? []
    return [...entries].sort(compareScores).slice(0, limit)
  },

  async submit(board, entry) {
    const stored = read()
    const clean: ScoreEntry = { ...entry, name: cleanName(entry.name) }
    const next = [...(stored.boards[board] ?? []), clean]
      .sort(compareScores)
      .slice(0, BOARD_SIZE)

    stored.boards[board] = next
    write(stored)

    // Identity, not equality: two runs can tie on every number, and the one just
    // submitted is the one whose rank we want to report.
    const index = next.indexOf(clean)
    return { rank: index + 1, placed: index >= 0, board: next }
  },

  async clear(board) {
    const stored = read()
    delete stored.boards[board]
    write(stored)
  },
}

export function clearAllScores(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
