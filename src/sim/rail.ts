// 부산신항 철송장(항만 관제 영상 분석 3순위 "철송 셔틀"): 부산신항 동쪽 철송장에 내륙 기지(지도 밖)를 오가는
// 컨테이너 셔틀 열차가 들어와 서고, 레일 위 갠트리 크레인(RMG)이 화차의 수출 컨테이너를 내려 장치 줄에 쌓은 뒤
// 수입 컨테이너를 실어 보낸다. 다른 흐름과 독립이고 전역 난수를 쓰지 않는다(화면 · 반출 수단 분담 · 탄소 비교용).
import { mulberry32 } from './data'
import { L } from '../i18n'

export const RAIL = {
  /** 작업 선로 */
  z: 291,
  /** 철송장 범위 */
  x0: 390,
  x1: 580,
  /** 지도 밖(동쪽) */
  off: 1270,
  wagons: 9,
  wagonLen: 15.2,
  locoLen: 19,
  /** 열차 앞(서쪽 기관차 앞면)이 서는 곳 */
  stopX: 398,
  /** RMG 다리 레일(z)과 장치 줄 두 개(z): 0 = 수출(배로 갈 것), 1 = 수입(내륙으로 갈 것) */
  rmgZ0: 266,
  rmgZ1: 298,
  stackZ: [271.5, 276.5] as const,
  tiers: 2,
  /** 화차 바닥 높이 */
  deck: 1.25,
  vmax: 16,
  accel: 0.6,
}

export const RAIL_COLORS = ['#5FAFAA', '#E59B6B', '#6585E8', '#A3ACBE', '#D47A74', '#76B08A', '#E2BF6E']

export type RailPhase = 'away' | 'arriving' | 'working' | 'departing'
export const RAIL_PHASE_LABEL: Record<RailPhase, string> = {
  away: L('내륙 기지 운행', 'Running to inland depot'), arriving: L('철송장 진입', 'Entering rail terminal'), working: L('상하차 작업', 'Loading · unloading'), departing: L('출발', 'Departing'),
}

/** 화차 i 가운데 x(열차 앞이 x0일 때) */
export const wagonX = (trainX: number, i: number) => trainX + RAIL.locoLen + RAIL.wagonLen * (i + 0.5)
export const trainLength = () => RAIL.locoLen * 2 + RAIL.wagonLen * RAIL.wagons

interface Seg {
  /** 시작·끝 위치(x, 트롤리 z, 스프레더 높이) */
  a: [number, number, number]
  b: [number, number, number]
  dur: number
  t: number
  /** 끝났을 때 할 일(상자 집기·내려놓기) */
  done?: () => void
}

export class RailShuttle {
  phase: RailPhase = 'working'
  /** 열차 앞(서쪽 끝) x */
  x = RAIL.stopX
  v = 0
  t = 0
  /** 화차 위 컨테이너 색(null = 빈 화차) */
  wagons: (string | null)[] = []
  /** 장치 줄[줄][칸] = 아래부터 쌓인 색 */
  stack: string[][][] = [[], []]
  rmg = { x: wagonX(RAIL.stopX, 0), tz: RAIL.z, hy: 9, box: null as string | null }
  stats = { trains: 0, teuIn: 0, teuOut: 0, moves: 0 }
  /** 이번 열차 작업: 내릴 화차 수 + 실을 화차 수 중 끝낸 수 */
  work = { done: 0, total: RAIL.wagons * 2 }
  /** 다음 열차 도착 예정(시뮬레이션 경과 초) */
  nextAt = 0
  private elapsed = 0
  private segs: Seg[] = []
  private r = mulberry32(3131)
  private dray = 0

  constructor() {
    const col = () => RAIL_COLORS[Math.floor(this.r() * RAIL_COLORS.length)]
    this.wagons = Array.from({ length: RAIL.wagons }, () => col())
    this.stack = [0, 1].map((row) => Array.from({ length: RAIL.wagons }, () => (row === 0 ? (this.r() < 0.35 ? [col()] : []) : this.r() < 0.5 ? [col(), col()] : [col()])))
    // 처음에는 막 들어온 열차가 작업을 시작하는 상태
    this.work = { done: 0, total: RAIL.wagons * 2 }
  }

