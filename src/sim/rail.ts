// 철송(다온 중부 철송선): 부산신항 철송장 ↔ 곤지암 철송장을 오가는 컨테이너 셔틀 열차 한 편성.
// 노선: 부산 철송장(z 291)에서 동쪽으로 → x 1000에서 북쪽으로 꺾어 간선 위 철도교를 넘고 → z −100에서 서쪽으로 → 곤지암 철송장.
//  - 부산: 장치장의 수입 컨테이너(실제 Box)를 육측 ARMG가 철송장으로 넘기면(port.requestRail 'railOut') RMG가 화차에 싣는다.
//          열차가 가져온 수출 컨테이너는 RMG가 내려 놓고, 육측 ARMG가 장치장으로 다시 반입한다('railIn').
//  - 곤지암: RMG가 수입 컨테이너를 내리면 구내 트랙터가 CY로 옮겨 적출하고(onCy), CY의 수출 컨테이너를 실어 부산으로 돌아간다.
// 전역 난수를 쓰지 않는다(자체 mulberry32).
import { mulberry32 } from './data'
import type { Box } from './port'
import { L } from '../i18n'

export const RAIL = {
  /** 부산 철송장 작업 선로 */
  z: 291,
  /** 부산 철송장 범위 */
  x0: 390,
  x1: 580,
  wagons: 9,
  /** 차량 길이(연결기 끝~끝, 에셋 팩 모델과 같다): 40ft 평판화차 16.99m · 6축 기관차 19.17m */
  wagonLen: 16.99,
  locoLen: 19.17,
  /** 부산에서 열차 앞(서쪽 기관차 앞면)이 서는 곳 */
  stopX: 398,
  /** 부산 RMG 다리 레일(z)과 장치 줄 두 개(z): 0 = 열차에서 내린 수출, 1 = 열차에 실을 수입 */
  rmgZ0: 266,
  rmgZ1: 298,
  stackZ: [271.5, 276.5] as const,
  tiers: 2,
  /** 레일 윗면 높이(차륜이 닿는 곳) */
  railTop: 0.2,
  /** 평판화차에 실린 컨테이너 밑면 높이(레일 윗면 + 1.278) */
  deck: 1.478,
  vmax: 18,
  accel: 0.6,
}

/** 곤지암 철송장(곤지암 메가허브 북쪽): 선로 z, 포장 범위, 선로 끝(차막이) x, RMG 다리 레일 z, 장치 줄 z [0 = 내린 수입, 1 = 실을 수출] */
export const GJ_RAIL = { z: -100, x0: -52, x1: 128, end: -60, rmgZ0: -107, rmgZ1: -75, stackZ: [-85.5, -80.5] as const }

/** 노선이 꺾이는 곳: 동쪽 남북 구간 x, 곡선 반지름, 간선 위 철도교 높이(레일 면) */
export const LINE = { x: 1000, r: 40, h: 7.5 }

export const RAIL_COLORS = ['#5FAFAA', '#E59B6B', '#6585E8', '#A3ACBE', '#D47A74', '#76B08A', '#E2BF6E']

// ───────────────────────── 노선 모양(부산 철송장 → 곤지암 철송장 방향으로 거리 s)

interface Piece {
  len: number
  at: (t: number) => [number, number]
  dir: (t: number) => [number, number]
}

function straight(a: [number, number], b: [number, number]): Piece {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const d: [number, number] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
  return { len, at: (t) => [a[0] + d[0] * t, a[1] + d[1] * t], dir: () => d }
}

/** 가운데 c, 반지름 r, 각 a0 → a1(점 = c + r·(cos, sin)) */
function arc(c: [number, number], r: number, a0: number, a1: number): Piece {
  const sgn = Math.sign(a1 - a0)
  const len = Math.abs(a1 - a0) * r
  const ang = (t: number) => a0 + (sgn * t) / r
  return {
    len,
    at: (t) => [c[0] + r * Math.cos(ang(t)), c[1] + r * Math.sin(ang(t))],
    dir: (t) => [-sgn * Math.sin(ang(t)), sgn * Math.cos(ang(t))],
  }
}

