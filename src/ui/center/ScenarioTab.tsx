// 명절 시나리오 탭: 프리셋 또는 공지 문장(AI)으로 물량을 가정하고, 대응을 켜고 끄며 병목·밀린 물량·해소 시간을 본다
import { useMemo, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { sim, SPEEDUP } from '../../sim/sim'
import { PRESETS, RESPONSES, evaluate, fromNotice, type Mult, type NoticeAnswer, type StageId } from '../../sim/scenario'
import { readNotice } from '../../ai/judge'
import { useStore } from '../../store'
import { num } from '../format'
import { L, LL } from '../../i18n'
import { Stat } from './OpsCenter'

const EXAMPLES = LL([
  '다음 주 추석 연휴를 앞두고 선물세트 주문이 평소의 두 배 가까이 몰릴 예정입니다. 특히 한우·과일 같은 냉장 선물이 많습니다.',
  '광군제 주간에 중국발 해외 직구 물량이 크게 늘어 부산신항 수입 컨테이너가 평소보다 많이 들어옵니다.',
  '이번 주말 태풍 북상으로 중부지방에 강한 비바람이 예상됩니다. 물량은 평소와 비슷합니다.',
], [
  'Ahead of the Chuseok holiday next week, gift set orders are expected to reach nearly twice the usual volume. Many are chilled gifts such as Hanwoo beef and fruit.',
  "During Singles' Day week, direct-purchase volume from China rises sharply, and more import containers than usual arrive at Busan New Port.",
  'A typhoon moving north this weekend is expected to bring strong wind and rain to the central region. Volume will be about the same as usual.',
])

/** 택배 상자 단위(상자/시) 단계: 표시 문구(단위) 대신 단계 id로 고른다 */
const PARCEL_STAGES = new Set<StageId>(['ic', 'lh1', 'hub', 'lh2', 'sub', 'lm'])

const pct = (x: number) => `${Math.round(x * 100)}%`

export function ScenarioTab() {
  useStore((s) => s.tick)
  const [preset, setPreset] = useState('chuseok')
  const [custom, setCustom] = useState<{ label: string; load: Mult; cap: Mult; summary: string[]; by: 'ai' | 'rule'; a: NoticeAnswer; ms: number } | null>(null)
  const [resp, setResp] = useState<string[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const base = custom ?? PRESETS.find((p) => p.key === preset)!
  const res = useMemo(() => evaluate(base.load, base.cap, resp), [base, resp])
  const hours = (sim.elapsed * SPEEDUP) / 3600
  const live = { delivered: (sim.stats.delivered - sim.stats.deliveredBase) / Math.max(0.1, hours), hub: sim.hub.rate }

  const run = async () => {
    const t = text.trim()
    if (!t || busy) return
    setBusy(true)
    const r = await readNotice(t)
    setBusy(false)
    const s = fromNotice(r.answer)
    setCustom({ ...s, by: r.by, a: r.answer, ms: r.ms })
    setResp([])
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => {
              setPreset(p.key)
              setCustom(null)
              setResp([])
            }}
            title={p.desc}
            className={`h-8 rounded-full px-3 text-[12px] font-semibold ${!custom && preset === p.key ? 'bg-ink text-white' : 'bg-line-2 text-ink-2 hover:bg-brand-soft'}`}
          >
            {p.label}
          </button>
        ))}
        {custom && <span className="h-8 rounded-full bg-brand px-3 text-[12px] font-semibold leading-8 text-white">{L('공지 기반', 'From notice')} · {custom.label}</span>}
      </div>
      <div className="rounded-xl border border-line bg-[#FAFBFE] p-2.5">
        <div className="flex gap-1.5">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder={L('운영 공지를 붙여 넣으면 시나리오를 만듭니다', 'Paste an operations notice to build a scenario')} aria-label={L('물량 공지', 'Volume notice')} className="min-w-0 flex-1 resize-none rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-brand" />
          <button type="button" onClick={() => void run()} disabled={!text.trim() || busy} className="flex w-[118px] shrink-0 items-center justify-center gap-1 rounded-lg bg-brand text-[12px] font-semibold text-white disabled:opacity-50">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {L('시나리오 만들기', 'Build scenario')}
          </button>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {EXAMPLES.map((e) => (
            <button key={e} type="button" onClick={() => setText(e)} className="max-w-[300px] truncate rounded-md bg-white px-1.5 py-[3px] text-left text-[10.5px] text-muted ring-1 ring-line hover:text-brand">
              {e}
            </button>
          ))}
        </div>
        {custom && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className={`flex items-center gap-1 rounded px-1.5 py-[2px] font-semibold ${custom.by === 'ai' ? 'bg-brand-soft text-brand' : 'bg-line-2 text-muted'}`}>
              <Sparkles size={10} />
              {custom.by === 'ai' ? `AI ${Math.round(custom.ms)}ms` : L('규칙', 'Rule')}
            </span>
            {custom.summary.map((x) => <span key={x} className="rounded bg-white px-1.5 py-[2px] font-semibold text-ink-2 ring-1 ring-line">{x}</span>)}
            {custom.by === 'ai' && <span className="num text-faint">{L(`행사 ${custom.a.eventConfidence.toFixed(2)} · 규모 ${custom.a.scale.toFixed(2)}/3 · 냉장 ${custom.a.cold.toFixed(2)} · 수입 ${custom.a.imports.toFixed(2)} · 날씨 ${custom.a.weather.toFixed(2)}`, `Event ${custom.a.eventConfidence.toFixed(2)} · scale ${custom.a.scale.toFixed(2)}/3 · cold ${custom.a.cold.toFixed(2)} · imports ${custom.a.imports.toFixed(2)} · weather ${custom.a.weather.toFixed(2)}`)}</span>}
          </div>
        )}
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Stat label={L('병목 단계', 'Bottleneck')} value={res.worst.stage.label.replace(/^간선 /, '간선 ')} sub={`${L('가동률', 'Utilization')} ${pct(res.worst.util)}${resp.length ? ` → ${pct(res.worstAfter.utilAfter)}` : ''}`} tone={res.worst.util > 1 ? 'bad' : 'ok'} />
        <Stat label={L('당일 처리율(택배)', 'Same-day rate (parcels)')} value={`${pct(res.sameDay)}${resp.length ? ` → ${pct(res.sameDayAfter)}` : ''}`} sub={L('가장 좁은 단계가 정함', 'Set by the narrowest stage')} tone={res.sameDayAfter < 0.95 ? 'warn' : 'ok'} />
        <Stat label={L('하루 밀리는 물량(택배)', 'Daily backlog (parcels)')} value={num(res.rows.filter((r) => PARCEL_STAGES.has(r.stage.id)).reduce((s, r) => s + (resp.length ? r.backlogAfter : r.backlog), 0))} sub={L('상자 · 운영 10시간 기준', 'Boxes · 10-hour operating day')} />
        <Stat label={L('시뮬레이션 실측', 'Measured in sim')} value={L(`${num(live.delivered)}/시`, `${num(live.delivered)}/h`)} sub={L(`다온마을 배송 · 허브 분류 ${num(live.hub)}/시`, `Daon Village deliveries · hub sort ${num(live.hub)}/h`)} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {RESPONSES.map((r) => {
          const on = resp.includes(r.key)
          const rec = res.recommend.includes(r.key)
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => setResp(on ? resp.filter((x) => x !== r.key) : [...resp, r.key])}
              title={r.desc}
              className={`rounded-lg border px-2.5 py-1.5 text-left text-[11.5px] ${on ? 'border-ok bg-ok-soft text-ok' : rec ? 'border-warn bg-warn-soft/50 text-ink-2' : 'border-line bg-white text-muted'}`}
            >
              <div className="font-semibold">{on ? '✓ ' : rec ? L('추천 · ', 'Suggested · ') : ''}{r.label}</div>
              <div className="text-[10px] opacity-80">{r.desc}</div>
            </button>
          )
        })}
      </div>
      <table className="w-full text-[11.5px]">
        <thead>
          <tr className="border-b border-line text-left text-[10.5px] text-muted">
            <th className="py-1.5 font-semibold">{L('단계', 'Stage')}</th>
            <th className="text-right font-semibold">{L('물량/시', 'Load/h')}</th>
            <th className="text-right font-semibold">{L('능력/시', 'Capacity/h')}</th>
            <th className="w-[30%] pl-3 font-semibold">{L('가동률', 'Utilization')}{resp.length ? L('(대응 후)', ' (after)') : ''}</th>
            <th className="text-right font-semibold">{L('밀린 물량 · 해소', 'Backlog · clears in')}</th>
            <th className="text-right font-semibold">{L('부족분', 'Shortfall')}</th>
          </tr>
        </thead>
        <tbody>
          {res.rows.map((r) => {
            const u = resp.length ? r.utilAfter : r.util
            const bl = resp.length ? r.backlogAfter : r.backlog
            const ch = resp.length ? r.clearHAfter : r.clearH
            return (
              <tr key={r.stage.id} className="border-b border-line-2">
                <td className="py-1.5 font-semibold text-ink">{r.stage.label}<div className="text-[10px] font-normal text-faint">{r.stage.unit}</div></td>
                <td className="num text-right text-ink-2">{num(r.load)}</td>
                <td className="num text-right text-ink-2">{num(resp.length ? r.capAfter : r.cap)}</td>
                <td className="pl-3">
                  <div className="relative h-2 overflow-hidden rounded-full bg-line-2">
                    <div className={`h-full rounded-full ${u > 1 ? 'bg-bad' : u > 0.85 ? 'bg-warn' : 'bg-ok'}`} style={{ width: `${Math.min(100, u * 100)}%` }} />
                  </div>
                  <div className={`num mt-0.5 text-[10px] ${u > 1 ? 'font-bold text-bad' : 'text-muted'}`}>{pct(u)}{resp.length && r.util !== r.utilAfter ? L(` (대응 전 ${pct(r.util)})`, ` (before ${pct(r.util)})`) : ''}</div>
                </td>
                <td className="num text-right text-ink-2">{bl ? `${num(bl)} · ${ch > 48 ? L('48시간+', '48 h+') : L(`${ch.toFixed(1)}시간`, `${ch.toFixed(1)} h`)}` : '-'}</td>
                <td className="num text-right text-ink-2">{r.need && !resp.length ? `${r.stage.perLabel} +${r.need}` : '-'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="text-[10.5px] leading-snug text-faint">
        {L(
          '기준 물량·처리 능력은 평일 하루(운영 10시간)를 가정한 설명용 값이고, 시나리오 배수와 대응 효과도 가정입니다. 밀린 물량 해소 시간은 다음 날 평상 물량을 처리하고 남는 능력으로 계산합니다. 실제 계획에는 거점별 실측 처리량과 인력·차량 계약 조건이 필요합니다.',
          "Base volume and capacity are illustrative values for one weekday (10 operating hours); scenario multipliers and response effects are assumptions too. Backlog clearing time uses the capacity left after the next day's normal volume. Real planning needs measured throughput per site and staff and vehicle contract terms.",
        )}
      </p>
    </div>
  )
}
