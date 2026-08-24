/**
 * Turns the network data into drawable map geometry, once, at module load.
 *
 * Two things make an SVG of coordinates read as *the tube map* rather than a scatter plot:
 *
 *   1. Weight. The real diagram uses fat coloured strokes with generous white gaps
 *      between parallel lines, so the network looks built rather than plotted.
 *   2. Interchange markers. The white ringed circles at interchanges and the small
 *      ticks at single-line stations are as recognisable as the colours themselves.
 *
 * Both are handled here: parallel lines sharing a corridor get offset perpendicular to
 * their direction so they run side by side instead of on top of each other.
 */

import { allStations, network, getStation } from '../data/network.ts'
import thamesData from '../data/thames.json'
import type { LineId, StationId } from '../data/types.ts'
import { createProjection, scaleForGap, type Point } from './projection.ts'

/** Pixels between two adjacent stations, at the median. Drives the whole map's size. */
const TARGET_GAP = 64

/** Corner radius for line bends. Nothing on a transport diagram turns a sharp corner. */
export const CORNER_RADIUS = 16

/** Stroke weight of a line. Deliberately heavy — the diagram should look chunky. */
export const LINE_WIDTH = 10
/** Gap between two lines sharing a corridor. */
const PARALLEL_OFFSET = LINE_WIDTH + 3.5

export interface StationPoint {
  id: StationId
  name: string
  point: Point
  lines: LineId[]
  /** Interchanges get the ringed marker; single-line stations get a tick. */
  isInterchange: boolean
}

export interface LineSegment {
  lineId: LineId
  /** Polyline through projected station positions, offset for parallel running. */
  points: Point[]
}

export interface MapLayout {
  scale: number
  stations: Map<StationId, StationPoint>
  segments: LineSegment[]
  thames: Point[]
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
}

function build(): MapLayout {
  // --- scale ----------------------------------------------------------------
  const gaps: number[] = []
  for (const line of network.lines) {
    for (const route of line.routes) {
      for (let i = 1; i < route.stationIds.length; i++) {
        const a = getStation(route.stationIds[i - 1])
        const b = getStation(route.stationIds[i])
        gaps.push(Math.hypot(a.lon - b.lon, a.lat - b.lat))
      }
    }
  }
  const scale = scaleForGap(gaps, TARGET_GAP)
  const projection = createProjection(scale)

  // --- stations -------------------------------------------------------------
  const stations = new Map<StationId, StationPoint>()
  for (const station of allStations) {
    stations.set(station.id, {
      id: station.id,
      name: station.name,
      point: projection.project(station.lat, station.lon),
      lines: station.lines,
      isInterchange: station.lines.length > 1,
    })
  }

  // --- line segments --------------------------------------------------------
  // Count how many lines run each station-to-station corridor so parallel routes can be
  // fanned out rather than drawn on top of one another.
  const corridorLines = new Map<string, LineId[]>()
  const corridorKey = (a: StationId, b: StationId) => (a < b ? `${a}|${b}` : `${b}|${a}`)

  for (const line of network.lines) {
    for (const route of line.routes) {
      for (let i = 1; i < route.stationIds.length; i++) {
        const key = corridorKey(route.stationIds[i - 1], route.stationIds[i])
        const existing = corridorLines.get(key)
        if (!existing) corridorLines.set(key, [line.id])
        else if (!existing.includes(line.id)) existing.push(line.id)
      }
    }
  }

  // One polyline per route. An earlier version tried to break polylines where branches
  // overlapped, which spliced together stations that are nowhere near each other and
  // drew long diagonals across the map. Overlapping strokes of the same colour are
  // indistinguishable, so simply drawing every route is both correct and simpler.
  const segments: LineSegment[] = []
  for (const line of network.lines) {
    for (const route of [...line.routes, ...(line.loop ? [line.loop] : [])]) {
      const points: Point[] = []
      for (let i = 0; i < route.stationIds.length; i++) {
        const here = stations.get(route.stationIds[i])
        if (!here) continue

        // Offset perpendicular to the corridor this station sits on, so lines sharing a
        // stretch run side by side. Corridors are looked up against the neighbour we are
        // heading towards, falling back to the one behind at a terminus.
        const nextId = route.stationIds[i + 1]
        const prevId = route.stationIds[i - 1]
        const neighbourId = nextId ?? prevId
        const neighbour = neighbourId ? stations.get(neighbourId) : undefined

        points.push(
          neighbour
            ? offsetPoint(here.point, neighbour.point, corridorKey(route.stationIds[i], neighbourId!), line.id, corridorLines)
            : here.point,
        )
      }
      if (points.length > 1) segments.push({ lineId: line.id, points })
    }
  }

  // --- river ----------------------------------------------------------------
  const thames = (thamesData.points as [number, number][]).map(([lon, lat]) =>
    projection.project(lat, lon),
  )

  // --- bounds ---------------------------------------------------------------
  const all = [...[...stations.values()].map((s) => s.point), ...thames]
  const xs = all.map((p) => p.x)
  const ys = all.map((p) => p.y)

  return {
    scale,
    stations,
    segments,
    thames,
    bounds: {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    },
  }
}

/**
 * Shifts a point perpendicular to the corridor so lines sharing it run side by side.
 * The offsets are centred, so two lines straddle the true path and three put the middle
 * one on it.
 */
function offsetPoint(
  at: Point,
  towards: Point,
  corridor: string,
  lineId: LineId,
  corridorLines: Map<string, LineId[]>,
): Point {
  const sharing = corridorLines.get(corridor)
  if (!sharing || sharing.length < 2) return at

  const index = sharing.indexOf(lineId)
  if (index < 0) return at

  const shift = (index - (sharing.length - 1) / 2) * PARALLEL_OFFSET
  const dx = towards.x - at.x
  const dy = towards.y - at.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return at

  // Perpendicular unit vector.
  return { x: at.x + (-dy / length) * shift, y: at.y + (dx / length) * shift }
}

export const mapLayout: MapLayout = build()

export function stationPoint(id: StationId): Point {
  const entry = mapLayout.stations.get(id)
  if (!entry) throw new Error(`station not on map: ${id}`)
  return entry.point
}
