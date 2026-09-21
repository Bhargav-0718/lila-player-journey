import { useEffect, useRef } from 'react'

import { useFilters } from '../state/filters'
import type { VisibleData } from '../lib/useMapData'
import { fmtTime } from './ui'

const SPEEDS = [1, 2, 4, 8]

/**
 * Match-relative playback.
 *
 * Every point carries seconds-since-its-own-match-start, so one scrubber works
 * in both modes: with a match selected it replays that match, and with the
 * whole map in view it answers "where is everyone N minutes in?" across every
 * match at once.
 */
export default function Timeline({ visible }: { visible: VisibleData }) {
  const time = useFilters((s) => s.time)
  const playing = useFilters((s) => s.playing)
  const speed = useFilters((s) => s.speed)
  const trail = useFilters((s) => s.trail)
  const setTime = useFilters((s) => s.setTime)
  const setPlaying = useFilters((s) => s.setPlaying)
  const setSpeed = useFilters((s) => s.setSpeed)
  const setTrail = useFilters((s) => s.setTrail)
  const matchIx = useFilters((s) => s.matchIx)

  const max = visible.maxTime
  const active = time !== null
  const raf = useRef<number>(0)
  const last = useRef<number>(0)

  // Drive playback off requestAnimationFrame rather than an interval, so the
  // playhead advances in real seconds regardless of frame rate.
  useEffect(() => {
    if (!playing) return
    last.current = performance.now()

    const tick = (now: number) => {
      const dt = (now - last.current) / 1000
      last.current = now
      const next = (useFilters.getState().time ?? 0) + dt * speed
      if (next >= max) {
        setTime(max)
        setPlaying(false)
        return
      }
      setTime(next)
      raf.current = requestAnimationFrame(tick)
    }

    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [playing, speed, max, setTime, setPlaying])

  // A new selection invalidates the old playhead position -- but not on the
  // first run, which would discard a `?t=` seed from the URL before it is ever
  // shown.
  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    setTime(null)
    setPlaying(false)
  }, [matchIx, setTime, setPlaying])

  const play = () => {
    if (time === null || time >= max) setTime(0)
    setPlaying(!playing)
  }

  return (
    <div className="flex items-center gap-4 border-t border-[var(--color-edge)] bg-[var(--color-ink-900)] px-4 py-2.5">
      <button
        onClick={play}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-cyan-400/35 bg-cyan-400/10 text-cyan-300 transition hover:bg-cyan-400/20"
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? (
          <svg width="11" height="12" viewBox="0 0 11 12" fill="currentColor">
            <rect x="0" y="0" width="3.5" height="12" rx="1" />
            <rect x="7.5" y="0" width="3.5" height="12" rx="1" />
          </svg>
        ) : (
          <svg width="11" height="12" viewBox="0 0 11 12" fill="currentColor">
            <path d="M0 0.8v10.4a.8.8 0 0 0 1.23.67l8.2-5.2a.8.8 0 0 0 0-1.34l-8.2-5.2A.8.8 0 0 0 0 .8Z" />
          </svg>
        )}
      </button>

      <span className="w-20 shrink-0 text-xs tabular-nums text-slate-400">
        {active ? fmtTime(time) : '—:—'}
        <span className="text-slate-600"> / {fmtTime(max)}</span>
      </span>

      <input
        type="range"
        min={0}
        max={max}
        step={0.5}
        value={time ?? 0}
        onChange={(e) => {
          setPlaying(false)
          setTime(Number(e.target.value))
        }}
        className="h-4 min-w-0 flex-1"
        aria-label="Match timeline"
      />

      <div className="flex shrink-0 items-center gap-1">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            className={`rounded px-1.5 py-1 text-[10px] tabular-nums transition ${
              speed === s
                ? 'bg-cyan-400/15 text-cyan-300'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {s}×
          </button>
        ))}
      </div>

      <label className="flex shrink-0 items-center gap-2 text-[10px] text-slate-500">
        Trail
        <input
          type="range"
          min={5}
          max={300}
          step={5}
          value={trail}
          onChange={(e) => setTrail(Number(e.target.value))}
          className="h-4 w-20"
          aria-label="Trail length in seconds"
        />
        <span className="w-8 tabular-nums text-slate-400">{trail}s</span>
      </label>

      <button
        onClick={() => {
          setPlaying(false)
          setTime(null)
        }}
        disabled={!active}
        className="shrink-0 rounded-md border border-[var(--color-edge)] px-2.5 py-1.5 text-[10px] text-slate-400 transition enabled:hover:border-slate-600 enabled:hover:text-slate-200 disabled:opacity-35"
      >
        Show all time
      </button>
    </div>
  )
}
