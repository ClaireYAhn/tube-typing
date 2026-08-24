import { describe, expect, it } from 'vitest'
import { lines } from '../data/network.ts'
import { LINE_COLORS } from '../data/lineColors.ts'
import { accentSurface, contrastRatio, inkOn, relativeLuminance } from './contrast.ts'

describe('inkOn', () => {
  it('picks whichever of black or white reads better', () => {
    expect(inkOn(LINE_COLORS.circle.hex)).toBe('#16181a') // #FFD300
    expect(inkOn(LINE_COLORS.northern.hex)).toBe('#ffffff') // #000000
    expect(inkOn('#ffffff')).toBe('#16181a')
    expect(inkOn('#000000')).toBe('#ffffff')
  })

  it('handles three-digit hex', () => {
    expect(relativeLuminance('#fff')).toBeCloseTo(relativeLuminance('#ffffff'))
  })
})

describe('accentSurface', () => {
  it('leaves colours that already pass untouched', () => {
    const yellow = accentSurface(LINE_COLORS.circle.hex)
    expect(yellow.background).toBe(LINE_COLORS.circle.hex)
    expect(yellow.ink).toBe('#16181a')
  })

  it('darkens a mid-tone until its text reads', () => {
    // Bakerloo brown is the one TfL colour that clears neither black (3.99) nor
    // white (4.46) at 4.5:1, so it is the case this adjustment exists for.
    const raw = LINE_COLORS.bakerloo.hex
    expect(contrastRatio(raw, '#ffffff')).toBeLessThan(4.5)
    expect(contrastRatio(raw, '#16181a')).toBeLessThan(4.5)

    const surface = accentSurface(raw)
    expect(surface.color).toBe(raw) // the swatch keeps the published hue
    expect(surface.background).not.toBe(raw)
    expect(contrastRatio(surface.background, surface.ink)).toBeGreaterThanOrEqual(4.5)
  })

  it('leaves the rest of the palette alone', () => {
    const adjusted = Object.entries(LINE_COLORS)
      .filter(([, c]) => accentSurface(c.hex).background !== c.hex)
      .map(([id]) => id)
    expect(adjusted).toEqual(['bakerloo'])
  })

  it('gives every line a readable filled surface', () => {
    const failures = lines
      .map((line) => {
        const surface = accentSurface(line.color)
        return { line: line.name, contrast: contrastRatio(surface.background, surface.ink) }
      })
      .filter((r) => r.contrast < 4.5)
    expect(failures).toEqual([])
  })

  it('keeps the adjusted fill recognisably the same hue', () => {
    for (const line of lines) {
      const { color, background } = accentSurface(line.color)
      if (color === background) continue
      // Compare hue by channel ordering: the brightest channel should not change.
      const rank = (hex: string) => {
        const v = hex.replace('#', '')
        const parts = [v.slice(0, 2), v.slice(2, 4), v.slice(4, 6)].map((p) => Number.parseInt(p, 16))
        return parts.indexOf(Math.max(...parts))
      }
      expect(rank(background)).toBe(rank(color))
    }
  })
})
