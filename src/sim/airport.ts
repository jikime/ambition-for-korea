// 인천공항 화물터미널(AP): 화물기 착륙 → 유도로 → 주기장(ULD 하역·적재) → 푸시백 → 이륙.
// 수출 화물은 트럭으로 곤지암 허브에서 들어오고, 미신고 위험물은 AI가 신고 문구로 먼저 걸러 낸다.
import { Path, Route, leg, v2, type Leg } from './path'
import { GATES } from './world'
import { BOX } from './layout'
import { mulberry32 } from './data'
import { AIR_POOL } from './texts'
import type { ManifestFlags } from './port'
import { ai } from './ai'
import { L } from '../i18n'

export const AP = {
  site: { x0: -1180, x1: -640, z0: -330, z1: 30 },
  runway: { x0: -1160, x1: -660, z: -275, w: 42 },
  taxiZ: -205,
  links: [-1120, -905, -705],
  apron: { x0: -1015, x1: -770, z0: -180, z1: -88 },
  stands: [{ x: -955, z: -125 }, { x: -845, z: -125 }],
  terminal: { x0: -1010, x1: -790, z0: -84, z1: -32, h: 13 },
  landIn: -14,
  landOut: -8,
  docks: [-990, -965, -940, -915],
  gateX: -700,
  tower: { x: -1118, z: -128 },
  touchdownX: -1110,
}

/** 육측 트럭 도크(터미널 남쪽 벽에 후진 접안) */
export const AP_DOCK_Z = AP.terminal.z1 + BOX.len / 2 + 0.25
const SITE = { speed: 5, kmh: 18, r: 6 }
const REV = { reverse: true, speed: 1.9, kmh: 5 }

export function apInLegs(dock: number): Leg[] {
  const g = GATES.AP
  const dx = AP.docks[dock]
  return [
    leg([v2(g.inX, g.stopZ), v2(g.inX, AP.landIn), v2(dx - 13, AP.landIn)], { ...SITE, tag: 'inbound' }),
    leg([v2(dx - 13, AP.landIn), v2(dx, AP.landIn), v2(dx, AP_DOCK_Z)], { ...REV, r: 7, tag: 'docking' }),
  ]
}

export function apOutLegs(dock: number): Leg[] {
  const g = GATES.AP
  const dx = AP.docks[dock]
  return [leg([v2(dx, AP_DOCK_Z), v2(dx, AP.landOut), v2(g.outX, AP.landOut), v2(g.outX, g.exitZ)], { ...SITE, r: 6, tag: 'exit-site' })]
}

export const AC_LEN = 56
export const AC_SPAN = 54
/** 왼쪽(기수 기준) 후방 화물문: x·z는 기체 기준, y는 문 앞 ULD 중심의 지면 높이 */
export const DOOR = { x: 3.1, y: 4.8, z: -14 }
/** 지상에 섰을 때 동체 중심 높이(착륙장치 길이) */
export const AC_GROUND_Y = 6.2

export type AcPhase = 'away' | 'approach' | 'rollout' | 'taxiIn' | 'parked' | 'pushback' | 'taxiOut' | 'hold' | 'lineup' | 'takeoff' | 'climb'

export interface Aircraft {
  id: string
  flight: string
  airline: 'daon' | 'hanbit'
  type: '747-8F' | '777F'
  route: string
  x: number
  y: number
  z: number
  heading: number
  pitch: number
  speed: number
  gear: number
  door: number
  phase: AcPhase
  t: number
  stand: number
  path: Route | null
  onboard: number
  /** 이번 편 탑재 톤수 */
  tons: number
}

export interface Uld {
  id: number
  kind: 'AKE' | 'PMC' | 'RKN'
  color: string
  x: number
  y: number
  z: number
  heading: number
  vis: boolean
}

interface Step {
  dur: number
  start?: () => void
  tick?: (k: number) => void
  end?: () => void
  /** 조건이 될 때까지 기다린다(dur 무시) */
  until?: () => boolean
}

export interface StandOps {
  k: number
  ac: number
  lift: number
  steps: Step[]
  cur: Step | null
  t: number
  /** 견인차 열차가 루프에서 간 거리 */
  tugD: number
  tugMoving: boolean
  dolly: (Uld | null)[]
  /** 주기장에 와 있는 마셜러(유도원) 표시 */
  marshal: boolean
  label: string
}

