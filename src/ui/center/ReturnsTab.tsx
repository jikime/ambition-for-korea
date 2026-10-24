// 반품·회수 탭: 접수 → 회수 → 서브 입고 → 간선 회송 → 반품 검수 → 처리. 각 단계는 실제 차량이 움직일 때 넘어간다
import { useState } from 'react'
import { Crosshair, Loader2 } from 'lucide-react'
import { sim } from '../../sim/sim'
import { DISPOSITION_LABEL, REASON_LABEL, RETURN_STEPS, type Disposition, type ReturnReq } from '../../sim/cs'
import { STOPS, VARIANTS } from '../../sim/sites'
import { useStore } from '../../store'
import { hhmm, num } from '../format'
import { By, Stat } from './OpsCenter'
import { L } from '../../i18n'

const DISP_TONE: Record<Disposition, string> = {
  restock: 'bg-ok-soft text-ok',
  refurb: 'bg-brand-soft text-brand',
  seller: 'bg-warn-soft text-warn',
  dispose: 'bg-bad-soft text-bad',
}

/** 정차지 이름에서 단지 이름을 뗀다(sites.ts의 한국어·영어 이름 모두) */
const APT_PREFIX = /^(다온마을 아파트|Daon Village Apt\.?|Daon Village Apartments?)\s+/

function Dots({ r }: { r: ReturnReq }) {
  return (
    <div className="flex items-center gap-[3px]" aria-label={L(`${RETURN_STEPS[r.stage].label} 단계`, `Stage: ${RETURN_STEPS[r.stage].label}`)}>
      {RETURN_STEPS.map((s, i) => (
        <span key={s.label} title={s.label} className={`h-1.5 w-4 rounded-full ${i < r.stage ? 'bg-brand' : i === r.stage ? (r.stage === 6 ? 'bg-ok' : 'bg-brand/50') : 'bg-line'}`} />
      ))}
    </div>
  )
}

