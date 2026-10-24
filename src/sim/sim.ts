import { angleLerp, leg, Path, Route, v2, type Leg, type V2 } from './path'
import * as L from './layout'
import {
  BS, IC, IN, IN_SLOTS, STOPS, VARIANTS, bsInLegs, bsOutLegs, icReeferIn, icReeferOut, icWingIn, icWingOut,
  inBoxIn, inBoxOut, inFeeder, inVanIn, inVanOut, townRoute, type Stop,
} from './sites'
import { GATES, connector, type SiteId } from './world'
import { MEMO_POOL, REPORT_POOL } from './texts'
import { PORT, PortSim, type Box } from './port'
import { HubSorter } from './hub'
import { AP, AirportSim, apInLegs, apOutLegs } from './airport'
import { LifeSim, type Mover } from './life'
import { TrafficSim, LANES } from './traffic'
import { Grid, capFromGap, overlaps, scanAhead, scanLine, type Body } from './avoid'
import { INCIDENT_POOL, LINK_IDS, LINK_LABEL, impactFactor, linkOfLeg, type Incident, type IncidentAnswer, type LinkId } from './incidents'
import {
  CUSTOMERS, DELIVERY_ZONES, DRIVERS, ITEMS,
  invoiceNo, mulberry32, pick, plate, randInt,
  type CarrierKey, type ItemKey, type PalletLook,
} from './data'
import { ai } from './ai'
import { AirJourney, SeaJourney } from './journeys'
import { CustomerService } from './cs'
import { ColdChain } from './cold'
import { CustomsDesk } from './customs'
import { AddressDesk } from './addrfix'
import { ZonePlanner } from './zones'
import { CarbonLedger, SolarMeter } from './carbon'
import { DJ, djInLegs, djOutLegs, djYardIn, djYardToDock } from './daejeon'
import { ICS, IcSorter } from './icsort'
import { Promises, type DeliveryPromise } from './promise'
import { Approvals } from './approvals'
import { DriverDesk } from './driver'
import { VesselDesk } from './vessel'
import { Schedule } from './schedule'
import { GateLog } from './gatelog'
import { History } from './history'
import { RailShuttle } from './rail'
import { Barge } from './barge'
import { TownLife } from './town'
import { DjWarehouse } from './djwh'
import { SPEEDUP } from './clock'
import { L as tr, LL, plural } from '../i18n'
import { DRIVE_LIMIT, DRIVE_TIRED, REST_AREAS, REST_MIN, SWAP_T, onRoute, restIn, restOut } from './rest'

export type VehicleKind = 'wing' | 'box' | 'van' | 'reefer' | 'trailer'
export type VPhase =
  | 'offsite' | 'highway' | 'enroute' | 'gate' | 'inbound' | 'docking' | 'unloading' | 'loading'
  | 'closing' | 'departing' | 'delivering' | 'returning' | 'waiting' | 'craning' | 'inspecting'
  | 'restArea' | 'resting' | 'swap' | 'yard'
export type FStatus = 'idle' | 'toJob' | 'unloading' | 'loading' | 'putaway' | 'returning' | 'toCharge' | 'charging' | 'parking'
export type GateKey = 'GJ' | 'IN' | 'IC' | 'BS' | 'AP' | 'DJ'

export interface Shipment {
  no: string
  customer: string
  origin: string
  dest: string
  times: number[]
}

export interface Pallet {
  id: string
  item: ItemKey
  qty: number
  kg: number
  lot: string
  received: number
  look: PalletLook | 'stretch'
  state: 'onTruck' | 'onFork' | 'stored' | 'staged' | 'line'
  site: 'GJ' | 'IC'
  vehicleId?: string
  forkliftId?: string
  x: number
  z: number
  heading: number
  pinned?: boolean
  story?: boolean
  wrapped?: boolean
  reserved?: boolean
}

type VTask =
  | { k: 'drive'; legs: Leg[]; phase: VPhase; tags?: Record<string, VPhase>; release?: () => void; releaseAfter?: number; route?: Route; odo0?: number; released?: boolean; restChecked?: boolean; exitLogged?: boolean }
  | { k: 'gate'; gate: GateKey; t: number; logged?: boolean }
  | { k: 'work'; phase: VPhase; until: () => boolean; tick?: (dt: number) => void }
  | { k: 'wait'; phase: VPhase; t: number }
  | { k: 'hide'; t: number }
  | { k: 'do'; fn: () => void }

export type DropMode = 'door' | 'guard' | 'locker' | 'handover' | 'reschedule' | 'confirm' | 'moved'

export interface VehicleRest {
  /** 휴게소(N·S). null이면 거점 구내에서 쉰다(경로에 휴게소가 없을 때) */
  area: 'N' | 'S' | null
  bay: number
  /** 쉰 시간 / 쉴 시간(시뮬레이션 초) */
  t: number
  dur: number
  /** 의무 휴게(2시간)가 아니라 피곤해서 들른 것 */
  voluntary: boolean
  /** 정차해 쉬기 시작했는가(진입 중이면 false) */
  parked: boolean
}

export interface Walk {
  on: boolean
  stage: 'out' | 'door' | 'back'
  t: number
  pause: number
  from: V2
  to: V2
  stop: string
  done: boolean
  mode: DropMode
  note: string
  flags: string[]
}

/** AI가 해석한 배송 메모(서버 응답과 같은 모양) */
export interface MemoPlan {
  drop: string
  dropConfidence: number
  fallback: string
  noBell: number
  fragile: number
  callFirst: number
}

export interface StopMemo {
  text: string
  plan: MemoPlan | null
  status: 'none' | 'pending' | 'ready' | 'error'
}

export interface MemoLog {
  time: number
  vehicle: string
  stop: string
  text: string
  mode: DropMode
  confidence: number | null
  flags: string[]
  note: string
}

export interface ReportTriage {
  category: string
  categoryConfidence: number
  severity: number
  severityConfidence: number
  stopWork: number
}

export interface FieldReport {
  id: number
  time: number
  site: SiteId
  source: string
  text: string
  status: 'pending' | 'ready' | 'error'
  triage: ReportTriage | null
}

export interface Vehicle {
  id: string
  kind: VehicleKind
  carrier: CarrierKey
  plate: string
  driver: string
  x: number
  z: number
  heading: number
  kmh: number
  wheel: number
  visible: boolean
  phase: VPhase
  site: SiteId
  dest: SiteId | 'OFF' | null
  home: SiteId
  tasks: VTask[]
  route: Route | null
  res: number
  odo: number
  cargoTotal: number
  cargoDone: number
  cargo: (string | null)[]
  reserved: boolean[]
  wing: number
  door: number
  trip: number
  shipment: Shipment
  zone: string
  variant: string
  stops: Stop[]
  stopIdx: number
  delivered: number
  walk: Walk
  crumbs: V2[]
  trailer: { x: number; z: number; heading: number }
  container: string | null
  crane: number
  memos: Record<string, StopMemo>
  /** 트레일러가 싣고 있는 컨테이너(적하목록 포함) */
  box: Box | null
  /** 충돌 회피가 정한 속도 상한(m/s) */
  cap: number
  /** 막혀서 서 있던 시간 */
  blockedT: number
  /** 정차한 차를 왼쪽으로 비켜 지나가는 중: 옆으로 옮긴 거리·목표·지나가는 차 */
  swerve: number
  swerveT: number
  passing: string | null
  /** 오래 막히면(교착) 잠깐 정지 차량을 무시하고 빠져나간다 */
  ghostT: number
  /** 앞으로 더 갈 수 있는 거리(직전 회피 판단): 뒤차가 교차로에 들어갈지 정할 때 쓴다 */
  room: number
  /** 아직 허가받지 못한 정문·교차로 앞까지 거리(그 앞에서 설 수도 있다) */
  soft: number
  /** 교착 순환에서 풀려나 약속을 잠시 접고 지나가는 남은 시간 */
  releaseT: number
  /** 지금 누구를 기다리는가(몸체로 막는 차·예약을 쥔 차·끼어들 틈을 막는 차) */
  waitFor: string | null
  /** 마지막 휴게 뒤 연속 운전 시간(시뮬레이션 초, 600 = 2시간) */
  driveT: number
  /** 운전하지 않고 서 있던 시간: 15분(75초) 넘게 쉬면 연속 운전이 0으로 돌아간다 */
  idleT: number
  /** 휴게소에서 쉬는 중이면 그 정보 */
  rest: VehicleRest | null
  /** 간선 도착 약속(출발 때 정함, src/sim/promise.ts) */
  promise: DeliveryPromise | null
  /** 운행 기록(최근 12개): 출발·휴게·교대·야드 대기·도착 */
  log: { t: number; kind: string; text: string }[]
  /** 오늘 쉰 횟수 */
  rests: number
  /** 기사 교대 횟수(휴게소 없는 경로) */
  swaps: number
}

type Action =
  | { k: 'move'; route: Route }
  | { k: 'fork'; to: number }
  | { k: 'wait'; t: number }
  | { k: 'charge' }
  | { k: 'do'; fn: () => void }

export interface Forklift {
  id: string
  /** 오늘 이동 거리(m) */
  dist: number
  site: 'GJ' | 'IC'
  driver: string
  model: string
  x: number
  z: number
  heading: number
  fork: number
  carrying: string | null
  battery: number
  status: FStatus
  queue: Action[]
  moving: boolean
  kmh: number
  moves: number
  charger: number
  park: number
  idleFor: number
  job: { vehicleId: string; slot: number } | null
}

export interface Parcel {
  x: number
  y: number
  z: number
  slot: number
  phase: 0 | 1 | 2
  t: number
  s: number
  feed: number
  size: number
  tint: number
  spin: number
  story?: boolean
}

export interface Charger {
  id: string
  site: 'GJ' | 'IC'
  x: number
  z: number
  spotZ: number
  forklift: string | null
  sessions: number
  kwh: number
}

export interface Robot {
  id: string
  /** 오늘 이동 거리(m) */
  dist: number
  battery: number
  x: number
  z: number
  heading: number
  pod: number
  path: V2[]
  state: 'toPod' | 'toStation' | 'atStation' | 'return' | 'idle'
  wait: number
  station: number
}

export interface Pod {
  x: number
  z: number
  hx: number
  hz: number
  carried: boolean
  color: number
}

export interface Story {
  n: number
  no: string
  item: ItemKey
  customer: string
  stopId: string
  unit: string
  seller: string
  stage: number
  times: number[]
  timer: number
  pallet: string | null
  vehicle: string | null
  van: string | null
  slot: number
  parcel: Parcel | null
  memo: string
  memoPlan: MemoPlan | null
  memoStatus: StopMemo['status']
  dropMode: DropMode | null
}

export { SPEEDUP }
/** Node(헤드리스 점검·실험)에서 쓰는 고정 시작 시각: 결과가 매번 같게 */
const START_CLOCK = 9 * 3600 + 40 * 60

/** 시뮬레이션 시계의 시작 시각(하루 중 초). 브라우저에서는 이 컴퓨터의 현재 시각에서 시작한다 */
function startClock() {
  if (!('window' in globalThis)) return START_CLOCK
  const d = new Date()
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()
}

/** 꼬리물기 금지·예약 구역(교차로) */
interface Junction {
  x0: number
  x1: number
  z0: number
  z1: number
  /** 들어가도 된다고 예약한 차: id → 예약 시각 */
  res: Map<string, number>
}

type Rect = { x0: number; x1: number; z0: number; z1: number }

/** 차 전체 길이(앞 범퍼~맨 뒤): 트레일러는 트랙터 앞 범퍼에서 트레일러 끝까지 약 16.5m */
function vehLen(v: { kind: VehicleKind }) {
  return v.kind === 'van' ? 4.9 : v.kind === 'trailer' ? 16.5 : v.kind === 'reefer' ? 9.2 : v.kind === 'wing' ? 10.2 : 11
}

function inRect(x: number, z: number, r: Rect) {
  return x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1
}

/** 몸체(중심·앞·뒤 끝) 어느 부분이라도 상자 안에 있는가 */
function bodyIn(b: Body, r: Rect) {
  return inRect(b.x, b.z, r) || inRect(b.x + b.dx * b.half, b.z + b.dz * b.half, r) || inRect(b.x - b.dx * b.half, b.z - b.dz * b.half, r)
}

/** 상자에서 m 안쪽으로 가까운가 */
function nearRect(x: number, z: number, r: Rect, m: number) {
  return x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m
}

/** 앞 범퍼부터 1m 간격으로 짚은 경로 점(x, z, tx, tz) */
interface Ahead {
  n: number
  p: Float64Array
}
const AHEAD_N = 51
const NO_AHEAD: Ahead = { n: 0, p: new Float64Array(0) }

function sampleAhead(route: Route, from: number): Ahead {
  const p = new Float64Array(AHEAD_N * 4)
  let n = 0
  for (let s = 0; s < AHEAD_N; s++) {
    const q = route.peek(from + s)
    if (!q) break
    p[n * 4] = q.x
    p[n * 4 + 1] = q.z
    p[n * 4 + 2] = q.tx
    p[n * 4 + 3] = q.tz
    n++
  }
  return { n, p }
}

/** 겹치는 상자를 하나로 합친다(붙어 있는 교차로를 한 구역으로 다룬다) */
function mergeBoxes(list: Rect[]): Rect[] {
  const out = list.map((b) => ({ ...b }))
  for (let changed = true; changed; ) {
    changed = false
    for (let a = 0; a < out.length && !changed; a++) {
      for (let c = a + 1; c < out.length; c++) {
        const A = out[a]
        const C = out[c]
        if (A.x0 < C.x1 && C.x0 < A.x1 && A.z0 < C.z1 && C.z0 < A.z1) {
          out[a] = { x0: Math.min(A.x0, C.x0), x1: Math.max(A.x1, C.x1), z0: Math.min(A.z0, C.z0), z1: Math.max(A.z1, C.z1) }
          out.splice(c, 1)
          changed = true
          break
        }
      }
    }
  }
  return out
}
const r = mulberry32(77)
/** 휴게 판단 전용 난수(다른 시뮬레이션 결정의 난수 순서를 바꾸지 않게) */
const rr = mulberry32(2027)
export const CONTAINER_COLORS = ['#5FAFAA', '#E59B6B', '#6585E8', '#A3ACBE', '#D47A74', '#76B08A', '#E2BF6E']
const GOODS: ItemKey[] = ['water', 'rice', 'ramen', 'tissue', 'detergent', 'petfood', 'box']

interface Res {
  id: string
  vehicle: string | null
  today: number
}

export class Sim {
  clock = START_CLOCK
  elapsed = 0
  vehicles: Vehicle[] = []
  forklifts: Forklift[] = []
  pallets = new Map<string, Pallet>()
  // 곤지암
  bays: (Res & { x: number })[] = L.BAYS.map((x, i) => ({ id: tr(`하차 ${i + 1}`, `Unloading ${i + 1}`), x, vehicle: null, today: 9 + i * 3 }))
  docks: (Res & { x: number; open: number })[] = L.OUT_DOCKS.map((x, i) => ({ id: tr(`출고 ${i + 1}`, `Outbound ${i + 1}`), x, vehicle: null, open: 0, today: 6 + i * 2 }))
  slots = L.VAN_SLOTS.map((s, i) => ({ id: `${s.side === 'N' ? 'A' : 'B'}-${(i % 6) + 1}`, ...s, vehicle: null as string | null, today: 0 }))
  doors = L.IN_DOORS.map((x, i) => ({ id: tr(`입고 ${i + 1}`, `Inbound ${i + 1}`), x, open: 0 }))
  cy = { count: 7, today: 11 }
  // 이천
  icBays: (Res & { x: number })[] = IC.bays.map((x, i) => ({ id: tr(`상차 ${i + 1}`, `Loading ${i + 1}`), x, vehicle: null, today: 7 + i * 2 }))
  icReefers: (Res & { x: number; open: number })[] = IC.reeferDocks.map((x, i) => ({ id: tr(`냉동 ${i + 1}`, `Reefer ${i + 1}`), x, vehicle: null, open: 0, today: 4 + i }))
  icLines = IC.lines.map((x, i) => ({ id: tr(`출고 라인 ${i + 1}`, `Outbound line ${i + 1}`), x, pallets: [] as string[], wrapT: 0, spawnT: i * 1.5, wrapping: false }))
  pods: Pod[] = []
  robots: Robot[] = []
  orders = 8412
  /** 피킹 스테이션별 오늘 피킹 수(작업자 처리량 표시용) */
  stationPicks = [612, 588, 640, 571]
  icSort = new IcSorter()
  /** 간선 도착 약속(읽기 전용 계산) */
  promises = new Promises(this)
  /** 제안 → 승인 → 기록(노선 변경·정차지 이관·지연 안내·돌발 제한) */
  approvals = new Approvals(this)
  /** 다음 출발 때 붙일 이관 받은 정차지(배송차 ID → 정차지) */
  extraStops: Record<string, string[]> = {}
  /** 이관해서 건너뛸 정차지(배송차 ID → 정차지) */
  movedStops = new Map<string, Set<string>>()
  /** 기사 메시지로 운행 불가가 된 차(⑮) */
  driverOut = new Set<string>()
  /** 배송 완료 증빙: '배송차:정차지' → 시각 · 맡긴 곳 */
  proofs = new Map<string, { time: number; mode: DropMode; van: string }>()
  /** ⑯ 선사 지연 통보 판독 · 선석 일정 조정 */
  vessel = new VesselDesk(this)
  /** ⑮ 기사 메시지 판독 · 조치 */
  driver = new DriverDesk(this)
  private inDo: Vehicle | null = null
  /** 다온마을 생활 물류 흔적(택배 더미·택배함·편의점 접수·분리수거) */
  town = new TownLife()
  // 인천
  inDocks: (Res & { open: number; spawnT: number; feed: Path })[] = IN.docks.map((_, i) => ({ id: tr(`간선 ${i + 1}`, `Linehaul ${i + 1}`), vehicle: null, today: 5 + i * 2, open: 0, spawnT: 0, feed: new Path(inFeeder(i), 1.5) }))
  inSlots = IN_SLOTS.map((s, i) => ({ id: `${s.side}-${(i % 6) + 1}`, ...s, vehicle: null as string | null, held: 0, today: 0 }))
  inParcels: Parcel[] = []
  inBelt = 0
  // 부산
  port = new PortSim()
  hub = new HubSorter(() => this.clock)
  airport = new AirportSim()
  life = new LifeSim()
  traffic = new TrafficSim()
  /** 충돌 회피 집계 */
  avoidStats = { stopped: 0, passing: 0, ghosts: 0, yields: 0, releases: 0 }
  /** 휴게소 화물차 칸(누가 쓰는지) */
  restAreas = REST_AREAS.map((a) => ({ ...a, bays: a.bays.map((b) => ({ ...b })) }))
  /** 휴게 현황: 휴게소 정차(의무·자발), 구내 휴게, 2시간 넘긴 최장 연속 운전 */
  restStats = { stops: 0, voluntary: 0, swaps: 0, maxDrive: 0 }
  /** 점검 스크립트용: 마지막 프레임의 '누가 누구를 기다리나' */
  debugWaits = false
  lastWaits: { key: string; wait: string | null; gap: number; phys: number; speed: number; x: number; z: number }[] = []
  /** 끄면 예전처럼 서로를 모르고 지나간다(비교 실험용) */
  avoidEnabled = true
  private avoidAcc = 0
  /** 교차로에서 먼저 가기로 한 차는 몇 초 동안 우선권을 유지한다(판정이 뒤집혀 서로 밀고 들어가지 않게) */
  private rightOfWay = new Map<string, number>()
  /** 풀리지 않는 순환 교착이 이어진 시간(구성원 키 → 초) */
  private stuckCycles = new Map<string, number>()
  /**
   * 정문 통제: 진입로(단지 안 첫 교차로 ~ 간선 가장자리)와 정문 앞 간선의 회전 구간(정문 좌우 18m)을
   * 한 번에 한 방향(들어가기/나가기)만 쓴다. 들어오는 굴절 트레일러가 꺾는 동안 나가는 차와 엉키지 않게 하는 통제다.
   * 정문을 쓰는 차(회전·진입로 구간을 달리는 차)에만 적용하고, 간선을 그냥 지나가는 차는 상관없다
   */
  /** 인천공항 화물터미널 육측 도크 */
  apDocks: Res[] = AP.docks.map((_, i) => ({ id: tr(`항공 ${i + 1}`, `Air ${i + 1}`), vehicle: null, today: 3 + i }))
  /** 대전 중부허브 도크 */
  djDocks: Res[] = DJ.docks.map((_, i) => ({ id: tr(`대전 ${i + 1}`, `Daejeon ${i + 1}`), vehicle: null, today: 2 + i }))
  /** 대전 야드 대기 칸 */
  djYard: Res[] = DJ.yard.map((_, i) => ({ id: tr(`야드 Y${i + 1}`, `Yard Y${i + 1}`), vehicle: null, today: 0 }))
  /** 도크 일정표(지난 60분 점유 · 앞 30분 예정) */
  schedule = new Schedule(this)
  gateLog = new GateLog(this)
  history = new History(this)
  /** 부산신항 철송장 셔틀 열차(독립, 전역 난수 안 씀) */
  rail = new RailShuttle()
  /** 강 내륙 화물선(대전 강변 부두 ↔ 상류 내륙 부두) */
  barge = new Barge()
  teuBase = 1284
  get teu() {
    return this.teuBase + (this.port.stats.discharged + this.port.stats.loaded) * 2
  }
  // 공통
  chargers: Charger[] = [
    ...L.CHARGERS.map((x, i) => ({ id: `C${i + 1}`, site: 'GJ' as const, x, z: L.CHARGER_Z, spotZ: L.CHARGE_SPOT_Z, forklift: null, sessions: 5 + i * 2, kwh: 31.4 + i * 8.7 })),
    { id: 'C3', site: 'IC', x: IC.charger.x, z: IC.charger.z, spotZ: IC.charger.spotZ, forklift: null, sessions: 4, kwh: 22.6 },
  ]
  gates: Record<GateKey, { inOpen: number; outOpen: number; hold: number }> = {
    GJ: { inOpen: 0, outOpen: 0, hold: 0 }, IN: { inOpen: 0, outOpen: 0, hold: 0 }, IC: { inOpen: 0, outOpen: 0, hold: 0 }, BS: { inOpen: 0, outOpen: 0, hold: 0 }, AP: { inOpen: 0, outOpen: 0, hold: 0 }, DJ: { inOpen: 0, outOpen: 0, hold: 0 },
  }
  gate = this.gates.GJ
  parcels: Parcel[] = []
  parcelTimer = 0
  belt = 0
  stats = {
    boxes: 182430, boxesBase: 182430, stock: 1412, stockBase: 1412, palletsIn: 128, trucksOut: 41, onTime: 97.8,
    delivered: 3126, deliveredBase: 3126, lockerBoxes: 46, icPallets: 214, icPalletsBase: 214,
  }
  story: Story = { n: 0, no: '', item: 'water', customer: '', stopId: 'A101', unit: '', seller: '', stage: -1, times: [], timer: 0, pallet: null, vehicle: null, van: null, slot: 0, parcel: null, memo: '', memoPlan: null, memoStatus: 'none', dropMode: null }
  // ── AI(Claude) 연동 훅: 브라우저의 AI 모듈이 연결한다. 연결이 없으면 기본 규칙으로 동작
  onVanDepart: ((v: Vehicle) => void) | null = null
  onStory: ((s: Story) => void) | null = null
  onReport: ((r: FieldReport) => void) | null = null
  onIncident: ((i: Incident) => void) | null = null
  incidents: Incident[] = []
  /** 링크별 속도 배율(돌발 상황이 없으면 1) */
  linkFactor: Record<LinkId, number> = { hw_ic_gj: 1, hw_gj_in: 1, hw_gj_bs: 1, hw_gj_ap: 1, hw_gj_dj: 1, town_gate: 1, port_crane: 1 }
  private incidentSeq = 1
  private incidentTimer = 70
  memoLog: MemoLog[] = []
  memoStats = { door: 0, guard: 0, locker: 0, handover: 0, reschedule: 0, confirm: 0, moved: 0 }
  reports: FieldReport[] = []
  private reportSeq = 1
  private reportTimer = 6
  private reported = new Set<string>()
  storyCount = 0
  private palletSeq = 1020
  private cyTimer = 0