export interface AirShipment {
  id: number
  awb: string
  declared: string
  description: string
  shipper: string
  dest: string
  flags: ManifestFlags | null
  status: 'pending' | 'ready' | 'error'
  sent: boolean
}

export interface AirLog {
  time: number
  awb: string
  declared: string
  description: string
  dest: string
  decision: string
  tone: 'blue' | 'amber' | 'red' | 'gray'
  flags: ManifestFlags | null
}

const TAXI = { speed: 9, kmh: 32, r: 18 }
const PUSH = { speed: 3.2, kmh: 11, r: 14, reverse: true }

/** 견인차 루프(주기장 왼쪽 → 터미널 문 → 동쪽으로 돌아 복귀) */
function tugLoop(sx: number) {
  return new Path([v2(sx + 10, -150), v2(sx + 10, -88), v2(sx + 46, -88), v2(sx + 46, -150), v2(sx + 10, -150)], 5)
}
const TUG_LOADER = 19
const TUG_DOOR = 58
const DOLLY_GAP = 3.4

export class AirportSim {
  aircraft: Aircraft[]
  ulds: Uld[] = []
  stands: StandOps[]
  loops: Path[]
  shipments: AirShipment[] = []
  log: AirLog[] = []
  stats = { landed: 0, departed: 0, uldIn: 0, uldOut: 0, tons: 0, screened: 0, held: 0, cold: 0, xray: 0 }
  runwayBusy: string | null = null
  onScreen: ((s: AirShipment) => void) | null = null
  /** 수출 ULD를 만들 때(주기장 k): 항공 여정이 자기 화물을 실을 ULD를 고른다 */
  onExportUld: ((u: Uld, k: number) => void) | null = null
  clock: () => number = () => 0
  private seq = 1
  private shipSeq = 1
  private r = mulberry32(737)

  constructor() {
    this.loops = AP.stands.map((s) => tugLoop(s.x))
    this.stands = AP.stands.map((_, k) => ({ k, ac: -1, lift: 0.9, steps: [], cur: null, t: 0, tugD: TUG_DOOR, tugMoving: false, dolly: [null, null, null], marshal: false, label: L('비어 있음', 'Empty') }))
    this.aircraft = [
      this.makeAc('ac-0', 'NA8401', 'daon', '747-8F', L('인천 → 앵커리지 → 로스앤젤레스', 'Incheon → Anchorage → Los Angeles')),
      this.makeAc('ac-1', 'HB2731', 'hanbit', '777F', L('인천 → 프랑크푸르트', 'Incheon → Frankfurt')),
    ]
    // 시작부터 한 대는 주기장에서 작업 중, 한 대는 착륙 접근 중
    const a = this.aircraft[0]
    this.parkAt(a, 0)
    a.onboard = 6
    this.beginTurnaround(0)
    const b = this.aircraft[1]
    this.startApproach(b)
    b.x = -1600
    this.placeAir(b)
    this.runwayBusy = b.id
  }

  private makeAc(id: string, flight: string, airline: Aircraft['airline'], type: Aircraft['type'], route: string): Aircraft {
    return { id, flight, airline, type, route, x: -2000, y: 120, z: AP.runway.z, heading: Math.PI / 2, pitch: 0, speed: 0, gear: 1, door: 0, phase: 'away', t: 30, stand: -1, path: null, onboard: 0, tons: 0 }
  }

  private newUld(): Uld {
    const r = this.r()
    const kind: Uld['kind'] = r < 0.55 ? 'AKE' : r < 0.85 ? 'PMC' : 'RKN'
    const colors = ['#C9CED8', '#B8BFCC', '#D6DAE2']
    return { id: this.seq++, kind, color: kind === 'PMC' ? ['#D7A86E', '#E2BC88', '#B9CBF2', '#F1F3F8'][Math.floor(this.r() * 4)] : colors[Math.floor(this.r() * 3)], x: 0, y: -10, z: 0, heading: 0, vis: false }
  }

  // ───────────────────────── 항공기

