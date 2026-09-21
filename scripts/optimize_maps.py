"""Downscale the source minimaps into web-sized WebP.

The originals are 4320x4320, 2160x2158 and 9000x9000 -- 23 MB in total, which is
absurd to ship to a browser that renders them into at most ~1200 CSS pixels.

    python scripts/optimize_maps.py

Note the dataset README states the minimaps are 1024x1024. They are not. Because
the renderer works in normalized UV rather than pixels, the true source size is
irrelevant to correctness -- we can resample freely without touching the
projection. That is exactly why the projection is normalized.
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

from map_config import MAPS

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "player_data" / "minimaps"
OUT = ROOT / "public" / "maps"

# 2048 is comfortably beyond what the viewport shows even when zoomed in, and
# keeps each map around 300 KB.
TARGET = 2048
QUALITY = 82


def main() -> None:
    if not SRC.is_dir():
        sys.exit("Minimaps not found at %s. Unzip player_data.zip there first." % SRC)

    OUT.mkdir(parents=True, exist_ok=True)
    for map_id, cfg in MAPS.items():
        src = SRC / cfg["source_image"]
        if not src.exists():
            sys.exit("Missing minimap: %s" % src)

        img = Image.open(src).convert("RGB")
        w, h = img.size

        # GrandRift is 2160x2158, not square. The map config uses a single
        # `scale` for both axes, implying a square world region, so we preserve
        # the source aspect rather than forcing a square and shifting the art by
        # a pixel. The 0.09% deviation is far below one screen pixel.
        ratio = TARGET / max(w, h)
        size = (max(1, round(w * ratio)), max(1, round(h * ratio)))
        img = img.resize(size, Image.LANCZOS)

        dst = OUT / ("%s.webp" % map_id)
        img.save(dst, "WEBP", quality=QUALITY, method=6)

        print("  %-14s %dx%d (%.1f MB) -> %dx%d (%.0f KB)"
              % (map_id, w, h, src.stat().st_size / 1e6,
                 size[0], size[1], dst.stat().st_size / 1024))


if __name__ == "__main__":
    main()
