/**
 * Choosing where the Tube Challenge begins.
 *
 * 337 stations is too many to scan, so this is a filter box rather than a list: type a
 * few letters and pick. Which is also a small rehearsal of the game itself.
 */

import { useMemo, useState } from 'react'
import { allStations, normaliseForSearch } from '../data/network.ts'
import type { Station, StationId } from '../data/types.ts'
import { useLineMap } from '../hooks/useColorScheme.ts'

interface Props {
  /** Stations already banked, shown as done. */
  visited: ReadonlySet<StationId>
  onPick: (id: StationId) => void
  onCancel: () => void
}

/** A handful of well-known starting points, offered before anyone types anything. */
const SUGGESTED: StationId[] = [
  'kings-cross-st-pancras',
  'oxford-circus',
  'bank',
  'waterloo',
  'baker-street',
  'stratford',
]

export function StationPicker({ visited, onPick, onCancel }: Props) {
  const [query, setQuery] = useState('')
  const lineMap = useLineMap()

  const results = useMemo(() => {
    const needle = normaliseForSearch(query)
    if (needle === '') {
      return SUGGESTED.map((id) => allStations.find((s) => s.id === id)).filter(
        (s): s is Station => Boolean(s),
      )
    }
    return allStations
      .map((station) => ({ station, key: normaliseForSearch(station.name) }))
      .filter(({ key }) => key.includes(needle))
      .sort((a, b) => {
        // Names that start with the query come first — closest to what was meant.
        const aStarts = a.key.startsWith(needle)
        const bStarts = b.key.startsWith(needle)
        if (aStarts !== bStarts) return aStarts ? -1 : 1
        return a.station.name.localeCompare(b.station.name)
      })
      .slice(0, 40)
      .map(({ station }) => station)
  }, [query])

  return (
    <div className="picker">
      <header className="picker__header">
        <h1>Where do you want to start?</h1>
        <p>
          From there you drive yourself: type the name of any station next to you to
          travel there. At an interchange that includes every line — so changing line is
          just choosing a different name.
        </p>
      </header>

      <input
        className="picker__input"
        type="search"
        value={query}
        autoFocus
        placeholder="Search 337 stations…"
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && results.length > 0) onPick(results[0].id)
          if (event.key === 'Escape') onCancel()
        }}
      />

      <p className="picker__hint">
        {query.trim() === ''
          ? 'Suggested starts — or search for anywhere.'
          : `${results.length} match${results.length === 1 ? '' : 'es'}`}
      </p>

      <ul className="picker__results">
        {results.map((station) => (
          <li key={station.id}>
            <button type="button" className="picker__result" onClick={() => onPick(station.id)}>
              <span className="picker__name">
                {station.name}
                {visited.has(station.id) ? <span className="picker__done">visited</span> : null}
              </span>
              <span className="picker__lines">
                {station.lines.map((id) => (
                  <span
                    key={id}
                    className="picker__line"
                    style={{ background: lineMap.get(id)?.color }}
                    title={lineMap.get(id)?.name}
                  />
                ))}
                {station.zone ? <span className="picker__zone">Zone {station.zone}</span> : null}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <button type="button" className="button button--ghost" onClick={onCancel}>
        ← Back
      </button>
    </div>
  )
}
