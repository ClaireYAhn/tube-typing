/**
 * The faint tube map behind the menu.
 *
 * Two sources, in order of preference:
 *
 *   1. `public/tube-map-tfl.jpg` — Transport for London's own artwork, if it is present.
 *      It is deliberately kept out of version control (see .gitignore and the README), so
 *      a fresh clone and any CI build will not have it. TfL publish the map for personal
 *      use, which a local copy is; redistributing it from this repo or a deployed site
 *      would be something else.
 *   2. Otherwise the network drawn from open coordinates, by the same `src/map/` layout
 *      the game itself runs the train over.
 *
 * Which means the menu looks right whether or not the JPG is there, and nothing has to be
 * configured for a checkout to work.
 */

import { useState } from 'react'
import { CORNER_RADIUS, LINE_WIDTH, mapLayout } from '../map/layout.ts'
import { polyline, roundedPath } from '../map/path.ts'
import { useLineMap } from '../hooks/useColorScheme.ts'

const TFL_ARTWORK = '/tube-map-tfl.jpg'

export function MapBackdrop() {
  const [artworkMissing, setArtworkMissing] = useState(false)

  return (
    <div className="map-backdrop" aria-hidden="true">
      {artworkMissing ? (
        <GeneratedMap />
      ) : (
        <img
          src={TFL_ARTWORK}
          alt=""
          loading="eager"
          decoding="async"
          onError={() => setArtworkMissing(true)}
        />
      )}
    </div>
  )
}

/**
 * The frame to show, which is deliberately *not* `mapLayout.bounds`.
 *
 * Those bounds run from Reading to Shenfield, a span so wide that fitting it leaves
 * central London a thumbnail in the middle, hidden behind the menu cards, with nothing
 * but empty branch lines out at the edges. Trimming to the middle 80% of stations by each
 * axis drops the long outer reaches and frames the part that actually looks like the tube
 * map: the dense core where all thirteen lines cross.
 */
const CORE = coreFrame(0.1)

function coreFrame(trim: number) {
  const points = [...mapLayout.stations.values()].map((s) => s.point)
  const at = (values: number[], q: number) => {
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]
  }
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const pad = LINE_WIDTH * 4
  const minX = at(xs, trim) - pad
  const minY = at(ys, trim) - pad
  return {
    minX,
    minY,
    width: at(xs, 1 - trim) + pad - minX,
    height: at(ys, 1 - trim) + pad - minY,
  }
}

/** The network in line colours, with no camera on it. */
function GeneratedMap() {
  const lineMap = useLineMap()

  return (
    <svg
      className="map-backdrop__drawn"
      viewBox={`${CORE.minX} ${CORE.minY} ${CORE.width} ${CORE.height}`}
      preserveAspectRatio="xMidYMid slice"
    >
      <path className="tube-map__river" d={polyline(mapLayout.thames)} />
      {mapLayout.segments.map((segment, i) => (
        <path
          key={i}
          d={roundedPath(segment.points, CORNER_RADIUS)}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          stroke={lineMap.get(segment.lineId)?.color ?? '#666'}
          strokeWidth={LINE_WIDTH}
        />
      ))}
    </svg>
  )
}