const JX = LINE.x - LINE.r
const PIECES: Piece[] = [
  straight([RAIL.stopX, RAIL.z], [JX, RAIL.z]),
  arc([JX, RAIL.z - LINE.r], LINE.r, Math.PI / 2, 0),
  straight([LINE.x, RAIL.z - LINE.r], [LINE.x, GJ_RAIL.z + LINE.r]),
  arc([JX, GJ_RAIL.z + LINE.r], LINE.r, 0, -Math.PI / 2),
  straight([JX, GJ_RAIL.z], [GJ_RAIL.end, GJ_RAIL.z]),
]
/** 조각마다 시작 거리 */
export const PIECE_S: number[] = []
let acc = 0
for (const p of PIECES) {
  PIECE_S.push(acc)
  acc += p.len
}
/** 노선 전체 길이(부산 열차 앞 정지점 → 곤지암 차막이) */
export const LINE_LEN = acc

export interface LinePoint {
  x: number
  y: number
  z: number
  /** 진행 방향(곤지암 쪽) 단위 벡터 */
  dx: number
  dz: number
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// 간선(z 37~62)을 넘는 철도교: 남북 구간 z 222에서 오르기 시작해 z 112에서 다 오르고, z −12부터 내려가 곤지암 쪽 곡선을 지나 x 900에서 땅에 닿는다
const S_UP0 = PIECE_S[2] + (RAIL.z - LINE.r - 222)
const S_UP1 = PIECE_S[2] + (RAIL.z - LINE.r - 112)
const S_DN0 = PIECE_S[2] + (RAIL.z - LINE.r + 12)
const S_DN1 = PIECE_S[4] + 60
/** 철도교 오르막 시작·끝, 내리막 시작·끝(노선 거리) */
export const RAMP = { up0: S_UP0, up1: S_UP1, dn0: S_DN0, dn1: S_DN1 }
/** 레일 면 높이(땅 = 0) */
export function lineY(s: number) {
  return LINE.h * smooth(S_UP0, S_UP1, s) * (1 - smooth(S_DN0, S_DN1, s))
}

/** 거리 s의 노선 위 점 */
export function linePoint(s: number): LinePoint {
  const c = Math.max(0, Math.min(LINE_LEN, s))
  let i = PIECES.length - 1
  while (i > 0 && PIECE_S[i] > c) i--
  const t = c - PIECE_S[i]
  const [x, z] = PIECES[i].at(t)
  const [dx, dz] = PIECES[i].dir(t)
  return { x, y: lineY(c), z, dx, dz }
}

export interface CarPose {
  x: number
  y: number
  z: number
  /** three.js rotation.y(+x 축이 진행 방향을 향하게) */
  yaw: number
  /** rotation.z(앞이 들리면 +) */
  pitch: number
}

/** 길이 len인 차량 가운데가 s에 있을 때: 앞뒤 대차 두 점으로 방향·기울기를 정한다(곡선에서 자연스럽게) */
export function carPose(s: number, len: number): CarPose {
  const h = Math.max(1, len / 2 - 2.5)
  const a = linePoint(s - h)
  const b = linePoint(s + h)
  const dx = b.x - a.x
  const dz = b.z - a.z
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2, yaw: Math.atan2(-dz, dx), pitch: Math.atan2(b.y - a.y, Math.hypot(dx, dz)) }
}

// ───────────────────────── 열차 편성

/** 편성 길이: 앞 기관차 · 화차 9량 · 뒤 기관차 */
export const TRAIN_LEN = RAIL.locoLen * 2 + RAIL.wagonLen * RAIL.wagons
/** 차량 한 칸: 편성 앞(부산 쪽 끝)에서 가운데까지 거리, 길이, 종류 */
export const CARS: { u: number; len: number; kind: 'loco' | 'wagon'; flip: boolean }[] = [
  { u: RAIL.locoLen / 2, len: RAIL.locoLen, kind: 'loco', flip: false },
  ...Array.from({ length: RAIL.wagons }, (_, i) => ({ u: RAIL.locoLen + RAIL.wagonLen * (i + 0.5), len: RAIL.wagonLen, kind: 'wagon' as const, flip: false })),
  { u: RAIL.locoLen * 1.5 + RAIL.wagonLen * RAIL.wagons, len: RAIL.locoLen, kind: 'loco', flip: true },
]

