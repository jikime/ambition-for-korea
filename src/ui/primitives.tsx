import type { ReactNode } from 'react'
import type { Tone } from './format'

const CHIP: Record<Tone, string> = {
  green: 'bg-ok-soft text-ok',
  blue: 'bg-brand-soft text-brand',
  amber: 'bg-warn-soft text-warn',
  gray: 'bg-line-2 text-muted',
  red: 'bg-bad-soft text-bad',
}
const DOT: Record<Tone, string> = {
  green: 'bg-ok',
  blue: 'bg-brand',
  amber: 'bg-warn',
  gray: 'bg-faint',
  red: 'bg-bad',
}
const BAR: Record<Tone, string> = {
  green: 'bg-ok',
  blue: 'bg-brand',
  amber: 'bg-warn',
  gray: 'bg-faint',
  red: 'bg-bad',
}

export function Chip({ tone, children, className = '' }: { tone: Tone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-md px-1.5 py-[3px] text-[11px] font-semibold leading-none whitespace-nowrap ${CHIP[tone]} ${className}`}>{children}</span>
}

export function Dot({ tone }: { tone: Tone }) {
  return <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${DOT[tone]}`} />
}

export function Bar({ value, tone = 'blue', className = '' }: { value: number; tone?: Tone; className?: string }) {
  const v = Math.max(0, Math.min(1, value))
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-line-2 ${className}`}>
      <div className={`h-full rounded-full transition-[width] duration-300 ${BAR[tone]}`} style={{ width: `${v * 100}%` }} />
    </div>
  )
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-[7px] text-[12px]">
      <span className="text-muted">{label}</span>
      <span className="num text-right font-medium text-ink">{children}</span>
    </div>
  )
}

export function IconButton({ label, onClick, active, children }: { label: string; onClick?: () => void; active?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`grid h-7 w-7 place-items-center rounded-lg border transition-colors ${active ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink-2 hover:bg-line-2'}`}
    >
      {children}
    </button>
  )
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between pb-1.5 pt-3 text-[12px]">
      <span className="font-semibold text-ink">{children}</span>
      {right && <span className="text-muted">{right}</span>}
    </div>
  )
}
