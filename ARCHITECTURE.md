# Architecture

## What it is built with, and why

| Layer | Choice | Why |
|---|---|---|
| Data pipeline | Python 3.11 · pyarrow · pandas · Pillow | Run once, offline. pyarrow reads the extension-less parquet directly. |
| Frontend | Vite · React 19 · TypeScript | Fast, boring, no SSR needed for a single-screen tool. |
| Rendering | deck.gl 9 (`OrthographicView`) | Every requirement maps onto a tested layer: `BitmapLayer` for the minimap, `PathLayer`/`TripsLayer` for journeys and playback, `IconLayer` for events, `HeatmapLayer` for density, `PolygonLayer` for dead zones. Pan, zoom and picking come free, and WebGL handles 61k points without thinning. |
| State | Zustand | Filters are read by four sibling components; a store avoids threading props through all of them. |
| Styling | Tailwind v4 | No design system to honour, and utility classes keep the layout next to the markup. |
| Hosting | Vercel, static | There is no server, so there is nothing to keep warm. |

The whole dataset is **89,104 rows / ~8 MB of parquet**. That single fact drives
the design: it is small enough to precompute in full and serve as static files,
so the tool needs no API, no database and no runtime query engine.

## How data flows from parquet to screen

```
player_data/February_*/    1,243 parquet files (~8 MB)
player_data/minimaps/      3 images (23 MB, 4320²–9000²)
          │
          │  scripts/optimize_maps.py
          │    resample to 2048px WebP ....................... 23 MB -> 526 KB
          │
          │  scripts/build_data.py
          │    decode `event` bytes -> str
          │    reinterpret `ts` seconds -> ms              (assumption 1)
          │    classify human vs bot from the event stream (assumption 2)
          │    project world (x, z) -> normalized UV
          │    bucket matches by date                      (assumption 3)
          │    compute match-relative seconds
          │    sort by (match, player, time)
          │    derive the coverage grid + play-space mask  (assumption 5)
          │    validate against measured ground truth
          ▼
public/data/index.json              maps, 796-match catalog, totals   188 KB
public/data/points/{map}_{date}.json  columnar arrays, 15 files       2.7 MB
public/data/coverage/{map}.json       48×48 traffic + play-space grid  24 KB
public/maps/{map}.webp                                                526 KB
          │
          │  plain fetch, CDN-cached, no API
          ▼
src/lib/dataLoader.ts    buildJourneys / buildMarkers / buildTraffic
src/lib/useMapData.ts    fetch by map+date, then filter in memory
src/components/MapCanvas.tsx   deck.gl layer composition
```

A first load is `index.json` + one points file + one minimap — roughly **1 MB**.
Changing a checkbox re-filters arrays already in memory; only changing the map or
the date set touches the network.

**Points files are columnar** — `{u:[…], v:[…], e:[…], b:[…], t:[…], m:[…], p:[…]}`
rather than an array of objects. Smaller on the wire and much cheaper to parse.
They are sorted by `(match, player, time)`, which lets `buildJourneys` rebuild
every player path in one linear scan. That ordering is also why there is **no
per-match file format**: an earlier revision emitted 796 of them, 4.3 MB of a
second copy of the same rows that could drift from the first. It was deleted.

## Coordinate mapping

This is the part the brief called tricky, so it is worth being precise about.

The README gives, per map, a `scale` and an origin, and the conversion:

```
u = (x - origin_x) / scale          # y is elevation — not a map axis
v = (z - origin_z) / scale
pixel_x = u * 1024
pixel_y = (1 - v) * 1024            # image origin is top-left
```

**The scale and origin are correct.** Validated against all 89,104 rows:
**0.00% of points fall outside the [0,1] box** on any of the three maps.

**The 1024 is not.** The shipped minimaps are 4320×4320, 2160×2158 and
9000×9000. So the pipeline never computes pixels. It emits **normalized UV**, and
the renderer lifts UV into a fixed render space of its own choosing:

```ts
// src/lib/projection.ts
export const RENDER_EXTENT = 1000
uvToWorld(u, v) => [u * RENDER_EXTENT, (1 - v) * RENDER_EXTENT]
MAP_BOUNDS = [0, RENDER_EXTENT, RENDER_EXTENT, 0]   // BitmapLayer
```

Two consequences. First, the vertical flip happens **once**, at that boundary,
so no layer can disagree about which way is north. Second, image resolution is
irrelevant to correctness — which is what made it safe to downscale 23 MB of
minimaps to 526 KB without touching a line of projection code.

**How it was verified.** Three ways, because numeric checks alone would not have
caught a mirror:

1. `src/lib/projection.test.ts` (11 tests) asserts the README's own worked example — world `(-301.45, -355.55)` on Ambrose → `u=0.0762, v=0.1305` → pixel `(78, 890)` at 1024px — plus origin/extent corners, the flip direction, and that the real per-map data extents stay inside the unit box.
2. `scripts/verify_projection.py` renders every point over the minimap as a PNG. Movement traces the road network, activity clusters land on settlements, and the cloud stops exactly at the coastline. On Grand Rift the clusters land on the minimap's own printed labels — Mine Pit, Labour Quarters, Burnt Zone.
3. `scripts/verify_coverage.py` does the same for the coverage grid, which is how the grid's vertical flip bug was found (see assumption 5).

## Assumptions where the data was ambiguous

