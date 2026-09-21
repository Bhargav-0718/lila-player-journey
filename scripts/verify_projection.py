"""Render projected telemetry over each minimap as a PNG, to eyeball orientation.

A projection can satisfy every numeric bounds check and still be mirrored or
rotated. The only way to catch that is to look at it: real player paths hug
roads, buildings and corridors. If the overlay looks like confetti sprayed over
terrain, the flip is wrong.

    python scripts/verify_projection.py

Writes scripts/_verify/<map>.png. These are a development aid, not a build
artifact.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

from map_config import EVENTS

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data"
MAPS_DIR = ROOT / "public" / "maps"
OUT = Path(__file__).resolve().parent / "_verify"

SIZE = 1000  # render size for the check image

# Movement in cool grey, combat hot, loot gold -- enough to read structure.
COLORS = {
    "Position": (80, 220, 255, 90),
    "BotPosition": (150, 130, 200, 55),
    "Kill": (255, 60, 60, 255),
    "Killed": (255, 60, 60, 255),
    "BotKill": (255, 140, 40, 200),
    "BotKilled": (255, 90, 120, 200),
    "KilledByStorm": (170, 100, 255, 255),
    "Loot": (255, 210, 60, 150),
}


def main() -> None:
    index = json.loads((DATA / "index.json").read_text())
    OUT.mkdir(exist_ok=True)

    for map_id, cfg in index["maps"].items():
        base = Image.open(MAPS_DIR / ("%s.webp" % map_id)).convert("RGBA")
        base = base.resize((SIZE, SIZE), Image.LANCZOS)
        # Dim the map so the overlay reads clearly.
        base = Image.blend(base, Image.new("RGBA", base.size, (0, 0, 0, 255)), 0.45)
        layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(layer)

        plotted = 0
        for date in cfg["dates"]:
            pts = json.loads((DATA / "points" / ("%s_%s.json" % (map_id, date))).read_text())
            for u, v, e in zip(pts["u"], pts["v"], pts["e"]):
                name = EVENTS[e]
                # Same flip the renderer applies: v=1 is the top of the image.
                px = u * SIZE
                py = (1.0 - v) * SIZE
                r = 1 if name in ("Position", "BotPosition") else 4
                draw.ellipse([px - r, py - r, px + r, py + r], fill=COLORS[name])
                plotted += 1

        out = Image.alpha_composite(base, layer)
        dst = OUT / ("%s.png" % map_id)
        out.convert("RGB").save(dst, quality=90)
        print("  %-14s %s points -> %s" % (map_id, format(plotted, ","), dst.name))


if __name__ == "__main__":
    sys.exit(main())
