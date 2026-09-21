# LILA BLACK — Player Journey Explorer

A browser tool for the Level Design team to see how players actually move through
LILA BLACK's maps: where they walk, where they fight, where they loot, where the
storm catches them, and which parts of the map nobody ever enters.

Built from 5 days of production telemetry — **89,104 events, 796 matches,
1,242 player journeys, 3 maps**.

### 🔗 Live: **https://lila-player-journey-swart.vercel.app**

### 🎥 Walkthrough: **[docs/walkthrough.mp4](docs/walkthrough.mp4)** — 2:20, every feature, plays in GitHub
### 🧭 [Written walkthrough](#guided-walkthrough) — the same tour as linked steps you can click through

📄 [ARCHITECTURE.md](ARCHITECTURE.md) — design decisions, coordinate mapping, assumptions, trade-offs
📄 [INSIGHTS.md](INSIGHTS.md) — three findings, with the numbers behind them

---

## What it does

- **Journeys on the minimap.** Every player path, projected from world coordinates onto the correct map. Players are cyan, bots violet — distinguishable without reading the legend.
- **Six event markers**, each a distinct shape *and* colour, so they survive greyscale screenshots and colour-vision deficiency: ★ killed a player, ✕ died to a player, ▲ killed a bot, ▼ died to a bot, ⬡ died to the storm, ◆ looted an item.
- **Filter** by map, by any combination of the five days, by individual match, by player/bot, and by event type.
- **Timeline playback** with scrub, play/pause, 1–8× speed and an adjustable trail. Works two ways: replay one match, or scrub match-relative time across every match at once to ask "where is everyone three minutes in?".
- **Four heatmaps** — foot traffic, kill zones, death zones, loot density.
- **Never-visited cells.** Playable ground nobody has ever entered, with ocean and out-of-bounds excluded. The most directly actionable view in the tool.
- **Live stats panel** that recomputes for whatever is on screen — combat mix, event breakdown, map utilisation, storm pressure. Every number is quotable straight into a ticket.

## Tech stack

**Frontend** — Vite · React 19 · TypeScript · deck.gl 9 (`OrthographicView`) · Zustand · Tailwind v4
**Pipeline** — Python 3.11 · pyarrow · pandas · numpy · Pillow
**Hosting** — Vercel (static; no server, no database, no cold starts)

The full dataset is ~8 MB of parquet, small enough to precompute into static
files and serve from a CDN. A first load is about 1 MB.
See [ARCHITECTURE.md](ARCHITECTURE.md) for why, and what was rejected.

## Environment variables

**None.** The tool reads static JSON from its own origin. There is nothing to
configure, no API keys, and no `.env` file.

## Running it locally

### Prerequisites

- Node.js 20+
- Python 3.11+ *(only to regenerate data — the generated bundle is committed, so you can skip straight to step 3)*

### 1. Unpack the raw dataset

The 31 MB source dataset is not committed. Unzip `player_data.zip` into the repo
root so the layout is:

```
player_data/
├── February_10/ … February_14/    1,243 .nakama-0 parquet files
├── minimaps/                      3 minimap images
└── README.md
```

### 2. Regenerate the data bundle

```bash
python -m venv .venv
source .venv/Scripts/activate        # Windows: .venv\Scripts\activate
#  macOS / Linux:  source .venv/bin/activate
pip install -r scripts/requirements.txt

python scripts/optimize_maps.py      # 23 MB of minimaps -> 526 KB of WebP
python scripts/build_data.py         # parquet -> public/data, then self-validates
```

`build_data.py` checks its own output against ground truth measured from the raw
files and exits non-zero if anything drifts:

```
Validation
  [ok ] rows       89,104 (expected 89,104)
  [ok ] matches    796 (expected 796)
  [ok ] journeys   1,242 (expected 1,242)
  ...
  [ok ] 0 points outside the UV box
BUILD OK
```

**Order matters:** `build_data.py` reads the optimised minimaps to work out which
grid cells are playable ground, so run `optimize_maps.py` first.

### 3. Run the app

```bash
npm install
npm run dev          # http://localhost:5173
```

### Other commands

```bash
npm test             # 11 projection tests, incl. the dataset README's worked example
npm run build        # typecheck + production build to dist/
npm run preview      # serve the production build

python scripts/verify_projection.py   # render points over each minimap -> scripts/_verify/
python scripts/verify_coverage.py     # render the coverage grid        -> scripts/_verify/
```

