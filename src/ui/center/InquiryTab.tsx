// 고객 문의 탭: 왼쪽은 고객 휴대폰 화면(내 택배 어디쯤? 조회 + 채팅), 오른쪽은 관제 쪽 문의 목록과 처리 결과
import { useEffect, useRef, useState } from 'react'
import { Loader2, Send, Truck } from 'lucide-react'
import { sim, type Vehicle } from '../../sim/sim'
import { INTENT_LABEL, type Inquiry } from '../../sim/cs'
import { STOPS, TW } from '../../sim/sites'
import { useStore } from '../../store'
import { DROP_LABEL, hhmm, num } from '../format'
import { L, plural } from '../../i18n'
import { By, Stat } from './OpsCenter'

const PHONE_STEPS = [L('집하', 'Picked up'), L('간선 이동', 'Linehaul'), L('터미널 도착', 'At terminal'), L('배송 출발', 'Out for delivery'), L('배송 완료', 'Delivered')]

/** 택배 상태(고객 앱 표시용) */
function parcelState(q: Inquiry) {
  const v = sim.vehicle(q.van)
  const idx = v ? v.stops.findIndex((s) => s.id === q.stopId) : -1
  const memo = v?.memos[q.stopId]
  if (memo?.plan?.drop === 'reschedule' && v && idx >= v.stopIdx) return { step: 2, label: L('재배송 예약', 'Redelivery booked'), eta: null as ReturnType<typeof sim.cs.eta>, v }
  if (!v || v.dest !== 'TW' || idx < 0 || idx < v.stopIdx) return { step: 4, label: L('배송 완료', 'Delivered'), eta: null, v }
  const eta = sim.cs.eta(v, q.stopId)
  return { step: 3, label: L('배송 중', 'On the way'), eta, v }
}

/** 다온마을 미니 지도: 도로·정차지·배송차 위치 */
function MiniMap({ q, v }: { q: Inquiry; v: Vehicle | null | undefined }) {
  const target = STOPS[q.stopId]
  const x0 = -566
  const x1 = -362
  const z0 = 52
  const z1 = 270
  const inTown = v && v.visible && v.x < x1 && v.x > x0 && v.z > z0 && v.z < z1
  return (
    <svg viewBox={`${x0} ${z0} ${x1 - x0} ${z1 - z0}`} className="h-[150px] w-full rounded-xl bg-[#EEF3EC]" role="img" aria-label={L('다온마을 지도', 'Daon Village map')}>
      {/* 도로 */}
      <path d={`M ${TW.road.x} ${z0} L ${TW.road.x} 262`} stroke="#FFFFFF" strokeWidth="9" fill="none" strokeLinecap="round" />
      <path d={`M ${TW.apt.x0} ${TW.apt.roadZ} L ${TW.apt.x1} ${TW.apt.roadZ}`} stroke="#FFFFFF" strokeWidth="9" fill="none" strokeLinecap="round" />
      <path d={`M ${TW.road.x} ${TW.apt.roadZ} L ${TW.apt.x0} ${TW.apt.roadZ}`} stroke="#FFFFFF" strokeWidth="9" fill="none" />
      {/* 아파트 동 · 빌라 */}
      {[...TW.northRow.map((x) => [x, TW.northZ]), ...TW.southRow.map((x) => [x, TW.southZ])].map(([x, z]) => (
        <rect key={`${x}-${z}`} x={x - 14} y={z - 7} width={28} height={14} rx={2} fill="#D7DEEA" />
      ))}
      {TW.villas.map((z) => <rect key={z} x={TW.villaX - 4} y={z - 8} width={14} height={16} rx={2} fill="#E5DDD0" />)}
      {/* 정차지 */}
      {Object.values(STOPS).map((s) => (
        <circle key={s.id} cx={s.door.x} cy={s.door.z} r={s.id === q.stopId ? 0 : 3} fill="#A3ABBF" />
      ))}
      {/* 내 택배 도착지 */}
      <g transform={`translate(${target.door.x} ${target.door.z})`}>
        <circle r={11} fill="#2F55E6" opacity={0.15} />
        <circle r={5.5} fill="#2F55E6" stroke="#fff" strokeWidth={2} />
      </g>
      {/* 배송차 */}
      {inTown && (
        <g transform={`translate(${v!.x} ${v!.z})`}>
          <circle r={9} fill="#FF6B3D" opacity={0.2}>
            <animate attributeName="r" values="7;12;7" dur="1.6s" repeatCount="indefinite" />
          </circle>
          <circle r={5} fill="#FF6B3D" stroke="#fff" strokeWidth={2} />
        </g>
      )}
    </svg>
  )
}

