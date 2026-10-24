// 새벽배송 · 콜드체인 온도 관제.
//  - 냉동탑차마다 적재함 온도를 계산한다: 냉동기가 설정 온도로 끌어내리고, 문을 열면(상하차) 바깥 공기로 오르고,
//    냉동기가 고장 나면 서서히 바깥 온도 쪽으로 오른다.
//  - 기사·센서 메시지가 들어오면 AI가 읽는다(냉동기 고장인지, 문 문제인지, 이미 회복 중인지, 변질 위험).
//    조치(재냉각·검수 지시, 도어 점검, 모니터링)는 온도 기준과 함께 코드가 정한다. AI를 끄면 온도만 보고 정한다.
//  - 새벽배송: 23시까지 받은 주문을 다음 날 7시까지 문 앞에. 냉동탑차는 이천 콜드체인 → 서울 새벽배송 거점(지도 밖)을 오간다.
import type { Sim, Vehicle } from './sim'
import { SPEEDUP } from './clock'
import { mulberry32 } from './data'
import { L, LL } from '../i18n'

const R = mulberry32(3030)
const pick = <T,>(a: readonly T[]) => a[Math.floor(R() * a.length)]

export type ColdMode = 'frozen' | 'chilled'
export const COLD_SPEC: Record<ColdMode, { label: string; set: number; warn: number; critical: number }> = {
  frozen: { label: L('냉동', 'Frozen'), set: -18, warn: -15, critical: -12 },
  chilled: { label: L('냉장', 'Chilled'), set: 2, warn: 6, critical: 8 },
}

/** AI 응답(서버 /api/ai/cold) */
export interface ColdAnswer {
  coolingFailure: number
  doorIssue: number
  recovering: number
  risk: number
  riskConfidence: number
}

export type ColdAction = 'recool' | 'door' | 'watch' | 'none'
export const ACTION_LABEL: Record<ColdAction, string> = {
  recool: L('도착 즉시 재냉각 · 상품 검수', 'Re-chill on arrival · inspect goods'),
  door: L('정차 후 도어 점검', 'Stop and check the doors'),
  watch: L('모니터링 강화(5분 간격)', 'Closer monitoring (every 5 min)'),
  none: L('조치 없음', 'No action'),
}

export interface ColdMessage {
  id: number
  time: number
  vehicle: string
  text: string
  /** 메시지 당시 온도 */
  temp: number
  /** 기사가 보낸 메시지 / 온도 센서 경보 */
  source: 'driver' | 'sensor'
  status: 'pending' | 'ready' | 'error'
  ai: ColdAnswer | null
  by: 'ai' | 'rule'
  action: ColdAction
  note: string
}

export interface ReeferTemp {
  id: string
  mode: ColdMode
  temp: number
  /** 냉동기 고장 · 문이 덜 닫힘 */
  fault: 'none' | 'compressor' | 'door'
  /** 조치가 정해졌으면(도착하면 고친다) */
  action: ColdAction
  /** 기준 위에 머문 시간(시뮬레이션 초) */
  above: number
  history: number[]
  alarm: 'ok' | 'warn' | 'critical'
}

export interface DawnTrip {
  vehicle: string
  depart: number
  arrive: number | null
  orders: number
  maxTemp: number
  mode: ColdMode
  excursion: boolean
}

