/**
 * Colour and marker shapes.
 *
 * Every marker is distinguished by shape *and* colour. Colour alone fails for
 * the ~8% of men with a colour vision deficiency, and it also fails in the
 * screenshots designers paste into bug reports. Shape survives both.
 */

import type { EventName } from './types'

export type RGB = [number, number, number]

export const EVENT_COLOR: Record<EventName, RGB> = {
  Position: [56, 189, 248], // sky   - human movement
  BotPosition: [167, 139, 250], // violet - bot movement, deliberately recessive
  Kill: [239, 68, 68], // red    - human killed a human
  Killed: [248, 113, 113], // light red - human died to a human
  BotKill: [251, 146, 60], // orange - human killed a bot
  BotKilled: [244, 114, 182], // pink   - human died to a bot
  KilledByStorm: [168, 85, 247], // purple - died to the storm
  Loot: [251, 191, 36], // amber  - item pickup
}

export const EVENT_LABEL: Record<EventName, string> = {
  Position: 'Player movement',
  BotPosition: 'Bot movement',
  Kill: 'Killed a player',
  Killed: 'Died to a player',
  BotKill: 'Killed a bot',
  BotKilled: 'Died to a bot',
  KilledByStorm: 'Died to the storm',
  Loot: 'Looted an item',
}

/** Marker glyphs, drawn into the icon atlas below. */
export type Glyph = 'star' | 'cross' | 'triangleUp' | 'triangleDown' | 'hexagon' | 'diamond'

export const EVENT_GLYPH: Partial<Record<EventName, Glyph>> = {
  Kill: 'star',
  Killed: 'cross',
  BotKill: 'triangleUp',
  BotKilled: 'triangleDown',
  KilledByStorm: 'hexagon',
  Loot: 'diamond',
}

export const HUMAN_COLOR: RGB = [56, 189, 248] // sky-400
export const BOT_COLOR: RGB = [167, 139, 250] // violet-400

/**
 * Marker size in pixels, per event.
 *
 * Frequency and importance run in opposite directions here. Loot is 12,885 of
 * the 17,757 markers and drowns everything at a uniform size; the 39 storm
 * deaths and 6 PvP kills are the rarest and most interesting events on the
 * map. Sizing against rarity is what makes the overview legible.
 */
export const EVENT_SIZE: Record<EventName, number> = {
  Position: 0,
  BotPosition: 0,
  Kill: 21,
  Killed: 21,
  KilledByStorm: 20,
  BotKilled: 13,
  BotKill: 12,
  Loot: 8,
}

/** Marker opacity, same reasoning as EVENT_SIZE. */
export const EVENT_ALPHA: Record<EventName, number> = {
  Position: 255,
  BotPosition: 255,
  Kill: 255,
  Killed: 255,
  KilledByStorm: 255,
  BotKilled: 225,
  BotKill: 200,
  Loot: 130,
}

