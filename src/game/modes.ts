/**
 * Game modes.
 *
 * Each mode is only a queue builder plus a time limit — `session.ts` does the rest.
 * The four here mirror the Japanese original: a loop line, a full line run, a timed
 * random sprint, and the long-haul "visit every station" challenge (which in London is
 * a real thing — the Tube Challenge has a Guinness record attached to it).
 */

import { allStations, circleLoop, getLine, getStation, getStations, lines, shuffle } from '../data/network.ts'
import { lineColor, type ColorScheme } from '../data/lineColors.ts'
import type { Line, LineId, Station, StationId } from '../data/types.ts'
import { dailyRecordKey, describeJourney, todaysJourney, type DailyJourney } from './daily.ts'

export type ModeId = 'circle-loop' | 'line-run' | 'random-sprint' | 'tube-challenge' | 'daily'

export interface ModeSelection {
  mode: ModeId
  /** Line Run only. */
  lineId?: LineId
  /** Line Run only; defaults to the line's longest route. */
  routeId?: string
  /** Daily only; defaults to today's. Passed explicitly so tests can pin a date. */
  journey?: DailyJourney
}

export interface BuiltRun {
  queue: Station[]
  title: string
  subtitle: string
  timeLimitMs: number | null
  /** Stable key for storing best records. */
  recordKey: string
  accentColor: string
  /**
   * The line the run follows, where there is one. Null for Random Sprint and Tube
   * Challenge, which hop around the network — the map then colours by the current
   * station's first line instead.
   */
  lineId: LineId | null
  /**
   * The line ridden between each consecutive pair of queued stations, where the run
   * follows a real journey across more than one line. The map colours the route by this
   * so a change of line is visible as a change of colour rather than being invisible.
   */
  segmentLines?: LineId[]
}

export const SPRINT_MS = 60_000

/** Long enough that no one out-types it inside a minute; avoids any refill logic. */
const SPRINT_QUEUE_SIZE = 200

export const MODES: { id: ModeId; title: string; blurb: string }[] = [
  {
    id: 'circle-loop',
    title: 'Circle Loop',
    blurb: 'One full lap of the Circle line, in order. London’s answer to the Yamanote loop.',
  },
  {
    id: 'line-run',
    title: 'Line Run',
    blurb: 'Pick a line and type it end to end. Branching lines let you choose the route.',
  },
  {
    id: 'random-sprint',
    title: 'Random Sprint',
    blurb: 'Sixty seconds. Random stations. As many as you can manage.',
  },
  {
    id: 'tube-challenge',
    title: 'Tube Challenge',
    blurb: 'Every station on the network, saved as you go. The long one.',
  },
]

export function buildRun(
  selection: ModeSelection,
  completed: ReadonlySet<StationId>,
  scheme: ColorScheme = 'light',
): BuiltRun {
  // Every accent resolves through LINE_COLORS, so no hex ever appears in this file.
  const accent = (id: LineId) => lineColor(id, scheme)

  switch (selection.mode) {
    case 'circle-loop': {
      const loop = circleLoop()
      return {
        queue: getStations(loop.stationIds),
        title: 'Circle Loop',
        subtitle: `${loop.stationIds.length} stations, one lap`,
        timeLimitMs: null,
        recordKey: 'circle-loop',
        accentColor: accent('circle'),
        lineId: 'circle',
      }
    }

    case 'line-run': {
      const line = getLine(selection.lineId ?? 'victoria')
      const route = line.routes.find((r) => r.id === selection.routeId) ?? line.routes[0]
      return {
        queue: getStations(route.stationIds),
        title: line.name,
        subtitle: `${route.label} · ${route.stationIds.length} stations`,
        timeLimitMs: null,
        recordKey: `line-run:${route.id}`,
        accentColor: accent(line.id),
        lineId: line.id,
      }
    }

    case 'random-sprint': {
      const pool = shuffle(allStations)
      // Cycle the pool if the network is somehow smaller than the queue we want.
      const queue = Array.from(
        { length: SPRINT_QUEUE_SIZE },
        (_, i) => pool[i % pool.length],
      )
      return {
        queue,
        title: 'Random Sprint',
        subtitle: '60 seconds',
        timeLimitMs: SPRINT_MS,
        recordKey: 'random-sprint',
        accentColor: accent('victoria'),
        lineId: null,
      }
    }

    case 'daily': {
      const journey = selection.journey ?? todaysJourney()
      return {
        queue: getStations(journey.route),
        title: 'Daily journey',
        subtitle: `${describeJourney(journey)} · ${journey.transfers} ${
          journey.transfers === 1 ? 'change' : 'changes'
        }`,
        timeLimitMs: null,
        recordKey: dailyRecordKey(journey),
        // The line it sets off on, so the accent matches the first stretch of the map.
        accentColor: accent(journey.legs[0]?.lineId ?? 'elizabeth'),
        // Not a single-line run: the route crosses lines, so the map draws it per leg.
        lineId: null,
        segmentLines: journey.segmentLines,
      }
    }

    case 'tube-challenge': {
      const remaining = tubeChallengeOrder().filter((id) => !completed.has(id))
      return {
        queue: getStations(remaining),
        title: 'Tube Challenge',
        subtitle: `${remaining.length} of ${allStations.length} stations left`,
        timeLimitMs: null,
        recordKey: 'tube-challenge',
        accentColor: accent('elizabeth'),
        lineId: null,
      }
    }
  }
}

/**
 * A stable, geographically sensible order for the Tube Challenge: walk each line's
 * longest route end to end, appending stations the walk hasn't reached yet. Beats
 * alphabetical — you travel the network rather than teleporting around it.
 */
let cachedOrder: StationId[] | null = null
export function tubeChallengeOrder(): StationId[] {
  if (cachedOrder) return cachedOrder

  const seen = new Set<StationId>()
  const order: StationId[] = []
  for (const line of lines) {
    for (const route of line.routes) {
      for (const id of route.stationIds) {
        if (!seen.has(id)) {
          seen.add(id)
          order.push(id)
        }
      }
    }
  }
  // Anything not on a published route still belongs in the challenge.
  for (const station of allStations) {
    if (!seen.has(station.id)) order.push(station.id)
  }

  cachedOrder = order
  return order
}

/**
 * Per-line completion, for the progress screen. Takes the line list so the caller can
 * pass colours already resolved for the active scheme.
 */
export function lineCompletion(completed: ReadonlySet<StationId>, forLines: Line[] = lines) {
  return forLines.map((line) => {
    const onLine = allStations.filter((s) => s.lines.includes(line.id))
    const done = onLine.filter((s) => completed.has(s.id)).length
    return { line, done, total: onLine.length }
  })
}

export function describeSelection(selection: ModeSelection): string {
  if (selection.mode !== 'line-run') {
    return MODES.find((m) => m.id === selection.mode)?.title ?? selection.mode
  }
  const line = getLine(selection.lineId ?? 'victoria')
  const route = line.routes.find((r) => r.id === selection.routeId) ?? line.routes[0]
  return `${line.name} — ${route.label}`
}

/** Used by the result screen to name the station a player struggled with. */
export function stationName(id: StationId): string {
  return getStation(id).name
}
