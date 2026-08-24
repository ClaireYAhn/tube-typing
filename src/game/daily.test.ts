import { describe, expect, it } from 'vitest'
import { sharedGraph } from '../routing/graph.ts'
import { findJourney } from '../routing/search.ts'
import {
  dateKey,
  describePuzzle,
  guessBudget,
  puzzleFor,
  todaysPuzzle,
  GUESS_MARGIN,
} from './daily.ts'

const graph = sharedGraph()

/** A month's worth, which is enough to catch a constraint that only usually holds. */
const MONTH = Array.from({ length: 31 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`)

describe('dateKey', () => {
  it('is the UTC date, so everyone gets the same puzzle', () => {
    // Late evening in London on the 24th is still the 24th in UTC; the same instant is
    // the 25th in Seoul. A local date would split friends onto different puzzles.
    expect(dateKey(new Date('2026-08-24T23:30:00Z'))).toBe('2026-08-24')
    expect(dateKey(new Date('2026-08-25T00:30:00Z'))).toBe('2026-08-25')
  })
})

describe('puzzleFor', () => {
  it('is the same puzzle every time for a given date', () => {
    const a = puzzleFor('2026-09-01', graph)
    const b = puzzleFor('2026-09-01', graph)
    expect({ from: a.from, to: a.to }).toEqual({ from: b.from, to: b.to })
  })

  it('gives different days different puzzles', () => {
    const pairs = MONTH.map((date) => {
      const p = puzzleFor(date, graph)
      return `${p.from}>${p.to}`
    })
    // Not a hard guarantee of no repeat ever, but a month of identical puzzles would
    // mean the seed is not reaching the generator.
    expect(new Set(pairs).size).toBe(pairs.length)
  })

  it('never picks a station as its own destination', () => {
    for (const date of MONTH) {
      const p = puzzleFor(date, graph)
      expect(p.from, date).not.toBe(p.to)
    }
  })

  it('always produces a solvable journey', () => {
    for (const date of MONTH) {
      const p = puzzleFor(date, graph)
      expect(findJourney(graph, p.from, p.to), date).not.toBeNull()
    }
  })

  it('keeps every puzzle inside the playable band', () => {
    for (const date of MONTH) {
      const p = puzzleFor(date, graph)
      // Long enough to be a question, short enough not to be a typing chore.
      expect(p.toName, `${date} names`).toBeGreaterThanOrEqual(4)
      expect(p.toName, `${date} names`).toBeLessThanOrEqual(11)
      // At least one change, so it asks how the network fits together rather than
      // asking you to read one line in order.
      expect(p.transfers, `${date} changes`).toBeGreaterThanOrEqual(1)
      expect(p.transfers, `${date} changes`).toBeLessThanOrEqual(2)
    }
  })

  it('reports a route that starts and ends where it says', () => {
    for (const date of MONTH) {
      const p = puzzleFor(date, graph)
      expect(p.route[0], date).toBe(p.from)
      expect(p.route[p.route.length - 1], date).toBe(p.to)
      expect(p.toName, date).toBe(p.route.length - 2)
    }
  })

  it('carries the date it was generated for', () => {
    expect(puzzleFor('2026-09-01', graph).date).toBe('2026-09-01')
  })
})

describe('guessBudget', () => {
  it('is the optimal count plus a margin', () => {
    const p = puzzleFor('2026-09-01', graph)
    expect(guessBudget(p)).toBe(p.toName + GUESS_MARGIN)
  })

  it('always leaves room to be wrong more than once', () => {
    for (const date of MONTH) {
      const p = puzzleFor(date, graph)
      expect(guessBudget(p) - p.toName, date).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('describePuzzle', () => {
  it('reads as a journey', () => {
    const p = puzzleFor('2026-09-01', graph)
    expect(describePuzzle(p)).toMatch(/^.+ → .+$/)
    expect(describePuzzle(p)).not.toContain(p.from) // names, not ids
  })
})

describe('todaysPuzzle', () => {
  it('is the puzzle for today', () => {
    expect(todaysPuzzle(graph).date).toBe(dateKey())
  })
})
