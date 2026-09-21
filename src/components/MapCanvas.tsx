import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DeckGL from '@deck.gl/react'
import {
  Layer,
  OrthographicView,
  type OrthographicViewState,
} from '@deck.gl/core'
import { BitmapLayer, IconLayer, PathLayer, PolygonLayer } from '@deck.gl/layers'
import { HeatmapLayer } from '@deck.gl/aggregation-layers'
import { TripsLayer } from '@deck.gl/geo-layers'

import { MAP_BOUNDS, RENDER_EXTENT, fitZoom, uvToWorld } from '../lib/projection'
import {
  BOT_COLOR,
  EVENT_ALPHA,
  EVENT_COLOR,
  EVENT_LABEL,
  EVENT_SIZE,
  HUMAN_COLOR,
  iconAtlas,
} from '../lib/palette'
import { heatmapPoints, type MapData, type VisibleData } from '../lib/useMapData'
import { useFilters } from '../state/filters'
import { EVENT_NAMES, type DataIndex, type Journey, type Marker } from '../lib/types'

const TOOLTIP_STYLE = {
  background: 'rgba(8, 11, 18, 0.94)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '6px',
  color: '#e6e9ef',
  fontSize: '12px',
  padding: '7px 9px',
  boxShadow: '0 8px 24px rgba(0,0,0,.45)',
}

/** Colour ramps per heatmap metric, low density -> high. */
const RAMPS: Record<string, [number, number, number][]> = {
  traffic: [
    [12, 44, 92],
    [22, 96, 160],
    [38, 168, 198],
    [122, 226, 216],
    [226, 252, 244],
  ],
  kills: [
    [60, 12, 8],
    [140, 30, 16],
    [214, 72, 24],
    [248, 150, 44],
    [255, 232, 160],
  ],
  deaths: [
    [48, 10, 46],
    [110, 22, 88],
    [180, 44, 110],
    [232, 100, 128],
    [255, 206, 200],
  ],
  loot: [
    [58, 40, 6],
    [122, 88, 12],
    [186, 140, 22],
    [236, 196, 58],
    [255, 246, 190],
  ],
}

interface Props {
  index: DataIndex
  data: MapData
  visible: VisibleData
}

