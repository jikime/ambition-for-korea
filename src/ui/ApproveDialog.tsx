// 승인 창: 제안을 현재 vs 제안 카드로 비교하고 거절/승인한다. 결과는 감사 기록에 남는다(src/sim/approvals.ts).
// 상단 "승인 대기 n" 알약을 누르면 열린다.
import { useEffect, useState } from 'react'
import { ShieldCheck, X } from 'lucide-react'
import { sim } from '../sim/sim'
import { CONTROLLER, KIND_LABEL, type Proposal } from '../sim/approvals'
import { useStore } from '../store'
import { Chip } from './primitives'
import { L } from '../i18n'

/** 열 제안(id). 다른 화면에서도 열 수 있게 모듈 상태 + 구독 */
let openId: number | null = null
const subs = new Set<() => void>()
export function openApproval(id: number | null) {
  openId = id
  subs.forEach((f) => f())
}

function CardView({ title, lines, inWin, tone }: { title: string; lines: string[]; inWin?: boolean; tone: 'cur' | 'next' }) {
  return (
    <div className={`min-w-0 flex-1 rounded-xl border p-3 ${tone === 'next' ? 'border-brand/40 bg-brand-soft' : 'border-line bg-white'}`}>
      <div className="flex items-center gap-2 text-[11px] font-semibold text-muted">
        {tone === 'cur' ? L('지금', 'Now') : L('제안', 'Proposed')}
        {inWin !== undefined && <Chip tone={inWin ? 'green' : 'amber'}>{inWin ? L('약속 안', 'In window') : L('약속 밖', 'Out of window')}</Chip>}
      </div>
      <div className="mt-1 text-[13px] font-semibold text-ink">{title}</div>
      <ul className="mt-1.5 space-y-0.5 text-[11.5px] text-ink-2">
        {lines.map((l, i) => <li key={i} className="leading-snug">{l}</li>)}
      </ul>
    </div>
  )
}

export function PendingPill() {
  useStore((s) => s.tick)
  const n = sim.approvals.pending.length
  if (!n) return null
  return (
    <button type="button" onClick={() => openApproval(sim.approvals.pending[0].id)} className="flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full bg-warn-soft px-3 text-[12px] font-semibold text-warn hover:brightness-95">
      <ShieldCheck size={13} />
      {L(`승인 대기 ${n}`, `${n} to approve`)}
    </button>
  )
}

export function ApproveDialog() {
  useStore((s) => s.tick)
  const [, force] = useState(0)
  useEffect(() => {
    const f = () => force((n) => n + 1)
    subs.add(f)
    return () => void subs.delete(f)
  }, [])
  if (openId === null) return null
  const p: Proposal | undefined = sim.approvals.list.find((x) => x.id === openId)
  if (!p) return null
  const done = p.state !== 'pending'
  const next = () => {
    const more = sim.approvals.pending.filter((x) => x.id !== p.id)
    openApproval(more[0]?.id ?? null)
  }
  return (
    <div className="pointer-events-auto absolute inset-0 z-[60] grid place-items-center bg-ink/20 backdrop-blur-[1px]" role="dialog" aria-modal="true" aria-label={L('승인', 'Approval')}>
      <div className="panel rise w-[min(720px,calc(100vw-48px))] p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold text-brand">{KIND_LABEL[p.kind]} · {p.impact === 'high' ? L('승인 필요', 'Approval needed') : L('알림', 'Notice')}</div>
            <div className="mt-0.5 text-[15px] font-bold text-ink">{p.title}</div>
            <p className="mt-1 text-[12px] leading-snug text-ink-2">{p.why}</p>
          </div>
          <button type="button" aria-label={L('닫기', 'Close')} onClick={() => openApproval(null)} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-line-2"><X size={15} /></button>
        </div>
        <div className="mt-3 flex gap-2">
          <CardView {...p.cur} tone="cur" />
          <CardView {...p.next} tone="next" />
        </div>
        <div className="mt-3 rounded-xl bg-line-2 px-3 py-2 text-[11.5px] text-ink-2">
          <div className="mb-0.5 font-semibold text-ink">{L('예상 효과', 'Expected effect')}</div>
          {p.effect.map((e, i) => <div key={i}>· {e}</div>)}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="min-w-0 flex-1 text-[11px] text-muted">
            {done
              ? `${p.state === 'approved' ? L('승인됨', 'Approved') : p.state === 'rejected' ? L('거절됨', 'Rejected') : L('만료됨', 'Expired')}${p.by ? ` · ${p.by}` : ''}${p.outcome ? ` · ${p.outcome}` : ''}`
              : L(`승인자: ${CONTROLLER} · 감사 기록에 남습니다`, `Approver: ${CONTROLLER} · Recorded in the audit log`)}
          </span>
          {!done && (
            <>
              <button type="button" onClick={() => { sim.approvals.reject(p.id); next() }} className="h-8 rounded-lg border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-line-2">{L('거절', 'Reject')}</button>
              <button type="button" onClick={() => { const r = sim.approvals.approve(p.id); useStore.getState().notify(r?.state === 'approved' ? L(`승인: ${p.title} → ${r.outcome}`, `Approved: ${p.title} → ${r.outcome}`) : L('대상이 이미 지나가 제안이 만료됐습니다', 'The target has already passed, so the proposal expired')); next() }} className="h-8 rounded-lg bg-brand px-3 text-[12px] font-semibold text-white hover:bg-brand-2">{L('승인', 'Approve')}</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
