// 정문 출입 표(항만 관제 영상의 Gate 표): 지금 거점 정문의 진입·출차 기록과 정문 대기·체류 시간(src/sim/gatelog.ts).
// 부산신항은 세관 X-ray 검사 대기·평균 검사 시간을 함께 보인다. 줄을 누르면 그 차를 고른다.
import { sim, type GateKey } from '../sim/sim'
import { SITE_META } from '../sim/world'
import { useStore } from '../store'
import { carrierName, hhmm, vehicleKindLabel, vehicleStatus } from './format'
import { Chip } from './primitives'
import { L } from '../i18n'

const GATED: GateKey[] = ['GJ', 'IN', 'IC', 'BS', 'AP', 'DJ']
const min = (s: number) => L(`${Math.round(s / 60)}분`, `${Math.round(s / 60)} min`)

export function GateTable() {
  useStore((s) => s.tick)
  const site = useStore((s) => s.site)
  const view = useStore((s) => s.view)
  const g = (view === 'network' ? 'GJ' : site) as GateKey
  if (!GATED.includes(g)) {
    return <div className="flex-1 py-6 text-center text-[12px] text-muted">{L(`${SITE_META[site].name}에는 정문이 없습니다(배송차는 단지 도로를 돕니다)`, `${SITE_META[site].name} has no gate (delivery vans loop the complex roads)`)}</div>
  }
  const GL = sim.gateLog
  const st = GL.stats[g]
  const rows = GL.of(g, 24)
  const queue = GL.queue(g)
  const inside = sim.vehicles.filter((v) => v.visible && GL.isInside(v.id, g)).length
  const pick = (id: string) => useStore.getState().select({ kind: 'vehicle', id }, g)
  const X = GL.xray
  return (
    <div className="flex min-w-0 flex-1 gap-3">
      <div className="w-40 shrink-0 space-y-1.5 text-[11px]">
        <div className="text-[12px] font-semibold text-ink">{L(`${SITE_META[g].name} 정문`, `${SITE_META[g].name} gate`)}</div>
        <Kpi label={L('진입 · 출차', 'Entry · exit')} value={`${st.in} · ${st.out}`} sub={L('화면을 연 뒤', 'Since page opened')} />
        <Kpi label={L('지금 정문 대기', 'Gate queue now')} value={L(`${queue.length}대`, String(queue.length))} sub={L(`평균 대기 ${st.in ? min(st.waitSum / st.in) : '-'}`, `Avg wait ${st.in ? min(st.waitSum / st.in) : '-'}`)} warn={queue.length >= 2} />
        <Kpi label={L('구내 체류', 'On site')} value={L(`${inside}대`, String(inside))} sub={L(`평균 ${st.dwellN ? min(st.dwellSum / st.dwellN) : '-'}`, `Avg dwell ${st.dwellN ? min(st.dwellSum / st.dwellN) : '-'}`)} />
        {g === 'BS' && (
          <Kpi label={L('세관 X-ray', 'Customs X-ray')} value={L(`대기 ${X.pending.size + X.since.size}대`, `${X.pending.size + X.since.size} waiting`)} sub={L(`검사 ${X.done}대 · 평균 ${X.done ? min(X.sum / X.done) : '-'}`, `${X.done} checked · avg ${X.done ? min(X.sum / X.done) : '-'}`)} warn={X.pending.size + X.since.size >= 2} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="grid grid-cols-[42px_44px_1fr_1fr_1.1fr_56px] gap-x-2 border-b border-line pb-1 text-[10px] font-semibold text-faint">
          <span>{L('시각', 'Time')}</span><span>{L('구분', 'Dir')}</span><span>{L('차량 · 번호', 'Vehicle · plate')}</span><span>{L('운송사 · 차종', 'Carrier · type')}</span><span>{L('상태', 'Status')}</span><span className="text-right">{L('시간', 'Duration')}</span>
        </div>
        <div className="max-h-[132px] overflow-y-auto">
          {rows.map((e) => {
            const v = sim.vehicle(e.vehicle)
            const here = v && GL.isInside(v.id, g)
            const stat = e.dir === 'in'
              ? here && v ? vehicleStatus(v) : { label: L('출차함', 'Exited'), tone: 'gray' as const }
              : { label: e.note ?? L('출차', 'Exit'), tone: e.note ? ('red' as const) : ('gray' as const) }
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => pick(e.vehicle)}
                className="grid w-full grid-cols-[42px_44px_1fr_1fr_1.1fr_56px] items-center gap-x-2 border-b border-line-2 py-[3px] text-left text-[10.5px] hover:bg-line-2"
              >
                <span className="num text-faint">{hhmm(e.t)}</span>
                <span><Chip tone={e.dir === 'in' ? 'blue' : 'gray'}>{e.dir === 'in' ? L('진입', 'Entry') : L('출차', 'Exit')}</Chip></span>
                <span className="min-w-0 truncate"><b className="text-ink">{e.vehicle}</b> <span className="text-muted">{e.plate}</span></span>
                <span className="min-w-0 truncate text-muted">{v ? `${carrierName(v)} · ${vehicleKindLabel(v).split(' (')[0]}` : '-'}</span>
                <span className="min-w-0 truncate"><Chip tone={stat.tone}>{stat.label}</Chip></span>
                <span className="num text-right text-ink-2">
                  {e.dir === 'in' ? (e.wait && e.wait >= 30 ? L(`대기 ${min(e.wait)}`, `Wait ${min(e.wait)}`) : L('바로', 'No wait')) : e.dwell !== undefined ? L(`체류 ${min(e.dwell)}`, `Dwell ${min(e.dwell)}`) : '-'}
                </span>
              </button>
            )
          })}
          {!rows.length && <div className="py-4 text-center text-[11px] text-muted">{L('아직 정문을 지난 차가 없습니다', 'No vehicles have passed the gate yet')}</div>}
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value, sub, warn }: { label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <div className={`rounded-lg px-2 py-1 ring-1 ${warn ? 'bg-warn-soft ring-warn/30' : 'bg-white ring-line'}`}>
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-muted">{label}</span>
        <span className={`num font-semibold ${warn ? 'text-warn' : 'text-ink'}`}>{value}</span>
      </div>
      <div className="text-[10px] text-faint">{sub}</div>
    </div>
  )
}
