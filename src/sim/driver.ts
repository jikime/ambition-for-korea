// ⑮ 기사 메시지(경로 관리 영상 분석 2순위): 운행 중인 기사가 관제에 짧은 메시지를 보낸다.
// AI가 사유·운행 불가·지연 정도·통화 요청을 판단하고(끄면 낱말 규칙), 코드가 조치한다:
//  - 지연 정도 → 도착 예정에 분을 더함(약속 위험이 바로 바뀜)
//  - 운행 불가 → 다온마을 배송차면 정차지 이관 제안(승인 필요), 간선이면 대체 차량 배차 확인
//  - 판단이 애매하면(신뢰도 낮음) 관제사 확인, 통화 요청이면 "기사에게 전화"
// 시뮬레이션 전역 난수는 쓰지 않는다(차량 흐름 그대로). 메시지는 화면 흐름과 별개인 상황 설명이다.
import type { Sim, Vehicle } from './sim'
import { L, LL } from '../i18n'

export type DriverReason = 'breakdown' | 'accident' | 'traffic' | 'health' | 'break' | 'customer' | 'other'
export const REASON_LABEL: Record<DriverReason, string> = {
  breakdown: L('차량 고장', 'Vehicle breakdown'), accident: L('사고', 'Accident'), traffic: L('정체·날씨', 'Traffic · weather'), health: L('기사 몸 상태', "Driver's health"),
  break: L('식사·휴식', 'Meal · break'), customer: L('고객·도크 대기', 'Customer · dock wait'), other: L('기타', 'Other'),
}
export const DELAY_LABEL = LL(['10분 미만', '10~30분', '30분~1시간', '1시간 이상'], ['< 10 min', '10–30 min', '30 min–1 h', '1 h+'])
const DELAY_MIN = [5, 20, 45, 90]

export interface DriverAnswer {
  reason: string
  reasonConfidence: number
  cannotContinue: number
  delay: number
  delayConfidence: number
  call: number
}

export interface DriverMessage {
  id: number
  time: number
  vehicle: string
  text: string
  answer: DriverAnswer | null
  by: 'ai' | 'rule' | null
  status: 'reading' | 'done'
  decision: string
}

/** 메시지 풀: for = 간선 트럭 / 1톤 배송차 / 둘 다 */
export const DRIVER_POOL: { text: string; for: 'trunk' | 'van' | 'any' }[] = LL([
  { text: '타이어 펑크 났어요. 갓길에서 교체하면 40분쯤 늦을 것 같습니다', for: 'trunk' },
  { text: '냉동기 경고등이 들어왔는데 일단 계속 갑니다. 10분 정도 늦어요', for: 'trunk' },
  { text: '앞차랑 접촉 사고 났습니다. 경찰 오는 중이라 운행 못 할 것 같아요', for: 'any' },
  { text: '영동고속도로 사고로 꽉 막혔어요. 30분 넘게 걸릴 듯합니다', for: 'trunk' },
  { text: '배가 너무 아파서 더는 운전 못 하겠어요. 교대 부탁드립니다', for: 'any' },
  { text: '점심 먹고 15분 뒤에 출발할게요', for: 'any' },
  { text: '고객님이 안 계셔서 10분 기다렸다가 다음 집 갑니다', for: 'van' },
  { text: '도크가 다 차서 대기 중이에요. 전화 한 통 부탁드려요', for: 'trunk' },
  { text: '정상 운행 중입니다. 예정대로 도착해요', for: 'any' },
  { text: '비가 많이 와서 서행 중이에요. 20분 정도 늦습니다', for: 'any' },
  { text: '시동이 안 걸려요. 견인차 불러야 할 것 같습니다. 연락 주세요', for: 'any' },
  { text: '단지 정문 공사 때문에 후문으로 돌아가요. 15분쯤 늦어요', for: 'van' },
  { text: '엘리베이터 점검이라 계단으로 나르는 중, 조금 늦어요', for: 'van' },
  { text: '허리를 삐끗해서 남은 집은 못 돌 것 같아요', for: 'van' },
], [
  { text: 'Flat tire. Changing it on the shoulder, so about 40 min late', for: 'trunk' },
  { text: "Reefer unit warning light is on, but I'm carrying on for now. About 10 min late", for: 'trunk' },
  { text: "Minor collision with the car ahead. Police are on the way, so I can't continue driving", for: 'any' },
  { text: 'Accident on the Yeongdong Expressway, fully jammed. Will take over 30 min', for: 'trunk' },
  { text: "Bad stomach ache, I can't drive any more. Please send a relief driver", for: 'any' },
  { text: 'Grabbing lunch, heading out again in 15 min', for: 'any' },
  { text: "Customer isn't home. Waiting 10 min, then on to the next house", for: 'van' },
  { text: "All docks are full, so I'm waiting in line. Please give me a call", for: 'trunk' },
  { text: 'Running normally. Arriving on schedule', for: 'any' },
  { text: 'Heavy rain, driving slowly. About 20 min late', for: 'any' },
  { text: "Engine won't start. I think I need a tow truck. Please contact me", for: 'any' },
  { text: 'Construction at the complex main gate, detouring via the back gate. About 15 min late', for: 'van' },
  { text: 'Elevator is under inspection, carrying boxes up the stairs. A bit late', for: 'van' },
  { text: "Threw my back out, I can't finish the remaining houses", for: 'van' },
])

