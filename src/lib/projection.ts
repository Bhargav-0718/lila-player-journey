/**
 * World coordinates -> render space. The one place the mapping lives.
 *
 * The dataset README gives a per-map `scale` and `origin`, and states that the
 * minimap images are 1024x1024. The scale/origin are correct -- we validated
 * them against all 89,104 rows and zero points fall outside the unit box. The
 * image size is not: the real files are 4320x4320, 2160x2158 and 9000x9000.
 *
 * So we never compute pixels from world coordinates. The pipeline emits
 * normalized UV in [0, 1], and this module lifts UV into a fixed render space
 * whose size is our choice, not the image's. Swapping in a different minimap
 * resolution (as `scripts/optimize_maps.py` does, downscaling 23 MB to 526 KB)
 * cannot break the overlay.
 */

/**
 * Size of the square render space, in deck.gl world units.
 *
 * Arbitrary and deliberately decoupled from any image dimension -- it exists
 * only so that layer sizes (line widths, marker radii, grid cells) are written
 * in comprehensible numbers instead of ten-thousandths.
 */
export const RENDER_EXTENT = 1000

export interface MapGeometry {
  scale: number
  originX: number
  originZ: number
}

/**
 * Raw world (x, z) -> normalized UV in [0, 1].
 *
 * `y` is elevation in the 3D world, not a map axis, and is intentionally
 * ignored for 2D plotting.
 */
export function worldToUv(x: number, z: number, geom: MapGeometry): [number, number] {
  return [(x - geom.originX) / geom.scale, (z - geom.originZ) / geom.scale]
}

/**
 * Normalized UV -> render-space position.
 *
 * The vertical flip lives here and nowhere else. Image space runs top-down
 * while world Z runs bottom-up, so v = 1 is the top edge of the minimap. Doing
 * this once, at the boundary, is what keeps every layer agreeing on which way
 * is north.
 */
export function uvToWorld(u: number, v: number): [number, number] {
  return [u * RENDER_EXTENT, (1 - v) * RENDER_EXTENT]
}

/** Render-space bounds of the minimap image, as `BitmapLayer` wants them. */
export const MAP_BOUNDS: [number, number, number, number] = [
  0,
  RENDER_EXTENT,
  RENDER_EXTENT,
  0,
]

/** Convenience for tests and tooling: world -> render space in one hop. */
export function worldToRender(
  x: number,
  z: number,
  geom: MapGeometry,
): [number, number] {
  const [u, v] = worldToUv(x, z, geom)
  return uvToWorld(u, v)
}

/**
 * Zoom level that fits the whole map into a viewport of `px` pixels.
 * deck.gl orthographic zoom is log2(pixels per world unit).
 */
export function fitZoom(px: number): number {
  return Math.log2(px / RENDER_EXTENT)
}