/** 화차 i 가운데의 노선 거리(편성 앞이 head일 때) */
export const wagonS = (head: number, i: number) => head + RAIL.locoLen + RAIL.wagonLen * (i + 0.5)
/** 부산 철송장에서 화차 i 가운데 x(열차 앞이 trainX일 때) */
export const wagonX = (trainX: number, i: number) => trainX + RAIL.locoLen + RAIL.wagonLen * (i + 0.5)

export type TermId = 'BS' | 'GJ'
/** 열차가 서는 곳(편성 앞의 노선 거리): 부산은 철송장 서쪽 끝, 곤지암은 꼬리가 차막이 4m 앞 */
export const STOP: Record<TermId, number> = { BS: 0, GJ: LINE_LEN - 4 - TRAIN_LEN }

// ───────────────────────── 철송장(RMG · 장치 줄)

interface TermSpec {
  id: TermId
  trackZ: number
  rmgZ0: number
  rmgZ1: number
  stackZ: readonly [number, number]
}
export const TERMINALS: Record<TermId, TermSpec> = {
  BS: { id: 'BS', trackZ: RAIL.z, rmgZ0: RAIL.rmgZ0, rmgZ1: RAIL.rmgZ1, stackZ: RAIL.stackZ },
  GJ: { id: 'GJ', trackZ: GJ_RAIL.z, rmgZ0: GJ_RAIL.rmgZ0, rmgZ1: GJ_RAIL.rmgZ1, stackZ: GJ_RAIL.stackZ },
}
/** 철송장 칸 i의 x(서 있는 열차의 화차 i와 같은 자리) */
export const bayX = (t: TermId, i: number) => linePoint(wagonS(STOP[t], i)).x
/** 장치 줄 단 높이(바닥 가운데) */
const tierY = (n: number) => (n + 1) * 2.6 + 0.05

interface Seg {
  /** 시작·끝 위치(x, 트롤리 z, 스프레더 높이) */
  a: [number, number, number]
  b: [number, number, number]
  dur: number
  t: number
  /** 끝났을 때 할 일(상자 집기·내려놓기) */
  done?: () => void
}

export class RailTerminal {
  /** 장치 줄[0 내린 것 · 1 실을 것][칸][단] */
  stack: Box[][][] = [[], []]
  rmg: { x: number; tz: number; hy: number; box: Box | null }
  /** 이번 열차 작업: 내릴 화차 수 + 실을 화차 수 중 끝낸 수 */
  work = { done: 0, total: 0 }
  /** 실을 것이 오기를 기다린 시간(부산: 장치장에서 넘어오는 중) */
  waited = 0
  private segs: Seg[] = []
  private unloading = true

  constructor(public spec: TermSpec) {
    this.rmg = { x: bayX(spec.id, 0), tz: spec.trackZ, hy: 9, box: null }
    this.stack = [0, 1].map(() => Array.from({ length: RAIL.wagons }, () => [] as Box[]))
  }

  count(row: 0 | 1) {
    return this.stack[row].reduce((n, p) => n + p.length, 0)
  }

  /** 가장 낮은 칸에 올린다 */
  push(row: 0 | 1, b: Box) {
    const pile = this.stack[row].reduce((lo, p) => (p.length < lo.length ? p : lo), this.stack[row][0])
    pile.push(b)
  }

  /** 가장 높은 칸 맨 위를 꺼낸다 */
  pop(row: 0 | 1): Box | null {
    const pile = this.stack[row].reduce((hi, p) => (p.length > hi.length ? p : hi), this.stack[row][0])
    return pile.pop() ?? null
  }

  /** 열차가 섰다: 실린 화차 수만큼 내리고, 모든 화차를 채운다 */
  begin(wagons: (Box | null)[]) {
    const loaded = wagons.filter(Boolean).length
    this.work = { done: 0, total: loaded + RAIL.wagons }
    this.unloading = loaded > 0
    this.waited = 0
    this.segs = []
  }

  get busy() {
    return this.segs.length > 0
  }

