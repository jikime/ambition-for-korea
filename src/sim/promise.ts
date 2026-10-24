// 약속 시간대(경로 관리 영상 분석 1순위): 간선 운행이 출발할 때 도착 거점의 "도크 예약 창"을 정하고,
// 달리는 동안 남은 작업(경로·돌발 배율·휴게·정문)으로 도착 예정을 다시 계산해 정시·위험·지연과 원인을 낸다.
// 읽기 전용: 시뮬레이션 난수(r·rr)를 부르지 않고 차량 작업도 바꾸지 않는다(차량 흐름이 그대로).
import type { Sim, Vehicle } from './sim'
import { SPEEDUP } from './clock'
import { DRIVE_LIMIT, REST_MIN } from './rest'
import { LINK_LABEL, linkOfLeg } from './incidents'
import { L } from '../i18n'

/**
 * 도크 예약 창: 계획 도착 기준 앞 25% · 뒤 60%(운행 시간 비례, 최소 5분 · 최대 10분/15분, 관제 시계 초).
 * 지도가 압축돼 간선 운행이 10~30분이라 고정 창(±15분)이면 돌발로 3배 느려져도 창 안에 든다. npm run promise로 맞춤
 */
export const WIN_EARLY = 0.25
export const WIN_LATE = 0.6
const winOf = (dur: number, k: number, max: number) => Math.min(max, Math.max(300, dur * k))
/** 처음 계획 배율(노선별 실측이 쌓이기 전): 정문 대기·교차로 예약까지 넣어 자유 주행보다 길게 */
const RATIO0 = 1.6

export interface DeliveryPromise {
  /** 도착 거점 코드(GJ·IN·DJ·AP·IC·BS) */
  dest: string
  /** 노선 키(차종:출발>도착)와 자유 주행 시간(시뮬레이션 초): 도착 후 실측 배율을 배운다 */
  route: string
  freeT: number
  departed: number
  /** 계획 도착(관제 시계 초) */
  planned: number
  win: [number, number]
  arrived: number | null
}

export type PromiseState = 'ontime' | 'risk' | 'late' | 'done-ontime' | 'done-late'
export type Cause = 'incident' | 'rest' | 'dock' | 'traffic' | 'driver'
export const CAUSE_LABEL: Record<Cause, string> = {
  incident: L('돌발 구간', 'Incident section'), rest: L('의무 휴게', 'Mandatory rest'), dock: L('도크·야드 대기', 'Dock · yard wait'), traffic: L('혼잡·서행', 'Congestion · slow traffic'), driver: L('기사 메시지', 'Driver message'),
}

export interface PromiseStatus {
  state: PromiseState
  eta: number
  /** 계획 대비 분(+ 늦음) */
  delta: number
  causes: Cause[]
  /** 돌발 구간 설명(있으면) */
  incident?: string
}

type Task = Vehicle['tasks'][number]

const round5 = (t: number) => Math.round(t / 300) * 300

export class Promises {
  stats = { ontime: 0, late: 0, delaySum: 0 }
  /** 노선별 실제 ÷ 자유 주행 시간(지수 이동 평균): 실제 배차 시스템처럼 과거 운행 시간으로 계획한다 */
  ratio: Record<string, number> = {}
  constructor(private sim: Sim) {}

  /** 간선 출발 때 부른다(작업 큐는 출발 작업이 이미 빠진 상태) */
  plan(v: Vehicle, dest: string) {
    const arr = this.arrivalIndex(v, dest)
    if (arr < 0) {
      v.promise = null
      return
    }
    let t = 0
    let drive = 0
    let highway = false
    for (let i = 0; i <= arr; i++) {
      const k = v.tasks[i]
      const d = this.freeTime(k)
      t += d
      if (k.k === 'drive') {
        drive += d
        if (k.legs.some((l) => l.tag === 'highway')) highway = true
      }
    }
    const route = `${v.kind}:${v.site}>${dest}`
    const freeT = t
    t *= this.ratio[route] ?? RATIO0
    // 이번 운행으로 2시간을 넘기면 휴게 15분이 들어간다
    if (v.kind !== 'van' && highway && v.driveT + drive > DRIVE_LIMIT) t += REST_MIN
    const clock = this.sim.clock
    const planned = clock + t * SPEEDUP
    const dur = planned - clock
    v.promise = { dest, route, freeT, departed: clock, planned, win: [round5(planned - winOf(dur, WIN_EARLY, 600)), round5(planned + winOf(dur, WIN_LATE, 900))], arrived: null }
    const w0 = hm(v.promise.win[0])
    const w1 = hm(v.promise.win[1])
    this.sim.logV(v, 'depart', L(`출발 · ${dest} 도착 약속 ${w0}~${w1}`, `Departed · ${dest} arrival promise ${w0}–${w1}`))
  }

