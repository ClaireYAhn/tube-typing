import { describe, expect, it } from 'vitest'
import { sharedGraph } from '../routing/graph.ts'
import { findJourney, stationsOf } from '../routing/search.ts'
import { dailyRecordKey, dateKey, describeJourney, journeyFor, todaysJourney } from './daily.ts'

const graph = sharedGraph()

/** Three months, which is enough to catch a constraint that only usually holds. */
const DAYS = Array.from({ length: 84 }, (_, i) => {
  const at = new Date(Date.UTC(2026, 8, 1 + i))
  return at.toISOString().slice(0, 10)
})

describe('dateKey', () => {
  it('is the UTC date, so everyone gets the same route', () => {
    // The same instant is the 24th in London and the 25th in Seoul. A local date would
    // split friends onto different routes and leave them nothing to compare.
    expect(dateKey(new Date('2026-08-24T23:30:00Z'))).toBe('2026-08-24')
    expect(dateKey(new Date('2026-08-25T00:30:00Z'))).toBe('2026-08-25')
  })
})

describe('journeyFor', () => {
  it('is the same route every time for a given date', () => {
    const a = journeyFor('2026-09-01', graph)
    const b = journeyFor('2026-09-01', graph)
    expect(a.route).toEqual(b.route)
  })

  it('gives different days different routes', () => {
    // Not literally every day forever: sampling a finite set of acceptable routes will
    // collide eventually, and over a year it does so exactly once, 63 days apart. What
    // matters is that a player never meets the same route twice in a stretch they would
    // remember.
    const routes = DAYS.map((date) => journeyFor(date, graph).route.join('>'))
    expect(new Set(routes).size).toBeGreaterThanOrEqual(routes.length - 1)

    for (let i = 1; i < routes.length; i++) {
      for (let back = 1; back <= Math.min(14, i); back++) {
        expect(routes[i], `${DAYS[i]} repeats ${DAYS[i - back]}`).not.toBe(routes[i - back])
      }
    }
  })

  it('keeps every route inside the playable band', () => {
    for (const date of DAYS) {
      const j = journeyFor(date, graph)
      // A minute of typing, near enough, at thirteen characters a station.
      expect(j.route.length, `${date} stations`).toBeGreaterThanOrEqual(15)
      expect(j.route.length, `${date} stations`).toBeLessThanOrEqual(25)
      expect(j.transfers, `${date} changes`).toBeGreaterThanOrEqual(1)
      expect(j.transfers, `${date} changes`).toBeLessThanOrEqual(3)
    }
  })

  it('never changes line just to ride one stop', () => {
    // A real route, and the cheapest one, but it reads as a bug to anyone who knows the
    // network and makes a mess of the coloured map.
    for (const date of DAYS) {
      for (const leg of journeyFor(date, graph).legs) {
        expect(leg.stops, `${date} ${leg.lineId}`).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('describes a route that really connects its two ends', () => {
    for (const date of DAYS) {
      const j = journeyFor(date, graph)
      expect(j.route[0], date).toBe(j.from)
      expect(j.route[j.route.length - 1], date).toBe(j.to)

      const found = findJourney(graph, j.from, j.to)
      expect(found, date).not.toBeNull()
      expect(stationsOf(found!), date).toEqual(j.route)
    }
  })

  it('never repeats a station within a route', () => {
    // Typing the same name twice in one run would look like a bug in the queue.
    for (const date of DAYS) {
      const j = journeyFor(date, graph)
      expect(new Set(j.route).size, date).toBe(j.route.length)
    }
  })

  it('gives one segment colour per hop', () => {
    for (const date of DAYS) {
      const j = journeyFor(date, graph)
      expect(j.segmentLines.length, date).toBe(j.route.length - 1)
    }
  })

  it('lays the legs end to end', () => {
    for (const date of DAYS) {
      const j = journeyFor(date, graph)
      expect(j.legs.length, date).toBe(j.transfers + 1)
      for (let i = 1; i < j.legs.length; i++) {
        expect(j.legs[i].from, `${date} leg ${i}`).toBe(j.legs[i - 1].to)
      }
    }
  })

  it('carries the date it was generated for', () => {
    expect(journeyFor('2026-09-01', graph).date).toBe('2026-09-01')
  })
})

describe('describeJourney', () => {
  it('reads as a journey, in names rather than ids', () => {
    const j = journeyFor('2026-09-01', graph)
    expect(describeJourney(j)).toMatch(/^.+ → .+$/)
    expect(describeJourney(j)).not.toContain(j.from)
  })
})

describe('dailyRecordKey', () => {
  it('is scoped to the day, so each route gets its own board', () => {
    expect(dailyRecordKey(journeyFor('2026-09-01', graph))).toBe('daily:2026-09-01')
    expect(dailyRecordKey(journeyFor('2026-09-02', graph))).not.toBe('daily:2026-09-01')
  })
})

describe('todaysJourney', () => {
  it('is the journey for today', () => {
    expect(todaysJourney(graph).date).toBe(dateKey())
  })
})
