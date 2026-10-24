// 새벽배송 · 콜드체인 탭: 냉동탑차 온도 그래프, 기사·센서 메시지 판독과 조치, 23시 마감 → 7시 도착 약속
import { useState } from 'react'
import { Loader2, Moon, Snowflake, Sun, Thermometer } from 'lucide-react'
import { sim } from '../../sim/sim'
import { ACTION_LABEL, COLD_SPEC, type ReeferTemp } from '../../sim/cold'
import { useStore } from '../../store'
import { hhmm, num, vehicleStatus } from '../format'
import { L, plural } from '../../i18n'
import { By, Stat } from './OpsCenter'

const dur = (sec: number) => {
  const m = Math.max(0, Math.round(sec / 60))
  return L(`${Math.floor(m / 60)}시간 ${m % 60}분`, `${Math.floor(m / 60)} h ${m % 60} min`)
}

function Spark({ s }: { s: ReeferTemp }) {
  const spec = COLD_SPEC[s.mode]
  const lo = spec.set - 4
  const hi = Math.max(spec.critical + 4, ...s.history, s.temp)
  const W = 300
  const H = 74
  const y = (t: number) => H - ((t - lo) / (hi - lo)) * H
  const pts = s.history.map((t, i) => `${(i / Math.max(1, 95)) * W},${y(t).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[74px] w-full" role="img" aria-label={L(`${s.id} 온도 그래프`, `${s.id} temperature chart`)}>
      <rect x={0} y={0} width={W} height={y(spec.critical)} fill="#FDE7E7" />
      <rect x={0} y={y(spec.critical)} width={W} height={y(spec.warn) - y(spec.critical)} fill="#FEF2DC" />
      <line x1={0} x2={W} y1={y(spec.set)} y2={y(spec.set)} stroke="#2F55E6" strokeDasharray="3 3" strokeWidth={1} opacity={0.5} />
      <polyline points={pts} fill="none" stroke={s.alarm === 'critical' ? '#DC2626' : s.alarm === 'warn' ? '#D97706' : '#0E8C82'} strokeWidth={2} strokeLinejoin="round" />
      <text x={W - 2} y={y(spec.critical) - 2} textAnchor="end" fontSize={9} fill="#DC2626">{L(`한계 ${spec.critical}°C`, `Limit ${spec.critical}°C`)}</text>
      <text x={W - 2} y={y(spec.set) - 2} textAnchor="end" fontSize={9} fill="#2F55E6">{L(`설정 ${spec.set}°C`, `Set ${spec.set}°C`)}</text>
    </svg>
  )
}

function ReeferCard({ s }: { s: ReeferTemp }) {
  const v = sim.vehicle(s.id)
  const [text, setText] = useState('')
  if (!v) return null
  const spec = COLD_SPEC[s.mode]
  const st = vehicleStatus(v)
  const tone = s.alarm === 'critical' ? 'text-bad' : s.alarm === 'warn' ? 'text-warn' : 'text-[#0E8C82]'
  return (
    <div className="min-w-0 rounded-xl border border-line bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <button type="button" className="min-w-0 text-left" onClick={() => useStore.getState().select({ kind: 'vehicle', id: v.id })}>
          <div className="flex items-center gap-1.5 text-[12.5px] font-bold text-ink"><Snowflake size={13} className="text-[#13A39A]" />{v.id} · {spec.label}</div>
          <div className="truncate text-[11px] text-muted">{v.visible ? st.label : L('서울 새벽배송 거점', 'Seoul dawn delivery depot')} · {v.driver}</div>
        </button>
        <div className="text-right">
          <div className={`num text-[22px] font-extrabold leading-none tracking-[-0.03em] ${tone}`}>{s.temp.toFixed(1)}°C</div>
          <div className="mt-0.5 text-[10.5px] text-muted">{L(`설정 ${spec.set}°C · 한계 ${spec.critical}°C`, `Set ${spec.set}°C · limit ${spec.critical}°C`)}</div>
        </div>
      </div>
      <Spark s={s} />
      <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
        <span className={`rounded px-1.5 py-[2px] font-semibold ${s.alarm === 'critical' ? 'bg-bad-soft text-bad' : s.alarm === 'warn' ? 'bg-warn-soft text-warn' : 'bg-ok-soft text-ok'}`}>{s.alarm === 'critical' ? L('한계 초과', 'Over limit') : s.alarm === 'warn' ? L('경고', 'Warning') : L('정상', 'Normal')}</span>
        {s.fault !== 'none' && <span className="rounded bg-line-2 px-1.5 py-[2px] font-semibold text-ink-2">{L('실제 상태: ', 'Actual: ')}{s.fault === 'compressor' ? L('냉동기 고장', 'Cooling unit failure') : L('문 틈', 'Door gap')}</span>}
        {s.action !== 'none' && <span className="rounded bg-brand-soft px-1.5 py-[2px] font-semibold text-brand">{L('조치: ', 'Action: ')}{ACTION_LABEL[s.action]}</span>}
      </div>
      <div className="mt-2 flex gap-1.5">
        <button type="button" disabled={!v.visible || s.fault !== 'none'} onClick={() => sim.cold.fail(v.id, 'compressor')} className="h-7 rounded-lg border border-line px-2 text-[11px] font-semibold text-ink-2 hover:border-bad hover:text-bad disabled:opacity-40">{L('냉동기 고장 가정', 'Simulate unit failure')}</button>
        <button type="button" disabled={!v.visible || s.fault !== 'none'} onClick={() => sim.cold.fail(v.id, 'door')} className="h-7 rounded-lg border border-line px-2 text-[11px] font-semibold text-ink-2 hover:border-warn hover:text-warn disabled:opacity-40">{L('문 틈 가정', 'Simulate door gap')}</button>
      </div>
      <form
        className="mt-1.5 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          if (!text.trim()) return
          sim.cold.report(v.id, text.trim())
          setText('')
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={L('기사 메시지 (예: 찬바람이 안 나와요)', 'Driver message (e.g. No cold air coming out)')} aria-label={L(`${v.id} 기사 메시지`, `${v.id} driver message`)} className="h-7 min-w-0 flex-1 rounded-lg border border-line px-2 text-[11px] outline-none focus:border-brand" />
        <button type="submit" className="h-7 rounded-lg bg-brand px-2 text-[11px] font-semibold text-white">{L('전송', 'Send')}</button>
      </form>
    </div>
  )
}

export function ColdTab() {
  useStore((s) => s.tick)
  const d = sim.cold.dawn()
  const st = sim.cold.stats
  const reefers = [...sim.cold.reefers.values()]
  return (
    <div className="space-y-3">
      <div className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 ${d.ordering ? 'bg-[#EEF0FF]' : 'bg-[#1F2A44] text-white'}`}>
        <span className={`grid h-9 w-9 place-items-center rounded-full ${d.ordering ? 'bg-white text-[#5B5BD6]' : 'bg-white/10 text-[#FFD27A]'}`}>{d.ordering ? <Sun size={17} /> : <Moon size={17} />}</span>
        <div className="min-w-0 flex-1">
          <div className={`text-[13px] font-bold ${d.ordering ? 'text-ink' : 'text-white'}`}>{d.ordering ? L(`새벽배송 주문 받는 중 · 23:00 마감까지 ${dur(d.toCutoff)}`, `Taking dawn delivery orders · ${dur(d.toCutoff)} to 23:00 cutoff`) : L(`새벽배송 진행 중 · 07:00 도착 약속까지 ${dur(d.toPromise)}`, `Dawn delivery underway · ${dur(d.toPromise)} to 07:00 arrival promise`)}</div>
          <div className={`text-[11px] ${d.ordering ? 'text-muted' : 'text-white/70'}`}>
            {L(
              `지금 ${hhmm(sim.clock)} · 23시까지 받은 주문은 이천 콜드체인에서 피킹해 냉동탑차로 서울 새벽배송 거점에 보내고, 다음 날 7시 전에 문 앞에 둡니다.`,
              `Now ${hhmm(sim.clock)} · Orders placed by 23:00 are picked at the Icheon cold chain, sent by reefer truck to the Seoul dawn delivery depot and left at the door before 07:00 the next day.`,
            )}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Stat label={L('오늘 새벽배송 주문', 'Dawn orders today')} value={num(st.dawnOrders)} sub={L(`냉동탑차 ${st.dawnTrips}회 운행`, `${st.dawnTrips} reefer ${plural(st.dawnTrips, 'trip')}`)} />
        <Stat label={L('적정 온도로 도착', 'Arrived in range')} value={`${Math.round(d.okRate * 100)}%`} sub={L('최근 10회 운행', 'Last 10 trips')} tone={d.okRate < 0.9 ? 'warn' : 'ok'} />
        <Stat label={L('재냉각 지시', 'Re-cool orders')} value={L(`${st.recool}회`, `${st.recool}`)} sub={L(`한계 전 메시지로 ${st.early} · 센서 경보 뒤 ${st.late} · 초과 ${st.excursions}`, `Early via message ${st.early} · after alarm ${st.late} · over limit ${st.excursions}`)} tone={st.late ? 'warn' : 'ok'} />
        <Stat label={L('바깥 기온', 'Outside temp')} value={`${sim.cold.ambient}°C`} sub={L('화면 계절·날씨 기준', 'From on-screen season & weather')} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {reefers.map((s) => <ReeferCard key={s.id} s={s} />)}
      </div>
      <div>
        <div className="mb-1 flex items-center gap-1.5 text-[11.5px] font-semibold text-ink"><Thermometer size={12} />{L('기사·센서 메시지와 조치', 'Driver & sensor messages and actions')}</div>
        <div className="space-y-1">
          {sim.cold.messages.slice(0, 10).map((m) => (
            <div key={m.id} className="rounded-lg border border-line bg-white px-2.5 py-1.5">
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="num text-faint">{hhmm(m.time)}</span>
                <span className="font-semibold text-ink-2">{m.vehicle}</span>
                <span className={`rounded px-1 text-[9.5px] font-bold ${m.source === 'sensor' ? 'bg-bad-soft text-bad' : 'bg-line-2 text-muted'}`}>{m.source === 'sensor' ? L('센서', 'Sensor') : L('기사', 'Driver')}</span>
                <span className="num text-muted">{m.temp.toFixed(1)}°C</span>
                <span className="ml-auto flex items-center gap-1">
                  {m.status === 'pending' ? <span className="flex items-center gap-1 text-muted"><Loader2 size={10} className="animate-spin" />{L('판독 중', 'Reading…')}</span> : <By by={m.by} />}
                </span>
              </div>
              <div className="mt-0.5 text-[12px] text-ink">“{m.text}”</div>
              {m.status !== 'pending' && (
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px]">
                  <span className={`font-semibold ${m.action === 'recool' ? 'text-bad' : m.action === 'door' ? 'text-warn' : m.action === 'watch' ? 'text-brand' : 'text-ok'}`}>→ {ACTION_LABEL[m.action]}</span>
                  <span className="text-muted">{m.note}</span>
                  {m.ai && (
                    <span className="num text-faint">
                      {L(
                        `냉동기 고장 ${m.ai.coolingFailure.toFixed(2)} · 문 ${m.ai.doorIssue.toFixed(2)} · 회복 중 ${m.ai.recovering.toFixed(2)} · 변질 위험 ${m.ai.risk.toFixed(1)}/3`,
                        `Unit failure ${m.ai.coolingFailure.toFixed(2)} · door ${m.ai.doorIssue.toFixed(2)} · recovering ${m.ai.recovering.toFixed(2)} · spoilage risk ${m.ai.risk.toFixed(1)}/3`,
                      )}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
          {!sim.cold.messages.length && <div className="py-4 text-center text-[12px] text-muted">{L('아직 메시지가 없습니다', 'No messages yet')}</div>}
        </div>
      </div>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-line text-left text-[10.5px] text-muted">
            <th className="py-1 font-semibold">{L('운행', 'Trip')}</th>
            <th className="font-semibold">{L('출발', 'Departed')}</th>
            <th className="font-semibold">{L('서울 거점 도착', 'Seoul depot arrival')}</th>
            <th className="text-right font-semibold">{L('주문', 'Orders')}</th>
            <th className="text-right font-semibold">{L('최고 온도', 'Max temp')}</th>
          </tr>
        </thead>
        <tbody>
          {[...sim.cold.trips].reverse().slice(0, 6).map((t, i) => (
            <tr key={`${t.vehicle}-${t.depart}-${i}`} className="border-b border-line-2">
              <td className="py-1 font-semibold text-ink-2">{t.vehicle} · {COLD_SPEC[t.mode].label}</td>
              <td className="num text-muted">{hhmm(t.depart)}</td>
              <td className="num text-muted">{t.arrive != null ? L(`${hhmm(t.arrive)} (${Math.round((t.arrive - t.depart) / 60)}분)`, `${hhmm(t.arrive)} (${Math.round((t.arrive - t.depart) / 60)} min)`) : L('이동 중', 'En route')}</td>
              <td className="num text-right text-ink-2">{L(`${num(t.orders)}건`, num(t.orders))}</td>
              <td className={`num text-right font-semibold ${t.excursion ? 'text-bad' : 'text-ink-2'}`}>{t.maxTemp.toFixed(1)}°C</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