  /** 도착 정문 작업의 위치(없으면 −1) */
  private arrivalIndex(v: Vehicle, dest: string) {
    return v.tasks.findIndex((k) => k.k === 'gate' && k.gate === dest)
  }

  /** 막힘 없이 갈 때 걸리는 시간(시뮬레이션 초) */
  private freeTime(k: Task) {
    if (k.k === 'drive') return k.legs.reduce((s, l) => s + l.path.length / Math.max(1, l.speed), 0)
    if (k.k === 'gate' || k.k === 'wait' || k.k === 'hide') return k.t
    return 0
  }

  /** 남은 시간(시뮬레이션 초): 지금 경로는 남은 거리, 구간마다 돌발 배율을 나눈다 */
  private remaining(v: Vehicle, dest: string) {
    const arr = this.arrivalIndex(v, dest)
    if (arr < 0) return { t: 0, restT: 0, incident: undefined as string | undefined, rest: false, dock: false }
    let t = 0
    let incident: string | undefined
    let rest = false
    let dock = v.phase === 'waiting' || v.phase === 'yard'
    let drive = 0
    let restT = 0
    let highway = false
    for (let i = 0; i <= arr; i++) {
      const k = v.tasks[i]
      if (k.k === 'drive') {
        const legs = k.route && i === 0 ? k.route.legs.slice(k.route.i) : k.legs
        legs.forEach((l, j) => {
          let len = l.path.length
          if (k.route && i === 0 && j === 0) len = Math.max(0, l.path.length - k.route.d)
          const f = this.sim.legFactor(v, l)
          if (f < 0.999) {
            const link = linkOfLeg(l)
            const sp = L(`속도 ${Math.round(f * 100)}%`, `speed ${Math.round(f * 100)}%`)
            incident = link ? `${LINK_LABEL[link]} · ${sp}` : sp
          }
          const tt = len / Math.max(1, l.speed) / Math.max(0.05, f)
          t += tt
          drive += tt
          if (l.tag === 'highway') highway = true
          if (k.tags?.rest) rest = true
        })
      } else if (k.k === 'work') {
        if ((k.phase === 'resting' || k.phase === 'swap') && v.rest) {
          restT += Math.max(0, v.rest.dur - v.rest.t)
          rest = true
        }
        if (k.phase === 'yard' || k.phase === 'waiting') dock = true
      } else t += this.freeTime(k)
    }
    // 아직 휴게를 안 정했는데 이번 운행으로 2시간을 넘기면 15분
    if (!rest && v.kind !== 'van' && highway && !v.rest && v.driveT + drive > DRIVE_LIMIT) {
      restT += REST_MIN
      rest = true
    }
    return { t, restT, incident, rest, dock }
  }

  status(v: Vehicle): PromiseStatus | null {
    const p = v.promise
    if (!p) return null
    const clock = this.sim.clock
    if (p.arrived !== null) {
      const late = p.arrived > p.win[1]
      return { state: late ? 'done-late' : 'done-ontime', eta: p.arrived, delta: Math.round((p.arrived - p.planned) / 60), causes: [] }
    }
    const r = this.remaining(v, p.dest)
    // 계획과 같은 노선 배율을 남은 시간에도 쓴다(정문 대기·교차로 예약 포함). 휴게 시간은 배율 밖
    // 기사 메시지(⑮)로 늘어난 지연을 더한다
    const eta = clock + (r.t * (this.ratio[p.route] ?? RATIO0) + r.restT) * SPEEDUP + (this.sim.driver.extra.get(v.id) ?? 0)
    const delta = Math.round((eta - p.planned) / 60)
    const causes: Cause[] = []
    if (r.incident) causes.push('incident')
    if (r.rest) causes.push('rest')
    if (r.dock) causes.push('dock')
    if (this.sim.driver.extra.has(v.id)) causes.push('driver')
    const state: PromiseState = clock > p.win[1] ? 'late' : eta > p.win[1] ? 'risk' : 'ontime'
    if (state !== 'ontime' && !causes.length) causes.push('traffic')
    return { state, eta, delta, causes, incident: r.incident }
  }