  private parkAt(a: Aircraft, k: number) {
    const s = AP.stands[k]
    a.phase = 'parked'
    a.stand = k
    a.x = s.x
    a.z = s.z
    a.y = 0
    a.heading = 0
    a.speed = 0
    a.gear = 1
    a.pitch = 0
    this.stands[k].ac = this.aircraft.indexOf(a)
  }

  private startApproach(a: Aircraft) {
    a.phase = 'approach'
    a.x = -1900
    a.z = AP.runway.z
    a.heading = Math.PI / 2
    a.speed = 45
    a.gear = 1
    a.door = 0
    a.onboard = 6
    a.tons = Math.round(60 + this.r() * 40)
    this.placeAir(a)
  }

  private placeAir(a: Aircraft) {
    const d = AP.touchdownX - a.x
    a.y = Math.max(0, d * 0.13)
    a.pitch = a.y > 0.5 ? 0.05 : 0.03
  }

  private freeStand() {
    return this.stands.findIndex((s) => s.ac < 0)
  }

  step(dt: number) {
    this.aircraft.forEach((a) => this.stepAc(a, dt))
    this.stands.forEach((s) => this.stepStand(s, dt))
  }

  private stepAc(a: Aircraft, dt: number) {
    a.t -= dt
    const R = AP.runway
    switch (a.phase) {
      case 'away':
        // 활주로가 비어 있고 주기장이 남아야 접근을 시작한다
        if (a.t <= 0 && !this.runwayBusy && this.freeStand() >= 0) {
          this.startApproach(a)
          this.runwayBusy = a.id
        }
        break
      case 'approach':
        a.x += a.speed * dt
        this.placeAir(a)
        if (a.x >= AP.touchdownX) {
          a.phase = 'rollout'
          a.y = 0
          a.pitch = 0.02
          this.stats.landed++
        }
        break
      case 'rollout': {
        a.speed = Math.max(10, a.speed - 2.6 * dt)
        a.x += a.speed * dt
        a.pitch = Math.max(0, a.pitch - dt * 0.03)
        if (a.x >= AP.links[2] - 30) {
          const k = this.freeStand()
          const sx = AP.stands[Math.max(0, k)].x
          a.stand = k
          if (k >= 0) {
            this.stands[k].ac = this.aircraft.indexOf(a)
            this.stands[k].marshal = true
            this.stands[k].label = L(`${a.flight} 진입 중`, `${a.flight} taxiing in`)
          }
          a.phase = 'taxiIn'
          a.path = new Route([leg([v2(a.x, R.z), v2(AP.links[2], R.z), v2(AP.links[2], AP.taxiZ), v2(sx, AP.taxiZ), v2(sx, AP.stands[0].z)], TAXI)])
          a.path.vel = a.speed
        }
        break
      }
      case 'taxiIn':
      case 'taxiOut':
      case 'lineup':
      case 'pushback': {
        const rt = a.path!
        rt.step(dt)
        const p = rt.pose()
        a.x = p.x
        a.z = p.z
        a.heading = p.heading
        a.speed = rt.vel
        // 활주로를 벗어나면 다른 비행기가 쓸 수 있다
        if (a.phase === 'taxiIn' && this.runwayBusy === a.id && a.z > R.z + 30) this.runwayBusy = null
        if (!rt.done) break
        a.path = null
        if (a.phase === 'taxiIn') {
          a.phase = 'parked'
          a.speed = 0
          this.beginTurnaround(a.stand)
        } else if (a.phase === 'pushback') {
          const s = this.stands[a.stand]
          if (s) {
            s.ac = -1
            s.label = L('비어 있음', 'Empty')
          }
          a.stand = -1
          // 활주로 진입 전 대기점(유도로 끝)까지
          a.phase = 'taxiOut'
          a.path = new Route([leg([v2(a.x, a.z), v2(AP.links[0], AP.taxiZ), v2(AP.links[0], R.z + 36)], TAXI)])
        } else if (a.phase === 'taxiOut') {
          a.phase = 'hold'
        } else {
          a.phase = 'takeoff'
          a.speed = 3
        }
        break
      }
      case 'hold':
        a.speed = 0
        // 관제탑 허가: 활주로가 비면 진입
        if (!this.runwayBusy || this.runwayBusy === a.id) {
          this.runwayBusy = a.id
          a.phase = 'lineup'
          a.path = new Route([leg([v2(a.x, a.z), v2(AP.links[0], R.z), v2(AP.links[0] + 30, R.z)], { ...TAXI, speed: 6, r: 14 })])
        }
        break
      case 'takeoff':
        a.heading = Math.PI / 2
        a.z = R.z
        a.speed += 3.2 * dt
        a.x += a.speed * dt
        if (a.speed > 38) {
          a.phase = 'climb'
          this.stats.departed++
          this.stats.tons += a.tons
        }
        break
      case 'climb':
        a.speed = Math.min(70, a.speed + 2 * dt)
        a.x += a.speed * dt
        a.y += a.speed * 0.22 * dt
        a.pitch = Math.min(0.2, a.pitch + dt * 0.12)
        a.gear = Math.max(0, a.gear - dt * 0.35)
        if (a.x > R.x1 + 80 && this.runwayBusy === a.id) this.runwayBusy = null
        if (a.y > 260) {
          a.phase = 'away'
          a.t = 50 + this.r() * 40
          a.y = 300
        }
        break
      case 'parked':
        break
    }
  }

