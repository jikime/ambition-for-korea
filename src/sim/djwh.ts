// 대전 중부허브 창고 공정: 하차 → 입고 레인 → 입고 검수 → 지게차가 P&D(주고받는 칸)로 → 리치트럭이 고층 랙에 적치 → 보관
//   → (출고) 리치트럭이 랙에서 꺼내 P&D로 → 지게차가 출고 레인으로 → 상차.
// 참고 영상(WareTrack 새 버전)의 "실제 공정 단계"를 대전 허브 건물 안에 옮겼다. 도로 차량 충돌 회피와는 따로 돌고,
// 장비끼리 길이 겹치지 않게 맡는 구역을 나눴다(지게차는 도크별 x 구간 · z −40 줄, 리치트럭은 통로 묶음 · z −44.9 줄).
//
// 배치(건물 x 596~684, z −64~−32, 남쪽 면 z=−32에 도크 3개):
//   z −33.1 검수원 동선 · z −34.2~−37 입고/출고 레인(도크마다 2열) · z −40 지게차 줄 · z −42.9 P&D 칸
//   · z −44.9 리치트럭 줄 · z −46~−63.6 고층 랙(통로 15개 × 양쪽 × 베이 6 × 단 5 = 900칸)
import type { Sim, Vehicle } from './sim'
import { DJ } from './daejeon'
import { mulberry32 } from './data'
import { SPEEDUP } from './clock'
import { L as tr, LL } from '../i18n'

const R = mulberry32(7007)
const pick = <T,>(a: readonly T[]) => a[Math.floor(R() * a.length)]

export const RACK = {
  aisles: 15,
  x0: 600.7,
  pitch: 5.4,
  side: 2.1,
  bays: 6,
  bayZ0: -47.5,
  bayPitch: 2.9,
  levels: 5,
  levelY0: 0.15,
  levelH: 1.85,
  frontZ: -46,
  backZ: -63.6,
}
export const WH = {
  qcZ: -33.1,
  laneZ: [-37.0, -35.6, -34.2],
  flZ: -40.0,
  pdZ: -42.9,
  rtZ: -44.9,
  /** 보류(재작업) 구역: 건물 동쪽 끝 */
  holdX: 681.5,
}

export const aisleX = (k: number) => RACK.x0 + RACK.pitch * k
export const locX = (k: number, side: number) => aisleX(k) + (side ? RACK.side : -RACK.side)
export const bayZ = (j: number) => RACK.bayZ0 - RACK.bayPitch * j
export const levelY = (l: number) => RACK.levelY0 + RACK.levelH * l
const pad = (n: number) => String(n).padStart(2, '0')

export interface Loc {
  k: number
  side: number
  j: number
  l: number
  code: string
  pallet: string | null
  reserved: boolean
}

export type PalletState = 'lane-in' | 'fl' | 'pd-in' | 'rt' | 'rack' | 'pd-out' | 'lane-out' | 'gone'

export interface WhPallet {
  id: string
  state: PalletState
  x: number
  y: number
  z: number
  color: number
  /** 랙 위치(적치 목표 또는 보관 위치) */
  loc: number
  dock: number
  /** 입고 검수 */
  qc: 'wait' | 'scanning' | 'reading' | 'ok' | 'hold'
  note: string
  holdT: number
  decision: string
  by: 'ai' | 'rule' | null
  ai: QcAnswer | null
  /** 출고 레인에 들어간 시각(상차 순서) */
  t: number
}

/** AI 응답(서버 /api/ai/qc) */
export interface QcAnswer {
  damaged: number
  mismatch: number
  unsafe: number
  label: number
}

type Act =
  | { k: 'move'; pts: { x: number; z: number }[]; speed: number; rev?: boolean }
  | { k: 'turn'; h: number }
  | { k: 'lift'; y: number }
  | { k: 'reach'; v: number }
  | { k: 'wait'; t: number }
  | { k: 'do'; fn: () => void }

export interface WhEquip {
  id: string
  kind: 'reach' | 'fl'
  operator: string
  x: number
  z: number
  heading: number
  fork: number
  /** 리치트럭 포크 앞으로 뻗음(0~1) */
  reach: number
  carrying: string | null
  task: string
  acts: Act[]
  kmh: number
  dist: number
  battery: number
  moves: number
  /** 맡는 통로(리치트럭) 또는 도크 번호(지게차) */
  aisles: number[]
  dock: number
  homeX: number
}

export interface WhPerson {
  id: string
  name: string
  role: string
  zone: string
  doing: string
  done: number
  shift: string
}