The two `verify_*` scripts are development aids. They exist because a coordinate
projection can pass every numeric test and still be mirrored — the only way to
catch that is to look at it. They are how the coverage-grid flip bug documented
in ARCHITECTURE.md was found.

## Deploying

Static build, no configuration:

```bash
npm i -g vercel
vercel --prod        # build: npm run build   ·   output: dist
```

Or import the repo at [vercel.com/new](https://vercel.com/new) — `vercel.json`
already sets the framework, build command, output directory and long-lived cache
headers for `/data` and `/maps`. Netlify, Cloudflare Pages and GitHub Pages work
equally well; nothing here is Vercel-specific.

This submission is deployed at **https://lila-player-journey-swart.vercel.app**,
which redeploys automatically on push to `main`.

## Guided walkthrough

There are two versions of the same tour.

**[docs/walkthrough.mp4](docs/walkthrough.mp4)** (2:20, 1.6 MB) is a silent
captioned screen capture. It is committed to the repo rather than hosted
elsewhere, because the brief accepts only a GitHub repo link. GitHub plays it
inline — click the file and it streams. It is generated by
`npm run walkthrough`, which drives the real app through the steps below with
Puppeteer and encodes with ffmpeg, so it can be regenerated whenever the tool
changes instead of drifting out of date.

**Or read it here.** Each step below is a link that opens the exact view
described — click it, read the paragraph, move on. No setup, nothing to install.

---

**1 · The opening view** — [open](https://lila-player-journey-swart.vercel.app/)

Ambrose Valley, all five days, foot-traffic heatmap. The tool opens on something
meaningful before you touch a control: Ambrose is the primary map and carries 68%
of all rows.

Look at the heatmap shape. It is not a blob — it resolves the **road network**.
That is the coordinate projection being correct: player positions land on the
roads the art actually draws. The header strip carries the totals the whole tool
is built from: 89,104 events · 796 matches · 1,242 journeys · 248 players · 91 bots.

**2 · Journeys, and telling players from bots** — [open](https://lila-player-journey-swart.vercel.app/?heat=0&paths=1&markers=0)

Heatmap off, raw journey paths on. **Cyan is a human player, violet is a bot**,
with bots drawn thinner and dimmer so they recede. Bots outnumber humans heavily,
and at whole-map scale this is a hairball — which is exactly why the default view
is a heatmap and paths come on when you narrow to a match.

Untick **Bots** in the Actors panel and the map thins out dramatically. That gap
is the subject of INSIGHTS #1.

**3 · Event markers** — [open](https://lila-player-journey-swart.vercel.app/?heat=0&paths=0)

Paths and heatmap off, markers only. Six event types, each a distinct **shape as
well as colour** so they survive a greyscale screenshot or colour-vision
deficiency:

★ killed a player · ✕ died to a player · ▲ killed a bot · ▼ died to a bot ·
⬡ died to the storm · ◆ looted an item

Markers are sized against rarity, not frequency: loot is 12,885 events and drawn
small, the 39 storm deaths and 6 PvP kills are drawn large. Uniform sizing would
bury the interesting events under the common ones. Hover any marker for the event,
actor type, and time into the match.

**4 · Filtering** — [open](https://lila-player-journey-swart.vercel.app/?map=GrandRift&heat=0&paths=0)

Three independent filters that compose: **map** (three buttons, each showing its
event count), **date** (any subset of the five days — selecting Feb 14 warns that
collection stopped at 15:01, so you do not misread a partial day as a collapse),
and **match**.

The match list is sorted by participant count, not by id. That is deliberate:
93% of matches recorded a single participant, so an unsorted list would open on
an empty-feeling match and the tool would look broken.

**5 · Timeline playback** — [open](https://lila-player-journey-swart.vercel.app/?match=fbbc5d02&heat=0)

The one 16-participant match. Selecting a match turns paths on automatically and
scopes the whole right-hand panel to it.

Press **play**. Trails grow from each spawn and fade behind the playhead; speed
runs 1× to 8× and the trail length is adjustable. Getting this working required
catching that the `ts` column is Unix **seconds** stored in a millisecond-typed
field — read literally, every match in this dataset lasts 0.4 seconds. Corrected,
this one runs 8:43.

The timeline also works with no match selected, where it scrubs *match-relative*
time across every match at once: "where is everyone three minutes in?"

**6 · Heatmap metrics** — [kill zones](https://lila-player-journey-swart.vercel.app/?heatmap=kills) · [death zones](https://lila-player-journey-swart.vercel.app/?heatmap=deaths) · [loot density](https://lila-player-journey-swart.vercel.app/?map=GrandRift&heatmap=loot)

Four metrics over the same geometry. Loot density on **Grand Rift** is the clearest
single view in the tool — that minimap carries printed place names, and the hotspot
sits squarely on **Mine Pit** while the outer quarters stay cold. Independent
confirmation that the projection is right, in the art's own labels.

The heatmap deliberately ignores the event-type checkboxes: hiding loot markers to
declutter should not also erase the loot-density overlay.

**7 · Dead ground** — [open](https://lila-player-journey-swart.vercel.app/?map=Lockdown&heat=0&dead=1&markers=0)

The most actionable view here, and the basis of INSIGHTS #3. Red cells are
**playable ground nobody has ever entered**. The ocean is correctly excluded — the
analysis region is derived from the telemetry itself rather than from the raw
image, because measured against the whole square minimap the answer is ~40% and
mostly a statement about how much of the picture is water. See ARCHITECTURE.md,
assumption 5.

Lockdown shows a continuous red ring around the coast plus the **northern port
complex with the bridges** — finished, high-detail content that no player has
entered in five days.

**8 · The stats panel**

Visible throughout, on the right. Everything recomputes against the current
filters, so any number you can see is a number you can paste into a ticket.

**Combat mix** is the one to look at. Across the whole dataset it reads
**0.19% PvP** — 6 player-vs-player events against 3,115 against bots. Narrow to a
single match and it usually reads 0.00%. That reading is what led to INSIGHTS #1,
and to the finding underneath it: only **5 of 796 matches ever contained two
humans**.

---

## Sharing a specific view

The opening view can be seeded from the query string, which is handy for linking
a colleague to exactly what you are looking at:

| Param | Example | Meaning |
|---|---|---|
| `map` | `?map=Lockdown` | `AmbroseValley` · `GrandRift` · `Lockdown` |
| `dates` | `?dates=2026-02-10,2026-02-11` | comma-separated; omit for all |
| `match` | `?match=fbbc5d02` | match id or any unique prefix |
| `heatmap` | `?heatmap=kills` | `traffic` · `kills` · `deaths` · `loot` |
| `heat` `paths` `markers` `dead` | `?dead=1&heat=0` | layer on/off |
| `t` | `?t=180` | start the timeline at 180s |

- [Dead ground on Lockdown](https://lila-player-journey-swart.vercel.app/?map=Lockdown&heat=0&dead=1&markers=0) — the view behind INSIGHTS #3
- [Loot density on Grand Rift](https://lila-player-journey-swart.vercel.app/?map=GrandRift&heatmap=loot) — Mine Pit dominates
- [Kill zones across Ambrose Valley](https://lila-player-journey-swart.vercel.app/?heatmap=kills)
- [The one 16-participant match](https://lila-player-journey-swart.vercel.app/?match=fbbc5d02&heat=0) — press play

This is one-way: the URL seeds the view, and interacting with the tool does not
rewrite it.

## Project layout

```
scripts/
  map_config.py          map geometry + event vocabulary — single source of truth
  build_data.py          parquet -> static bundle, with validation
  optimize_maps.py       minimap downscaling
  verify_projection.py   visual check: points over the minimap
  verify_coverage.py     visual check: coverage grid orientation
public/
  data/                  generated bundle (committed)
  maps/                  generated WebP minimaps (committed)
src/
  lib/projection.ts      world -> UV -> render space. The mapping lives here only.
  lib/projection.test.ts
  lib/dataLoader.ts      fetch + rebuild journeys/markers from columnar arrays
  lib/useMapData.ts      load by map+date, then filter in memory
  lib/palette.ts         colours, marker glyphs, generated icon atlas
  state/                 Zustand store + URL seeding
  components/            MapCanvas (deck.gl) · FilterPanel · Timeline · StatsPanel
```

## Notes on the data

Three things in the raw dataset are not what the dataset README says, and getting
them wrong changes the answers. All three are documented in full in
[ARCHITECTURE.md](ARCHITECTURE.md):

1. **`ts` is Unix seconds in a millisecond-typed column.** Read literally, every match lasts under a second and sits in January 1970.
2. **The minimaps are not 1024×1024** — they are 4320², 2160×2158 and 9000². The projection is normalized so this cannot matter.
3. **Bot detection by ID format is ~99% right, not 100%.** Three numeric-ID users emit human events; the event stream is trusted over the ID.
