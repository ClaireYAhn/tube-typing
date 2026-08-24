/**
 * The single source of truth for line colours.
 *
 * Nothing else — no component, no stylesheet, no generated JSON — may hardcode a line
 * colour. `network.json` carries network *structure*; presentation lives here, so a
 * palette change never means regenerating data.
 *
 * Values are TfL's published colour standard.
 *
 * Two colours need care:
 *
 *   Circle (#FFD300) and Hammersmith & City (#F3A9BB) are very light. On a light
 *   background a hairline stroke in either effectively disappears, and neither may be
 *   used as a text colour. Both are flagged `light: true` — draw them thicker, and route
 *   text through `contrast.ts` instead.
 *
 *   Northern (#000000) is pure black and vanishes on a dark background, hence `dark`.
 *
 * Note on the Overground: it was split into six separately-named lines in November 2024
 * and recoloured. If it is ever added here, take the values from the current TfL colour
 * standard rather than any older source.
 */

import type { LineId } from './types.ts'

export interface LineColor {
  /** TfL colour standard value, used on a light background. */
  hex: string
  /** Substitute for dark backgrounds where `hex` would disappear. */
  dark?: string
  /**
   * True when the colour is too light to survive as a hairline on white or to be used as
   * text. Consumers should thicken the stroke and never set `color` to it directly.
   */
  light?: boolean
  /** Compact label for tight UI. */
  short: string
}

export const LINE_COLORS: Record<LineId, LineColor> = {
  bakerloo: { hex: '#B36305', short: 'Bakerloo' },
  central: { hex: '#E32017', short: 'Central' },
  circle: { hex: '#FFD300', light: true, short: 'Circle' },
  district: { hex: '#00782A', short: 'District' },
  'hammersmith-city': { hex: '#F3A9BB', light: true, short: 'H&C' },
  jubilee: { hex: '#A0A5A9', short: 'Jubilee' },
  metropolitan: { hex: '#9B0056', short: 'Metropolitan' },
  // Pure black reads as "no line" on a dark ground; the substitute stays clear of
  // Jubilee's #A0A5A9 so the two remain distinguishable.
  northern: { hex: '#000000', dark: '#E8EAED', short: 'Northern' },
  piccadilly: { hex: '#003688', short: 'Piccadilly' },
  victoria: { hex: '#0098D4', short: 'Victoria' },
  'waterloo-city': { hex: '#95CDBA', light: true, short: 'W&C' },
  dlr: { hex: '#00A4A7', short: 'DLR' },
  elizabeth: { hex: '#6950A1', short: 'Elizabeth' },
}

export type ColorScheme = 'light' | 'dark'

export function lineColor(id: LineId, scheme: ColorScheme = 'light'): string {
  const entry = LINE_COLORS[id]
  return scheme === 'dark' && entry.dark ? entry.dark : entry.hex
}

/** True for colours that need a thicker stroke and must not be used as text. */
export function isLightLine(id: LineId): boolean {
  return LINE_COLORS[id].light === true
}

export function lineShort(id: LineId): string {
  return LINE_COLORS[id].short
}
