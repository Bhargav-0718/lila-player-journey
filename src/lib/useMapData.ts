import { useEffect, useMemo, useState } from 'react'

import {
  buildJourneys,
  buildMarkers,
  buildTraffic,
  loadCoverage,
  loadPoints,
} from './dataLoader'
import { useFilters } from '../state/filters'
import {
  EVENT_INDEX,
  type CoverageFile,
  type DataIndex,
  type Journey,
  type Marker,
} from './types'

export interface MapData {
  journeys: Journey[]
  markers: Marker[]
  traffic: { position: [number, number] }[]
  coverage: CoverageFile | null
  loading: boolean
  error: string | null
}

const EMPTY: MapData = {
  journeys: [],
  markers: [],
  traffic: [],
  coverage: null,
  loading: true,
  error: null,
}

/**
 * Load and reshape everything the current map/date selection needs.
 *
 * Date selection changes the *fetched* set; match, actor and event filters are
 * applied downstream in `useVisibleData` so that flipping a checkbox never
 * triggers a network round trip.
 */
export function useMapData(index: DataIndex | null): MapData {
  const mapId = useFilters((s) => s.mapId)
  const dates = useFilters((s) => s.dates)
  const [state, setState] = useState<MapData>(EMPTY)

  const active = useMemo(() => {
    if (!index) return []
    const all = index.maps[mapId]?.dates ?? []
    return dates.length ? all.filter((d) => dates.includes(d)) : all
  }, [index, mapId, dates])

  const key = `${mapId}|${active.join(',')}`

  useEffect(() => {
    if (!index || active.length === 0) return
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))

    Promise.all([
      Promise.all(active.map((d) => loadPoints(mapId, d))),
      loadCoverage(mapId),
    ])
      .then(([files, coverage]) => {
        if (cancelled) return
        const journeys: Journey[] = []
        const markers: Marker[] = []
        const traffic: { position: [number, number] }[] = []
        for (const f of files) {
          journeys.push(...buildJourneys(f))
          markers.push(...buildMarkers(f))
          traffic.push(...buildTraffic(f))
        }
        setState({ journeys, markers, traffic, coverage, loading: false, error: null })
      })
      .catch((e: Error) => {
        if (!cancelled) setState({ ...EMPTY, loading: false, error: e.message })
      })

    return () => {
      cancelled = true
    }
    // `key` collapses mapId + the resolved date list into one dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, index])

  return state
}

export interface VisibleData {
  journeys: Journey[]
  markers: Marker[]
  /**
   * Match- and actor-filtered markers, but *not* event-filtered.
   *
   * The heatmap reads from here so that hiding the loot glyphs declutters the
   * map without also erasing the loot-density overlay -- they answer different
   * questions and shouldn't share a switch.
   */
  markersAllEvents: Marker[]
  traffic: { position: [number, number] }[]
  /** Longest match in the current selection, in seconds -- the timeline range. */
  maxTime: number
}

/**
 * Apply the non-network filters: match, human/bot, and event type.
 *
 * Kept separate from fetching so that toggling bots off is a pure recompute
 * over data already in memory.
 */
export function useVisibleData(data: MapData): VisibleData {
  const matchIx = useFilters((s) => s.matchIx)
  const showHumans = useFilters((s) => s.showHumans)
  const showBots = useFilters((s) => s.showBots)
  const events = useFilters((s) => s.events)

  return useMemo(() => {
    const actorOk = (isBot: boolean) => (isBot ? showBots : showHumans)
    const matchOk = (ix: number) => matchIx === null || ix === matchIx

    const journeys = data.journeys.filter(
      (j) => matchOk(j.matchIx) && actorOk(j.isBot),
    )
    const markersAllEvents = data.markers.filter(
      (m) => matchOk(m.matchIx) && actorOk(m.isBot),
    )
    const markers = markersAllEvents.filter((m) => events.includes(m.event))

    // The traffic heatmap follows the match and actor filters but ignores the
    // event filter: hiding loot markers should not erase footfall.
    const traffic =
      matchIx === null && showHumans && showBots
        ? data.traffic
        : journeys.flatMap((j) => j.path.map((position) => ({ position })))

    let maxTime = 0
    for (const j of journeys) {
      const last = j.times[j.times.length - 1]
      if (last > maxTime) maxTime = last
    }
    for (const m of markersAllEvents) if (m.time > maxTime) maxTime = m.time

    return {
      journeys,
      markers,
      markersAllEvents,
      traffic,
      maxTime: Math.ceil(maxTime) || 1,
    }
  }, [data, matchIx, showHumans, showBots, events])
}

/** Points feeding the heatmap for the selected metric. */
export function heatmapPoints(
  visible: VisibleData,
  metric: string,
): { position: [number, number]; weight: number }[] {
  if (metric === 'traffic') {
    return visible.traffic.map((t) => ({ position: t.position, weight: 1 }))
  }
  const wanted =
    metric === 'kills'
      ? [EVENT_INDEX.Kill, EVENT_INDEX.BotKill]
      : metric === 'deaths'
        ? [EVENT_INDEX.Killed, EVENT_INDEX.BotKilled, EVENT_INDEX.KilledByStorm]
        : [EVENT_INDEX.Loot]
  return visible.markersAllEvents
    .filter((m) => wanted.includes(m.event))
    .map((m) => ({ position: m.position, weight: 1 }))
}
