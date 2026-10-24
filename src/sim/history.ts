// 재생 막대(되감기, 항만 관제 영상 분석 2순위)의 기록. 관제 시계 60분 동안 0.25초(시뮬레이션)마다
// 차량·일반 차량·사람·지게차·항만 AGV·화물기·선석 배·KPI 숫자를 링버퍼에 남긴다(약 5MB).
// 재생할 때는 시뮬레이션을 멈추고 기록한 자세를 객체에 그대로 써 넣는다. 그래서 3D 렌더러와 패널은 고치지 않아도
// 그 시각 장면을 보여 준다. LIVE로 돌아오면 멈출 때 저장한 지금 상태(64비트)로 정확히 되돌리고 시뮬레이션을 이어 간다.
// 기록하지 않는 것(크레인 트롤리·컨베이어 상자·랙 장비·갑판 컨테이너)은 멈춘 시점 그대로 보인다.
import type { Sim, VPhase } from './sim'
import { SPEEDUP } from './clock'
import type { BerthPhase } from './port'
import { L } from '../i18n'

const PHASES: VPhase[] = [
  'offsite', 'highway', 'enroute', 'gate', 'inbound', 'docking', 'unloading', 'loading', 'closing', 'departing',
  'delivering', 'returning', 'waiting', 'craning', 'inspecting', 'restArea', 'resting', 'swap', 'yard',
]
const BERTH: BerthPhase[] = ['working', 'departing', 'away', 'arriving']
/** 칸 수: 차량(x z 방향 보임 단계 문 윙 실은양 총량 트레일러x z 방향 바퀴 속도 걷는기사) · 사람 · 지게차 · 일반 차 · AGV · 화물기 */
const VF = 15
const MF = 6
const FF = 5
const CF = 3
const AF = 3
const PF = 7
/** 기록 간격(시뮬레이션 초)과 창(관제 시계 초) */
export const REC_STEP = 0.25
export const REC_WINDOW = 60 * 60
const CAP = Math.ceil(REC_WINDOW / SPEEDUP / REC_STEP) + 2

type Arr = Float32Array | Float64Array
interface Frame {
  t: number
  v: Arr
  m: Arr
  f: Arr
  c: Arr
  a: Arr
  p: Arr
  /** 선석 배: 물러난 거리, 배 번호, 단계 */
  b: Arr
  s: Arr
}

export interface HistoryEvent {
  t: number
  kind: 'incident' | 'report' | 'vessel' | 'driver' | 'approval'
  label: string
  tone: 'red' | 'amber' | 'blue' | 'gray'
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k
function lerpAngle(a: number, b: number, k: number) {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return a + d * k
}

export class History {
  private frames: Frame[] = []
  private head = 0
  private acc = 0
  /** 재생 중인가(시뮬레이션은 멈춰 있다) */
  replaying = false
  /** 재생을 시작할 때의 지금 상태와 시계 */
  private live: Frame | null = null
  liveClock = 0
  private keys: string[] | null = null

  constructor(private sim: Sim) {}

  /** KPI 숫자 이름(Sim 필드 초기화 순서 때문에 처음 쓸 때 읽는다) */
  private get statKeys() {
    this.keys ??= Object.keys(this.sim.stats)
    return this.keys
  }

  private alloc(big: boolean): Frame {
    const S = this.sim
    const mk = (n: number) => (big ? new Float64Array(n) : new Float32Array(n))
    return {
      t: 0,
      v: mk(S.vehicles.length * VF), m: mk(S.life.movers.length * MF), f: mk(S.forklifts.length * FF),
      c: mk(S.traffic.cars.length * CF), a: mk(S.port.agvs.length * AF), p: mk(S.airport.aircraft.length * PF),
      b: mk(3), s: mk(this.statKeys.length),
    }
  }

