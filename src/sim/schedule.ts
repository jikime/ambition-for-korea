// 도크 일정표(항만 관제 영상의 선석 일정표 · 경로 관리 영상의 배차 타임라인): 거점마다 도크(하차장·출고 도크·상차장)를
// 줄로, 지난 60분 실제 점유(하차·상차·대기)와 앞으로 30분 예정 도착(도착 약속의 도착 예정)을 시간 막대로 보여 준다.
// 읽기 전용: 차량 흐름을 바꾸지 않는다.
import type { Sim, Vehicle } from './sim'
import type { SiteId } from './world'
import { VESSELS } from './port'
import { SPEEDUP } from './clock'
import { L } from '../i18n'

export type Work = 'unloading' | 'loading' | 'waiting' | 'docking' | 'other'
export interface Slot {
  vehicle: string
  start: number
  end: number | null
  work: Work
}
export interface DockRow {
  key: string
  label: string
  slots: Slot[]
}

const PAST = 60 * 60

interface DockRef {
  key: string
  label: string
  site: SiteId
  res: () => { vehicle: string | null }
}

export class Schedule {
  private rows = new Map<string, DockRow>()
  private refs: DockRef[]
  private acc = 0

  constructor(private sim: Sim) {
    const s = sim
    const mk = (site: SiteId, prefix: string, list: { id: string; vehicle: string | null }[]) =>
      list.map((r, i) => ({ key: `${site}:${prefix}${i}`, label: r.id, site, res: () => list[i] }))
    this.refs = [
      ...mk('GJ', 'bay', s.bays), ...mk('GJ', 'dock', s.docks),
      ...mk('IC', 'bay', s.icBays), ...mk('IC', 'reefer', s.icReefers),
      ...mk('IN', 'dock', s.inDocks), ...mk('DJ', 'dock', s.djDocks), ...mk('DJ', 'yard', s.djYard), ...mk('AP', 'dock', s.apDocks),
    ]
    for (const r of this.refs) this.rows.set(r.key, { key: r.key, label: r.label, slots: [] })
  }

  /** 도크에 실제로 붙어 있나(예약만 하고 오는 중이면 아님) */
  private present(v: Vehicle, site: SiteId) {
    return v.site === site && v.visible && !['highway', 'enroute', 'departing', 'offsite', 'restArea', 'resting', 'gate'].includes(v.phase)
  }

  private work(v: Vehicle): Work {
    if (v.phase === 'unloading') return 'unloading'
    if (v.phase === 'loading' || v.phase === 'closing') return 'loading'
    if (v.phase === 'waiting' || v.phase === 'yard') return 'waiting'
    if (v.phase === 'docking' || v.phase === 'inbound') return 'docking'
    return 'other'
  }

  /** 1초마다(시뮬레이션) 점유 변화를 기록 */
  step(dt: number) {
    this.acc += dt
    if (this.acc < 0.5) return
    this.acc = 0
    const clock = this.sim.clock
    for (const r of this.refs) {
      const row = this.rows.get(r.key)!
      const id = r.res().vehicle
      const v = id ? this.sim.vehicle(id) : null
      const cur = row.slots[row.slots.length - 1]
      const open = cur && cur.end === null ? cur : null
      const here = v && this.present(v, r.site) ? v : null
      if (open && (!here || open.vehicle !== here.id || open.work !== this.work(here))) open.end = clock
      if (here && (!open || open.end !== null)) row.slots.push({ vehicle: here.id, start: clock, end: null, work: this.work(here) })
      // 지난 60분보다 오래된 칸은 버린다
      while (row.slots.length && row.slots[0].end !== null && row.slots[0].end! < clock - PAST) row.slots.shift()
    }
  }

  /** 거점의 도크 줄과 앞으로 30분 예정(예약했지만 아직 오는 중인 차의 도착 예정) */
  of(site: SiteId) {
    if (site === 'BS') return this.berthRows()
    const rows = this.refs.filter((r) => r.site === site).map((r) => this.rows.get(r.key)!)
    const planned: { key: string; vehicle: string; eta: number }[] = []
    for (const r of this.refs.filter((x) => x.site === site)) {
      const id = r.res().vehicle
      const v = id ? this.sim.vehicle(id) : null
      if (!v || this.present(v, site)) continue
      const st = this.sim.promises.status(v)
      if (st && v.promise?.dest === site && !st.state.startsWith('done')) planned.push({ key: r.key, vehicle: v.id, eta: st.eta })
    }
    return { rows, planned }
  }

  /** 부산신항 선석 1: 배마다 작업(상차 색) · 출항·입항(접안 색) 막대, 다음 배 도착 예정 */
  private berthRows() {
    const B = this.sim.port.berth
    const slots: Slot[] = B.history
      .filter((h) => h.phase !== 'away')
      .map((h) => ({ vehicle: VESSELS[h.vessel].name, start: h.start, end: h.end, work: h.phase === 'working' ? 'loading' : 'docking' }))
    const planned: { key: string; vehicle: string; eta: number }[] = []
    if (B.phase === 'departing' || B.phase === 'away') {
      // 물러나는 거리 · 비우는 12초 · 들어오는 거리(관제 시계)
      const left = (B.phase === 'departing' ? (70 - B.offset) / 3 + 12 + B.extraAway : Math.max(0, 12 + B.extraAway - B.t)) + 70 / 3
      planned.push({ key: 'BS:berth', vehicle: VESSELS[(B.vessel + (B.skip ? 2 : 1)) % VESSELS.length].name, eta: this.sim.clock + left * SPEEDUP })
    }
    return { rows: [{ key: 'BS:berth', label: L('선석 1', 'Berth 1'), slots }], planned }
  }
}
