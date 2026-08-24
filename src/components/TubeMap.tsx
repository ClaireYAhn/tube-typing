/**
 * The map the train runs on.
 *
 * Drawn from real station coordinates rather than a picture of the official diagram —
 * which is the only way the train can actually move, since an image gives no per-station
 * positions to animate against.
 *
 * Layering, bottom to top: river, inactive lines (faded right back), the active route in
 * grey, the part already typed in full line colour, station markers, name pills, train.
 * The whole thing sits in a group that translates to keep the train centred, so panning
 * is a CSS transform transition rather than a viewBox animation.
 */

import { useMemo } from 'react'
import { CORNER_RADIUS, LINE_WIDTH, mapLayout } from '../map/layout.ts'
import { polyline, roundedPath } from '../map/path.ts'
import { angleBetween, lerp, type Point } from '../map/projection.ts'
import { useLineMap } from '../hooks/useColorScheme.ts'
import { inkOn } from '../game/contrast.ts'
import type { LineId, StationId } from '../data/types.ts'

/**
 * Map units visible at once — roughly eight station gaps across, which is about what the
 * printed diagram shows at a comfortable reading size. Larger numbers zoom out.
 */
const VIEW_W = 620
const VIEW_H = 332

/** A reachable neighbour in free-roam mode, shown as a pill you can type. */
export interface CandidatePill {
  stationId: StationId
  name: string
  lines: LineId[]
  live: boolean
  visited: boolean
  /** Characters already typed, for highlighting the pill as you commit to it. */
  typed: number
}

interface Props {
  /** The stations of the run, in order. */
  routeStationIds: readonly StationId[]
  /** Index of the station currently being typed. */
  position: number
  /** 0–1 through the current station's name, used to glide the train between stops. */
  progress: number
  /**
   * The line the run *follows*. Null means it doesn't follow one — Random Sprint throws
   * you across the network — and the map draws a trail of hops instead of a route.
   */
  activeLineId: LineId | null
  /**
   * Which line to paint the train in, when that differs from the route. Random Sprint has
   * no route but the train can still wear the colour of wherever it has just landed.
   */
  trainLineId?: LineId | null
  /**
   * Extra stops to label beyond the one being typed. Zero by default: the current name is
   * already spelled out in full on the board below, so more pills only crowd the map.
   */
  upcomingLabels?: number
  /**
   * Free-roam extras. When `candidates` is given the map stops drawing a fixed route and
   * instead shows where you have been plus everywhere you could go next.
   */
  candidates?: readonly CandidatePill[]
  trail?: readonly { from: StationId; to: StationId; lineId: LineId | null }[]
  atStationId?: StationId
  /**
   * Multiplies how much of the map fits on screen. The Tube Challenge uses more than 1
   * because its whole point is watching the coloured trail spread across London, and at
   * the run-mode zoom you can only ever see two or three hops of it.
   */
  zoom?: number
}