  /** RMG 한 번 옮기기: 집을 곳 → 내려놓을 곳 */
  private plan(from: { x: number; z: number; y: number; take: () => Box | null }, to: { x: number; z: number; y: number; put: (b: Box) => void }) {
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
      { a: p3, b: p4, dur: 0.9, t: 0, done: () => { const c = this.rmg.box; this.rmg.box = null; if (c) to.put(c); this.work.done++ } },
      { a: p4, b: p3, dur: 0.8, t: 0 },
    )
  }

  /**
   * 다음 옮길 일: 먼저 화차의 컨테이너를 줄 0(가까운 빈 칸)에 내리고, 다음 줄 1에서 빈 화차에 싣는다.
   * prefer(해상 여정 컨테이너)가 줄 1 어느 칸 맨 위에 있으면 그것부터 싣는다.
   * 실을 것이 없으면: make가 있으면 새로 만들고(곤지암 CY 반출), 없으면 'wait'(부산: 장치장에서 오는 중) 또는 'none'
   */
  private nextMove(wagons: (Box | null)[], prefer: Box | null, make: (() => Box) | null, canWait: boolean): 'move' | 'wait' | 'none' {
    const S = this.spec
    const id = S.id
    if (this.unloading) {
      const unload = wagons.findIndex((c) => c !== null)
      if (unload >= 0) {
        let bay = unload
        for (let d = 0; d < RAIL.wagons; d++) {
          const k = [unload + d, unload - d].find((b) => b >= 0 && b < RAIL.wagons && this.stack[0][b].length < RAIL.tiers)
          if (k !== undefined) { bay = k; break }
        }
        const pile = this.stack[0][bay]
        this.plan(
          { x: bayX(id, unload), z: S.trackZ, y: RAIL.deck + 2.65, take: () => { const c = wagons[unload]; wagons[unload] = null; return c } },
          { x: bayX(id, bay), z: S.stackZ[0], y: tierY(pile.length), put: (c) => pile.push(c) },
        )
        return 'move'
      }
      this.unloading = false
      this.work.done = this.work.total - RAIL.wagons
    }
    const load = wagons.findIndex((c) => c === null)
    if (load < 0) return 'none'
    let bay = prefer ? this.stack[1].findIndex((p) => p.length > 0 && p[p.length - 1] === prefer) : -1
    if (bay < 0) bay = this.stack[1].findIndex((p) => p.length > 0 && p.includes(prefer as Box))
    if (bay < 0) {
      for (let d = 0; d < RAIL.wagons; d++) {
        const k = [load + d, load - d].find((b) => b >= 0 && b < RAIL.wagons && this.stack[1][b].length)
        if (k !== undefined) { bay = k; break }
      }
    }
    if (bay < 0) {
      if (make) {
        bay = load
        this.stack[1][bay].push(make())
      } else return canWait ? 'wait' : 'none'
    }
    const pile = this.stack[1][bay]
    this.plan(
      { x: bayX(id, bay), z: S.stackZ[1], y: tierY(pile.length - 1), take: () => pile.pop() ?? null },
      { x: bayX(id, load), z: S.trackZ, y: RAIL.deck + 2.65, put: (c) => { wagons[load] = c } },
    )
    return 'move'
  }

  /** 열차 작업 한 걸음. 끝났으면 true */
  step(dt: number, wagons: (Box | null)[], prefer: Box | null, make: (() => Box) | null, canWait: boolean): boolean {
    if (!this.segs.length) {
      const r = this.nextMove(wagons, prefer, make, canWait)
      if (r === 'none') return true
      if (r === 'wait') {
        this.waited += dt
        return this.waited > 60
      }
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
    return false
  }
}

// ───────────────────────── 셔틀 열차

/** 열차 상태: 부산·곤지암 철송장에서 상하차, 곤지암행·부산행 운행 */
export type RailState = 'BS' | 'GJ' | 'toGJ' | 'toBS'
export const RAIL_STATE_LABEL: Record<RailState, string> = {
  BS: L('부산 철송장 상하차', 'Loading at Busan rail terminal'),
  GJ: L('곤지암 철송장 상하차', 'Loading at Gonjiam rail terminal'),
  toGJ: L('곤지암행 운행', 'Running to Gonjiam'),
  toBS: L('부산행 운행', 'Running to Busan'),
}