  /** 지금 상태를 칸에 담는다(배열 길이가 바뀌었으면 새로 만든다) */
  private capture(F: Frame) {
    const S = this.sim
    F.t = S.clock
    S.vehicles.forEach((v, i) => {
      const o = i * VF
      const a = F.v
      a[o] = v.x; a[o + 1] = v.z; a[o + 2] = v.heading; a[o + 3] = v.visible ? 1 : 0
      a[o + 4] = PHASES.indexOf(v.phase); a[o + 5] = v.door; a[o + 6] = v.wing; a[o + 7] = v.cargoDone; a[o + 8] = v.cargoTotal
      a[o + 9] = v.trailer.x; a[o + 10] = v.trailer.z; a[o + 11] = v.trailer.heading; a[o + 12] = v.wheel; a[o + 13] = v.kmh
      a[o + 14] = v.walk.on ? 1 : 0
    })
    S.life.movers.forEach((m, i) => {
      const o = i * MF
      const a = F.m
      a[o] = m.x; a[o + 1] = m.z; a[o + 2] = m.heading; a[o + 3] = m.moving ? 1 : 0; a[o + 4] = m.y; a[o + 5] = m.walkPhase
    })
    S.forklifts.forEach((f, i) => {
      const o = i * FF
      const a = F.f
      a[o] = f.x; a[o + 1] = f.z; a[o + 2] = f.heading; a[o + 3] = f.fork; a[o + 4] = f.moving ? 1 : 0
    })
    S.traffic.cars.forEach((c, i) => {
      const o = i * CF
      F.c[o] = c.x; F.c[o + 1] = c.lane; F.c[o + 2] = c.zOff
    })
    S.port.agvs.forEach((g, i) => {
      const o = i * AF
      F.a[o] = g.x; F.a[o + 1] = g.z; F.a[o + 2] = g.heading
    })
    S.airport.aircraft.forEach((p, i) => {
      const o = i * PF
      const a = F.p
      a[o] = p.x; a[o + 1] = p.y; a[o + 2] = p.z; a[o + 3] = p.heading; a[o + 4] = p.pitch; a[o + 5] = p.gear; a[o + 6] = p.door
    })
    const B = S.port.berth
    F.b[0] = B.offset; F.b[1] = B.vessel; F.b[2] = BERTH.indexOf(B.phase)
    const st = S.stats as unknown as Record<string, number>
    this.statKeys.forEach((k, i) => { F.s[i] = st[k] })
  }