/** 이름 가운데 글자 가리기(김도윤 → 김*윤). 로마자 이름은 성과 이름 첫 글자만(Kim Do-yun → Kim D.) */
const maskName = (n: string) => (n.includes(' ') ? `${n.split(' ')[0]} ${n.split(' ')[1]?.[0] ?? ''}.` : n.length >= 3 ? `${n[0]}*${n.slice(2)}` : `${n[0]}*`)
/** 차량별 가상 안심번호(실제 번호 대신 중계 번호) */
const safeNo = (id: string) => {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 100000000
  const s = String(h).padStart(8, '0')
  return `0504-${s.slice(0, 4)}-${s.slice(4)}`
}

/** 배송 완료 증빙: 맡긴 곳 사진(그림)과 시각 */
function Proof({ q }: { q: Inquiry }) {
  const p = sim.proofs.get(`${q.van}:${q.stopId}`)
  if (!p) return null
  const where = DROP_LABEL[p.mode] ?? L('문 앞', 'Doorstep')
  return (
    <div className="flex items-center gap-2 rounded-lg bg-white p-1.5 shadow-sm">
      <div className="relative h-11 w-14 shrink-0 overflow-hidden rounded-md bg-[#D9DFEA]">
        <div className="absolute inset-x-0 bottom-0 h-3 bg-[#B9AFA2]" />
        <div className="absolute bottom-3 left-2 h-7 w-5 rounded-t-sm bg-[#8A94A8]" />
        <div className="absolute bottom-3 right-2 h-4 w-5 rounded-sm bg-[#D7A86E]" />
        <div className="absolute bottom-[22px] right-[13px] h-1 w-2 bg-white" />
      </div>
      <div className="min-w-0 text-[10.5px] leading-snug">
        <div className="font-semibold text-ink">{L('배송 완료 사진', 'Delivery photo')}</div>
        <div className="text-muted">{hhmm(p.time)} · {where}</div>
      </div>
    </div>
  )
}