  private col() {
    return RAIL_COLORS[Math.floor(this.r() * RAIL_COLORS.length)]
  }

  /** RMG 한 번 옮기기: 집을 곳 → 내려놓을 곳 */
  private plan(from: { x: number; z: number; y: number; take: () => string | null }, to: { x: number; z: number; y: number; put: (c: string) => void }) {
    const top = 9
    const cur = (): [number, number, number] => [this.rmg.x, this.rmg.tz, this.rmg.hy]
    const travel = (a: [number, number, number], b: [number, number, number]) => Math.max(0.8, Math.abs(a[0] - b[0]) / 4.5, Math.abs(a[1] - b[1]) / 5)
    const p0 = cur()
    const p1: [number, number, number] = [from.x, from.z, top]
    const p2: [number, number, number] = [from.x, from.z, from.y]
    const p3: [number, number, number] = [to.x, to.z, top]
    const p4: [number, number, number] = [to.x, to.z, to.y]
    this.segs.push(
      { a: p0, b: p1, dur: travel(p0, p1), t: 0 },
      { a: p1, b: p2, dur: 0.9, t: 0, done: () => { this.rmg.box = from.take() } },
      { a: p2, b: p1, dur: 0.8, t: 0 },
      { a: p1, b: p3, dur: travel(p1, p3), t: 0 },
      { a: p3, b: p4, dur: 0.9, t: 0, done: () => { const c = this.rmg.box; this.rmg.box = null; if (c) to.put(c); this.work.done++; this.stats.moves++ } },
      { a: p4, b: p3, dur: 0.8, t: 0 },
    )
  }

  /** 다음 옮길 일을 정한다: 먼저 화차의 수출 컨테이너를 줄 0에, 다음 줄 1의 수입 컨테이너를 화차에 */
  private nextMove() {
    const tierY = (n: number) => (n + 1) * 2.6 + 0.05
    const unload = this.wagons.findIndex((c) => c !== null)
    if (this.work.done < RAIL.wagons && unload >= 0) {
      // 수출 줄(0)에서 그 화차와 가장 가까운 빈 칸(다 찼으면 맨 위에 하나 더)
      let bay = unload
      for (let d = 0; d < RAIL.wagons; d++) {
        const k = [unload + d, unload - d].find((b) => b >= 0 && b < RAIL.wagons && this.stack[0][b].length < RAIL.tiers)
        if (k !== undefined) { bay = k; break }
      }
      const pile = this.stack[0][bay]
      const row = 0
      this.plan(
        { x: wagonX(this.x, unload), z: RAIL.z, y: RAIL.deck + 2.65, take: () => { const c = this.wagons[unload]; this.wagons[unload] = null; return c } },
        { x: wagonX(this.x, bay), z: RAIL.stackZ[row], y: tierY(pile.length), put: (c) => pile.push(c) },
      )
      return true
    }
    if (this.work.done < RAIL.wagons) this.work.done = RAIL.wagons
    const load = this.wagons.findIndex((c) => c === null)
    if (load >= 0) {
      // 수입 줄(1)에서 가까운 칸부터, 없으면 새 컨테이너가 트랙터로 막 들어온 것으로 본다
      let bay = load
      for (let d = 0; d < RAIL.wagons; d++) {
        const k = [load + d, load - d].find((b) => b >= 0 && b < RAIL.wagons && this.stack[1][b].length)
        if (k !== undefined) { bay = k; break }
      }
      const pile = this.stack[1][bay]
      if (!pile.length) pile.push(this.col())
      this.plan(
        { x: wagonX(this.x, bay), z: RAIL.stackZ[1], y: tierY(pile.length - 1), take: () => pile.pop() ?? null },
        { x: wagonX(this.x, load), z: RAIL.z, y: RAIL.deck + 2.65, put: (c) => { this.wagons[load] = c } },
      )
      return true
    }
    return false
  }

