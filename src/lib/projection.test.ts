import { describe, expect, it } from 'vitest'

import {
  MAP_BOUNDS,
  RENDER_EXTENT,
  fitZoom,
  uvToWorld,
  worldToUv,
} from './projection'

/** Map geometry exactly as published in the dataset README. */
const AMBROSE = { scale: 900, originX: -370, originZ: -473 }
const GRAND_RIFT = { scale: 581, originX: -290, originZ: -290 }
const LOCKDOWN = { scale: 1000, originX: -500, originZ: -500 }

describe('worldToUv', () => {
  it('reproduces the worked example from the dataset README', () => {
    // README: world x=-301.45, z=-355.55 on AmbroseValley
    //   u = (-301.45 + 370) / 900 = 0.0762
    //   v = (-355.55 + 473) / 900 = 0.1305
    const [u, v] = worldToUv(-301.45, -355.55, AMBROSE)
    expect(u).toBeCloseTo(0.0762, 4)
    expect(v).toBeCloseTo(0.1305, 4)
  })

  it('matches the README pixel coordinates when scaled to a 1024px image', () => {
    // The README works in 1024px because it believes the minimaps are 1024x1024
    // (they are not). Our projection is resolution-independent, so asking it for
    // 1024px must still reproduce the README's answer of (78, 890).
    const [u, v] = worldToUv(-301.45, -355.55, AMBROSE)
    expect(Math.round(u * 1024)).toBe(78)
    expect(Math.round((1 - v) * 1024)).toBe(890)
  })

  it('places each map origin at UV (0, 0)', () => {
    for (const geom of [AMBROSE, GRAND_RIFT, LOCKDOWN]) {
      const [u, v] = worldToUv(geom.originX, geom.originZ, geom)
      expect(u).toBe(0)
      expect(v).toBe(0)
    }
  })

  it('places origin + scale at UV (1, 1)', () => {
    for (const geom of [AMBROSE, GRAND_RIFT, LOCKDOWN]) {
      const [u, v] = worldToUv(
        geom.originX + geom.scale,
        geom.originZ + geom.scale,
        geom,
      )
      expect(u).toBeCloseTo(1, 10)
      expect(v).toBeCloseTo(1, 10)
    }
  })

  it('keeps the real data extents inside the unit box', () => {
    // Min/max x and z measured across all 89,104 rows of the dataset. If a map
    // config were ever edited to something plausible-but-wrong, real data would
    // start falling outside [0, 1] and this catches it.
    const extents = [
      { geom: AMBROSE, x: [-325.0, 301.8], z: [-380.0, 360.8] },
      { geom: GRAND_RIFT, x: [-225.9, 256.6], z: [-194.0, 170.1] },
      { geom: LOCKDOWN, x: [-406.6, 348.4], z: [-285.1, 329.2] },
    ]
    for (const { geom, x, z } of extents) {
      for (const wx of x) {
        for (const wz of z) {
          const [u, v] = worldToUv(wx, wz, geom)
          expect(u).toBeGreaterThanOrEqual(0)
          expect(u).toBeLessThanOrEqual(1)
          expect(v).toBeGreaterThanOrEqual(0)
          expect(v).toBeLessThanOrEqual(1)
        }
      }
    }
  })
})

describe('uvToWorld', () => {
  it('flips the vertical axis so v=1 is the top of the minimap', () => {
    // Image space is top-down, world Z is bottom-up. Getting this backwards
    // mirrors every path while leaving all numeric bounds checks green, so it
    // is asserted explicitly.
    const [, topY] = uvToWorld(0.5, 1)
    const [, bottomY] = uvToWorld(0.5, 0)
    expect(topY).toBe(0)
    expect(bottomY).toBe(RENDER_EXTENT)
    expect(topY).toBeLessThan(bottomY)
  })

  it('does not flip the horizontal axis', () => {
    const [leftX] = uvToWorld(0, 0.5)
    const [rightX] = uvToWorld(1, 0.5)
    expect(leftX).toBe(0)
    expect(rightX).toBe(RENDER_EXTENT)
  })

  it('agrees with the bitmap bounds at every corner', () => {
    const [left, bottom, right, top] = MAP_BOUNDS
    expect(uvToWorld(0, 1)).toEqual([left, top])
    expect(uvToWorld(1, 0)).toEqual([right, bottom])
  })
})

describe('round trip', () => {
  it('survives world -> uv -> render -> uv', () => {
    const [u, v] = worldToUv(-301.45, -355.55, AMBROSE)
    const [rx, ry] = uvToWorld(u, v)
    expect(rx / RENDER_EXTENT).toBeCloseTo(u, 10)
    expect(1 - ry / RENDER_EXTENT).toBeCloseTo(v, 10)
  })
})

describe('fitZoom', () => {
  it('returns zoom 0 when the viewport matches the render extent', () => {
    expect(fitZoom(RENDER_EXTENT)).toBe(0)
  })

  it('doubles the viewport for each zoom step', () => {
    expect(fitZoom(RENDER_EXTENT * 2)).toBe(1)
    expect(fitZoom(RENDER_EXTENT / 2)).toBe(-1)
  })
})
