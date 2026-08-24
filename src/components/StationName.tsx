/**
 * The station name the player is typing, coloured per character.
 *
 * `skipped` gets its own treatment rather than being shown as correct: in lenient mode
 * it is worth seeing that the apostrophe you never typed was let through, so the strict
 * mode difference is visible rather than mysterious.
 */

import type { MatchState } from '../engine/matcher.ts'

interface Props {
  match: MatchState
  /** Bumped on every rejected key; drives the shake animation. */
  errorPulse: number
}

export function StationName({ match, errorPulse }: Props) {
  return (
    // Changing the key remounts the element, which is what restarts the CSS animation on
    // every rejected key rather than only the first one.
    <div
      key={errorPulse}
      className={`station-name${errorPulse > 0 ? ' station-name--shake' : ''}`}
    >
      {match.target.split('').map((char, i) => {
        const status = match.chars[i]
        const isCursor = i === match.index && !match.done
        return (
          <span
            // Index is a stable key here: the string never reorders mid-round.
            key={i}
            className={`station-name__char station-name__char--${status}${
              isCursor ? ' station-name__char--cursor' : ''
            }`}
          >
            {char === ' ' ? ' ' : char}
          </span>
        )
      })}
    </div>
  )
}
