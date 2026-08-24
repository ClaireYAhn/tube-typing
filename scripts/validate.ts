/**
 * Sanity checks on the generated `src/data/network.json`.
 *
 * The TfL API changes its operational naming from time to time, and a silently broken
 * station name is the kind of bug that only shows up as an unwinnable round mid-game.
 * This fails loudly instead.
 *
 *   npm run validate:network
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LINE_COLORS } from '../src/data/lineColors.ts'
import type { Network } from '../src/data/types.ts'

const FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/network.json')
const network: Network = JSON.parse(readFileSync(FILE, 'utf8'))

const errors: string[] = []
const warnings: string[] = []

const fail = (msg: string) => errors.push(msg)
const warn = (msg: string) => warnings.push(msg)

// --- Stations ---------------------------------------------------------------

const stations = Object.values(network.stations)
if (stations.length < 300) fail(`only ${stations.length} stations — expected 330+`)

const byName = new Map<string, string[]>()
for (const s of stations) {
  if (!s.name.trim()) fail(`${s.id}: empty name`)
  if (s.id !== s.id.toLowerCase()) fail(`${s.id}: id is not lowercase`)
  if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon)) fail(`${s.id}: bad coordinates`)
  if (s.lines.length === 0) fail(`${s.id}: not on any line`)
  if (!s.zone) warn(`${s.id}: no zone`)

  // These are the tells that name cleaning regressed.
  if (/\b(Underground|DLR|Rail)\s+Station$/i.test(s.name)) fail(`${s.id}: operational suffix left in "${s.name}"`)
  if (/-Underground/i.test(s.name)) fail(`${s.id}: API artefact left in "${s.name}"`)
  if (/\((Circle|District|Bakerloo|Central|H&C|Dist&Picc)/i.test(s.name))
    fail(`${s.id}: line disambiguator left in "${s.name}"`)
  if (/\(for /i.test(s.name)) fail(`${s.id}: strap-line left in "${s.name}"`)
  if (/\((London|Berks|Bucks|Herts|Essex)\)/i.test(s.name))
    fail(`${s.id}: county disambiguator left in "${s.name}"`)
  if (/’/.test(s.name)) fail(`${s.id}: curly apostrophe in "${s.name}" — normalise to '`)
  if (/St\.\s/.test(s.name)) fail(`${s.id}: "St." should be "St" in "${s.name}"`)

  byName.set(s.name, [...(byName.get(s.name) ?? []), s.id])
}

for (const [name, ids] of byName) {
  if (ids.length > 1) fail(`duplicate display name "${name}" across ids: ${ids.join(', ')}`)
}

// The Elizabeth line publishes National Rail names, which reintroduces stations the tube
// already lists under a shorter name ("London Paddington" vs "Paddington").
for (const name of byName.keys()) {
  const bare = name.replace(/^London /, '')
  if (bare !== name && byName.has(bare)) {
    fail(`"${name}" duplicates "${bare}" — add a CLEAN_NAME_OVERRIDES entry`)
  }
}

// --- Lines ------------------------------------------------------------------

if (network.lines.length !== 13) fail(`expected 13 lines, got ${network.lines.length}`)

for (const line of network.lines) {
  // Colours live in src/data/lineColors.ts, not in the generated file — but every line in
  // the data must have an entry there or the UI renders it colourless.
  const palette = LINE_COLORS[line.id]
  if (!palette) fail(`${line.id}: no entry in LINE_COLORS`)
  else {
    if (!/^#[0-9A-Fa-f]{6}$/.test(palette.hex)) fail(`${line.id}: bad colour "${palette.hex}"`)
    if (palette.dark && !/^#[0-9A-Fa-f]{6}$/.test(palette.dark))
      fail(`${line.id}: bad dark colour "${palette.dark}"`)
  }
  if (line.routes.length === 0) fail(`${line.id}: no routes`)

  for (const route of [...line.routes, ...(line.loop ? [line.loop] : [])]) {
    if (route.stationIds.length < 2) fail(`${line.id}/${route.id}: fewer than 2 stops`)
    for (const id of route.stationIds) {
      if (!network.stations[id]) fail(`${line.id}/${route.id}: unknown station id "${id}"`)
    }
    for (let i = 1; i < route.stationIds.length; i++) {
      if (route.stationIds[i] === route.stationIds[i - 1])
        fail(`${line.id}/${route.id}: repeated stop "${route.stationIds[i]}" at index ${i}`)
    }
    if (/&harr;|&amp;/.test(route.label)) fail(`${line.id}/${route.id}: HTML entity in label "${route.label}"`)
  }

  // Every station claiming this line should be reachable on one of its routes.
  const covered = new Set(line.routes.flatMap((r) => r.stationIds))
  const claimed = stations.filter((s) => s.lines.includes(line.id))
  const missing = claimed.filter((s) => !covered.has(s.id))
  if (missing.length) warn(`${line.id}: ${missing.length} station(s) not on any route: ${missing.map((s) => s.name).join(', ')}`)
}

const circle = network.lines.find((l) => l.id === 'circle')
if (!circle?.loop) fail('circle line has no loop route — Circle Loop mode needs it')
else if (circle.loop.stationIds.length < 25)
  fail(`circle loop has only ${circle.loop.stationIds.length} stops — expected ~27`)

// --- Report -----------------------------------------------------------------

const longest = [...stations].sort((a, b) => b.name.length - a.name.length).slice(0, 5)
const punctuated = stations.filter((s) => /[&'\-()]/.test(s.name))

console.log(`network.json — ${stations.length} stations, ${network.lines.length} lines`)
console.log(`  circle loop: ${circle?.loop?.stationIds.length ?? 0} stops`)
console.log(`  punctuated names: ${punctuated.length}`)
console.log(`  longest: ${longest.map((s) => `${s.name} (${s.name.length})`).join(', ')}`)

for (const w of warnings) console.log(`  warn  ${w}`)

if (errors.length) {
  console.error(`\n${errors.length} error(s):`)
  for (const e of errors) console.error(`  ✗ ${e}`)
  process.exit(1)
}
console.log('\n✓ all checks passed')