export function TubeMap({
  routeStationIds,
  position,
  progress,
  activeLineId,
  trainLineId,
  upcomingLabels = 0,
  candidates,
  trail,
  atStationId,
  zoom = 1,
}: Props) {
  const freeRoam = candidates !== undefined
  const lineMap = useLineMap()
  const activeColor = activeLineId ? (lineMap.get(activeLineId)?.color ?? '#666') : '#666'
  const liveryId = trainLineId === undefined ? activeLineId : trainLineId
  const trainColor = liveryId ? (lineMap.get(liveryId)?.color ?? '#666') : '#666'
  // Everything on the map is measured in map units, so zooming out shrinks it on screen.
  // That is right for the network — it should look further away — but wrong for the name
  // labels, which have to stay readable at whatever zoom the mode picked. Scaling them by
  // the zoom cancels it out and holds them at a constant size on screen.
  const labelScale = zoom
  const viewW = VIEW_W * zoom
  const viewH = VIEW_H * zoom

  const routePoints = useMemo(
    () =>
      routeStationIds
        .map((id) => mapLayout.stations.get(id))
        .filter((s): s is NonNullable<typeof s> => Boolean(s)),
    [routeStationIds],
  )

  // Train glides from the previous stop to the one being typed.
  const { trainAt, heading } = useMemo(() => {
    if (freeRoam) {
      const here = atStationId ? mapLayout.stations.get(atStationId) : undefined
      const lastHop = trail && trail.length > 0 ? trail[trail.length - 1] : undefined
      const cameFrom = lastHop ? mapLayout.stations.get(lastHop.from) : undefined
      return {
        trainAt: here?.point ?? { x: 0, y: 0 },
        heading: here && cameFrom ? angleBetween(cameFrom.point, here.point) : 0,
      }
    }
    if (routePoints.length === 0) return { trainAt: { x: 0, y: 0 }, heading: 0 }
    const to = routePoints[Math.min(position, routePoints.length - 1)]
    const from = routePoints[Math.max(0, Math.min(position, routePoints.length - 1) - 1)]
    return {
      trainAt: from === to ? to.point : lerp(from.point, to.point, progress),
      heading: from === to ? 0 : angleBetween(from.point, to.point),
    }
  }, [routePoints, position, progress, freeRoam, atStationId, trail])

  const travelled = routePoints.slice(0, position + 1).map((s) => s.point)
  const wholeRoute = routePoints.map((s) => s.point)
  const upcoming = routePoints.slice(position, position + 1 + upcomingLabels)

  return (
    <svg
      className="tube-map"
      viewBox={`0 0 ${viewW} ${viewH}`}
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="Map of the route"
    >
      <g
        className="tube-map__camera"
        style={{
          transform: `translate(${viewW / 2 - trainAt.x}px, ${viewH / 2 - trainAt.y}px)`,
        }}
      >
        {/* River. Thick, soft, and well underneath everything else. */}
        <path className="tube-map__river" d={polyline(mapLayout.thames)} />

        {/* Every other line, drawn in flat grey rather than its own colour. Keeping the
            real colours here made the screen read as noise the moment more than a couple
            of lines crossed; the active route has to be the only coloured thing. */}
        <g className="tube-map__inactive">
          {mapLayout.segments.map((segment, i) =>
            segment.lineId === activeLineId ? null : (
              <path
                key={`bg-${i}`}
                d={roundedPath(segment.points, CORNER_RADIUS)}
                strokeWidth={LINE_WIDTH}
              />
            ),
          )}
        </g>

        {freeRoam ? (
          <FreeRoamLayer
            trail={trail ?? []}
            candidates={candidates ?? []}
            lineMap={lineMap}
            at={trainAt}
            labelScale={labelScale}
          />
        ) : (
          <>
            {/* Random Sprint throws you between unconnected stations, so there is no real
                route to trace. It still leaves a trail: each stop stamped in the colour of
                its own line, joined by a dashed hop. Dashed rather than solid because the
                jump is a teleport, not a ride — drawing it like track would be a lie. */}
            {activeLineId === null ? (
              <SprintTrail stations={routePoints.slice(0, position + 1)} lineMap={lineMap} />
            ) : (
              <>
                {/* A white casing lifts the active route off the faded network beneath
                    it — the same trick the printed diagram uses where lines cross. */}
                <path className="tube-map__casing" d={roundedPath(wholeRoute, CORNER_RADIUS)} strokeWidth={LINE_WIDTH + 14} />
                <path className="tube-map__ahead" d={roundedPath(wholeRoute, CORNER_RADIUS)} strokeWidth={LINE_WIDTH + 4} />
                {travelled.length > 1 ? (
                  <path
                    className="tube-map__travelled"
                    d={roundedPath(travelled, CORNER_RADIUS)}
                    stroke={activeColor}
                    strokeWidth={LINE_WIDTH + 4}
                  />
                ) : null}

                {routePoints.map((station, i) => (
                  <StationMarker
                    key={station.id}
                    point={station.point}
                    done={i < position}
                    interchange={station.isInterchange}
                    color={activeColor}
                  />
                ))}
              </>
            )}
          </>
        )}

        <Train at={trainAt} heading={heading} color={trainColor} />

        {/* Only the station being typed is labelled. Showing the two after it as well
            meant three pills competing beside a name the player is already reading in
            full on the board below.

            Lifted clear above the station, and drawn *after* the train so that where two
            stops sit close together — Edgware Road and Paddington are barely half a train
            apart — the nose passes behind the name instead of through it. */}
        {(freeRoam ? [] : upcoming).map((station) => (
          <g
            key={`label-${station.id}`}
            transform={`translate(${station.point.x}, ${station.point.y - LABEL_LIFT * labelScale}) scale(${labelScale})`}
          >
            <NamePill text={station.name} color={activeColor} plain centred />
          </g>
        ))}
      </g>
    </svg>
  )
}

/**
 * How far above a station to float its name.
 *
 * A fixed lift rather than something clever about the direction of travel: the train
 * rotates, so its reach from the station is its half-length in *every* direction, and only
 * clearing that unconditionally keeps the name readable at every angle. Anything smaller
 * and the train parks on top of the word as it arrives — which it does at the end of every
 * name, exactly when you are still reading it.
 */
const LABEL_LIFT = 46

/**
 * Random Sprint's record of where it has been: every station done so far, marked in its
 * own line's colour and joined in play order by a dashed hop.
 */