  /** 푸시백: 견인차가 꼬리 쪽(북쪽)으로 밀고, 동쪽으로 꺾어 기수를 서쪽으로 돌린다 */
  private pushback(a: Aircraft) {
    a.phase = 'pushback'
    const s = AP.stands[a.stand]
    a.path = new Route([leg([v2(s.x, s.z), v2(s.x, AP.taxiZ + 6), v2(s.x + 40, AP.taxiZ)], PUSH)])
    this.stands[a.stand].label = L(`${a.flight} 푸시백`, `${a.flight} pushback`)
  }

  // ───────────────────────── 주기장 작업(ULD 하역·적재)

  doorWorld(k: number) {
    const s = AP.stands[k]
    return { x: s.x + DOOR.x, y: DOOR.y, z: s.z + DOOR.z }
  }

  loaderPos(k: number) {
    const s = AP.stands[k]
    return { x: s.x + 6.4, z: s.z + DOOR.z }
  }

  /** 견인차·돌리 위치(루프 거리 d) */
  trainPose(k: number, d: number) {
    const p = this.loops[k]
    const L = p.length
    const q = p.at(((d % L) + L) % L)
    return { x: q.x, z: q.z, heading: Math.atan2(q.tx, q.tz) }
  }

  dollyPose(k: number, i: number) {
    return this.trainPose(k, this.stands[k].tugD - 4 - i * DOLLY_GAP)
  }

