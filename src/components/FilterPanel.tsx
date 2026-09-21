import { useMemo, useState } from 'react'

import { EVENT_COLOR, EVENT_GLYPH, EVENT_LABEL, css, glyphSvg } from '../lib/palette'
import { useFilters } from '../state/filters'
import { EVENT_NAMES, MARKER_EVENTS, type DataIndex } from '../lib/types'
import { Chip, Panel, Svg, Toggle, fmtNum, fmtTime } from './ui'

const METRICS = [
  { id: 'traffic', label: 'Foot traffic' },
  { id: 'kills', label: 'Kill zones' },
  { id: 'deaths', label: 'Death zones' },
  { id: 'loot', label: 'Loot density' },
] as const

export default function FilterPanel({ index }: { index: DataIndex }) {
  const f = useFilters()
  const [query, setQuery] = useState('')

  const mapInfo = index.maps[f.mapId]
  const activeDates = f.dates.length ? f.dates : mapInfo.dates

  /** Matches for the current map and date selection, best-populated first. */
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return index.matches
      .filter((m) => m.map === f.mapId && activeDates.includes(m.date))
      .filter((m) => !q || m.id.toLowerCase().includes(q))
      .slice(0, 140)
  }, [index.matches, f.mapId, activeDates, query])

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <Panel title="Map">
        <div className="grid gap-1.5">
          {Object.values(index.maps).map((m) => {
            const rows = Object.values(m.stats).reduce((a, s) => a + s.rows, 0)
            return (
              <button
                key={m.id}
                onClick={() => f.setMap(m.id)}
                aria-pressed={f.mapId === m.id}
                className={`flex items-center justify-between rounded-md border px-2.5 py-2 text-left transition ${
                  f.mapId === m.id
                    ? 'border-cyan-400/45 bg-cyan-400/10'
                    : 'border-[var(--color-edge)] hover:border-slate-600'
                }`}
              >
                <span
                  className={`text-xs font-medium ${f.mapId === m.id ? 'text-cyan-200' : 'text-slate-300'}`}
                >
                  {m.displayName}
                </span>
                <span className="text-[10px] tabular-nums text-slate-500">
                  {fmtNum(rows)} events
                </span>
              </button>
            )
          })}
        </div>
      </Panel>

      <Panel
        title="Date"
        action={
          <button
            onClick={f.setAllDates}
            className="text-[10px] text-slate-500 underline-offset-2 hover:text-cyan-300 hover:underline"
          >
            All 5 days
          </button>
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {mapInfo.dates.map((d) => (
            <Chip
              key={d}
              active={activeDates.includes(d)}
              onClick={() => f.toggleDate(d, mapInfo.dates)}
              title={`${fmtNum(mapInfo.stats[d]?.rows ?? 0)} events`}
            >
              Feb {d.slice(-2)}
            </Chip>
          ))}
        </div>
        {/* Feb 14 stopped mid-day; saying so prevents a false "engagement
            collapsed" read of the last bar in any trend. */}
        {activeDates.includes('2026-02-14') && (
          <p className="mt-2 text-[10px] leading-snug text-amber-400/70">
            Feb 14 is a partial day — collection stopped at 15:01.
          </p>
        )}
      </Panel>

      <Panel
        title="Match"
        action={
          f.matchIx !== null && (
            <button
              onClick={() => f.selectMatch(null)}
              className="text-[10px] text-cyan-400 underline-offset-2 hover:underline"
            >
              Clear
            </button>
          )
        }
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search match id…"
          className="mb-2 w-full rounded-md border border-[var(--color-edge)] bg-[var(--color-ink-900)] px-2.5 py-1.5 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-400/50"
        />
        <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
          {matches.map((m) => {
            const ix = index.matches.indexOf(m)
            const selected = f.matchIx === ix
            return (
              <button
                key={m.id}
                onClick={() => f.selectMatch(selected ? null : ix)}
                className={`flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left transition ${
                  selected
                    ? 'border-cyan-400/45 bg-cyan-400/10'
                    : 'border-transparent hover:border-[var(--color-edge)] hover:bg-white/[0.03]'
                }`}
              >
                <span className="truncate font-mono text-[10.5px] text-slate-400">
                  {m.id.slice(0, 8)}
                </span>
                <span className="flex shrink-0 items-center gap-2 text-[10px] tabular-nums">
                  <span className={m.players > 1 ? 'text-cyan-300' : 'text-slate-600'}>
                    {m.players}p
                  </span>
                  <span className="text-slate-500">{fmtTime(m.durationS)}</span>
                </span>
              </button>
            )
          })}
          {matches.length === 0 && (
            <p className="py-3 text-center text-[11px] text-slate-600">
              No matches for this filter.
            </p>
          )}
        </div>
        {/* 75% of matches recorded a single participant, so the picker leads
            with the populated ones -- otherwise playback looks broken. */}
        <p className="mt-2 text-[10px] leading-snug text-slate-600">
          Sorted by participants. Most matches recorded only one.
        </p>
      </Panel>

      <Panel title="Actors">
        <Toggle
          checked={f.showHumans}
          onChange={f.setShowHumans}
          label={`Players (${fmtNum(index.totals.humans)})`}
          swatch={<Dot color={css(EVENT_COLOR.Position)} />}
        />
        <Toggle
          checked={f.showBots}
          onChange={f.setShowBots}
          label={`Bots (${fmtNum(index.totals.bots)})`}
          swatch={<Dot color={css(EVENT_COLOR.BotPosition)} />}
        />
      </Panel>

      <Panel
        title="Events"
        action={
          <div className="flex gap-2 text-[10px] text-slate-500">
            <button onClick={() => f.setAllEvents(true)} className="hover:text-cyan-300">
              All
            </button>
            <button onClick={() => f.setAllEvents(false)} className="hover:text-cyan-300">
              None
            </button>
          </div>
        }
      >
        {MARKER_EVENTS.map((e) => {
          const name = EVENT_NAMES[e]
          const glyph = EVENT_GLYPH[name]!
          return (
            <Toggle
              key={e}
              checked={f.events.includes(e)}
              onChange={() => f.toggleEvent(e)}
              label={
                <span className="flex items-center justify-between gap-2">
                  <span>{EVENT_LABEL[name]}</span>
                  <span className="tabular-nums text-[10px] text-slate-600">
                    {fmtNum(index.totals.events[name] ?? 0)}
                  </span>
                </span>
              }
              swatch={<Svg markup={glyphSvg(glyph, css(EVENT_COLOR[name]), 11)} />}
            />
          )
        })}
      </Panel>

      <Panel title="Overlays">
        <Toggle checked={f.layers.paths} onChange={() => f.toggleLayer('paths')} label="Journey paths" />
        <Toggle checked={f.layers.markers} onChange={() => f.toggleLayer('markers')} label="Event markers" />
        <Toggle checked={f.layers.deadzone} onChange={() => f.toggleLayer('deadzone')} label="Never-visited cells" />
        <Toggle checked={f.layers.heatmap} onChange={() => f.toggleLayer('heatmap')} label="Heatmap" />
        {f.layers.heatmap && (
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {METRICS.map((m) => (
              <Chip
                key={m.id}
                active={f.heatmapMetric === m.id}
                onClick={() => f.setHeatmapMetric(m.id)}
              >
                {m.label}
              </Chip>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}

function Dot({ color }: { color: string }) {
  return (
    <span
      className="h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ background: color }}
    />
  )
}
