import type { ReactNode } from 'react'

/** Small shared primitives, so the panels stay about content rather than CSS. */

export function Panel({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="border-b border-[var(--color-edge)] px-4 py-3.5">
      <header className="mb-2.5 flex items-center justify-between gap-2">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500">
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  )
}

export function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
  title?: string
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-md border px-2.5 py-1.5 text-xs transition ${
        active
          ? 'border-cyan-400/45 bg-cyan-400/12 text-cyan-200'
          : 'border-[var(--color-edge)] bg-transparent text-slate-400 hover:border-slate-600 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  swatch,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: ReactNode
  swatch?: ReactNode
}) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-2.5 py-1 text-xs text-slate-300 hover:text-slate-100">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 shrink-0 accent-cyan-400"
      />
      {swatch}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </label>
  )
}

export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'warn' | 'good'
}) {
  const color =
    tone === 'warn' ? 'text-amber-300' : tone === 'good' ? 'text-cyan-300' : 'text-slate-100'
  return (
    <div className="rounded-lg border border-[var(--color-edge)] bg-[var(--color-ink-850)] px-2.5 py-2">
      <div className="text-[9.5px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-0.5 text-[15px] font-semibold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[10px] leading-tight text-slate-500">{hint}</div>}
    </div>
  )
}

export function Svg({ markup }: { markup: string }) {
  return <span className="shrink-0" dangerouslySetInnerHTML={{ __html: markup }} />
}

export function fmtTime(s: number): string {
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

export function fmtNum(n: number): string {
  return n.toLocaleString('en-US')
}
