/**
 * Path helpers for drawing the map.
 *
 * Real transport diagrams never turn a sharp corner: every bend is eased with a fixed
 * radius, which is a large part of why they look designed rather than plotted. Geographic
 * coordinates produce a lot of small direction changes, so rounding every vertex is what
 * turns the polyline into something that reads as a tube line.
 */

import type { Point } from './projection.ts'

/**
 * Builds an SVG path with every corner rounded to `radius`, clamping the radius on short
 * segments so neighbouring corners can't overrun each other.
 */
export function roundedPath(points: readonly Point[], radius: number): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M${fmt(points[0])}`
  if (points.length === 2) return `M${fmt(points[0])} L${fmt(points[1])}`

  const parts: string[] = [`M${fmt(points[0])}`]

  for (let i = 1; i < points.length - 1; i++) {
    const previous = points[i - 1]
    const corner = points[i]
    const next = points[i + 1]

    const inLength = dist(previous, corner)
    const outLength = dist(corner, next)
    if (inLength === 0 || outLength === 0) continue

    // Never eat more than half of either leg, or consecutive corners overlap.
    const r = Math.min(radius, inLength / 2, outLength / 2)

    const start = towards(corner, previous, r)
    const end = towards(corner, next, r)

    parts.push(`L${fmt(start)}`)
    // Quadratic through the corner itself gives a clean circular-looking fillet.
    parts.push(`Q${fmt(corner)} ${fmt(end)}`)
  }

  parts.push(`L${fmt(points[points.length - 1])}`)
  return parts.join(' ')
}

/** Plain polyline, for the river where bends should stay natural. */
export function polyline(points: readonly Point[]): string {
  if (points.length === 0) return ''
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${fmt(p)}`).join(' ')
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** A point `distance` away from `from`, in the direction of `to`. */
function towards(from: Point, to: Point, distance: number): Point {
  const length = dist(from, to)
  if (length === 0) return from
  const t = distance / length
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
}

function fmt(p: Point): string {
  return `${p.x.toFixed(1)} ${p.y.toFixed(1)}`
}