/** 고장·이상이 날 때 기사가 보내는 메시지(뜻) */
const FAULT_MSG: Record<'compressor' | 'door', string[]> = LL({
  compressor: [
    '냉동기 쪽에서 덜컹거리는 소리가 나더니 표시창 온도가 계속 올라가요',
    '냉동기 팬이 안 도는 것 같아요. 찬바람이 안 나와요',
    '컴프레서 경고등이 들어오고 온도가 안 내려갑니다',
  ],
  door: [
    '뒷문 고무 패킹이 찢어져서 문이 꽉 안 닫히는 것 같아요',
    '상차 끝나고 보니 옆문 잠금이 반쯤 걸려 있었어요. 틈으로 바람이 들어와요',
  ],
}, {
  compressor: [
    'Heard a clunking noise from the reefer unit, and now the temp on the display keeps climbing',
    "I don't think the reefer fan is spinning. No cold air is coming out",
    "Compressor warning light came on and the temperature won't come down",
  ],
  door: [
    "The rubber seal on the rear door is torn, so I don't think the door shuts tight",
    'After loading I found the side door latch only half caught. Air is getting in through the gap',
  ],
})
/** 이상이 아닌데 들어오는 메시지(헷갈리게) */
const NOISE_MSG = LL([
  '휴게소에서 쉬는 동안 온도가 조금 올랐는데 지금은 다시 내려가는 중이에요',
  '오늘 새벽 물량이 많아서 상차 때 문을 자주 열었어요. 지금은 정상입니다',
  '온도 표시가 잠깐 깜빡였는데 냉동기는 정상으로 돌아가는 소리가 나요',
], [
  "The temp rose a bit while I was on a break at the rest area, but it's coming back down now",
  'Heavy dawn-delivery volume today, so I opened the doors a lot during loading. Everything is normal now',
  'The temp display flickered for a second, but the reefer unit sounds like it is running normally',
])

export class ColdChain {
  reefers = new Map<string, ReeferTemp>()
  messages: ColdMessage[] = []
  trips: DawnTrip[] = []
  /** 바깥 기온(화면의 계절·날씨에 맞춰 바뀐다) */
  ambient = 22
  /** early: 한계를 넘기 전에(메시지로) 재냉각을 정함 · late: 센서 경보가 울린 뒤에야 정함 */
  stats = { messages: 0, faults: 0, recool: 0, early: 0, late: 0, excursions: 0, dawnOrders: 0, dawnTrips: 0 }
  onMessage: ((m: ColdMessage) => void) | null = null
  private seq = 0
  private sample = 0
  private noise = 70
  private pendingMsg: { v: string; at: number; text: string }[] = []

  constructor(private sim: Sim) {}

  private state(v: Vehicle): ReeferTemp {
    let s = this.reefers.get(v.id)
    if (!s) {
      const mode: ColdMode = this.reefers.size % 2 === 0 ? 'frozen' : 'chilled'
      const set = COLD_SPEC[mode].set
      s = { id: v.id, mode, temp: set + 0.4, fault: 'none', action: 'none', above: 0, history: [], alarm: 'ok' }
      this.reefers.set(v.id, s)
    }
    return s
  }

  /** 고장을 일으킨다(무작위 또는 화면의 "고장 가정" 버튼) */
  fail(id: string, kind: 'compressor' | 'door' = R() < 0.65 ? 'compressor' : 'door') {
    const v = this.sim.vehicle(id)
    if (!v) return
    const s = this.state(v)
    if (s.fault !== 'none') return
    s.fault = kind
    s.action = 'none'
    this.stats.faults++
    // 몇 분 뒤 기사가 이상을 알아채고 메시지를 보낸다
    this.pendingMsg.push({ v: id, at: this.sim.elapsed + 8 + R() * 10, text: pick(FAULT_MSG[kind]) })
  }

  /** 기사·센서 메시지 */
  report(id: string, text: string) {
    const v = this.sim.vehicle(id)
    if (!v) return null
    const s = this.state(v)
    const m: ColdMessage = { id: ++this.seq, time: this.sim.clock, vehicle: id, text: text.slice(0, 200), temp: s.temp, source: 'driver', status: 'pending', ai: null, by: 'rule', action: 'none', note: '' }
    this.messages.unshift(m)
    if (this.messages.length > 30) this.messages.pop()
    this.stats.messages++
    if (this.onMessage) this.onMessage(m)
    else this.resolve(m, null)
    return m
  }

