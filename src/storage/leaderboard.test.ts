import { beforeEach, describe, expect, it } from 'vitest'
import {
  BOARD_SIZE,
  boardKey,
  cleanName,
  compareScores,
  localLeaderboard,
  rankFor,
  type ScoreEntry,
} from './leaderboard.ts'

/** A minimal localStorage, since these tests run without a DOM. */
function installStorage() {
  const map = new Map<string, string>()
  const stub = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  }
  ;(globalThis as unknown as { localStorage: typeof stub }).localStorage = stub
  return map
}

function score(kpm: number, extra: Partial<ScoreEntry> = {}): ScoreEntry {
  return {
    name: 'Claire',
    kpm,
    wpm: kpm / 5,
    accuracy: 1,
    stations: 20,
    durationMs: 60_000,
    achievedAt: '2026-08-24T12:00:00.000Z',
    ...extra,
  }
}

const BOARD = boardKey('random-sprint', 'lenient')

beforeEach(() => {
  installStorage()
})

describe('boardKey', () => {
  it('keeps the match modes apart', () => {
    // A strict run types every apostrophe, so it is not the same contest.
    expect(boardKey('random-sprint', 'lenient')).not.toBe(boardKey('random-sprint', 'strict'))
  })
})

describe('compareScores', () => {
  it('puts the higher KPM first', () => {
    expect([score(100), score(300), score(200)].sort(compareScores).map((s) => s.kpm)).toEqual([
      300, 200, 100,
    ])
  })

  it('breaks a KPM tie on accuracy', () => {
    const sloppy = score(200, { accuracy: 0.9, name: 'sloppy' })
    const clean = score(200, { accuracy: 0.99, name: 'clean' })
    expect([sloppy, clean].sort(compareScores)[0].name).toBe('clean')
  })

  it('breaks a full tie in favour of whoever got there first', () => {
    const first = score(200, { name: 'first', achievedAt: '2026-01-01T00:00:00.000Z' })
    const second = score(200, { name: 'second', achievedAt: '2026-06-01T00:00:00.000Z' })
    expect([second, first].sort(compareScores).map((s) => s.name)).toEqual(['first', 'second'])
  })
})

describe('cleanName', () => {
  it('trims to the maximum length', () => {
    expect(cleanName('Claireeeeeeeeeeeeeeeeee')).toHaveLength(12)
  })

  it('collapses whitespace and strips control characters', () => {
    expect(cleanName('  Claire\n\tY   Ahn  ')).toBe('Claire Y Ahn')
  })

  it('falls back rather than storing an empty name', () => {
    expect(cleanName('   ')).toBe('Anon')
    expect(cleanName('')).toBe('Anon')
  })
})

describe('rankFor', () => {
  it('reports where a score would land', () => {
    const board = [score(300), score(200), score(100)]
    expect(rankFor(board, score(250))).toBe(2)
    expect(rankFor(board, score(400))).toBe(1)
    expect(rankFor(board, score(50))).toBe(4)
  })

  it('returns 0 for a score that misses a full board', () => {
    const full = Array.from({ length: BOARD_SIZE }, (_, i) => score(500 - i))
    expect(rankFor(full, score(1))).toBe(0)
    expect(rankFor(full, score(1000))).toBe(1)
  })
})

describe('localLeaderboard', () => {
  it('starts empty', async () => {
    expect(await localLeaderboard.top(BOARD)).toEqual([])
  })

  it('stores a submission and reports its rank', async () => {
    const result = await localLeaderboard.submit(BOARD, score(200, { name: 'Claire' }))
    expect(result).toMatchObject({ rank: 1, placed: true })
    expect(result.board).toHaveLength(1)
    expect(await localLeaderboard.top(BOARD)).toHaveLength(1)
  })

  it('orders the board and reports the right rank for a later entry', async () => {
    await localLeaderboard.submit(BOARD, score(300, { name: 'fast' }))
    await localLeaderboard.submit(BOARD, score(100, { name: 'slow' }))
    const result = await localLeaderboard.submit(BOARD, score(200, { name: 'middle' }))

    expect(result.rank).toBe(2)
    expect(result.board.map((s) => s.name)).toEqual(['fast', 'middle', 'slow'])
  })

  it('keeps only the top entries and drops the slowest', async () => {
    for (let i = 0; i < BOARD_SIZE + 5; i++) {
      await localLeaderboard.submit(BOARD, score(100 + i, { name: `p${i}` }))
    }
    const board = await localLeaderboard.top(BOARD)
    expect(board).toHaveLength(BOARD_SIZE)
    expect(board[0].kpm).toBe(100 + BOARD_SIZE + 4)
    // The five slowest fell off.
    expect(board.some((s) => s.name === 'p0')).toBe(false)
  })

  it('reports placed: false when a full board rejects the score', async () => {
    for (let i = 0; i < BOARD_SIZE; i++) {
      await localLeaderboard.submit(BOARD, score(500 + i))
    }
    const result = await localLeaderboard.submit(BOARD, score(1, { name: 'nope' }))
    expect(result.placed).toBe(false)
    expect(result.rank).toBe(0)
    expect(result.board.some((s) => s.name === 'nope')).toBe(false)
  })

  it('ranks a tie behind the entry that was already there', async () => {
    // Otherwise equalling the top score would take first place off whoever set it.
    await localLeaderboard.submit(
      BOARD,
      score(200, { name: 'held', achievedAt: '2026-01-01T00:00:00.000Z' }),
    )
    const result = await localLeaderboard.submit(
      BOARD,
      score(200, { name: 'tied', achievedAt: '2026-06-01T00:00:00.000Z' }),
    )
    expect(result.rank).toBe(2)
    expect(result.board[0].name).toBe('held')
  })

  it('cleans the name on the way in', async () => {
    const result = await localLeaderboard.submit(BOARD, score(200, { name: '  ' }))
    expect(result.board[0].name).toBe('Anon')
  })

  it('keeps boards independent', async () => {
    await localLeaderboard.submit(BOARD, score(200))
    expect(await localLeaderboard.top(boardKey('random-sprint', 'strict'))).toEqual([])
    expect(await localLeaderboard.top(boardKey('circle-loop', 'lenient'))).toEqual([])
  })

  it('clears one board without touching the others', async () => {
    const other = boardKey('circle-loop', 'lenient')
    await localLeaderboard.submit(BOARD, score(200))
    await localLeaderboard.submit(other, score(200))

    await localLeaderboard.clear(BOARD)
    expect(await localLeaderboard.top(BOARD)).toEqual([])
    expect(await localLeaderboard.top(other)).toHaveLength(1)
  })

  it('survives junk in storage rather than throwing', async () => {
    localStorage.setItem('tube-typing:scores', '{ not json')
    expect(await localLeaderboard.top(BOARD)).toEqual([])
  })

  it('discards a board written by an older schema', async () => {
    localStorage.setItem(
      'tube-typing:scores',
      JSON.stringify({ version: 0, boards: { [BOARD]: [score(999)] } }),
    )
    expect(await localLeaderboard.top(BOARD)).toEqual([])
  })
})