/** 컨테이너 위치(해상 여정 추적용) */
export type RailWhere = 'bsStack' | 'bsRmg' | 'wagon' | 'gjRmg' | 'gjStack'

export class RailShuttle {
  state: RailState = 'BS'
  /** 편성 앞(부산 쪽 끝)의 노선 거리 */
  s = STOP.BS
  v = 0
  /** 화차 위 컨테이너(null = 빈 화차) */
  wagons: (Box | null)[] = []
  bs = new RailTerminal(TERMINALS.BS)
  gj = new RailTerminal(TERMINALS.GJ)
  /** arrivals: 철송장 도착 횟수 · toGj/toBs: 실어 나른 컨테이너 수 · moves: RMG 작업 수 */
  stats = { arrivals: 0, toGj: 0, toBs: 0, moves: 0 }
  /** 마지막 운행(탄소 장부가 읽는다) */
  last: { from: TermId; to: TermId; n: number } | null = null
  /** 부산 철송장이 장치장에 보낸 요청 중 아직 처리되지 않은 수 */
  pendingOut = 0
  pendingIn = 0
  /** 장치장에 요청(Sim이 연결한다): 'railOut' 장치장 → 철송장, 'railIn' 철송장 → 장치장 */
  requestPort: ((kind: 'railIn' | 'railOut') => boolean) | null = null
  /** 곤지암 CY로 넘겼을 때(Sim이 연결한다) */
  onCy: ((b: Box) => void) | null = null
  /** 해상 여정에서 철송으로 따라가는 컨테이너(먼저 싣는다) */
  focus: Box | null = null
  private r = mulberry32(3131)
  private seq = 7100
  private feedT = 0
  private drayT = 0

  constructor() {
    // 처음: 곤지암에서 온 수출 컨테이너를 실은 열차가 부산 철송장에 막 섰다
    this.wagons = Array.from({ length: RAIL.wagons }, () => this.newBox('export'))
    for (let b = 0; b < RAIL.wagons; b++) {
      if (this.r() < 0.35) this.bs.stack[0][b].push(this.newBox('export'))
      const n = this.r() < 0.5 ? 2 : 1
      for (let k = 0; k < n; k++) this.bs.stack[1][b].push(this.newBox('import'))
      if (this.r() < 0.4) this.gj.stack[0][b].push(this.newBox('import'))
      if (this.r() < 0.7) this.gj.stack[1][b].push(this.newBox('export'))
    }
    this.bs.begin(this.wagons)
  }

  newBox(kind: Box['kind']): Box {
    const prefix = ['DAOU', 'HNMU', 'SEOU', 'KORU'][Math.floor(this.r() * 4)]
    return { id: `${prefix}${String(this.seq++ * 7919 % 9000000 + 1000000)}`, color: RAIL_COLORS[Math.floor(this.r() * RAIL_COLORS.length)], kind, manifest: null }
  }

  /** 장치장 ARMG가 철송장에서 수출 컨테이너를 집어 간다 */
  takeIn(): Box | null {
    this.pendingIn = Math.max(0, this.pendingIn - 1)
    return this.bs.pop(0)
  }

  /** 장치장 ARMG가 수입 컨테이너를 철송장 대기 줄에 넘긴다 */
  putOut(b: Box) {
    this.pendingOut = Math.max(0, this.pendingOut - 1)
    this.bs.push(1, b)
  }

  /** 부산: 실을 수입 컨테이너가 모자라면 장치장에 반출을, 내린 수출 컨테이너는 반입을 요청한다 */
  private feedPort() {
    if (!this.requestPort) return
    const want = this.focus ? 13 : 11
    while (this.pendingOut < 2 && this.bs.count(1) + this.pendingOut < want && this.requestPort('railOut')) this.pendingOut++
    while (this.pendingIn < 2 && this.pendingIn < this.bs.count(0) && this.requestPort('railIn')) this.pendingIn++
  }

  /** 곤지암: 내린 수입 컨테이너를 CY로 옮기고, CY의 수출 컨테이너를 실을 줄에 채운다(열차가 없을 때) */
  private drayGj(dt: number) {
    this.drayT += dt
    if (this.drayT < 4) return
    this.drayT = 0
    if (this.gj.count(0) > 0) {
      const b = this.gj.pop(0)
      if (b) {
        if (b === this.focus) this.focus = null
        this.onCy?.(b)
      }
    }
    if (this.gj.count(1) < RAIL.wagons + 3 && this.r() < 0.8) this.gj.push(1, this.newBox('export'))
  }

