import { useEffect, useState } from 'react'

import FilterPanel from './components/FilterPanel'
import MapCanvas from './components/MapCanvas'
import StatsPanel from './components/StatsPanel'
import Timeline from './components/Timeline'
import { fmtNum } from './components/ui'
import { loadIndex } from './lib/dataLoader'
import { readInitialState } from './state/initialState'
import { useMapData, useVisibleData } from './lib/useMapData'
import { useFilters } from './state/filters'
import type { DataIndex } from './lib/types'

export default function App() {
  const [index, setIndex] = useState<DataIndex | null>(null)
  const [fatal, setFatal] = useState<string | null>(null)

  useEffect(() => {
    loadIndex()
      .then((idx) => {
        setIndex(idx)
        // `?match=<id>` can only be resolved to a row index once the catalog
        // is in hand, so it is applied here rather than in the store's seed.
        const wanted = readInitialState().matchId
        if (wanted) {
          const ix = idx.matches.findIndex((m) => m.id.startsWith(wanted))
          // Set the index directly rather than going through selectMatch,
          // which clears the playhead -- that would discard a `?t=` seed
          // before it was ever shown.
          if (ix >= 0) useFilters.getState().setMatchIxFromId(ix)
        }
      })
      .catch((e: Error) => setFatal(e.message))
  }, [])

  const data = useMapData(index)
  const visible = useVisibleData(data)
  const mapId = useFilters((s) => s.mapId)

  if (fatal) return <Fatal message={fatal} />
  if (!index) return <Splash />

  return (
    <div className="flex h-full flex-col bg-[var(--color-ink-950)]">
      <Header index={index} />

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[272px] shrink-0 overflow-hidden border-r border-[var(--color-edge)] bg-[var(--color-ink-900)] lg:block">
          <FilterPanel index={index} />
        </aside>

        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <MapCanvas index={index} data={data} visible={visible} />

            {data.loading && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/45 backdrop-blur-[1px]">
                <div className="flex items-center gap-2.5 rounded-lg border border-[var(--color-edge)] bg-[var(--color-ink-850)] px-4 py-2.5">
                  <Spinner />
                  <span className="text-xs text-slate-300">
                    Loading {index.maps[mapId].displayName}…
                  </span>
                </div>
              </div>
            )}

            {data.error && (
              <div className="absolute inset-0 grid place-items-center bg-black/70 p-6">
                <p className="max-w-sm text-center text-sm text-rose-300">{data.error}</p>
              </div>
            )}

            {/* An empty map should say why it is empty, so a filter mistake
                doesn't read as a broken tool. */}
            {!data.loading &&
              !data.error &&
              visible.journeys.length === 0 &&
              visible.markers.length === 0 && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <p className="rounded-lg border border-[var(--color-edge)] bg-[var(--color-ink-850)]/90 px-4 py-2.5 text-xs text-slate-400">
                    Nothing matches the current filters.
                  </p>
                </div>
              )}
          </div>

          <Timeline visible={visible} />
        </main>

        <aside className="hidden w-[286px] shrink-0 overflow-hidden border-l border-[var(--color-edge)] bg-[var(--color-ink-900)] xl:block">
          <StatsPanel index={index} data={data} visible={visible} />
        </aside>
      </div>

      {/* Below the two-rail breakpoint the panels stack under the map rather
          than disappearing. */}
      <div className="max-h-[42vh] overflow-y-auto border-t border-[var(--color-edge)] bg-[var(--color-ink-900)] lg:hidden">
        <FilterPanel index={index} />
        <StatsPanel index={index} data={data} visible={visible} />
      </div>
      <div className="hidden max-h-[42vh] overflow-y-auto border-t border-[var(--color-edge)] bg-[var(--color-ink-900)] lg:block xl:hidden">
        <StatsPanel index={index} data={data} visible={visible} />
      </div>
    </div>
  )
}

function Header({ index }: { index: DataIndex }) {
  const t = index.totals
  return (
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--color-edge)] bg-[var(--color-ink-900)] px-4 py-2.5">
      <div className="flex items-baseline gap-2.5">
        <h1 className="text-sm font-semibold tracking-tight text-slate-100">
          LILA BLACK · Player Journey Explorer
        </h1>
        <span className="hidden text-[11px] text-slate-500 sm:inline">
          Level design telemetry, Feb 10–14 2026
        </span>
      </div>
      <div className="hidden items-center gap-4 text-[11px] tabular-nums text-slate-500 md:flex">
        <span>{fmtNum(t.rows)} events</span>
        <span>{fmtNum(t.matches)} matches</span>
        <span>{fmtNum(t.journeys)} journeys</span>
        <span>
          {fmtNum(t.humans)} players · {fmtNum(t.bots)} bots
        </span>
      </div>
    </header>
  )
}

function Splash() {
  return (
    <div className="grid h-full place-items-center bg-[var(--color-ink-950)]">
      <div className="flex items-center gap-3">
        <Spinner />
        <span className="text-sm text-slate-400">Loading telemetry…</span>
      </div>
    </div>
  )
}

function Fatal({ message }: { message: string }) {
  return (
    <div className="grid h-full place-items-center bg-[var(--color-ink-950)] p-6">
      <div className="max-w-md text-center">
        <p className="text-sm font-medium text-rose-300">Could not load the dataset</p>
        <p className="mt-2 text-xs text-slate-500">{message}</p>
        <p className="mt-3 text-xs text-slate-600">
          Run <code className="text-slate-400">python scripts/build_data.py</code> to
          regenerate <code className="text-slate-400">public/data</code>.
        </p>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-400/25 border-t-cyan-400" />
  )
}