function Phone({ q }: { q: Inquiry }) {
  const st = parcelState(q)
  const [text, setText] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const thread = sim.cs.inquiries.filter((x) => x.parcelNo === q.parcelNo).slice().reverse()
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight })
  }, [thread.length, q.id])
  const send = () => {
    const t = text.trim()
    if (!t) return
    sim.cs.ask(t, { van: q.van, stopId: q.stopId, parcelNo: q.parcelNo, customer: q.customer, item: q.item }, 'user')
    setText('')
    useStore.getState().bump()
  }
  const target = STOPS[q.stopId]
  return (
    <div className="sticky top-0 flex h-[min(700px,calc(100vh-200px))] w-[300px] shrink-0 flex-col overflow-hidden rounded-[28px] border-[6px] border-ink bg-white shadow-[0_18px_40px_rgba(18,25,51,0.25)]">
      <div className="flex items-center justify-between bg-brand px-4 pb-2 pt-3 text-white">
        <span className="text-[12px] font-bold">{L('다온택배', 'Daon Parcel')}</span>
        <span className="num text-[10.5px] opacity-80">{hhmm(sim.clock)}</span>
      </div>
      <div className="space-y-2 border-b border-line bg-[#F7F9FD] px-3 py-2.5">
        <div className="flex items-baseline justify-between">
          <span className="num text-[11px] text-muted">{q.parcelNo}</span>
          <span className={`text-[11px] font-bold ${st.step === 4 ? 'text-ok' : 'text-brand'}`}>{st.label}</span>
        </div>
        <div className="text-[13px] font-bold text-ink">{q.item.name}</div>
        <div className="flex gap-1">
          {PHONE_STEPS.map((s, i) => (
            <div key={s} className="min-w-0 flex-1">
              <div className={`h-1 rounded-full ${i <= st.step ? 'bg-brand' : 'bg-line'}`} />
              <div className={`mt-0.5 truncate text-[9px] ${i === st.step ? 'font-bold text-ink' : 'text-faint'}`}>{s}</div>
            </div>
          ))}
        </div>
        {st.eta ? (
          <div className="rounded-lg bg-white px-2.5 py-1.5 shadow-sm">
            <div className="num text-[18px] font-extrabold tracking-[-0.02em] text-ink">{hhmm(st.eta.clock)} <span className="text-[11px] font-semibold text-muted">{L('도착 예정', 'ETA')}</span></div>
            <div className="text-[10.5px] text-muted">{L(`${st.eta.ahead ? `앞에 ${st.eta.ahead}곳 남음` : '다음 정차지가 우리 동'} · 약 ${st.eta.min}분 · ${target.label}`, `${st.eta.ahead ? `${st.eta.ahead} ${plural(st.eta.ahead, 'stop')} ahead` : 'Your building is next'} · ~${st.eta.min} min · ${target.label}`)}</div>
          </div>
        ) : (
          <div className="rounded-lg bg-white px-2.5 py-1.5 text-[11px] text-muted shadow-sm">{st.step === 4 ? L(`${target.label} 배송을 마쳤어요`, `Delivered to ${target.label}`) : L('재배송 날짜에 다시 출발합니다', 'We will set out again on the redelivery date')}</div>
        )}
        <MiniMap q={q} v={st.v} />
        {st.v && (
          <div className="flex items-center gap-1.5 text-[10.5px] text-muted">
            <Truck size={11} className="text-[#FF6B3D]" />
            {/* 공유 범위: 기사 이름 가운데와 실제 번호는 가리고 안심번호만 */}
            {L(`${maskName(st.v.driver)} 기사님 · 안심번호 ${safeNo(st.v.id)}`, `Driver ${maskName(st.v.driver)} · Relay no. ${safeNo(st.v.id)}`)}
          </div>
        )}
        {st.step === 4 && <Proof q={q} />}
      </div>
      <div ref={box} className="scroll-thin min-h-[120px] flex-1 space-y-1.5 overflow-y-auto bg-white px-3 py-2">
        {thread.map((m) => (
          <div key={m.id} className="space-y-1">
            <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-brand px-2.5 py-1.5 text-[11.5px] leading-snug text-white">{m.text}</div>
            <div className="w-fit max-w-[88%] rounded-2xl rounded-bl-sm bg-line-2 px-2.5 py-1.5 text-[11.5px] leading-snug text-ink">
              {m.status === 'pending' ? <span className="flex items-center gap-1 text-muted"><Loader2 size={11} className="animate-spin" />{L('확인 중…', 'Checking…')}</span> : m.reply}
            </div>
          </div>
        ))}
      </div>
      <form
        className="flex gap-1.5 border-t border-line bg-white p-2"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={L('문의 입력 (예: 경비실에 맡겨 주세요)', 'Type a message (e.g. Leave it at the security office)')}
          aria-label={L('고객 문의 입력', 'Customer message')}
          className="h-8 min-w-0 flex-1 rounded-full border border-line px-3 text-[11.5px] outline-none focus:border-brand"
        />
        <button type="submit" aria-label={L('보내기', 'Send')} className="grid h-8 w-8 place-items-center rounded-full bg-brand text-white">
          <Send size={13} />
        </button>
      </form>
    </div>
  )
}

const INTENT_TONE: Record<string, string> = {
  where_is: 'bg-brand-soft text-brand',
  change_drop: 'bg-[#E6F6F4] text-[#0E8C82]',
  reschedule: 'bg-[#EEF0FF] text-[#5B5BD6]',
  return: 'bg-warn-soft text-warn',
  complaint: 'bg-bad-soft text-bad',
  contact_driver: 'bg-line-2 text-ink-2',
  other: 'bg-line-2 text-muted',
}

