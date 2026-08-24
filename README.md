# Tube Typing

A typing game built on the London Underground, the DLR and the Elizabeth line — 337
stations across 13 lines. Inspired by [電車でタイピング](https://densyatyping.com) and its
Korean counterpart [메트로 타이핑](https://metrotyping.net).

## The design problem

The Japanese and Korean originals get their difficulty from the *input method*: romaji →
kana conversion, hangul composition. London station names are already Latin, so that
entire layer disappears — `Bank` is four keystrokes and no challenge at all.

Difficulty here comes from somewhere else: name length (`Heathrow Terminals 2 & 3`), a
time limit, memorising running order, and how strictly punctuation is judged.

## Modes

| Mode | What it is |
| --- | --- |
| **Circle Loop** | One lap of the Circle line's 27-station circuit — the closest London has to the Yamanote loop. |
| **Line Run** | A line end to end. Branching lines (Northern has 8 routes, DLR 5) let you pick one. |
| **Random Sprint** | 60 seconds, random stations. |
| **Tube Challenge** | All 337 stations, saved as you go. Named after the [real Tube Challenge](https://en.wikipedia.org/wiki/Tube_Challenge). |

## Punctuation: lenient vs strict

Punctuation is where a typing game feels either forgiving or unfair, so it is a mode
rather than a fixed rule. Records are kept separately for each.

- **Lenient** — apostrophes, hyphens, brackets and spaces are optional; `&` accepts
  either `&` or the word `and`. So `kings cross st pancras`, `King's Cross St Pancras`
  and `kingscrossstpancras` all pass, and `Harrow-on-the-Hill` accepts a space, a hyphen
  or nothing between the words.
- **Strict** — exactly as printed, case-insensitive only.

A wrong key never advances the cursor; it counts as a mistake and you try again. That
matches the Japanese games and means there is no backspace to handle.

## Commands

```bash
npm install
npm run dev              # dev server
npm run build            # typecheck + production build
npm test                 # unit tests
npm run lint

npm run fetch:network    # re-pull station data from the TfL API, then validate
npm run validate:network # validate the committed data on its own
```

## Data

`src/data/network.json` is generated from the [TfL Unified
API](https://api.tfl.gov.uk/) at build time and committed, so the app has no runtime API
dependency — it works offline and can't be rate-limited.

The API returns *operational* names, not what passengers see, so `scripts/fetch-network.ts`
normalises them and `scripts/overrides.ts` hand-fixes what the mechanical rules can't:

- `Paddington (H&C Line)-Underground` → `Paddington` (API artefact)
- `Hammersmith (Dist&Picc Line)` and `Hammersmith (H&C Line)` → one `Hammersmith`
- `London Liverpool Street` → `Liverpool Street` (the Elizabeth line uses National Rail names)
- `Shepherd's Bush (Central)` → `Shepherd's Bush`, kept distinct from `Shepherd's Bush Market`
- `Kensington (Olympia)` keeps its brackets — they are part of the name

`scripts/validate.ts` fails the build on any regression in this — duplicate display names,
leftover suffixes, broken routes.

## Colours

Line colours are TfL's published values and live in exactly one place:
[`src/data/lineColors.ts`](src/data/lineColors.ts). No component and no stylesheet
hardcodes a colour, and `network.json` deliberately carries no presentation at all, so
recolouring never means refetching data.

Two cases need handling, both flagged in that file:

- **Circle (`#FFD300`) and Hammersmith & City (`#F3A9BB`)** are pale enough to vanish as
  hairlines on white and must never be used as text colour — they get thicker strokes and
  an outline.
- **Northern (`#000000`)** is invisible on a dark background, so it has a dark-scheme
  substitute chosen to stay distinct from Jubilee's grey.

`src/game/contrast.ts` handles filled surfaces: it picks black or white ink by luminance
and, where neither clears 4.5:1 — which of the TfL palette is only Bakerloo's brown —
nudges the fill until it does, keeping the hue.

## Routing (structure only)

`src/routing/` models the network for future interchange-aware journey planning. The key
decision is that a graph node is **a station on a line**, not a station: King's Cross St
Pancras is six nodes. That keeps the line you arrived on in the path, so a change of line
is an explicit edge with a real cost rather than a free teleport, and the boarding options
at any station are just the nodes sharing its `stationId`.

Results are legs — `{ lineId, from, to, stops }` — not a flat station list, so a journey
can render as "Victoria, 3 stops → change at King's Cross → Piccadilly, 5 stops" with each
segment in its own line colour.

The graph (`graph.ts`) and the path → journey conversion (`legs.ts`) are built and tested.
The search itself is not written yet; it plugs in as a Dijkstra over `neighbours`, seeded
with every node at the origin and stopping at any node at the destination, and needs no
changes to what is there.

## Menu backdrop

The menu sits on a faint tube map. By default this is the network drawn from open
coordinates by `src/map/`, the same layout the game runs the train over.

TfL's own artwork can be used instead, locally. Save the first page of the
[standard tube map PDF](https://content.tfl.gov.uk/standard-tube-map.pdf) as
`public/tube-map-tfl.jpg` and `MapBackdrop` will pick it up on the next reload; delete it
and the drawn map comes back. That file is gitignored on purpose. TfL publish the map for
personal use, which a local copy is, so it is not committed here or shipped to a deploy.

## Attribution

Powered by TfL Open Data. Contains OS data © Crown copyright and database rights.
Not affiliated with, or endorsed by, Transport for London.
