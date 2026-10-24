// 도크 일정표: 지금 거점의 도크마다 지난 60분 실제 점유와 앞 30분 예정 도착을 시간 막대로(src/sim/schedule.ts).
// 막대를 누르면 그 차를 고른다. 세로선은 지금.
import { sim } from '../sim/sim'
import type { Work } from '../sim/schedule'
import { SITE_META } from '../sim/world'
import { useStore } from '../store'
import { hhmm } from './format'
import { L } from '../i18n'

const PAST = 60 * 60
const AHEAD = 30 * 60
const COLOR: Record<Work, string> = { unloading: 'bg-ok', loading: 'bg-brand', waiting: 'bg-warn', docking: 'bg-faint', other: 'bg-faint' }
const LABEL: Record<Work, string> = { unloading: L('하차', 'Unloading'), loading: L('상차', 'Loading'), waiting: L('대기', 'Waiting'), docking: L('접안', 'Docking'), other: L('기타', 'Other') }

export function DockSchedule() {
  useStore((s) => s.tick)
  const site = useStore((s) => s.site)
  const view = useStore((s) => s.view)
  const s = view === 'network' ? 'GJ' : site
  const { rows, planned } = sim.schedule.of(s)
  const now = sim.clock
  const t0 = now - PAST
  const span = PAST + AHEAD
  const x = (t: number) => `${(Math.max(0, Math.min(span, t - t0)) / span) * 100}%`
  const w = (a: number, b: number) => `${(Math.max(0, Math.min(t0 + span, b) - Math.max(t0, a)) / span) * 100}%`
  const ticks = [-60, -45, -30, -15, 0, 15, 30]
  const pick = (id: string) => useStore.getState().select({ kind: 'vehicle', id }, s)
  if (!rows.length) {
    return <div className="flex-1 py-6 text-center text-[12px] text-muted">{L(`${SITE_META[s].name}에는 도크 일정이 없습니다(배송구역·항만은 다른 화면)`, `${SITE_META[s].name} has no dock schedule (delivery zones and ports use other views)`)}</div>
  }
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center justify-between text-[12px]">
        <span className="font-semibold text-ink">{L(`${SITE_META[s].name} 도크 일정`, `${SITE_META[s].name} dock schedule`)}</span>
        <span className="flex gap-2 text-[10.5px] text-muted">
          {(['unloading', 'loading', 'waiting'] as Work[]).map((k) => <span key={k} className="flex items-center gap-1"><span className={`h-2 w-3 rounded-sm ${COLOR[k]}`} />{LABEL[k]}</span>)}
          <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm border border-dashed border-brand bg-brand-soft" />{L('예정 도착', 'Expected arrival')}</span>
        </span>
      </div>
      <div className="relative mt-2">
        <div className="ml-14 flex justify-between text-[9.5px] text-faint">
          {ticks.map((m) => <span key={m}>{m === 0 ? L('지금', 'Now') : hhmm(now + m * 60)}</span>)}
        </div>
        <div className="mt-1 space-y-1">
          {rows.map((r) => (
            <div key={r.key} className="flex items-center gap-2">
              <span className="w-12 shrink-0 truncate text-right text-[10.5px] font-semibold text-ink-2">{r.label}</span>
              <div className="relative h-4 flex-1 overflow-hidden rounded bg-line-2">
                {r.slots.map((sl, i) => (
                  <button
                    key={i}
                    type="button"
                    title={`${sl.vehicle} · ${LABEL[sl.work]} ${hhmm(sl.start)}~${sl.end ? hhmm(sl.end) : L('지금', 'now')}`}
                    onClick={() => pick(sl.vehicle)}
                    className={`absolute top-0.5 h-3 rounded-sm ${COLOR[sl.work]} opacity-90 hover:opacity-100`}
                    style={{ left: x(sl.start), width: w(sl.start, sl.end ?? now) }}
                  />
                ))}
                {planned.filter((p) => p.key === r.key).map((p) => (
                  <button
                    key={p.vehicle}
                    type="button"
                    title={L(`${p.vehicle} 도착 예정 ${hhmm(p.eta)}`, `${p.vehicle} expected ${hhmm(p.eta)}`)}
                    onClick={() => pick(p.vehicle)}
                    className="absolute top-0.5 h-3 rounded-sm border border-dashed border-brand bg-brand-soft"
                    style={{ left: x(p.eta), width: w(p.eta, p.eta + 8 * 60) }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        {/* 지금 */}
        <div className="pointer-events-none absolute bottom-0 top-4 w-px bg-bad" style={{ left: `calc(3.5rem + (100% - 3.5rem) * ${PAST / span})` }} />
      </div>
    </div>
  )
}
