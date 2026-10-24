// 정문 출입 기록(항만 관제 영상 분석 3순위): 거점 정문을 지나는 차를 진입·출차로 기록하고,
// 정문 앞에서 멈춰 기다린 시간·구내 체류 시간·부산신항 세관 X-ray 검사 대기를 함께 센다.
// 읽기 전용: 차량 흐름을 바꾸지 않고 시뮬레이션 전역 난수도 쓰지 않는다.
import type { GateKey, Sim, Vehicle } from './sim'
import { GATES } from './world'
import { SPEEDUP } from './clock'
import type { Leg } from './path'
import { L } from '../i18n'

export interface GateEntry {
  id: number
  t: number
  gate: GateKey
  dir: 'in' | 'out'
  vehicle: string
  plate: string
  /** 정문 앞에서 멈춰 기다린 시간(관제 시계 초, 진입만) */
  wait?: number
  /** 구내 체류 시간(관제 시계 초, 출차만) */
  dwell?: number
  note?: string
}

interface GateStat {
  in: number
  out: number
  waitSum: number
  dwellSum: number
  dwellN: number
}

const GATE_KEYS: GateKey[] = ['GJ', 'IN', 'IC', 'BS', 'AP', 'DJ']
const MAX = 240

export class GateLog {
  entries: GateEntry[] = []
  stats = Object.fromEntries(GATE_KEYS.map((g) => [g, { in: 0, out: 0, waitSum: 0, dwellSum: 0, dwellN: 0 }])) as Record<GateKey, GateStat>
  /** 세관 X-ray: 검사 대상으로 정해진 차(아직 검사 전), 검사 중 시작 시각, 끝난 검사 시간 */
  xray = { pending: new Set<string>(), since: new Map<string, number>(), done: 0, sum: 0 }
  private seq = 1
  /** 정문 진입 시각(차량 → 시각, 정문 키) */
  private inside = new Map<string, { gate: GateKey; t: number }>()
  /** 정문 앞 진입로에서 멈춰 있던 시간 누적(차량 → 관제 시계 초) */
  private waitAcc = new Map<string, number>()
  private acc = 0

  constructor(private sim: Sim) {}

  private push(e: Omit<GateEntry, 'id' | 't'>) {
    const full: GateEntry = { ...e, id: this.seq++, t: this.sim.clock }
    this.entries.unshift(full)
    if (this.entries.length > MAX) this.entries.pop()
    return full
  }

  /** 정문 통과(진입): 정문 작업이 시작될 때 한 번 */
  onIn(v: Vehicle, gate: GateKey) {
    const wait = this.waitAcc.get(v.id) ?? 0
    this.waitAcc.delete(v.id)
    const s = this.stats[gate]
    s.in++
    s.waitSum += wait
    this.inside.set(v.id, { gate, t: this.sim.clock })
    this.push({ gate, dir: 'in', vehicle: v.id, plate: v.plate, wait })
  }

  /** 출차: 정문에서 간선으로 나가는 구간에 들어설 때 한 번 */
  onOut(v: Vehicle, gate: GateKey) {
    const s = this.stats[gate]
    s.out++
    const st = this.inside.get(v.id)
    let dwell: number | undefined
    if (st && st.gate === gate) {
      dwell = this.sim.clock - st.t
      s.dwellSum += dwell
      s.dwellN++
    }
    this.inside.delete(v.id)
    const note = gate === 'BS' && v.kind === 'trailer' && this.xrayChecked.has(v.id) ? L('세관 X-ray 검사 후 반출', 'Released after customs X-ray') : undefined
    this.xrayChecked.delete(v.id)
    this.push({ gate, dir: 'out', vehicle: v.id, plate: v.plate, dwell, note })
  }

  private xrayChecked = new Set<string>()

  /** 거점 밖으로 나가는 구간에 들어섬: 간선 진출(exit)은 시작점의 정문, 다온마을 배송(town)은 들어와 있던 인천 정문 */
  onLeave(v: Vehicle, leg: Leg) {
    if (leg.tag === 'exit') {
      const p0 = leg.path.pts[0]
      const g = this.gateAt(p0.x, p0.z)
      if (g) this.onOut(v, g)
    } else if (this.inside.get(v.id)?.gate === 'IN') this.onOut(v, 'IN')
  }

  /** 정문에서 나가는 구간의 시작점으로 어느 정문인지 찾는다 */
  gateAt(x: number, z: number): GateKey | null {
    for (const g of GATE_KEYS) {
      const G = GATES[g]
      if (Math.abs(G.outX - x) < 1 && Math.abs(G.exitZ - z) < 1.5) return g
    }
    return null
  }

  /** 지금 정문 앞에서 기다리는 차(진입로에서 멈춤 + 정문 확인 중) */
  queue(gate: GateKey) {
    return this.sim.vehicles.filter((v) => {
      if (!v.visible) return false
      const t = v.tasks[0]
      if (t?.k === 'gate') return t.gate === gate
      return this.waitAcc.has(v.id) && v.kmh < 2 && this.nearGate(v, gate)
    })
  }

  private nearGate(v: Vehicle, gate: GateKey) {
    const G = GATES[gate]
    return Math.abs(v.x - G.inX) < 40 && Math.abs(v.z - G.stopZ) < 40
  }

  /** 0.5초마다: 정문 진입로에서 멈춘 시간, X-ray 검사 시작·끝 */
  step(dt: number) {
    this.acc += dt
    if (this.acc < 0.5) return
    const span = this.acc
    this.acc = 0
    for (const v of this.sim.vehicles) {
      if (!v.visible) continue
      const t = v.tasks[0]
      if (t?.k === 'drive' && t.route && t.route.leg.tag === 'approach') {
        const w = (this.waitAcc.get(v.id) ?? 0) + (v.kmh < 2 ? span * SPEEDUP : 0)
        this.waitAcc.set(v.id, w)
      } else if (t?.k !== 'gate') this.waitAcc.delete(v.id)
      if (v.phase === 'inspecting' && !this.xray.since.has(v.id)) {
        this.xray.since.set(v.id, this.sim.clock)
        this.xray.pending.delete(v.id)
      }
    }
    for (const [id, t0] of this.xray.since) {
      const v = this.sim.vehicle(id)
      if (v && v.phase === 'inspecting') continue
      this.xray.since.delete(id)
      this.xray.done++
      this.xray.sum += this.sim.clock - t0
      this.xrayChecked.add(id)
    }
  }

  /** 부산신항: 이 트레일러가 세관 X-ray 검사 대상으로 정해짐 */
  markXray(id: string) {
    this.xray.pending.add(id)
  }

  /** 정문의 최근 기록 */
  of(gate: GateKey, n = 30) {
    const out: GateEntry[] = []
    for (const e of this.entries) {
      // 재생 막대로 되감았으면 그 시각 뒤 기록은 감춘다
      if (e.gate !== gate || e.t > this.sim.clock) continue
      out.push(e)
      if (out.length >= n) break
    }
    return out
  }

  /** 아직 구내에 있나(진입 기록 뒤 출차 전) */
  isInside(id: string, gate: GateKey) {
    return this.inside.get(id)?.gate === gate
  }
}
