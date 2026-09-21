/** Shapes of the static bundle emitted by `scripts/build_data.py`. */

/** Event names, in the index order the pipeline writes into `e` arrays. */
export const EVENT_NAMES = [
  'Position',
  'BotPosition',
  'Kill',
  'Killed',
  'BotKill',
  'BotKilled',
  'KilledByStorm',
  'Loot',
] as const

export type EventName = (typeof EVENT_NAMES)[number]

export const EVENT_INDEX = Object.fromEntries(
  EVENT_NAMES.map((n, i) => [n, i]),
) as Record<EventName, number>

/** Position samples are movement, everything else is a discrete marker. */
export const MOVEMENT_EVENTS = [EVENT_INDEX.Position, EVENT_INDEX.BotPosition]
export const MARKER_EVENTS = EVENT_NAMES.map((_, i) => i).filter(
  (i) => !MOVEMENT_EVENTS.includes(i),
)

export type EventCounts = Partial<Record<EventName, number>>

export interface MatchSummary {
  id: string
  map: string
  date: string
  startMs: number
  durationS: number
  players: number
  humans: number
  bots: number
  rows: number
  events: EventCounts
}

export interface MapInfo {
  id: string
  displayName: string
  scale: number
  originX: number
  originZ: number
  image: string
  dates: string[]
  stats: Record<string, { rows: number; matches: number; events: EventCounts }>
}

export interface DataIndex {
  generatedAt: string
  maps: Record<string, MapInfo>
  dates: string[]
  events: EventName[]
  players: string[]
  playerIsBot: number[]
  matches: MatchSummary[]
  totals: {
    rows: number
    matches: number
    journeys: number
    players: number
    humans: number
    bots: number
    events: Record<EventName, number>
  }
}

/**
 * Columnar point data for one map on one date. Parallel arrays, sorted by
 * (match, player, time) -- see `buildJourneys`.
 */
export interface PointsFile {
  map: string
  date: string
  count: number
  /** Normalized U in [0, 1]. */
  u: number[]
  /** Normalized V in [0, 1]. */
  v: number[]
  /** Event index into EVENT_NAMES. */
  e: number[]
  /** 1 when the actor is a bot. */
  b: number[]
  /** Seconds since the start of this actor's match. */
  t: number[]
  /** Index into DataIndex.matches. */
  m: number[]
  /** Index into DataIndex.players. */
  p: number[]
}

export interface CoverageFile {
  map: string
  grid: number
  /** Movement samples per cell, row-major, v-major. */
  counts: number[]
  /** 1 where the cell is playable ground rather than water or void. */
  playable: number[]
  max: number
  visitedCells: number
  playableCells: number
  deadCells: number
  totalCells: number
  /** Share of *playable* ground ever entered. */
  coveragePct: number
}

/** One actor's movement through one match, rebuilt from the point arrays. */
export interface Journey {
  matchIx: number
  playerIx: number
  isBot: boolean
  /** Render-space vertices. */
  path: [number, number][]
  /** Match-relative seconds, parallel to `path`. */
  times: number[]
}

/** A non-movement event, ready to render. */
export interface Marker {
  position: [number, number]
  event: number
  isBot: boolean
  time: number
  matchIx: number
  playerIx: number
}

export type HeatmapMetric = 'traffic' | 'kills' | 'deaths' | 'loot'