export default function MapCanvas({ index, data, visible }: Props) {
  const mapId = useFilters((s) => s.mapId)
  const layers = useFilters((s) => s.layers)
  const metric = useFilters((s) => s.heatmapMetric)
  const time = useFilters((s) => s.time)
  const trail = useFilters((s) => s.trail)
  const matchIx = useFilters((s) => s.matchIx)

  const containerRef = useRef<HTMLDivElement>(null)
  const [viewState, setViewState] = useState<OrthographicViewState>({
    target: [RENDER_EXTENT / 2, RENDER_EXTENT / 2, 0],
    zoom: fitZoom(800),
    minZoom: -2,
    maxZoom: 6,
  })

  // Fit the map to the panel on mount and on resize. Without this the initial
  // zoom is a guess and the map is either cropped or lost in whitespace.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (!width || !height) return
      setViewState((vs) => ({
        ...vs,
        // Only refit while the user hasn't taken over the camera.
        zoom: vs.zoom === undefined || !userMoved.current
          ? fitZoom(Math.min(width, height) * 0.94)
          : vs.zoom,
        target: userMoved.current ? vs.target : [RENDER_EXTENT / 2, RENDER_EXTENT / 2, 0],
      }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const userMoved = useRef(false)
  const onViewStateChange = useCallback(({ viewState: vs }: { viewState: OrthographicViewState }) => {
    userMoved.current = true
    setViewState(vs)
  }, [])

  const resetView = useCallback(() => {
    const el = containerRef.current
    const size = el ? Math.min(el.clientWidth, el.clientHeight) * 0.94 : 800
    userMoved.current = false
    setViewState({
      target: [RENDER_EXTENT / 2, RENDER_EXTENT / 2, 0],
      zoom: fitZoom(size),
      minZoom: -2,
      maxZoom: 6,
    })
  }, [])

  const atlas = useMemo(() => iconAtlas(), [])
  const mapInfo = index.maps[mapId]

  // Time filtering. `time === null` means the whole session is on screen.
  const cutoff = time ?? Infinity
  const timeActive = time !== null

  const shownMarkers = useMemo(
    () => (timeActive ? visible.markers.filter((m) => m.time <= cutoff) : visible.markers),
    [visible.markers, cutoff, timeActive],
  )

  const deadzone = useMemo(() => {
    if (!layers.deadzone || !data.coverage) return []
    const { grid, counts, playable } = data.coverage
    const cell = RENDER_EXTENT / grid
    const out: { polygon: [number, number][]; count: number }[] = []
    for (let vi = 0; vi < grid; vi++) {
      for (let ui = 0; ui < grid; ui++) {
        const ix = vi * grid + ui
        const count = counts[ix]
        // Only playable ground nobody entered. Including the ocean here would
        // bury the map under a red blanket and point at nothing actionable.
        if (count > 0 || !playable[ix]) continue
        const [x0, y0] = uvToWorld(ui / grid, (vi + 1) / grid)
        out.push({
          polygon: [
            [x0, y0],
            [x0 + cell, y0],
            [x0 + cell, y0 + cell],
            [x0, y0 + cell],
          ],
          count,
        })
      }
    }
    return out
  }, [layers.deadzone, data.coverage])

  const heat = useMemo(
    () => (layers.heatmap ? heatmapPoints(visible, metric) : []),
    [layers.heatmap, visible, metric],
  )

  const deckLayers = [
    new BitmapLayer({
      id: `minimap-${mapId}`,
      image: `${import.meta.env.BASE_URL.replace(/\/$/, '')}${mapInfo.image}`,
      bounds: MAP_BOUNDS,
      opacity: layers.heatmap ? 0.55 : 0.92,
    }),

    layers.deadzone &&
      new PolygonLayer<{ polygon: [number, number][] }>({
        id: 'deadzone',
        data: deadzone,
        getPolygon: (d) => d.polygon,
        getFillColor: [255, 72, 100, 92],
        getLineColor: [255, 120, 140, 60],
        getLineWidth: 0.8,
        stroked: true,
        filled: true,
        pickable: false,
      }),

    layers.heatmap &&
      heat.length > 0 &&
      new HeatmapLayer<{ position: [number, number]; weight: number }>({
        id: `heatmap-${metric}`,
        data: heat,
        getPosition: (d) => d.position,
        getWeight: (d) => d.weight,
        radiusPixels: metric === 'traffic' ? 26 : 42,
        intensity: 1,
        threshold: 0.04,
        colorRange: RAMPS[metric],
        opacity: 0.75,
        aggregation: 'SUM',
      }),

    // Static paths. Replaced by TripsLayer once the timeline is engaged, so the
    // two never fight over the same pixels.
    layers.paths &&
      !timeActive &&
      new PathLayer<Journey>({
        id: 'journeys',
        data: visible.journeys,
        getPath: (d) => d.path,
        getColor: (d) => (d.isBot ? [...BOT_COLOR, 70] : [...HUMAN_COLOR, 140]),
        getWidth: (d) => (d.isBot ? 1.0 : 1.8),
        widthUnits: 'common',
        widthMinPixels: 0.7,
        capRounded: true,
        jointRounded: true,
        pickable: true,
      }),

    layers.paths &&
      timeActive &&
      new TripsLayer<Journey>({
        id: 'trips',
        data: visible.journeys,
        getPath: (d) => d.path,
        getTimestamps: (d) => d.times,
        getColor: (d) => (d.isBot ? BOT_COLOR : HUMAN_COLOR),
        opacity: 0.85,
        widthUnits: 'common',
        getWidth: (d) => (d.isBot ? 1.4 : 2.4),
        widthMinPixels: 1,
        trailLength: trail,
        currentTime: cutoff,
        capRounded: true,
        jointRounded: true,
        fadeTrail: true,
      }),

    layers.markers &&
      new IconLayer<Marker>({
        id: 'markers',
        data: shownMarkers,
        iconAtlas: atlas.url,
        iconMapping: atlas.mapping,
        getIcon: (d) => EVENT_NAMES[d.event],
        getPosition: (d) => d.position,
        getColor: (d) => [
          ...EVENT_COLOR[EVENT_NAMES[d.event]],
          EVENT_ALPHA[EVENT_NAMES[d.event]],
        ],
        getSize: (d) => EVENT_SIZE[EVENT_NAMES[d.event]],
        sizeUnits: 'pixels',
        sizeMinPixels: 5,
        sizeMaxPixels: 26,
        pickable: true,
        alphaCutoff: 0.05,
      }),
  ].filter(Boolean) as Layer[]

  const getTooltip = useCallback(
    ({ object }: { object?: unknown }) => {
      if (!object) return null

      const marker = object as Partial<Marker>
      if (marker.event !== undefined && marker.time !== undefined) {
        const match = index.matches[marker.matchIx ?? 0]
        return {
          html: [
            `<div style="font-weight:600">${EVENT_LABEL[EVENT_NAMES[marker.event]]}</div>`,
            `<div style="opacity:.7">${marker.isBot ? 'Bot' : 'Player'} · ${fmt(marker.time)} into match</div>`,
            `<div style="opacity:.45;font-size:10px">match ${match?.id.slice(0, 8) ?? '?'}</div>`,
          ].join(''),
          style: TOOLTIP_STYLE,
        }
      }

      const journey = object as Partial<Journey>
      if (journey.path && journey.times) {
        const match = index.matches[journey.matchIx ?? 0]
        const last = journey.times[journey.times.length - 1] ?? 0
        return {
          html: [
            `<div style="font-weight:600">${journey.isBot ? 'Bot' : 'Player'} journey</div>`,
            `<div style="opacity:.7">${journey.path.length} samples · ${fmt(last)} tracked</div>`,
            `<div style="opacity:.45;font-size:10px">match ${match?.id.slice(0, 8) ?? '?'}</div>`,
          ].join(''),
          style: TOOLTIP_STYLE,
        }
      }
      return null
    },
    [index],
  )

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <DeckGL
        views={new OrthographicView({ id: 'map' })}
        viewState={viewState}
        onViewStateChange={onViewStateChange}
        controller={{ dragRotate: false, scrollZoom: { speed: 0.012, smooth: true } }}
        layers={deckLayers}
        getTooltip={getTooltip}
        style={{ background: '#05070b' }}
      />
      <button
        onClick={resetView}
        className="absolute right-3 top-3 rounded-md border border-white/10 bg-black/60 px-2.5 py-1.5 text-xs text-slate-300 backdrop-blur transition hover:border-cyan-400/40 hover:text-cyan-200"
      >
        Reset view
      </button>
      {matchIx !== null && (
        <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-cyan-400/25 bg-black/60 px-2.5 py-1.5 text-xs text-cyan-200 backdrop-blur">
          Single match · {visible.journeys.length} journeys
        </div>
      )}
    </div>
  )
}

function fmt(s: number): string {
  const m = Math.floor(s / 60)
  return `${m}m ${String(Math.floor(s % 60)).padStart(2, '0')}s`
}