export function InquiryTab() {
  useStore((s) => s.tick)
  const [sel, setSel] = useState<number | null>(null)
  const list = sim.cs.inquiries
  // 고객 휴대폰에는 직접 고른 문의(없으면 가장 최근 것)를 띄운다. 같은 택배의 대화는 한 화면에 이어 보인다
  const q = list.find((x) => x.id === sel) ?? list.find((x) => x.source === 'user') ?? list[0]
  const st = sim.cs.stats
  const intents = Object.entries(st.byIntent).sort((a, b) => b[1] - a[1])
  const total = Math.max(1, intents.reduce((s, [, n]) => s + n, 0))
  return (
    <div className="flex items-start gap-4">
      {q ? <Phone q={q} /> : <div className="grid w-[300px] place-items-center text-[12px] text-muted">{L('문의를 기다리는 중…', 'Waiting for inquiries…')}</div>}
      <div className="min-w-0 flex-1 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <Stat label={L('오늘 문의', 'Inquiries today')} value={num(st.inquiries)} sub={L('고객 앱 · 채팅', 'Customer app · chat')} />
          <Stat label={L('자동 처리', 'Auto-handled')} value={`${Math.round((st.auto / Math.max(1, st.inquiries)) * 100)}%`} sub={L(`${num(st.auto)}건 · 코드가 바로 처리`, `${num(st.auto)} · handled by code at once`)} tone="ok" />
          <Stat label={L('상담원 연결', 'To an agent')} value={num(st.human)} sub={L('불확실·화난 고객', 'Unclear or upset customers')} tone={st.human ? 'warn' : undefined} />
        </div>
        <div>
          <div className="mb-1 text-[11.5px] font-semibold text-ink">{L('문의 유형', 'Inquiry types')}</div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-line-2">
            {intents.map(([k, n]) => (
              <div key={k} className={INTENT_TONE[k]?.split(' ')[0] ?? 'bg-line'} style={{ width: `${(n / total) * 100}%` }} title={`${INTENT_LABEL[k as keyof typeof INTENT_LABEL]} ${n}`} />
            ))}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] text-muted">
            {intents.map(([k, n]) => <span key={k}>{INTENT_LABEL[k as keyof typeof INTENT_LABEL]} {n}</span>)}
          </div>
        </div>
        <div className="space-y-1">
          {list.slice(0, 14).map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setSel(x.id)}
              className={`block w-full rounded-lg border px-2.5 py-2 text-left ${q?.id === x.id ? 'border-brand bg-brand-soft/40' : 'border-line bg-white hover:border-brand/40'}`}
            >
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="num text-faint">{hhmm(x.time)}</span>
                <span className="font-semibold text-ink-2">{x.customer}</span>
                <span className="truncate text-muted">{STOPS[x.stopId]?.label}</span>
                {x.source === 'user' && <span className="rounded bg-ink px-1 text-[9.5px] font-bold text-white">{L('직접 입력', 'Typed')}</span>}
                <span className="ml-auto flex items-center gap-1">
                  {x.status === 'pending' ? (
                    <span className="flex items-center gap-1 text-muted"><Loader2 size={10} className="animate-spin" />{L('판독 중', 'Reading…')}</span>
                  ) : (
                    <>
                      <span className={`rounded px-1.5 py-[2px] text-[10px] font-semibold ${INTENT_TONE[x.intent]}`}>{INTENT_LABEL[x.intent]}</span>
                      <By by={x.by} conf={x.ai?.intentConfidence} />
                    </>
                  )}
                </span>
              </div>
              <div className="mt-0.5 truncate text-[12px] text-ink">“{x.text}”</div>
              {x.status !== 'pending' && (
                <div className={`mt-0.5 truncate text-[11px] ${x.human ? 'text-warn' : 'text-ok'}`}>→ {x.action}</div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