/** 검수 메모(일부 파렛트만 붙는다). 뜻이 헷갈리는 것도 섞었다 */
const NOTES: string[] = LL([
  '랩 일부 찢어짐, 상자 2개 모서리 젖음',
  '송장 48박스인데 세어 보니 46박스',
  '파렛트 하단 받침 하나가 부러져 지게차로 들면 위험해 보임',
  '라벨이 번져서 바코드가 안 읽힘',
  '외관 이상 없음, 수량 일치',
  '상단 상자가 기울어 있음. 다시 쌓아야 할 듯',
  '박스 찌그러짐 1건, 내용물은 괜찮아 보임',
  '수량 맞음. 라벨만 살짝 구겨졌는데 스캔은 됨',
], [
  'Wrap partly torn, 2 boxes wet at the corners',
  'Waybill says 48 boxes but I counted 46',
  'One bottom deck board of the pallet is broken, looks dangerous to lift with a forklift',
  'Label is smudged so the barcode will not scan',
  'Exterior looks fine, quantity matches',
  'Top boxes are leaning. Probably needs restacking',
  'One box dented, contents look fine',
  'Quantity correct. Label is only slightly creased and still scans',
])

/** 낱말 규칙(AI를 끈 상태) */
export function ruleQc(note: string): QcAnswer {
  const t = note.replace(/\s+/g, '')
  return {
    damaged: /찢|젖|파손|찌그러/.test(t) || /torn|tear|wet|crush|dent/i.test(note) ? 1 : 0,
    mismatch: /인데|부족|불일치|모자/.test(t) || /counted|short|mismatch|missing/i.test(note) ? 1 : 0,
    unsafe: /위험|부러|기울/.test(t) || /danger|unsafe|broken|lean|tilt/i.test(note) ? 1 : 0,
    label: /라벨|바코드/.test(t) || /label|barcode/i.test(note) ? 1 : 0,
  }
}

const OPERATORS = LL(['민도윤', '서하린', '권태오', '임채원', '나승호', '오지민', '강유나'], ['Min Do-yun', 'Seo Ha-rin', 'Kwon Tae-o', 'Lim Chae-won', 'Na Seung-ho', 'Oh Ji-min', 'Kang Yu-na'])
/** 장비 작업 없음(task 값: 이 모듈이 비교한다) */
const IDLE = tr('대기', 'Idle')

export class DjWarehouse {
  locs: Loc[] = []
  pallets = new Map<string, WhPallet>()
  equip: WhEquip[] = []
  people: WhPerson[] = []
  /** direct: 출고 파렛트가 늦어 롤테이너를 바로 실은 횟수 */
  stats = { received: 0, putaway: 0, retrieved: 0, shipped: 0, direct: 0, inspected: 0, holds: 0, ai: 0 }
  onQc: ((p: WhPallet) => void) | null = null
  /** 출고 반출 요청: 통로별 대기 */
  private outReq: number[] = []
  private seq = 0
  private lastCargo = new Map<string, { phase: string; cargo: number }>()
  private pendingIn = [0, 0, 0]