  /** 매 스텝: 도착 정문을 지난 차를 도착으로 기록 */
  step() {
    for (const v of this.sim.vehicles) {
      const p = v.promise
      if (!p || p.arrived !== null) continue
      if (v.site === p.dest && this.arrivalIndex(v, p.dest) < 0) {
        p.arrived = this.sim.clock
        const late = p.arrived > p.win[1]
        const d = Math.round((p.arrived - p.planned) / 60)
        if (late) this.stats.late++
        else this.stats.ontime++
        this.stats.delaySum += Math.max(0, d)
        // 이 노선의 실측 배율을 배운다(휴게로 늘어난 운행은 빼고)
        if (!v.log.some((l) => l.kind === 'rest' && l.t >= p.departed) && p.freeT > 1) {
          const real = (p.arrived - p.departed) / SPEEDUP / p.freeT
          const prev = this.ratio[p.route] ?? RATIO0
          this.ratio[p.route] = prev * 0.75 + Math.min(4, Math.max(1, real)) * 0.25
        }
        const lateMin = Math.round((p.arrived - p.win[1]) / 60)
        const dd = `${d >= 0 ? '+' : ''}${d}`
        this.sim.logV(v, 'arrive', L(
          `${p.dest} 도착 · ${late ? `약속 지연 +${lateMin}분` : '약속 안'}(계획 대비 ${dd}분)`,
          `Arrived ${p.dest} · ${late ? `late vs promise +${lateMin} min` : 'within promise'} (${dd} min vs plan)`,
        ))
      }
    }
  }

  // ───────── 다온마을 배송차: 정차지별 고객 안내 시간대(출발 때 정함, 계획 −20분 ~ +40분, 10분 단위)

  private vanWins = new Map<string, Record<string, { planned: number; win: [number, number] }>>()

  /** 배송차가 인천에서 출발할 때 정차지마다 안내 시간대를 정한다 */
  planVan(v: Vehicle) {
    const out: Record<string, { planned: number; win: [number, number] }> = {}
    for (const st of v.stops) {
      const sec = this.vanSec(v, st.id, false)
      if (sec === null) continue
      // 자유 주행에 단지 안 서행·주차를 더해 1.25배
      const planned = this.sim.clock + sec * 1.25 * SPEEDUP
      out[st.id] = { planned, win: [Math.floor((planned - 1200) / 600) * 600, Math.ceil((planned + 2400) / 600) * 600] }
    }
    this.vanWins.set(v.id, out)
  }

  /** 정차지까지 남은 시간(시뮬레이션 초). factor: 돌발 속도 배율을 반영할지 */
  private vanSec(v: Vehicle, stopId: string, factor = true) {
    const idx = v.stops.findIndex((s) => s.id === stopId)
    if (idx < v.stopIdx) return null
    let need = idx - v.stopIdx
    let sec = 0
    for (const k of v.tasks) {
      if (k.k === 'drive') {
        const legs = k.route ? k.route.legs.slice(k.route.i) : k.legs
        legs.forEach((l, j) => {
          const len = k.route && j === 0 ? Math.max(0, l.path.length - k.route.d) : l.path.length
          sec += len / Math.max(1, l.speed) / (factor ? Math.max(0.05, this.sim.legFactor(v, l)) : 1)
        })
      } else if (k.k === 'work' && k.phase === 'delivering') {
        if (need === 0) break
        need--
        sec += 14
      } else if (k.k === 'wait') sec += k.t
    }
    return sec
  }

  vanWin(v: Vehicle, stopId: string) {
    return this.vanWins.get(v.id)?.[stopId]?.win ?? null
  }

  vanEta(v: Vehicle, stopId: string) {
    const sec = this.vanSec(v, stopId)
    return sec === null ? null : this.sim.clock + sec * 1.25 * SPEEDUP + (this.sim.driver.extra.get(v.id) ?? 0)
  }

  /** 남은 정차지 중 안내 시간대를 넘길 곳 */
  vanRisks(v: Vehicle) {
    const out: { stop: string; eta: number; win: [number, number] }[] = []
    const wins = this.vanWins.get(v.id)
    if (!wins) return out
    for (const st of v.stops.slice(v.stopIdx)) {
      const w = wins[st.id]
      const eta = this.vanEta(v, st.id)
      if (w && eta !== null && eta > w.win[1]) out.push({ stop: st.id, eta, win: w.win })
    }
    return out
  }

  /** 화면을 연 뒤 정시 도착률(%) */
  get onTimeRate() {
    const n = this.stats.ontime + this.stats.late
    return n ? (this.stats.ontime / n) * 100 : null
  }
}

function hm(t: number) {
  const s = ((t % 86400) + 86400) % 86400
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`
}
