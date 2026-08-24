/**
 * Typing metrics.
 *
 * WPM uses the standard five-characters-per-word convention so the numbers are
 * comparable with other typing tests. Only correct keystrokes count towards speed;
 * rejected keys show up in accuracy instead.
 */

export function wpm(correctKeys: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0
  return correctKeys / 5 / (elapsedMs / 60_000)
}

/**
 * Keys per minute — what the Japanese and Korean games display (分間打鍵数 / 분당 타수).
 * Longer station names inflate it in a way WPM hides, which is part of why those games
 * feel fast.
 */
export function kpm(correctKeys: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0
  return correctKeys / (elapsedMs / 60_000)
}

/** 0–1. Returns 1 for an untouched run so a fresh UI shows 100%, not 0%. */
export function accuracy(correctKeys: number, errors: number): number {
  const total = correctKeys + errors
  if (total === 0) return 1
  return correctKeys / total
}

export function formatWpm(value: number): string {
  return Math.round(value).toString()
}

export function formatAccuracy(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

/** `m:ss` below an hour, `h:mm:ss` above — Tube Challenge runs get long. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const seconds = totalSeconds % 60
  const minutes = Math.floor(totalSeconds / 60) % 60
  const hours = Math.floor(totalSeconds / 3600)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}
