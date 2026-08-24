/**
 * Tracks the OS colour scheme so line colours can be resolved for it — the Northern
 * line's pure black is invisible on a dark background and needs its substitute.
 */

import { useEffect, useMemo, useState } from 'react'
import { linesForScheme } from '../data/network.ts'
import type { ColorScheme } from '../data/lineColors.ts'
import type { Line } from '../data/types.ts'

const QUERY = '(prefers-color-scheme: dark)'

export function useColorScheme(): ColorScheme {
  const [scheme, setScheme] = useState<ColorScheme>(() =>
    typeof window !== 'undefined' && window.matchMedia(QUERY).matches ? 'dark' : 'light',
  )

  useEffect(() => {
    // The initial value is read synchronously during render, so this only has to keep up
    // with later changes.
    const media = window.matchMedia(QUERY)
    const onChange = (event: MediaQueryListEvent) => setScheme(event.matches ? 'dark' : 'light')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  return scheme
}

/** Lines with colours resolved for the active scheme. */
export function useLines(): Line[] {
  const scheme = useColorScheme()
  return useMemo(() => linesForScheme(scheme), [scheme])
}

export function useLineMap(): Map<string, Line> {
  const lines = useLines()
  return useMemo(() => new Map(lines.map((line) => [line.id, line])), [lines])
}