  /** 두 칸 사이(k: 0 → a, 1 → b)를 객체에 써 넣는다. b가 없으면 a 그대로 */
  private apply(A: Frame, Bf: Frame | null, k: number) {
    const S = this.sim
    const B = Bf ?? A
    const near = k < 0.5 ? A : B
    // 한 칸 사이에 멀리 뛴 것(지도 밖에서 다시 나타남·순환 도로 끝)은 보간하지 않는다
    const jump = (ax: number, az: number, bx: number, bz: number) => Math.abs(ax - bx) + Math.abs(az - bz) > 60
    S.vehicles.forEach((v, i) => {
      const o = i * VF
      if (o + VF > A.v.length || o + VF > B.v.length) return
      const a = A.v
      const b = B.v
      const snap = jump(a[o], a[o + 1], b[o], b[o + 1]) || a[o + 3] !== b[o + 3]
      const kk = snap ? (k < 0.5 ? 0 : 1) : k
      v.x = lerp(a[o], b[o], kk)
      v.z = lerp(a[o + 1], b[o + 1], kk)
      v.heading = lerpAngle(a[o + 2], b[o + 2], kk)
      v.visible = near.v[o + 3] > 0.5
      v.phase = PHASES[near.v[o + 4]] ?? v.phase
      v.door = lerp(a[o + 5], b[o + 5], kk)
      v.wing = lerp(a[o + 6], b[o + 6], kk)
      v.cargoDone = lerp(a[o + 7], b[o + 7], kk)
      v.cargoTotal = near.v[o + 8]
      const tsnap = snap || jump(a[o + 9], a[o + 10], b[o + 9], b[o + 10])
      const tk = tsnap ? (k < 0.5 ? 0 : 1) : k
      v.trailer.x = lerp(a[o + 9], b[o + 9], tk)
      v.trailer.z = lerp(a[o + 10], b[o + 10], tk)
      v.trailer.heading = lerpAngle(a[o + 11], b[o + 11], tk)
      v.wheel = lerp(a[o + 12], b[o + 12], kk)
      v.kmh = lerp(a[o + 13], b[o + 13], kk)
      // 걷는 기사는 문 앞 위치를 기록하지 않으므로 재생 중에는 숨기고, LIVE로 돌아올 때 되살린다
      v.walk.on = Bf === null ? a[o + 14] > 0.5 : false
    })
    S.life.movers.forEach((m, i) => {
      const o = i * MF
      if (o + MF > A.m.length || o + MF > B.m.length) return
      const a = A.m
      const b = B.m
      const kk = jump(a[o], a[o + 1], b[o], b[o + 1]) ? (k < 0.5 ? 0 : 1) : k
      m.x = lerp(a[o], b[o], kk)
      m.z = lerp(a[o + 1], b[o + 1], kk)
      m.heading = lerpAngle(a[o + 2], b[o + 2], kk)
      m.moving = near.m[o + 3] > 0.5
      m.y = lerp(a[o + 4], b[o + 4], kk)
      m.walkPhase = lerp(a[o + 5], b[o + 5], kk)
    })
    S.forklifts.forEach((f, i) => {
      const o = i * FF
      if (o + FF > A.f.length || o + FF > B.f.length) return
      const a = A.f
      const b = B.f
      f.x = lerp(a[o], b[o], k)
      f.z = lerp(a[o + 1], b[o + 1], k)
      f.heading = lerpAngle(a[o + 2], b[o + 2], k)
      f.fork = lerp(a[o + 3], b[o + 3], k)
      f.moving = near.f[o + 4] > 0.5
    })
    S.traffic.cars.forEach((c, i) => {
      const o = i * CF
      if (o + CF > A.c.length || o + CF > B.c.length) return
      const a = A.c
      const b = B.c
      // 차로가 바뀌었거나 순환 도로 끝을 넘었으면 가까운 칸 그대로
      if (a[o + 1] !== b[o + 1] || Math.abs(a[o] - b[o]) > 60) {
        c.x = near.c[o]; c.lane = near.c[o + 1]; c.zOff = near.c[o + 2]
      } else {
        c.x = lerp(a[o], b[o], k); c.lane = a[o + 1]; c.zOff = lerp(a[o + 2], b[o + 2], k)
      }
    })
    S.port.agvs.forEach((g, i) => {
      const o = i * AF
      if (o + AF > A.a.length || o + AF > B.a.length) return
      g.x = lerp(A.a[o], B.a[o], k)
      g.z = lerp(A.a[o + 1], B.a[o + 1], k)
      g.heading = lerpAngle(A.a[o + 2], B.a[o + 2], k)
    })
    S.airport.aircraft.forEach((p, i) => {
      const o = i * PF
      if (o + PF > A.p.length || o + PF > B.p.length) return
      const a = A.p
      const b = B.p
      const kk = jump(a[o], a[o + 2], b[o], b[o + 2]) ? (k < 0.5 ? 0 : 1) : k
      p.x = lerp(a[o], b[o], kk); p.y = lerp(a[o + 1], b[o + 1], kk); p.z = lerp(a[o + 2], b[o + 2], kk)
      p.heading = lerpAngle(a[o + 3], b[o + 3], kk); p.pitch = lerp(a[o + 4], b[o + 4], kk)
      p.gear = lerp(a[o + 5], b[o + 5], kk); p.door = lerp(a[o + 6], b[o + 6], kk)
    })
    const Bt = S.port.berth
    Bt.offset = lerp(A.b[0], B.b[0], k)
    Bt.vessel = near.b[1]
    Bt.phase = BERTH[near.b[2]] ?? Bt.phase
    const st = S.stats as unknown as Record<string, number>
    this.statKeys.forEach((key, i) => { st[key] = Math.round(lerp(A.s[i], B.s[i], k) * 10) / 10 })
    S.port.version++
  }

