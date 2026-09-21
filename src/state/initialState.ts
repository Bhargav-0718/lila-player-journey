import { MARKER_EVENTS } from '../lib/types'
import type { HeatmapMetric } from '../lib/types'
import type { LayerToggles } from './filters'

/**
 * Seed the filter store from the query string.
 *
 * One-way only: the URL sets the opening view, and interacting with the tool
 * does not rewrite it. That is enough to share or bookmark a specific view
 * (`?map=Lockdown&heatmap=kills`) and to drive screenshots of a given layer
 * state, without the churn of keeping history in sync with every checkbox.
 */
export interface InitialState {
  mapId: string
  dates: string[]
  matchId: string | null
  layers: LayerToggles
  heatmapMetric: HeatmapMetric
  events: number[]
  time: number | null
}

const MAPS = ['AmbroseValley', 'GrandRift', 'Lockdown']
const METRICS: HeatmapMetric[] = ['traffic', 'kills', 'deaths', 'loot']

export function readInitialState(search = window.location.search): InitialState {
  const q = new URLSearchParams(search)

  const map = q.get('map')
  const metric = q.get('heatmap') as HeatmapMetric | null
  const on = (key: string, fallback: boolean) => {
    const v = q.get(key)
    return v === null ? fallback : v !== '0' && v !== 'false'
  }

  const metricValid = metric !== null && METRICS.includes(metric)
  const time = q.get('t')

  return {
    // Ambrose Valley is the primary map and carries 68% of all rows.
    mapId: map && MAPS.includes(map) ? map : 'AmbroseValley',
    dates: (q.get('dates') ?? '').split(',').filter(Boolean),
    matchId: q.get('match'),
    layers: {
      // The aggregate view opens as a heatmap rather than 800 overlapping
      // polylines: at whole-map scale the hairball hides the minimap it is
      // drawn on. Paths switch on automatically with a match selection, where
      // individual routes are the point.
      paths: on('paths', false),
      markers: on('markers', true),
      heatmap: on('heat', true),
      deadzone: on('dead', false),
    },
    heatmapMetric: metricValid ? metric : 'traffic',
    events: [...MARKER_EVENTS],
    time: time !== null && !Number.isNaN(Number(time)) ? Number(time) : null,
  }
}
