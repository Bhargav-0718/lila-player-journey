"""Turn the raw LILA BLACK telemetry into a static bundle the browser can fetch.

Run once; the output under public/data and public/maps is committed so that the
Vercel build needs no Python and the deployed tool has no backend.

    python scripts/build_data.py

Everything the pipeline corrects or assumes about the raw data is flagged with an
ASSUMPTION comment and mirrored in ARCHITECTURE.md.
"""

from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow.parquet as pq

from PIL import Image

from map_config import (
    COVERAGE_GRID,
    ENVELOPE_DILATION,
    EVENT_INDEX,
    EVENTS,
    LAND_LUMA_THRESHOLD,
    MAPS,
    project_uv,
)

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "player_data"
OUT = ROOT / "public" / "data"

DAY_DIR = re.compile(r"^February_(\d{2})$")

# The dataset covers Feb 2026. Folder names carry no year.
YEAR = 2026

MOVEMENT = ("Position", "BotPosition")


# --------------------------------------------------------------------------
# Load
# --------------------------------------------------------------------------

def load_raw() -> pd.DataFrame:
    if not RAW.is_dir():
        sys.exit("Raw data not found at %s. Unzip player_data.zip there first." % RAW)

    frames, skipped = [], []
    for day_dir in sorted(p for p in RAW.iterdir() if p.is_dir() and DAY_DIR.match(p.name)):
        date = "%d-02-%s" % (YEAR, DAY_DIR.match(day_dir.name).group(1))
        for f in sorted(day_dir.iterdir()):
            # Skip .DS_Store and any other dotfile the zip carried along.
            if not f.is_file() or f.name.startswith("."):
                continue
            try:
                df = pq.read_table(f).to_pandas()
            except Exception as exc:  # pragma: no cover - defensive
                skipped.append((f.name, str(exc)[:80]))
                continue
            df["date"] = date
            frames.append(df)

    if skipped:
        print("  ! skipped %d unreadable file(s): %s" % (len(skipped), skipped[:3]))
    if not frames:
        sys.exit("No parquet files found.")

    df = pd.concat(frames, ignore_index=True)

    # The `event` column is parquet binary, not string.
    df["event"] = df["event"].map(
        lambda b: b.decode("utf-8") if isinstance(b, (bytes, bytearray)) else b
    )

    # ASSUMPTION (timestamp): `ts` is typed timestamp[ms] but the underlying
    # int64 values are Unix *seconds*. Read as published, every match lasts a
    # fraction of a second and sits in Jan 1970. Reinterpreting as seconds puts
    # the data in Feb 2026 -- matching the folder names -- with match durations
    # of 0.2-14.8 min and a 5 s position sampling cadence. We reinterpret.
    df["ts_ms"] = df["ts"].astype("int64") * 1000
    df["t"] = pd.to_datetime(df["ts_ms"], unit="ms")

    # `match_id` carries a `.nakama-0` server-instance suffix on every row; it is
    # noise for our purposes and makes for unwieldy filenames.
    df["match_id"] = df["match_id"].str.replace(".nakama-0", "", regex=False)

    return df


# --------------------------------------------------------------------------
# Classify
# --------------------------------------------------------------------------

def classify_entities(df: pd.DataFrame) -> dict:
    """Decide human vs bot per user_id.

    ASSUMPTION (bot detection): the README says UUID user_ids are humans and
    numeric ones are bots. That disagrees with the event stream for 3 of 339
    users (943 of 89,104 rows): users 1379, 1402 and 1429 have numeric ids but
    emit human-only `Position`/`Loot` events, and 1429 emits both `Position` and
    `BotPosition`. No UUID user ever emits `BotPosition`.

    We trust the event stream over the id format, because the event type is what
    the game server actually recorded about the entity:
      1. emits BotPosition and never Position -> bot
      2. emits Position                       -> human
      3. neither                              -> fall back to id format
    """
    is_bot = {}
    for uid, ev in df.groupby("user_id")["event"]:
        kinds = set(ev)
        if "BotPosition" in kinds and "Position" not in kinds:
            is_bot[uid] = True
        elif "Position" in kinds:
            is_bot[uid] = False
        else:
            # UUIDs contain hyphens, numeric bot ids do not.
            is_bot[uid] = "-" not in uid
    return is_bot


# --------------------------------------------------------------------------
# Build
# --------------------------------------------------------------------------