  /** 배로 오는 수입 컨테이너 여정 */
  sea: SeaJourney
  /** 비행기로 가는 수출 화물 여정 */
  air: AirJourney
  /** 고객 문의 · 반품 회수 */
  cs: CustomerService
  /** 새벽배송 · 콜드체인 온도 */
  cold: ColdChain
  /** 부산신항 수입 통관(HS 분류) */
  customs: CustomsDesk
  /** 인천 서브 주소 정정 데스크 */
  addr: AddressDesk
  /** 다온마을 배송 구역 · 경로 최적화 */
  zones: ZonePlanner
  /** 탄소 배출 추정 */
  carbon: CarbonLedger
  solar: SolarMeter
  /** 대전 중부허브 창고 공정(입고·검수·적치·보관·출고) */
  djwh: DjWarehouse

  constructor() {
    this.sea = new SeaJourney(this)
    this.air = new AirJourney(this)
    this.cs = new CustomerService(this)
    this.cold = new ColdChain(this)
    this.customs = new CustomsDesk(this)
    this.addr = new AddressDesk(this)
    this.zones = new ZonePlanner(this)
    this.carbon = new CarbonLedger(this)
    this.solar = new SolarMeter(this)
    this.djwh = new DjWarehouse(this)
    this.djwh.attachPeople()
    // 이천 피킹 스테이션 작업자(선택할 수 있게 걸어 다니는 사람 목록에 둔다. 제자리에 선다)
    IC.stations.forEach((x, k) => this.life.addScripted(`pk-${k + 1}`, tr('피킹 작업자', 'Picker'), x, IC.stationZ + 1.0, { top: '#2F55E6', vest: true, helmet: '#FFFFFF' }))
    this.port.clock = () => this.clock
    // 철송: 부산 철송장 ↔ 장치장(육측 ARMG), 곤지암 철송장에서 내린 수입 컨테이너는 CY로
    this.port.railLink = this.rail
    this.rail.requestPort = (k) => this.port.requestRail(k)
    this.rail.onCy = () => {
      this.cy.today++
      this.cy.count = Math.min(24, this.cy.count + 1)
    }
    this.airport.clock = () => this.clock
    this.init()
    // 브라우저: 미리 돌리는 150초(시계로 30분)를 현재 시각 앞쪽에 둬서, 그동안 생긴 기록이 지금 직전 시각을 갖게 한다.
    // Node: 예전처럼 09:40부터 돌리고 09:40으로 되돌린다(점검·실험 결과가 그대로 재현되게)
    const start = startClock()
    this.clock = !('window' in globalThis) ? START_CLOCK : start - 1500 * 0.1 * SPEEDUP
    for (let i = 0; i < 1500; i++) this.step(0.1)
    this.clock = start
    this.stats.boxesBase = this.stats.boxes
    this.stats.stockBase = this.stats.stock
    this.stats.deliveredBase = this.stats.delivered
    this.stats.icPalletsBase = this.stats.icPallets
    this.newStory()
  }

  // ───────────────────────── 초기화

  private init() {
    const wings: [string, CarrierKey][] = [['TR-2205', 'daon'], ['TR-2229', 'hangil'], ['TR-2481', 'baro'], ['TR-2307', 'donghae']]
    wings.forEach(([id, c], i) => {
      const v = this.makeVehicle(id, 'wing', c, i < 2 ? 'GJ' : 'IC')
      if (i < 2) this.parkWingGJ(v, i, i === 0 ? 3 : 0)
      else this.parkWingIC(v, i - 2)
    })
    const boxes: [string, CarrierKey][] = [['TR-2051', 'daon'], ['TR-2104', 'daon'], ['TR-2658', 'hangil']]
    boxes.forEach(([id, c], i) => {
      const v = this.makeVehicle(id, 'box', c, i === 1 ? 'IN' : 'GJ')
      if (i === 1) this.parkBoxIN(v, 0)
      else this.parkBoxGJ(v, i === 0 ? 0 : 1)
    })
    for (let i = 0; i < 14; i++) {
      const v = this.makeVehicle(`DV-${4401 + i * 7}`, 'van', 'daon', 'GJ')
      if (i < 10) this.parkGjVan(v, [0, 1, 3, 4, 6, 7, 8, 10, 11, 2][i], randInt(20, 150, r))
      else v.tasks.push({ k: 'hide', t: 6 + (i - 10) * 12 }, { k: 'do', fn: () => this.gjVanReturn(v) })
    }
    const variants = ['apt', 'mix', 'villa', 'west']
    for (let i = 0; i < 12; i++) {
      const v = this.makeVehicle(`DV-${5102 + i * 9}`, 'van', 'daon', 'IN')
      v.variant = variants[i % variants.length]
      this.inSlots[i].vehicle = v.id
      v.res = i
      this.parkInVan(v, i, randInt(40, 150, r))
    }
    ;['AT-7301', 'AT-7318', 'AT-7335'].forEach((id, i) => this.parkAirAP(this.makeVehicle(id, 'box', 'daonair', 'AP'), i, [120, 380, 600][i]))
    ;(['RF-3301', 'RF-3318'] as const).forEach((id, d) => this.parkReefer(this.makeVehicle(id, 'reefer', 'baro', 'IC'), d))
    ;['CT-7701', 'CT-7715', 'CT-7742', 'CT-7760'].forEach((id, i) => {
      const v = this.makeVehicle(id, 'trailer', i === 1 ? 'donghae' : 'hangil', 'BS')
      v.box = this.port.newBox('export')
      v.container = v.box.color
      v.tasks.push(
        { k: 'hide', t: 2 + i * 11 },
        this.drive(connector('E', 'BS'), 'enroute', { highway: 'highway' }),
        { k: 'gate', gate: 'BS', t: 1.2 },
      )
    })

    const fl: [string, string, 'GJ' | 'IC'][] = [
      ['FL-01', tr('정하준', 'Jeong Ha-jun'), 'GJ'], ['FL-02', tr('이하은', 'Lee Ha-eun'), 'GJ'], ['FL-03', tr('윤시우', 'Yun Si-u'), 'GJ'], ['FL-04', tr('박서연', 'Park Seo-yeon'), 'GJ'], ['FL-05', tr('한승민', 'Han Seung-min'), 'GJ'],
      ['FL-11', tr('오태윤', 'Oh Tae-yun'), 'IC'], ['FL-12', tr('최지아', 'Choi Ji-a'), 'IC'], ['FL-13', tr('서준혁', 'Seo Jun-hyeok'), 'IC'],
    ]
    fl.forEach(([id, driver, site], i) => {
      const p = site === 'GJ' ? (i < 3 ? L.PARK_SPOTS[i] : v2(L.IN_DOORS[i - 3], L.DOOR_OUT_Z)) : IC.park[i - 5]
      this.forklifts.push({
        id, site, driver, model: tr(`전동 2.5t · NF25-${180 + i * 7}`, `Electric 2.5 t · NF25-${180 + i * 7}`), dist: 1800 + i * 420,
        x: p.x, z: p.z, heading: Math.PI, fork: 0.3, carrying: null,
        battery: [84, 31, 92, 68, 22, 77, 58, 90][i], status: 'idle', queue: [], moving: false, kmh: 0,
        moves: [24, 31, 18, 27, 12, 19, 22, 15][i], charger: -1, park: site === 'GJ' ? (i < 3 ? i : -1) : i - 5, idleFor: 0, job: null,
      })
    })

    this.seedStagedPallets()
    this.seedAmr()
    // 대전 중부허브 간선 11톤 2대(다른 차량의 난수 순서를 바꾸지 않게 맨 끝에 만든다)
    ;(['TR-2733', 'TR-2759'] as const).forEach((id, i) => this.parkDJ(this.makeVehicle(id, 'box', 'daon', 'DJ'), i * 2, [760, 260][i]))
    // 대전 협력사 입고 트럭 2대(지도 동쪽 밖에서 차례로 들어온다)
    ;(['SP-5101', 'SP-5127'] as const).forEach((id, i) => {
      const v = this.makeVehicle(id, 'box', i ? 'donghae' : 'hangil', 'DJ')
      v.variant = 'supplier'
      v.tasks.push({ k: 'hide', t: 20 + i * 70 })
    })
  }

  private makeVehicle(id: string, kind: VehicleKind, carrier: CarrierKey, site: SiteId): Vehicle {
    const v: Vehicle = {
      id, kind, carrier, plate: plate(kind === 'van' ? 'van' : 'truck'), driver: pick(DRIVERS, r),
      x: 0, z: 0, heading: 0, kmh: 0, wheel: 0, visible: false,
      phase: 'offsite', site, dest: null, home: site, tasks: [], route: null, res: -1, odo: 0,
      cargoTotal: 0, cargoDone: 0, cargo: [], reserved: [], wing: 0, door: 0, trip: 0,
      shipment: { no: '', customer: '', origin: '', dest: '', times: [] },
      zone: '', variant: '', stops: [], stopIdx: 0, delivered: 0,
      walk: { on: false, stage: 'out', t: 0, pause: 0, from: v2(0, 0), to: v2(0, 0), stop: '', done: true, mode: 'door', note: '', flags: [] },
      crumbs: [], trailer: { x: 0, z: 0, heading: 0 }, container: null, crane: 0, memos: {}, box: null,
      cap: Infinity, blockedT: 0, swerve: 0, swerveT: 0, passing: null, ghostT: 0, room: Infinity, soft: Infinity, releaseT: 0, waitFor: null,
      driveT: rr() * 360, idleT: 0, rest: null, promise: null, log: [], rests: 0, swaps: 0,
    }
    this.vehicles.push(v)
    return v
  }

  private newPallet(item: ItemKey, state: Pallet['state'], site: 'GJ' | 'IC'): Pallet {
    const it = ITEMS[item]
    const qty = Math.round(it.perPallet * (0.7 + r() * 0.3))
    const p: Pallet = {
      id: `PLT-${this.palletSeq++}`, item, qty, kg: Math.round(qty * it.unitKg + 22),
      lot: `L25${randInt(10, 12, r)}-${randInt(100, 999, r)}`, received: this.clock - randInt(600, 9000, r),
      look: it.look, state, site, x: 0, z: 0, heading: 0,
    }
    this.pallets.set(p.id, p)
    return p
  }

