/**
 * Wires the session reducer to the browser: a clock and the keyboard.
 *
 * The run starts on the first keystroke rather than a countdown, so reaction time never
 * eats into the WPM figure — the same convention typing tests use.
 */

import { useCallback, useEffect, useMemo, useReducer } from 'react'
import { isTypeableKey } from '../engine/matcher.ts'
import {
  createSession,
  sessionReducer,
  type SessionConfig,
  type SessionState,
} from '../engine/session.ts'

/** 10 fps is enough for a timer and a live WPM read-out, and keeps re-renders cheap. */
const TICK_MS = 100

export interface UseSessionResult {
  state: SessionState
  quit: () => void
}

export function useSession(config: SessionConfig, onFinish?: (state: SessionState) => void): UseSessionResult {
  const [state, dispatch] = useReducer(sessionReducer, config, createSession)

  const quit = useCallback(() => dispatch({ type: 'quit', at: performance.now() }), [])

  // Keyboard. Bound to the window so there is no input to focus and no way to lose focus
  // mid-run by clicking the background.
  useEffect(() => {
    if (state.status === 'finished') return

    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return

      if (event.key === 'Escape') {
        event.preventDefault()
        dispatch({ type: 'quit', at: performance.now() })
        return
      }

      if (!isTypeableKey(event.key)) return
      // Space would otherwise scroll the page.
      event.preventDefault()

      const at = performance.now()
      dispatch({ type: 'start', at })
      dispatch({ type: 'key', key: event.key, at })
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [state.status])

  // Clock.
  useEffect(() => {
    if (state.status !== 'running') return
    const id = window.setInterval(() => dispatch({ type: 'tick', at: performance.now() }), TICK_MS)
    return () => window.clearInterval(id)
  }, [state.status])

  // Fire once, when the run ends.
  useEffect(() => {
    if (state.status === 'finished') onFinish?.(state)
    // Deliberately keyed on status alone: this must not re-fire as `state` settles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status])

  return useMemo(() => ({ state, quit }), [state, quit])
}
