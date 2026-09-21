import { create } from 'zustand'

import { MARKER_EVENTS, type HeatmapMetric } from '../lib/types'
import { readInitialState } from './initialState'

export interface LayerToggles {
  paths: boolean
  markers: boolean
  heatmap: boolean
  deadzone: boolean
}

interface FilterState {
  mapId: string
  /** Empty means "every date for this map". */
  dates: string[]
  /** Index into DataIndex.matches, or null for the whole-map view. */
  matchIx: number | null

  showHumans: boolean
  showBots: boolean
  /** Marker event indices that are currently visible. */
  events: number[]

  layers: LayerToggles
  heatmapMetric: HeatmapMetric

  /** Match-relative seconds. null means "no time filter, show everything". */
  time: number | null
  playing: boolean
  speed: number
  /** Seconds of path kept visible behind the playhead. */
  trail: number

  setMap: (id: string) => void
  setMatchIxFromId: (ix: number | null) => void
  toggleDate: (d: string, available: string[]) => void
  setAllDates: () => void
  selectMatch: (ix: number | null) => void
  setShowHumans: (v: boolean) => void
  setShowBots: (v: boolean) => void
  toggleEvent: (e: number) => void
  setAllEvents: (on: boolean) => void
  toggleLayer: (k: keyof LayerToggles) => void
  setHeatmapMetric: (m: HeatmapMetric) => void
  setTime: (t: number | null) => void
  setPlaying: (v: boolean) => void
  setSpeed: (v: number) => void
  setTrail: (v: number) => void
}

const initial = readInitialState()

export const useFilters = create<FilterState>((set) => ({
  mapId: initial.mapId,
  dates: initial.dates,
  matchIx: null,

  showHumans: true,
  showBots: true,
  events: initial.events,

  layers: initial.layers,
  heatmapMetric: initial.heatmapMetric,

  time: initial.time,
  playing: false,
  speed: 4,
  trail: 45,

  setMap: (id) =>
    // Dates and the selected match belong to the old map, so they reset.
    set({ mapId: id, dates: [], matchIx: null, time: null, playing: false }),

  setMatchIxFromId: (ix) => set({ matchIx: ix }),

  toggleDate: (d, available) =>
    set((s) => {
      const active = s.dates.length ? s.dates : available
      const next = active.includes(d)
        ? active.filter((x) => x !== d)
        : [...active, d]
      // Deselecting the last date would show nothing; read it as "all" instead.
      const dates = next.length === 0 || next.length === available.length ? [] : next
      return { dates, matchIx: null }
    }),

  setAllDates: () => set({ dates: [], matchIx: null }),

  // Choosing a match means wanting to see its routes, so paths come on with
  // it; clearing the selection returns to the readable aggregate heatmap.
  selectMatch: (ix) =>
    set((s) => ({
      matchIx: ix,
      time: null,
      playing: false,
      layers: { ...s.layers, paths: ix !== null ? true : s.layers.paths },
    })),

  setShowHumans: (v) => set({ showHumans: v }),
  setShowBots: (v) => set({ showBots: v }),

  toggleEvent: (e) =>
    set((s) => ({
      events: s.events.includes(e)
        ? s.events.filter((x) => x !== e)
        : [...s.events, e],
    })),

  setAllEvents: (on) => set({ events: on ? [...MARKER_EVENTS] : [] }),

  toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),

  // Picking a metric implies wanting to see it, so this switches the layer on
  // rather than silently changing a setting for an invisible layer.
  setHeatmapMetric: (m) =>
    set((s) => ({ heatmapMetric: m, layers: { ...s.layers, heatmap: true } })),

  setTime: (t) => set({ time: t }),
  setPlaying: (v) => set({ playing: v }),
  setSpeed: (v) => set({ speed: v }),
  setTrail: (v) => set({ trail: v }),
}))
