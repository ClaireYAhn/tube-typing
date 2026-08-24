/**
 * The station board along the bottom — the thing you actually read while typing.
 *
 * Modelled on the reference: a full-width band in the line's colour, standing in for the
 * line itself, with the current station as a white capsule sitting on it and the
 * neighbouring stations bleeding off each edge. That framing is what makes it feel like
 * you are somewhere on a line rather than looking at a word.
 */

import type { MatchState } from '../engine/matcher.ts'
import type { Station } from '../data/types.ts'
import { StationName } from './StationName.tsx'

interface Props {
  station: Station
  previous: Station | null
  next: Station | null
  match: MatchState
  errorPulse: number
  /** 1-based position in the run — London has no station numbers, so this stands in. */
  index: number
  total: number
  lineName: string
  color: string
  ink: string
}

export function StationBanner({
  station,
  previous,
  next,
  match,
  errorPulse,
  index,
  total,
  lineName,
  color,
  ink,
}: Props) {
  return (
    <div className="banner">
      <p className="banner__line" style={{ background: color, color: ink }}>
        {lineName}
      </p>

      {/* Neighbours sit immediately either side of the capsule rather than out at the
          screen edges, so the three names read as consecutive stops on the line. */}
      <div className="banner__band" style={{ background: color }}>
        <span className="banner__neighbour" style={{ color: ink }}>
          {previous ? <><span className="banner__arrow">←</span>{previous.name}</> : null}
        </span>

        <div className="banner__capsule">
          <span className="banner__badge" style={{ background: color, color: ink }}>
            {index}
            <span className="banner__badge-total">/{total}</span>
          </span>

          <span className="banner__name">
            <StationName match={match} errorPulse={errorPulse} />
            <span className="banner__meta">
              {station.zone ? `Zone ${station.zone}` : 'Outside the zones'}
              {station.lines.length > 1 ? ` · ${station.lines.length} lines` : ''}
            </span>
          </span>
        </div>

        <span className="banner__neighbour" style={{ color: ink }}>
          {next ? <>{next.name}<span className="banner__arrow">→</span></> : null}
        </span>
      </div>
    </div>
  )
}
