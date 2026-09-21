"""Render the coverage grid over each minimap, to check orientation and region.

Green = ground players entered. Red = ground inside the play space that nobody
ever entered. Uncoloured = outside the analysis region (ocean, void, far
out-of-bounds).

    python scripts/verify_coverage.py

The vertical flip between image rows and grid rows is exactly the kind of bug
that produces confident, wrong answers, so it gets looked at rather than
assumed. Writes scripts/_verify/coverage_<map>.png.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

from map_config import MAPS

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data" / "coverage"
MAPS_DIR = ROOT / "public" / "maps"
OUT = Path(__file__).resolve().parent / "_verify"

SIZE = 900


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for map_id in MAPS:
        cov = json.loads((DATA / ("%s.json" % map_id)).read_text())
        n = cov["grid"]
        counts = np.array(cov["counts"]).reshape(n, n)
        playable = np.array(cov["playable"]).reshape(n, n).astype(bool)

        base = Image.open(MAPS_DIR / ("%s.webp" % map_id)).convert("RGBA").resize(
            (SIZE, SIZE), Image.LANCZOS
        )
        layer = np.zeros((n, n, 4), dtype=np.uint8)
        layer[(counts > 0)] = (60, 220, 140, 70)
        layer[playable & (counts == 0)] = (255, 60, 90, 130)

        # Grid row 0 is v=0, which is the BOTTOM of the image, so flip before
        # compositing. Get this wrong and the overlay mirrors.
        img = Image.fromarray(np.flipud(layer), "RGBA").resize((SIZE, SIZE), Image.NEAREST)
        Image.alpha_composite(base, img).convert("RGB").save(
            OUT / ("coverage_%s.png" % map_id)
        )
        print(
            "  %-14s visited=%d dead=%d playable=%d (%.1f%%)"
            % (
                map_id,
                cov["visitedCells"],
                cov["deadCells"],
                cov["playableCells"],
                cov["coveragePct"],
            )
        )


if __name__ == "__main__":
    main()