def build() -> None:
    print("Loading raw parquet ...")
    df = load_raw()
    print("  %s rows from %s matches" % (format(len(df), ","), format(df["match_id"].nunique(), ",")))

    is_bot = classify_entities(df)
    df["is_bot"] = df["user_id"].map(is_bot)

    naive = ~df["user_id"].str.contains("-")
    reclassified = int((naive != df["is_bot"]).sum())
    print("  bot rule reclassified %s rows vs the naive id-format heuristic" % format(reclassified, ","))

    # Project world -> UV per map, so each map's scale/origin is applied once.
    df["u"] = np.nan
    df["v"] = np.nan
    for map_id in df["map_id"].unique():
        if map_id not in MAPS:
            sys.exit("Unknown map_id in data: %s" % map_id)
        m = df["map_id"] == map_id
        u, v = project_uv(df.loc[m, "x"].to_numpy(), df.loc[m, "z"].to_numpy(), map_id)
        df.loc[m, "u"] = u
        df.loc[m, "v"] = v

    oob = int(((df.u < 0) | (df.u > 1) | (df.v < 0) | (df.v > 1)).sum())
    print("  out-of-bounds points after projection: %d (%.3f%%)" % (oob, oob / len(df) * 100))

    df["e"] = df["event"].map(EVENT_INDEX).astype("int16")

    # ASSUMPTION (date bucketing): one match straddles midnight and therefore
    # appears in two day folders. We assign every match to the date of its
    # earliest event so a match is never split by the date filter, and we use
    # the folder-derived date rather than the UTC date of the corrected
    # timestamp so the buckets line up with the 5 days the brief describes.
    match_date = df.sort_values("ts_ms").groupby("match_id")["date"].first()
    df["date"] = df["match_id"].map(match_date)

    # Match-relative seconds, for the timeline. Absolute wall-clock stays in the
    # catalog; on the timeline a designer only cares about time since start.
    match_start = df.groupby("match_id")["ts_ms"].transform("min")
    df["t_rel"] = ((df["ts_ms"] - match_start) / 1000.0).round(1)

    # Stable global indices referenced from the compact point arrays.
    players = sorted(df["user_id"].unique())
    player_ix = {p: i for i, p in enumerate(players)}
    df["p"] = df["user_id"].map(player_ix).astype("int32")

    matches = build_match_catalog(df)
    match_ix = {m["id"]: i for i, m in enumerate(matches)}
    df["m"] = df["match_id"].map(match_ix).astype("int32")

    OUT.mkdir(parents=True, exist_ok=True)
    write_points(df)
    write_coverage(df)
    write_index(df, matches, players, is_bot)
    validate(df, matches)


def build_match_catalog(df: pd.DataFrame) -> list:
    rows = []
    for mid, g in df.groupby("match_id"):
        counts = g["event"].value_counts()
        participants = g.groupby("user_id")["is_bot"].first()
        start_ms = int(g["ts_ms"].min())
        rows.append(
            {
                "id": mid,
                "map": g["map_id"].iloc[0],
                "date": g["date"].iloc[0],
                "startMs": start_ms,
                "durationS": round((int(g["ts_ms"].max()) - start_ms) / 1000.0, 1),
                "players": int(len(participants)),
                "humans": int((~participants).sum()),
                "bots": int(participants.sum()),
                "rows": int(len(g)),
                "events": {e: int(counts.get(e, 0)) for e in EVENTS if counts.get(e, 0)},
            }
        )
    # Populated matches first: 75% of matches have a single participant, so
    # without this the match picker opens on an empty-feeling match.
    rows.sort(key=lambda r: (-r["players"], -r["rows"]))
    return rows


def write_points(df: pd.DataFrame) -> None:
    """Per map+date columnar arrays -- the single representation of the data.

    Parallel arrays rather than an array of objects: far smaller on the wire and
    much cheaper to parse.

    Sorted by (match, player, time), which is what lets the frontend rebuild
    player journeys with one linear scan. That ordering is the reason we do not
    also ship a per-match file format: a second copy of the same rows would be
    4.3 MB of redundancy that can drift from this one.
    """
    out = OUT / "points"
    out.mkdir(parents=True, exist_ok=True)
    total = 0
    files = 0
    for (map_id, date), g in df.groupby(["map_id", "date"]):
        g = g.sort_values(["m", "p", "ts_ms"])
        payload = {
            "map": map_id,
            "date": date,
            "count": int(len(g)),
            # 4 decimals of UV is sub-pixel even on the 4320px minimap.
            "u": [round(float(x), 4) for x in g["u"]],
            "v": [round(float(x), 4) for x in g["v"]],
            "e": [int(x) for x in g["e"]],
            "b": [int(x) for x in g["is_bot"]],
            "t": [float(x) for x in g["t_rel"]],
            "m": [int(x) for x in g["m"]],
            "p": [int(x) for x in g["p"]],
        }
        (out / ("%s_%s.json" % (map_id, date))).write_text(json.dumps(payload, separators=(",", ":")))
        total += len(g)
        files += 1
    print("  wrote %s points across %d map/date files" % (format(total, ","), files))