  /** 조치 결정(정책은 코드): 온도 기준 + (AI가 있으면) 메시지 뜻 */
  resolve(m: ColdMessage, a: ColdAnswer | null) {
    m.ai = a
    m.by = a ? 'ai' : 'rule'
    m.status = 'ready'
    const v = this.sim.vehicle(m.vehicle)
    const s = v ? this.state(v) : null
    if (!s) return
    const spec = COLD_SPEC[s.mode]
    const t = s.temp
    let act: ColdAction
    let note: string
    if (t > spec.critical) {
      act = 'recool'
      note = L(`${t.toFixed(1)}°C로 한계(${spec.critical}°C) 초과`, `${t.toFixed(1)}°C, over the limit (${spec.critical}°C)`)
    } else if (a && a.recovering > 0.6 && a.coolingFailure < 0.4 && a.doorIssue < 0.4) {
      act = t > spec.warn ? 'watch' : 'none'
      note = L('이미 회복 중이라는 메시지', 'Message says it is already recovering')
    } else if (a && a.coolingFailure > 0.6) {
      act = 'recool'
      note = L(`냉동기 고장으로 판단(${a.coolingFailure.toFixed(2)}) · 온도 오르기 전에 조치`, `Read as a reefer unit failure (${a.coolingFailure.toFixed(2)}) · act before the temp rises`)
    } else if (a && a.doorIssue > 0.6) {
      act = 'door'
      note = L(`문 닫힘 문제(${a.doorIssue.toFixed(2)})`, `Door not closing properly (${a.doorIssue.toFixed(2)})`)
    } else if (t > spec.warn) {
      act = 'watch'
      note = L(`${t.toFixed(1)}°C로 경고 기준(${spec.warn}°C) 초과`, `${t.toFixed(1)}°C, over the warning level (${spec.warn}°C)`)
    } else {
      act = 'none'
      note = a ? L('이상 신호 없음', 'No sign of trouble') : L('규칙: 메시지는 읽지 않고 온도만 봄 · 정상 범위', 'Rule: checks temperature only, not the message · normal range')
    }
    m.action = act
    m.note = note
    // 더 센 조치를 덮어쓰지 않는다
    const rank: ColdAction[] = ['none', 'watch', 'door', 'recool']
    if (rank.indexOf(act) > rank.indexOf(s.action)) {
      if (act === 'recool') {
        this.stats.recool++
        if (t <= spec.critical) this.stats.early++
      }
      s.action = act
    }
  }

  /** 온도 센서 경보(메시지와 상관없이 코드가 바로 정한다): 한계를 넘으면 재냉각 */
  private sensorAlarm(v: Vehicle, s: ReeferTemp) {
    const spec = COLD_SPEC[s.mode]
    const m: ColdMessage = {
      id: ++this.seq, time: this.sim.clock, vehicle: v.id, text: L(`온도 센서 경보: ${s.temp.toFixed(1)}°C (한계 ${spec.critical}°C 초과)`, `Temp sensor alarm: ${s.temp.toFixed(1)}°C (over the ${spec.critical}°C limit)`), temp: s.temp, source: 'sensor',
      status: 'ready', ai: null, by: 'rule', action: 'recool', note: L('센서 경보 → 코드가 바로 재냉각 지시(메시지를 기다리지 않음)', 'Sensor alarm → code orders a re-chill at once (without waiting for a message)'),
    }
    this.messages.unshift(m)
    if (this.messages.length > 30) this.messages.pop()
    s.action = 'recool'
    this.stats.recool++
    this.stats.late++
  }

  /** 서울 거점 도착(지도 밖) */
  onArrive(v: Vehicle) {
    const trip = [...this.trips].reverse().find((t) => t.vehicle === v.id && t.arrive === null)
    if (trip) trip.arrive = this.sim.clock
    this.fix(v)
  }

  /** 이천 콜드체인 도크 도착 */
  onDock(v: Vehicle) {
    this.fix(v)
  }

  /** 출발: 새벽배송 운행 기록 */
  onDepart(v: Vehicle) {
    const s = this.state(v)
    const orders = Math.round(v.cargoTotal * (26 + R() * 10))
    this.trips.push({ vehicle: v.id, depart: this.sim.clock, arrive: null, orders, maxTemp: s.temp, mode: s.mode, excursion: false })
    if (this.trips.length > 16) this.trips.shift()
    this.stats.dawnOrders += orders
    this.stats.dawnTrips++
  }

