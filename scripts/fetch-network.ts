/**
 * Build-time data pipeline.
 *
 * Pulls the network from the TfL Unified API (open, no app key needed for this volume),
 * normalises station names, merges the duplicate NaPTAN ids a single station can have,
 * and writes `src/data/network.json`.
 *
 * The generated file is committed, so the app has no runtime API dependency: it works
 * offline, can't be rate-limited, and never hits CORS.
 *
 *   npm run fetch:network
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RAW_NAME_OVERRIDES, CLEAN_NAME_OVERRIDES, KEEP_PARENTHESES } from './overrides.ts'
import type { LineData, LineId, Mode, Network, Route, Station, StationId } from '../src/data/types.ts'

const API = 'https://api.tfl.gov.uk'
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/network.json')

const LINES: { id: LineId; mode: Mode }[] = [
  { id: 'bakerloo', mode: 'tube' },
  { id: 'central', mode: 'tube' },
  { id: 'circle', mode: 'tube' },
  { id: 'district', mode: 'tube' },
  { id: 'hammersmith-city', mode: 'tube' },
  { id: 'jubilee', mode: 'tube' },
  { id: 'metropolitan', mode: 'tube' },
  { id: 'northern', mode: 'tube' },
  { id: 'piccadilly', mode: 'tube' },
  { id: 'victoria', mode: 'tube' },
  { id: 'waterloo-city', mode: 'tube' },
  { id: 'dlr', mode: 'dlr' },
  { id: 'elizabeth', mode: 'elizabeth-line' },
]

// --- TfL response shapes (only the fields we consume) -----------------------

interface ApiStopPoint {
  id: string
  name: string
  lat: number
  lon: number
  zone?: string
  modes?: string[]
}
interface ApiSequence {
  branchId: number
  stopPoint: ApiStopPoint[]
}
interface ApiOrderedRoute {
  name: string
  naptanIds: string[]
}
interface ApiRouteSequence {
  lineName: string
  isOutboundOnly: boolean
  stopPointSequences: ApiSequence[] | null
  orderedLineRoutes: ApiOrderedRoute[] | null
}

// --- Name normalisation -----------------------------------------------------

/**
 * Strips the operational suffix TfL appends to every stop name.
 * Runs after RAW_NAME_OVERRIDES, so the awkward cases are already resolved.
 *
 * Note the `Station$` alternative is anchored and applied once, which is what lets
 * "Battersea Power Station Underground Station" survive as "Battersea Power Station".
 */
function cleanStationName(raw: string): string {
  if (RAW_NAME_OVERRIDES[raw]) return RAW_NAME_OVERRIDES[raw]

  let name = raw
    .replace(/\s*-?\s*(Underground|DLR|Rail)\s+Station$/i, '')
    .replace(/\s*-?\s*Underground$/i, '')
    .trim()

  if (CLEAN_NAME_OVERRIDES[name]) return CLEAN_NAME_OVERRIDES[name]

  // Curly apostrophes appear inconsistently across endpoints; normalise to straight.
  name = name.replace(/’/g, "'")
  if (CLEAN_NAME_OVERRIDES[name]) return CLEAN_NAME_OVERRIDES[name]

  if (!KEEP_PARENTHESES.has(name)) {
    const stripped = name.replace(/\s*\([^)]*\)\s*$/, '').trim()
    if (stripped.length > 0) name = stripped
  }
  return CLEAN_NAME_OVERRIDES[name] ?? name
}

