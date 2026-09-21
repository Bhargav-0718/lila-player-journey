"""Single source of truth for map geometry, shared by every build script.

These scale/origin values come from the dataset README. We validated them against
all 89,104 rows: 0.00% of points fall outside the [0,1] UV box on any map, so the
config is correct as published and we use it unmodified.

Note the README also claims the minimap images are 1024x1024. They are not
(4320x4320, 2160x2158, 9000x9000). We therefore never work in pixels -- the
projection produces normalized UV and the renderer scales it to whatever size the
image happens to be. See project_uv() below.
"""

MAPS = {
    "AmbroseValley": {
        "display_name": "Ambrose Valley",
        "scale": 900.0,
        "origin_x": -370.0,
        "origin_z": -473.0,
        "source_image": "AmbroseValley_Minimap.png",
    },
    "GrandRift": {
        "display_name": "Grand Rift",
        "scale": 581.0,
        "origin_x": -290.0,
        "origin_z": -290.0,
        "source_image": "GrandRift_Minimap.png",
    },
    "Lockdown": {
        "display_name": "Lockdown",
        "scale": 1000.0,
        "origin_x": -500.0,
        "origin_z": -500.0,
        "source_image": "Lockdown_Minimap.jpg",
    },
}

# Event vocabulary. The index is what gets written into the compact point arrays,
# so the order here is part of the data contract with the frontend.
EVENTS = [
    "Position",
    "BotPosition",
    "Kill",
    "Killed",
    "BotKill",
    "BotKilled",
    "KilledByStorm",
    "Loot",
]
EVENT_INDEX = {name: i for i, name in enumerate(EVENTS)}

# Resolution of the map-coverage / dead-zone grid, in cells per axis.
COVERAGE_GRID = 48

# Luminance above which a minimap cell counts as playable ground rather than
# ocean or out-of-bounds void.
#
# The dataset ships no playable-area mask, but every minimap renders the void
# as near-black, so the art itself carries the boundary. Sweeping the threshold
# from 8 to 35 moves the in-map cell count by under two percentage points on
# GrandRift and Lockdown -- the edge is sharp, not a gradient -- so 18 is a
# safe middle. This matters because "40% of the map is unused" is a very
# different claim from "40% of the *square image* is unused", and most of that
# square is water.
LAND_LUMA_THRESHOLD = 18

# How far the play space is taken to extend beyond where anyone actually
# walked, in grid cells (~2% of map width each). Ground within this fringe of
# real traffic is treated as reachable; everything past it is out of scope.
ENVELOPE_DILATION = 2


def project_uv(x, z, map_id):
    """World (x, z) -> normalized UV in [0, 1].

    The `y` column is elevation and is deliberately unused for 2D plotting.
    Returns raw UV; the vertical flip is applied once at the render boundary
    (see src/lib/projection.ts) rather than being baked into the data.
    """
    cfg = MAPS[map_id]
    u = (x - cfg["origin_x"]) / cfg["scale"]
    v = (z - cfg["origin_z"]) / cfg["scale"]
    return u, v
