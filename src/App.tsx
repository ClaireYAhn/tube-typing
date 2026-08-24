import { useCallback, useState } from 'react'
import { FreeRoamScreen } from './components/FreeRoamScreen.tsx'
import { GameScreen } from './components/GameScreen.tsx'
import { MenuScreen } from './components/MenuScreen.tsx'
import { ProgressScreen } from './components/ProgressScreen.tsx'
import { ResultModal } from './components/ResultModal.tsx'
import { StationPicker } from './components/StationPicker.tsx'
import { challengeSize, type FreeRoamState } from './engine/freeRoam.ts'
import { type SessionState } from './engine/session.ts'
import { lineColor } from './data/lineColors.ts'
import type { StationId } from './data/types.ts'
import { buildRun, type BuiltRun, type ModeSelection } from './game/modes.ts'
import { summariseRoam, summariseSession, type RunSummary } from './game/summary.ts'
import { useColorScheme } from './hooks/useColorScheme.ts'
import { useProgress } from './hooks/useProgress.ts'
import { boardKey } from './storage/leaderboard.ts'
import {
  recordChallengeProgress,
  recordRun,
  resetChallenge,
  type BestRecord,
} from './storage/progress.ts'

type View =
  | { name: 'menu' }
  | { name: 'progress' }
  | { name: 'picker' }
  | { name: 'game'; run: BuiltRun; selection: ModeSelection; runId: number }
  | { name: 'roam'; start: StationId; runId: number }

/**
 * The result is an overlay, not a view: the finished run stays mounted behind it so the
 * route you just typed is still on screen while you read the numbers.
 */
interface ResultOverlay {
  summary: RunSummary
  replay: () => void
  isBest: boolean
  previous: BestRecord | null
  /** Null for runs that are not ranked; see the prop's note on ResultModal. */
  boardKey: string | null
}

export default function App() {
  const { progress, update, setMatchMode } = useProgress()
  // Line colours differ by scheme — the Northern line's black needs a substitute in dark.
  const scheme = useColorScheme()
  const [view, setView] = useState<View>({ name: 'menu' })
  const [result, setResult] = useState<ResultOverlay | null>(null)
  // Remounts the game screen on retry so the run starts from a clean reducer.
  const [runId, setRunId] = useState(0)

  const matchMode = progress.settings.matchMode
  const challenge = progress.tubeChallenge[matchMode]

  const start = useCallback(
    (selection: ModeSelection) => {
      // The Tube Challenge is free-roam now, so it asks where to begin first.
      if (selection.mode === 'tube-challenge') {
        setResult(null)
        setView({ name: 'picker' })
        return
      }
      const completed = new Set(challenge.completed)
      const run = buildRun(selection, completed, scheme)
      if (run.queue.length === 0) return
      const nextId = runId + 1
      setRunId(nextId)
      setResult(null)
      setView({ name: 'game', run, selection, runId: nextId })
    },
    [challenge, scheme, runId],
  )

  const startRoam = useCallback(
    (stationId: StationId) => {
      const nextId = runId + 1
      setRunId(nextId)
      setResult(null)
      setView({ name: 'roam', start: stationId, runId: nextId })
    },
    [runId],
  )

  const finishSession = useCallback(
    (state: SessionState) => {
      setView((current) => {
        if (current.name !== 'game') return current

        const summary = summariseSession(
          state,
          current.run.title,
          current.run.accentColor,
          current.run.lineId,
        )
        const candidate: BestRecord = {
          wpm: summary.wpm,
          accuracy: summary.accuracy,
          durationMs: summary.durationMs,
          errors: summary.errors,
          stations: summary.stations,
          achievedAt: new Date().toISOString(),
        }

        let isBest = false
        let previous: BestRecord | null = null

        if (summary.scoreable) {
          update((stored) => {
            const result = recordRun(stored, matchMode, current.run.recordKey, candidate)
            isBest = result.isBest
            previous = result.previous
            return result.progress
          })
        }

        const selection = current.selection
        setResult({
          summary,
          isBest,
          previous,
          boardKey: boardKey(current.run.recordKey, matchMode),
          replay: () => start(selection),
        })
        // The run stays on screen underneath the dialog.
        return current
      })
    },
    [update, matchMode, start],
  )

  const finishRoam = useCallback(
    (state: FreeRoamState) => {
      const total = challengeSize()
      const accent = state.lastLineId
        ? lineColor(state.lastLineId, scheme)
        : lineColor('elizabeth', scheme)
      const summary = summariseRoam(state, total, accent)

      // Whatever was reached is banked, whether or not the challenge was finished —
      // stopping partway is the normal way to play a 337-station run.
      update((stored) =>
        recordChallengeProgress(
          stored,
          matchMode,
          state.visited,
          summary.durationMs,
          state.errors,
          state.correctKeys,
        ),
      )

      const from = state.visited[0] ?? state.current
      // No board for the Tube Challenge: it is measured in stations found over many
      // sittings, so a speed table would be comparing runs of different lengths.
      setResult({
        summary,
        isBest: false,
        previous: null,
        boardKey: null,
        replay: () => startRoam(from),
      })
    },
    [update, matchMode, scheme, startRoam],
  )

  const screen = renderScreen()

  return (
    <>
      {screen}
      {result ? (
        <ResultModal
          summary={result.summary}
          isBest={result.isBest}
          previous={result.previous}
          boardKey={result.boardKey}
          onRetry={result.replay}
          onMenu={() => {
            setResult(null)
            setView({ name: 'menu' })
          }}
        />
      ) : null}
    </>
  )

  function renderScreen() {
  switch (view.name) {
    case 'menu':
      return (
        <MenuScreen
          progress={progress}
          matchMode={matchMode}
          onMatchModeChange={setMatchMode}
          onStart={start}
          onShowProgress={() => setView({ name: 'progress' })}
        />
      )

    case 'picker':
      return (
        <StationPicker
          visited={new Set(challenge.completed)}
          onPick={startRoam}
          onCancel={() => setView({ name: 'menu' })}
        />
      )

    case 'progress':
      return (
        <ProgressScreen
          progress={progress}
          matchMode={matchMode}
          onBack={() => setView({ name: 'menu' })}
          onResetChallenge={() => update((stored) => resetChallenge(stored, matchMode))}
        />
      )

    case 'game':
      return (
        <GameScreen
          key={view.runId}
          run={view.run}
          matchMode={matchMode}
          onFinish={finishSession}
        />
      )

    case 'roam':
      return (
        <FreeRoamScreen
          key={view.runId}
          start={view.start}
          matchMode={matchMode}
          alreadyVisited={challenge.completed}
          onFinish={finishRoam}
        />
      )

  }
  }
}
