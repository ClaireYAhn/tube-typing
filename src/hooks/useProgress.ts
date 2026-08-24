/**
 * Reads progress from localStorage once, then keeps it written back on every change.
 */

import { useCallback, useEffect, useState } from 'react'
import type { MatchMode } from '../engine/matcher.ts'
import {
  clearProgress,
  loadProgress,
  saveProgress,
  type Progress,
} from '../storage/progress.ts'

export interface UseProgressResult {
  progress: Progress
  update: (fn: (current: Progress) => Progress) => void
  setMatchMode: (mode: MatchMode) => void
  reset: () => void
}

export function useProgress(): UseProgressResult {
  const [progress, setProgress] = useState<Progress>(loadProgress)

  useEffect(() => {
    saveProgress(progress)
  }, [progress])

  const update = useCallback((fn: (current: Progress) => Progress) => {
    setProgress(fn)
  }, [])

  const setMatchMode = useCallback((mode: MatchMode) => {
    setProgress((current) => ({ ...current, settings: { ...current.settings, matchMode: mode } }))
  }, [])

  const reset = useCallback(() => {
    clearProgress()
    setProgress(loadProgress())
  }, [])

  return { progress, update, setMatchMode, reset }
}
