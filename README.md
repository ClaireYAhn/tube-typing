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
| **Daily journey** | One real route a day, the same one for everybody, typed end to end. |

## The daily journey

`src/game/daily.ts` generates one route a day from the date alone, so it is a pure
function: no server, nothing to publish, and it works offline. The date is UTC rather than
local, or friends in London and Seoul would get different routes and have nothing to
compare.

It was briefly a Travle-style puzzle where you guessed the stations in between. That was
the wrong question twice over. Nobody can name Maryland or Seven Kings from memory, and
anyone outside London cannot name the lines either, so it stopped being a typing game and
became a quiz that only a Londoner could pass. Showing the route and asking for speed is
what the game has always been, and it means everyone types exactly the same thing, which
is what makes a shared daily leaderboard mean anything.

Routes are rejection-sampled against a band: 15 to 25 stations, one to three changes, and
no leg shorter than two stops. That last rule exists because the cheapest path sometimes
changes line to ride a single stop and changes straight back, which is a real route and
reads as a bug. Over a year the generator repeats itself exactly once, 63 days apart.

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

## Routing

`src/routing/` models the network for interchange-aware journey planning. The key
decision is that a graph node is **a station on a line**, not a station: King's Cross St
Pancras is six nodes. That keeps the line you arrived on in the path, so a change of line
is an explicit edge with a real cost rather than a free teleport, and the boarding options
at any station are just the nodes sharing its `stationId`.

Results are legs — `{ lineId, from, to, stops }` — not a flat station list, so a journey
can render as "Victoria, 3 stops → change at King's Cross → Piccadilly, 5 stops" with each
segment in its own line colour.

`search.ts` is the Dijkstra, seeded with every node at the origin and stopping at any node
at the destination, which is what lets it choose the line to board rather than being told.
Because transfers are edges with a real cost, "cheapest path" already means "sensible
number of changes" with no special case: at 270 seconds a change has to save more than two
stops to be worth making. It gets Heathrow Terminal 5 to Epping as Elizabeth line, change,
Central, and Morden to High Barnet as thirty stops of Northern with no change at all.

`findJourney` also takes a `via` set that restricts which stations may be passed through,
which is how a puzzle asks whether a route still exists using only the stations named so
far.

## High scores

Two tables, always both. **This browser** is localStorage and never fails. **Everyone** is
a shared board behind `api/scores.ts`, a Vercel Edge Function over a Redis sorted set.

A sorted set is exactly this data structure, so there is no schema: `ZADD` to submit,
`ZREVRANGE` to read, `ZREMRANGEBYRANK` to keep the key bounded. Redis orders by the numeric
score alone, which is KPM, and the finer ordering (accuracy, then who got there first) is
applied after reading using the same comparator the local board uses. Both tables therefore
break ties identically.

Scores are computed in the browser, so **the shared board cannot be made cheat-proof** and
is not presented as if it were. `api/_scoring.ts` rejects the obvious nonsense: a
speed nobody has typed, an accuracy above 1, and a KPM that does not match the stations
claimed in the time claimed. The server stamps its own timestamp so nobody wins a tie by
claiming to have played in 1970, and submissions are rate limited per address.

### Setting up the shared board

Without credentials the endpoint reports itself unavailable, the menu shows local scores
only, and nothing breaks. To turn it on:

1. In the Vercel dashboard, open the project → **Storage** → create an **Upstash for
   Redis** database and connect it to the project. London (lhr1) matches where the
   function runs.
2. That sets `KV_REST_API_URL` and `KV_REST_API_TOKEN` (older integrations use
   `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`; either pair works).
3. Redeploy.

Running `vite dev` locally has no functions behind `/api`, so the shared tab reads as
unavailable there. That path is worth keeping exercised, since it is what every player sees
if the store ever goes down. Use `vercel dev` to run the function alongside the site.

## Menu backdrop

The menu sits on a faint tube map: `public/tube-map-tfl.jpg`, which is TfL's own artwork
from the [standard tube map PDF](https://content.tfl.gov.uk/standard-tube-map.pdf),
cropped to the diagram. That artwork is TfL's copyright and is used here for a personal,
non-commercial project with attribution below. If you are forking this for anything with
a commercial dimension, delete that file and read
[tfl.gov.uk/maplicensing](https://tfl.gov.uk/maplicensing).

Deleting it is safe: `MapBackdrop` falls back to the network drawn from open coordinates
by `src/map/`, the same layout the game runs the train over.

## Attribution

Powered by TfL Open Data. Contains OS data © Crown copyright and database rights.
Not affiliated with, or endorsed by, Transport for London.
