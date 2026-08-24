/**
 * Typed access to the generated network data.
 *
 * `network.json` is produced by `npm run fetch:network` and committed, so nothing here
 * touches the TfL API at runtime. It carries structure only — colours are merged in from
 * `lineColors.ts`, which means a palette change never requires regenerating data.
 */

import raw from './network.json'
import { isLightLine, lineColor, lineShort, type ColorScheme } from './lineColors.ts'
import type { Line, LineData, LineId, Network, Station, StationId } from './types.ts'

// `resolveJsonModule` infers structural types (`string` where we want `LineId`), so the
// shape is asserted once here rather than at every call site. `validate.ts` is what
// actually guarantees the file matches.
export const network = raw as unknown as Network

export const stations: Record<StationId, Station> = network.stations
export const allStations: Station[] = Object.values(network.stations)

function decorate(line: LineData, scheme: ColorScheme): Line {
  return {
    ...line,
    color: lineColor(line.id, scheme),
    lightColor: isLightLine(line.id),
    short: lineShort(line.id),
  }
}

/**
 * Lines with light-scheme colours. Components that need scheme-aware colours should call
 * `linesForScheme` (or `useLines`) instead of reaching for this.
 */
export const lines: Line[] = network.lines.map((line) => decorate(line, 'light'))

const cache = new Map<ColorScheme, Line[]>([['light', lines]])

export function linesForScheme(scheme: ColorScheme): Line[] {
  const hit = cache.get(scheme)
  if (hit) return hit
  const decorated = network.lines.map((line) => decorate(line, scheme))
  cache.set(scheme, decorated)
  return decorated
}

const lineById = new Map(lines.map((l) => [l.id, l]))

export function getLine(id: LineId): Line {
  const line = lineById.get(id)
  if (!line) throw new Error(`unknown line: ${id}`)
  return line
}

export function getStation(id: StationId): Station {
  const station = network.stations[id]
  if (!station) throw new Error(`unknown station: ${id}`)
  return station
}

export function getStations(ids: readonly StationId[]): Station[] {
  return ids.map(getStation)
}

export function stationsOnLine(id: LineId): Station[] {
  return allStations.filter((s) => s.lines.includes(id))
}

/** The Circle line's 27-stop circuit, the closest thing London has to the Yamanote loop. */
export function circleLoop() {
  const loop = getLine('circle').loop
  if (!loop) throw new Error('circle line has no loop route in network.json')
  return loop
}

/**
 * Strips everything a searcher would not think to type: case, apostrophes, hyphens,
 * brackets, spaces, and `&` written out as "and".
 *
 * Without this, searching "kings" misses "King's Cross St Pancras" entirely — the same
 * trap lenient matching exists to avoid, so search has to make the same allowances.
 */
export function normaliseForSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '')
}

/** Fisher–Yates. Not seeded — runs are meant to differ. */
export function shuffle<T>(items: readonly T[]): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
