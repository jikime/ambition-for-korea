// 제안 → 승인 → 기록(경로 관리 영상 분석 2순위). 실제로 운행을 바꾸는 조치는 관제사가 승인해야 실행되고,
// 승인·거절·만료는 모두 감사 기록에 남는다. 정책: 노선 변경·정차지 이관·고객 안내 발송·돌발 제한(확인 필요)은 승인,
// 지연 예외 기록·안내 초안 작성·신뢰도 높은 돌발 제한은 자동(지금 정책 그대로).
import type { Sim, Vehicle } from './sim'
import { SPEEDUP } from './clock'
import { L, plural } from '../i18n'

export type ProposalKind = 'zones' | 'move' | 'notify' | 'incident'
export const KIND_LABEL: Record<ProposalKind, string> = {
  zones: L('노선 변경', 'Route change'), move: L('정차지 이관', 'Stop transfer'), notify: L('지연 안내 발송', 'Delay notice'), incident: L('돌발 속도 제한', 'Incident speed limit'),
}

export interface Card {
  title: string
  lines: string[]
  /** 약속 안이면 true, 밖이면 false, 해당 없으면 undefined */
  inWin?: boolean
}

export interface Proposal {
  id: number
  kind: ProposalKind
  /** 대상(차량 ID · 구간 · 노선) */
  target: string
  title: string
  why: string
  cur: Card
  next: Card
  effect: string[]
  /** 고객·운행에 미치는 영향이 큰가(승인 필수) */
  impact: 'high' | 'low'
  state: 'pending' | 'approved' | 'rejected' | 'expired'
  created: number
  by?: string
  at?: number
  outcome?: string
  /** 승인되면 실행(결과 문장을 돌려준다) */
  apply: () => string
  /** 아직 유효한가(대상 차가 이미 그 정차지를 지났으면 만료) */
  valid?: () => boolean
}

/** 감사 기록 종류(구조): 화면 문구(action)는 언어마다 달라서 판정은 이것으로 한다 */
export type AuditKind = 'propose' | 'approve' | 'reject' | 'expire' | 'other'

export interface AuditEntry {
  t: number
  who: string
  action: string
  text: string
  kind: AuditKind
}

/** 승인자(가상 관제사) */
export const CONTROLLER = L('이수민 운영 매니저', 'Lee Su-min, Operations manager')

export class Approvals {
  list: Proposal[] = []
  audit: AuditEntry[] = []
  private seq = 1
  private acc = 0

  constructor(private sim: Sim) {}

  get pending() {
    return this.list.filter((p) => p.state === 'pending')
  }

  has(kind: ProposalKind, target: string) {
    return this.list.some((p) => p.kind === kind && p.target === target && p.state === 'pending')
  }

  propose(p: Omit<Proposal, 'id' | 'state' | 'created'>) {
    const full: Proposal = { ...p, id: this.seq++, state: 'pending', created: this.sim.clock }
    this.list.unshift(full)
    if (this.list.length > 30) this.list.pop()
    this.log(L('시스템', 'System'), L('제안', 'Proposed'), `${KIND_LABEL[p.kind]} · ${p.title}`, 'propose')
    return full
  }

  approve(id: number, by = CONTROLLER) {
    const p = this.list.find((x) => x.id === id)
    if (!p || p.state !== 'pending') return null
    if (p.valid && !p.valid()) {
      this.expire(p)
      return p
    }
    p.state = 'approved'
    p.by = by
    p.at = this.sim.clock
    p.outcome = p.apply()
    this.log(by, L('승인', 'Approved'), `${KIND_LABEL[p.kind]} · ${p.title} → ${p.outcome}`, 'approve')
    return p
  }

  reject(id: number, by = CONTROLLER) {
    const p = this.list.find((x) => x.id === id)
    if (!p || p.state !== 'pending') return null
    p.state = 'rejected'
    p.by = by
    p.at = this.sim.clock
    this.log(by, L('거절', 'Rejected'), `${KIND_LABEL[p.kind]} · ${p.title}`, 'reject')
    return p
  }

  private expire(p: Proposal) {
    p.state = 'expired'
    p.at = this.sim.clock
    this.log(L('시스템', 'System'), L('만료', 'Expired'), `${KIND_LABEL[p.kind]} · ${p.title}${L('(대상이 이미 지나감)', ' (target already passed)')}`, 'expire')
  }

  log(who: string, action: string, text: string, kind: AuditKind = 'other') {
    this.audit.unshift({ t: this.sim.clock, who, action, text, kind })
    if (this.audit.length > 40) this.audit.pop()
  }