def luma_grid(map_id: str, n: int) -> np.ndarray:
    """Minimap brightness per coverage cell.

    Row 0 is v=0. The image's row 0 is its *top*, which is v=1, so the array is
    flipped -- without that, the brightness mask and the traffic grid are
    mirrored against each other and every dead zone lands on the wrong side of
    the map.
    """
    src = ROOT / "public" / "maps" / ("%s.webp" % map_id)
    if not src.exists():
        sys.exit("Missing %s -- run scripts/optimize_maps.py first." % src)
    img = Image.open(src).convert("L").resize((n, n), Image.BOX)
    return np.flipud(np.asarray(img, dtype=float))


def _dilate(mask: np.ndarray, k: int) -> np.ndarray:
    """Grow a boolean mask by k cells, 4-connected."""
    out = mask.copy()
    for _ in range(k):
        p = np.pad(out, 1, constant_values=False)
        out = out | p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]
    return out


def _fill_holes(mask: np.ndarray) -> np.ndarray:
    """Fill enclosed pockets: flood the False region inward from the border."""
    h, w = mask.shape
    outside = np.zeros_like(mask)
    stack = [(r, c) for r in range(h) for c in (0, w - 1) if not mask[r, c]]
    stack += [(r, c) for c in range(w) for r in (0, h - 1) if not mask[r, c]]
    while stack:
        r, c = stack.pop()
        if outside[r, c] or mask[r, c]:
            continue
        outside[r, c] = True
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            rr, cc = r + dr, c + dc
            if 0 <= rr < h and 0 <= cc < w and not outside[rr, cc] and not mask[rr, cc]:
                stack.append((rr, cc))
    return mask | ~outside


def analysis_region(visited: np.ndarray, luma: np.ndarray) -> np.ndarray:
    """The ground a coverage figure should be measured against.

    "What fraction of the map is unused?" is only meaningful against a
    denominator of ground players could plausibly use. The dataset ships no
    playable-area mask, and colour heuristics are unreliable -- Lockdown's
    slate roads classify as water under any blue test aggressive enough to
    catch its ocean.

    So the region is derived from the telemetry instead: take everywhere anyone
    walked, grow it by ENVELOPE_DILATION cells, fill the enclosed pockets, and
    keep only cells the minimap draws as something rather than void. That reads
    as "the area players operate in, plus its immediate fringe", which is
    exactly the frame a level designer cares about. Ocean and far out-of-bounds
    fall outside it automatically.

    The result is insensitive to the dilation radius -- 2 and 3 cells differ by
    under 4 percentage points of coverage on every map -- so it is describing
    the play space, not the parameter.
    """
    envelope = _fill_holes(_dilate(visited, ENVELOPE_DILATION))
    return envelope & ((luma > LAND_LUMA_THRESHOLD) | visited)


def write_coverage(df: pd.DataFrame) -> None:
    """Movement density per grid cell, plus which cells are playable at all."""
    out = OUT / "coverage"
    out.mkdir(parents=True, exist_ok=True)
    moves = df[df["event"].isin(MOVEMENT)]
    n = COVERAGE_GRID

    for map_id, g in moves.groupby("map_id"):
        cu = np.clip((g["u"].to_numpy() * n).astype(int), 0, n - 1)
        cv = np.clip((g["v"].to_numpy() * n).astype(int), 0, n - 1)
        grid = np.zeros((n, n), dtype=int)
        np.add.at(grid, (cv, cu), 1)

        visited = grid > 0
        playable = analysis_region(visited, luma_grid(map_id, n))
        dead = playable & ~visited

        payload = {
            "map": map_id,
            "grid": n,
            "counts": grid.flatten().tolist(),  # row-major, v-major
            "playable": playable.flatten().astype(int).tolist(),
            "max": int(grid.max()),
            "visitedCells": int(visited.sum()),
            "playableCells": int(playable.sum()),
            "deadCells": int(dead.sum()),
            "totalCells": n * n,
            # Share of the play space players ever set foot on. Measured
            # against the whole square image this would read ~40%, which is
            # mostly a statement about how much of the picture is ocean.
            "coveragePct": round(visited.sum() / playable.sum() * 100, 1),
        }
        (out / ("%s.json" % map_id)).write_text(json.dumps(payload, separators=(",", ":")))
        print("  coverage %-14s %5.1f%% of playable ground visited "
              "(%d dead cells of %d playable)"
              % (map_id, payload["coveragePct"], payload["deadCells"],
                 payload["playableCells"]))


