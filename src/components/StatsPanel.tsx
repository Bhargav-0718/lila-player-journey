import { useMemo } from 'react'

import { EVENT_COLOR, EVENT_GLYPH, EVENT_LABEL, css, glyphSvg } from '../lib/palette'
import { useFilters } from '../state/filters'
import type { MapData, VisibleData } from '../lib/useMapData'
import { EVENT_INDEX, EVENT_NAMES, MARKER_EVENTS, type DataIndex } from '../lib/types'
import { Panel, Stat, Svg, fmtNum, fmtTime } from './ui'

/**
 * Live analytics for whatever is currently on screen.
 *
 * This panel exists because a visualization that can't be quoted is hard to act
 * on. Every number here is computed from the same filtered arrays the map is
 * drawing, so what a designer sees is what they can put in a ticket.
 */
export default function StatsPanel({
  index,
  data,
  visible,
}: {
  index: DataIndex
  data: MapData
  visible: VisibleData
}) {
  const mapId = useFilters((s) => s.mapId)
  const matchIx = useFilters((s) => s.matchIx)
  const dates = useFilters((s) => s.dates)

  const mapInfo = index.maps[mapId]
  const activeDates = dates.length ? dates : mapInfo.dates

  const s = useMemo(() => {
    const counts = new Map<number, number>()
    for (const m of visible.markersAllEvents) {
      counts.set(m.event, (counts.get(m.event) ?? 0) + 1)
    }
    const get = (e: number) => counts.get(e) ?? 0

    const pvp = get(EVENT_INDEX.Kill) + get(EVENT_INDEX.Killed)
    const pve = get(EVENT_INDEX.BotKill) + get(EVENT_INDEX.BotKilled)
    const combat = pvp + pve

    const matches = index.matches.filter(
      (m) =>
        m.map === mapId &&
        activeDates.includes(m.date) &&
        (matchIx === null || index.matches.indexOf(m) === matchIx),
    )
    const avgDur = matches.length
      ? matches.reduce((a, m) => a + m.durationS, 0) / matches.length
      : 0
    const multi = matches.filter((m) => m.players > 1).length

    const humanJ = visible.journeys.filter((j) => !j.isBot).length
    const botJ = visible.journeys.length - humanJ

    return {
      counts: get,
      pvp,
      pve,
      combat,
      pvpShare: combat ? (pvp / combat) * 100 : 0,
      matches: matches.length,
      multi,
      avgDur,
      humanJ,
      botJ,
      loot: get(EVENT_INDEX.Loot),
      storm: get(EVENT_INDEX.KilledByStorm),
      lootPerMatch: matches.length ? get(EVENT_INDEX.Loot) / matches.length : 0,
    }
  }, [visible, index.matches, mapId, activeDates, matchIx])

  const coverage = data.coverage

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <Panel title="Selection">
        <div className="grid grid-cols-2 gap-1.5">
          <Stat label="Matches" value={fmtNum(s.matches)} hint={`${s.multi} with 2+ players`} />
          <Stat label="Journeys" value={fmtNum(visible.journeys.length)} hint={`${fmtNum(s.humanJ)} player · ${fmtNum(s.botJ)} bot`} />
          <Stat label="Avg match" value={fmtTime(s.avgDur)} hint="minutes:seconds" />
          <Stat label="Loot / match" value={s.lootPerMatch.toFixed(1)} hint={`${fmtNum(s.loot)} pickups`} />
        </div>
      </Panel>

      {/* The headline finding of the whole dataset, surfaced rather than buried:
          player-vs-player combat is a rounding error. */}
      <Panel title="Combat mix">
        <div className="mb-2 flex h-2 overflow-hidden rounded-full bg-[var(--color-ink-800)]">
          <div
            className="bg-rose-500"
            style={{ width: `${s.combat ? (s.pvp / s.combat) * 100 : 0}%` }}
          />
          <div
            className="bg-orange-400"
            style={{ width: `${s.combat ? (s.pve / s.combat) * 100 : 0}%` }}
          />
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-rose-300">
            vs players <span className="tabular-nums text-slate-400">{fmtNum(s.pvp)}</span>
          </span>
          <span className="text-orange-300">
            vs bots <span className="tabular-nums text-slate-400">{fmtNum(s.pve)}</span>
          </span>
        </div>
        <p className="mt-2 text-[10px] leading-snug text-slate-500">
          {s.combat === 0
            ? 'No combat in this selection.'
            : `PvP is ${s.pvpShare.toFixed(2)}% of all combat here.`}
        </p>
      </Panel>

      <Panel title="Event breakdown">
        <div className="space-y-1">
          {MARKER_EVENTS.map((e) => {
            const name = EVENT_NAMES[e]
            const n = s.counts(e)
            const max = Math.max(...MARKER_EVENTS.map((x) => s.counts(x)), 1)
            return (
              <div key={e} className="flex items-center gap-2">
                <Svg markup={glyphSvg(EVENT_GLYPH[name]!, css(EVENT_COLOR[name]), 10)} />
                <span className="w-24 shrink-0 truncate text-[10.5px] text-slate-400">
                  {EVENT_LABEL[name]}
                </span>
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--color-ink-800)]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(n / max) * 100}%`,
                      background: css(EVENT_COLOR[name], 0.85),
                    }}
                  />
                </div>
                <span className="w-11 shrink-0 text-right text-[10px] tabular-nums text-slate-400">
                  {fmtNum(n)}
                </span>
              </div>
            )
          })}
        </div>
      </Panel>

      {coverage && (
        <Panel title="Map utilisation">
          <div className="grid grid-cols-2 gap-1.5">
            <Stat
              label="Playable ground entered"
              value={`${coverage.coveragePct}%`}
              hint={`${fmtNum(coverage.visitedCells)} of ${fmtNum(coverage.playableCells)} cells`}
              tone={coverage.coveragePct < 65 ? 'warn' : 'good'}
            />
            <Stat
              label="Dead cells"
              value={fmtNum(coverage.deadCells)}
              hint="playable, never entered"
              tone={coverage.deadCells > 300 ? 'warn' : undefined}
            />
          </div>
          <p className="mt-2 text-[10px] leading-snug text-slate-500">
            Water and out-of-bounds void are excluded — the playable boundary is
            derived from the minimap art. Switch on{' '}
            <span className="text-slate-300">Never-visited cells</span> to see
            exactly where on {mapInfo.displayName} nobody goes.
          </p>
        </Panel>
      )}

      <Panel title="Storm pressure">
        <Stat
          label="Storm deaths in selection"
          value={fmtNum(s.storm)}
          hint={`${fmtNum(index.totals.events.KilledByStorm)} across all 796 matches`}
          tone={s.storm === 0 ? 'warn' : undefined}
        />
      </Panel>
    </div>
  )
}