  /** 1초마다: 만료 확인, 다온마을 배송차 지연 안내 · 정차지 이관 제안 */
  step(dt: number) {
    this.acc += dt
    if (this.acc < 1) return
    this.acc = 0
    for (const p of this.pending) if (p.valid && !p.valid()) this.expire(p)
    // 위험한 정차지가 많은 배송차부터. 관제사가 한꺼번에 떠안지 않게 안내는 3건, 이관은 1건까지만 대기시킨다
    const vans = this.sim.vehicles
      .filter((v) => v.kind === 'van' && v.home === 'IN' && v.site === 'TW')
      .map((v) => ({ v, risky: this.sim.promises.vanRisks(v) }))
      .filter((x) => x.risky.length)
      .sort((a, b) => b.risky.length - a.risky.length)
    for (const { v, risky } of vans) {
      if (this.pending.filter((p) => p.kind === 'notify').length >= 3) break
      // 한 운행에 한 번만(승인·거절 뒤 같은 운행에서 다시 묻지 않는다)
      if (!this.list.some((p) => p.kind === 'notify' && p.target === `${v.id}#${v.trip}`)) this.proposeNotify(v, risky.map((r) => r.stop))
    }
    if (!this.pending.some((p) => p.kind === 'move')) {
      const gate = this.sim.linkFactor.town_gate < 0.7
      const top = vans.find(({ v }) => (gate || this.sim.driverOut.has(v.id)) && v.stops.length - v.stopIdx >= 2 && !this.sim.movedStops.has(v.id))
      if (top) this.proposeMove(top.v, this.sim.driverOut.has(top.v.id) ? L('기사 운행 불가 메시지', "Driver's can't-continue message") : L('다온마을 정문 돌발(단지 안 서행)', 'Daon Village gate incident (slow inside complex)'))
    }
  }

  /** 지연 안내 알림톡 발송(초안은 자동 작성, 발송은 승인) */
  private proposeNotify(v: Vehicle, stopIds: string[]) {
    const stops = stopIds.map((id) => v.stops.find((s) => s.id === id)!).filter(Boolean)
    const etas = stopIds.map((id) => this.sim.promises.vanEta(v, id))
    const first = etas[0]
    const eta = first ? hm(first) : '-'
    const text = L(
      `[다온택배] 고객님 택배가 길이 막혀 예정보다 늦어지고 있습니다. 새 도착 예정 ${eta} 전후입니다. 불편을 드려 죄송합니다.`,
      `[Daon Parcel] Your parcel is running late due to traffic. New estimated arrival: around ${eta}. We apologize for the inconvenience.`,
    )
    this.propose({
      kind: 'notify', target: `${v.id}#${v.trip}`, impact: 'high',
      title: L(`${v.id} 지연 안내 ${stops.length}곳`, `${v.id} delay notice · ${stops.length} ${plural(stops.length, 'stop')}`),
      why: L(`${v.id}의 남은 정차지 ${stops.length}곳이 고객 안내 시간대를 넘길 것으로 보입니다.`, `${stops.length} remaining ${plural(stops.length, 'stop')} on ${v.id} look likely to miss the promised customer window.`),
      cur: {
        title: L('안내 없음', 'No notice'),
        lines: stops.map((s, i) => {
          const by = hm(this.sim.promises.vanWin(v, s.id)?.[1] ?? 0)
          const at = etas[i] ? hm(etas[i]!) : '-'
          return L(`${s.label} · 약속 ${by}까지 · 예정 ${at}`, `${s.label} · promised by ${by} · ETA ${at}`)
        }),
        inWin: false,
      },
      next: { title: L('알림톡 발송', 'Send text notice'), lines: [text] },
      effect: [
        L(`고객 ${stops.length}명에게 새 도착 예정 안내`, `New ETA sent to ${stops.length} ${plural(stops.length, 'customer')}`),
        L('고객 답장은 운영 센터 "고객 문의"에서 처리(⑧)', 'Customer replies are handled in Operations center "Customer inquiries" (⑧)'),
      ],
      apply: () => {
        this.sim.logV(v, 'notify', L(`지연 안내 알림톡 ${stops.length}곳 발송`, `Delay notice sent to ${stops.length} ${plural(stops.length, 'stop')}`))
        return L(`알림톡 ${stops.length}건 발송`, `${stops.length} ${plural(stops.length, 'notice')} sent`)
      },
      valid: () => v.site === 'TW' && stopIds.some((id) => v.stops.findIndex((s) => s.id === id) >= v.stopIdx),
    })
  }

  /**
   * 정차지 이관 계획: 다온마을 배송 중인 배송차의 뒤쪽 정차지 2곳을 곧 인천에서 떠날 배송차로 넘긴다(아무것도 바꾸지 않는다).
   * version은 대상 상태(남은 정차지 · 받는 차)를 묶은 값이라, 실행할 때 다시 계산해 같아야만 실행한다
   */
  planMove(v: Vehicle): MovePlan | null {
    if (v.kind !== 'van' || v.home !== 'IN' || v.site !== 'TW' || v.stops.length - v.stopIdx < 2 || this.sim.movedStops.has(v.id)) return null
    // 받는 차: 인천에서 곧 떠날 배송차 중 아직 이관을 받지 않은 차
    const cand = this.sim.vehicles
      .filter((o) => o !== v && o.kind === 'van' && o.home === 'IN' && o.site === 'IN' && !this.sim.extraStops[o.id])
      .sort((a, b) => (b.phase === 'loading' ? b.cargoDone / Math.max(1, b.cargoTotal) : -1) - (a.phase === 'loading' ? a.cargoDone / Math.max(1, a.cargoTotal) : -1))[0]
    if (!cand) return null
    const rest = v.stops.slice(v.stopIdx)
    const moved = rest.slice(-2)
    return {
      from: v, to: cand, rest, moved,
      saved: Math.round((moved.length * 14 * SPEEDUP) / 60),
      version: `${v.id}.${v.trip}.${v.stopIdx}.${moved.map((s) => s.id).join('+')}.${cand.id}`,
    }
  }