def write_index(df: pd.DataFrame, matches: list, players: list, is_bot: dict) -> None:
    per_map_date = defaultdict(dict)
    for (map_id, date), g in df.groupby(["map_id", "date"]):
        counts = g["event"].value_counts()
        per_map_date[map_id][date] = {
            "rows": int(len(g)),
            "matches": int(g["match_id"].nunique()),
            "events": {e: int(counts.get(e, 0)) for e in EVENTS if counts.get(e, 0)},
        }

    index = {
        "generatedAt": pd.Timestamp.now("UTC").isoformat(),
        "maps": {
            mid: {
                "id": mid,
                "displayName": cfg["display_name"],
                "scale": cfg["scale"],
                "originX": cfg["origin_x"],
                "originZ": cfg["origin_z"],
                "image": "/maps/%s.webp" % mid,
                "dates": sorted(per_map_date[mid].keys()),
                "stats": per_map_date[mid],
            }
            for mid, cfg in MAPS.items()
            if mid in per_map_date
        },
        "dates": sorted(df["date"].unique().tolist()),
        "events": EVENTS,
        "players": players,
        "playerIsBot": [int(is_bot[p]) for p in players],
        "matches": matches,
        "totals": {
            "rows": int(len(df)),
            "matches": int(df["match_id"].nunique()),
            "journeys": int(df.groupby(["user_id", "match_id"]).ngroups),
            "players": len(players),
            "humans": int(sum(1 for p in players if not is_bot[p])),
            "bots": int(sum(1 for p in players if is_bot[p])),
            "events": {e: int((df["event"] == e).sum()) for e in EVENTS},
        },
    }
    (OUT / "index.json").write_text(json.dumps(index, separators=(",", ":")))
    print("  wrote index.json (%.0f KB)" % ((OUT / "index.json").stat().st_size / 1024))


# --------------------------------------------------------------------------
# Validate
# --------------------------------------------------------------------------

# Ground truth measured from the raw dataset before the pipeline was written.
# If the pipeline ever drops a file or double-counts a concat, these catch it.
EXPECTED_EVENTS = {
    "Position": 51347,
    "BotPosition": 21712,
    "Loot": 12885,
    "BotKill": 2415,
    "BotKilled": 700,
    "KilledByStorm": 39,
    "Kill": 3,
    "Killed": 3,
}
EXPECTED = {"rows": 89104, "matches": 796, "journeys": 1242, "players": 339}


def validate(df: pd.DataFrame, matches: list) -> None:
    print("\nValidation")
    ok = True

    actual = {
        "rows": len(df),
        "matches": df["match_id"].nunique(),
        "journeys": df.groupby(["user_id", "match_id"]).ngroups,
        "players": df["user_id"].nunique(),
    }
    for k, want in EXPECTED.items():
        got = actual[k]
        ok &= got == want
        print("  [%s] %-10s %s (expected %s)" % ("ok " if got == want else "FAIL", k, format(got, ","), format(want, ",")))

    for e, want in EXPECTED_EVENTS.items():
        got = int((df["event"] == e).sum())
        ok &= got == want
        print("  [%s] %-14s %s (expected %s)" % ("ok " if got == want else "FAIL", e, format(got, ","), format(want, ",")))

    lo, hi = df["t"].min(), df["t"].max()
    in_range = pd.Timestamp("2026-02-09") <= lo and hi <= pd.Timestamp("2026-02-15")
    ok &= in_range
    print("  [%s] timestamps %s -> %s (expect Feb 2026)" % ("ok " if in_range else "FAIL", lo, hi))

    durs = [m["durationS"] for m in matches]
    sane = all(0 <= d < 1200 for d in durs)
    ok &= sane
    print("  [%s] match durations %.0f-%.0fs, mean %.1f min"
          % ("ok " if sane else "FAIL", min(durs), max(durs), sum(durs) / len(durs) / 60))

    oob = int(((df.u < 0) | (df.u > 1) | (df.v < 0) | (df.v > 1)).sum())
    ok &= oob == 0
    print("  [%s] %d points outside the UV box" % ("ok " if oob == 0 else "FAIL", oob))

    print("\nBUILD OK" if ok else "\nBUILD FAILED VALIDATION")
    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    build()