  /** 시뮬레이션 한 걸음마다(재생 중에는 시뮬레이션이 멈춰 불리지 않는다) */
  step(dt: number) {
    this.acc += dt
    if (this.acc < REC_STEP) return
    this.acc -= REC_STEP
    // 시계가 뒤로 갔으면(시작할 때 미리 돌린 뒤 시계를 맞춤) 기록을 비운다
    const n = this.frames.length
    if (n && this.sim.clock < this.at(n - 1).t) {
      this.frames = []
      this.head = 0
    }
    let F = this.frames.length < CAP ? null : this.frames[this.head]
    if (!F || F.v.length !== this.sim.vehicles.length * VF || F.m.length !== this.sim.life.movers.length * MF) F = this.alloc(false)
    this.capture(F)
    if (this.frames.length < CAP) this.frames.push(F)
    else {
      this.frames[this.head] = F
      this.head = (this.head + 1) % CAP
    }
  }

  /** i번째로 오래된 칸 */
  private at(i: number) {
    return this.frames[(this.head + i) % this.frames.length]
  }

  /** 되감을 수 있는 범위(관제 시계) */
  range() {
    const n = this.frames.length
    const t1 = this.replaying ? this.liveClock : this.sim.clock
    return { t0: n ? this.at(0).t : t1, t1 }
  }

  /** 재생 시작: 지금 상태를 저장(시뮬레이션은 부르는 쪽이 멈춘다) */
  start() {
    if (this.replaying || !this.frames.length) return false
    this.live = this.alloc(true)
    this.capture(this.live)
    this.liveClock = this.sim.clock
    this.replaying = true
    return true
  }

  /** 재생 시각으로 장면을 맞춘다 */
  seek(t: number) {
    if (!this.replaying || !this.live) return
    const n = this.frames.length
    const { t0, t1 } = this.range()
    const tt = Math.max(t0, Math.min(t1, t))
    // 이분 탐색: tt 이하인 마지막 칸
    let lo = 0
    let hi = n - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (this.at(mid).t <= tt) lo = mid
      else hi = mid - 1
    }
    const A = this.at(lo)
    const B = lo + 1 < n ? this.at(lo + 1) : this.live
    const span = B.t - A.t
    this.apply(A, B, span > 0 ? Math.max(0, Math.min(1, (tt - A.t) / span)) : 0)
    this.sim.clock = tt
  }

  /** LIVE로: 멈출 때의 상태로 정확히 되돌린다 */
  stop() {
    if (!this.replaying || !this.live) return
    this.apply(this.live, null, 0)
    // KPI는 반올림 없이 그대로
    const st = this.sim.stats as unknown as Record<string, number>
    this.statKeys.forEach((k, i) => { st[k] = this.live!.s[i] })
    this.sim.clock = this.liveClock
    this.live = null
    this.replaying = false
  }

  /** 막대에 찍을 사건(돌발·현장 보고·선사 통보·기사 메시지·승인) */
  events(t0: number, t1: number): HistoryEvent[] {
    const S = this.sim
    const out: HistoryEvent[] = []
    const add = (e: HistoryEvent) => { if (e.t >= t0 && e.t <= t1) out.push(e) }
    for (const i of S.incidents) add({ t: i.time, kind: 'incident', label: L(`돌발 · ${i.text}`, `Incident · ${i.text}`), tone: 'red' })
    for (const r of S.reports) add({ t: r.time, kind: 'report', label: L(`현장 보고 · ${r.text}`, `Field report · ${r.text}`), tone: 'amber' })
    for (const n of S.vessel.notices) add({ t: n.time, kind: 'vessel', label: L(`선사 통보 · ${n.text}`, `Shipping line notice · ${n.text}`), tone: 'blue' })
    for (const m of S.driver.messages) add({ t: m.time, kind: 'driver', label: L(`기사 ${m.vehicle} · ${m.text}`, `Driver ${m.vehicle} · ${m.text}`), tone: 'gray' })
    for (const a of S.approvals.audit) if (a.kind === 'approve' || a.kind === 'reject') add({ t: a.t, kind: 'approval', label: `${a.action} · ${a.text}`, tone: 'blue' })
    return out.sort((a, b) => a.t - b.t)
  }
}
