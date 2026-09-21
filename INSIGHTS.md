# Three things the data told us

Every number below was read off the tool itself — the figures in the Selection,
Combat mix and Map utilisation panels are computed from the same filtered arrays
the map draws, so each claim can be reproduced by setting the stated filters.

---

## 1. LILA BLACK is not a PvP game right now — players are almost never in the same match

**What caught the eye.** Turning off every event except *Killed a player* and
*Died to a player* leaves an empty map. Not sparse — empty. The Combat mix bar
sits at 0.19% across the whole dataset.

**The numbers.**

| | |
|---|---|
| `Kill` + `Killed` events (player vs player) | **6** of 89,104 rows |
| `BotKill` + `BotKilled` events (player vs bot) | **3,115** |
| PvP share of all combat | **0.19%** |
| Matches containing any PvP at all | **3** of 796 |
| **Matches containing 2 or more humans** | **5** of 796 |
| Mean humans per match | **1.01** |
| Matches with only one recorded participant | 743 of 796 (93.3%) |

The last three rows are the actual story. PvP isn't rare because players are
avoiding each other — it's rare because **they are never put in the same match**.
Matchmaking is filling lobbies with bots around a single human. 605 of 796
matches contain a bot kill, so combat is working fine; it just only ever happens
against AI.

**What to do about it.** This is a matchmaking and concurrency problem that
lands on level design, because it invalidates the assumptions maps are built
under. Concretely:

- *Metrics affected:* PvP encounter rate, humans-per-match, time-to-first-player-contact, extraction contest rate.
- *Actions:* (a) confirm whether this is a population floor or a matchmaker bug before shipping any more map area — the answer changes everything downstream; (b) if it is a population floor, widen matchmaking windows or pool across regions; (c) if maps are sized for 10+ humans and are receiving 1, they are effectively single-player PvE levels and should be tuned as such until concurrency recovers.

**Why a level designer should care.** Every map decision that depends on players
meeting — chokepoints, contested loot, extraction standoffs, sightline balance —
is currently untested. The maps have never actually been played the way they
were designed to be played.

---

## 2. The storm is not applying pressure

**What caught the eye.** *Died to the storm* is the rarest marker on every map,
and the few that exist are scattered around the edges rather than forming the
trailing wall you would expect from an advancing storm.

**The numbers.**

| | |
|---|---|
| `KilledByStorm` events | **39** across 796 matches |
| Matches with at least one storm death | **39** (4.9%) — never more than one |
| Storm deaths per match | **0.049** |
| Median match duration | **6:22** |
| 90th percentile / longest match | **11:59** / **14:50** |

A one-directional storm that is meant to force players to move and extract kills
someone in one match out of twenty. Meanwhile half of all matches end inside
6½ minutes — well before any storm pressure would bite.

**What to do about it.** Either the storm is too slow, or matches are ending for
other reasons long before it becomes relevant. The tool distinguishes these:
scrub the timeline on a long match and watch whether players are still moving
freely at the end.

- *Metrics affected:* storm-death rate, match duration distribution, extraction timing, % of matches ending by extraction vs. elimination.
- *Actions:* (a) accelerate the storm or start it earlier so it intersects the median 6½-minute match; (b) instrument extraction events — the current schema has no extraction event, so we cannot tell a successful extraction from an abandoned match, which is a telemetry gap worth closing; (c) if matches are ending early because a solo player finishes looting and leaves, that is insight #1 again.

**Why a level designer should care.** The storm is the mechanic that is supposed
to turn a static map into a shrinking one and drive players through your
chokepoints on your schedule. At 0.049 deaths per match it is doing none of that,
so the map is being played as an open sandbox with no directional pressure.

---

## 3. Players hug the interior — the built perimeter is dead ground

**What caught the eye.** Switching on *Never-visited cells* with the heatmap off
shows a consistent shape on all three maps: a solid green interior ringed by red.
On Lockdown the red covers the entire coastal edge **and the northern port
complex with the bridges** — fully built, high-detail content that nobody enters.

**The numbers.** Measured on a 48×48 grid against the play space (the traffic
footprint plus a two-cell fringe, with ocean and out-of-bounds void excluded —
see ARCHITECTURE.md, as this denominator matters):

| Map | Playable ground entered | Dead cells | Playable cells |
|---|---|---|---|
| Ambrose Valley | **83.6%** | 184 | 1,123 |
| Grand Rift | **75.4%** | 239 | 973 |
| Lockdown | **74.9%** | 224 | 893 |

Lockdown is described as the smaller, close-quarters map and has the *worst*
utilisation of the three. Its dead cells are not scattered noise — they form a
continuous perimeter band plus one large named area in the north.

Turning on the loot heatmap over the same view shows why: loot density follows
the same interior cluster. Players go where the loot is, and the loot is not on
the perimeter. On Grand Rift the effect is visible by name — Mine Pit is a single
dominant hotspot while the outer quarters stay cold.

**What to do about it.** This is the most directly actionable finding here,
because it is a map-geometry problem with map-geometry fixes.

- *Metrics affected:* map utilisation %, dead-cell count, loot-pickup spatial distribution, average distance travelled per match.
- *Actions:* (a) move loot spawns or an objective into the Lockdown north port complex and re-measure — it is finished content earning nothing; (b) on all three maps, either pull the playable boundary inward to match where people actually go, or give the perimeter a reason to exist; (c) treat the 48×48 dead-cell count as a pre-ship check on future maps.

**Why a level designer should care.** A quarter of Lockdown's buildable area is
art and collision that no player has ever seen. That is either wasted budget or
an untapped opportunity, and the overlay says exactly which cells to argue about.

---

## Also worth flagging

Not a level-design insight, so not one of the three, but it is the loudest trend
in the dataset and anyone reading the above should know about it:

**Activity fell 61% over four full days.** Matches per day: 285 → 200 → 162 → 112
(Feb 10–13). Feb 14 is a partial day, cut off at 15:01, and should not be read as
a further collapse. Any rate-based comparison across this window is measuring a
shrinking population as much as anything else — which is worth remembering before
concluding that a map change did or did not work.