/** 낱말 규칙(AI를 끈 상태) */
export function ruleDriver(text: string): DriverAnswer {
  const t = text.replace(/\s+/g, '')
  const e = text.toLowerCase()
  const has = (ko: RegExp, en: RegExp) => ko.test(t) || en.test(e)
  const reason: DriverReason = has(/펑크|경고등|시동|고장|배터리|냉동기/, /flat tire|warning light|won'?t start|broke down|breakdown|battery|reefer unit/) ? 'breakdown'
    : has(/사고|접촉/, /accident|collision|crash/) ? 'accident'
      : has(/막혀|정체|통제|서행|비가|눈이|공사|돌아가/, /jam|congest|closed|slow|\brain|\bsnow|construction|detour/) ? 'traffic'
        : has(/아파|다쳐|어지러|삐끗/, /ache\b|hurt|injur|dizz|threw my back|sprain/) ? 'health'
          : has(/점심|밥|휴게|화장실/, /lunch|meal|rest stop|restroom|toilet/) ? 'break'
            : has(/고객|도크|대기|기다|엘리베이터/, /customer|dock|waiting|elevator/) ? 'customer' : 'other'
  const cannot = has(/못하|못할|불가|견인|교대부탁|못돌/, /can'?t (continue|drive|finish)|cannot continue|unable to|\btow\b|relief driver/) ? 1 : 0
  const m = /(\d+)분/.exec(t) ?? /(\d+)\s*min/.exec(e)
  const min = m ? Number(m[1]) : has(/시간/, /\bhours?\b/) ? 90 : cannot ? 90 : has(/늦/, /\blate\b/) ? 15 : 0
  const delay = min < 10 ? 0 : min < 30 ? 1 : min < 60 ? 2 : 3
  const call = has(/전화|연락주|연락부탁/, /\bcall\b|contact me/) ? 1 : 0
  return { reason, reasonConfidence: 1, cannotContinue: cannot, delay, delayConfidence: 1, call }
}

export class DriverDesk {
  messages: DriverMessage[] = []
  onMessage: ((m: DriverMessage) => void) | null = null
  stats = { total: 0, ai: 0, cannot: 0, check: 0 }
  /** 도착 예정에 더할 시간(관제 시계 초): 차량 ID → 초 */
  extra = new Map<string, number>()
  private seq = 1
  private t = 40
  private rnd = 15151

  constructor(private sim: Sim) {}

  private rand() {
    this.rnd = (this.rnd * 1103515245 + 12345) % 2147483648
    return this.rnd / 2147483648
  }

  step(dt: number) {
    this.t -= dt
    if (this.t > 0) return
    this.t = 70 + this.rand() * 60
    const cands = this.sim.vehicles.filter((v) => v.visible && ((v.kind !== 'van' && v.promise && v.promise.arrived === null) || (v.kind === 'van' && v.home === 'IN' && v.site === 'TW')))
    if (!cands.length) return
    const v = cands[Math.floor(this.rand() * cands.length)]
    const pool = DRIVER_POOL.filter((p) => p.for === 'any' || p.for === (v.kind === 'van' ? 'van' : 'trunk'))
    this.add(v, pool[Math.floor(this.rand() * pool.length)].text)
  }

  add(v: Vehicle, text: string) {
    const m: DriverMessage = { id: this.seq++, time: this.sim.clock, vehicle: v.id, text, answer: null, by: null, status: 'reading', decision: L('판독 중', 'Reading') }
    this.messages.unshift(m)
    if (this.messages.length > 20) this.messages.pop()
    this.stats.total++
    this.sim.logV(v, 'driver', L(`기사 메시지: "${text}"`, `Driver message: "${text}"`))
    if (this.onMessage) this.onMessage(m)
    else this.resolve(m, null)
    return m
  }

  /** 판독 결과 적용(정책은 코드) */
  resolve(m: DriverMessage, a: DriverAnswer | null) {
    if (m.status === 'done') return
    const ans = a ?? ruleDriver(m.text)
    m.answer = ans
    m.by = a ? 'ai' : 'rule'
    m.status = 'done'
    if (a) this.stats.ai++
    const v = this.sim.vehicle(m.vehicle)
    if (!v) return
    const parts: string[] = []
    const unsure = ans.reasonConfidence < 0.55 || ans.delayConfidence < 0.45
    const d = Math.max(0, Math.min(3, Math.round(ans.delay)))
    if (d > 0) {
      this.extra.set(v.id, (this.extra.get(v.id) ?? 0) + DELAY_MIN[d] * 60)
      parts.push(L(`도착 예정 +${DELAY_MIN[d]}분`, `ETA +${DELAY_MIN[d]} min`))
    }
    if (ans.cannotContinue > 0.6) {
      this.stats.cannot++
      if (v.kind === 'van') {
        this.sim.driverOut.add(v.id)
        parts.push(L('운행 불가 → 남은 정차지 이관 제안', "Can't continue → propose moving remaining stops"))
      } else parts.push(L('운행 불가 → 대체 차량 배차 확인', "Can't continue → confirm a replacement vehicle"))
    }
    if (ans.call > 0.6) parts.push(L('기사에게 전화', 'Call the driver'))
    if (unsure) {
      this.stats.check++
      parts.unshift(L('판단 애매 → 관제사 확인', 'Unclear → controller check'))
    }
    m.decision = parts.length ? parts.join(' · ') : L('조치 없음(정상 운행)', 'No action (running normally)')
    this.sim.logV(v, 'driver', `→ ${REASON_LABEL[ans.reason as DriverReason] ?? ans.reason} · ${m.decision}`)
  }

  /** 도착하면(또는 새 운행) 더했던 지연을 지운다 */
  clear(id: string) {
    this.extra.delete(id)
    this.sim.driverOut.delete(id)
  }
}
