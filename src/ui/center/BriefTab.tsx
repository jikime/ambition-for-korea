// 관제 브리핑(경로 관리 영상 분석 1순위): 지금 간선 운행의 도착 약속 상태를 한 화면에.
// 머리 문장(템플릿), 원인 막대, 위험·지연 차량 목록(누르면 선택), 자동 처리 기록. 문장은 코드 템플릿이고 판단은 promise.ts.
import { sim, type Vehicle } from '../../sim/sim'
import { CAUSE_LABEL, type Cause } from '../../sim/promise'
import { useStore } from '../../store'
import { hhmm, num, promiseChip, siteCode } from '../format'
import { Chip } from '../primitives'
import { Stat } from './OpsCenter'
import { openApproval } from '../ApproveDialog'
import { KIND_LABEL } from '../../sim/approvals'
import { DELAY_LABEL, REASON_LABEL, type DriverReason } from '../../sim/driver'
import { L, isEn, plural } from '../../i18n'

export function BriefTab() {
  useStore((s) => s.tick)
  const rows: { v: Vehicle; state: string; eta: number; delta: number; causes: Cause[]; incident?: string }[] = []
  let running = 0
  for (const v of sim.vehicles) {
    const s = sim.promises.status(v)
    if (!s || s.state.startsWith('done')) continue
    running++
    if (s.state !== 'ontime') rows.push({ v, state: s.state, eta: s.eta, delta: s.delta, causes: s.causes, incident: s.incident })
  }
  rows.sort((a, b) => (a.state === 'late' ? 0 : 1) - (b.state === 'late' ? 0 : 1) || b.delta - a.delta)
  const causeCount: Partial<Record<Cause, number>> = {}
  for (const r of rows) for (const c of r.causes) causeCount[c] = (causeCount[c] ?? 0) + 1
  const maxCause = Math.max(1, ...Object.values(causeCount))
  const st = sim.promises.stats
  const rate = sim.promises.onTimeRate
  const active = sim.incidents.filter((i) => i.state === 'active')
  const late = rows.filter((r) => r.state === 'late').length
  const risk = rows.length - late
  const top = (Object.entries(causeCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null) as Cause | null
  // 머리 문장(템플릿)
  const head = rows.length
    ? L(
        `간선 ${running}대 운행 중 ${risk ? `${risk}대가 약속 시간대를 넘길 위험` : ''}${risk && late ? ', ' : ''}${late ? `${late}대가 이미 지연` : ''}입니다. 주된 원인은 ${top ? CAUSE_LABEL[top] : '혼잡'}${active.length ? `, 돌발 상황 ${active.length}건이 적용 중` : ''}입니다.`,
        `${running} linehaul ${plural(running, 'truck')} running: ${risk ? `${risk} at risk of missing the promise window` : ''}${risk && late ? ', ' : ''}${late ? `${late} already late` : ''}. Main cause: ${top ? CAUSE_LABEL[top] : 'Congestion'}${active.length ? `; ${active.length} ${plural(active.length, 'incident')} in effect` : ''}.`,
      )
    : L(
        `간선 ${running}대 운행 중이며 모두 약속 시간대 안에 도착할 예정입니다.${active.length ? ` 돌발 상황 ${active.length}건이 적용 중입니다.` : ''}`,
        `${running} linehaul ${plural(running, 'truck')} running, all due within the promise window.${active.length ? ` ${active.length} ${plural(active.length, 'incident')} in effect.` : ''}`,
      )
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-line bg-white px-3.5 py-3 text-[13px] leading-relaxed text-ink">{head}</div>
      <div className="grid grid-cols-4 gap-2">
        <Stat label={L('운행 중 간선', 'Linehaul running')} value={running} sub={L('도착 약속이 있는 운행', 'Runs with an arrival promise')} />
        <Stat label={L('위험', 'At risk')} value={risk} sub={L('도착 예정 > 약속 끝', 'ETA > window end')} tone={risk ? 'warn' : undefined} />
        <Stat label={L('지연', 'Late')} value={late} sub={L('약속 끝이 지났는데 미도착', 'Past window end, not arrived')} tone={late ? 'bad' : undefined} />
        <Stat label={L('정시 도착률', 'On-time arrival')} value={rate === null ? '-' : `${rate.toFixed(1)}%`} sub={L(`화면을 연 뒤 ${num(st.ontime + st.late)}회 · 지연 ${st.late}`, `${num(st.ontime + st.late)} ${plural(st.ontime + st.late, 'run')} since open · ${st.late} late`)} tone="ok" />
      </div>
      <div className="grid grid-cols-[1fr_1.5fr] gap-3">
        <div>
          <div className="mb-1.5 text-[11.5px] font-semibold text-ink">{L('원인', 'Causes')}</div>
          {Object.keys(causeCount).length ? (
            <div className="space-y-1.5">
              {(Object.entries(causeCount) as [Cause, number][]).sort((a, b) => b[1] - a[1]).map(([c, n]) => (
                <div key={c} className="text-[11px]">
                  <div className="flex justify-between text-ink-2"><span>{CAUSE_LABEL[c]}</span><span className="num font-semibold">{L(`${n}대`, `${n}`)}</span></div>
                  <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-line-2"><div className="h-full rounded-full bg-warn" style={{ width: `${(n / maxCause) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          ) : <div className="text-[11px] text-muted">{L('위험한 운행이 없습니다', 'No runs at risk')}</div>}
          <div className="mb-1 mt-3 text-[11.5px] font-semibold text-ink">{L('기사 메시지', 'Driver messages')} <span className="font-normal text-muted">{L('· AI가 사유·운행 불가·지연 판단(⑮)', '· AI reads reason, can’t continue, delay (⑮)')}</span></div>
          <div className="space-y-1">
            {sim.driver.messages.slice(0, 4).map((m) => (
              <div key={m.id} className="rounded-lg bg-white px-2 py-1.5 text-[11px] ring-1 ring-line">
                <div className="flex items-center gap-1.5">
                  <span className="num text-faint">{hhmm(m.time)}</span>
                  <span className="font-semibold text-ink">{m.vehicle}</span>
                  {m.answer && <Chip tone={m.answer.cannotContinue > 0.6 ? 'red' : m.answer.delay >= 1.5 ? 'amber' : 'gray'}>{REASON_LABEL[m.answer.reason as DriverReason] ?? m.answer.reason} · {DELAY_LABEL[Math.max(0, Math.min(3, Math.round(m.answer.delay)))]}</Chip>}
                  <span className="ml-auto text-faint">{m.by === 'ai' ? 'AI' : m.by === 'rule' ? L('규칙', 'Rule') : L('판독 중', 'Reading')}</span>
                </div>
                <div className="mt-0.5 text-ink-2">"{m.text}"</div>
                <div className="text-muted">→ {m.decision}</div>
              </div>
            ))}
            {!sim.driver.messages.length && <div className="text-[11px] text-muted">{L('아직 메시지가 없습니다', 'No messages yet')}</div>}
          </div>
          <div className="mb-1 mt-3 text-[11.5px] font-semibold text-ink">{L('자동으로 처리한 일', 'Handled automatically')}</div>
          <ul className="space-y-0.5 text-[11px] text-ink-2">
            <li>{L(`돌발 상황 자동 적용 ${sim.incidents.filter((i) => i.applied).length}건(속도 제한·경고 표지)`, `Incidents auto-applied: ${sim.incidents.filter((i) => i.applied).length} (speed limits, warning signs)`)}</li>
            <li>{L(`의무 휴게 편성 ${sim.restStats.stops}회 · 기사 교대 ${sim.restStats.swaps}회`, `Mandatory rest stops: ${sim.restStats.stops} · Driver swaps: ${sim.restStats.swaps}`)}</li>
            <li>{L(`고객 문의 자동 처리 ${sim.cs.stats.auto}건 · 상담원 ${sim.cs.stats.human}건`, `Inquiries handled automatically: ${sim.cs.stats.auto} · By agents: ${sim.cs.stats.human}`)}</li>
            <li>{L(`노선별 운행 시간 학습 ${Object.keys(sim.promises.ratio).length}개 노선`, `Run times learned for ${Object.keys(sim.promises.ratio).length} ${plural(Object.keys(sim.promises.ratio).length, 'route')}`)}</li>
          </ul>
        </div>
        <div>
          <div className="mb-1.5 text-[11.5px] font-semibold text-ink">{L('위험·지연 차량', 'At-risk & late vehicles')}</div>
          {rows.length ? (
            <div className="divide-y divide-line-2 rounded-xl border border-line bg-white">
              {rows.slice(0, 10).map((r) => {
                const pc = promiseChip(r.v)
                return (
                  <button
                    key={r.v.id}
                    type="button"
                    onClick={() => useStore.getState().select({ kind: 'vehicle', id: r.v.id }, r.v.site)}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11.5px] hover:bg-line-2"
                  >
                    <span className="w-16 shrink-0 font-semibold text-ink">{r.v.id}</span>
                    <span className="min-w-0 flex-1 truncate text-muted">
                      {siteCode(r.v.site)} → {r.v.promise!.dest} · {L(`약속 ${hhmm(r.v.promise!.win[1])}까지 · 예정 ${hhmm(r.eta)}`, `Due by ${hhmm(r.v.promise!.win[1])} · ETA ${hhmm(r.eta)}`)} · {r.causes.map((c) => (c === 'incident' && r.incident ? r.incident : CAUSE_LABEL[c])).join(', ')}
                    </span>
                    {pc && <Chip tone={pc.tone}>{pc.label}</Chip>}
                  </button>
                )
              })}
            </div>
          ) : <div className="rounded-xl border border-line bg-white px-3 py-4 text-center text-[11.5px] text-muted">{L('모든 간선이 약속 시간대 안입니다', 'All linehaul runs are within the promise window')}</div>}
          <div className="mb-1.5 mt-3 text-[11.5px] font-semibold text-ink">{L('승인 대기 · 감사 기록', 'Pending approvals · Audit log')}</div>
          <div className="space-y-1">
            {sim.approvals.pending.map((p) => (
              <button key={p.id} type="button" onClick={() => openApproval(p.id)} className="flex w-full items-center gap-2 rounded-lg bg-warn-soft px-2.5 py-1.5 text-left text-[11.5px] hover:brightness-95">
                <Chip tone="amber">{KIND_LABEL[p.kind]}</Chip>
                <span className="min-w-0 flex-1 truncate font-semibold text-ink">{p.title}</span>
                <span className="text-warn">{L('검토', 'Review')}</span>
              </button>
            ))}
            {sim.approvals.audit.slice(0, 6).map((a, i) => (
              <div key={`${a.t}-${i}`} className="flex gap-2 text-[10.5px]">
                <span className="num w-9 shrink-0 text-faint">{hhmm(a.t)}</span>
                <span className={`${isEn ? 'w-12' : 'w-10'} shrink-0 font-semibold text-ink-2`}>{a.action}</span>
                <span className="min-w-0 flex-1 truncate text-muted">{a.who} · {a.text}</span>
              </div>
            ))}
            {!sim.approvals.pending.length && !sim.approvals.audit.length && <div className="text-[11px] text-muted">{L('아직 제안이 없습니다', 'No proposals yet')}</div>}
          </div>
          <p className="mt-2 text-[10.5px] leading-snug text-faint">
            {L('약속 시간대는 간선이 출발할 때 노선별 실측 운행 시간(지수 이동 평균)으로 정한 계획 도착의 앞 25%·뒤 60%입니다. 달리는 동안 남은 경로·돌발 속도·휴게·정문을 다시 더해 도착 예정을 냅니다(`src/sim/promise.ts`).', 'The promise window spans 25% before to 60% after the planned arrival, set at departure from the measured run time per route (exponential moving average). While driving, the remaining route, incident speeds, rest stops and gates are added back to get the ETA (`src/sim/promise.ts`).')}
          </p>
        </div>
      </div>
    </div>
  )
}