  private seedStagedPallets() {
    const items: ItemKey[] = ['water', 'rice', 'tissue', 'ramen', 'detergent', 'petfood', 'box', 'water', 'helmet', 'rice']
    let k = 0
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 9; col++) {
        if ((row === 1 && col % 4 === 3) || (row === 0 && col === 6)) continue
        const p = this.newPallet(items[k++ % items.length], 'staged', 'GJ')
        p.x = -52 + col * 3.4 + (row ? 0.4 : 0)
        p.z = 28.3 + row * 2.6
        p.pinned = (row === 0 && (col === 2 || col === 7)) || (row === 1 && col === 4)
      }
    }
  }

  private seedAmr() {
    const A = IC.amr
    let i = 0
    for (let x = A.x0; x <= A.x1; x += A.step) {
      if (Math.round((x - A.x0) / A.step) % 3 === 2) continue
      for (let z = A.z0; z <= A.z1; z += A.step) {
        if (Math.round((z - A.z0) / A.step) % 4 === 3) continue
        this.pods.push({ x, z, hx: x, hz: z, carried: false, color: i++ % 3 })
      }
    }
    for (let k = 0; k < 10; k++) {
      const p = this.pods[(k * 7) % this.pods.length]
      this.robots.push({ id: `AMR-${String(k + 1).padStart(2, '0')}`, dist: 2400 + k * 310, battery: 74 + ((k * 7) % 22), x: p.hx + 1.5, z: A.z1 + 3, heading: 0, pod: -1, path: [], state: 'idle', wait: k * 0.6, station: k % IC.stations.length })
    }
  }

  // ───────────────────────── 차량 공통

  private drive(legs: Leg[], phase: VPhase, tags?: Record<string, VPhase>, release?: () => void, releaseAfter = 16): VTask {
    return { k: 'drive', legs, phase, tags, release, releaseAfter }
  }

  /** 운전하지 않고 서 있는 시간: 15분(75초) 넘게 쉬면 연속 운전 시간이 0으로 */
  private idle(v: Vehicle, dt: number) {
    v.idleT += dt
    if (v.idleT >= REST_MIN && v.driveT > 0) v.driveT = 0
  }

  /** 경로를 따라 달릴 대략의 시간(초) */
  private legsTime(legs: Leg[]) {
    return legs.reduce((s, l) => s + l.path.length / Math.max(1, l.speed), 0)
  }

  /**
   * 휴게 판단: 이번 운행에서 2시간을 넘기게 되면(의무) 또는 1시간 20분 넘게 달려 피곤하면(자발, 반반)
   * 경로 위 휴게소에 들른다. 휴게소가 없는 경로에서 이미 2시간을 넘겼다면 출발 전에 구내에서 15분 쉰다.
   * 경로를 바꿨으면 true(이번 프레임은 출발하지 않는다)
   */
  private planRest(v: Vehicle, t: Extract<VTask, { k: 'drive' }>) {
    if (v.kind === 'van') return false
    const must = v.driveT + this.legsTime(t.legs) > DRIVE_LIMIT
    const tired = !must && v.driveT > DRIVE_TIRED && rr() < 0.5
    if (!must && !tired) return false
    for (let i = 0; i < t.legs.length; i++) {
      const L = t.legs[i]
      if (L.tag !== 'highway') continue
      const pts = L.path.pts
      const sx = pts[0].x
      const ex = pts[pts.length - 1].x
      const lz = pts[0].z
      const area = this.restAreas.find((a) => onRoute(a, sx, ex))
      if (!area) continue
      // 가장 안쪽 빈 칸(뒤에 오는 차가 쉬는 차 옆을 지나가지 않게)
      const free = area.bays.map((b, k) => ({ b, k })).filter((x) => !x.b.vehicle).sort((a, b) => (b.b.x - a.b.x) * area.dir)
      const pick = free[0]
      if (!pick) continue
      pick.b.vehicle = v.id
      const pre = [...t.legs.slice(0, i), ...restIn(area, pick.b, sx, lz)]
      const post = [...restOut(area, pick.b, ex, lz), ...t.legs.slice(i + 1)]
      t.legs = pre
      t.tags = { ...t.tags, rest: 'restArea' }
      const rest: VehicleRest = { area: area.id, bay: pick.k, t: 0, dur: must ? REST_MIN + rr() * 8 : REST_MIN + 4 + rr() * 20, voluntary: !must, parked: false }
      v.rest = rest
      const bay = pick.b
      const back = this.drive(post, t.phase, { ...t.tags, rest: 'restArea' }, () => {
        if (bay.vehicle === v.id) bay.vehicle = null
        if (v.rest === rest) v.rest = null
      }, 24) as Extract<VTask, { k: 'drive' }>
      back.restChecked = true
      this.logV(v, 'rest', `${rest.voluntary ? tr('휴게 예정(피곤)', 'Rest stop planned (tired)') : tr('의무 휴게 예정', 'Mandatory rest stop planned')} · ${area.name}`)
      v.tasks.splice(1, 0,
        { k: 'do', fn: () => { rest.parked = true; this.logV(v, 'rest', tr(`휴게 시작 · ${Math.round((rest.dur * SPEEDUP) / 60)}분`, `Rest started · ${Math.round((rest.dur * SPEEDUP) / 60)} min`)) } },
        { k: 'work', phase: 'resting', tick: (dt) => { rest.t += dt }, until: () => rest.t >= rest.dur },
        {
          k: 'do', fn: () => {
            v.driveT = 0
            v.rests++
            this.logV(v, 'rest', tr('휴게 끝 · 다시 출발', 'Rest over · back on the road'))
            this.restStats.stops++
            if (rest.voluntary) this.restStats.voluntary++
          },
        },
        back,
      )
      return false
    }
    // 휴게소를 지나지 않는 경로(부산신항 ↔ 곤지암 CY 셔틀 등)에서 이번 운행으로 2시간을 넘기게 되면
    // 도크·크레인 아래에서 출발하기 전에 기사가 교대한다(교대 기사가 이어서 운전, 앞 기사는 쉰다).
    // 정문 정지선에서는 바꾸지 않는다(뒤차를 막지 않게): 다음 출발 때 다시 본다.
    if (must && t.legs[0]?.tag !== 'highway' && v.phase !== 'gate' && v.phase !== 'offsite') {
      const rest: VehicleRest = { area: null, bay: -1, t: 0, dur: SWAP_T, voluntary: false, parked: true }
      v.rest = rest
      v.tasks.unshift(
        { k: 'work', phase: 'swap', tick: (dt) => { rest.t += dt }, until: () => rest.t >= rest.dur },
        { k: 'do', fn: () => { v.driveT = 0; v.swaps++; this.restStats.swaps++; this.logV(v, 'swap', tr('기사 교대', 'Driver swap')); if (v.rest === rest) v.rest = null } },
      )
      return true
    }
    return false
  }

  private freeIdx(list: { vehicle: string | null }[]) {
    const free = list.map((x, i) => (x.vehicle ? -1 : i)).filter((i) => i >= 0)
    return free.length ? free[Math.floor(r() * free.length)] : -1
  }

  private releaser(list: { vehicle: string | null }[], idx: number, id: string) {
    return () => {
      if (list[idx]?.vehicle === id) list[idx].vehicle = null
    }
  }

  private applyPose(v: Vehicle, route: Route) {
    const p = route.pose()
    v.x = p.x
    v.z = p.z
    v.heading = p.heading
    if (v.swerve) {
      // 진행 방향의 왼쪽(중앙선 쪽)으로 옮긴다
      v.x += Math.cos(p.heading) * v.swerve
      v.z -= Math.sin(p.heading) * v.swerve
    }
  }

  /** 마지막 구간 끝에 바로 세워 둔다(라이브 화면 연출용) */
  private placeAtEnd(v: Vehicle, legs: Leg[]) {
    const last = legs[legs.length - 1]
    const route = new Route([last])
    route.d = last.path.length
    route.done = true
    v.route = route
    v.visible = true
    this.applyPose(v, route)
  }

  private resetCrumbs(v: Vehicle) {
    const fw = L.toWorld(v.x, v.z, v.heading, 0, -1.6)
    const back = { x: -Math.sin(v.heading), z: -Math.cos(v.heading) }
    v.crumbs = Array.from({ length: 40 }, (_, i) => v2(fw.x + back.x * i * 0.4, fw.z + back.z * i * 0.4))
    this.updateTrailer(v)
  }

  /** 트랙터 연결점이 지나온 길을 따라 트레일러 축을 끌고 간다 */
  private updateTrailer(v: Vehicle) {
    const fw = L.toWorld(v.x, v.z, v.heading, 0, -1.6)
    const c = v.crumbs
    if (!c.length || Math.hypot(c[0].x - fw.x, c[0].z - fw.z) > 0.4) {
      c.unshift(v2(fw.x, fw.z))
      if (c.length > 80) c.pop()
    }
    let need = 10.5
    let prev: V2 = fw
    let axle = c[c.length - 1]
    for (const p of c) {
      const d = Math.hypot(p.x - prev.x, p.z - prev.z)
      if (d >= need) {
        const t = need / d
        axle = v2(prev.x + (p.x - prev.x) * t, prev.z + (p.z - prev.z) * t)
        break
      }
      need -= d
      prev = p
    }
    const h = Math.atan2(fw.x - axle.x, fw.z - axle.z)
    v.trailer.heading = h
    v.trailer.x = (fw.x + axle.x) / 2 - Math.sin(h) * 0.6
    v.trailer.z = (fw.z + axle.z) / 2 - Math.cos(h) * 0.6
  }

  private stepVehicle(v: Vehicle, dt: number) {
    if (!v.tasks.length) this.plan(v)
    const t = v.tasks[0]
    if (!t) return
    switch (t.k) {
      case 'drive': {
        // 간선을 타기 전에 쉴지 정한다(2시간 연속 운전 의무 휴게 · 피곤하면 들르기)
        if (!t.route && !t.restChecked) {
          t.restChecked = true
          if (this.planRest(v, t)) break
        }
        if (!t.route) {
          // 지도 밖에서 들어올 때 출발점에 다른 차가 있으면 잠깐 기다린다(같은 자리에 겹쳐 나타나지 않게)
          if (!v.visible && t.legs.length) {
            const p0 = t.legs[0].path.pts[0]
            if (this.vehicles.some((o) => o !== v && o.visible && Math.abs(o.x - p0.x) < 9 && Math.abs(o.z - p0.z) < 9)) break
          }
          t.route = new Route(t.legs)
          t.odo0 = v.odo
          v.route = t.route
          const wasHidden = !v.visible
          v.visible = true
          this.applyPose(v, t.route)
          if (v.kind === 'trailer' && (wasHidden || !v.crumbs.length)) this.resetCrumbs(v)
        }
        const route = t.route
        // 길 위에 있는 동안은 차가 막혀 서 있어도 운전 시간이다
        v.driveT += dt
        v.idleT = 0
        if (v.kind !== 'van' && v.driveT > DRIVE_LIMIT + 30 && !v.rest) this.restStats.maxDrive = Math.max(this.restStats.maxDrive, v.driveT)
        const f = this.legFactor(v, route.leg)
        const ds = route.step(dt * f, v.cap / Math.max(0.05, f))
        v.odo += ds
        v.wheel += (route.pose().reverse ? -ds : ds) / (v.kind === 'van' ? 0.34 : 0.5)
        this.applyPose(v, route)
        if (v.kind === 'trailer') this.updateTrailer(v)
        v.kmh = route.speedKmh * f
        v.phase = t.tags?.[route.leg.tag ?? ''] ?? t.phase
        if ((route.leg.tag === 'exit' || route.leg.tag === 'town') && !t.exitLogged) {
          t.exitLogged = true
          this.gateLog.onLeave(v, route.leg)
        }
        if (t.release && !t.released && v.odo - (t.odo0 ?? 0) > (t.releaseAfter ?? 16)) {
          t.released = true
          t.release()
        }
        if (route.done) {
          if (t.release && !t.released) t.release()
          v.tasks.shift()
        }
        break
      }
      case 'gate':
        if (!t.logged) {
          t.logged = true
          this.gateLog.onIn(v, t.gate)
        }
        this.idle(v, dt)
        v.kmh = 0
        v.phase = 'gate'
        this.gates[t.gate].hold = 0.8
        t.t -= dt
        if (t.t <= 0) v.tasks.shift()
        break
      case 'work':
        this.idle(v, dt)
        v.kmh = 0
        v.phase = t.phase
        t.tick?.(dt)
        if (t.until()) v.tasks.shift()
        break
      case 'wait':
        this.idle(v, dt)
        v.kmh = 0
        v.phase = t.phase
        t.t -= dt
        if (t.t <= 0) v.tasks.shift()
        break
      case 'hide':
        // 지도 밖(다른 거점·차고지)에 있는 동안은 운전하지 않는 시간으로 본다
        this.idle(v, dt)
        v.visible = false
        v.kmh = 0
        v.phase = 'offsite'
        v.route = null
        t.t -= dt
        if (t.t <= 0) v.tasks.shift()
        break
      case 'do':
        v.tasks.shift()
        // 이 작업 안에서 운송장을 새로 쓰면(출발) 약속 시간대를 정한다
        this.inDo = v
        t.fn()
        this.inDo = null
        break
    }
  }

  private plan(v: Vehicle) {
    if (v.kind === 'wing') this.planWing(v)
    else if (v.kind === 'box' && v.home === 'AP') this.planAir(v)
    else if (v.kind === 'box' && v.home === 'DJ' && v.variant === 'supplier') this.planSupplier(v)
    else if (v.kind === 'box' && v.home === 'DJ') this.planDJ(v)
    else if (v.kind === 'box') this.planBox(v)
    else if (v.kind === 'van') {
      if (v.home === 'IN') this.planTownVan(v)
      else this.planGjVan(v)
    } else if (v.kind === 'reefer') this.planReefer(v)
    else this.planTrailer(v)
  }

  // ───────────────────────── 항공 화물 트럭: 곤지암 허브 ↔ 인천공항 화물터미널

  private airWork(v: Vehicle, site: 'GJ' | 'AP'): VTask[] {
    const rate = 32
    return [
      {
        k: 'work', phase: 'unloading',
        tick: (dt) => { v.door = Math.min(1, v.door + dt * 0.8); if (v.door > 0.9) v.cargoDone = Math.max(0, v.cargoDone - dt * rate) },
        until: () => v.cargoDone <= 0,
      },
      { k: 'do', fn: () => { v.shipment.customer = site === 'GJ' ? tr('해외직구 수입 하차 완료', 'Cross-border import unloaded') : tr('역직구 수출 하차 완료', 'Cross-border export unloaded') } },
      { k: 'work', phase: 'loading', tick: (dt) => { v.cargoDone = Math.min(v.cargoTotal, v.cargoDone + dt * rate) }, until: () => v.cargoDone >= v.cargoTotal },
      { k: 'work', phase: 'closing', tick: (dt) => (v.door = Math.max(0, v.door - dt * 0.8)), until: () => v.door <= 0 },
    ]
  }

  private planAir(v: Vehicle) {
    const tags: Record<string, VPhase> = { highway: 'highway', approach: 'enroute', 'exit-site': 'departing', exit: 'departing', docking: 'docking' }
    const from = v.res
    if (v.site === 'AP') {
      // 곤지암 항공 전용 도크(마지막)를 먼저, 없으면 다른 출고 도크
      const air = this.docks.length - 1
      const res = !this.docks[air].vehicle ? air : this.freeIdx(this.docks)
      if (res < 0) {
        v.tasks.push({ k: 'wait', phase: 'waiting', t: 2 })
        return
      }
      this.docks[res].vehicle = v.id
      v.tasks.push(
        { k: 'do', fn: () => { v.dest = 'GJ'; this.shipment(v, tr('AP-06 인천공항 화물터미널', 'AP-06 Incheon Airport Cargo Terminal'), tr('GJ-01 곤지암 메가허브', 'GJ-01 Gonjiam Mega Hub'), tr('해외직구 수입 화물', 'Cross-border import cargo')) } },
        this.drive([...apOutLegs(from), ...connector('AP', 'GJ')], 'departing', tags, this.releaser(this.apDocks, from, v.id)),
        { k: 'gate', gate: 'GJ', t: 1.4 },
        { k: 'do', fn: () => { v.site = 'GJ'; v.res = res; v.dest = null } },
        this.drive(L.boxInLegs(res), 'inbound', tags),
        { k: 'do', fn: () => { this.docks[res].today++ } },
        ...this.airWork(v, 'GJ'),
      )
    } else {
      const res = this.freeIdx(this.apDocks)
      if (res < 0) {
        v.tasks.push({ k: 'wait', phase: 'waiting', t: 2 })
        return
      }
      this.apDocks[res].vehicle = v.id
      v.tasks.push(
        { k: 'do', fn: () => { v.dest = 'AP'; this.shipment(v, tr('GJ-01 곤지암 메가허브', 'GJ-01 Gonjiam Mega Hub'), tr('AP-06 인천공항 화물터미널', 'AP-06 Incheon Airport Cargo Terminal'), tr('역직구 수출 화물', 'Cross-border export cargo')) } },
        this.drive([...L.boxOutLegs(from), ...connector('GJ', 'AP')], 'departing', tags, this.releaser(this.docks, from, v.id)),
        { k: 'gate', gate: 'AP', t: 1.4 },
        { k: 'do', fn: () => { v.site = 'AP'; v.res = res; v.dest = null } },
        this.drive(apInLegs(res), 'inbound', tags),
        // 수출 화물을 내리면 신고 문구를 항공 위험물 검사(AI)에 올린다
        { k: 'do', fn: () => { this.apDocks[res].today++; this.air.unloaded(v, this.airport.receiveExports(3)) } },
        ...this.airWork(v, 'AP'),
      )
    }
  }

  // ───────────────────────── 대전 중부허브 간선: 곤지암 허브가 분류한 대전·충청행 롤테이너 ↔ 대전 집하 물량

  private djWork(v: Vehicle, site: 'GJ' | 'DJ'): VTask[] {
    const rate = 36
    // 대전에서는 창고 공정과 맞물린다: 입고 레인이 차면 하차가 멈추고, 출고 파렛트가 나와야 상차가 이어진다
    const dj = site === 'DJ'
    return [
      {
        k: 'work', phase: 'unloading',
        tick: (dt) => { v.door = Math.min(1, v.door + dt * 0.8); if (v.door > 0.9 && (!dj || this.djwh.canUnload(v.res))) v.cargoDone = Math.max(0, v.cargoDone - dt * rate) },
        until: () => v.cargoDone <= 0,
      },
      { k: 'do', fn: () => { v.shipment.customer = site === 'GJ' ? tr('대전 집하 물량 하차 완료', 'Daejeon pickup volume unloaded') : tr('대전·충청행 롤테이너 하차 완료', 'Daejeon · Chungcheong roll cages unloaded') } },
      { k: 'work', phase: 'loading', tick: (dt) => { if (!dj || this.djwh.canLoad(v, dt)) v.cargoDone = Math.min(v.cargoTotal, v.cargoDone + dt * rate) }, until: () => v.cargoDone >= v.cargoTotal },
      { k: 'work', phase: 'closing', tick: (dt) => (v.door = Math.max(0, v.door - dt * 0.8)), until: () => v.door <= 0 },
    ]
  }

  private planDJ(v: Vehicle) {
    const tags: Record<string, VPhase> = { highway: 'highway', approach: 'enroute', 'exit-site': 'departing', exit: 'departing', docking: 'docking' }
    const from = v.res
    if (v.site === 'DJ') {
      const res = this.freeIdx(this.docks)
      if (res < 0) {
        v.tasks.push({ k: 'wait', phase: 'waiting', t: 2 })
        return
      }
      this.docks[res].vehicle = v.id
      v.tasks.push(
        { k: 'do', fn: () => { v.dest = 'GJ'; this.shipment(v, tr('DJ-07 대전 중부허브', 'DJ-07 Daejeon Central Hub'), tr('GJ-01 곤지암 메가허브', 'GJ-01 Gonjiam Mega Hub'), tr('대전 집하 물량', 'Daejeon pickup volume')) } },
        this.drive([...djOutLegs(from), ...connector('DJ', 'GJ')], 'departing', tags, this.releaser(this.djDocks, from, v.id)),
        { k: 'gate', gate: 'GJ', t: 1.4 },
        { k: 'do', fn: () => { v.site = 'GJ'; v.res = res; v.dest = null } },
        this.drive(L.boxInLegs(res), 'inbound', tags),
        { k: 'do', fn: () => { this.docks[res].today++ } },
        ...this.djWork(v, 'GJ'),
      )
    } else {
      // 야드에 이미 기다리는 차(또는 야드로 가는 차)가 있으면 새 차도 야드로: 먼 곳에서 도크를 먼저 잡아 비워 두지 않게
      const res = this.djYard.some((y) => y.vehicle) ? -1 : this.freeIdx(this.djDocks)
      if (res < 0) {
        // 대전 도크가 다 차 있으면 곤지암 도크를 붙잡고 있지 않고 출발해 대전 야드에서 기다린다
        const stall = this.freeIdx(this.djYard)
        if (stall < 0) {
          v.tasks.push({ k: 'wait', phase: 'waiting', t: 2 })
          return
        }
        this.djYard[stall].vehicle = v.id
        v.tasks.push(
          { k: 'do', fn: () => { v.dest = 'DJ'; this.stats.trucksOut++; this.shipment(v, tr('GJ-01 곤지암 메가허브', 'GJ-01 Gonjiam Mega Hub'), tr('DJ-07 대전 중부허브', 'DJ-07 Daejeon Central Hub'), tr('대전·충청행 롤테이너', 'Roll cages for Daejeon · Chungcheong')) } },
          this.drive([...L.boxOutLegs(from), ...connector('GJ', 'DJ')], 'departing', tags, this.releaser(this.docks, from, v.id)),
          { k: 'gate', gate: 'DJ', t: 1.4 },
          { k: 'do', fn: () => { v.site = 'DJ'; v.dest = null } },
          ...this.djYardWait(v, stall, () => this.djWork(v, 'DJ')),
        )
        return
      }
      this.djDocks[res].vehicle = v.id
      v.tasks.push(
        { k: 'do', fn: () => { v.dest = 'DJ'; this.stats.trucksOut++; this.shipment(v, tr('GJ-01 곤지암 메가허브', 'GJ-01 Gonjiam Mega Hub'), tr('DJ-07 대전 중부허브', 'DJ-07 Daejeon Central Hub'), tr('대전·충청행 롤테이너', 'Roll cages for Daejeon · Chungcheong')) } },
        this.drive([...L.boxOutLegs(from), ...connector('GJ', 'DJ')], 'departing', tags, this.releaser(this.docks, from, v.id)),
        { k: 'gate', gate: 'DJ', t: 1.4 },
        { k: 'do', fn: () => { v.site = 'DJ'; v.res = res; v.dest = null } },
        this.drive(djInLegs(res), 'inbound', tags),
        { k: 'do', fn: () => { this.djDocks[res].today++ } },
        ...this.djWork(v, 'DJ'),
      )
    }
  }

  /** 대전 야드 대기: 칸에 서서 도크가 비면 잡고, 도크로 후진해 작업한다(work는 도크에 붙은 뒤 할 일) */
  private djYardWait(v: Vehicle, stall: number, work: () => VTask[]): VTask[] {
    const tags: Record<string, VPhase> = { docking: 'docking' }
    return [
      this.drive(djYardIn(stall), 'inbound', tags),
      { k: 'do', fn: () => { v.res = -1; this.logV(v, 'yard', tr(`대전 야드 대기 Y${stall + 1}`, `Waiting in Daejeon yard Y${stall + 1}`)) } },
      {
        k: 'work', phase: 'yard',
        until: () => {
          const d = this.freeIdx(this.djDocks)
          if (d < 0) return false
          this.djDocks[d].vehicle = v.id
          v.res = d
          this.logV(v, 'yard', tr(`도크 배정 · 대전 ${d + 1}`, `Dock assigned · Daejeon ${d + 1}`))
          // 대기 칸은 빠져나가면서 비운다
          v.tasks.splice(1, 0,
            this.drive(djYardToDock(stall, d), 'inbound', tags, this.releaser(this.djYard, stall, v.id), 14),
            { k: 'do', fn: () => { this.djDocks[d].today++ } },
            ...work(),
          )
          return true
        },
      },
    ]
  }

  /** 대전 협력사 입고 트럭: 지도 동쪽 밖 → 대전(도크 또는 야드 대기) → 하차 → 동쪽으로 */
  private planSupplier(v: Vehicle) {
    const tags: Record<string, VPhase> = { highway: 'highway', approach: 'enroute', 'exit-site': 'departing', exit: 'departing', docking: 'docking' }
    const unload: () => VTask[] = () => [
      {
        k: 'work', phase: 'unloading',
        tick: (dt) => { v.door = Math.min(1, v.door + dt * 0.8); if (v.door > 0.9 && this.djwh.canUnload(v.res)) v.cargoDone = Math.max(0, v.cargoDone - dt * 30) },
        until: () => v.cargoDone <= 0,
      },
      // 빈 차로 돌아가지 않고 대전·충청 거래처로 나갈 출고 물량을 싣는다(되돌이 운송)
      { k: 'do', fn: () => { v.shipment.customer = tr('대전·충청 거래처 출고 물량', 'Outbound volume for Daejeon · Chungcheong clients') } },
      { k: 'work', phase: 'loading', tick: (dt) => { if (this.djwh.canLoad(v, dt)) v.cargoDone = Math.min(v.cargoTotal, v.cargoDone + dt * 30) }, until: () => v.cargoDone >= v.cargoTotal },
      { k: 'work', phase: 'closing', tick: (dt) => (v.door = Math.max(0, v.door - dt * 0.8)), until: () => v.door <= 0 },
      { k: 'do', fn: () => {
        const d = v.res
        v.tasks.push(
          { k: 'do', fn: () => { v.dest = 'OFF'; this.shipment(v, tr('DJ-07 대전 중부허브', 'DJ-07 Daejeon Central Hub'), tr('대전·충청 거래처', 'Daejeon · Chungcheong clients'), tr('거래처 출고 물량', 'Client outbound volume')) } },
          this.drive([...djOutLegs(d), ...connector('DJ', 'E')], 'departing', tags, this.releaser(this.djDocks, d, v.id)),
          { k: 'hide', t: 30 + r() * 40 },
          { k: 'do', fn: () => { v.res = -1 } },
        )
      } },
    ]
    const start: VTask[] = [
      { k: 'do', fn: () => { v.dest = 'DJ'; v.cargoTotal = 1200; v.cargoDone = 1200; this.shipment(v, tr('협력사 물류센터', 'Partner logistics center'), tr('DJ-07 대전 중부허브', 'DJ-07 Daejeon Central Hub'), pick(LL(['하루마켓', '온담푸드', '다솜리빙', '모아마트'], ['Haru Market', 'Ondam Food', 'Dasom Living', 'Moa Mart']), r)) } },
      this.drive(connector('E', 'DJ'), 'enroute', { highway: 'highway', approach: 'enroute' }),
      { k: 'gate', gate: 'DJ', t: 1.4 },
      { k: 'do', fn: () => { v.site = 'DJ'; v.dest = null } },
    ]
    const dock = this.djYard.some((y) => y.vehicle) ? -1 : this.freeIdx(this.djDocks)
    if (dock >= 0) {
      this.djDocks[dock].vehicle = v.id
      v.res = dock
      v.tasks.push(...start, this.drive(djInLegs(dock), 'inbound', tags), { k: 'do', fn: () => { this.djDocks[dock].today++ } }, ...unload())
      return
    }
    const stall = this.freeIdx(this.djYard)
    if (stall < 0) {
      v.tasks.push({ k: 'hide', t: 8 })
      return
    }
    this.djYard[stall].vehicle = v.id
    v.tasks.push(...start, ...this.djYardWait(v, stall, unload))
  }

  private parkDJ(v: Vehicle, dock: number, progress: number) {
    this.djDocks[dock].vehicle = v.id
    v.res = dock
    v.site = 'DJ'
    v.cargoTotal = 1200
    v.cargoDone = progress
    v.door = 1
    this.shipment(v, tr('GJ-01 곤지암 메가허브', 'GJ-01 Gonjiam Mega Hub'), tr('DJ-07 대전 중부허브', 'DJ-07 Daejeon Central Hub'), tr('대전·충청행 롤테이너', 'Roll cages for Daejeon · Chungcheong'))
    this.placeAtEnd(v, djInLegs(dock))
    v.tasks.push(...this.djWork(v, 'DJ'))
  }

  private parkAirAP(v: Vehicle, dock: number, progress: number) {
    this.apDocks[dock].vehicle = v.id
    v.res = dock
    v.site = 'AP'
    v.cargoTotal = 640
    v.cargoDone = progress
    v.door = 1
    this.shipment(v, tr('GJ-01 곤지암 메가허브', 'GJ-01 Gonjiam Mega Hub'), tr('AP-06 인천공항 화물터미널', 'AP-06 Incheon Airport Cargo Terminal'), tr('역직구 수출 화물', 'Cross-border export cargo'))
    this.placeAtEnd(v, apInLegs(dock))
    v.tasks.push(...this.airWork(v, 'AP').slice(2))
    this.airport.receiveExports(2)
  }

  private shipment(v: Vehicle, origin: string, dest: string, customer: string) {
    const now = this.clock
    const m = 60
    v.trip++
    v.shipment = {
      no: v.kind === 'van' ? invoiceNo() : `LH-${randInt(78400, 79600, r)}`,
      customer, origin, dest,
      times: [now - randInt(60, 120, r) * m, now - randInt(10, 40, r) * m, now, now + randInt(12, 25, r) * m, now + randInt(30, 60, r) * m],
    }
    // 출발 작업 안에서 불렸고 도착지가 지도 안 거점이면 도착 약속을 정한다(처음 배치 park*는 제외)
    const code = /^([A-Z]{2})-\d\d/.exec(dest)?.[1]
    if (this.inDo === v && code && v.kind !== 'van') this.promises.plan(v, code)
    else if (this.inDo === v) v.promise = null
    // 다온마을 배송차: 정차지별 고객 안내 시간대
    if (this.inDo === v && v.kind === 'van' && v.home === 'IN') this.promises.planVan(v)
    // 새 운행: 지난 운행의 기사 메시지 지연·운행 불가 표시를 지운다
    if (this.inDo === v) this.driver.clear(v.id)
  }

  /** 운행 기록 한 줄(최근 12개) */
  logV(v: Vehicle, kind: string, text: string) {
    v.log.unshift({ t: this.clock, kind, text })
    if (v.log.length > 12) v.log.pop()
  }

  private wingWork(v: Vehicle, loading: boolean): VTask[] {
    return [
      {
        k: 'work', phase: loading ? 'loading' : 'unloading', tick: (dt) => (v.wing = Math.min(1, v.wing + dt * 0.45)),
        until: () => (loading ? v.cargo.every(Boolean) : v.cargo.every((c) => !c)) && !v.reserved.some(Boolean),
      },
      { k: 'work', phase: 'closing', tick: (dt) => (v.wing = Math.max(0, v.wing - dt * 0.45)), until: () => v.wing <= 0 },
    ]
  }

  // 윙바디: 이천 상차 ↔ 곤지암 하차
  private planWing(v: Vehicle) {
    const fromIC = v.site === 'IC'
    const target = fromIC ? this.bays : this.icBays
    const res = this.freeIdx(target)
    if (res < 0) {
      v.tasks.push({ k: 'wait', phase: 'waiting', t: 2 })
      return
    }
    target[res].vehicle = v.id
    const from = v.res
    const tags: Record<string, VPhase> = { highway: 'highway', approach: 'enroute', 'exit-site': 'departing', exit: 'departing', reverse: 'departing' }
    if (fromIC) {
      v.tasks.push(
        { k: 'do', fn: () => { v.dest = 'GJ'; this.shipment(v, tr('이천 풀필먼트센터', 'Icheon Fulfillment Center'), tr('GJ-01 곤지암 메가허브', 'GJ-01 Gonjiam Mega Hub'), pick(CUSTOMERS, r)); this.onDepart(v) } },
        this.drive([...icWingOut(from), ...connector('IC', 'GJ')], 'departing', tags, this.releaser(this.icBays, from, v.id)),
        { k: 'gate', gate: 'GJ', t: 1.4 },
        { k: 'do', fn: () => { v.site = 'GJ'; v.res = res; v.dest = null } },
        this.drive(L.wingInLegs(res), 'inbound'),
        { k: 'do', fn: () => { this.bays[res].today++; v.cargoDone = 0 } },
        ...this.wingWork(v, false),
      )
    } else {
      v.tasks.push(
        { k: 'do', fn: () => { v.dest = 'IC'; this.shipment(v, tr('GJ-01 곤지암 메가허브', 'GJ-01 Gonjiam Mega Hub'), tr('이천 풀필먼트센터', 'Icheon Fulfillment Center'), tr('공 파렛트 회수', 'Empty pallet return')) } },
        this.drive([...L.wingOutLegs(from), ...connector('GJ', 'IC')], 'departing', tags, this.releaser(this.bays, from, v.id)),
        { k: 'gate', gate: 'IC', t: 1.4 },
        { k: 'do', fn: () => { v.site = 'IC'; v.res = res; v.dest = null } },
        this.drive(icWingIn(res), 'inbound'),
        { k: 'do', fn: () => { this.icBays[res].today++; v.cargo = L.WING_SLOTS.map(() => null); v.reserved = v.cargo.map(() => false); v.cargoDone = 0; v.cargoTotal = 8; v.trip++ } },
        ...this.wingWork(v, true),
      )
    }
  }

  private parkWingGJ(v: Vehicle, bay: number, unloaded: number) {
    this.bays[bay].vehicle = v.id
    v.res = bay
    v.site = 'GJ'
    v.cargo = L.WING_SLOTS.map(() => {
      const p = this.newPallet(pick(GOODS, r), 'onTruck', 'GJ')
      p.vehicleId = v.id
      p.look = 'stretch'
      p.wrapped = true
      return p.id
    })
    v.reserved = v.cargo.map(() => false)
    v.cargoTotal = 8
    for (let i = 0; i < unloaded; i++) {
      this.pallets.get(v.cargo[i]!)!.state = 'stored'
      v.cargo[i] = null
      v.cargoDone++
    }
    v.wing = 1
    this.shipment(v, tr('이천 풀필먼트센터', 'Icheon Fulfillment Center'), tr('GJ-01 곤지암 메가허브', 'GJ-01 Gonjiam Mega Hub'), pick(CUSTOMERS, r))
    this.placeAtEnd(v, L.wingInLegs(bay))
    v.tasks.push(...this.wingWork(v, false))
  }

  private parkWingIC(v: Vehicle, bay: number) {
    this.icBays[bay].vehicle = v.id
    v.res = bay
    v.site = 'IC'
    v.cargo = L.WING_SLOTS.map(() => null)
    v.reserved = v.cargo.map(() => false)
    v.cargoTotal = 8
    v.wing = 1
    this.shipment(v, tr('GJ-01 곤지암 메가허브', 'GJ-01 Gonjiam Mega Hub'), tr('이천 풀필먼트센터', 'Icheon Fulfillment Center'), tr('공 파렛트 회수', 'Empty pallet return'))
    this.placeAtEnd(v, icWingIn(bay))
    v.tasks.push(...this.wingWork(v, true))
  }

  // 11톤 간선: 곤지암 상차 ↔ 인천 하차
  private boxUnload(v: Vehicle): VTask[] {
    return [
      { k: 'work', phase: 'unloading', tick: (dt) => (v.door = Math.min(1, v.door + dt * 0.8)), until: () => v.cargoDone >= v.cargoTotal },
      { k: 'work', phase: 'closing', tick: (dt) => (v.door = Math.max(0, v.door - dt * 0.8)), until: () => v.door <= 0 },
    ]
  }

  private boxLoad(v: Vehicle): VTask[] {
    return [
      { k: 'work', phase: 'loading', tick: (dt) => this.loadBoxGJ(v, dt), until: () => v.cargoDone >= v.cargoTotal },
      { k: 'work', phase: 'closing', tick: (dt) => (v.door = Math.max(0, v.door - dt * 0.8)), until: () => v.door <= 0 },
    ]
  }

  private planBox(v: Vehicle) {
    const fromGJ = v.site === 'GJ'
    const target = fromGJ ? this.inDocks : this.docks
    const res = this.freeIdx(target)
    if (res < 0) {
      v.tasks.push({ k: 'wait', phase: 'waiting', t: 2 })
      return
    }
    target[res].vehicle = v.id
    const from = v.res
    const tags: Record<string, VPhase> = { highway: 'highway', approach: 'enroute', 'exit-site': 'departing', exit: 'departing', docking: 'docking' }
    if (fromGJ) {
      v.tasks.push(
        { k: 'do', fn: () => { v.dest = 'IN'; this.stats.trucksOut++; this.shipment(v, tr('GJ-01 곤지암 메가허브', 'GJ-01 Gonjiam Mega Hub'), tr('IN-05 인천 서브터미널', 'IN-05 Incheon Sub-terminal'), tr('다온택배 간선', 'Daon Parcel linehaul')); this.onDepart(v) } },
        this.drive([...L.boxOutLegs(from), ...connector('GJ', 'IN')], 'departing', tags, this.releaser(this.docks, from, v.id)),
        { k: 'gate', gate: 'IN', t: 1.4 },
        { k: 'do', fn: () => { v.site = 'IN'; v.res = res; v.dest = null } },
        this.drive(inBoxIn(res), 'inbound', tags),
        { k: 'do', fn: () => { this.inDocks[res].today++; v.cargoDone = 0 } },
        ...this.boxUnload(v),
      )
    } else {
      v.tasks.push(
        { k: 'do', fn: () => { v.dest = 'GJ'; this.shipment(v, tr('IN-05 인천 서브터미널', 'IN-05 Incheon Sub-terminal'), tr('GJ-01 곤지암 메가허브', 'GJ-01 Gonjiam Mega Hub'), tr('빈 차 회송', 'Empty return')); this.cs.onTruckDepartIN(v) } },
        this.drive([...inBoxOut(from), ...connector('IN', 'GJ')], 'departing', tags, this.releaser(this.inDocks, from, v.id)),
        { k: 'gate', gate: 'GJ', t: 1.4 },
        { k: 'do', fn: () => { v.site = 'GJ'; v.res = res; v.dest = null; this.cs.onTruckArriveGJ(v) } },
        this.drive(L.boxInLegs(res), 'inbound', tags),
        { k: 'do', fn: () => { this.docks[res].today++; v.cargoDone = 0 } },
        ...this.boxLoad(v),
      )
    }
  }

  private loadBoxGJ(v: Vehicle, dt: number) {
    v.door = Math.min(1, v.door + dt * 0.8)
    if (v.door > 0.9) v.cargoDone = Math.min(v.cargoTotal, v.cargoDone + dt * 18)
    if (this.story.stage === 3 && this.story.timer <= 0 && !this.story.vehicle) this.story.vehicle = v.id
  }

  private parkBoxGJ(v: Vehicle, dock: number) {
    this.docks[dock].vehicle = v.id
    v.res = dock
    v.site = 'GJ'
    v.cargoTotal = 1200
    v.cargoDone = randInt(200, 800, r)
    v.door = 1
    this.shipment(v, tr('IN-05 인천 서브터미널', 'IN-05 Incheon Sub-terminal'), tr('GJ-01 곤지암 메가허브', 'GJ-01 Gonjiam Mega Hub'), tr('빈 차 회송', 'Empty return'))
    this.placeAtEnd(v, L.boxInLegs(dock))
    v.tasks.push(...this.boxLoad(v))
  }

  private parkBoxIN(v: Vehicle, dock: number) {
    this.inDocks[dock].vehicle = v.id
    v.res = dock
    v.site = 'IN'
    v.cargoTotal = 1200
    v.cargoDone = 400
    v.door = 1
    this.shipment(v, tr('GJ-01 곤지암 메가허브', 'GJ-01 Gonjiam Mega Hub'), tr('IN-05 인천 서브터미널', 'IN-05 Incheon Sub-terminal'), tr('다온택배 간선', 'Daon Parcel linehaul'))
    this.placeAtEnd(v, inBoxIn(dock))
    v.tasks.push(...this.boxUnload(v))
  }

  // 곤지암 분류장 1톤: 광주 시내 배송(지방도로 빠져나감)
  private vanLoad(v: Vehicle): VTask[] {
    return [
      { k: 'work', phase: 'loading', tick: (dt) => (v.door = Math.min(1, v.door + dt * 0.8)), until: () => v.cargoDone >= v.cargoTotal },
      { k: 'work', phase: 'closing', tick: (dt) => (v.door = Math.max(0, v.door - dt * 0.8)), until: () => v.door <= 0 },
    ]
  }

  private parkGjVan(v: Vehicle, slot: number, progress: number) {
    this.slots[slot].vehicle = v.id
    v.res = slot
    v.cargoTotal = 180
    v.cargoDone = Math.min(progress, 168)
    v.zone = pick(DELIVERY_ZONES, r)
    v.door = 1
    this.shipment(v, tr('GJ-01 곤지암 메가허브', 'GJ-01 Gonjiam Mega Hub'), tr(`광주시 ${v.zone}`, `Gwangju-si ${v.zone}`), pick(CUSTOMERS, r))
    this.placeAtEnd(v, L.vanInLegs(slot))
    v.tasks.push(...this.vanLoad(v))
  }

  private planGjVan(v: Vehicle) {
    const from = v.res
    v.tasks.push(
      { k: 'do', fn: () => { v.dest = 'OFF'; this.slots[from].today++ } },
      this.drive([...L.vanOutLegs(from), ...connector('GJ', 'S')], 'departing', { highway: 'highway', approach: 'delivering', exit: 'departing' }, this.releaser(this.slots, from, v.id)),
      { k: 'hide', t: 14 + r() * 18 },
      { k: 'do', fn: () => this.gjVanReturn(v) },
    )
  }

  private gjVanReturn(v: Vehicle) {
    const slot = this.freeIdx(this.slots)
    if (slot < 0) {
      v.tasks.push({ k: 'hide', t: 5 }, { k: 'do', fn: () => this.gjVanReturn(v) })
      return
    }
    this.slots[slot].vehicle = v.id
    v.tasks.push(
      { k: 'do', fn: () => { v.dest = 'GJ'; v.cargoTotal = 180; v.cargoDone = 0; v.zone = pick(DELIVERY_ZONES, r); this.shipment(v, tr('GJ-01 곤지암 메가허브', 'GJ-01 Gonjiam Mega Hub'), tr(`광주시 ${v.zone}`, `Gwangju-si ${v.zone}`), pick(CUSTOMERS, r)) } },
      this.drive(connector('S', 'GJ'), 'returning', { highway: 'highway', approach: 'enroute' }),
      { k: 'gate', gate: 'GJ', t: 1.2 },
      { k: 'do', fn: () => { v.site = 'GJ'; v.res = slot; v.dest = null } },
      this.drive(L.vanInLegs(slot), 'inbound', { docking: 'docking' }),
      ...this.vanLoad(v),
    )
  }

  // 인천 1톤: 다온마을 배송(기사별 슬롯 고정)
  private parkInVan(v: Vehicle, slot: number, progress: number) {
    v.site = 'IN'
    v.cargoTotal = 160
    v.cargoDone = Math.min(progress, 150)
    v.door = 1
    v.zone = tr('다온마을', 'Daon Village')
    this.shipment(v, tr('IN-05 인천 서브터미널', 'IN-05 Incheon Sub-terminal'), tr('다온마을 배송구역', 'Daon Village Delivery Zone'), tr('다온마을', 'Daon Village'))
    this.placeAtEnd(v, inVanIn(slot))
    v.tasks.push(...this.vanLoad(v))
  }

  private planTownVan(v: Vehicle) {
    const slot = v.res
    const ids = [...(VARIANTS[v.variant] ?? VARIANTS.apt)]
    // 노선을 바꾼 사이에 스토리 상자가 이 차에 실렸으면 그 동도 들른다(순서는 길이 정한다)
    if (this.story.van === v.id && !ids.includes(this.story.stopId)) ids.push(this.story.stopId)
    // 승인된 정차지 이관을 받은 차는 그 정차지도 들른다(최대 6곳). 새 운행이라 지난 이관 표시는 지운다
    for (const id of this.extraStops[v.id] ?? []) if (!ids.includes(id) && ids.length < 6) ids.push(id)
    delete this.extraStops[v.id]
    this.movedStops.delete(v.id)
    v.stops = ids.map((id) => STOPS[id])
    v.stopIdx = 0
    let odo0 = 0
    v.tasks.push({
      k: 'do', fn: () => {
        odo0 = v.odo
        v.dest = 'TW'
        v.delivered = 0
        this.inSlots[slot].today++
        this.shipment(v, tr('IN-05 인천 서브터미널', 'IN-05 Incheon Sub-terminal'), tr('다온마을 배송구역', 'Daon Village Delivery Zone'), tr(`${v.stops.length}곳 배송`, `${v.stops.length} ${plural(v.stops.length, 'stop')}`))
        this.onDepart(v)
        // 정차지마다 고객 메모를 붙이고, 연결된 AI가 있으면 해석을 요청한다
        v.memos = {}
        for (const st of v.stops) {
          const text = this.story.van === v.id && this.story.stopId === st.id ? this.story.memo : pick(MEMO_POOL, r)
          v.memos[st.id] = { text, plan: null, status: text ? 'pending' : 'none' }
        }
        if (this.story.van === v.id && this.story.memoPlan) {
          const m = v.memos[this.story.stopId]
          if (m) { m.plan = this.story.memoPlan; m.status = 'ready' }
        }
        this.onVanDepart?.(v)
        this.cs.onVanDepart(v)
      },
    })
    v.tasks.push(this.drive(inVanOut(slot), 'departing'))
    v.tasks.push({ k: 'do', fn: () => { v.site = 'TW' } })
    for (const seg of townRoute(ids)) {
      v.tasks.push(this.drive(seg.legs, 'delivering'))
      if (seg.stop) {
        const stop = seg.stop
        v.tasks.push(
          { k: 'do', fn: () => this.startWalk(v, stop) },
          { k: 'work', phase: 'delivering', tick: (dt) => this.walkTick(v, dt, stop), until: () => v.walk.done },
          { k: 'do', fn: () => { v.stopIdx++ } },
        )
      }
    }
    v.tasks.push(
      { k: 'gate', gate: 'IN', t: 1.2 },
      { k: 'do', fn: () => { v.site = 'IN'; v.dest = null; v.cargoDone = 0; this.cs.onVanBack(v); this.zones.logTrip(v, v.odo - odo0, v.stops.length) } },
      this.drive(inVanIn(slot), 'returning', { docking: 'docking' }),
      ...this.vanLoad(v),
    )
  }

  /** 메모 해석 결과로 맡길 곳·걷는 목적지를 정한다(정책은 코드, 판단은 AI) */
  private startWalk(v: Vehicle, stop: Stop) {
    const from = L.toWorld(v.x, v.z, v.heading, -1.25, -1.2)
    // 승인된 이관: 이 정차지는 다음 배송차가 들른다
    if (this.movedStops.get(v.id)?.has(stop.id)) {
      v.walk = { on: false, stage: 'out', t: 0, pause: 0, from, to: stop.door, stop: stop.id, done: true, mode: 'moved', note: tr('다음 배송차로 이관', 'Moved to the next delivery van'), flags: [] }
      this.memoStats.moved++
      return
    }
    const memo = v.memos[stop.id]
    const plan = memo?.plan ?? null
    let to = stop.door
    let mode: DropMode = 'door'
    let pause = 1.2
    let note = ''
    const flags: string[] = []
    if (plan) {
      let drop = plan.dropConfidence >= 0.6 ? plan.drop : 'confirm'
      if (drop === 'confirm') {
        pause += 2.4
        note = tr('해석 불확실 → 고객 확인 통화 후 문 앞', 'Unclear note → call the customer, then doorstep')
      }
      // 택배함이 가득 찼으면 메모에 적힌 대체 장소로
      if (drop === 'locker' && stop.locker && r() < 0.18) {
        const fb = plan.fallback !== 'unspecified' && plan.fallback !== 'locker' ? plan.fallback : 'door'
        note = `${tr('택배함 만석', 'Parcel locker full')} → ${fb === 'guard' ? tr('경비실', 'security office') : tr('문 앞', 'doorstep')}`
        drop = fb
      }
      if (drop === 'guard') {
        if (stop.guard) { to = stop.guard; mode = 'guard' } else note = tr('경비실 없는 건물 → 문 앞', 'No security office in this building → doorstep')
      } else if (drop === 'locker') {
        if (stop.locker) { to = stop.locker; mode = 'locker' } else note = tr('택배함 없는 건물 → 문 앞', 'No parcel locker in this building → doorstep')
      } else if (drop === 'handover') {
        mode = 'handover'
        pause += 2.2
      } else if (drop === 'reschedule') {
        mode = 'reschedule'
        note = tr('고객 요청으로 재배송 예약', 'Redelivery booked at customer request')
      } else if (drop === 'confirm') mode = 'confirm'
      if (plan.noBell > 0.5) flags.push(tr('벨·노크 금지', 'No bell or knock'))
      if (plan.fragile > 0.5) flags.push(tr('취급주의', 'Fragile'))
      if (plan.callFirst > 0.5) { flags.push(tr('연락 요청', 'Call first')); pause += 1 }
    }
    v.walk = { on: mode !== 'reschedule', stage: 'out', t: 0, pause, from, to, stop: stop.id, done: mode === 'reschedule', mode, note, flags }
    if (memo?.text || plan) {
      this.memoStats[mode]++
      this.memoLog.unshift({ time: this.clock, vehicle: v.id, stop: stop.label, text: memo?.text ?? '', mode, confidence: plan?.dropConfidence ?? null, flags, note })
      if (this.memoLog.length > 12) this.memoLog.pop()
    }
    if (this.story.van === v.id && this.story.stopId === stop.id) this.story.dropMode = mode
  }

  private walkTick(v: Vehicle, dt: number, stop: Stop) {
    const w = v.walk
    const dist = Math.max(1, Math.hypot(w.to.x - w.from.x, w.to.z - w.from.z))
    if (w.stage === 'out') {
      w.t = Math.min(1, w.t + (dt * (w.flags.includes(tr('취급주의', 'Fragile')) ? 1.6 : 2.1)) / dist)
      if (w.t >= 1) {
        w.stage = 'door'
        this.cs.onStopVisit(v, stop.id)
        const n = Math.min(v.cargoDone, stop.boxes)
        v.cargoDone -= n
        v.delivered++
        this.stats.delivered += n
        if (stop.id === 'LOCK') this.stats.lockerBoxes += 2
        this.town.onDrop(stop.id, w.mode)
        // 배송 완료 증빙(고객 휴대폰 "배송 완료 사진")
        this.proofs.set(`${v.id}:${stop.id}`, { time: this.clock, mode: w.mode, van: v.id })
        if (this.story.van === v.id && this.story.stage === 6 && this.story.stopId === stop.id) {
          this.storyStage(7)
          this.story.timer = 26
        }
      }
    } else if (w.stage === 'door') {
      w.pause -= dt
      if (w.pause <= 0) w.stage = 'back'
    } else {
      if (w.flags.includes(tr('취급주의', 'Fragile'))) dt *= 0.8
      w.t = Math.max(0, w.t - (dt * 1.9) / dist)
      if (w.t <= 0) {
        w.on = false
        w.done = true
      }
    }
  }

  // 냉동탑차: 이천 콜드체인 ↔ 서울 새벽배송(지도 밖)
  private reeferWork(v: Vehicle): VTask[] {
    return [
      {
        k: 'work', phase: 'loading', until: () => v.cargoDone >= v.cargoTotal,
        tick: (dt) => {
          v.door = Math.min(1, v.door + dt * 0.8)
          if (v.door > 0.9) v.cargoDone = Math.min(v.cargoTotal, v.cargoDone + dt * 0.4)
        },
      },
      { k: 'work', phase: 'closing', tick: (dt) => (v.door = Math.max(0, v.door - dt * 0.8)), until: () => v.door <= 0 },
    ]
  }

  private parkReefer(v: Vehicle, dock: number) {
    this.icReefers[dock].vehicle = v.id
    v.res = dock
    v.site = 'IC'
    v.cargoTotal = 14
    v.cargoDone = randInt(2, 10, r)
    v.door = 1
    this.shipment(v, tr('이천 콜드체인', 'Icheon Cold Chain'), tr('서울 새벽배송 거점', 'Seoul dawn delivery base'), tr('새벽팜', 'Dawn Farm'))
    this.placeAtEnd(v, icReeferIn(dock))
    v.tasks.push(...this.reeferWork(v))
  }

  private planReefer(v: Vehicle) {
    const from = v.res
    v.tasks.push(
      { k: 'do', fn: () => { v.dest = 'OFF'; this.shipment(v, tr('이천 콜드체인', 'Icheon Cold Chain'), tr('서울 새벽배송 거점', 'Seoul dawn delivery base'), tr('새벽팜', 'Dawn Farm')); this.cold.onDepart(v) } },
      this.drive([...icReeferOut(from), ...connector('IC', 'W')], 'departing', { highway: 'highway', exit: 'departing' }, this.releaser(this.icReefers, from, v.id)),
      { k: 'do', fn: () => this.cold.onArrive(v) },
      { k: 'hide', t: 18 + r() * 20 },
      { k: 'do', fn: () => this.reeferReturn(v) },
    )
  }

  private reeferReturn(v: Vehicle) {
    const dock = this.freeIdx(this.icReefers)
    if (dock < 0) {
      v.tasks.push({ k: 'hide', t: 5 }, { k: 'do', fn: () => this.reeferReturn(v) })
      return
    }
    this.icReefers[dock].vehicle = v.id
    v.tasks.push(
      { k: 'do', fn: () => { v.dest = 'IC'; v.cargoDone = 0 } },
      this.drive(connector('W', 'IC'), 'returning', { highway: 'highway', approach: 'enroute' }),
      { k: 'gate', gate: 'IC', t: 1.2 },
      { k: 'do', fn: () => { v.site = 'IC'; v.res = dock; v.dest = null; this.icReefers[dock].today++; this.cold.onDock(v) } },
      this.drive(icReeferIn(dock), 'inbound', { docking: 'docking' }),
      ...this.reeferWork(v),
    )
  }

  // 컨테이너 트레일러: 부산신항(수출 반입·수입 반출) ↔ 곤지암 CY
  private planTrailer(v: Vehicle) {
    // 해상 여정 컨테이너가 장치장에 있으면 그 블록으로 간다(반출 배차)
    const rb = 1 + Math.floor(r() * 2)
    const fb = this.port.focusBlock()
    const block = fb >= 0 ? fb : rb
    const bx = PORT.blocks[block]
    v.crane = block
    v.site = 'BS'
    const tags: Record<string, VPhase> = { highway: 'highway', approach: 'enroute', 'exit-site': 'departing', exit: 'departing' }
    let reviewT = 3
    v.tasks.push(
      { k: 'do', fn: () => { v.dest = 'BS'; v.cargoTotal = 1; v.cargoDone = v.box ? 1 : 0 } },
      this.drive(bsInLegs(bx), 'inbound'),
      { k: 'do', fn: () => this.port.requestLandside(v.id, block, v.box) },
      {
        k: 'work', phase: 'craning', until: () => this.port.trailerDone(v.id),
        tick: () => {
          const b = this.port.trailerBox(v.id)
          v.box = b
          v.container = b?.color ?? null
        },
      },
      // 수입 컨테이너 적하목록 검토가 끝날 때까지 최대 3초
      { k: 'work', phase: 'craning', until: () => v.box?.manifest?.status !== 'pending', tick: (dt) => { reviewT -= dt; if (reviewT <= 0 && v.box?.manifest) v.box.manifest.status = 'error' } },
      {
        k: 'do', fn: () => {
          v.box = this.port.release(v.id)
          v.container = v.box?.color ?? null
          v.cargoDone = 1
          const m = v.box?.manifest
          const xray = !!m?.flags && m.flags.mismatch > 0.6
          if (xray) {
            this.port.stats.xray++
            this.gateLog.markXray(v.id)
          }
          this.shipment(v, tr('BS-04 부산신항', 'BS-04 Busan New Port'), tr('GJ-01 곤지암 CY', 'GJ-01 Gonjiam CY'), m?.shipper ?? tr('수입 화주', 'Import shipper'))
          const out = bsOutLegs(bx, xray)
          v.dest = 'GJ'
          if (xray) {
            v.tasks.push(
              this.drive([out[0]], 'departing', tags),
              { k: 'wait', phase: 'inspecting', t: 6 },
              this.drive([out[1], ...connector('BS', 'GJ')], 'departing', tags),
            )
          } else v.tasks.push(this.drive([...out, ...connector('BS', 'GJ')], 'departing', tags))
          v.tasks.push(
            { k: 'gate', gate: 'GJ', t: 1.4 },
            { k: 'do', fn: () => { v.site = 'GJ'; v.dest = null } },
            this.drive(L.trailerInLegs(), 'inbound'),
            { k: 'wait', phase: 'unloading', t: 7 },
            {
              k: 'do', fn: () => {
                // 수입 컨테이너를 내려놓고 수출 컨테이너를 싣는다
                this.cy.today++
                v.box = this.port.newBox('export')
                v.container = v.box.color
                v.dest = 'BS'
                this.shipment(v, tr('GJ-01 곤지암 CY', 'GJ-01 Gonjiam CY'), tr('BS-04 부산신항', 'BS-04 Busan New Port'), tr('수출 화주', 'Export shipper'))
              },
            },
            this.drive([...L.trailerOutLegs(), ...connector('GJ', 'BS')], 'departing', tags),
            { k: 'gate', gate: 'BS', t: 1.2 },
            { k: 'do', fn: () => { v.site = 'BS' } },
          )
        },
      },
    )
  }

  // ───────────────────────── 지게차(곤지암 하차 · 이천 상차)

  private slotWorld(v: Vehicle, i: number) {
    const s = L.WING_SLOTS[i]
    const p = L.toWorld(v.x, v.z, v.heading, s.lx, s.lz)
    const side = Math.sign(s.lx)
    const sd = { x: Math.cos(v.heading) * side, z: -Math.sin(v.heading) * side }
    return { p, sd }
  }

  private move(pts: V2[], reverse = false, speed = 3.4): Action {
    return { k: 'move', route: new Route([leg(pts, { reverse, speed: reverse ? 1.7 : speed, kmh: reverse ? 4 : 11, r: 1.6 })]) }
  }

  private assignUnload(f: Forklift, v: Vehicle, i: number) {
    v.reserved[i] = true
    f.job = { vehicleId: v.id, slot: i }
    f.park = -1
    const { p, sd } = this.slotWorld(v, i)
    const approach = v2(p.x + sd.x * 1.6, p.z + sd.z * 1.6)
    const stage = v2(p.x + sd.x * 4.6, p.z + sd.z * 4.6)
    const door = this.doors[v.res].x
    const T = L.TRANSIT_Z
    f.status = 'toJob'
    f.queue = [
      this.move([v2(f.x, f.z), v2(f.x, T), v2(stage.x, T), stage, approach]),
      { k: 'fork', to: L.WING.bedY + 0.02 },
      {
        k: 'do', fn: () => {
          f.status = 'unloading'
          const id = v.cargo[i]
          v.cargo[i] = null
          v.reserved[i] = false
          v.cargoDone++
          if (id) {
            const pl = this.pallets.get(id)!
            pl.state = 'onFork'
            pl.forkliftId = f.id
            pl.vehicleId = undefined
            f.carrying = id
          }
        },
      },
      { k: 'fork', to: L.WING.bedY + 0.2 },
      this.move([approach, stage], true),
      { k: 'fork', to: 0.35 },
      { k: 'do', fn: () => (f.status = 'putaway') },
      this.move([stage, v2(stage.x, T), v2(door, T), v2(door, L.DOOR_IN_Z)]),
      {
        k: 'do', fn: () => {
          if (f.carrying) {
            const pl = this.pallets.get(f.carrying)!
            pl.state = 'stored'
            pl.forkliftId = undefined
            this.stats.stock++
            this.stats.palletsIn++
            if (pl.story && this.story.stage === 2) {
              this.storyStage(3)
              this.story.timer = 14
              this.story.vehicle = null
            }
          }
          f.carrying = null
          f.status = 'returning'
        },
      },
      { k: 'wait', t: 0.5 },
      this.move([v2(door, L.DOOR_IN_Z), v2(door, L.DOOR_OUT_Z)], true),
      { k: 'do', fn: () => { f.job = null; f.status = 'idle'; f.moves++; f.idleFor = 0 } },
    ]
  }

  /** 이천: 출고 라인 끝의 랩핑 파렛트를 윙바디 측면에 싣는다 */
  private assignLoad(f: Forklift, line: number, v: Vehicle, i: number) {
    const ln = this.icLines[line]
    const pid = ln.pallets[0]
    const pal = this.pallets.get(pid)!
    pal.reserved = true
    v.reserved[i] = true
    f.job = { vehicleId: v.id, slot: i }
    f.park = -1
    const { p, sd } = this.slotWorld(v, i)
    const approach = v2(p.x + sd.x * 1.6, p.z + sd.z * 1.6)
    const stage = v2(p.x + sd.x * 4.6, p.z + sd.z * 4.6)
    const C = IC.corridorZ
    const pickC = v2(ln.x, IC.pickZ + 1.55)
    f.status = 'toJob'
    f.queue = [
      this.move([v2(f.x, f.z), v2(f.x, C), v2(ln.x, C), pickC]),
      { k: 'fork', to: IC.rollerY + 0.05 },
      {
        k: 'do', fn: () => {
          f.status = 'loading'
          ln.pallets.shift()
          pal.state = 'onFork'
          pal.forkliftId = f.id
          pal.reserved = false
          f.carrying = pid
        },
      },
      { k: 'fork', to: IC.rollerY + 0.25 },
      this.move([pickC, v2(ln.x, C)], true),
      { k: 'fork', to: L.WING.bedY + 0.2 },
      this.move([v2(ln.x, C), v2(stage.x, C), stage, approach]),
      { k: 'fork', to: L.WING.bedY + 0.02 },
      {
        k: 'do', fn: () => {
          v.cargo[i] = pid
          v.reserved[i] = false
          v.cargoDone++
          pal.state = 'onTruck'
          pal.vehicleId = v.id
          pal.forkliftId = undefined
          pal.site = 'GJ'
          f.carrying = null
          f.status = 'returning'
          this.stats.icPallets++
        },
      },
      { k: 'fork', to: L.WING.bedY - 0.1 },
      this.move([approach, stage], true),
      { k: 'fork', to: 0.35 },
      { k: 'do', fn: () => { f.job = null; f.status = 'idle'; f.moves++; f.idleFor = 0 } },
    ]
  }

  private goCharge(f: Forklift, c: number) {
    const ch = this.chargers[c]
    ch.forklift = f.id
    f.charger = c
    f.park = -1
    f.status = 'toCharge'
    const T = f.site === 'GJ' ? L.TRANSIT_Z : -4.5
    f.queue = [
      this.move([v2(f.x, f.z), v2(f.x, T), v2(ch.x, T), v2(ch.x, ch.spotZ)]),
      { k: 'do', fn: () => { f.status = 'charging'; ch.sessions++ } },
      { k: 'charge' },
      this.move([v2(ch.x, ch.spotZ), v2(ch.x, ch.spotZ + 3.2)], true),
      { k: 'do', fn: () => { ch.forklift = null; f.charger = -1; f.status = 'idle'; f.idleFor = 0 } },
    ]
  }

  private goPark(f: Forklift, k: number) {
    const spots = f.site === 'GJ' ? L.PARK_SPOTS : IC.park
    const p = spots[k]
    const T = f.site === 'GJ' ? L.TRANSIT_Z : IC.corridorZ
    f.park = k
    f.status = 'parking'
    f.queue = [
      this.move([v2(f.x, f.z), v2(f.x, T), v2(p.x, T), p]),
      { k: 'do', fn: () => { f.status = 'idle' } },
    ]
  }

  private dispatch() {
    const idle = (site: 'GJ' | 'IC') => this.forklifts.filter((f) => f.site === site && f.status === 'idle' && !f.queue.length)
    for (const site of ['GJ', 'IC'] as const) {
      for (const f of idle(site)) {
        if (f.battery < 30) {
          const c = this.chargers.findIndex((ch) => ch.site === site && !ch.forklift)
          if (c >= 0) this.goCharge(f, c)
        }
      }
    }
    for (const v of this.vehicles) {
      if (v.kind !== 'wing' || v.site !== 'GJ' || v.phase !== 'unloading' || v.wing < 0.95) continue
      for (let i = 0; i < v.cargo.length; i++) {
        if (!v.cargo[i] || v.reserved[i]) continue
        const side = Math.sign(L.WING_SLOTS[i].lx)
        if (this.forklifts.some((f) => f.job?.vehicleId === v.id && Math.sign(L.WING_SLOTS[f.job.slot].lx) === side)) continue
        const { p } = this.slotWorld(v, i)
        const cands = idle('GJ').filter((f) => f.battery >= 30)
        if (!cands.length) break
        cands.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))
        this.assignUnload(cands[0], v, i)
      }
    }
    for (const v of this.vehicles) {
      if (v.kind !== 'wing' || v.site !== 'IC' || v.phase !== 'loading' || v.wing < 0.95) continue
      for (let i = 0; i < v.cargo.length; i++) {
        if (v.cargo[i] || v.reserved[i]) continue
        const side = Math.sign(L.WING_SLOTS[i].lx)
        if (this.forklifts.some((f) => f.job?.vehicleId === v.id && Math.sign(L.WING_SLOTS[f.job.slot].lx) === side)) continue
        const ready = this.icLines
          .map((ln, k) => ({ k, ln, d: Math.abs(ln.x - v.x) }))
          .filter(({ ln }) => {
            const p = ln.pallets[0] ? this.pallets.get(ln.pallets[0]) : null
            return !!p && !!p.wrapped && !p.reserved && Math.abs(p.z - IC.pickZ) < 0.06
          })
          .sort((a, b) => a.d - b.d)[0]
        if (!ready) break
        const cands = idle('IC').filter((f) => f.battery >= 30)
        if (!cands.length) break
        cands.sort((a, b) => Math.hypot(a.x - ready.ln.x, a.z - IC.pickZ) - Math.hypot(b.x - ready.ln.x, b.z - IC.pickZ))
        this.assignLoad(cands[0], ready.k, v, i)
      }
    }
    for (const site of ['GJ', 'IC'] as const) {
      const spots = site === 'GJ' ? L.PARK_SPOTS : IC.park
      for (const f of idle(site)) {
        if (f.park >= 0 || f.idleFor < 2.5) continue
        const taken = new Set(this.forklifts.filter((x) => x.site === site).map((x) => x.park))
        const k = spots.findIndex((_, i) => !taken.has(i))
        if (k >= 0) this.goPark(f, k)
      }
    }
  }

  private stepForklift(f: Forklift, dt: number) {
    const a = f.queue[0]
    f.moving = false
    f.kmh = 0
    if (!a) {
      f.idleFor += dt
      return
    }
    switch (a.k) {
      case 'move': {
        const ds = a.route.step(dt)
        f.dist += ds
        const p = a.route.pose()
        f.x = p.x
        f.z = p.z
        f.heading = angleLerp(f.heading, p.heading, Math.min(1, dt * 7))
        f.moving = ds > 0
        f.kmh = a.route.speedKmh
        f.battery = Math.max(3, f.battery - dt * (f.carrying ? 0.32 : 0.22))
        if (a.route.done) f.queue.shift()
        break
      }
      case 'fork': {
        const d = a.to - f.fork
        f.fork += Math.sign(d) * Math.min(Math.abs(d), dt * 0.9)
        if (Math.abs(a.to - f.fork) < 0.005) {
          f.fork = a.to
          f.queue.shift()
        }
        break
      }
      case 'wait':
        a.t -= dt
        if (a.t <= 0) f.queue.shift()
        break
      case 'charge': {
        f.battery = Math.min(100, f.battery + dt * 2.4)
        const ch = this.chargers[f.charger]
        if (ch) ch.kwh += dt * 0.05
        if (f.battery >= 96) f.queue.shift()
        break
      }
      case 'do':
        f.queue.shift()
        a.fn()
        break
    }
  }

  // ───────────────────────── 이천: 출고 라인 · 랩핑 · AMR

  private stepIcLines(dt: number) {
    const demand = this.vehicles
      .filter((v) => v.kind === 'wing' && v.site === 'IC' && (v.phase === 'loading' || v.phase === 'inbound'))
      .reduce((s, v) => s + (v.phase === 'inbound' ? 8 : v.cargo.filter((c) => !c).length), 0)
    const supply = this.icLines.reduce((s, ln) => s + ln.pallets.length, 0) + this.forklifts.filter((f) => f.site === 'IC' && f.carrying).length
    const targets = [IC.pickZ, IC.wrapZ, -12.6]
    // 이천으로 오는 중인 윙바디(곤지암 출발): 배차되면 그 차 몫 주문을 미리 내보낸다(웨이브 릴리스)
    const coming = this.vehicles.filter((v) => v.kind === 'wing' && v.dest === 'IC' && v.site !== 'IC').length * 8
    const want = demand + coming
    // 분류기 → 슈트 → 적재 자리: 상자 8개가 쌓여야 파렛트가 된다
    this.icSort.step(dt, {
      busy: this.robots.filter((rb) => rb.state === 'atStation').length,
      deficit: want + 2 - supply,
      pallets: this.icLines.map((ln) => ln.pallets.length),
      headClear: this.icLines.map((ln) => ln.pallets.every((id) => this.pallets.get(id)!.z > ICS.headZ + 1.3)),
    })
    this.icLines.forEach((ln, k) => {
      ln.spawnT -= dt
      if (ln.spawnT <= 0 && ln.pallets.length < 3 && supply < want + 2 && this.icSort.ready(k)) {
        ln.spawnT = 2
        this.icSort.take(k)
        const p = this.newPallet(pick(GOODS, r), 'line', 'IC')
        p.x = ln.x
        p.z = ICS.headZ
        if (this.story.stage === 1 && !this.story.pallet) {
          p.story = true
          this.story.pallet = p.id
        }
        ln.pallets.push(p.id)
      }
      ln.wrapping = false
      ln.pallets.forEach((id, k) => {
        const p = this.pallets.get(id)!
        let tz = targets[k] ?? -12.6
        if (k === 0 && !p.wrapped) tz = IC.wrapZ
        const prev = k > 0 ? this.pallets.get(ln.pallets[k - 1])! : null
        if (prev) tz = Math.min(tz, prev.z - 1.6)
        if (p.z < tz) p.z = Math.min(tz, p.z + dt * 1.3)
        if (!p.wrapped && Math.abs(p.z - IC.wrapZ) < 0.05) {
          ln.wrapping = true
          ln.wrapT += dt
          if (ln.wrapT > 3.2) {
            p.wrapped = true
            p.look = 'stretch'
            ln.wrapT = 0
          }
        }
      })
    })
  }

  private stepAmr(dt: number) {
    const A = IC.amr
    const isAisle = (z: number) => Math.round((z - A.z0) / A.step) % 4 === 3
    const aisleZ = (z: number) => {
      let best = A.z1 + 3
      for (let zz = A.z0; zz <= A.z1 + 0.01; zz += A.step) if (isAisle(zz) && Math.abs(zz - z) < Math.abs(best - z)) best = zz
      return best
    }
    for (const rb of this.robots) {
      if (rb.wait > 0) {
        rb.wait -= dt
        continue
      }
      if (rb.path.length) {
        const t = rb.path[0]
        const dx = t.x - rb.x
        const dz = t.z - rb.z
        const d = Math.hypot(dx, dz)
        const sp = 2.4 * dt
        if (d > 0.01) rb.heading = angleLerp(rb.heading, Math.atan2(dx, dz), Math.min(1, dt * 10))
        if (d <= sp) {
          rb.x = t.x
          rb.z = t.z
          rb.dist += d
          rb.path.shift()
        } else {
          rb.x += (dx / d) * sp
          rb.z += (dz / d) * sp
          rb.dist += sp
        }
        rb.battery = Math.max(25, rb.battery - dt * 0.003)
        if (rb.pod >= 0 && (rb.state === 'toStation' || rb.state === 'return')) {
          const p = this.pods[rb.pod]
          p.x = rb.x
          p.z = rb.z
        }
        continue
      }
      if (rb.state === 'idle') {
        const free = this.pods.filter((p) => !p.carried)
        const p = free[Math.floor(r() * free.length)]
        rb.pod = this.pods.indexOf(p)
        p.carried = true
        rb.state = 'toPod'
        rb.path = [v2(rb.x, aisleZ(rb.z)), v2(p.hx, aisleZ(rb.z)), v2(p.hx, p.hz)]
      } else if (rb.state === 'toPod') {
        rb.state = 'toStation'
        rb.station = Math.floor(r() * IC.stations.length)
        const sx = IC.stations[rb.station]
        const p = this.pods[rb.pod]
        rb.path = [v2(p.hx, aisleZ(p.hz)), v2(sx, aisleZ(p.hz)), v2(sx, IC.stationZ - 3)]
        rb.wait = 0.6
      } else if (rb.state === 'toStation') {
        rb.state = 'atStation'
        rb.wait = 2.2
        this.stationPicks[rb.station] += 3
        if (r() < 0.3) this.orders++
      } else if (rb.state === 'atStation') {
        rb.state = 'return'
        const p = this.pods[rb.pod]
        rb.path = [v2(rb.x, aisleZ(p.hz)), v2(p.hx, aisleZ(p.hz)), v2(p.hx, p.hz)]
      } else if (rb.state === 'return') {
        const p = this.pods[rb.pod]
        p.x = p.hx
        p.z = p.hz
        p.carried = false
        rb.pod = -1
        rb.state = 'idle'
        rb.wait = 0.6
        rb.path = [v2(rb.x, aisleZ(rb.z))]
      }
    }
  }

  // ───────────────────────── 곤지암 분류장 컨베이어

  private stepParcels(dt: number) {
    this.belt += dt * 2.4
    const loading = this.vehicles.filter((v) => v.kind === 'van' && v.home === 'GJ' && v.site === 'GJ' && v.phase === 'loading' && v.door > 0.9)
    this.parcelTimer -= dt
    if (this.parcelTimer <= 0 && loading.length && this.parcels.length < 260) {
      this.parcelTimer = 0.24 + r() * 0.12
      const weights = loading.map((v) => Math.max(0, v.cargoTotal - v.cargoDone - this.parcels.filter((p) => p.slot === v.res).length * 6))
      const total = weights.reduce((a, b) => a + b, 0)
      let slot = -1
      if (total > 0) {
        let x = r() * total
        for (let i = 0; i < loading.length; i++) {
          x -= weights[i]
          if (x <= 0) {
            slot = loading[i].res
            break
          }
        }
      }
      this.parcels.push({
        x: L.CONVEYOR.x0 + 0.3, y: L.CONVEYOR.y + 0.22, z: L.CONVEYOR.z + (r() - 0.5) * 0.45,
        slot, phase: 0, t: 0, s: 0, feed: 0, size: 0.7 + r() * 0.6, tint: r(), spin: (r() - 0.5) * 0.5,
      })
    }
    const keep: Parcel[] = []
    for (const p of this.parcels) {
      if (p.phase === 0) {
        p.x += dt * 2.4
        const s = p.slot >= 0 ? this.slots[p.slot] : null
        const v = s?.vehicle ? this.vehicle(s.vehicle) : null
        if (s && v && v.phase === 'loading' && p.x >= s.x) {
          p.phase = 1
          p.t = 0
          p.x = s.x
        } else if (p.x > L.CONVEYOR.x1 - 0.4) continue
      } else {
        p.t += dt / 0.9
        const s = this.slots[p.slot]
        const rear = s.side === 'N' ? L.VAN_N_REAR - 0.4 : L.VAN_S_REAR + 0.4
        p.z = L.CONVEYOR.z + (rear - L.CONVEYOR.z) * Math.min(1, p.t)
        p.y = L.CONVEYOR.y + 0.22 - 0.35 * Math.min(1, p.t)
        if (p.t >= 1) {
          const v = s.vehicle ? this.vehicle(s.vehicle) : null
          if (v && v.kind === 'van') v.cargoDone = Math.min(v.cargoTotal, v.cargoDone + 6)
          this.stats.boxes += 6
          continue
        }
      }
      keep.push(p)
    }
    this.parcels = keep
  }

  // ───────────────────────── 인천 서브터미널: 신축 컨베이어 → 휠소터 → 슈트 → 1톤

  private slotCapacity(i: number, inflight: number[]) {
    const s = this.inSlots[i]
    const v = s.vehicle ? this.vehicle(s.vehicle) : null
    const aboard = v && v.site === 'IN' && (v.phase === 'loading' || v.phase === 'docking' || v.phase === 'closing') ? v.cargoDone : 0
    return 160 - aboard - (s.held + inflight[i]) * 8
  }

  private stepInParcels(dt: number) {
    this.inBelt += dt * 2.4
    const mainStart = IN.conv.x1
    const inflight = this.inSlots.map(() => 0)
    let onBelt = 0
    for (const p of this.inParcels) {
      if (p.phase < 2) onBelt++
      if (p.phase < 2 && p.slot >= 0) inflight[p.slot]++
    }

    for (let d = 0; d < this.inDocks.length; d++) {
      const dock = this.inDocks[d]
      const v = dock.vehicle ? this.vehicle(dock.vehicle) : null
      const unloading = !!v && v.site === 'IN' && v.phase === 'unloading' && v.door > 0.9
      dock.open += ((v && v.site === 'IN' && (v.phase === 'unloading' || v.phase === 'closing') ? v.door : 0) - dock.open) * Math.min(1, dt * 3)
      if (!unloading || !v) continue
      dock.spawnT -= dt
      if (dock.spawnT > 0 || onBelt > 150) continue
      const caps = this.inSlots.map((_, i) => Math.max(0, this.slotCapacity(i, inflight)))
      const total = caps.reduce((a, b) => a + b, 0)
      if (total <= 0) continue
      dock.spawnT = 0.26 + r() * 0.1
      const isStory = this.story.stage === 4 && this.story.vehicle === v.id
      let slot = -1
      if (isStory) {
        slot = this.pickStorySlot()
        inflight[slot]++
      } else {
        let x = r() * total
        for (let i = 0; i < caps.length; i++) {
          x -= caps[i]
          if (x <= 0) {
            slot = i
            break
          }
        }
      }
      if (slot >= 0 && !isStory) inflight[slot]++
      v.cargoDone = Math.min(v.cargoTotal, v.cargoDone + 8)
      const pos = dock.feed.at(0)
      const p: Parcel = { x: pos.x, y: IN.conv.y + 0.22, z: pos.z, slot, phase: 0, t: 0, s: 0, feed: d, size: 0.7 + r() * 0.6, tint: r(), spin: (r() - 0.5) * 0.5, story: isStory }
      this.inParcels.push(p)
      if (isStory) {
        this.story.parcel = p
        this.story.vehicle = null
        this.storyStage(5)
      }
    }

    // 슈트에 쌓인 물건은 기사가 돌아와 상차를 시작하면 실린다
    for (let i = 0; i < this.inSlots.length; i++) {
      const s = this.inSlots[i]
      const v = s.vehicle ? this.vehicle(s.vehicle) : null
      if (s.held <= 0 || !v || v.site !== 'IN' || v.phase !== 'loading' || v.door < 0.9 || r() > dt * 6) continue
      const idx = this.inParcels.findIndex((p) => p.slot === i && p.phase === 2)
      s.held--
      v.cargoDone = Math.min(v.cargoTotal, v.cargoDone + 8)
      if (idx >= 0) {
        const [p] = this.inParcels.splice(idx, 1)
        if (p.story) {
          this.story.van = v.id
          this.story.parcel = null
        }
      }
    }

    const keep: Parcel[] = []
    for (const p of this.inParcels) {
      const slot = p.slot >= 0 ? this.inSlots[p.slot] : null
      if (p.phase === 0) {
        const feed = this.inDocks[p.feed].feed
        p.s += dt * 2.4
        const pos = feed.at(p.s)
        p.x = pos.x
        p.z = pos.z
        if (slot && p.x <= slot.x && p.x < mainStart - 1) {
          p.phase = 1
          p.t = 0
          p.x = slot.x
        } else if (p.s >= feed.length - 0.2) continue
      } else if (p.phase === 1 && slot) {
        p.t += dt / 0.9
        const rear = slot.side === 'N' ? IN.vanNRear - 0.35 : IN.vanSRear + 0.35
        const tt = Math.min(1, p.t)
        p.z = IN.conv.z + (rear - IN.conv.z) * tt
        p.y = IN.conv.y + 0.22 - 0.4 * tt
        if (p.t >= 1) {
          const v = slot.vehicle ? this.vehicle(slot.vehicle) : null
          if (v && v.site === 'IN' && v.phase === 'loading' && v.door > 0.9) {
            v.cargoDone = Math.min(v.cargoTotal, v.cargoDone + 8)
            if (p.story) {
              this.story.van = v.id
              this.story.parcel = null
            }
            continue
          }
          // 기사가 아직 배송 중이면 슈트 끝에 쌓아 둔다
          p.phase = 2
          slot.held++
          const k = slot.held - 1
          p.x = slot.x + ((k % 3) - 1) * 0.42
          p.y = IN.conv.y - 0.12 + (Math.floor(k / 3) % 3) * 0.32
        }
      }
      keep.push(p)
    }
    this.inParcels = keep
  }

  // ───────────────────────── 택배 한 상자의 여정(스토리)

  private newStory() {
    const cands = this.inSlots
      .map((s, i) => ({ i, v: s.vehicle ? this.vehicle(s.vehicle) : null }))
      .filter((x) => x.v && (VARIANTS[x.v.variant] ?? []).some((id) => id.startsWith('A')))
    const choice = cands[this.storyCount % cands.length]
    const stops = VARIANTS[choice.v!.variant]
    const stopId = stops.find((s) => s.startsWith('A')) ?? stops[0]
    this.storyCount++
    this.story = {
      n: this.storyCount,
      no: invoiceNo(),
      item: pick(['water', 'rice', 'ramen', 'detergent', 'petfood'] as ItemKey[], r),
      customer: pick(LL(['김지은', '박민준', '이서윤', '최도현', '정하윤', '강예준'], ['Kim Ji-eun', 'Park Min-jun', 'Lee Seo-yun', 'Choi Do-hyeon', 'Jeong Ha-yun', 'Kang Ye-jun']), r),
      stopId,
      unit: `${tr('', 'Unit ')}${randInt(3, 18, r)}${pick(['01', '02', '03', '04'], r)}${tr('호', '')}`,
      seller: pick(LL(['하루마켓', '온담푸드', '바른생활몰', '모아마트'], ['Haru Market', 'Ondam Food', 'Bareun Life Mall', 'Moa Mart']), r),
      stage: 0,
      times: [this.clock, 0, 0, 0, 0, 0, 0, 0],
      timer: 10,
      pallet: null,
      vehicle: null,
      van: null,
      slot: choice.i,
      parcel: null,
      // 다음 주 방문 요청 메모(MEMO_POOL 6번 칸)는 스토리에 쓰지 않는다: 글자 대신 칸 번호로 걸러 두 언어에서 같은 목록이 되게 한다
      memo: pick(MEMO_POOL.filter((m, i) => m && i !== 6), r),
      memoPlan: null,
      memoStatus: 'pending',
      dropMode: null,
    }
    this.onStory?.(this.story)
  }

  /** 서브터미널 도착 시점: 지금 상차 중이고 단지 배송 노선을 가진 기사를 고른다 */
  private pickStorySlot() {
    const cands = this.inSlots
      .map((s, i) => ({ i, v: s.vehicle ? this.vehicle(s.vehicle) : null }))
      .filter((x) => x.v && (VARIANTS[x.v.variant] ?? []).some((id) => id.startsWith('A')))
    const loading = cands.filter((x) => x.v!.site === 'IN' && x.v!.phase === 'loading').sort((a, b) => b.v!.cargoDone - a.v!.cargoDone)
    const choice = loading[0] ?? cands[0]
    const stops = VARIANTS[choice.v!.variant]
    this.story.slot = choice.i
    this.story.stopId = stops.find((s) => s.startsWith('A')) ?? stops[0]
    return choice.i
  }

  private storyStage(n: number) {
    this.story.stage = n
    this.story.times[n] = this.clock
  }

  private onDepart(v: Vehicle) {
    const s = this.story
    if (v.kind === 'wing' && s.stage === 1 && s.pallet && v.cargo.includes(s.pallet)) {
      s.vehicle = v.id
      this.storyStage(2)
    } else if (v.kind === 'box' && s.stage === 3 && s.vehicle === v.id) {
      this.storyStage(4)
    } else if (v.kind === 'van' && v.home === 'IN' && s.stage === 5 && s.van === v.id) {
      if (!v.stops.some((x) => x.id === s.stopId)) s.stopId = v.stops[0].id
      this.storyStage(6)
    }
  }

  private stepStory(dt: number) {
    const s = this.story
    if (s.stage === 0) {
      s.timer -= dt
      if (s.timer <= 0) this.storyStage(1)
    } else if (s.stage === 3) {
      s.timer -= dt
      if (s.vehicle) {
        const v = this.vehicle(s.vehicle)
        if (!v || v.site !== 'GJ' || (v.phase !== 'loading' && v.phase !== 'closing' && v.phase !== 'waiting')) s.vehicle = null
      }
    } else if (s.stage === 7) {
      s.timer -= dt
      if (s.timer <= 0) this.newStory()
    }
  }

  /** 여정(id: 'story' 육로 택배, 'sea' 해상, 'air' 항공)의 현재 위치와 설명 */
  journeyPos(id: string) {
    if (id === 'ret') return this.cs.focusPos() ?? this.storyPos()
    return id === 'sea' ? this.sea.pos() : id === 'air' ? this.air.pos() : this.storyPos()
  }

  /** 스토리 상자의 현재 위치와 설명 */
  storyPos(): { x: number; y: number; z: number; label: string; site: SiteId } {
    const s = this.story
    const pal = s.pallet ? this.pallets.get(s.pallet) : null
    if (s.stage <= 1) {
      if (pal && pal.state === 'line') return { x: pal.x, y: 1.6, z: pal.z, label: pal.wrapped ? tr('출고 라인 대기', 'Waiting on outbound line') : tr('랩핑 · 출고 라인', 'Wrapping · outbound line'), site: 'IC' }
      if (pal && pal.state === 'onFork' && pal.forkliftId) {
        const f = this.forklift(pal.forkliftId)!
        return { x: f.x, y: 2, z: f.z, label: tr(`지게차 ${f.id} 상차 중`, `Forklift ${f.id} loading`), site: 'IC' }
      }
      if (pal && pal.state === 'onTruck' && pal.vehicleId) {
        const v = this.vehicle(pal.vehicleId)!
        return { x: v.x, y: 3.5, z: v.z, label: tr(`${v.id} 윙바디 적재`, `${v.id} wing-body loading`), site: 'IC' }
      }
      const st = IC.stations[s.n % IC.stations.length]
      return { x: st, y: 1.5, z: IC.stationZ, label: s.stage === 0 ? tr('AMR 피킹 · 포장', 'AMR picking · packing') : tr('파렛트 적재 대기', 'Waiting to be palletized'), site: 'IC' }
    }
    if (s.stage === 2) {
      if (pal?.state === 'onFork' && pal.forkliftId) {
        const f = this.forklift(pal.forkliftId)!
        return { x: f.x, y: 2, z: f.z, label: tr(`지게차 ${f.id} 입고 운반`, `Forklift ${f.id} carrying inbound`), site: 'GJ' }
      }
      const v = this.vehicle(s.vehicle ?? '') ?? (pal?.vehicleId ? this.vehicle(pal.vehicleId) : undefined)
      if (v) {
        const label = v.phase === 'departing' ? tr('이천 FC 출차', 'leaving Icheon FC') : v.phase === 'highway' ? tr('이천→곤지암 간선 주행', 'linehaul Icheon → Gonjiam') : v.phase === 'unloading' ? tr('곤지암 측면 하차 대기', 'waiting for side unloading at Gonjiam') : tr('곤지암 허브 진입', 'entering Gonjiam Hub')
        return { x: v.x, y: 3.5, z: v.z, label: `${v.id} ${label}`, site: v.phase === 'departing' ? 'IC' : 'GJ' }
      }
    }
    if (s.stage === 3) {
      const v = s.vehicle ? this.vehicle(s.vehicle) : null
      if (v && s.timer <= 0) return { x: v.x, y: 3.5, z: v.z, label: tr(`${v.id} 상차 중`, `${v.id} loading`), site: 'GJ' }
      return { x: -22, y: 6, z: -27, label: tr('허브 휠소터 분류 중', 'Sorting on the hub wheel sorter'), site: 'GJ' }
    }
    if (s.stage === 4) {
      const v = this.vehicle(s.vehicle ?? '')
      if (v) {
        const label = v.phase === 'departing' ? tr('곤지암 출고 도크 출차', 'leaving Gonjiam outbound dock') : v.phase === 'highway' ? tr('곤지암→인천 간선 주행', 'linehaul Gonjiam → Incheon') : v.phase === 'unloading' ? tr('인천 신축 컨베이어 하차', 'unloading on Incheon telescopic conveyor') : tr('인천 서브터미널 도킹', 'docking at Incheon Sub-terminal')
        return { x: v.x, y: 3.6, z: v.z, label: `${v.id} ${label}`, site: v.phase === 'departing' ? 'GJ' : 'IN' }
      }
    }
    if (s.stage === 5) {
      if (s.parcel) {
        const held = s.parcel.phase === 2
        return { x: s.parcel.x, y: s.parcel.y + 0.5, z: s.parcel.z, label: held ? tr('슈트 대기 · 기사 복귀 전', 'Waiting in chute · driver not back yet') : tr('휠소터 분류 중', 'Sorting on the wheel sorter'), site: 'IN' }
      }
      const v = this.vehicle(s.van ?? '')
      if (v) return { x: v.x, y: 2.6, z: v.z, label: tr(`${v.id} 상차 완료`, `${v.id} loaded`), site: 'IN' }
    }
    if (s.stage >= 6) {
      const v = this.vehicle(s.van ?? '')
      if (v && v.walk.on && v.walk.stop === s.stopId) {
        const w = v.walk
        return { x: w.from.x + (w.to.x - w.from.x) * w.t, y: 1.4, z: w.from.z + (w.to.z - w.from.z) * w.t, label: s.stage === 7 ? tr('배송 완료', 'Delivered') : tr('문 앞까지 운반 중', 'Carrying to the door'), site: 'TW' }
      }
      if (s.stage === 7) {
        const st = STOPS[s.stopId]
        return { x: st.door.x, y: 1.2, z: st.door.z, label: tr('배송 완료', 'Delivered'), site: 'TW' }
      }
      if (v) {
        const next = v.stops[v.stopIdx]
        const label = v.site === 'IN' ? tr('서브터미널 출차', 'leaving sub-terminal') : next ? tr(`${next.label} 배송 이동`, `heading to ${next.label}`) : tr('배송 중', 'delivering')
        return { x: v.x, y: 2.6, z: v.z, label: `${v.id} ${label}`, site: v.site === 'IN' ? 'IN' : 'TW' }
      }
    }
    return { x: -22, y: 6, z: -27, label: tr('처리 중', 'Processing'), site: 'GJ' }
  }

  // ───────────────────────── 메인 루프

  step(dt: number) {
    this.elapsed += dt
    this.clock += dt * SPEEDUP
    this.avoidAcc += dt
    if (this.avoidEnabled && this.avoidAcc >= 0.08) {
      this.stepAvoid(this.avoidAcc)
      this.avoidAcc = 0
    }
    for (const v of this.vehicles) this.stepVehicle(v, dt)
    this.traffic.step(dt)
    this.dispatch()
    for (const f of this.forklifts) this.stepForklift(f, dt)
    this.stepParcels(dt)
    this.stepInParcels(dt)
    this.stepIcLines(dt)
    this.stepAmr(dt)
    this.port.step(dt)
    this.hub.step(dt)
    this.airport.step(dt)
    this.life.step(dt)
    this.sea.step(dt)
    this.cs.step(dt)
    this.cold.step(dt)
    this.customs.step(dt)
    this.addr.step(dt)
    this.djwh.step(dt)
    this.town.step(dt)
    this.promises.step()
    this.approvals.step(dt)
    this.driver.step(dt)
    this.vessel.step(dt)
    this.schedule.step(dt)
    this.gateLog.step(dt)
    this.rail.step(dt)
    this.barge.step(dt)
    this.history.step(dt)
    this.carbon.step()
    this.solar.step()
    this.air.step(dt)
    if (this.story.stage >= 0) this.stepStory(dt)
    this.stepReports(dt)
    this.stepIncidents(dt)
    this.cyTimer += dt
    if (this.cyTimer > 26) {
      this.cyTimer = 0
      if (this.cy.count > 9) this.cy.count--
    }

    for (const d of this.doors) {
      const near = this.forklifts.some((f) => f.site === 'GJ' && Math.abs(f.x - d.x) < 2.2 && f.z < 3 && f.z > -14)
      d.open = Math.max(0, Math.min(1, d.open + (near ? dt * 1.6 : -dt * 0.8)))
    }
    for (const d of this.docks) {
      const v = d.vehicle ? this.vehicle(d.vehicle) : null
      const target = v && v.site === 'GJ' && (v.phase === 'loading' || v.phase === 'closing') ? v.door : 0
      d.open += (target - d.open) * Math.min(1, dt * 3)
    }
    for (const d of this.icReefers) {
      const v = d.vehicle ? this.vehicle(d.vehicle) : null
      const target = v && v.site === 'IC' && (v.phase === 'loading' || v.phase === 'closing') ? v.door : 0
      d.open += (target - d.open) * Math.min(1, dt * 3)
    }
    for (const key of Object.keys(this.gates) as GateKey[]) {
      const g = this.gates[key]
      const gate = GATES[key]
      g.hold = Math.max(0, g.hold - dt)
      const near = (x: number, rz: number) => this.vehicles.some((v) => v.visible && Math.abs(v.x - x) < 2 && Math.abs(v.z - gate.gateZ) < rz)
      const inNear = g.hold > 0 || near(gate.inX, 6)
      const outNear = near(gate.outX, 7)
      g.inOpen = Math.max(0, Math.min(1, g.inOpen + (inNear ? dt * 1.6 : -dt)))
      g.outOpen = Math.max(0, Math.min(1, g.outOpen + (outNear ? dt * 1.6 : -dt)))
    }
  }

  // ───────────────────────── 현장 보고(자유 문장) — 분류는 AI 모듈이 맡는다

  addReport(site: SiteId, source: string, text: string) {
    const rep: FieldReport = { id: this.reportSeq++, time: this.clock, site, source, text, status: 'pending', triage: null }
    this.reports.unshift(rep)
    if (this.reports.length > 30) this.reports.pop()
    this.onReport?.(rep)
    return rep
  }

  // ───────────────────────── 충돌 회피(앞차 간격 · 교차로 양보 · 정차 차량 추월 · 교착 해소)

  /** 서로 부딪힐 수 있는 모든 몸체 */
  /** 지금 겹쳐 있는 차량 쌍 수(차량·일반 차량끼리 / 차량과 보행자) */
  overlapCount() {
    const all = this.bodies()
    const veh = all.filter((b) => !b.id.startsWith('p-') && !b.id.startsWith('w-') && !b.id.startsWith('FL-') && !b.id.startsWith('r-') && !b.id.startsWith('m-'))
    const ppl = all.filter((b) => b.id.startsWith('p-') || b.id.startsWith('w-'))
    let vv = 0
    let vp = 0
    for (let i = 0; i < veh.length; i++) for (let j = i + 1; j < veh.length; j++) if (veh[i].group !== veh[j].group && overlaps(veh[i], veh[j])) vv++
    for (const a of veh) for (const p of ppl) if (overlaps(a, p, 0.05)) vp++
    return { vv, vp }
  }

  private bodies(): Body[] {
    const out: Body[] = []
    const SIZE: Record<VehicleKind, [number, number]> = { van: [2.45, 0.9], box: [5.5, 1.25], wing: [5.1, 1.25], reefer: [4.6, 1.2], trailer: [3.1, 1.25] }
    for (const v of this.vehicles) {
      if (!v.visible) continue
      const [half, w] = SIZE[v.kind]
      const t = v.tasks[0]
      const route = t?.k === 'drive' ? t.route : null
      const moving = !!route && !route.done
      const speed = moving && route ? route.vel : 0
      const parked = !moving && (t?.k === 'work' || v.walk.on)
      out.push({ id: v.id, x: v.x, z: v.z, dx: Math.sin(v.heading), dz: Math.cos(v.heading), half, w, speed, parked, group: v.id })
      if (v.kind === 'trailer') out.push({ id: `${v.id}:t`, x: v.trailer.x, z: v.trailer.z, dx: Math.sin(v.trailer.heading), dz: Math.cos(v.trailer.heading), half: 6.2, w: 1.25, speed, parked, group: v.id })
    }
    for (const c of this.traffic.cars) {
      const lane = LANES[c.lane]
      out.push({ id: c.id, x: c.x, z: lane.z + c.zOff, dx: lane.dir, dz: 0, half: c.half, w: c.kind === 'truck' ? 1.25 : 0.95, speed: c.v, parked: false, group: c.id })
    }
    for (const f of this.forklifts) out.push({ id: f.id, x: f.x, z: f.z, dx: Math.sin(f.heading), dz: Math.cos(f.heading), half: 1.7, w: 0.7, speed: f.kmh / 3.6, parked: false, group: f.id })
    for (const m of this.life.movers) {
      if (m.kind === 'drone') continue
      const half = m.kind === 'moto' ? 1.0 : m.kind === 'robot' ? 0.45 : 0.25
      const w = m.kind === 'moto' ? 0.45 : m.kind === 'robot' ? 0.35 : 0.3
      out.push({ id: m.id, x: m.x, z: m.z, dx: Math.sin(m.heading), dz: Math.cos(m.heading), half, w, speed: m.moving ? m.speed : 0, parked: m.kind !== 'person' && m.pause > 1, group: m.id })
    }
    return out
  }

  /**
   * 간선 진입·좌회전 갭 수락: 정문에서 나가거나 간선에서 정문으로 꺾을 때, 건너야 할 차로에
   * 곧 도착하는 차가 있으면 도로 가장자리(꺾는 지점) 앞에서 기다린다. 앞을 막는 거리를 돌려준다
   */
  private mergeGap(v: Vehicle, route: Route, bodies: Body[]) {
    const tag = route.leg.tag
    if (tag !== 'exit' && tag !== 'approach') return Infinity
    const pts = route.leg.path.pts
    const a = pts[0]
    const b = pts[pts.length - 1]
    // exit: 정문(도로 밖) → 차로, approach: 차로 → 정문
    const laneZ = tag === 'exit' ? b.z : a.z
    const sideZ = tag === 'exit' ? a.z : b.z
    const crossX = tag === 'exit' ? a.x : b.x
    if (Math.abs(sideZ - L.MAIN.z) < 8) return Infinity
    const north = sideZ < L.MAIN.z
    const half = v.kind === 'van' ? 2.45 : v.kind === 'trailer' ? 3.1 : v.kind === 'reefer' ? 4.6 : 5.3
    // 아직 도로에 들어서지 않았거나(나가는 차: 앞 범퍼 기준) 아직 꺾지 않은(들어오는 차) 동안만 본다.
    // 앞 범퍼가 이미 바깥 차로에 들어섰으면 멈추지 않고 마저 나간다(간선 차가 서서 기다린다)
    const fz = v.z + Math.cos(v.heading) * half
    const before = tag === 'exit' ? (north ? fz < L.MAIN.z0 - 0.3 : fz > L.MAIN.z1 + 0.3) : Math.abs(v.x - crossX) > 6 && (crossX - v.x) * Math.sin(v.heading) > 0
    if (!before) return Infinity
    // 건너는 차로: 정문 쪽과 목표 차로 사이(나가는 차는 목표 차로 포함, 들어오는 차는 자기 차로 제외)
    const lanes = LANES.filter((ln) => (north ? ln.z < laneZ + 0.1 && ln.z > sideZ : ln.z > laneZ - 0.1 && ln.z < sideZ) && (tag === 'exit' || Math.abs(ln.z - laneZ) > 0.5))
    for (const ln of lanes) {
      for (const o of bodies) {
        if (o.group === v.id || Math.abs(o.z - ln.z) > 1.6 || o.speed < 0.3) continue
        if (o.dx * ln.dir < 0.7) continue
        const along = (crossX - o.x) * ln.dir
        if (along > -(o.half + 4) && along < o.speed * 3.2 + 14) {
          this.mergeBlocker = o.group
          // 꺾는 지점까지 남은 거리만큼만 다가간다
          const edge = tag === 'exit' ? Math.abs((north ? L.MAIN.z0 : L.MAIN.z1) - fz) : Math.abs(crossX - v.x) - 8
          return Math.max(0, edge)
        }
      }
    }
    return Infinity
  }

  /**
   * 간선 가로지르기 갭 수락: 마을 길처럼 간선을 곧장 건너는 경로는, 네 차로 어디든 곧 건널 자리에 닿을 차가 있으면
   * 도로 가장자리 앞(앞 범퍼가 바깥 차로에 걸치지 않게)에서 기다린다. 건너는 도중이면 빨리 빠져나가게 둔다
   */
  private crossGap(v: Vehicle, A: Ahead, grid: Grid, tag: string) {
    if (!A.n || tag === 'exit' || tag === 'approach' || tag === 'highway') return Infinity
    const z0 = L.MAIN.z0
    const z1 = L.MAIN.z1
    if (v.z > z0 - 0.3 && v.z < z1 + 0.3) return Infinity
    // 도로 한쪽에서 들어가 맞은편으로 빠져나가는(곧장 건너는) 경로만 본다. 간선으로 꺾어 드는 길은 mergeGap이 맡는다
    let enter = -1
    let across = false
    const fromLow = v.z < z0
    for (let s = 0; s < A.n; s++) {
      const z = A.p[s * 4 + 1]
      if (enter < 0) {
        if (z > z0 && z < z1) enter = s
        else if (s > 30) break
      } else if (z <= z0 || z >= z1) {
        across = fromLow ? z >= z1 : z <= z0
        break
      }
    }
    if (enter < 0 || !across || Math.abs(A.p[enter * 4 + 3]) < 0.7) return Infinity
    const crossX = A.p[enter * 4]
    for (const o of grid.near(crossX, L.MAIN.z, 90, [])) {
      if (o.group === v.id || o.z < z0 - 1 || o.z > z1 + 1 || Math.abs(o.dx) < 0.7) continue
      const along = (crossX - o.x) * Math.sign(o.dx)
      if (along > -(o.half + 4) && along < o.speed * 3.2 + 14) {
        this.mergeBlocker = o.group
        return enter
      }
    }
    return Infinity
  }

  /** 교차로·정문 앞 가까이(52m) 있는가: 멀면 경로를 짚지 않는다 */
  private nearZones(x: number, z: number) {
    return this.junctions.some((j) => nearRect(x, z, j, 52))
  }

  /** 거점 진입로의 교차로(꼬리물기 금지 구역): 다 빠져나갈 자리가 없으면 들어가지 않는다 */
  junctions: Junction[] = mergeBoxes([
    // 광주: 진입로와 단지 안 길(북쪽 길·남쪽 길·마당)이 만나는 곳 + 컨테이너 야드 드나드는 길(뒤쪽 -26, 앞쪽 14)
    ...[L.LANE_N.z, L.LANE_S.z, L.YARD.z, L.CY.backZ, L.CY.laneZ].map((z) => ({ x: L.ENTRY.x, z })),
    ...[(IN.laneN.wb + IN.laneN.eb) / 2, (IN.laneS.wb + IN.laneS.eb) / 2, ...IN.docks].map((z) => ({ x: IN.entry.x, z })),
    { x: IC.entry.x, z: IC.yard.z },
    { x: GATES.AP.x, z: (AP.landIn + AP.landOut) / 2 },
    { x: GATES.DJ.x, z: (DJ.landIn + DJ.landOut) / 2 },
    { x: GATES.BS.x, z: BS.exitLane },
    { x: GATES.BS.x, z: BS.truckLane },
  ].map((j) => ({ x0: j.x - 7, x1: j.x + 7, z0: j.z - 4.5, z1: j.z + 4.5 })).concat(
    // 정문 앞 간선(드나드는 차가 꺾어 지나가는 자리): 엇갈리는 길은 예약 순서대로 지나간다.
    // 정문 진입로(목) 안은 들어오는 차로·나가는 차로가 갈라져 있어 양쪽이 동시에 다닌다
    (['GJ', 'IC', 'IN', 'AP', 'BS', 'DJ'] as const).map((k) => ({ x0: GATES[k].x - 12, x1: GATES[k].x + 12, z0: L.MAIN.z0 - 0.5, z1: L.MAIN.z1 + 0.5 })),
  )).map((b) => ({ ...b, res: new Map<string, number>() }))

  /** 교차로 안에서 차가 차지할(지나갈) 자리: [x, z, tx, tz, 반폭]의 나열 */
  private claimOf(o: Vehicle, j: Junction, parts: Body[]) {
    const inJ = (x: number, z: number) => inRect(x, z, j)
    const out: number[] = []
    for (const b of parts) {
      for (const k of [-1, 0, 1]) out.push(b.x + b.dx * b.half * k, b.z + b.dz * b.half * k, b.dx, b.dz, b.w)
    }
    const t = o.tasks[0]
    const r = t?.k === 'drive' && t.route && !t.route.done ? t.route : null
    if (r) {
      const w = parts[0]?.w ?? 1
      let seen = false
      for (let s = 0; s <= 40; s += 1) {
        const p = r.peek(s)
        if (!p) break
        const inside = inJ(p.x, p.z)
        if (inside) {
          seen = true
          out.push(p.x, p.z, p.tx, p.tz, w)
        } else if (seen) break
      }
    }
    return out
  }

  /**
   * 교차로 예약: 경로가 엇갈리는(35° 넘게 방향이 다른) 차가 교차로 안에 있거나 먼저 예약했으면 입구 앞에서 기다린다.
   * 같은 방향으로 뒤따르는 차는 막지 않는다(그건 앞쪽 살피기가 맡는다). 입구 4m 앞에 오면 예약한다
   */
  private junctionRes(v: Vehicle, A: Ahead, body: Body, free: number, partsOf: Map<string, Body[]>, claims: Map<string, number[]>) {
    const js = this.junctions
    if (!js.some((j) => nearRect(body.x, body.z, j, 34))) return Infinity
    const mine = partsOf.get(v.id) ?? [body]
    // 경로를 따라가며, 내가 아직 들어가지 않았고 예약도 없는 가장 가까운 교차로를 찾는다
    let ji = -1
    let enter = -1
    const pa: number[] = []
    for (let s = 0; s <= 30 && s < A.n; s++) {
      const px = A.p[s * 4]
      const pz = A.p[s * 4 + 1]
      if (ji < 0) {
        const k = js.findIndex((j) => inRect(px, pz, j))
        if (k < 0) continue
        const j = js[k]
        if (j.res.has(v.id) || mine.some((b) => bodyIn(b, j))) continue
        ji = k
        enter = s
      }
      if (!inRect(px, pz, js[ji])) break
      pa.push(px, pz, A.p[s * 4 + 2], A.p[s * 4 + 3])
    }
    if (ji < 0) return Infinity
    const j = js[ji]
    // 교차로 안에 있거나 예약한 다른 차와 경로가 엇갈리는가
    for (const o of this.vehicles) {
      if (o === v || !o.visible) continue
      const parts = partsOf.get(o.id)
      if (!parts) continue
      if (!j.res.has(o.id) && !parts.some((b) => bodyIn(b, j))) continue
      const ck = `${o.id}#${ji}`
      let cl = claims.get(ck)
      if (!cl) {
        cl = this.claimOf(o, j, parts)
        claims.set(ck, cl)
      }
      for (let a = 0; a < pa.length; a += 4) {
        for (let c = 0; c < cl.length; c += 5) {
          const dx = cl[c] - pa[a]
          const dz = cl[c + 1] - pa[a + 1]
          const r = body.w + cl[c + 4] + 0.3
          if (dx * dx + dz * dz > r * r) continue
          if (cl[c + 2] * pa[a + 2] + cl[c + 3] * pa[a + 3] > 0.82) continue
          this.resBlocker = o.id
          return Math.max(0, enter - 1)
        }
      }
    }
    // 입구 4m 앞까지 왔고, 앞차·정문·꼬리물기 때문에 서지 않고 실제로 들어갈 수 있을 때만 예약한다
    if (enter <= 4 && free > enter + 2) j.res.set(v.id, this.elapsed)
    else this.softGap = Math.min(this.softGap, Math.max(0, enter - 1))
    return Infinity
  }

  /** 교차로 예약 정리: 빠져나갔거나, 예약하고도 입구 앞에서 오래 서 있는 차는 뺀다 */
  private cleanJunctionRes(partsOf: Map<string, Body[]>) {
    const now = this.elapsed
    for (const j of this.junctions) {
      const inJ = (x: number, z: number) => x > j.x0 && x < j.x1 && z > j.z0 && z < j.z1
      for (const [id, t0] of j.res) {
        const o = this.vehicles.find((x) => x.id === id)
        const parts = partsOf.get(id)
        let keep = false
        if (o && o.visible && parts) {
          if (parts.some((b) => bodyIn(b, j))) keep = true
          else {
            const t = o.tasks[0]
            const r = t?.k === 'drive' && t.route && !t.route.done ? t.route : null
            if (r && (o.cap >= 0.3 || now - t0 < 5)) {
              for (let s = 0; s <= 8; s += 1) {
                const p = r.peek(parts[0].half + s)
                if (!p) break
                if (inJ(p.x, p.z)) {
                  keep = true
                  break
                }
              }
            }
          }
        }
        if (!keep) j.res.delete(id)
      }
    }
  }

  /** 꼬리물기 금지: 앞이 막혀 교차로를 다 지나지 못할 것 같으면 교차로 앞에서 멈출 거리 */
  private junctionGap(A: Ahead, body: Body, gap: number, len = body.half * 2) {
    if (!Number.isFinite(gap)) return Infinity
    for (const j of this.junctions) {
      if (!nearRect(body.x, body.z, j, 52) || inRect(body.x, body.z, j)) continue
      let enter = -1
      let exit = -1
      for (let s = 0; s < A.n; s++) {
        const inside = inRect(A.p[s * 4], A.p[s * 4 + 1], j)
        if (inside && enter < 0) enter = s
        if (!inside && enter >= 0) {
          exit = s
          break
        }
      }
      if (enter < 0 || exit < 0) continue
      // 앞 범퍼가 교차로 출구를 지나고 차 몸 전체(길이)가 빠질 자리가 있어야 들어간다
      if (gap < exit + len + 1.5) return Math.max(0, enter - 1)
    }
    return Infinity
  }

  /**
   * 아직 허가(정문 예약·교차로 예약)를 받지 못해 그 앞에서 설 수도 있는 거리(판단 중 임시값).
   * 지금은 달려도, 뒤차는 이 차가 여기서 설 수 있다고 보고 교차로에 들어갈지 정한다
   */
  private softGap = Infinity
  /** 교차로 예약 때문에 섰을 때 그 예약을 쥔 차(판단 중 임시값) */
  private resBlocker: string | null = null
  /** 간선 끼어들기·가로지르기를 기다리게 한 차(판단 중 임시값) */
  private mergeBlocker: string | null = null


  private stepAvoid(dt: number) {
    const bodies = this.bodies()
    const grid = new Grid(bodies)
    const byGroup = new Map<string, Body>()
    for (const b of bodies) if (!byGroup.has(b.group)) byGroup.set(b.group, b)
    const byId = new Map(this.vehicles.map((v) => [v.id, v]))
    const partsOf = new Map<string, Body[]>()
    for (const b of bodies) {
      const a = partsOf.get(b.group)
      if (a) a.push(b)
      else partsOf.set(b.group, [b])
    }
    this.cleanJunctionRes(partsOf)
    const claims = new Map<string, number[]>()
    type F = {
      key: string
      body: Body
      gap: number
      hit: Body | null
      graze: boolean
      v: Vehicle | null
      set: (cap: number) => void
      ahead: (s: number) => { x: number; z: number; tx: number; tz: number } | null
      path?: number[]
      /** 실제로 앞을 막는 몸체까지 거리(약속 때문에 서는 거리는 뺀 값) */
      phys?: number
      /** 누구를 기다리는가(몸체로 막는 차, 교차로 예약을 쥔 차) */
      wait?: string | null
      /** 오토바이·배송 로봇 */
      mover?: Mover
    }
    const fs: F[] = []
    const look = (speed: number) => Math.min(40, 8 + speed * 3)
    // 1) 시뮬레이션 차량: 자기 경로 앞쪽을 본다
    for (const v of this.vehicles) {
      const t = v.tasks[0]
      const route = t?.k === 'drive' ? t.route : null
      const body = byGroup.get(v.id)
      if (!body || !route || route.done) {
        v.cap = Infinity
        v.blockedT = 0
        v.room = 0
        v.waitFor = null
        continue
      }
      if (v.ghostT > 0) v.ghostT -= dt
      // 추월 대상은 옆으로 충분히 비켜 선 뒤에만 무시한다(비키기 전에 앞으로 밀고 들어가지 않게)
      const ignore = (b: Body) => (v.passing !== null && b.group === v.passing && Math.abs(v.swerve) >= 1.75) || (v.ghostT > 0 && b.speed < 0.2)
      // 정문·교차로 가까이에서는 서 있어도 (교차로 길이 + 내 차 길이)만큼 앞까지 본다(꼬리물기 판단에 앞차 꼬리가 보여야 한다)
      const near = this.nearZones(v.x, v.z)
      const sc = scanAhead(body, (s) => route.peek(s), grid, near ? Math.max(look(route.vel), Math.min(40, vehLen(v) + 20)) : look(route.vel), { front: body.half, lateral: v.swerve, ignore })
      const hx = Math.sin(v.heading)
      const hz = Math.cos(v.heading)
      // 맞은편에서 추월 중인 차가 내 차로로 마주 오면 10m 앞에서 미리 서서 그 차가 제 차로로 돌아갈 자리를 남긴다
      {
        const hv = sc.hit ? byId.get(sc.hit.group) : undefined
        if (hv && Math.abs(hv.swerve) > 1 && Math.sin(hv.heading) * hx + Math.cos(hv.heading) * hz < -0.5) sc.gap = Math.max(0, sc.gap - 10)
      }
      // 경로 앞 50m를 1m 간격으로 한 번만 짚어 정문·교차로 판단에 같이 쓴다(가까이 갈 때만)
      const A = near ? sampleAhead(route, body.half) : NO_AHEAD
      this.softGap = Infinity
      this.mergeBlocker = null
      // 간선 끼어들기(정문에서 나가고 들어올 때)·가로지르기(마을 길) 틈 기다리기
      const merge = Math.min(this.mergeGap(v, route, bodies), this.crossGap(v, A, grid, route.leg.tag ?? ''))
      const mergeBy = this.mergeBlocker
      // 목적지가 정차한 차 바로 앞뒤면(같은 정차 지점) 추월하지 않고 그 뒤에 멈춰 일을 본다
      if (sc.hit && sc.hit.parked && v.passing === null && sc.gap < 8 && route.vel < 0.5 && route.remaining() < sc.gap + sc.hit.half * 2 + 10) {
        route.done = true
        v.cap = Infinity
        v.blockedT = 0
        continue
      }
      // 배송 정차·작업 중인 차에 막히면, 맞은편 차로가 비었을 때 왼쪽으로 비켜 지나간다
      if (sc.hit && sc.hit.parked && v.passing === null && v.blockedT > 1.2 && sc.gap < 16 && route.leg.tag === 'town') {
        const blocker = sc.hit.group
        // 맞은편 차로가 65m 넘게 비어 있어야 나선다(마주 오는 차와 코를 맞대고 서지 않게)
        const side = scanAhead(body, (s) => route.peek(s), grid, 70, { front: body.half, lateral: 3.3, ignore: (b) => b.group === blocker })
        if (side.gap > 65) {
          v.passing = blocker
          v.swerveT = 3.3
          this.avoidStats.passing++
        }
      }
      if (v.passing) {
        const pb = byGroup.get(v.passing)
        const along = pb ? (pb.x - v.x) * hx + (pb.z - v.z) * hz : -Infinity
        if (!pb || along < -(pb.half + body.half + 1.5)) {
          v.passing = null
          v.swerveT = 0
        } else if (along > pb.half + body.half - 0.5 && (pb.speed > 1.5 || (sc.hit && sc.hit.group !== v.passing && sc.gap < 20))) {
          // 아직 대상 옆에 나란히 서기 전인데 대상이 출발했거나 맞은편에 차가 나타나면 추월을 그만두고 제 차로로 돌아간다
          v.passing = null
          v.swerveT = 0
        }
      }
      // 꼬리물기 금지(앞이 막혀 있으면 교차로에 들어가지 않는다): 앞차뿐 아니라 정문 통제·간선 진입 대기로 설 때도
      // 앞차가 곧 설 자리(앞차의 남은 여유 거리)까지 고려한다: 앞차가 정문·교차로 앞에서 설 예정이면 그 뒤 교차로에 들어가지 않는다
      const leadV = sc.hit ? byId.get(sc.hit.group) : undefined
      const leadRoom = !sc.hit ? Infinity : leadV ? leadV.room : sc.hit.speed > 2 ? Infinity : 0
      const stopAt = Math.min(sc.gap + leadRoom, merge)
      const jgap = this.junctionGap(A, body, stopAt, vehLen(v))
      // 옆으로 옮기는 속도는 앞으로 가는 속도에 묶는다(멈춘 채 옆으로 미끄러지지 않게)
      // 추월을 시작하거나 그만둘 때는 서 있어도 천천히(0.8m/s) 옆으로 빠진다
      const k = Math.min(dt * 1.6 * 3.3, Math.max(Math.abs(route.vel) * dt * 0.55, v.passing !== null || v.swerve > 0.02 ? dt * 0.8 : 0))
      if (!v.swerveT && v.swerve > 0.02) {
        // 차로로 돌아가려는데 바로 앞에 또 정차한 차가 있으면 이어서 지나간다
        const back = scanAhead(body, (s) => route.peek(s), grid, 10, { front: body.half, lateral: 0 })
        if (back.hit && back.hit.parked) {
          v.passing = back.hit.group
          v.swerveT = 3.3
        }
      }
      v.swerve += Math.max(-k, Math.min(k, v.swerveT - v.swerve))
      if (!v.swerveT && Math.abs(v.swerve) < 0.02) v.swerve = 0
      this.resBlocker = null
      const rgap = this.junctionRes(v, A, body, Math.min(sc.gap, merge, jgap), partsOf, claims)
      let gap = Math.min(sc.gap, merge, jgap, rgap)
      // 누구를 기다리나: 교차로 예약·꼬리물기 거리는 간선 틈 기다리기(merge)를 그대로 물려받을 때가 많으므로,
      // 같은 거리면 틈을 막는 차(mergeBy)를 먼저 적는다(그래야 '틈을 기다리는 차 ↔ 그 차를 기다리는 간선 차' 순환이 잡힌다)
      let wait: string | null =
        gap === sc.gap ? sc.hit?.group ?? null
          : gap === merge && mergeBy ? mergeBy
            : gap === rgap ? this.resBlocker
              : gap === jgap ? sc.hit?.group ?? null
                : null
      // 교착 순환에서 풀려난 차: 잠시 약속(교차로 예약·꼬리물기·간선 틈 기다리기)을 접고 실제로 막는 것만 지킨다.
      // 간선 틈 기다리기도 접는다: 순환 안에서는 기다리는 틈을 막는 차들이 모두 서 있어 틈이 영영 생기지 않는다
      if (v.releaseT > 0) {
        v.releaseT -= dt
        gap = sc.gap
        wait = sc.hit?.group ?? null
      }
      v.soft = this.softGap
      v.waitFor = wait
      fs.push({ key: v.id, body, gap, hit: sc.gap <= gap ? sc.hit : null, graze: sc.graze, v, set: (cap) => { v.cap = cap }, ahead: (s) => route.peek(body.half + s), phys: sc.gap, wait })
    }
    // 2) 간선 일반 차량: 차로 앞쪽을 본다
    for (const c of this.traffic.cars) {
      const lane = LANES[c.lane]
      const body = byGroup.get(c.id)
      if (!body) continue
      let sc = scanLine(body, lane.z, lane.dir, c.half, look(c.v), grid)
      // 앞차가 거의 서 있으면 같은 방향 옆 차로가 비었을 때 차로를 바꾼다
      if (sc.hit && sc.gap < 30 && sc.hit.speed < 2 && !c.zOff) {
        const j = LANES.findIndex((ln, k) => k !== c.lane && ln.dir === lane.dir)
        const ln = LANES[j]
        const free = !grid.near(c.x, ln.z, 40, []).some((b) => b.group !== c.id && Math.abs(b.z - ln.z) < 2.6 && (b.x - c.x) * ln.dir > -(b.half + c.half + 12) && (b.x - c.x) * ln.dir < b.half + c.half + 22)
        if (free) {
          this.traffic.changeLane(c, j)
          sc = scanLine(body, ln.z, ln.dir, c.half, look(c.v), grid)
        }
      }
      const curLane = LANES[c.lane]
      fs.push({ key: c.id, body, gap: sc.gap, hit: sc.hit, graze: sc.graze, v: null, phys: sc.gap, wait: sc.hit?.group ?? null, set: (cap) => { c.cap = cap }, ahead: (s) => ({ x: c.x + curLane.dir * (c.half + s), z: curLane.z, tx: curLane.dir, tz: 0 }) })
    }
    // 3) 오토바이 · 배송 로봇
    for (const m of this.life.movers) {
      if (m.kind !== 'moto' && m.kind !== 'robot') continue
      const body = byGroup.get(m.id)
      if (!body) continue
      if (m.ghostT > 0) m.ghostT -= dt
      const sc = scanAhead(body, (s) => this.life.ahead(m, s), grid, look(m.speed), { front: body.half, ignore: m.ghostT > 0 ? (b) => b.speed < 0.2 : undefined })
      fs.push({ key: m.id, body, gap: sc.gap, hit: sc.hit, graze: sc.graze, v: null, mover: m, phys: sc.gap, wait: sc.hit?.group ?? null, set: (cap) => { m.cap = m.ghostT > 0 ? Math.min(cap, 2) : cap }, ahead: (s) => this.life.ahead(m, body.half + s) })
    }
    // 3.5) 꼬리물기 금지: 앞차가 멈춰 줄을 서는 중이면, 다른 차가 지나갈 길(방향이 35° 넘게 다른 길)을
    //      덮는 자리까지는 들어가지 않고 그 앞에서 기다린다(교차로를 막아 서로 엉키지 않게)
    const byKey0 = new Map(fs.map((f) => [f.key, f]))
    const pathOf = (f: F) => {
      if (f.path) return f.path
      const out: number[] = []
      for (let s = 0; s <= 24; s += 2) {
        const p = f.ahead(s)
        if (!p) break
        out.push(p.x, p.z, p.tx, p.tz)
      }
      f.path = out
      return out
    }
    for (const f of fs) {
      if (!f.hit || f.gap > 30) continue
      const lead = byKey0.get(f.hit.group)
      const queued = (lead && lead.body.speed < 0.5) || (!lead && f.hit.speed < 0.2)
      if (!queued) continue
      const others = fs.filter((o) => o !== f && o.key !== f.hit!.group && Math.abs(o.body.x - f.body.x) < 45 && Math.abs(o.body.z - f.body.z) < 45)
      if (!others.length) continue
      let box = Infinity
      for (let s = 0; s <= Math.min(f.gap, 24) && box === Infinity; s += 1.5) {
        const p = f.ahead(s)
        if (!p) break
        for (const o of others) {
          const op = pathOf(o)
          const r = f.body.w + o.body.w + 0.2
          for (let k = 0; k < op.length; k += 4) {
            const dx = op[k] - p.x
            const dz = op[k + 1] - p.z
            if (dx * dx + dz * dz > r * r) continue
            if (Math.abs(op[k + 2] * p.tx + op[k + 3] * p.tz) > 0.82) continue
            box = s
            break
          }
          if (box !== Infinity) break
        }
      }
      // 이미 남의 길 위에 서 있으면(box 0) 그 자리에 서는 건 소용없다: 빠져나가게 둔다
      if (box > 1.5 && box < f.gap) f.gap = Math.max(0, box - 1.5 + 1.6)
    }
    // 4) 서로 막는 순환(교차로에서 2~5대가 서로를 막는 경우): 순환 안에서 앞이 가장 트인 쪽
    //    (이미 교차 지점에 들어선 쪽)을 먼저 보낸다. 나머지는 그대로 기다린다
    const byKey = new Map(fs.map((f) => [f.key, f]))
    const done = new Set<string>()
    for (const f of fs) {
      if (!f.hit || done.has(f.key)) continue
      const chain: F[] = [f]
      let cur = byKey.get(f.hit.group)
      while (cur && cur.hit && chain.length < 12 && !chain.includes(cur)) {
        chain.push(cur)
        cur = byKey.get(cur.hit.group)
      }
      if (!cur || cur !== f) continue
      // 그대로 가도 맞부딪히지 않는(스치기만 하는) 차만 먼저 보낼 수 있다. 정면으로 막힌 차는 기다린다
      // 그중 우선순위: 추월 중인 차(끝까지 마친다) > 우선권을 쥔 차 > 앞이 더 트인 차 > 빠른 차 > 이름순
      for (const c of chain) done.add(c.key)
      // 정면으로 엉킨 순환(스치는 차가 없음)은 아래 4.5)의 교착 안전장치가 맡는다
      const can = chain.filter((c) => c.graze)
      if (!can.length) continue
      const now = this.elapsed
      const rank = (c: F) => (c.v?.passing ? 2 : 0) + ((this.rightOfWay.get(c.key) ?? 0) > now ? 1 : 0)
      let win = can[0]
      for (const c of can) {
        const a = rank(c)
        const b = rank(win)
        if (a > b || (a === b && (c.gap > win.gap + 0.5 || (Math.abs(c.gap - win.gap) <= 0.5 && (c.body.speed > win.body.speed || (c.body.speed === win.body.speed && c.key < win.key)))))) win = c
      }
      this.rightOfWay.set(win.key, now + 4)
      win.gap = Infinity
      win.hit = null
      this.avoidStats.yields++
    }
    // 4.5) 약속까지 얽힌 교착: '누가 누구를 기다리나'(몸체로 막힘 + 교차로 예약 대기)를 따라가 돌아오는 순환이
    //      12초 넘게 모두 서 있으면, 약속 때문에만 서 있고 앞이 실제로 3m 넘게 빈 차 하나를 6초 동안 풀어 준다
    {
      const byW = new Map(fs.map((f) => [f.key, f]))
      const seen = new Set<string>()
      for (const f of fs) {
        if (!f.wait || seen.has(f.key)) continue
        const chain: F[] = [f]
        let cur = byW.get(f.wait)
        while (cur && cur.wait && chain.length < 16 && !chain.includes(cur)) {
          chain.push(cur)
          cur = byW.get(cur.wait)
        }
        if (cur !== f) continue
        for (const c of chain) seen.add(c.key)
        const ck = `w:${chain.map((c) => c.key).sort().join('|')}`
        // 일반 차량끼리만 도는 순환: 차로를 바꾸다 같은 자리에 겹친 두 차가 서로를 앞차로 보는 경우다.
        // 약속이 없는 차들이라 기다릴 이유가 없다: 차로 진행 방향으로 더 앞선 차를 바로 보낸다
        if (!chain.some((c) => c.v || c.mover)) {
          if (chain.every((c) => c.body.speed < 0.3)) {
            const prog = (c: F) => {
              const p = c.ahead(0)
              return p ? c.body.x * p.tx + c.body.z * p.tz : 0
            }
            const lead = chain.reduce((a, b) => (prog(b) > prog(a) ? b : a))
            lead.gap = Infinity
            lead.hit = null
            this.avoidStats.yields++
          }
          continue
        }
        // 모두 서 있는가: 사람·오토바이 앞에서는 2.2m 떨어져 서므로 3m 안쪽이면 선 것으로 본다
        if (!chain.every((c) => c.gap < 3 && c.body.speed < 0.3)) {
          this.stuckCycles.delete(ck)
          continue
        }
        const t = (this.stuckCycles.get(ck) ?? 0) + dt
        this.stuckCycles.set(ck, t)
        if (t < 12) continue
        this.stuckCycles.delete(ck)
        // 약속 때문에만 서 있고 앞이 실제로 비어 있는 차가 있으면 그 차만 풀어 준다(겹치지 않는다)
        const cand = chain.filter((c) => c.v && (c.phys ?? 0) > 3 && c.gap < (c.phys ?? 0) - 0.5)
        if (cand.length) {
          const win = cand.reduce((a, b) => ((b.phys ?? 0) > (a.phys ?? 0) ? b : a))
          win.v!.releaseT = 6
          win.gap = win.phys ?? Infinity
          this.avoidStats.releases++
          continue
        }
        // 모두 몸으로 막혀 있으면(정면으로 엉킴) 하나를 천천히(2m/s) 6초 동안 빼 준다: 잠깐 겹칠 수 있다.
        // 오토바이·로봇이 있으면 작은 쪽을 먼저 뺀다(겹치는 모습이 덜 보인다)
        const small = chain.filter((c) => c.mover)
        const pool = small.length ? small : chain.filter((c) => c.v)
        const win = pool.reduce((a, b) => (b.key < a.key ? b : a))
        if (win.v) {
          win.v.ghostT = 6
          win.v.releaseT = 6
        }
        if (win.mover) win.mover.ghostT = 6
        win.gap = -1
        this.avoidStats.ghosts++
      }
    }
    if (this.debugWaits) this.lastWaits = fs.map((f) => ({ key: f.key, wait: f.wait ?? null, gap: f.gap, phys: f.phys ?? 0, speed: f.body.speed, x: f.body.x, z: f.body.z }))
    // 5) 속도 상한 적용 · 오래 막히면 교착으로 보고 정지 차량을 잠깐 무시한다
    let stopped = 0
    for (const f of fs) {
      const cap = f.gap === -1 ? 2 : capFromGap(f.gap, f.hit && f.hit.w < 0.5 ? 2.2 : 1.6)
      f.set(cap)
      if (cap < 0.3) stopped++
      const v = f.v
      if (!v) continue
      // 교착에서 빼 주는 중인 차는 천천히 지나간다
      if (v.ghostT > 0 && cap > 3) f.set(3)
      v.room = f.gap === -1 ? Infinity : Math.max(0, Math.min(f.gap, v.soft) - 1.6)
      v.blockedT = cap < 0.3 ? v.blockedT + dt : 0
      // 줄 서 있는 차(다른 추종 차량) 때문이면 기다린다: 앞이 움직이면 풀린다.
      // 오래 서 있는 작업 차량·지게차·사람에 막혀 비켜 갈 수도 없을 때만 잠깐 무시하고 빠져나간다
      const queued = f.hit ? byKey.has(f.hit.group) : false
      if (v.blockedT > 18 && v.ghostT <= 0 && f.hit && f.hit.speed < 0.2 && !queued) {
        v.ghostT = 6
        v.blockedT = 0
        this.avoidStats.ghosts++
      }
    }
    this.avoidStats.stopped = stopped
  }

  // ───────────────────────── 돌발 상황 — 문장 해석은 AI 모듈, 적용 정책은 여기서

  /** 차량이 지금 달리는 구간의 속도 배율 */
  legFactor(v: Vehicle, l: Leg | undefined) {
    if (!l) return 1
    if (v.kind === 'van' && v.site === 'TW') return this.linkFactor.town_gate
    const link = linkOfLeg(l)
    return link ? this.linkFactor[link] : 1
  }

  addIncident(text: string, source: string, truth: Incident['truth'] = null, duration = 150) {
    const i: Incident = { id: this.incidentSeq++, time: this.clock, text, source, truth, ai: null, status: 'pending', state: 'reading', applied: null, decision: ai.on ? tr('AI 판독 중', 'AI reading') : tr('기본 규칙 확인 중', 'Checking default rules'), until: 0, duration }
    this.incidents.unshift(i)
    if (this.incidents.length > 16) this.incidents.pop()
    if (this.onIncident) this.onIncident(i)
    else this.resolveIncident(i, null)
    return i
  }

  /** AI 판독 결과(또는 실패)를 받아 코드 정책으로 적용한다 */
  resolveIncident(i: Incident, a: IncidentAnswer | null) {
    i.ai = a
    i.status = a ? 'ready' : 'error'
    if (!a) {
      i.state = 'confirm'
      i.decision = ai.on ? tr('판독 실패 → 관제사 확인 대기', 'Reading failed → awaiting controller check') : tr('AI 꺼짐 → 관제사 확인 대기', 'AI off → awaiting controller check')
      return
    }
    if (a.link === 'none' || !(LINK_IDS as string[]).includes(a.link)) {
      i.state = 'ignored'
      i.decision = tr('우리 운행 구간 밖 → 조치 없음', 'Outside our routes → no action')
      return
    }
    const link = a.link as LinkId
    if (a.impact < 0.5) {
      const active = this.incidents.filter((x) => x !== i && x.state === 'active' && x.applied?.link === link)
      active.forEach((x) => { x.state = 'cleared'; x.decision += tr(' · 해제됨', ' · cleared') })
      i.state = 'info'
      i.decision = active.length ? tr(`${LINK_LABEL[link]} 정상화 → 제한 해제`, `${LINK_LABEL[link]} back to normal → limits lifted`) : tr(`${LINK_LABEL[link]} 영향 없음`, `${LINK_LABEL[link]} no impact`)
      this.recomputeLinks()
      return
    }
    if (a.linkConfidence < 0.6 || a.impactConfidence < 0.4) {
      i.state = 'confirm'
      i.decision = tr(`${LINK_LABEL[link]}?(신뢰도 낮음) → 관제사 확인 대기`, `${LINK_LABEL[link]}? (low confidence) → awaiting controller check`)
      return
    }
    this.activateIncident(i, link, a.impact)
  }

  confirmIncident(id: number, accept: boolean) {
    const i = this.incidents.find((x) => x.id === id)
    if (!i || i.state !== 'confirm') return
    const link = i.ai && (LINK_IDS as string[]).includes(i.ai.link) ? (i.ai.link as LinkId) : i.truth && i.truth.link !== 'none' ? i.truth.link : null
    if (!accept || !link) {
      i.state = 'ignored'
      i.decision = tr('관제사 판단 → 조치 없음', 'Controller decision → no action')
      return
    }
    this.activateIncident(i, link, Math.max(1, i.ai?.impact ?? 2))
  }

  private activateIncident(i: Incident, link: LinkId, impact: number) {
    i.state = 'active'
    i.applied = { link, impact }
    i.until = this.elapsed + (i.duration || 150)
    const f = impactFactor(impact)
    const moving = this.vehicles.filter((v) => v.visible && v.route && !v.route.done && this.routeHits(v, link)).length
    if (link === 'town_gate') i.decision = impact >= 2.5 ? tr('정문 진입 불가 → 후문 진입 · 단지 안 서행', 'Main gate blocked → use back gate · slow inside the complex') : tr(`단지 안 서행 ${Math.round(f * 100)}%`, `Slow inside the complex ${Math.round(f * 100)}%`)
    else if (link === 'port_crane') i.decision = impact >= 2.5 ? tr('크레인 최저 속도(30%) 운전 · 선석 계획 지연', 'Cranes at minimum speed (30%) · berth plan delayed') : tr(`안벽·야드 크레인 속도 ${Math.round(Math.max(0.3, f) * 100)}%로 제한`, `Quay and yard cranes limited to ${Math.round(Math.max(0.3, f) * 100)}% speed`)
    else i.decision = tr(`${LINK_LABEL[link]} 속도 ${Math.round(f * 100)}%${impact >= 2.5 ? ' · 통제 구간은 남은 차로로 서행' : ''} · 운행 중 ${moving}대 도착 예정 다시 계산`, `${LINK_LABEL[link]} speed ${Math.round(f * 100)}%${impact >= 2.5 ? ' · closed section: slow in remaining lanes' : ''} · ETA recalculated for ${moving} moving ${plural(moving, 'vehicle')}`)
    this.recomputeLinks()
  }

  private routeHits(v: Vehicle, link: LinkId) {
    if (link === 'town_gate') return v.kind === 'van' && v.site === 'TW'
    const t = v.tasks.find((x) => x.k === 'drive')
    return !!t && t.k === 'drive' && t.legs.some((l) => linkOfLeg(l) === link)
  }

  private recomputeLinks() {
    for (const k of LINK_IDS) this.linkFactor[k] = 1
    for (const i of this.incidents) if (i.state === 'active' && i.applied) this.linkFactor[i.applied.link] = Math.min(this.linkFactor[i.applied.link], impactFactor(i.applied.impact))
    this.port.windFactor = Math.max(0.3, this.linkFactor.port_crane)
  }

  private stepIncidents(dt: number) {
    let changed = false
    for (const i of this.incidents) {
      if (i.state === 'active' && this.elapsed > i.until) {
        i.state = 'cleared'
        i.decision += tr(' · 해제됨', ' · cleared')
        changed = true
      }
    }
    if (changed) this.recomputeLinks()
    this.incidentTimer -= dt
    if (this.incidentTimer <= 0) {
      this.incidentTimer = 150 + r() * 110
      const recent = new Set(this.incidents.slice(0, 5).map((x) => x.text))
      const pool = INCIDENT_POOL.filter((x) => !recent.has(x.text))
      const p = pick(pool.length ? pool : INCIDENT_POOL, r)
      this.addIncident(p.text, p.source, { link: p.link, impact: p.impact }, p.dur)
    }
  }

  private once(key: string, fn: () => void) {
    if (this.reported.has(key)) return
    this.reported.add(key)
    fn()
  }

  private reportScan = 0

  private stepReports(dt: number) {
    this.reportScan += dt
    if (this.reportScan < 0.5) return
    dt = this.reportScan
    this.reportScan = 0
    // 시뮬레이션 사건에서 생기는 보고
    for (const f of this.forklifts) {
      if (f.battery < 24 && f.status !== 'charging') this.once(`bat-${f.id}-${Math.floor(this.clock / 3600)}`, () => this.addReport(f.site, tr(`지게차 ${f.id}`, `Forklift ${f.id}`), tr(`${f.id} 배터리 ${Math.round(f.battery)}% 경고등 깜빡여요. 충전기 비면 바로 충전할게요`, `${f.id} battery at ${Math.round(f.battery)}%, warning light is blinking. I'll charge it as soon as a charger is free`)))
    }
    for (const v of this.vehicles) {
      if (v.visible && v.phase === 'waiting') this.once(`wait-${v.id}-${v.trip}`, () => this.addReport(v.site, tr(`간선 기사 ${v.driver}`, `Linehaul driver ${v.driver}`), tr(`${v.id} ${v.site === 'GJ' ? '곤지암' : v.site === 'IN' ? '인천' : '이천'} 도크 빈자리 없어서 대기 중입니다`, `${v.id} is waiting, no free dock at ${v.site === 'GJ' ? 'Gonjiam' : v.site === 'IN' ? 'Incheon' : 'Icheon'}`)))
    }
    const held = this.inSlots.reduce((s, x) => s + x.held, 0)
    if (held > 200) this.once(`held-${Math.floor(this.clock / 1800)}`, () => this.addReport('IN', tr('휠소터', 'Wheel sorter'), tr(`인천 슈트 대기 물량이 ${held * 8}박스까지 쌓였어요. 기사님 복귀가 늦어지고 있습니다`, `Up to ${held * 8} boxes are now waiting in the Incheon chutes. Drivers are late getting back`)))
    // 사람들이 올리는 보고(무작위)
    this.reportTimer -= dt
    if (this.reportTimer <= 0) {
      this.reportTimer = 26 + r() * 22
      // 최근에 올라온 문장은 피한다
      const recent = new Set(this.reports.slice(0, 10).map((x) => x.text))
      const pool = REPORT_POOL.filter((x) => !recent.has(x.text))
      const p = pick(pool.length ? pool : REPORT_POOL, r)
      this.addReport(p.site, p.source, p.text)
    }
  }

  vehicle(id: string) {
    return this.vehicles.find((v) => v.id === id)
  }

  forklift(id: string) {
    return this.forklifts.find((f) => f.id === id)
  }

  /** 지정 엔티티의 현재 월드 좌표(카메라 추적·라벨용) */
  locate(kind: string, id: string): { x: number; y: number; z: number } | null {
    if (kind === 'mover') {
      const m = this.life.movers.find((x) => x.id === id)
      return m ? { x: m.x, y: m.kind === 'drone' ? m.y : 1, z: m.z } : null
    }
    if (kind === 'robot') {
      const rb = this.robots.find((x) => x.id === id)
      return rb ? { x: rb.x, y: 0.8, z: rb.z } : null
    }
    if (kind === 'equip') {
      const e = this.djwh.equipById(id)
      return e ? { x: e.x, y: 1.6, z: e.z } : null
    }
    if (kind === 'vehicle') {
      const v = this.vehicle(id)
      if (!v || !v.visible) return null
      if (v.kind === 'trailer') return { x: (v.x + v.trailer.x) / 2, y: 4.2, z: (v.z + v.trailer.z) / 2 }
      return { x: v.x, y: v.kind === 'van' ? 2.6 : 3.9, z: v.z }
    }
    if (kind === 'forklift') {
      const f = this.forklift(id)
      return f ? { x: f.x, y: 2.3, z: f.z } : null
    }
    if (kind === 'pallet') {
      const p = this.pallets.get(id)
      if (!p) return null
      if (p.state === 'staged' || p.state === 'line') return { x: p.x, y: 1.4, z: p.z }
      if (p.state === 'onFork' && p.forkliftId) return this.locate('forklift', p.forkliftId)
      if (p.state === 'onTruck' && p.vehicleId) return this.locate('vehicle', p.vehicleId)
      return null
    }
    if (kind === 'charger') {
      const c = this.chargers.find((x) => x.id === id)
      return c ? { x: c.x, y: 1.6, z: c.z } : null
    }
    if (kind === 'dock') {
      const d = this.docks.find((x) => x.id === id)
      if (d) return { x: d.x, y: 5, z: L.BUILDING.z1 }
      const b = this.bays.find((x) => x.id === id)
      if (b) return { x: b.x, y: 1, z: L.BAY_Z }
      const s = this.slots.find((x) => x.id === id)
      if (s) return { x: s.x, y: 1, z: s.side === 'N' ? L.VAN_N_Z : L.VAN_S_Z }
      const ib = this.icBays.find((x) => x.id === id)
      if (ib) return { x: ib.x, y: 1, z: IC.bayZ }
      const ir = this.icReefers.find((x) => x.id === id)
      if (ir) return { x: ir.x, y: 1, z: IC.reeferZ }
      const di = this.inDocks.findIndex((x) => x.id === id)
      if (di >= 0) return { x: IN.boxX, y: 1, z: IN.docks[di] }
      const is = this.inSlots.find((x) => x.id === id)
      if (is) return { x: is.x, y: 1, z: is.side === 'N' ? IN.vanNZ : IN.vanSZ }
      return null
    }
    if (kind === 'sorter') return id === 'S2' ? { x: -470, y: 2, z: IN.conv.z } : id === 'X1' ? { x: -8, y: 2, z: -26 } : { x: 34, y: 2, z: L.CONVEYOR.z }
    if (kind === 'story') {
      const p = this.journeyPos(id)
      return { x: p.x, y: p.y, z: p.z }
    }
    if (kind === 'aircraft') {
      const a = this.airport.aircraft.find((x) => x.id === id)
      return a ? { x: a.x, y: a.y + 6, z: a.z } : null
    }
    if (kind === 'barge') return this.barge.visible ? { x: this.barge.x, y: 4, z: this.barge.z } : null
    if (kind === 'crane') {
      const [type, n] = id.split('-')
      const i = Number(n)
      if (type === 'sts') return this.port.sts[i] ? { x: this.port.sts[i].x, y: 2, z: PORT.handZ + 6 } : null
      if (type === 'armg') return this.port.armgs[i] ? { x: PORT.blocks[i >> 1], y: 2, z: this.port.armgs[i].z } : null
      if (type === 'agv') return this.port.agvs[i] ? { x: this.port.agvs[i].x, y: 2, z: this.port.agvs[i].z } : null
      return null
    }
    return null
  }
}

export const sim = new Sim()