  /** 거점에 닿으면 정비·재냉각: 고장을 고치고 예냉 */
  private fix(v: Vehicle) {
    const s = this.state(v)
    if (s.fault !== 'none' || s.action !== 'none') {
      s.fault = 'none'
      s.action = 'none'
      s.temp = Math.min(s.temp, COLD_SPEC[s.mode].warn - 0.5)
    }
  }

  step(dt: number) {
    for (const v of this.sim.vehicles) {
      if (v.kind !== 'reefer') continue
      const s = this.state(v)
      const spec = COLD_SPEC[s.mode]
      const amb = this.ambient
      if (!v.visible) {
        // 지도 밖 거점에서는 전원에 꽂아 설정 온도를 유지한다
        s.temp += (spec.set - s.temp) * Math.min(1, 0.08 * dt)
      } else {
        // 냉동기: 설정 온도로(고장이면 꺼짐), 바깥 공기: 늘 조금씩, 문 열림: 크게
        if (s.fault !== 'compressor') s.temp += (spec.set - s.temp) * 0.045 * dt
        s.temp += (amb - s.temp) * (s.fault === 'compressor' ? 0.0028 : 0.0007) * dt
        if (s.fault === 'door') s.temp += (amb - s.temp) * 0.0016 * dt
        // 문을 여는 곳은 이천 콜드체인 도크(예냉된 도크 실·도크 실링): 설정 온도보다 조금 따뜻한 공기
        if (v.door > 0.05) s.temp += (spec.set + 5 - s.temp) * 0.01 * v.door * dt
        // 달리는 중 드물게 고장(냉동기 6분에 한 번쯤 · 시뮬레이션 기준)
        if (v.route && v.kmh > 10 && s.fault === 'none' && R() < dt / 520) this.fail(v.id)
      }
      s.alarm = s.temp > spec.critical ? 'critical' : s.temp > spec.warn ? 'warn' : 'ok'
      if (s.alarm === 'critical' && v.visible && s.action !== 'recool') this.sensorAlarm(v, s)
      s.above = s.temp > spec.warn ? s.above + dt : 0
      const trip = [...this.trips].reverse().find((t) => t.vehicle === v.id && t.arrive === null)
      if (trip) {
        trip.maxTemp = Math.max(trip.maxTemp, s.temp)
        if (!trip.excursion && s.temp > spec.critical) {
          trip.excursion = true
          this.stats.excursions++
        }
      }
    }
    this.sample -= dt
    if (this.sample <= 0) {
      this.sample = 2.5
      for (const s of this.reefers.values()) {
        s.history.push(s.temp)
        if (s.history.length > 96) s.history.shift()
      }
    }
    // 기사 메시지(고장 뒤 몇 분, 또는 이상이 아닌 메시지)
    for (let i = this.pendingMsg.length - 1; i >= 0; i--) {
      const p = this.pendingMsg[i]
      if (this.sim.elapsed >= p.at) {
        this.pendingMsg.splice(i, 1)
        this.report(p.v, p.text)
      }
    }
    this.noise -= dt
    if (this.noise <= 0) {
      this.noise = 90 + R() * 80
      const live = this.sim.vehicles.filter((v) => v.kind === 'reefer' && v.visible)
      if (live.length) this.report(pick(live).id, pick(NOISE_MSG))
    }
  }

  /** 새벽배송 물결: 23시 마감 → 7시 도착 약속 */
  dawn() {
    const day = ((this.sim.clock % 86400) + 86400) % 86400
    const cutoff = 23 * 3600
    const promise = 7 * 3600
    const ordering = day >= promise && day < cutoff
    const toCutoff = ordering ? cutoff - day : 0
    const toPromise = ordering ? 0 : day >= cutoff ? 86400 - day + promise : promise - day
    const recent = this.trips.slice(-10)
    const ok = recent.filter((t) => !t.excursion).length
    return { ordering, toCutoff, toPromise, recent, okRate: recent.length ? ok / recent.length : 1 }
  }
}

export const minutes = (simSec: number) => Math.round((simSec * SPEEDUP) / 60)
