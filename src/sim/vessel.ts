// ⑯ 선사 지연 통보(항만 관제 영상 분석 2순위): 다음에 들어올 배의 선사가 입항 지연을 알려 온다.
// AI가 지연 정도·원인·확정 여부·기항 취소를 판단하고(끄면 낱말 규칙), 코드가 선석 일정을 조정한다:
//  - 확정 지연 → 다음 배가 그만큼 늦게 입항(선석 비우는 시간이 늘어남, 최대 1.5시간)
//  - 미확정 → 일정은 그대로 두고 주의 표시
//  - 기항 취소 → 그 배를 건너뛰고 그다음 배가 들어옴
// 시뮬레이션 전역 난수는 쓰지 않는다.
import type { Sim } from './sim'
import { SPEEDUP } from './clock'
import { VESSELS } from './port'
import { L, LL } from '../i18n'

export type VesselCause = 'weather' | 'mechanical' | 'congestion' | 'schedule' | 'other'
export const VCAUSE_LABEL: Record<VesselCause, string> = {
  weather: L('기상', 'Weather'), mechanical: L('선박 점검·수리', 'Ship inspection · repair'), congestion: L('항만 혼잡', 'Port congestion'), schedule: L('일정 변경', 'Schedule change'), other: L('기타', 'Other'),
}
/** 지연 단계별 시간(관제 시계 시간) */
const DELAY_H = [0, 2, 4.5, 8]
/** 선석 일정에 반영하는 최대 지연(시간): 화면을 보는 동안 선석이 너무 오래 비지 않게 */
const MAX_H = 1.5

export interface VesselAnswer {
  delay: number
  delayConfidence: number
  cause: string
  confirmed: number
  skip: number
}

export interface VesselNotice {
  id: number
  time: number
  vessel: number
  text: string
  answer: VesselAnswer | null
  by: 'ai' | 'rule' | null
  status: 'reading' | 'done'
  decision: string
}

/** 통보 문장 풀({ship} 자리에 선명이 들어간다) */
export const VESSEL_POOL: string[] = LL([
  '{ship} 태풍 영향으로 상하이 출항 지연, 부산 입항 약 5시간 늦어질 예정(확정)',
  '{ship} 기관 점검으로 입항 2시간 지연 확정',
  '{ship} 전 기항지 혼잡으로 입항이 3~4시간 늦어질 수 있음, 확정되면 다시 안내',
  '{ship} 예정대로 입항합니다',
  '{ship} 일정 조정으로 이번 항차 부산 기항 생략',
  '{ship} 짙은 안개로 도선 대기, 약 1시간 지연 예상',
], [
  '{ship}: Shanghai departure delayed by a typhoon, Busan arrival about 5 hours late (confirmed)',
  '{ship}: arrival delayed 2 hours for engine inspection, confirmed',
  '{ship}: congestion at the previous port may delay arrival 3~4 hours, will update once confirmed',
  '{ship}: arriving as scheduled',
  '{ship}: Busan call skipped this voyage due to a schedule change',
  '{ship}: waiting for a pilot in dense fog, about 1 hour delay expected',
])

export function ruleVessel(text: string): VesselAnswer {
  const t = text.replace(/\s+/g, '')
  const e = text.toLowerCase()
  const has = (ko: RegExp, en: RegExp) => ko.test(t) || en.test(e)
  const m = /(\d+)(?:~\d+)?시간/.exec(t) ?? /(\d+)(?:\s*[~–-]\s*\d+)?\s*hours?\b/.exec(e)
  const h = m ? Number(m[1]) : has(/예정대로|정상/, /as scheduled|on schedule|\bnormal/) ? 0 : 1
  const delay = h < 1 ? 0 : h < 3 ? 1 : h < 6 ? 2 : 3
  const cause: VesselCause = has(/태풍|풍|안개|파도|기상/, /typhoon|storm|wind|fog|wave|swell|weather/) ? 'weather'
    : has(/기관|점검|수리|선원/, /engine|inspection|repair|crew/) ? 'mechanical'
      : has(/혼잡|대기|체선/, /congest|waiting|queue/) ? 'congestion'
        : has(/일정|조정|생략/, /schedule change|reschedul|adjust|skip|omit/) ? 'schedule' : 'other'
  const confirmed = (/확정/.test(t) && !/확정되면/.test(t)) || (/confirmed/.test(e) && !/(once|if|when) confirmed/.test(e)) ? 1 : 0
  const skip = has(/생략|취소|기항하지/, /skip|cancel|omit|not call/) ? 1 : 0
  return { delay, delayConfidence: 1, cause, confirmed, skip }
}