  /** 장치 줄을 트랙터가 비우고 채우는 것(지도 밖 반출입): 열차가 없을 때 천천히 */
  private drayage(dt: number) {
    this.dray += dt
    if (this.dray < 5) return
    this.dray = 0
    const full = this.stack[0].map((p, i) => [p.length, i]).sort((a, b) => b[0] - a[0])[0]
    if (full && full[0] > 0 && this.r() < 0.7) this.stack[0][full[1]].pop()
    const empty = this.stack[1].map((p, i) => [p.length, i]).sort((a, b) => a[0] - b[0])[0]
    if (empty && empty[0] < RAIL.tiers && this.r() < 0.7) this.stack[1][empty[1]].push(this.col())
  }

  step(dt: number) {
    this.elapsed += dt
    if (this.phase === 'away') {
      this.drayage(dt)
      this.t -= dt
      if (this.t <= 0) {
        this.phase = 'arriving'
        this.x = RAIL.off
        this.v = RAIL.vmax
        this.wagons = Array.from({ length: RAIL.wagons }, () => (this.r() < 0.9 ? this.col() : null))
        this.work = { done: 0, total: this.wagons.filter(Boolean).length + RAIL.wagons }
        if (this.work.total < RAIL.wagons * 2) this.work.done = RAIL.wagons - this.wagons.filter(Boolean).length
      }
      return
    }
    if (this.phase === 'arriving') {
      this.drayage(dt)
      const left = this.x - RAIL.stopX
      // 남은 거리로 감속(등감속), 마지막 몇 m는 기어 들어간다
      this.v = Math.max(0.6, Math.min(RAIL.vmax, Math.sqrt(2 * RAIL.accel * Math.max(0, left))))
      this.x = Math.max(RAIL.stopX, this.x - this.v * dt)
      if (this.x <= RAIL.stopX + 0.01) {
        this.x = RAIL.stopX
        this.v = 0
        this.phase = 'working'
        this.stats.trains++
      }
      return
    }
    if (this.phase === 'working') {
      if (!this.segs.length && !this.nextMove()) {
        this.phase = 'departing'
        this.v = 0
        return
      }
      const s = this.segs[0]
      s.t += dt
      const k = Math.min(1, s.t / s.dur)
      const e = k * k * (3 - 2 * k)
      this.rmg.x = s.a[0] + (s.b[0] - s.a[0]) * e
      this.rmg.tz = s.a[1] + (s.b[1] - s.a[1]) * e
      this.rmg.hy = s.a[2] + (s.b[2] - s.a[2]) * e
      if (k >= 1) {
        this.segs.shift()
        s.done?.()
      }
      return
    }
    // departing: 동쪽으로 가속해 지도 밖으로
    this.v = Math.min(RAIL.vmax, this.v + RAIL.accel * dt)
    this.x += this.v * dt
    if (this.x >= RAIL.off) {
      this.stats.teuOut += this.wagons.filter(Boolean).length * 2
      this.stats.teuIn += RAIL.wagons * 2
      this.phase = 'away'
      this.t = 70 + this.r() * 40
      this.nextAt = this.elapsed + this.t + (RAIL.off - RAIL.stopX) / (RAIL.vmax * 0.7)
    }
  }

  /** 지금 작업 진행(0~1) */
  get progress() {
    return this.phase === 'working' ? Math.min(1, this.work.done / Math.max(1, this.work.total)) : this.phase === 'departing' || this.phase === 'away' ? 1 : 0
  }

  /** 다음 열차가 설 때까지 남은 시뮬레이션 초(운행 중일 때만) */
  get untilNext() {
    if (this.phase === 'away') return Math.max(0, this.nextAt - this.elapsed)
    if (this.phase === 'arriving') return Math.max(0, (this.x - RAIL.stopX) / Math.max(1, this.v))
    return null
  }
}
