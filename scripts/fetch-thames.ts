/**
 * Fetches the River Thames from OpenStreetMap and writes it as a single simplified
 * polyline to `src/data/thames.json`.
 *
 * The river is the one piece of geography on the tube map, and without it the diagram
 * stops reading as London. OSM returns it as ~150 disconnected `way` fragments, so the
 * work here is stitching those into one ordered line, then thinning it enough to ship.
 *
 *   npm run fetch:thames
 */

import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/thames.json')

/** Roughly Hampton Court to the Dartford crossing — the stretch the tube map shows. */
const BBOX = '51.36,-0.55,51.58,0.30'

const QUERY = `[out:json][timeout:90];
(way["waterway"="river"]["name"="River Thames"](${BBOX}););
out geom;`

interface OsmWay {
  geometry?: { lat: number; lon: number }[]
}

type Point = [number, number] // [lon, lat]

async function fetchWays(): Promise<Point[][]> {
  // Overpass answers 406 to the default Node fetch headers — it wants a real
  // User-Agent and an explicit Accept.
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'tube-typing/1.0 (personal project; build-time data fetch)',
      Accept: 'application/json',
    },
    body: QUERY,
  })
  if (!res.ok) throw new Error(`Overpass returned ${res.status}`)
  const data = (await res.json()) as { elements: OsmWay[] }
  return data.elements
    .map((w) => (w.geometry ?? []).map(({ lon, lat }) => [lon, lat] as Point))
    .filter((points) => points.length > 1)
}

const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1])

/**
 * Chains fragments head-to-tail, always extending from whichever free end has the
 * nearest unused fragment. Starting from the westernmost fragment means the result runs
 * roughly upstream-to-downstream, west to east.
 */
function stitch(ways: Point[][]): Point[] {
  const westmost = ways.reduce((best, w) =>
    Math.min(w[0][0], w[w.length - 1][0]) < Math.min(best[0][0], best[best.length - 1][0]) ? w : best,
  )
  const remaining = new Set(ways.filter((w) => w !== westmost))
  let chain = westmost[0][0] <= westmost[westmost.length - 1][0] ? [...westmost] : [...westmost].reverse()

  while (remaining.size > 0) {
    const head = chain[0]
    const tail = chain[chain.length - 1]

    let best: { way: Point[]; gap: number; atTail: boolean; flip: boolean } | null = null
    for (const way of remaining) {
      const start = way[0]
      const end = way[way.length - 1]
      const options = [
        { gap: distance(tail, start), atTail: true, flip: false },
        { gap: distance(tail, end), atTail: true, flip: true },
        { gap: distance(head, end), atTail: false, flip: false },
        { gap: distance(head, start), atTail: false, flip: true },
      ]
      for (const option of options) {
        if (!best || option.gap < best.gap) best = { way, ...option }
      }
    }
    if (!best) break

    remaining.delete(best.way)
    // A large gap means the fragment belongs to a side channel or a distant reach, not
    // the main course — dropping it keeps the river a single clean line.
    if (best.gap > 0.02) continue

    const piece = best.flip ? [...best.way].reverse() : best.way
    chain = best.atTail ? [...chain, ...piece] : [...piece.reverse(), ...chain]
  }

  return chain
}

/** Ramer–Douglas–Peucker. */
function simplify(points: Point[], tolerance: number): Point[] {
  if (points.length < 3) return points

  const first = points[0]
  const last = points[points.length - 1]
  let index = -1
  let maxDistance = 0

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicular(points[i], first, last)
    if (d > maxDistance) {
      maxDistance = d
      index = i
    }
  }

  if (maxDistance <= tolerance) return [first, last]
  return [
    ...simplify(points.slice(0, index + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(index), tolerance),
  ]
}

function perpendicular(point: Point, lineStart: Point, lineEnd: Point): number {
  const [x, y] = point
  const [x1, y1] = lineStart
  const [x2, y2] = lineEnd
  const dx = x2 - x1
  const dy = y2 - y1
  if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1)
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))
}

// --- entry ------------------------------------------------------------------

console.log('Fetching the Thames from OpenStreetMap …')
const ways = await fetchWays()
console.log(`  ${ways.length} fragments, ${ways.reduce((n, w) => n + w.length, 0)} points`)

const stitched = stitch(ways)
console.log(`  stitched to ${stitched.length} points`)

const simplified = simplify(stitched, 0.0006)
console.log(`  simplified to ${simplified.length} points`)

const lons = simplified.map((p) => p[0])
const lats = simplified.map((p) => p[1])

writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      source: 'OpenStreetMap contributors, ODbL',
      note: 'Ordered west→east centreline of the River Thames through London.',
      bounds: {
        minLon: Math.min(...lons),
        maxLon: Math.max(...lons),
        minLat: Math.min(...lats),
        maxLat: Math.max(...lats),
      },
      points: simplified.map(([lon, lat]) => [Number(lon.toFixed(5)), Number(lat.toFixed(5))]),
    },
    null,
    0,
  )}\n`,
)
console.log(`\nWrote ${OUT}`)