  /** 이관 계획 실행(승인된 제안의 apply). 결과 문장을 돌려준다 */
  private applyMove(plan: MovePlan) {
    const { from: v, to: cand, moved } = plan
    const set = this.sim.movedStops.get(v.id) ?? new Set<string>()
    for (const s of moved) set.add(s.id)
    this.sim.movedStops.set(v.id, set)
    this.sim.extraStops[cand.id] = [...new Set([...(this.sim.extraStops[cand.id] ?? []), ...moved.map((s) => s.id)])].slice(0, 6)
    const names = moved.map((s) => s.label.replace(L('다온마을 아파트 ', 'Daon Village Apt '), '')).join('·')
    this.sim.logV(v, 'move', L(`정차지 ${names} → ${cand.id} 이관`, `Stops ${names} → moved to ${cand.id}`))
    this.sim.logV(cand, 'move', L(`이관 받음: ${names}`, `Took over: ${names}`))
    return L(`${moved.length}곳 이관`, `${moved.length} ${plural(moved.length, 'stop')} moved`)
  }

  /** 이관 제안(대기 목록에 올린다). reason: 왜 필요한가 */
  proposePlan(plan: MovePlan, reason: string) {
    const { from: v, to: cand, rest, moved } = plan
    return this.propose({
      kind: 'move', target: v.id, impact: 'high',
      title: L(`${v.id} → ${cand.id} 정차지 ${moved.length}곳 이관`, `${v.id} → ${cand.id}: move ${moved.length} ${plural(moved.length, 'stop')}`),
      why: L(
        `${reason}으로 ${v.id}의 남은 정차지가 늦어집니다. 뒤쪽 ${moved.length}곳을 곧 출발할 ${cand.id}로 넘기면 나머지가 약속 안에 들 수 있습니다.`,
        `${reason}: ${v.id}'s remaining stops are running late. Handing the last ${moved.length} ${plural(moved.length, 'stop')} to ${cand.id}, which leaves soon, can keep the rest within the promise.`,
      ),
      cur: { title: L(`${v.id} 그대로`, `${v.id} as is`), lines: rest.map((s) => s.label), inWin: false },
      next: {
        title: L(`${v.id} ${rest.length - moved.length}곳 · ${cand.id} +${moved.length}곳`, `${v.id} ${rest.length - moved.length} ${plural(rest.length - moved.length, 'stop')} · ${cand.id} +${moved.length}`),
        lines: moved.map((s) => `${s.label} → ${cand.id}`),
        inWin: true,
      },
      effect: moveEffect(plan),
      apply: () => this.applyMove(plan),
      valid: () => v.site === 'TW' && moved.every((s) => v.stops.findIndex((x) => x.id === s.id) >= v.stopIdx) && cand.site === 'IN',
    })
  }

  /** 뒤쪽 정차지 2곳을 다음에 인천에서 떠날 배송차로 넘기자고 제안한다 */
  private proposeMove(v: Vehicle, reason: string) {
    const plan = this.planMove(v)
    if (plan) this.proposePlan(plan, reason)
  }
}

/** 이관 계획(planMove) */
export interface MovePlan {
  from: Vehicle
  to: Vehicle
  /** 남은 정차지(이관 전) */
  rest: Vehicle['stops']
  /** 넘길 정차지 */
  moved: Vehicle['stops']
  /** 넘기는 차가 줄이는 시간(분, 정차지당 배송 시간) */
  saved: number
  /** 대상 상태를 묶은 값(실행 직전에 다시 계산해 같아야 한다) */
  version: string
}

export function moveEffect(plan: MovePlan) {
  const { from: v, to: cand, moved, saved } = plan
  return [
    L(`${v.id} 약 ${saved}분 단축(정차지당 배송 시간)`, `${v.id} about ${saved} min sooner (delivery time per stop)`),
    L(`${cand.id} 정차지 ${moved.length}곳 늘어남(출발 때 경로에 붙임)`, `${cand.id} gets ${moved.length} more ${plural(moved.length, 'stop')} (added to its route at departure)`),
    L('주행 거리는 같음(일방통행 순환로)', 'Same driving distance (one-way loop)'),
  ]
}

function hm(t: number) {
  const s = ((t % 86400) + 86400) % 86400
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`
}