function SprintTrail({
  stations,
  lineMap,
}: {
  stations: readonly { id: StationId; point: Point; isInterchange: boolean; lines: LineId[] }[]
  lineMap: ReturnType<typeof useLineMap>
}) {
  return (
    <>
      {stations.map((station, i) => {
        const color = lineMap.get(station.lines[0])?.color ?? '#666'
        const previous = stations[i - 1]
        return (
          <g key={`sprint-${station.id}-${i}`}>
            {previous ? (
              <path
                className="tube-map__jump"
                d={polyline([previous.point, station.point])}
                stroke={color}
                strokeWidth={LINE_WIDTH * 0.5}
              />
            ) : null}
            <StationMarker
              point={station.point}
              done
              interchange={station.isInterchange}
              color={color}
            />
          </g>
        )
      })}
    </>
  )
}

/**
 * Free-roam rendering: the trail you have already ridden, and every station you could
 * type next. Candidate pills carry the colour of the line that reaches them, so choosing
 * which name to type *is* choosing which line to take.
 */
function FreeRoamLayer({
  trail,
  candidates,
  lineMap,
  at,
  labelScale,
}: {
  trail: readonly { from: StationId; to: StationId; lineId: LineId | null }[]
  candidates: readonly CandidatePill[]
  lineMap: ReturnType<typeof useLineMap>
  at: Point
  /** Cancels the map's zoom so the candidate names stay a fixed size on screen. */
  labelScale: number
}) {
  const hops = trail.flatMap((hop) => {
    const from = mapLayout.stations.get(hop.from)
    const to = mapLayout.stations.get(hop.to)
    if (!from || !to) return []
    return [{ from, to, color: hop.lineId ? (lineMap.get(hop.lineId)?.color ?? '#666') : '#666' }]
  })

  return (
    <>
      {/* Two passes. Drawing each hop's white casing immediately before its own stroke
          let the next hop's casing paint over the end of the previous stroke, so a
          continuous ride came out as a row of disconnected blobs. All the casing first,
          then all the colour, and the trail joins up. */}
      {hops.map(({ from, to }, i) => (
        <path
          key={`casing-${i}`}
          className="tube-map__casing"
          d={roundedPath([from.point, to.point], CORNER_RADIUS)}
          strokeWidth={LINE_WIDTH + 14}
        />
      ))}
      {hops.map(({ from, to, color }, i) => (
        <path
          key={`hop-${i}`}
          className="tube-map__travelled"
          d={roundedPath([from.point, to.point], CORNER_RADIUS)}
          stroke={color}
          strokeWidth={LINE_WIDTH + 4}
        />
      ))}
      {hops.map(({ to, color }, i) => (
        <StationMarker
          key={`stop-${i}`}
          point={to.point}
          done
          interchange={to.isInterchange}
          color={color}
        />
      ))}

      {trail.length > 0
        ? (() => {
            const origin = mapLayout.stations.get(trail[0].from)
            return origin ? (
              <StationMarker point={origin.point} done interchange={origin.isInterchange} color="#666" />
            ) : null
          })()
        : null}

      {/* Where you can go next. Dimmed once visited — the challenge is finding new ones.
          Each label is thrown outward from the station you are standing at, so a busy
          interchange fans its options apart instead of stacking seven pills on one spot. */}
      {candidates.map((candidate) => {
        const station = mapLayout.stations.get(candidate.stationId)
        if (!station) return null
        const color = lineMap.get(candidate.lines[0])?.color ?? '#666'

        const dx = station.point.x - at.x
        const dy = station.point.y - at.y
        const length = Math.hypot(dx, dy) || 1
        // Scaled with the label, so the pill clears its own station by the same visible
        // margin however far back the camera is.
        const push = 14 * labelScale
        const anchorLeft = dx >= 0
        const x = station.point.x + (dx / length) * push + (anchorLeft ? 8 : -8) * labelScale
        const y = station.point.y + (dy / length) * push - (PILL_HEIGHT / 2) * labelScale

        return (
          <g key={candidate.stationId}>
            <StationMarker
              point={station.point}
              done={false}
              interchange={station.isInterchange}
              color={color}
            />
            <g
              className={`candidate${candidate.live ? '' : ' is-dead'}${candidate.visited ? ' is-visited' : ''}`}
              transform={`translate(${x}, ${y}) scale(${labelScale})`}
            >
              <NamePill
                text={candidate.name}
                color={color}
                plain={candidate.visited}
                typed={candidate.typed}
                anchorLeft={anchorLeft}
              />
            </g>
          </g>
        )
      })}
    </>
  )
}