function slugify(name: string): StationId {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['.’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** TfL puts HTML entities in route labels: `Edgware  &harr;  Morden  via Bank`. */
function cleanRouteLabel(raw: string): string {
  return raw
    .replace(/&harr;/g, '↔')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

// --- Fetch ------------------------------------------------------------------

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`)
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${res.statusText}`)
  return (await res.json()) as T
}

/**
 * Prefers the inbound sequence; a few services are published outbound-only.
 */
async function getSequence(lineId: LineId): Promise<ApiRouteSequence> {
  const inbound = await getJson<ApiRouteSequence>(`/Line/${lineId}/Route/Sequence/inbound`)
  if (inbound.stopPointSequences?.length) return inbound
  return getJson<ApiRouteSequence>(`/Line/${lineId}/Route/Sequence/outbound`)
}

// --- Build ------------------------------------------------------------------

interface StationDraft {
  id: StationId
  name: string
  lines: Set<LineId>
  zone: string | null
  lat: number
  lon: number
  naptanIds: Set<string>
  /** Tube-mode records carry the authoritative zone; prefer them when merging. */
  hasTubeSource: boolean
}

async function build(): Promise<Network> {
  const drafts = new Map<StationId, StationDraft>()
  /** NaPTAN id → merged station id, needed to resolve `orderedLineRoutes`. */
  const naptanToStation = new Map<string, StationId>()
  const lines: LineData[] = []

  for (const { id: lineId, mode } of LINES) {
    const seq = await getSequence(lineId)
    const sequences = seq.stopPointSequences ?? []

    // Pass 1 — register every stop, merging duplicates by display name.
    for (const branch of sequences) {
      for (const sp of branch.stopPoint) {
        const name = cleanStationName(sp.name)
        const id = slugify(name)
        const isTube = sp.modes?.includes('tube') ?? false

        let draft = drafts.get(id)
        if (!draft) {
          draft = {
            id,
            name,
            lines: new Set(),
            zone: sp.zone ?? null,
            lat: sp.lat,
            lon: sp.lon,
            naptanIds: new Set(),
            hasTubeSource: isTube,
          }
          drafts.set(id, draft)
        } else if (isTube && !draft.hasTubeSource) {
          // A tube record outranks a rail/DLR one for coordinates and zone.
          draft.zone = sp.zone ?? draft.zone
          draft.lat = sp.lat
          draft.lon = sp.lon
          draft.hasTubeSource = true
        } else if (!draft.zone && sp.zone) {
          draft.zone = sp.zone
        }

        draft.lines.add(lineId)
        draft.naptanIds.add(sp.id)
        naptanToStation.set(sp.id, id)
      }
    }

    // Pass 2 — end-to-end routes for Line Run.
    const seen = new Set<string>()
    const routes: Route[] = []
    for (const raw of seq.orderedLineRoutes ?? []) {
      const stationIds = dedupeConsecutive(
        raw.naptanIds.map((n) => naptanToStation.get(n)).filter((s): s is StationId => Boolean(s)),
      )
      if (stationIds.length < 2) continue

      // inbound/outbound and branch pairs produce mirrored duplicates.
      const key = canonicalKey(stationIds)
      if (seen.has(key)) continue
      seen.add(key)

      routes.push({
        id: `${lineId}-${routes.length}`,
        label: cleanRouteLabel(raw.name),
        stationIds,
      })
    }
    routes.sort((a, b) => b.stationIds.length - a.stationIds.length)

    // A true circular service shows up as a branch whose first and last stop match.
    let loop: Route | null = null
    for (const branch of sequences) {
      const ids = dedupeConsecutive(
        branch.stopPoint
          .map((sp) => naptanToStation.get(sp.id))
          .filter((s): s is StationId => Boolean(s)),
      )
      if (ids.length > 10 && ids[0] === ids[ids.length - 1]) {
        loop = {
          id: `${lineId}-loop`,
          // Drop the repeated terminus: the player types each station once per lap.
          stationIds: ids.slice(0, -1),
          label: `${drafts.get(ids[0])!.name} loop`,
        }
        break
      }
    }

    lines.push({ id: lineId, name: seq.lineName, mode, routes, loop })
    console.log(
      `  ${lineId.padEnd(17)} routes=${String(routes.length).padStart(2)}  loop=${loop ? `${loop.stationIds.length} stops` : '—'}`,
    )
  }

  const stations: Record<StationId, Station> = {}
  for (const [id, d] of [...drafts].sort(([a], [b]) => a.localeCompare(b))) {
    stations[id] = {
      id,
      name: d.name,
      lines: [...d.lines].sort(),
      zone: d.zone ?? null,
      lat: d.lat,
      lon: d.lon,
      naptanIds: [...d.naptanIds].sort(),
    }
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: 'TfL Unified API (api.tfl.gov.uk)',
    attribution: 'Powered by TfL Open Data. Contains OS data © Crown copyright and database rights.',
    lines,
    stations,
  }
}

/** Consecutive repeats appear where a route doubles back through an interchange. */
function dedupeConsecutive(ids: StationId[]): StationId[] {
  return ids.filter((id, i) => i === 0 || id !== ids[i - 1])
}

/** Direction-agnostic key so `A→B` and `B→A` collapse to one route. */
function canonicalKey(ids: StationId[]): string {
  const forward = ids.join('>')
  const backward = [...ids].reverse().join('>')
  return forward < backward ? forward : backward
}

// --- Entry ------------------------------------------------------------------

console.log(`Fetching ${LINES.length} lines from ${API} …`)
const network = await build()
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, `${JSON.stringify(network, null, 2)}\n`)
console.log(
  `\nWrote ${OUT}\n  ${network.lines.length} lines, ${Object.keys(network.stations).length} stations`,
)