  step(dt: number) {
    this.feedT += dt
    if (this.feedT > 1.5) {
      this.feedT = 0
      this.feedPort()
    }
    if (this.state !== 'GJ') this.drayGj(dt)
    if (this.state === 'BS' || this.state === 'GJ') {
      const T = this.state === 'BS' ? this.bs : this.gj
      const before = T.work.done
      const done = T.step(dt, this.wagons, this.state === 'BS' ? this.focus : null, this.state === 'GJ' ? () => this.newBox('export') : null, this.state === 'BS' && this.pendingOut > 0)
      this.stats.moves += T.work.done - before
      if (done) {
        this.state = this.state === 'BS' ? 'toGJ' : 'toBS'
        this.v = 0
      }
      return
    }
    // 운행: 남은 거리로 감속(등감속), 마지막 몇 m는 기어 들어간다
    const to: TermId = this.state === 'toGJ' ? 'GJ' : 'BS'
    const target = STOP[to]
    const d = Math.abs(target - this.s)
    this.v = Math.min(RAIL.vmax, this.v + RAIL.accel * dt, Math.max(0.6, Math.sqrt(2 * RAIL.accel * d)))
    const move = this.v * dt
    if (move >= d - 0.01) {
      this.s = target
      this.v = 0
      const n = this.wagons.filter(Boolean).length
      this.last = { from: to === 'GJ' ? 'BS' : 'GJ', to, n }
      this.stats.arrivals++
      if (to === 'GJ') this.stats.toGj += n
      else this.stats.toBs += n
      this.state = to
      ;(to === 'GJ' ? this.gj : this.bs).begin(this.wagons)
      return
    }
    this.s += Math.sign(target - this.s) * move
  }

  /** 서 있는 철송장(운행 중이면 null) */
  get at(): RailTerminal | null {
    return this.state === 'BS' ? this.bs : this.state === 'GJ' ? this.gj : null
  }

  /** 지금 철송장 작업 진행(0~1, 운행 중이면 1) */
  get progress() {
    const T = this.at
    return T ? Math.min(1, T.work.done / Math.max(1, T.work.total)) : 1
  }

  /** 운행 중이면 도착까지 남은 시뮬레이션 초(대략) */
  get untilArrive(): number | null {
    if (this.state !== 'toGJ' && this.state !== 'toBS') return null
    const d = Math.abs(STOP[this.state === 'toGJ' ? 'GJ' : 'BS'] - this.s)
    return d / (RAIL.vmax * 0.85) + RAIL.vmax / RAIL.accel / 2
  }

  /** 컨테이너가 철송 어디에 있나(없으면 null) */
  locate(b: Box): { where: RailWhere; x: number; y: number; z: number; wagon?: number } | null {
    const inStack = (T: RailTerminal, where: RailWhere) => {
      for (let row = 0; row < 2; row++) {
        for (let bay = 0; bay < RAIL.wagons; bay++) {
          const k = T.stack[row][bay].indexOf(b)
          if (k >= 0) return { where, x: bayX(T.spec.id, bay), y: k * 2.6 + 1.3, z: T.spec.stackZ[row] }
        }
      }
      return null
    }
    if (this.bs.rmg.box === b) return { where: 'bsRmg', x: this.bs.rmg.x, y: this.bs.rmg.hy - 1.35, z: this.bs.rmg.tz }
    if (this.gj.rmg.box === b) return { where: 'gjRmg', x: this.gj.rmg.x, y: this.gj.rmg.hy - 1.35, z: this.gj.rmg.tz }
    const w = this.wagons.indexOf(b)
    if (w >= 0) {
      const p = linePoint(wagonS(this.s, w))
      return { where: 'wagon', x: p.x, y: p.y + RAIL.deck + 1.3, z: p.z, wagon: w }
    }
    return inStack(this.bs, 'bsStack') ?? inStack(this.gj, 'gjStack')
  }
}
