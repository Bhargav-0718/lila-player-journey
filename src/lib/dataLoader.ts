/**
 * Fetching and reshaping the static bundle.
 *
 * Everything is a plain GET against a CDN-cached JSON file. There is no API,
 * so there is nothing to be down, rate limited or cold-started.
 */

import { uvToWorld } from './projection'
import {
  MOVEMENT_EVENTS,
  type CoverageFile,
  type DataIndex,
  type Journey,
  type Marker,
  type PointsFile,
} from './types'

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

const cache = new Map<string, Promise<unknown>>()

function getJson<T>(path: string): Promise<T> {
  const url = `${BASE}${path}`
  let hit = cache.get(url) as Promise<T> | undefined
  if (!hit) {
    hit = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Failed to load ${path} (${r.status})`)
      return r.json() as Promise<T>
    })
    // Don't poison the cache with a transient network failure.
    hit.catch(() => cache.delete(url))
    cache.set(url, hit)
  }
  return hit
}

export const loadIndex = () => getJson<DataIndex>('/data/index.json')

export const loadPoints = (map: string, date: string) =>
  getJson<PointsFile>(`/data/points/${map}_${date}.json`)

export const loadCoverage = (map: string) =>
  getJson<CoverageFile>(`/data/coverage/${map}.json`)

/**
 * Rebuild player journeys from the columnar arrays.
 *
 * The pipeline sorts every points file by (match, player, time), so one actor's
 * movement samples are always contiguous and already in order. That turns
 * journey reconstruction into a single linear scan with no grouping map, no
 * sorting, and no second copy of the data on disk.
 */
export function buildJourneys(pts: PointsFile): Journey[] {
  const journeys: Journey[] = []
  let current: Journey | null = null

  for (let i = 0; i < pts.count; i++) {
    if (!MOVEMENT_EVENTS.includes(pts.e[i])) continue

    if (!current || current.matchIx !== pts.m[i] || current.playerIx !== pts.p[i]) {
      current = {
        matchIx: pts.m[i],
        playerIx: pts.p[i],
        isBot: pts.b[i] === 1,
        path: [],
        times: [],
      }
      journeys.push(current)
    }
    current.path.push(uvToWorld(pts.u[i], pts.v[i]))
    current.times.push(pts.t[i])
  }

  // A single sample is a spawn point, not a path -- deck.gl would render it as
  // a zero-length line, which draws nothing but still costs a draw call.
  return journeys.filter((j) => j.path.length > 1)
}

/** Every non-movement event in a points file, ready to render. */
export function buildMarkers(pts: PointsFile): Marker[] {
  const out: Marker[] = []
  for (let i = 0; i < pts.count; i++) {
    if (MOVEMENT_EVENTS.includes(pts.e[i])) continue
    out.push({
      position: uvToWorld(pts.u[i], pts.v[i]),
      event: pts.e[i],
      isBot: pts.b[i] === 1,
      time: pts.t[i],
      matchIx: pts.m[i],
      playerIx: pts.p[i],
    })
  }
  return out
}

/** Movement samples as bare positions, for the traffic heatmap. */
export function buildTraffic(pts: PointsFile): { position: [number, number] }[] {
  const out: { position: [number, number] }[] = []
  for (let i = 0; i < pts.count; i++) {
    if (!MOVEMENT_EVENTS.includes(pts.e[i])) continue
    out.push({ position: uvToWorld(pts.u[i], pts.v[i]) })
  }
  return out
}
