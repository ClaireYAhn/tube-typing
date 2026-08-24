/**
 * The roundel — a ring with a bar across it, no wordmark.
 *
 * Colours are TfL's Corporate Red and Corporate Blue, matching the line palette's source.
 *
 * Note this device is Transport for London's registered trade mark. It is here at the
 * project owner's request for a personal, non-commercial build; anything public-facing
 * should swap it for an original mark.
 */

/** TfL Corporate Red. */
export const ROUNDEL_RED = '#DC241F'
/** TfL Corporate Blue. */
export const ROUNDEL_BLUE = '#0019A8'

interface Props {
  size?: number
  color?: string
  barColor?: string
  className?: string
}

// The bar runs the full width of the viewBox, so the box has to be wider than the circle
// or the ends are clipped — which is what happened when the circle drove the geometry.
const W = 100
const H = 78
const CX = W / 2
const CY = H / 2
const RING = 11
const RADIUS = 28
const BAR_H = 15

export function Roundel({
  size = 64,
  color = ROUNDEL_RED,
  barColor = ROUNDEL_BLUE,
  className,
}: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={(size * H) / W}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Underground roundel"
    >
      <circle cx={CX} cy={CY} r={RADIUS} fill="none" stroke={color} strokeWidth={RING} />
      <rect x={0} y={CY - BAR_H / 2} width={W} height={BAR_H} fill={barColor} />
    </svg>
  )
}