  constructor(private sim: Sim) {
    for (let k = 0; k < RACK.aisles; k++)
      for (let side = 0; side < 2; side++)
        for (let j = 0; j < RACK.bays; j++)
          for (let l = 0; l < RACK.levels; l++)
            this.locs.push({ k, side, j, l, code: `A${pad(k + 1)}-${pad(j * 2 + side + 1)}-${l + 1}`, pallet: null, reserved: false })
    // 처음에는 약 66% 차 있다(아래 단부터 더 많이)
    for (let i = 0; i < this.locs.length; i++) {
      const L = this.locs[i]
      if (R() < 0.8 - L.l * 0.06) {
        const p = this.newPallet('rack', locX(L.k, L.side), levelY(L.l), bayZ(L.j))
        p.loc = i
        p.qc = 'ok'
        L.pallet = p.id
      }
    }
    // 리치트럭 4대(통로 묶음), 지게차 3대(도크별)
    const groups = [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11], [12, 13, 14]]
    groups.forEach((g, i) => {
      const hx = aisleX(g[0]) + RACK.pitch / 2
      this.equip.push({ id: `RT-${i + 1}`, kind: 'reach', operator: OPERATORS[i], x: hx, z: WH.rtZ, heading: Math.PI, fork: 0.15, reach: 0, carrying: null, task: IDLE, acts: [], kmh: 0, dist: 0, battery: 78 + R() * 18, moves: 0, aisles: g, dock: -1, homeX: hx })
    })
    DJ.docks.forEach((dx, i) => {
      const aisles = Array.from({ length: RACK.aisles }, (_, k) => k).filter((k) => this.dockOfAisle(k) === i)
      this.equip.push({ id: `FL-D${i + 1}`, kind: 'fl', operator: OPERATORS[4 + i], x: dx, z: WH.flZ, heading: 0, fork: 0.15, reach: 0, carrying: null, task: IDLE, acts: [], kmh: 0, dist: 0, battery: 70 + R() * 25, moves: 0, aisles, dock: i, homeX: dx })
    })
    this.people.push(
      { id: 'qc-1', name: tr('한지아', 'Han Ji-a'), role: tr('입고 검수원', 'Inbound inspector'), zone: tr('입고 검수(대전 1·2 도크)', 'Inbound QC (Daejeon docks 1-2)'), doing: IDLE, done: 0, shift: '06:00 ~ 14:30' },
      { id: 'qc-2', name: tr('문태준', 'Moon Tae-jun'), role: tr('입고 검수원', 'Inbound inspector'), zone: tr('입고 검수(대전 3 도크)', 'Inbound QC (Daejeon dock 3)'), doing: IDLE, done: 0, shift: '06:00 ~ 14:30' },
      ...DJ.docks.map((_, i) => ({ id: `dw-${i + 1}`, name: LL(['조민재', '윤서아', '백도현'], ['Jo Min-jae', 'Yun Seo-a', 'Baek Do-hyeon'])[i], role: tr('도크 작업자', 'Dock worker'), zone: tr(`대전 ${i + 1} 도크`, `Daejeon dock ${i + 1}`), doing: IDLE, done: 0, shift: i === 1 ? '14:00 ~ 22:30' : '06:00 ~ 14:30' })),
    )
  }

  dockOfAisle(k: number) {
    const x = aisleX(k)
    return x < 630 ? 0 : x < 652 ? 1 : 2
  }

  private newPallet(state: PalletState, x: number, y: number, z: number): WhPallet {
    const p: WhPallet = { id: `PL-${String(++this.seq).padStart(4, '0')}`, state, x, y, z, color: Math.floor(R() * 4), loc: -1, dock: -1, qc: 'wait', note: '', holdT: 0, decision: '', by: null, ai: null, t: 0 }
    this.pallets.set(p.id, p)
    return p
  }

  get occupancy() {
    return this.locs.filter((l) => l.pallet).length / this.locs.length
  }

  laneX(dock: number, out: boolean) {
    return DJ.docks[dock] + (out ? 0.85 : -0.85)
  }

  private laneOf(dock: number, out: boolean) {
    const want = out ? 'lane-out' : 'lane-in'
    const res: WhPallet[] = []
    for (const p of this.pallets.values()) if (p.dock === dock && p.state === want) res.push(p)
    return res
  }

  /** 조건에 맞는 첫 파렛트(펼친 배열을 만들지 않는다: 매 스텝 도는 곳) */
  private findPallet(pred: (p: WhPallet) => boolean) {
    for (const p of this.pallets.values()) if (pred(p)) return p
    return undefined
  }

  /** 레인 빈 자리(입고는 안쪽(지게차 쪽)부터, 출고는 도크 쪽부터 채운다) */
  private freeLanePos(dock: number, out: boolean) {
    const used = new Set(this.laneOf(dock, out).map((p) => p.z))
    const order = out ? [...WH.laneZ].reverse() : WH.laneZ
    return order.find((z) => !used.has(z))
  }

  inSlot(k: number) {
    return { x: aisleX(k) - 1.25, z: WH.pdZ }
  }
  outSlot(k: number) {
    return { x: aisleX(k) + 1.25, z: WH.pdZ }
  }
  private slotBusy(k: number, out: boolean) {
    const s = out ? this.outSlot(k) : this.inSlot(k)
    for (const p of this.pallets.values()) if ((p.state === 'pd-in' || p.state === 'pd-out') && Math.abs(p.x - s.x) < 0.1 && Math.abs(p.z - s.z) < 0.1) return true
    // 지게차·리치트럭이 그 칸으로 가는 중이면 예약된 것으로 본다
    return this.equip.some((e) => e.task.includes(`${out ? tr('출고', 'Out') : tr('입고', 'In')} P&D ${pad(k + 1)}`))
  }

  // ───────────── 트럭과 연결: 하차하면 입고 레인에 파렛트가 생기고, 상차하면 출고 레인에서 빠진다

  /** 하차를 계속해도 되는가: 내려놓을 입고 레인 자리가 없으면 하차가 잠깐 멈춘다 */
  canUnload(dock: number) {
    return dock >= 0 && dock < 3 && this.pendingIn[dock] < 1
  }

  private loadWait = new Map<string, number>()
  private loadSeen = new Map<string, number>()
  /** 상차를 계속해도 되는가: 출고 레인에 파렛트가 있어야 한다. 30초 넘게 없으면 롤테이너를 바로 싣는다(멈추지 않게) */
  canLoad(v: Vehicle, dt: number) {
    const dock = v.res
    if (dock < 0 || dock > 2) return true
    // 이번 상차가 처음 불렸으면(지난 방문 뒤 1초 넘게 안 불림) 기다린 시간을 새로 센다
    const now = this.sim.elapsed
    if (now - (this.loadSeen.get(v.id) ?? -Infinity) > 1) this.loadWait.set(v.id, 0)
    this.loadSeen.set(v.id, now)
    if (this.laneOf(dock, true).length) {
      this.loadWait.set(v.id, 0)
      return true
    }
    const w = (this.loadWait.get(v.id) ?? 0) + dt
    this.loadWait.set(v.id, w)
    return w > 30
  }

  private stepTrucks() {
    const perPallet = 200
    this.sim.djDocks.forEach((d, dock) => {
      const v = d.vehicle ? this.sim.vehicle(d.vehicle) : null
      if (!v || v.site !== 'DJ') return
      const prev = this.lastCargo.get(v.id)
      const cur = { phase: v.phase, cargo: v.cargoDone }
      this.lastCargo.set(v.id, cur)
      if (!prev || prev.phase !== v.phase) return
      if (v.phase === 'unloading') {
        const before = Math.floor(prev.cargo / perPallet)
        const after = Math.floor(v.cargoDone / perPallet)
        if (after < before) this.pendingIn[dock] += before - after
      } else if (v.phase === 'loading') {
        const before = Math.floor(prev.cargo / perPallet)
        const after = Math.floor(v.cargoDone / perPallet)
        for (let n = 0; n < after - before; n++) {
          const lane = this.laneOf(dock, true).sort((a, b) => b.z - a.z)
          const p = lane[0]
          if (p) {
            p.state = 'gone'
            this.stats.shipped++
            const w = this.people.find((x) => x.id === `dw-${dock + 1}`)!
            w.done++
          } else {
            // 출고 파렛트가 제때 못 나와 롤테이너를 바로 실음: 재고는 다른 통로에서 직접 반출된 것으로 친다(재고가 쌓이기만 하지 않게)
            this.stats.direct++
            const li = this.occupiedLoc(Math.floor(R() * RACK.aisles))
            if (li >= 0) {
              const L = this.locs[li]
              const q = this.pallets.get(L.pallet!)
              if (q) q.state = 'gone'
              L.pallet = null
            }
          }
        }
      }
    })
    // 하차한 파렛트를 입고 레인에 내려놓는다(자리가 날 때마다)
    this.pendingIn.forEach((n, dock) => {
      if (n <= 0) return
      const z = this.freeLanePos(dock, false)
      if (z === undefined) return
      const p = this.newPallet('lane-in', this.laneX(dock, false), 0.1, z)
      p.dock = dock
      p.note = R() < 0.35 ? pick(NOTES) : ''
      this.pendingIn[dock]--
      this.stats.received++
      const w = this.people.find((x) => x.id === `dw-${dock + 1}`)!
      w.done++
    })
  }

  // ───────────── 입고 검수(검수원이 파렛트로 걸어가 스캔, 메모가 있으면 AI 또는 규칙으로 판단)
  // 검수원 두 명: qc-1은 대전 1·2 도크, qc-2는 대전 3 도크 레인을 맡는다

  private inspectors = [
    { id: 'qc-1', docks: [0, 1], target: null as string | null, t: 0 },
    { id: 'qc-2', docks: [2], target: null as string | null, t: 0 },
  ]

  private stepQc(dt: number) {
    for (const ins of this.inspectors) {
      const info = this.people.find((x) => x.id === ins.id)!
      const mover = this.sim.life.movers.find((m) => m.id === ins.id)
      if (!mover) continue
      if (!ins.target) {
        let next: WhPallet | undefined
        for (const p of this.pallets.values()) if (p.state === 'lane-in' && p.qc === 'wait' && ins.docks.includes(p.dock) && (!next || p.z < next.z)) next = p
        if (next) {
          ins.target = next.id
          info.doing = tr(`${next.id} 파렛트로 이동`, `Walking to pallet ${next.id}`)
        } else {
          info.doing = tr('스캔 대기', 'Waiting to scan')
          mover.moving = false
          continue
        }
      }
      const p = this.pallets.get(ins.target!)
      if (!p || p.state !== 'lane-in') {
        ins.target = null
        continue
      }
      // 레인 옆(서쪽 1.05m)에 서서 스캔. 다른 열로 갈 때는 벽 쪽 동선(z −33.1)으로 나와서 옆으로 간다
      const tx = p.x - 1.05
      const tz = p.z
      if (p.qc === 'wait') {
        const atX = Math.abs(mover.x - tx) < 0.05
        const onLine = Math.abs(mover.z - WH.qcZ) < 0.05
        const target = atX ? { x: tx, z: tz } : onLine ? { x: tx, z: WH.qcZ } : { x: mover.x, z: WH.qcZ }
        if (this.walk(mover, target.x, target.z, dt) && atX && Math.abs(mover.z - tz) < 0.06) {
          p.qc = 'scanning'
          ins.t = 2
          info.doing = tr(`${p.id} 스캔 중`, `Scanning ${p.id}`)
          mover.heading = Math.PI / 2
        }
      } else if (p.qc === 'scanning') {
        mover.moving = false
        ins.t -= dt
        if (ins.t <= 0) {
          this.stats.inspected++
          info.done++
          if (!p.note) {
            p.qc = 'ok'
            p.decision = tr('이상 없음 → 적치', 'No issues → put-away')
            ins.target = null
          } else {
            p.qc = 'reading'
            info.doing = tr(`${p.id} 검수 메모 판독`, `Reading QC note on ${p.id}`)
            if (this.onQc) this.onQc(p)
            else this.resolveQc(p, null)
            ins.target = null
          }
        }
      } else ins.target = null
    }
  }

  /** 검수 결과 적용(정책은 코드) */
  resolveQc(p: WhPallet, a: QcAnswer | null) {
    // 이미 처리된 파렛트(AI를 끄며 규칙으로 처리한 뒤 늦게 온 판독 등)는 다시 적용하지 않는다
    if (p.qc !== 'reading') return
    const ans = a ?? ruleQc(p.note)
    p.ai = a
    p.by = a ? 'ai' : 'rule'
    if (a) this.stats.ai++
    if (ans.unsafe > 0.6) {
      p.qc = 'hold'
      p.holdT = 22
      p.decision = tr('들기 위험 → 재작업(파렛트 교체·재적재) 후 적치', 'Unsafe to lift → rework (new pallet · restack), then put-away')
    } else if (ans.damaged > 0.6) {
      p.qc = 'hold'
      p.holdT = 16
      p.decision = tr('파손 → 사진 촬영·화주 클레임 등록 후 보류 해제', 'Damaged → photos · shipper claim filed, then hold released')
    } else if (ans.mismatch > 0.6) {
      p.qc = 'hold'
      p.holdT = 10
      p.decision = tr('수량 불일치 → 재검수(다시 세기)', 'Quantity mismatch → re-inspect (recount)')
    } else if (ans.label > 0.6) {
      p.qc = 'hold'
      p.holdT = 6
      p.decision = tr('라벨 불량 → 라벨 재부착', 'Bad label → relabel')
    } else {
      p.qc = 'ok'
      p.decision = tr('메모 확인 · 이상 없음 → 적치', 'Note checked · no issues → put-away')
    }
    if (p.qc === 'hold') this.stats.holds++
  }

  private walk(m: { x: number; z: number; heading: number; moving: boolean; walkPhase: number }, x: number, z: number, dt: number) {
    const dx = x - m.x
    const dz = z - m.z
    const d = Math.hypot(dx, dz)
    const sp = 1.3 * dt
    if (d <= sp) {
      m.x = x
      m.z = z
      m.moving = false
      return true
    }
    m.x += (dx / d) * sp
    m.z += (dz / d) * sp
    m.heading = Math.atan2(dx, dz)
    m.moving = true
    m.walkPhase += dt * 4.2
    return false
  }

  // ───────────── 장비 작업 계획

  private planFl(e: WhEquip) {
    const dock = e.dock
    // 1) 출고: 이 도크 구간 P&D 출고 칸에 나온 파렛트를 출고 레인으로
    const outLaneZ = this.freeLanePos(dock, true)
    if (outLaneZ !== undefined) {
      for (const k of e.aisles) {
        const s = this.outSlot(k)
        const p = this.findPallet((q) => q.state === 'pd-out' && Math.abs(q.x - s.x) < 0.1)
        if (!p) continue
        const lx = this.laneX(dock, true)
        e.task = tr(`출고 P&D ${pad(k + 1)} → 출고 레인`, `Out P&D ${pad(k + 1)} → outbound lane`)
        e.acts.push(
          { k: 'move', pts: [{ x: e.x, z: WH.flZ }, { x: s.x, z: WH.flZ }], speed: 2.4 },
          { k: 'turn', h: Math.PI },
          { k: 'move', pts: [{ x: s.x, z: s.z + 1.6 }], speed: 1.0 },
          { k: 'do', fn: () => { p.state = 'fl'; e.carrying = p.id } },
          { k: 'lift', y: 0.4 },
          { k: 'move', pts: [{ x: s.x, z: WH.flZ }], speed: 1.0, rev: true },
          { k: 'move', pts: [{ x: lx, z: WH.flZ }], speed: 2.4 },
          { k: 'turn', h: 0 },
          { k: 'move', pts: [{ x: lx, z: outLaneZ - 1.6 }], speed: 1.0 },
          { k: 'lift', y: 0.12 },
          { k: 'do', fn: () => { p.state = 'lane-out'; p.dock = dock; p.x = lx; p.z = outLaneZ; p.y = 0.1; p.t = this.sim.elapsed; e.carrying = null; e.moves++ } },
          { k: 'move', pts: [{ x: lx, z: WH.flZ }], speed: 1.0, rev: true },
        )
        return
      }
    }
    // 2) 입고: 검수 끝난 입고 레인 파렛트(지게차 쪽 맨 앞부터)를 빈 랙 위치가 있는 통로의 P&D 입고 칸으로
    const lane = this.laneOf(dock, false).sort((a, b) => a.z - b.z)
    const front = lane[0]
    if (front && front.qc === 'ok') {
      const k = this.chooseAisle(e.aisles)
      if (k >= 0) {
        const locIdx = this.freeLoc(k)
        if (locIdx >= 0) {
          this.locs[locIdx].reserved = true
          front.loc = locIdx
          const s = this.inSlot(k)
          const lx = front.x
          e.task = tr(`입고 레인 → 입고 P&D ${pad(k + 1)}`, `Inbound lane → In P&D ${pad(k + 1)}`)
          e.acts.push(
            { k: 'move', pts: [{ x: e.x, z: WH.flZ }, { x: lx, z: WH.flZ }], speed: 2.4 },
            { k: 'turn', h: 0 },
            { k: 'move', pts: [{ x: lx, z: front.z - 1.6 }], speed: 1.0 },
            { k: 'do', fn: () => { front.state = 'fl'; e.carrying = front.id } },
            { k: 'lift', y: 0.4 },
            { k: 'move', pts: [{ x: lx, z: WH.flZ }], speed: 1.0, rev: true },
            { k: 'move', pts: [{ x: s.x, z: WH.flZ }], speed: 2.4 },
            { k: 'turn', h: Math.PI },
            { k: 'move', pts: [{ x: s.x, z: s.z + 1.6 }], speed: 1.0 },
            { k: 'lift', y: 0.12 },
            { k: 'do', fn: () => { front.state = 'pd-in'; front.x = s.x; front.z = s.z; front.y = 0.1; e.carrying = null; e.moves++ } },
            { k: 'move', pts: [{ x: s.x, z: WH.flZ }], speed: 1.0, rev: true },
          )
          return
        }
      }
    }
    // 3) 출고 레인이 비어 있으면 반출을 요청한다(보관률이 너무 낮으면 덜)
    const outLane = this.laneOf(dock, true).length
    const occ = this.occupancy
    if (outLane + this.outReq.filter((k) => this.dockOfAisle(k) === dock).length < 3 && occ > 0.45) {
      const k = pick(e.aisles)
      if (this.occupiedLoc(k) >= 0) this.outReq.push(k)
    }
    e.task = IDLE
    if (Math.abs(e.x - e.homeX) > 0.5) e.acts.push({ k: 'move', pts: [{ x: e.x, z: WH.flZ }, { x: e.homeX, z: WH.flZ }], speed: 2.0 })
    else e.acts.push({ k: 'wait', t: 1 })
  }

  private chooseAisle(aisles: number[]) {
    const free = aisles.filter((k) => !this.slotBusy(k, false) && this.freeLoc(k) >= 0)
    if (!free.length) return -1
    // 빈 칸이 많은 통로 우선
    return free.reduce((a, b) => (this.countFree(b) > this.countFree(a) ? b : a))
  }

  private countFree(k: number) {
    return this.locs.filter((l) => l.k === k && !l.pallet && !l.reserved).length
  }

  private freeLoc(k: number) {
    // 낮은 단 · 앞쪽 베이부터(작업 시간이 짧다)
    let best = -1
    let score = Infinity
    this.locs.forEach((L, i) => {
      if (L.k !== k || L.pallet || L.reserved) return
      const s = L.l * 3 + L.j + R() * 2
      if (s < score) {
        score = s
        best = i
      }
    })
    return best
  }

  private occupiedLoc(k: number) {
    const cands = this.locs.map((L, i) => ({ L, i })).filter(({ L }) => L.k === k && L.pallet && !L.reserved)
    if (!cands.length) return -1
    return pick(cands).i
  }

  private planRt(e: WhEquip) {
    // 1) 맡은 통로의 P&D 입고 칸 파렛트를 적치
    for (const k of e.aisles) {
      const s = this.inSlot(k)
      const p = this.findPallet((q) => q.state === 'pd-in' && Math.abs(q.x - s.x) < 0.1)
      if (!p || p.loc < 0) continue
      const L = this.locs[p.loc]
      e.task = tr(`적치 → ${L.code}`, `Put-away → ${L.code}`)
      this.rtCycle(e, k, s, L, () => {
        p.state = 'rt'
        e.carrying = p.id
      }, () => {
        p.state = 'rack'
        p.x = locX(L.k, L.side)
        p.y = levelY(L.l)
        p.z = bayZ(L.j)
        L.pallet = p.id
        L.reserved = false
        e.carrying = null
        e.moves++
        this.stats.putaway++
      }, false)
      return
    }
    // 2) 반출 요청(맡은 통로, 출고 P&D 칸이 비었을 때)
    const ri = this.outReq.findIndex((k) => e.aisles.includes(k) && !this.slotBusy(k, true))
    if (ri >= 0) {
      const k = this.outReq.splice(ri, 1)[0]
      const li = this.occupiedLoc(k)
      if (li >= 0) {
        const L = this.locs[li]
        const p = this.pallets.get(L.pallet!)!
        L.reserved = true
        const s = this.outSlot(k)
        e.task = tr(`반출 ${L.code} → 출고 P&D ${pad(k + 1)}`, `Retrieve ${L.code} → Out P&D ${pad(k + 1)}`)
        this.rtCycle(e, k, s, L, null, null, true, () => {
          p.state = 'rt'
          e.carrying = p.id
          L.pallet = null
          L.reserved = false
        }, () => {
          p.state = 'pd-out'
          p.x = s.x
          p.z = s.z
          p.y = 0.1
          p.loc = -1
          e.carrying = null
          e.moves++
          this.stats.retrieved++
        })
        return
      }
    }
    e.task = IDLE
    if (Math.abs(e.x - e.homeX) > 0.5 || Math.abs(e.z - WH.rtZ) > 0.2) e.acts.push({ k: 'move', pts: [{ x: e.x, z: WH.rtZ }, { x: e.homeX, z: WH.rtZ }], speed: 2.0 })
    else e.acts.push({ k: 'wait', t: 1 })
  }

  /**
   * 리치트럭 한 번 왕복. 적치: P&D에서 들고 → 통로 → 위치 앞에서 옆으로 돌아 → 들어 올려 → 뻗어 놓고 → 내림 → 나옴.
   * 반출: 통로 → 위치에서 꺼내 → 나와서 P&D 출고 칸에 놓음
   */
  private rtCycle(e: WhEquip, k: number, slot: { x: number; z: number }, L: Loc, take: (() => void) | null, put: (() => void) | null, out: boolean, take2?: () => void, put2?: () => void) {
    const ax = aisleX(k)
    const lz = bayZ(L.j)
    const sideH = L.side ? Math.PI / 2 : -Math.PI / 2
    const toSlot: Act[] = [
      { k: 'move', pts: [{ x: e.x, z: WH.rtZ }, { x: slot.x, z: WH.rtZ }], speed: 2.2 },
      { k: 'turn', h: 0 },
      { k: 'reach', v: 1 },
    ]
    const intoAisle: Act[] = [
      { k: 'move', pts: [{ x: ax, z: WH.rtZ }, { x: ax, z: lz }], speed: 1.8, rev: true },
      { k: 'turn', h: sideH },
      { k: 'lift', y: levelY(L.l) + 0.2 },
      { k: 'reach', v: 1 },
    ]
    const outAisle: Act[] = [
      { k: 'reach', v: 0 },
      { k: 'lift', y: 0.3 },
      { k: 'turn', h: 0 },
      { k: 'move', pts: [{ x: ax, z: WH.rtZ }], speed: 1.8 },
    ]
    if (!out) {
      e.acts.push(
        ...toSlot,
        { k: 'do', fn: take! },
        { k: 'reach', v: 0 },
        { k: 'lift', y: 0.3 },
        { k: 'move', pts: [{ x: ax, z: WH.rtZ }], speed: 1.6 },
        ...intoAisle,
        { k: 'lift', y: levelY(L.l) + 0.05 },
        { k: 'do', fn: put! },
        ...outAisle,
      )
    } else {
      e.acts.push(
        { k: 'move', pts: [{ x: e.x, z: WH.rtZ }, { x: ax, z: WH.rtZ }], speed: 2.2 },
        ...intoAisle.slice(0, 1),
        { k: 'turn', h: sideH },
        { k: 'lift', y: levelY(L.l) + 0.05 },
        { k: 'reach', v: 1 },
        { k: 'lift', y: levelY(L.l) + 0.2 },
        { k: 'do', fn: take2! },
        ...outAisle,
        { k: 'move', pts: [{ x: slot.x, z: WH.rtZ }], speed: 1.6 },
        { k: 'turn', h: 0 },
        { k: 'lift', y: 0.12 },
        { k: 'reach', v: 1 },
        { k: 'do', fn: put2! },
        { k: 'reach', v: 0 },
      )
    }
  }

  private runActs(e: WhEquip, dt: number) {
    const a = e.acts[0]
    if (!a) return
    e.kmh = 0
    switch (a.k) {
      case 'move': {
        const t = a.pts[0]
        if (!t) {
          e.acts.shift()
          return
        }
        const dx = t.x - e.x
        const dz = t.z - e.z
        const d = Math.hypot(dx, dz)
        const sp = a.speed * dt
        if (d > 0.02) {
          const h = Math.atan2(dx, dz) + (a.rev ? Math.PI : 0)
          // 진행 방향으로 먼저 돈다(제자리 회전)
          const diff = ((h - e.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI
          if (Math.abs(diff) > 0.05) {
            e.heading += Math.sign(diff) * Math.min(Math.abs(diff), dt * 2.4)
            return
          }
          e.heading = h
        }
        if (d <= sp) {
          e.x = t.x
          e.z = t.z
          e.dist += d
          a.pts.shift()
          if (!a.pts.length) e.acts.shift()
        } else {
          e.x += (dx / d) * sp
          e.z += (dz / d) * sp
          e.dist += sp
          e.kmh = a.speed * 3.6
        }
        break
      }
      case 'turn': {
        const diff = ((a.h - e.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI
        if (Math.abs(diff) < 0.03) {
          e.heading = a.h
          e.acts.shift()
        } else e.heading += Math.sign(diff) * Math.min(Math.abs(diff), dt * 2.0)
        break
      }
      case 'lift': {
        const d = a.y - e.fork
        const sp = 1.2 * dt
        if (Math.abs(d) <= sp) {
          e.fork = a.y
          e.acts.shift()
        } else e.fork += Math.sign(d) * sp
        break
      }
      case 'reach': {
        const d = a.v - e.reach
        const sp = 1.6 * dt
        if (Math.abs(d) <= sp) {
          e.reach = a.v
          e.acts.shift()
        } else e.reach += Math.sign(d) * sp
        break
      }
      case 'wait':
        a.t -= dt
        if (a.t <= 0) e.acts.shift()
        break
      case 'do':
        e.acts.shift()
        a.fn()
        break
    }
    // 실은 파렛트는 포크 앞에 붙어 다닌다
    if (e.carrying) {
      const p = this.pallets.get(e.carrying)
      if (p) {
        const f = e.kind === 'fl' ? 1.6 : 1.0 + e.reach * 1.1
        p.x = e.x + Math.sin(e.heading) * f
        p.z = e.z + Math.cos(e.heading) * f
        p.y = e.fork
      }
    }
    e.battery = Math.max(20, e.battery - dt * 0.004)
  }

  step(dt: number) {
    this.stepTrucks()
    this.stepQc(dt)
    // 보류 파렛트: 재작업·재검수가 끝나면 적치 가능
    for (const p of this.pallets.values()) {
      if (p.qc === 'hold') {
        p.holdT -= dt
        if (p.holdT <= 0) {
          p.qc = 'ok'
          p.decision += tr(' · 완료', ' · done')
        }
      }
      if (p.state === 'gone') this.pallets.delete(p.id)
    }
    for (const e of this.equip) {
      if (!e.acts.length) {
        if (e.kind === 'fl') this.planFl(e)
        else this.planRt(e)
      }
      this.runActs(e, dt)
    }
    // 도크 작업자: 하차·상차 중이면 문과 레인 사이를 오간다
    this.sim.djDocks.forEach((d, i) => {
      const m = this.sim.life.movers.find((x) => x.id === `dw-${i + 1}`)
      const w = this.people.find((x) => x.id === `dw-${i + 1}`)!
      if (!m) return
      const v = d.vehicle ? this.sim.vehicle(d.vehicle) : null
      const busy = v && v.site === 'DJ' && (v.phase === 'unloading' || v.phase === 'loading')
      const dx = DJ.docks[i]
      if (busy) {
        w.doing = v!.phase === 'unloading' ? tr(`${v!.id} 하차 · 입고 레인 정리`, `${v!.id} unloading · arranging inbound lane`) : tr(`${v!.id} 상차`, `${v!.id} loading`)
        const phase = (this.sim.elapsed * 0.35 + i) % 2
        // 하차는 입고 레인 서쪽(검수원보다 바깥), 상차는 출고 레인 동쪽에서 오간다
        const tx = dx + (v!.phase === 'unloading' ? -2.65 : 2.45)
        const tz = phase < 1 ? -32.9 : -36.2
        this.walk(m, tx, tz, dt)
      } else {
        w.doing = IDLE
        this.walk(m, dx - 2.6, -33.0, dt)
      }
    })
  }

  // ───────────── 화면용 요약

  summary() {
    const ps = [...this.pallets.values()]
    return {
      stored: this.locs.filter((l) => l.pallet).length,
      locations: this.locs.length,
      laneIn: ps.filter((p) => p.state === 'lane-in').length,
      qcWait: ps.filter((p) => p.state === 'lane-in' && (p.qc === 'wait' || p.qc === 'scanning' || p.qc === 'reading')).length,
      hold: ps.filter((p) => p.qc === 'hold').length,
      pd: ps.filter((p) => p.state === 'pd-in' || p.state === 'pd-out').length,
      laneOut: ps.filter((p) => p.state === 'lane-out').length,
      rtBusy: this.equip.filter((e) => e.kind === 'reach' && e.task !== IDLE).length,
      flBusy: this.equip.filter((e) => e.kind === 'fl' && e.task !== IDLE).length,
      pending: this.pendingIn.reduce((a, b) => a + b, 0),
    }
  }

  /** 사람 근무 처리량(시간당): 시계 기준 */
  rate(done: number) {
    const h = (this.sim.elapsed * SPEEDUP) / 3600
    return h > 0.05 ? Math.round(done / h) : 0
  }

  equipById(id: string) {
    return this.equip.find((e) => e.id === id)
  }

  /** 검수원·도크 작업자를 거리의 사람들(LifeSim)에 걸어 다니는 사람으로 붙인다(움직임은 여기서 정한다) */
  attachPeople() {
    const life = this.sim.life
    life.addScripted('qc-1', tr('입고 검수원', 'Inbound inspector'), DJ.docks[0] - 1.9, WH.qcZ, { top: '#2F55E6', vest: true, helmet: '#FFFFFF' })
    life.addScripted('qc-2', tr('입고 검수원', 'Inbound inspector'), DJ.docks[2] - 1.9, WH.qcZ, { top: '#2F55E6', vest: true, helmet: '#FFFFFF' })
    DJ.docks.forEach((dx, i) => life.addScripted(`dw-${i + 1}`, tr('도크 작업자', 'Dock worker'), dx - 2.6, -33.0, { top: '#FF8A1F', vest: true, helmet: '#F2B92B' }))
  }

  /** 위치 코드 → 파렛트 */
  palletAt(code: string) {
    const L = this.locs.find((l) => l.code === code)
    return L?.pallet ? this.pallets.get(L.pallet) ?? null : null
  }
}

export type { Vehicle }