  private beginTurnaround(k: number) {
    const s = this.stands[k]
    const a = this.aircraft[s.ac]
    if (!a) return
    s.marshal = false
    s.steps = []
    const push = (st: Step) => s.steps.push(st)
    const door = this.doorWorld(k)
    const lp = this.loaderPos(k)
    const deck = (lift: number) => ({ x: lp.x, y: lift + 0.95, z: lp.z })
    const move = (u: Uld, from: { x: number; y: number; z: number }, to: () => { x: number; y: number; z: number }, dur: number): Step => ({
      dur,
      start: () => { u.vis = true },
      tick: (t) => {
        const b = to()
        u.x = from.x + (b.x - from.x) * t
        u.y = from.y + (b.y - from.y) * t
        u.z = from.z + (b.z - from.z) * t
      },
    })
    const liftTo = (y: number, dur: number): Step => {
      let y0 = 0
      return { dur, start: () => { y0 = s.lift }, tick: (t) => { s.lift = y0 + (y - y0) * t } }
    }
    const trainTo = (target: number, label: string): Step => {
      let goal = 0
      return {
        dur: 0,
        start: () => {
          const L = this.loops[k].length
          goal = Math.floor(s.tugD / L) * L + target
          if (goal < s.tugD - 0.01) goal += L
          s.tugMoving = goal > s.tugD + 0.01
          s.label = label
        },
        until: () => s.tugD >= goal - 0.01,
        end: () => { s.tugD = goal; s.tugMoving = false },
      }
    }
    // 문 열기 · 로더 올리기
    push({ dur: 3, start: () => { s.label = L(`${a.flight} 도착 · 화물문 개방`, `${a.flight} arrived · cargo door opening`) }, tick: (t) => { a.door = t } })
    push(liftTo(DOOR.y - 0.95, 2.5))
    // 열차가 터미널 쪽에 있으면 로더 옆으로 온다
    push(trainTo(TUG_LOADER, L('돌리 열차 주기장으로', 'Dolly train to stand')))
    // 수입 ULD 6개: 3개씩 두 번
    for (let batch = 0; batch < 2; batch++) {
      for (let i = 0; i < 3; i++) {
        const u = this.newUld()
        this.ulds.push(u)
        push({ dur: 0.01, start: () => { s.label = L(`${a.flight} 하역 ${batch * 3 + i + 1}/6`, `${a.flight} unloading ${batch * 3 + i + 1}/6`); a.onboard = Math.max(0, a.onboard - 1); u.x = door.x - 1.5; u.y = door.y; u.z = door.z; u.vis = true } })
        push(move(u, { x: door.x - 1.5, y: door.y, z: door.z }, () => deck(s.lift), 1.4))
        push({ dur: 2.2, start: () => {}, tick: (t) => { s.lift = DOOR.y - 0.95 + (0.9 - (DOOR.y - 0.95)) * t; const d = deck(s.lift); u.y = d.y } })
        push(move(u, deck(0.9), () => { const p = this.dollyPose(k, i); return { x: p.x, y: 1.25, z: p.z } }, 1.4))
        push({ dur: 0.01, start: () => { s.dolly[i] = u } })
        push(liftTo(DOOR.y - 0.95, 1.8))
      }
      // 터미널로 가서 내려놓고(수입), 두 번째부터는 수출 ULD를 싣고 온다
      push(trainTo(TUG_DOOR, L('돌리 열차 터미널로', 'Dolly train to terminal')))
      push({
        dur: 1.6,
        end: () => {
          s.dolly.forEach((u) => { if (u) { u.vis = false; this.stats.uldIn++ } })
          s.dolly = [null, null, null]
          if (batch === 1) for (let i = 0; i < 3; i++) s.dolly[i] = this.newUld()
          s.dolly.forEach((u) => { if (u) { this.ulds.push(u); u.vis = true } })
          if (batch === 1) s.dolly.forEach((u) => { if (u) this.onExportUld?.(u, k) })
        },
      })
      push(trainTo(TUG_LOADER, batch === 1 ? L('수출 ULD 싣고 복귀', 'Returning with export ULDs') : L('빈 돌리 복귀', 'Empty dollies returning')))
    }
    // 수출 ULD 6개 적재
    for (let batch = 0; batch < 2; batch++) {
      for (let i = 0; i < 3; i++) {
        let u: Uld | null = null
        push(liftTo(0.9, 1.8))
        push({ dur: 0.01, start: () => { u = s.dolly[i]; s.dolly[i] = null; s.label = L(`${a.flight} 적재 ${batch * 3 + i + 1}/6`, `${a.flight} loading ${batch * 3 + i + 1}/6`) } })
        push({
          dur: 1.4,
          tick: (t) => {
            if (!u) return
            const p = this.dollyPose(k, i)
            const d = deck(s.lift)
            u.x = p.x + (d.x - p.x) * t
            u.y = 1.25 + (d.y - 1.25) * t
            u.z = p.z + (d.z - p.z) * t
          },
        })
        push({ dur: 2.2, tick: (t) => { s.lift = 0.9 + (DOOR.y - 0.95 - 0.9) * t; if (u) u.y = deck(s.lift).y } })
        push({
          dur: 1.4,
          tick: (t) => { if (u) { const d = deck(s.lift); u.x = d.x + (door.x - 1.5 - d.x) * t; u.z = d.z + (door.z - d.z) * t } },
          end: () => { if (u) { u.vis = false; this.stats.uldOut++; a.onboard++ } },
        })
      }
      if (batch === 0) {
        push(trainTo(TUG_DOOR, L('돌리 열차 수출 ULD 받으러', 'Dolly train fetching export ULDs')))
        push({
          dur: 1.6,
          end: () => {
            for (let i = 0; i < 3; i++) {
              const u = this.newUld()
              this.ulds.push(u)
              u.vis = true
              s.dolly[i] = u
              this.onExportUld?.(u, k)
            }
          },
        })
        push(trainTo(TUG_LOADER, L('수출 ULD 싣고 복귀', 'Returning with export ULDs')))
      }
    }
    // 문 닫고 출발 준비 → 견인차는 터미널 쪽으로 비켜 준다
    push(liftTo(0.9, 2))
    push({ dur: 3, start: () => { s.label = L(`${a.flight} 화물문 폐쇄 · 출발 준비`, `${a.flight} cargo door closing · preparing departure`) }, tick: (t) => { a.door = 1 - t } })
    push(trainTo(TUG_DOOR, L('돌리 열차 대기 위치로', 'Dolly train to holding spot')))
    push({ dur: 0.01, start: () => { this.pushback(a); this.ulds = this.ulds.filter((u) => u.vis) } })
  }