**1 — `ts` is seconds stored in a millisecond field.** The column is
`timestamp[ms]`, but the int64 values are Unix *seconds*. Taken at face value
every match lasts under a second and sits in January 1970. Multiplying by 1000
puts the data in **Feb 9–14 2026**, matching the folder names, with match
durations of 0.2–14.8 min and a clean 5-second position sampling cadence.
*We reinterpret as seconds.* The README's claim that `ts` is "time elapsed within
the match, not wall-clock" is not what the values show — they are wall-clock.
Without this fix the timeline and playback are meaningless.

**2 — Bot detection: the event stream outranks the ID format.** The README says
UUID IDs are humans and numeric IDs are bots. That disagrees with the events for
**3 of 339 users, 943 of 89,104 rows**: users `1379`, `1402` and `1429` have
numeric IDs but emit human-only `Position`/`Loot`, and `1429` emits both
`Position` and `BotPosition`. No UUID user ever emits `BotPosition`. The rule
applied is: emits `BotPosition` and never `Position` → bot; emits `Position` →
human; neither → fall back to ID format. This is why the header reads 248
players / 91 bots rather than 245 / 94.

**3 — Date bucketing by match start.** One match straddles midnight and appears
in two day folders. Each match is assigned the date of its earliest event, so the
date filter never splits a match. Folder-derived dates are used rather than the
UTC date of the corrected timestamp, so the buckets match the five days the brief
describes. (The folders appear to be local-date buckets: Feb 10 starts at
2026-02-09 23:58 UTC.)

**4 — Feb 14 is a partial day.** Collection stops at 15:01. The UI says so
whenever Feb 14 is selected, so a reader does not mistake it for a collapse in
activity.

**5 — "Unused map area" needs a denominator, and the dataset ships none.** The
naive figure — visited cells over the whole square minimap — is about 40%, but
that is mostly a statement about how much of the image is ocean. Two approaches
were tried and rejected: thresholding minimap brightness alone still counts
Lockdown's bright teal ocean as ground, and excluding water by colour is worse —
any blue test aggressive enough to catch that ocean also classifies Lockdown's
slate roads as water (629 false positives). What ships instead derives the
region from the telemetry: everywhere anyone walked, dilated by 2 cells, holes
filled, intersected with non-void minimap art. It is insensitive to the dilation
radius (2 vs 3 cells moves coverage by under 4 points on every map), so it
describes the play space rather than the parameter. **This also surfaced a real
bug:** the brightness grid is indexed from the image top (v=1) while the traffic
grid is indexed from v=0, so the two were mirrored against each other and every
dead zone landed on the wrong side of the map. Caught by looking at the render,
not by a test.

**6 — Grand Rift's minimap is 2160×2158, not square.** The map config uses one
`scale` for both axes, implying a square world region. The 0.09% aspect deviation
is far below one screen pixel, so the source aspect is preserved and nothing is
corrected.

**7 — `match_id` carries a `.nakama-0` server-instance suffix** on every row. It
is stripped; it identifies the server, not the match.

## Trade-offs

| Decision | Alternatives considered | Why this one |
|---|---|---|
| Precompute to static JSON | DuckDB-WASM over the raw parquet; FastAPI backend | 8 MB of source data does not justify a query engine. DuckDB-WASM adds ~3 MB of WASM and 1,243 range requests to first paint; a backend adds a second deploy and free-tier cold starts on the reviewer's first click. Static has no cold start and cannot break. **Cost:** refreshing data means re-running a script and redeploying. |
| deck.gl | Hand-rolled Canvas 2D | Canvas means writing heatmap binning, hit-testing, pan/zoom and an animation loop by hand. deck.gl costs ~325 KB gzipped and gives all four, tested. At 10–15 hours, spending them on product rather than plumbing was the better trade. |
| Commit generated data | Generate during the Vercel build | Vercel would need a Python toolchain and the 31 MB raw dataset in the repo. Committing 3.4 MB of output keeps the build to `npm run build` and the repo self-sufficient. **Cost:** regenerated output shows up in diffs. |
| Columnar JSON | Array-of-objects JSON; typed-array binary | Columnar is several times smaller than AoS and still human-readable and diffable. Binary would shave maybe 40% more and cost all of that. |
| Journeys derived client-side | Ship a per-match file format | The points file is already sorted by (match, player, time), so reconstruction is one linear scan. Shipping both was 4.3 MB of duplicate state that could drift. |
| One-way URL state | Full two-way history sync | `?map=&dates=&match=&heat=` reproduces a view for sharing and screenshots. Two-way sync means writing history on every checkbox for a benefit nobody asked for. |
| Timeline is match-relative | Wall-clock timeline | Every point already carries seconds-since-its-own-match-start, so one scrubber serves both modes: replay a selected match, or ask "where is everyone 3 minutes in?" across every match at once. |
| Fixed 48×48 coverage grid | Adaptive resolution | ~20 m per cell on these maps: fine enough to resolve a building cluster, coarse enough that one stray path does not mark a whole region alive. |

## Verification

```bash
npm test                              # 11 projection tests
python scripts/build_data.py          # rebuilds + self-validates
python scripts/verify_projection.py   # points over minimap  -> scripts/_verify/
python scripts/verify_coverage.py     # coverage grid        -> scripts/_verify/
```

`build_data.py` asserts its output against ground truth measured from the raw
dataset before the pipeline existed — 89,104 rows, 796 matches, 1,242 journeys,
339 users, all eight per-event counts, timestamps inside Feb 2026, and zero
points outside the UV box. A dropped file or a duplicated concat fails the build
rather than quietly shipping.