function StationMarker({
  point,
  done,
  interchange,
  color,
}: {
  point: Point
  done: boolean
  interchange: boolean
  color: string
}) {
  if (interchange) {
    return (
      <circle
        className={`tube-map__interchange${done ? ' is-done' : ''}`}
        cx={point.x}
        cy={point.y}
        r={LINE_WIDTH * 0.72}
        fill={done ? color : undefined}
      />
    )
  }
  return (
    <circle
      className={`tube-map__stop${done ? ' is-done' : ''}`}
      cx={point.x}
      cy={point.y}
      r={LINE_WIDTH * 0.4}
      fill={done ? color : undefined}
    />
  )
}

/**
 * The rounded name tag the reference floats next to upcoming stops.
 *
 * Sized in map units, so it has to be tuned against VIEW_W: at this zoom a pill built for
 * the old wide view came out roughly twice the size of a station.
 */
const PILL_HEIGHT = 13
const PILL_FONT = 7.5

function NamePill({
  text,
  color,
  plain,
  typed = 0,
  anchorLeft = true,
  centred = false,
}: {
  text: string
  color: string
  /** White capsule, grey text — for the station being typed, whose colour the board
   * already carries. A coloured pill here just competed with the line itself. */
  plain: boolean
  /** Characters already committed, drawn as a filling bar behind the label. */
  typed?: number
  /** False hangs the pill to the left of its anchor, for stations west of the train. */
  anchorLeft?: boolean
  /** Centres the pill on its anchor instead of hanging it to one side. */
  centred?: boolean
}) {
  // Rough advance width — good enough to size a pill without measuring text.
  const width = text.length * PILL_FONT * 0.58 + 14
  const fraction = text.length > 0 ? Math.min(1, typed / text.length) : 0
  const clipId = `pill-${text.replace(/[^a-z0-9]/gi, '')}`
  const shift = centred ? -width / 2 : anchorLeft ? 0 : -width

  return (
    <g
      className={`name-pill${plain ? ' is-plain' : ''}`}
      transform={shift === 0 ? undefined : `translate(${shift}, 0)`}
    >
      <rect rx={PILL_HEIGHT / 2} ry={PILL_HEIGHT / 2} width={width} height={PILL_HEIGHT} fill={plain ? undefined : color} />
      {fraction > 0 ? (
        <>
          <clipPath id={clipId}>
            <rect width={width * fraction} height={PILL_HEIGHT} />
          </clipPath>
          <rect
            className="name-pill__progress"
            rx={PILL_HEIGHT / 2}
            ry={PILL_HEIGHT / 2}
            width={width}
            height={PILL_HEIGHT}
            fill={color}
            clipPath={`url(#${clipId})`}
          />
        </>
      ) : null}
      {/* Font size comes from the same constant the width is measured with — set in CSS
          they drifted apart and the text overflowed its own capsule. */}
      <text
        x={width / 2}
        y={PILL_HEIGHT / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={PILL_FONT}
        fill={plain ? undefined : inkOn(color)}
      >
        {text}
      </text>
    </g>
  )
}

/**
 * The train, in Underground livery: white shell, red cab end, deep blue skirt — and a
 * waist band in the colour of the line currently being ridden, so the train doubles as
 * an indicator of which line you are on.
 *
 * Drawn nose-right and rotated to the direction of travel.
 */
function Train({ at, heading, color }: { at: Point; heading: number; color: string }) {
  const length = 56
  const width = 20
  const half = width / 2

  // Keep the train upright when the line runs right-to-left, so it never appears
  // upside down on the western half of a route.
  const flipped = Math.abs(heading) > 90
  const bodyTransform = flipped ? 'scale(1, -1)' : undefined

  return (
    <g className="train" transform={`translate(${at.x}, ${at.y}) rotate(${heading})`}>
      <g transform={bodyTransform}>
        {/* Shell */}
        <rect
          className="train__body"
          x={-length / 2}
          y={-half}
          width={length}
          height={width}
          rx={half}
          ry={half}
        />
        {/* Waist band in the colour of the line being ridden, so the train tells you
            which line you are on at a glance. */}
        <rect
          className="train__waist"
          x={-length / 2 + 3}
          y={-half + 5}
          width={length - 18}
          height={width - 10}
          rx={2}
          fill={color}
        />
        {/* Deep blue skirt along the bottom, as on the real stock. */}
        <path
          className="train__skirt"
          d={`M${-length / 2 + 4} ${half - 3} L${length / 2 - 8} ${half - 3}`}
        />
        {/* Cab end: red face with the windscreen across it. */}
        <path
          className="train__cab"
          d={`M${length / 2 - 13} ${-half} L${length / 2 - half} ${-half}
              A${half} ${half} 0 0 1 ${length / 2 - half} ${half}
              L${length / 2 - 13} ${half} Z`}
        />
        <rect
          className="train__windscreen"
          x={length / 2 - 12}
          y={-half + 4}
          width={8}
          height={width - 8}
          rx={2.5}
        />
      </g>
    </g>
  )
}