export function css(rgb: RGB, alpha = 1): string {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`
}

// ---------------------------------------------------------------------------
// Icon atlas
// ---------------------------------------------------------------------------

const CELL = 64
const PAD = 9

/**
 * Draw one glyph, centred in a CELL-sized cell whose left edge is at `ox`.
 *
 * Glyphs are drawn white so that deck.gl's `getColor` tints them per event --
 * one atlas serves every colour, and the legend can reuse the same shapes.
 */
function drawGlyph(ctx: CanvasRenderingContext2D, glyph: Glyph, ox: number): void {
  const c = ox + CELL / 2
  const m = CELL / 2
  const r = m - PAD

  ctx.save()
  ctx.strokeStyle = '#ffffff'
  ctx.fillStyle = '#ffffff'
  ctx.lineWidth = 9
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()

  switch (glyph) {
    case 'star': {
      for (let i = 0; i < 10; i++) {
        const rad = i % 2 === 0 ? r : r * 0.45
        const a = -Math.PI / 2 + (i * Math.PI) / 5
        const x = c + Math.cos(a) * rad
        const y = m + Math.sin(a) * rad
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'cross': {
      const d = r * 0.78
      ctx.moveTo(c - d, m - d)
      ctx.lineTo(c + d, m + d)
      ctx.moveTo(c + d, m - d)
      ctx.lineTo(c - d, m + d)
      ctx.stroke()
      break
    }
    case 'triangleUp': {
      ctx.moveTo(c, m - r)
      ctx.lineTo(c + r * 0.92, m + r * 0.72)
      ctx.lineTo(c - r * 0.92, m + r * 0.72)
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'triangleDown': {
      ctx.moveTo(c, m + r)
      ctx.lineTo(c + r * 0.92, m - r * 0.72)
      ctx.lineTo(c - r * 0.92, m - r * 0.72)
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'hexagon': {
      // Drawn as a ring: storm deaths are environmental, not something an
      // actor did, so they read differently from the solid combat glyphs.
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 3
        const x = c + Math.cos(a) * r
        const y = m + Math.sin(a) * r
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.stroke()
      break
    }
    case 'diamond': {
      ctx.moveTo(c, m - r)
      ctx.lineTo(c + r * 0.82, m)
      ctx.lineTo(c, m + r)
      ctx.lineTo(c - r * 0.82, m)
      ctx.closePath()
      ctx.fill()
      break
    }
  }
  ctx.restore()
}

export interface IconAtlas {
  url: string
  mapping: Record<string, { x: number; y: number; width: number; height: number; mask: boolean }>
}

let cached: IconAtlas | null = null

/**
 * Build the marker sprite sheet once, as a data URL.
 *
 * Generating it in code rather than shipping PNGs keeps the glyphs and their
 * colours defined in the same file, so a new event type is one entry here
 * instead of an asset round-trip.
 */
export function iconAtlas(): IconAtlas {
  if (cached) return cached

  const glyphs = Object.entries(EVENT_GLYPH) as [EventName, Glyph][]
  const canvas = document.createElement('canvas')
  canvas.width = CELL * glyphs.length
  canvas.height = CELL
  const ctx = canvas.getContext('2d')!

  const mapping: IconAtlas['mapping'] = {}
  glyphs.forEach(([event, glyph], i) => {
    drawGlyph(ctx, glyph, i * CELL)
    // `mask: true` makes deck.gl treat the sprite as an alpha mask and tint it
    // with getColor, which is why the glyphs are drawn in flat white.
    mapping[event] = { x: i * CELL, y: 0, width: CELL, height: CELL, mask: true }
  })

  cached = { url: canvas.toDataURL('image/png'), mapping }
  return cached
}

/** An inline SVG of the same glyph, for legends and buttons in the DOM. */
export function glyphSvg(glyph: Glyph, color: string, size = 12): string {
  const s = size
  const c = s / 2
  const r = c * 0.88
  const pts = (n: number, rot: number, squash = 1) =>
    Array.from({ length: n }, (_, i) => {
      const a = rot + (i * 2 * Math.PI) / n
      return `${c + Math.cos(a) * r},${c + Math.sin(a) * r * squash}`
    }).join(' ')

  const body = (() => {
    switch (glyph) {
      case 'star':
        return `<polygon points="${Array.from({ length: 10 }, (_, i) => {
          const rad = i % 2 === 0 ? r : r * 0.45
          const a = -Math.PI / 2 + (i * Math.PI) / 5
          return `${c + Math.cos(a) * rad},${c + Math.sin(a) * rad}`
        }).join(' ')}" fill="${color}"/>`
      case 'cross':
        return `<g stroke="${color}" stroke-width="${s * 0.2}" stroke-linecap="round">
          <line x1="${c - r * 0.7}" y1="${c - r * 0.7}" x2="${c + r * 0.7}" y2="${c + r * 0.7}"/>
          <line x1="${c + r * 0.7}" y1="${c - r * 0.7}" x2="${c - r * 0.7}" y2="${c + r * 0.7}"/>
        </g>`
      case 'triangleUp':
        return `<polygon points="${c},${c - r} ${c + r * 0.9},${c + r * 0.7} ${c - r * 0.9},${c + r * 0.7}" fill="${color}"/>`
      case 'triangleDown':
        return `<polygon points="${c},${c + r} ${c + r * 0.9},${c - r * 0.7} ${c - r * 0.9},${c - r * 0.7}" fill="${color}"/>`
      case 'hexagon':
        return `<polygon points="${pts(6, -Math.PI / 2)}" fill="none" stroke="${color}" stroke-width="${s * 0.16}"/>`
      case 'diamond':
        return `<polygon points="${c},${c - r} ${c + r * 0.8},${c} ${c},${c + r} ${c - r * 0.8},${c}" fill="${color}"/>`
    }
  })()

  return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`
}
