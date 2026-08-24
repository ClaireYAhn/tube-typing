/**
 * The arcade bit: you made a table, now put your name on it.
 *
 * Only shown when the score actually places on at least one of the two boards, so the
 * prompt always means something. A run that misses both says where it landed instead,
 * which is more use than an input box that leads nowhere.
 *
 * The last name used is remembered, because nobody wants to retype it every sixty
 * seconds.
 */

import { useEffect, useRef, useState } from 'react'
import { MAX_NAME } from '../storage/leaderboard.ts'

const LAST_NAME_KEY = 'tube-typing:last-name'

function rememberedName(): string {
  try {
    return localStorage.getItem(LAST_NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

function remember(name: string): void {
  try {
    localStorage.setItem(LAST_NAME_KEY, name)
  } catch {
    /* ignore */
  }
}

interface Props {
  rank: number
  submitting: boolean
  onSubmit: (name: string) => void
  onSkip: () => void
}

export function ScoreEntryForm({ rank, submitting, onSubmit, onSkip }: Props) {
  const [name, setName] = useState(rememberedName)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])

  return (
    <form
      className="score-entry"
      onSubmit={(event) => {
        event.preventDefault()
        if (submitting) return
        remember(name)
        onSubmit(name)
      }}
    >
      <p className="score-entry__rank">
        You placed <strong>#{rank}</strong>
      </p>
      <div className="score-entry__row">
        <input
          ref={input}
          className="score-entry__input"
          type="text"
          value={name}
          maxLength={MAX_NAME}
          placeholder="Your name"
          aria-label="Your name for the high score table"
          onChange={(event) => setName(event.target.value)}
          // Escape belongs to the dialog behind this, which closes it. Stopping the key
          // here would trap the player in a form they might not want to fill in.
          onKeyDown={(event) => event.stopPropagation()}
          disabled={submitting}
        />
        <button type="submit" className="button button--primary" disabled={submitting}>
          {submitting ? 'Saving…' : 'Add to the board'}
        </button>
        <button
          type="button"
          className="button button--ghost"
          onClick={onSkip}
          disabled={submitting}
        >
          Skip
        </button>
      </div>
    </form>
  )
}
