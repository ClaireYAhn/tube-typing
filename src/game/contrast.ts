/**
 * Accent colours that stay readable.
 *
 * Line colours span from the Circle line's yellow to the Northern line's near-black, and
 * several sit in the mid-tones — Victoria, DLR, Waterloo & City — where *neither* black
 * nor white text clears 4.5:1. Using the raw line colour as a button fill would therefore
 * produce unreadable labels on about a third of the network.
 *
 * So a filled surface gets the line colour pushed away from its text colour until the
 * contrast is met. The hue survives; the label becomes legible.
 */

const WHITE = '#ffffff'
const BLACK = '#16181a'

function channel(value: number): number {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function toRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ]
}

function toHex(rgb: readonly number[]): string {
  return `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = toRgb(hex)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG 2.x contrast ratio, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

/** Whichever of black or white actually reads better on `hex`. */
export function inkOn(hex: string): string {
  return contrastRatio(hex, BLACK) >= contrastRatio(hex, WHITE) ? BLACK : WHITE
}

/** Mixes `hex` towards black (amount < 0) or white (amount > 0). */
function shade(hex: string, amount: number): string {
  const rgb = toRgb(hex)
  const target = amount > 0 ? 255 : 0
  const t = Math.abs(amount)
  return toHex(rgb.map((v) => v + (target - v) * t))
}

export interface AccentSurface {
  /** The line colour itself — for bars, swatches and borders, which carry no text. */
  color: string
  /** The same hue, adjusted until `ink` reads on it. For filled buttons and the cursor. */
  background: string
  ink: string
}

export function accentSurface(hex: string, minContrast = 4.5): AccentSurface {
  const ink = inkOn(hex)
  if (contrastRatio(hex, ink) >= minContrast) return { color: hex, background: hex, ink }

  // Push away from the ink in 5% steps. 20 steps reaches pure black or white, so this
  // always terminates with a passing value.
  const direction = ink === WHITE ? -1 : 1
  let background = hex
  for (let step = 1; step <= 20; step++) {
    background = shade(hex, direction * step * 0.05)
    if (contrastRatio(background, ink) >= minContrast) break
  }
  return { color: hex, background, ink }
}

/**
 * Custom properties for an accent-coloured area. Spread onto `style` and cast to
 * `React.CSSProperties` at the call site — React's types don't model custom properties.
 */
export function accentVars(hex: string): Record<string, string> {
  const surface = accentSurface(hex)
  return {
    '--accent': surface.color,
    '--accent-strong': surface.background,
    '--accent-ink': surface.ink,
  }
}

export function lineVars(hex: string): Record<string, string> {
  const surface = accentSurface(hex)
  return {
    '--line': surface.color,
    '--line-strong': surface.background,
    '--line-ink': surface.ink,
  }
}
