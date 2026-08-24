import { describe, expect, it } from 'vitest'
import { allStations, normaliseForSearch } from './network.ts'

describe('normaliseForSearch', () => {
  it('lets a searcher skip punctuation', () => {
    expect(normaliseForSearch("King's Cross St Pancras")).toBe('kingscrossstpancras')
    expect(normaliseForSearch('Harrow-on-the-Hill')).toBe('harrowonthehill')
    expect(normaliseForSearch('Kensington (Olympia)')).toBe('kensingtonolympia')
  })

  it('writes out the ampersand, as people type it', () => {
    expect(normaliseForSearch('Heathrow Terminals 2 & 3')).toBe('heathrowterminals2and3')
    expect(normaliseForSearch('Elephant & Castle')).toBe('elephantandcastle')
  })

  it('finds the stations a plain substring search would miss', () => {
    const find = (q: string) =>
      allStations.filter((s) => normaliseForSearch(s.name).includes(normaliseForSearch(q)))

    expect(find('kings').map((s) => s.name)).toContain("King's Cross St Pancras")
    expect(find('st pauls').map((s) => s.name)).toContain("St Paul's")
    expect(find('elephant and castle').map((s) => s.name)).toContain('Elephant & Castle')
  })
})