function Detail({ r }: { r: ReturnReq }) {
  const following = useStore((s) => s.selected?.kind === 'story' && s.selected.id === 'ret')
  const isFocus = sim.cs.focus === r
  return (
    <div className="rounded-xl border border-line bg-[#FAFBFE] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="num text-[13px] font-bold text-ink">{r.no} · {r.item.name}</div>
          <div className="truncate text-[11px] text-muted">{r.customer} · {STOPS[r.stopId]?.label} · {L(`접수 ${hhmm(r.time)}`, `Received ${hhmm(r.time)}`)}</div>
        </div>
        <button
          type="button"
          onClick={() => {
            const st = useStore.getState()
            sim.cs.focus = r
            if (following && isFocus) st.select(null)
            else {
              const p = sim.journeyPos('ret')
              st.select({ kind: 'story', id: 'ret' }, p.site)
              if (st.speed < 4) st.setSpeed(4)
            }
          }}
          className={`flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold ${following && isFocus ? 'bg-[#FF6B3D] text-white' : 'bg-brand text-white'}`}
        >
          <Crosshair size={12} />
          {following && isFocus ? L('따라가는 중', 'Following') : L('반품 여정 따라가기', 'Follow return journey')}
        </button>
      </div>
      <div className="mt-2 rounded-lg bg-white px-2.5 py-1.5 text-[11.5px] text-ink-2">“{r.text}”</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
        {r.status === 'pending' ? (
          <span className="flex items-center gap-1 text-muted"><Loader2 size={11} className="animate-spin" />{L('사유 판독 중', 'Reading reason')}</span>
        ) : (
          <>
            <span className="rounded bg-line-2 px-1.5 py-[2px] font-semibold text-ink-2">{L(`사유 ${REASON_LABEL[r.reason]}`, `Reason: ${REASON_LABEL[r.reason]}`)}</span>
            <By by={r.by} conf={r.ai?.reasonConfidence} />
            <span className="rounded bg-line-2 px-1.5 py-[2px] font-semibold text-ink-2">{r.unopened ? L('미개봉', 'Unopened') : L('개봉', 'Opened')}{r.ai ? ` ${r.ai.unopened.toFixed(2)}` : ''}</span>
            {r.carrierDamage && <span className="rounded bg-bad-soft px-1.5 py-[2px] font-semibold text-bad">{L('운송 중 파손', 'Damaged in transit')}</span>}
          </>
        )}
      </div>
      <ol className="mt-2.5 space-y-1.5">
        {RETURN_STEPS.map((s, i) => (
          <li key={s.label} className="flex gap-2">
            <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] font-bold ${i < r.stage || r.stage === 6 ? 'bg-brand text-white' : i === r.stage ? 'bg-brand-soft text-brand ring-2 ring-brand/30' : 'bg-line-2 text-faint'}`}>{i + 1}</span>
            <div className="min-w-0">
              <div className="flex items-baseline gap-1.5 text-[11.5px]">
                <span className={`font-semibold ${i <= r.stage ? 'text-ink' : 'text-faint'}`}>{s.label}</span>
                <span className="text-[10.5px] text-muted">{i === 1 && r.van ? r.van : i === 4 && r.truck ? r.truck : s.sub}</span>
                {r.times[i] != null && <span className="num ml-auto text-[10.5px] text-faint">{hhmm(r.times[i]!)}</span>}
              </div>
              {i === r.stage && <p className="mt-0.5 text-[10.5px] leading-snug text-muted">{s.desc}</p>}
              {i === 5 && r.disposition && <p className="mt-0.5 text-[11px] font-semibold text-ink-2">→ {DISPOSITION_LABEL[r.disposition]} · {r.note}</p>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function ReturnsTab() {
  useStore((s) => s.tick)
  const [sel, setSel] = useState<number | null>(null)
  const [text, setText] = useState('')
  const [stop, setStop] = useState('A101')
  const list = sim.cs.returns
  const r = list.find((x) => x.id === sel) ?? sim.cs.focus ?? list[0]
  const st = sim.cs.stats
  const active = list.filter((x) => x.stage < 6).length
  const stops = [...new Set(Object.values(VARIANTS).flat())]
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        <Stat label={L('오늘 반품 접수', 'Returns today')} value={num(st.returns)} sub={L('앱 신청 + 고객 문의', 'App requests + inquiries')} />
        <Stat label={L('진행 중', 'In progress')} value={num(active)} sub={L('회수·회송·검수', 'Pickup · Backhaul · Inspection')} tone="brand" />
        <Stat label={L('처리 완료', 'Completed')} value={num(st.done)} sub={L('환불 승인', 'Refund approved')} tone="ok" />
        <div className="rounded-xl border border-line bg-white px-3 py-2">
          <div className="text-[11px] text-muted">{L('처리 방법', 'Disposition')}</div>
          <div className="mt-1 space-y-0.5">
            {(Object.keys(DISPOSITION_LABEL) as Disposition[]).map((d) => (
              <div key={d} className="flex items-center justify-between text-[10.5px]">
                <span className={`rounded px-1 font-semibold ${DISP_TONE[d]}`}>{DISPOSITION_LABEL[d]}</span>
                <span className="num text-ink-2">{st.byDisp[d]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <form
            className="mb-2 flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault()
              const t = text.trim()
              if (!t) return
              const nr = sim.cs.openReturn(t, stop, { name: L('블루투스 스피커', 'Bluetooth speaker'), cat: 'electronics' }, L('관리자 입력', 'Admin input'))
              setSel(nr.id)
              setText('')
            }}
          >
            <select value={stop} onChange={(e) => setStop(e.target.value)} aria-label={L('회수할 동', 'Pickup building')} className="h-8 rounded-lg border border-line bg-white px-1.5 text-[11.5px]">
              {stops.map((id) => <option key={id} value={id}>{STOPS[id].label.replace(APT_PREFIX, '')}</option>)}
            </select>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={L('반품 사유 입력 (예: 박스가 젖어서 왔어요)', 'Return reason (e.g. The box arrived wet)')} aria-label={L('반품 사유', 'Return reason')} className="h-8 min-w-0 flex-1 rounded-lg border border-line px-2 text-[11.5px] outline-none focus:border-brand" />
            <button type="submit" className="h-8 rounded-lg bg-brand px-2.5 text-[11.5px] font-semibold text-white">{L('반품 신청', 'Request return')}</button>
          </form>
          {list.slice(0, 16).map((x) => (
            <button key={x.id} type="button" onClick={() => setSel(x.id)} className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left ${r?.id === x.id ? 'border-brand bg-brand-soft/40' : 'border-line bg-white hover:border-brand/40'}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="num font-semibold text-ink">{x.no}</span>
                  <span className="truncate text-muted">{x.item.name}</span>
                </div>
                <div className="truncate text-[11px] text-ink-2">{x.status === 'pending' ? L('사유 판독 중…', 'Reading reason…') : `${REASON_LABEL[x.reason]}${x.unopened ? L(' · 미개봉', ' · Unopened') : ''}`}</div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Dots r={x} />
                <span className={`text-[10.5px] font-semibold ${x.stage === 6 && x.disposition ? DISP_TONE[x.disposition].split(' ')[1] : 'text-muted'}`}>{x.stage === 6 && x.disposition ? DISPOSITION_LABEL[x.disposition] : RETURN_STEPS[x.stage].label}</span>
              </div>
            </button>
          ))}
        </div>
        <div className="w-[360px] shrink-0">{r ? <Detail r={r} /> : <div className="text-[12px] text-muted">{L('반품이 아직 없습니다', 'No returns yet')}</div>}</div>
      </div>
    </div>
  )
}
