/**
 * Geographic projection for the map.
 *
 * London is small enough (about 0.9° of longitude, 0.2° of latitude) that a full
 * Mercator is overkill: an equirectangular projection with longitude scaled by
 * cos(latitude) is accurate to well under a pixel at this size, and it keeps the maths
 * legible.
 *
 * The scale is chosen so that a *typical gap between adjacent stations* lands at a
 * comfortable size on screen, rather than by fitting the whole network into the viewport.
 * That matters: the Elizabeth line reaches Reading and Shenfield, so a fit-everything
 * projection would shrink central London — where almost all the interesting typing
 * happens — into an unreadable knot. The map pans to follow the train instead.
 */

/** Central London, used as the tangent point for the cosine correction. */
const ORIGIN_LAT = 51.5074
const ORIGIN_LON = -0.1278

const LAT_SCALE = Math.cos((ORIGIN_LAT * Math.PI) / 180)

export interface Point {
  x: number
  y: number
}

export interface Projection {
  /** Pixels per degree of latitude. */
  scale: number
  project(lat: number, lon: number): Point
}

export function createProjection(scale: number): Projection {
  return {
    scale,
    project(lat, lon) {
      return {
        x: (lon - ORIGIN_LON) * LAT_SCALE * scale,
        // SVG y grows downward; latitude grows northward.
        y: -(lat - ORIGIN_LAT) * scale,
      }
    },
  }
}

/**
 * Picks a scale from the network itself: the median distance between adjacent stations
 * becomes `targetGap` pixels. Using the median rather than the mean keeps the long
 * outer-suburban hops from stretching central London apart.
 */
export function scaleForGap(
  gapsInDegrees: readonly number[],
  targetGap: number,
): number {
  if (gapsInDegrees.length === 0) return 12_000
  const sorted = [...gapsInDegrees].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  if (median <= 0) return 12_000
  return targetGap / median
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Angle in degrees, for orienting the train along the track. */
export function angleBetween(a: Point, b: Point): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
}

export function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}