  private stepStand(s: StandOps, dt: number) {
    if (s.tugMoving) s.tugD += dt * 7
    // 돌리 위 ULD는 돌리를 따라간다
    s.dolly.forEach((u, i) => {
      if (!u) return
      const p = this.dollyPose(s.k, i)
      u.x = p.x
      u.y = 1.25
      u.z = p.z
      u.heading = p.heading
    })
    if (!s.cur) {
      s.cur = s.steps.shift() ?? null
      if (!s.cur) return
      s.t = 0
      s.cur.start?.()
    }
    const c = s.cur
    s.t += dt
    if (c.until) {
      if (!c.until()) return
    } else {
      c.tick?.(Math.min(1, s.t / Math.max(0.001, c.dur)))
      if (s.t < c.dur) return
    }
    c.end?.()
    s.cur = null
  }

  // ───────────────────────── 항공 수출 화물 검사(AI)

  /** 트럭이 터미널에 수출 화물을 내리면 신고 문구를 검사 큐에 넣는다 */
  receiveExports(n: number) {
    const made: AirShipment[] = []
    for (let i = 0; i < n; i++) {
      const p = AIR_POOL[Math.floor(this.r() * AIR_POOL.length)]
      const sh: AirShipment = { id: this.shipSeq++, awb: `180-${String(41000000 + Math.floor(this.r() * 8999999))}`, ...p, flags: null, status: 'pending', sent: false }
      this.shipments.push(sh)
      if (this.shipments.length > 40) this.shipments.shift()
      made.push(sh)
      this.screen(sh)
    }
    return made
  }

  screen(sh: AirShipment) {
    if (sh.sent || !this.onScreen) return
    sh.sent = true
    this.onScreen(sh)
  }

  /** 판독 결과를 정책으로 처리한다 */
  resolve(sh: AirShipment, f: ManifestFlags | null) {
    sh.flags = f
    sh.status = f ? 'ready' : 'error'
    this.stats.screened++
    let decision: string
    let tone: AirLog['tone']
    if (!f) {
      decision = ai.on ? L('판독 실패 → 보안검색대 수작업 확인', 'Reading failed → manual check at security screening') : L('AI 꺼짐 · 기본 규칙 → 보안검색대 수작업 확인', 'AI off · default rule → manual check at security screening')
      tone = 'gray'
    } else if (f.dangerous > 0.5) {
      this.stats.held++
      decision = L('미신고 위험물 의심 → 항공 탑재 보류 · 해상 운송 전환', 'Suspected undeclared dangerous goods → air loading held · switched to sea freight')
      tone = 'red'
    } else if (f.mismatch > 0.6) {
      this.stats.xray++
      decision = L('신고 품목 불일치 → 세관 X-ray 정밀 검사', 'Declared item mismatch → detailed customs X-ray inspection')
      tone = 'amber'
    } else if (f.reefer > 0.5) {
      this.stats.cold++
      decision = L('온도 관리 화물 → 냉장 ULD(RKN)에 적재', 'Temperature-controlled cargo → loaded into reefer ULD (RKN)')
      tone = 'blue'
    } else {
      decision = L('일반 ULD에 적재', 'Loaded into general ULD')
      tone = 'gray'
    }
    this.log.unshift({ time: this.clock(), awb: sh.awb, declared: sh.declared, description: sh.description, dest: sh.dest, decision, tone, flags: f })
    if (this.log.length > 12) this.log.pop()
  }
}
