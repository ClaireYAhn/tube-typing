import { describe, expect, it } from 'vitest'
import { applyKey, applyKeys, createMatch, type MatchMode } from './matcher.ts'

/** Types `input` against `target` and reports whether the name was completed cleanly. */
function run(target: string, input: string, mode: MatchMode) {
  const state = applyKeys(createMatch(target, mode), input)
  return { done: state.done, errors: state.errors, state }
}

const accepts = (target: string, input: string, mode: MatchMode) => {
  const { done, errors } = run(target, input, mode)
  return done && errors === 0
}

describe('lenient mode', () => {
  it('accepts a plain name typed exactly', () => {
    expect(accepts('Bank', 'bank', 'lenient')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(accepts('Bank', 'BANK', 'lenient')).toBe(true)
    expect(accepts('Bank', 'BaNk', 'lenient')).toBe(true)
  })

  describe('apostrophes are optional', () => {
    const cases: [string, string[]][] = [
      ["King's Cross St Pancras", ["king's cross st pancras", 'kings cross st pancras', 'kingscrossstpancras']],
      ["Earl's Court", ["earl's court", 'earls court', 'earlscourt']],
      ["St Paul's", ["st paul's", 'st pauls', 'stpauls']],
      ["Shepherd's Bush", ["shepherd's bush", 'shepherds bush']],
      ["St James's Park", ["st james's park", 'st jamess park']],
    ]
    for (const [target, inputs] of cases) {
      for (const input of inputs) {
        it(`${target} ← "${input}"`, () => {
          expect(accepts(target, input, 'lenient')).toBe(true)
        })
      }
    }
  })

  describe('hyphens accept a hyphen, a space, or nothing', () => {
    const cases: [string, string[]][] = [
      ['Harrow-on-the-Hill', ['harrow-on-the-hill', 'harrow on the hill', 'harrowonthehill']],
      ['Bromley-by-Bow', ['bromley-by-bow', 'bromley by bow', 'bromleybybow']],
    ]
    for (const [target, inputs] of cases) {
      for (const input of inputs) {
        it(`${target} ← "${input}"`, () => {
          expect(accepts(target, input, 'lenient')).toBe(true)
        })
      }
    }
  })

  describe('ampersand accepts "&" or the word "and"', () => {
    const cases: [string, string[]][] = [
      [
        'Heathrow Terminals 2 & 3',
        ['heathrow terminals 2 & 3', 'heathrow terminals 2 and 3', 'heathrow terminals 2&3', 'heathrowterminals2and3'],
      ],
      ['Elephant & Castle', ['elephant & castle', 'elephant and castle', 'elephant&castle', 'elephantandcastle']],
      ['Chalfont & Latimer', ['chalfont and latimer', 'chalfont & latimer']],
      ['Highbury & Islington', ['highbury and islington', 'highbury & islington']],
      ['Totteridge & Whetstone', ['totteridge and whetstone', 'totteridge & whetstone']],
    ]
    for (const [target, inputs] of cases) {
      for (const input of inputs) {
        it(`${target} ← "${input}"`, () => {
          expect(accepts(target, input, 'lenient')).toBe(true)
        })
      }
    }
  })

  it('finishes a name whose trailing characters are all optional', () => {
    // The closing bracket is optional, so the round must end on the final "a".
    expect(accepts('Kensington (Olympia)', 'kensington olympia', 'lenient')).toBe(true)
    expect(accepts('Kensington (Olympia)', 'kensington (olympia)', 'lenient')).toBe(true)
    expect(accepts('Kensington (Olympia)', 'kensingtonolympia', 'lenient')).toBe(true)
  })

  it('does not end the round early', () => {
    expect(run('Bank', 'ban', 'lenient').done).toBe(false)
    expect(run("King's Cross St Pancras", 'kings cross', 'lenient').done).toBe(false)
  })

  it('counts a wrong key as an error without moving the cursor', () => {
    const start = createMatch('Bank', 'lenient')
    const { state, ok } = applyKey(start, 'x')
    expect(ok).toBe(false)
    expect(state.errors).toBe(1)
    expect(state.index).toBe(0)

    // The player can simply try again — there is no backspace to deal with.
    const recovered = applyKeys(state, 'bank')
    expect(recovered.done).toBe(true)
    expect(recovered.errors).toBe(1)
  })

  it('lets a fumbled "and" be retried', () => {
    const target = 'Elephant & Castle'
    const state = applyKeys(createMatch(target, 'lenient'), 'elephant ax')
    expect(state.errors).toBe(1)
    // sub reset, so the ampersand can be started over either way.
    expect(applyKeys(state, 'and castle').done).toBe(true)
    expect(applyKeys(createMatch(target, 'lenient'), 'elephant ax& castle').done).toBe(true)
  })

  it('rejects a space where a letter is expected', () => {
    const { state } = applyKey(createMatch('Bank', 'lenient'), ' ')
    expect(state.errors).toBe(1)
    expect(state.index).toBe(0)
  })

  it('reports the completing keystroke', () => {
    const almost = applyKeys(createMatch('Oval', 'lenient'), 'ova')
    const { completed } = applyKey(almost, 'l')
    expect(completed).toBe(true)
  })
})

describe('strict mode', () => {
  it('requires apostrophes', () => {
    expect(accepts("King's Cross St Pancras", "king's cross st pancras", 'strict')).toBe(true)
    expect(accepts("King's Cross St Pancras", 'kings cross st pancras', 'strict')).toBe(false)
  })

  it('requires hyphens', () => {
    expect(accepts('Harrow-on-the-Hill', 'harrow-on-the-hill', 'strict')).toBe(true)
    expect(accepts('Harrow-on-the-Hill', 'harrow on the hill', 'strict')).toBe(false)
  })

  it('requires the literal ampersand', () => {
    expect(accepts('Elephant & Castle', 'elephant & castle', 'strict')).toBe(true)
    expect(accepts('Elephant & Castle', 'elephant and castle', 'strict')).toBe(false)
  })

  it('requires spaces', () => {
    expect(accepts('High Street Kensington', 'high street kensington', 'strict')).toBe(true)
    expect(accepts('High Street Kensington', 'highstreetkensington', 'strict')).toBe(false)
  })

  it('requires the closing bracket', () => {
    expect(accepts('Kensington (Olympia)', 'kensington (olympia)', 'strict')).toBe(true)
    expect(accepts('Kensington (Olympia)', 'kensington olympia', 'strict')).toBe(false)
  })

  it('still ignores case', () => {
    expect(accepts('Bank', 'BANK', 'strict')).toBe(true)
  })
})

describe('character states', () => {
  it('marks skipped punctuation distinctly from typed characters', () => {
    const state = applyKeys(createMatch("Earl's Court", 'lenient'), 'earls')
    expect(state.chars.slice(0, 4)).toEqual(['correct', 'correct', 'correct', 'correct'])
    expect(state.chars[4]).toBe('skipped') // the apostrophe
    expect(state.chars[5]).toBe('correct') // the "s"
    expect(state.chars[6]).toBe('pending') // the space
  })

  it('tracks correct keystrokes separately from target length', () => {
    // "and" costs three keystrokes but covers one target character.
    const state = applyKeys(createMatch('Elephant & Castle', 'lenient'), 'elephant and castle')
    expect(state.done).toBe(true)
    expect(state.correctKeys).toBe('elephant and castle'.length)
  })
})

describe('every real station name is completable', () => {
  it('accepts its own display name in both modes', async () => {
    const { default: network } = await import('../data/network.json')
    const names = Object.values(network.stations).map((s) => s.name)
    expect(names.length).toBeGreaterThan(300)

    const unfinished: string[] = []
    for (const name of names) {
      for (const mode of ['lenient', 'strict'] as const) {
        const state = applyKeys(createMatch(name, mode), name.toLowerCase())
        if (!state.done || state.errors > 0) unfinished.push(`${mode}: ${name}`)
      }
    }
    expect(unfinished).toEqual([])
  })

  it('accepts every name with punctuation stripped, in lenient mode', async () => {
    const { default: network } = await import('../data/network.json')
    const failures: string[] = []
    for (const station of Object.values(network.stations)) {
      const stripped = station.name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '')
      const state = applyKeys(createMatch(station.name, 'lenient'), stripped)
      if (!state.done || state.errors > 0) failures.push(station.name)
    }
    expect(failures).toEqual([])
  })
})
