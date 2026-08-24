import { describe, expect, it } from 'vitest'
import {
  MAX_KPM,
  isAllowedBoard,
  validateScore,
  type SubmittedScore,
} from '../../api/_scoring.ts'

/** A plausible sixty-second sprint: 55 stations, about 12 keys each. */
function plausible(over: Partial<SubmittedScore> = {}): SubmittedScore {
  return {
    name: 'Claire',
    kpm: 700,
    wpm: 140,
    accuracy: 0.98,
    stations: 55,
    durationMs: 60_000,
    ...over,
  }
}

describe('validateScore', () => {
  it('accepts an ordinary run', () => {
    expect(validateScore(plausible())).toEqual({ ok: true })
  })

  it('accepts a slow run and a fast one', () => {
    expect(validateScore(plausible({ kpm: 180, stations: 14 })).ok).toBe(true)
    expect(validateScore(plausible({ kpm: 1100, stations: 88 })).ok).toBe(true)
  })

  it('accepts a short run that ended early', () => {
    expect(validateScore(plausible({ stations: 12, durationMs: 14_000, kpm: 660 })).ok).toBe(true)
  })

  it('rejects missing or non-numeric fields', () => {
    expect(validateScore({}).ok).toBe(false)
    expect(validateScore(plausible({ kpm: Number.NaN })).ok).toBe(false)
    expect(validateScore(plausible({ kpm: Number.POSITIVE_INFINITY })).ok).toBe(false)
    expect(validateScore({ ...plausible(), name: 42 as unknown as string }).ok).toBe(false)
  })

  it('rejects a speed nobody has ever typed', () => {
    const result = validateScore(plausible({ kpm: MAX_KPM + 1, stations: 400 }))
    expect(result).toEqual({ ok: false, reason: 'kpm out of range' })
  })

  it('rejects impossible accuracy', () => {
    expect(validateScore(plausible({ accuracy: 1.5 })).ok).toBe(false)
    expect(validateScore(plausible({ accuracy: -0.1 })).ok).toBe(false)
  })

  it('rejects a run with no stations', () => {
    expect(validateScore(plausible({ stations: 0 })).ok).toBe(false)
  })

  it('rejects a duration that is too short to be a run', () => {
    expect(validateScore(plausible({ durationMs: 400 })).ok).toBe(false)
  })

  it('rejects a speed that does not match the work claimed', () => {
    // The giveaway forgery: a huge number with nothing behind it.
    const result = validateScore(plausible({ kpm: 1200, stations: 3, durationMs: 60_000 }))
    expect(result.ok).toBe(false)
    expect(result).toMatchObject({ reason: expect.stringContaining('does not match') })
  })

  it('rejects a speed far below the work claimed', () => {
    // 200 stations in a minute at 20 kpm is not a slow run, it is a broken payload.
    expect(validateScore(plausible({ kpm: 20, stations: 200 })).ok).toBe(false)
  })
})

describe('isAllowedBoard', () => {
  it('accepts the boards the game actually has', () => {
    expect(isAllowedBoard('random-sprint:lenient')).toBe(true)
    expect(isAllowedBoard('random-sprint:strict')).toBe(true)
  })

  it('rejects anything else, so nobody can invent a table', () => {
    expect(isAllowedBoard('tube-challenge:lenient')).toBe(false)
    expect(isAllowedBoard('../../etc/passwd')).toBe(false)
    expect(isAllowedBoard('')).toBe(false)
    expect(isAllowedBoard(null)).toBe(false)
    expect(isAllowedBoard(123)).toBe(false)
  })
})