export class VesselDesk {
  notices: VesselNotice[] = []
  onNotice: ((n: VesselNotice) => void) | null = null
  stats = { total: 0, ai: 0, confirmed: 0, skipped: 0 }
  private seq = 1
  private t = 90
  private rnd = 777

  constructor(private sim: Sim) {}

  private rand() {
    this.rnd = (this.rnd * 1103515245 + 12345) % 2147483648
    return this.rnd / 2147483648
  }

  step(dt: number) {
    this.t -= dt
    if (this.t > 0) return
    this.t = 600 + this.rand() * 300
    const next = (this.sim.port.berth.vessel + 1) % VESSELS.length
    const text = VESSEL_POOL[Math.floor(this.rand() * VESSEL_POOL.length)].replace('{ship}', VESSELS[next].name)
    this.add(next, text)
  }

  add(vessel: number, text: string) {
    const n: VesselNotice = { id: this.seq++, time: this.sim.clock, vessel, text, answer: null, by: null, status: 'reading', decision: L('판독 중', 'Reading') }
    this.notices.unshift(n)
    if (this.notices.length > 12) this.notices.pop()
    this.stats.total++
    if (this.onNotice) this.onNotice(n)
    else this.resolve(n, null)
    return n
  }

  resolve(n: VesselNotice, a: VesselAnswer | null) {
    if (n.status === 'done') return
    const ans = a ?? ruleVessel(n.text)
    n.answer = ans
    n.by = a ? 'ai' : 'rule'
    n.status = 'done'
    if (a) this.stats.ai++
    const B = this.sim.port.berth
    // 이미 지나간 배(선석에 들어왔거나 들어오는 중)에 대한 통보는 기록만
    const upcoming = n.vessel === (B.vessel + 1) % VESSELS.length || (n.vessel === B.vessel && (B.phase === 'away' || B.phase === 'departing'))
    if (!upcoming) {
      n.decision = L('이미 입항한 배 → 기록만', 'Ship already in → log only')
      return
    }
    if (ans.skip > 0.6) {
      B.skip = true
      this.stats.skipped++
      const nx = VESSELS[(n.vessel + 1) % VESSELS.length].name
      n.decision = L(`기항 취소 → 다음 배 ${nx}를 먼저 받음`, `Call canceled → take next ship ${nx} first`)
      return
    }
    const d = Math.max(0, Math.min(3, Math.round(ans.delay)))
    const hours = DELAY_H[d]
    if (!hours) {
      n.decision = L('정시 입항 → 일정 그대로', 'On-time arrival → schedule unchanged')
      return
    }
    if (ans.confirmed > 0.6) {
      const h = Math.min(MAX_H, hours)
      B.extraAway = Math.max(B.extraAway, (h * 3600) / SPEEDUP)
      this.stats.confirmed++
      n.decision = L(`확정 지연 ${hours}시간 → 선석 일정 ${h}시간 늦춤`, `Confirmed delay ${hours} h → berth schedule pushed back ${h} h`)
    } else n.decision = L(`미확정 지연(약 ${hours}시간) → 일정 그대로 · 주의`, `Unconfirmed delay (~${hours} h) → schedule unchanged · watch`)
  }
}
