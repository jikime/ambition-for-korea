// 부산신항 자동화 터미널: 안벽 크레인(STS) 듀얼 사이클링 · AGV · 자동화 야드 크레인(ARMG)
// 컨테이너 한 개 한 개를 추적한다. 수입 컨테이너는 적하목록(manifest)을 달고 내려온다.
import { angleLerp, leg, Route, v2, type V2 } from './path'
import { mulberry32 } from './data'
import { ai } from './ai'
import { L } from '../i18n'

export interface ManifestFlags {
  dangerous: number
  reefer: number
  mismatch: number
}

export interface Manifest {
  no: string
  declared: string
  description: string
  shipper: string
  flags: ManifestFlags | null
  status: 'pending' | 'ready' | 'error'
  /** 검토 요청을 이미 보냈는지(훅이 연결되기 전에 만든 항목은 나중에 다시 보낸다) */
  sent: boolean
}

export interface Box {
  id: string
  color: string
  kind: 'import' | 'export'
  manifest: Manifest | null
}

export const PORT = {
  cranes: [215, 255, 295],
  handZ: 293,
  bays: Array.from({ length: 10 }, (_, i) => 186 + i * 12.6),
  rowsZ: Array.from({ length: 9 }, (_, r) => 307.6 + r * 2.6),
  deckY: 4,
  shipTiers: 3,
  blocks: [205, 240, 275, 310],
  blockBays: Array.from({ length: 10 }, (_, b) => 124.6 + b * 13.2),
  blockRows: [-5.2, -2.6, 0, 2.6, 5.2],
  blockTiers: 4,
  seaZ: 262,
  landZ: 101.5,
  laneIn: 272,
  laneOut: 279,
  truckLane: 98,
  exitLane: 84,
  xrayX: 300,
  loopX: 352,
  blockKind: ['reefer', 'general', 'general', 'dg'] as const,
}

/** 블록 칸(bay) 하나의 용량: 5열 × 4단 */
export const BAY_CAP = PORT.blockRows.length * PORT.blockTiers
export const SHIP_CAP = PORT.rowsZ.length * PORT.shipTiers

const COLORS = ['#5FAFAA', '#E59B6B', '#6585E8', '#A3ACBE', '#D47A74', '#76B08A', '#E2BF6E']
const REEFER = '#EEF2F8'
const DG = '#E8763F'

export const MANIFEST_POOL: { declared: string; description: string; shipper: string }[] = [
  { declared: L('자동차 부품', 'Auto parts'), description: 'AUTO PARTS - BRAKE PADS AND ROTORS', shipper: 'Hanwoo Motors (VN)' },
  { declared: L('자동차 부품', 'Auto parts'), description: 'LITHIUM ION BATTERIES UN3480 PACKED WITH EQUIPMENT', shipper: 'Delta Auto (CN)' },
  { declared: L('냉동 새우', 'Frozen shrimp'), description: 'FROZEN SHRIMP -18C, 24 PALLETS', shipper: 'Mekong Seafood (VN)' },
  { declared: L('의류', 'Clothing'), description: 'USED CLOTHING IN BALES', shipper: 'Eastern Textile (MY)' },
  { declared: L('완구', 'Toys'), description: 'PERFUME 100ML, FLAMMABLE LIQUID UN1266', shipper: 'Lucky Trade (HK)' },
  { declared: L('화장품', 'Cosmetics'), description: 'COSMETICS: LIPSTICK, FACE CREAM', shipper: 'Bella Lab (FR)' },
  { declared: L('신선 과일', 'Fresh fruit'), description: 'FRESH BANANAS 13C', shipper: 'Davao Fruits (PH)' },
  { declared: L('가구', 'Furniture'), description: 'WOODEN FURNITURE - DINING CHAIRS', shipper: 'Oak & Co (ID)' },
  { declared: L('기계 부품', 'Machine parts'), description: 'COMPRESSED NITROGEN GAS CYLINDERS UN1066', shipper: 'Sino Gas (CN)' },
  { declared: L('식료품', 'Foodstuffs'), description: 'FROZEN PORK BELLY -20C', shipper: 'Iberia Meats (ES)' },
  { declared: L('전자제품', 'Electronics'), description: 'LED TV 55 INCH, 120 UNITS', shipper: 'Pearl Electronics (CN)' },
  { declared: L('잡화', 'General goods'), description: 'CIGARETTES 50 CARTONS HIDDEN IN TOWELS', shipper: 'Golden Gate Trading (TH)' },
  { declared: L('냉장 육류', 'Chilled meat'), description: 'CHILLED BEEF CHUCK 0-2C', shipper: 'Southern Plains (AU)' },
  { declared: L('페인트', 'Paint'), description: 'PAINT, FLAMMABLE UN1263 CLASS 3', shipper: 'Color World (JP)' },
  { declared: L('타이어', 'Tires'), description: 'NEW CAR TIRES 205/55R16', shipper: 'Road King (TH)' },
  { declared: L('생활용품', 'Household goods'), description: 'AEROSOL SPRAY CANS UN1950', shipper: 'Clean Home (CN)' },
  { declared: L('건강식품', 'Health supplements'), description: 'VITAMIN SUPPLEMENTS IN BOTTLES', shipper: 'Nature Lab (US)' },
  { declared: L('커피 원두', 'Coffee beans'), description: 'GREEN COFFEE BEANS 60KG BAGS', shipper: 'Huila Coffee (CO)' },
  { declared: L('의약품', 'Pharmaceuticals'), description: 'VACCINES, KEEP AT 2-8C', shipper: 'BioPharm (DE)' },
  { declared: L('주방용품', 'Kitchenware'), description: 'STAINLESS STEEL COOKWARE SETS', shipper: 'Steel Home (IN)' },
  // 해외 직구 특송 묶음(개인 고객 상자를 한 컨테이너에 모은 것)
  { declared: L('해외 직구 특송', 'Overseas e-commerce express'), description: 'E-COMMERCE PARCELS: PHONE CASES, T-SHIRTS, SNEAKERS (1,240 PCS)', shipper: 'Yiwu Express (CN)' },
  { declared: L('해외 직구 특송', 'Overseas e-commerce express'), description: 'E-COMMERCE PARCELS: PROTEIN POWDER, VITAMINS (860 PCS)', shipper: 'Shop US Direct (US)' },
  { declared: L('의류', 'Clothing'), description: 'E-COMMERCE PARCELS: WOMEN DRESSES AND HANDBAGS (930 PCS)', shipper: 'Guangzhou Fashion (CN)' },
]

type Act =
  | { k: 'gantry'; x: number }
  | { k: 'trolley'; z: number }
  | { k: 'hoist'; y: number }
  | { k: 'do'; fn: () => void }
  | { k: 'waitFor'; until: () => boolean }

export interface Sts {
  home: number
  x: number
  trolleyZ: number
  spreaderY: number
  box: Box | null
  agv: number | null
  acts: Act[]
  moves: number
}

export interface Agv {
  id: string
  x: number
  z: number
  heading: number
  route: Route | null
  state: 'toBlock' | 'atBlock' | 'toCrane' | 'queue' | 'atCrane' | 'review'
  box: Box | null
  block: number
  crane: number
  wait: number
  seaOutPending: boolean
  seaInPending: boolean
  reviewT: number
}

export type ArmgTask = { kind: 'seaIn' | 'seaOut' | 'landIn' | 'landOut'; agv?: number; trailer?: string }

export interface Armg {
  block: number
  side: 'sea' | 'land'
  z: number
  trolley: number
  spreaderY: number
  box: Box | null
  tasks: ArmgTask[]
  acts: Act[]
  busy: boolean
}

export interface TrailerSlot {
  block: number
  stage: 'waiting' | 'done'
  box: Box | null
  takeExport: boolean
}

/** 선석에 차례로 들어오는 가상 선박(선명 · 선체 색) */
export const VESSELS = [
  { name: 'DAON OCEAN', hull: '#1F2D4A' },
  { name: 'HANBIT STAR', hull: '#8A2E2E' },
  { name: 'SEOHAE PIONEER', hull: '#1F5A3A' },
  { name: 'KORI BRIDGE', hull: '#3B4458' },
]
export type BerthPhase = 'working' | 'departing' | 'away' | 'arriving'
/** 선박이 안벽에서 물러나는 거리(m)와 속도(m/s) */
const BERTH_OUT = 70
const BERTH_SPEED = 3

export class PortSim {
  r = mulberry32(905)
  /** 선석 1: 작업 → 출항 → 비움 → 다음 배 입항(항만 관제 영상 2순위). offset은 안벽에서 바다 쪽으로 물러난 거리 */
  berth = {
    phase: 'working' as BerthPhase, t: 0, offset: 0, moves: 0, target: 110, vessel: 0, since: 0,
    history: [] as { phase: BerthPhase; vessel: number; start: number; end: number | null }[],
    /** 선사 지연 통보(⑯)로 늘어난 선석 비움 시간(시뮬레이션 초) · 다음 배 기항 취소 */
    extraAway: 0, skip: false,
  }
  private vr = mulberry32(4242)
  ship: Box[][] = PORT.bays.map(() => [])
  blocks: Box[][][] = PORT.blocks.map(() => PORT.blockBays.map(() => []))
  sts: Sts[]
  agvs: Agv[] = []
  armgs: Armg[]
  trailers = new Map<string, TrailerSlot>()
  /** 화면 갱신이 필요할 때 증가(인스턴스 재계산용) */
  version = 1
  seq = 3100
  stats = { discharged: 0, loaded: 0, dg: 0, reefer: 0, xray: 0, cycles: 0 }
  log: { time: number; id: string; manifest: Manifest | null; decision: string }[] = []
  windFactor = 1
  onManifest: ((b: Box) => void) | null = null
  clock = () => 0
  /** 해상 여정에서 따라가는 수입 컨테이너: 안벽 크레인이 먼저 내리고, 육측 반출 때 먼저 꺼낸다 */
  focus: Box | null = null

  /** 따라가는 컨테이너가 장치된 블록(없으면 -1) */
  focusBlock() {
    const f = this.focus
    return f ? this.blocks.findIndex((blk) => blk.some((bay) => bay.includes(f))) : -1
  }

  constructor() {
    const r = this.r
    // 선박: 칸마다 9~22개, 앞쪽 칸은 양하(수입), 뒤쪽 칸은 적하(수출) 공간이 남아 있다
    this.ship.forEach((bay, i) => {
      const n = i < 6 ? 14 + Math.floor(r() * 10) : 6 + Math.floor(r() * 8)
      for (let k = 0; k < n; k++) bay.push(this.newBox('import'))
    })
    this.blocks.forEach((blk, b) => blk.forEach((bay) => {
      const n = 6 + Math.floor(r() * 10)
      for (let k = 0; k < n; k++) bay.push(this.newBox(b === 1 || b === 2 ? (r() < 0.5 ? 'export' : 'import') : 'import', PORT.blockKind[b]))
    }))
    this.sts = PORT.cranes.map((x) => ({ home: x, x, trolleyZ: PORT.handZ, spreaderY: 26, box: null, agv: null, acts: [], moves: 0 }))
    // 블록마다 해측·육측 ARMG 2기(트윈)
    this.armgs = PORT.blocks.flatMap((_, b) => [
      { block: b, side: 'sea' as const, z: 236 - 20 * (b % 2), trolley: 0, spreaderY: 20, box: null, tasks: [], acts: [], busy: false },
      { block: b, side: 'land' as const, z: 128 + 20 * (b % 2), trolley: 0, spreaderY: 20, box: null, tasks: [], acts: [], busy: false },
    ])
    for (let i = 0; i < 6; i++) {
      const block = 1 + (i % 2)
      const x = PORT.blocks[block] + (i < 2 ? 0 : (i % 3) * 4 - 4)
      const a: Agv = {
        id: `AGV-${String(i + 1).padStart(2, '0')}`, x, z: PORT.laneIn + (i % 2) * 7, heading: Math.PI, route: null,
        state: 'toBlock', box: null, block, crane: i % 3, wait: i * 1.2, seaOutPending: false, seaInPending: false, reviewT: 0,
      }
      this.agvs.push(a)
    }
    this.agvs.forEach((a, i) => this.agvToBlock(i, a.block))
  }

  newBox(kind: Box['kind'], blockKind: string = 'general'): Box {
    const color = blockKind === 'reefer' ? REEFER : blockKind === 'dg' ? DG : COLORS[Math.floor(this.r() * COLORS.length)]
    const prefix = ['NURU', 'HNMU', 'SEOU', 'KORU'][Math.floor(this.r() * 4)]
    return { id: `${prefix}${String(this.seq++ * 7919 % 9000000 + 1000000)}`, color, kind, manifest: null }
  }

  private dirty() {
    this.version++
  }

  // ───────────────────────── AGV

  private agvToBlock(i: number, block: number) {
    const a = this.agvs[i]
    a.block = block
    a.state = 'toBlock'
    const bx = PORT.blocks[block] + (i % 2 ? 1.2 : -1.2)
    a.route = new Route([leg([v2(a.x, a.z), v2(a.x, PORT.laneIn), v2(bx, PORT.laneIn), v2(bx, PORT.seaZ)], { speed: 8 * this.windFactor, kmh: 28, r: 4 })])
  }

  private agvToCrane(i: number) {
    const a = this.agvs[i]
    // 대기열이 가장 짧은 크레인
    const load = this.sts.map((s, k) => this.agvs.filter((x) => x.crane === k && (x.state === 'toCrane' || x.state === 'queue' || x.state === 'atCrane')).length + (s.agv !== null ? 1 : 0))
    let crane = 0
    for (let k = 1; k < load.length; k++) if (load[k] < load[crane]) crane = k
    a.crane = crane
    a.state = 'toCrane'
    const cx = this.sts[crane].home
    a.route = new Route([leg([v2(a.x, a.z), v2(a.x, PORT.laneOut), v2(cx + 15, PORT.laneOut), v2(cx + 15, PORT.handZ)], { speed: 8 * this.windFactor, kmh: 28, r: 4 })])
  }

  private stepAgvs(dt: number) {
    this.agvs.forEach((a, i) => {
      if (a.wait > 0) {
        a.wait -= dt
        return
      }
      if (a.route && !a.route.done) {
        a.route.step(dt)
        const p = a.route.pose()
        a.x = p.x
        a.z = p.z
        a.heading = angleLerp(a.heading, p.heading, Math.min(1, dt * 6))
        if (!a.route.done) return
      }
      if (a.state === 'toBlock') {
        a.state = 'atBlock'
        const arm = this.armgs[a.block * 2]
        if (a.box) {
          a.seaInPending = true
          arm.tasks.push({ kind: 'seaIn', agv: i })
        }
        a.seaOutPending = true
        arm.tasks.push({ kind: 'seaOut', agv: i })
      } else if (a.state === 'atBlock') {
        if (!a.seaInPending && !a.seaOutPending) this.agvToCrane(i)
      } else if (a.state === 'toCrane') {
        a.state = 'queue'
      } else if (a.state === 'queue') {
        const s = this.sts[a.crane]
        // 배가 선석에 붙어 작업 중일 때만 크레인이 새 작업을 시작한다(작업량을 채우면 받지 않고 출항 준비)
        if (s.agv === null && this.acceptingWork) {
          s.agv = i
          a.route = new Route([leg([v2(a.x, a.z), v2(s.home, PORT.handZ)], { speed: 3, kmh: 10, r: 0 })])
          a.state = 'atCrane'
          a.heading = -Math.PI / 2
          this.planSts(a.crane)
        }
      } else if (a.state === 'review') {
        // 수입 컨테이너 적하목록 검토(AI)가 끝나면 장치 블록을 고른다(최대 5초 대기)
        a.wait = 0
        if (a.box) this.screen(a.box)
        const m = a.box?.manifest
        if (!m || m.status !== 'pending' || a.reviewT <= 0) {
          const f = m?.flags
          const general = [1, 2, 1, 2, 0, 3]
          const block = f && f.dangerous > 0.5 ? 3 : f && f.reefer > 0.5 ? 0 : general[Math.floor(this.r() * general.length)]
          if (f && f.dangerous > 0.5) this.stats.dg++
          if (f && f.reefer > 0.5) this.stats.reefer++
          if (a.box) this.log.unshift({ time: this.clock(), id: a.box.id, manifest: m ? { ...m } : null, decision: f ? (f.dangerous > 0.5 ? L('위험물 격리구역(D)', 'DG segregation area (D)') : f.reefer > 0.5 ? L('냉동 블록 A(전원)', 'Reefer block A (power)') : L(`일반 블록 ${'ABCD'[block]}`, `General block ${'ABCD'[block]}`)) + (f.mismatch > 0.6 ? L(' · 신고 불일치', ' · declaration mismatch') : '') : `${ai.on ? L('검토 지연', 'Review delayed') : L('AI 꺼짐 · 기본 규칙', 'AI off · default rule')} → ${L(`일반 블록 ${'ABCD'[block]}`, `General block ${'ABCD'[block]}`)}` })
          if (this.log.length > 10) this.log.pop()
          this.agvToBlock(i, block)
        } else a.reviewT -= dt
      }
    })
  }

  // ───────────────────────── 안벽 크레인(듀얼 사이클링)

  private stackTopY(n: number) {
    const tier = Math.floor(n / PORT.rowsZ.length)
    return PORT.deckY + tier * 2.6
  }

  private planSts(k: number) {
    const s = this.sts[k]
    const agvIdx = s.agv!
    const agv = this.agvs[agvIdx]
    const near = PORT.bays.map((x, i) => ({ i, d: Math.abs(x - s.home) })).filter((b) => b.d < 26).map((b) => b.i)
    // 여정 컨테이너가 맨 위에 있는 칸이면 그 칸을 먼저 내리고, 그 위에는 싣지 않는다
    const fBay = this.focus ? near.find((i) => this.ship[i][this.ship[i].length - 1] === this.focus) : undefined
    const loadBay = near.filter((i) => i !== fBay && this.ship[i].length < SHIP_CAP).sort((a, b) => this.ship[a].length - this.ship[b].length)[0] ?? near[0]
    const disBay = fBay ?? near.filter((i) => this.ship[i].length > 0).sort((a, b) => this.ship[b].length - this.ship[a].length)[0] ?? near[0]
    const deckAgvY = 1.15 + 2.6 + 0.2
    this.prescreen(disBay)
    const acts: Act[] = [{ k: 'gantry', x: s.home }, { k: 'trolley', z: PORT.handZ }]
    if (agv.box) {
      acts.push(
        { k: 'hoist', y: deckAgvY },
        { k: 'do', fn: () => { s.box = agv.box; agv.box = null } },
        { k: 'hoist', y: 26 },
        { k: 'gantry', x: PORT.bays[loadBay] },
      )
      const n = this.ship[loadBay].length
      acts.push(
        { k: 'trolley', z: PORT.rowsZ[n % PORT.rowsZ.length] },
        { k: 'hoist', y: this.stackTopY(n) + 2.6 + 0.2 },
        { k: 'do', fn: () => { if (s.box) { s.box.kind = 'export'; s.box.manifest = null; this.ship[loadBay].push(s.box) } s.box = null; this.stats.loaded++; this.berth.moves++; this.dirty() } },
        { k: 'hoist', y: 26 },
      )
    }
    acts.push({ k: 'gantry', x: PORT.bays[disBay] })
    const m = Math.max(0, this.ship[disBay].length - 1)
    acts.push(
      { k: 'trolley', z: PORT.rowsZ[m % PORT.rowsZ.length] },
      { k: 'hoist', y: this.stackTopY(m) + 2.6 + 0.2 },
      {
        k: 'do', fn: () => {
          const b = this.ship[disBay].pop() ?? this.newBox('import')
          b.kind = 'import'
          this.screen(b)
          s.box = b
          this.stats.discharged++
          this.berth.moves++
          this.dirty()
          this.prescreen(disBay)
        },
      },
      { k: 'hoist', y: 26 },
      { k: 'gantry', x: s.home },
      { k: 'trolley', z: PORT.handZ },
      { k: 'hoist', y: deckAgvY },
      {
        k: 'do', fn: () => {
          agv.box = s.box
          s.box = null
          s.agv = null
          s.moves++
          this.stats.cycles++
          agv.state = 'review'
          agv.reviewT = 5
        },
      },
      { k: 'hoist', y: 26 },
    )
    s.acts = acts
  }

  /** 입항 전 적하목록 심사: 선박 베이 맨 위 두 개의 신고 내용을 미리 검토 큐에 넣는다 */
  private prescreen(bay: number) {
    for (const b of this.ship[bay].slice(-2)) this.screen(b)
  }

  /** 적하목록을 붙이고, 아직 검토 요청을 안 보냈으면 보낸다 */
  screen(b: Box) {
    if (!b.manifest) b.manifest = this.makeManifest()
    const m = b.manifest
    if (m.status === 'pending' && !m.sent && this.onManifest) {
      m.sent = true
      this.onManifest(b)
    }
  }

  makeManifest(): Manifest {
    const p = MANIFEST_POOL[Math.floor(this.r() * MANIFEST_POOL.length)]
    return { no: `MF-${2600 + Math.floor(this.r() * 900)}`, declared: p.declared, description: p.description, shipper: p.shipper, flags: null, status: 'pending', sent: false }
  }

  private runActs(o: { x?: number; trolleyZ?: number; z?: number; trolley?: number; spreaderY: number; acts: Act[] }, dt: number, sp: { gantry: number; trolley: number; hoist: number }, axis: 'sts' | 'armg') {
    const a = o.acts[0]
    if (!a) return
    const approach = (cur: number, to: number, v: number) => {
      const d = to - cur
      const s = Math.sign(d) * Math.min(Math.abs(d), v * dt)
      return { v: cur + s, done: Math.abs(to - (cur + s)) < 0.02 }
    }
    if (a.k === 'gantry') {
      const key = axis === 'sts' ? 'x' : 'z'
      const r = approach(o[key]!, a.x, sp.gantry * this.windFactor)
      o[key] = r.v
      if (r.done) o.acts.shift()
    } else if (a.k === 'trolley') {
      const key = axis === 'sts' ? 'trolleyZ' : 'trolley'
      const r = approach(o[key]!, a.z, sp.trolley * this.windFactor)
      o[key] = r.v
      if (r.done) o.acts.shift()
    } else if (a.k === 'hoist') {
      const r = approach(o.spreaderY, a.y, sp.hoist * this.windFactor)
      o.spreaderY = r.v
      if (r.done) o.acts.shift()
    } else if (a.k === 'waitFor') {
      if (a.until()) o.acts.shift()
    } else {
      o.acts.shift()
      a.fn()
    }
  }

  // ───────────────────────── 자동화 야드 크레인(ARMG)

  private planArmg(arm: Armg, t: ArmgTask) {
    const blk = this.blocks[arm.block]
    // 해측 작업은 바다 쪽 칸, 육측 작업은 게이트 쪽 칸을 쓴다(이동 거리 단축)
    const sea = t.kind === 'seaIn' || t.kind === 'seaOut'
    const zone = blk.map((_, i) => i).filter((i) => (sea ? i >= 5 : i <= 4))
    const pickBay = () => {
      // 여정 컨테이너가 맨 위인 칸은 배로 다시 실어 보내지 않게 고르지 않는다
      const c = zone.map((i) => ({ i, n: blk[i].length })).filter((b) => b.n > 0 && !(t.kind === 'seaOut' && blk[b.i][b.n - 1] === this.focus)).sort((a, b) => b.n - a.n)
      return c[Math.floor(this.r() * Math.min(3, c.length))]?.i ?? zone[0]
    }
    const putBay = () => {
      const c = zone.map((i) => ({ i, n: blk[i].length })).filter((b) => b.n < BAY_CAP).sort((a, b) => a.n - b.n)
      return c[Math.floor(this.r() * Math.min(3, c.length))]?.i ?? zone[0]
    }
    const rowOf = (n: number) => PORT.blockRows[n % PORT.blockRows.length]
    const topY = (n: number) => Math.floor(n / PORT.blockRows.length) * 2.6 + 2.6 + 0.2
    const vehY = 1.15 + 2.6 + 0.2
    const store = (bay: number): Act[] => {
      const n = blk[bay].length
      return [
        { k: 'gantry', x: PORT.blockBays[bay] }, { k: 'trolley', z: rowOf(n) }, { k: 'hoist', y: topY(n) },
        { k: 'do', fn: () => { if (arm.box) blk[bay].push(arm.box); arm.box = null; this.dirty() } }, { k: 'hoist', y: 20 },
      ]
    }
    const fetch = (bay: number, kind: Box['kind']): Act[] => {
      const n = Math.max(0, blk[bay].length - 1)
      return [
        { k: 'gantry', x: PORT.blockBays[bay] }, { k: 'trolley', z: rowOf(n) }, { k: 'hoist', y: topY(n) },
        { k: 'do', fn: () => { arm.box = blk[bay].pop() ?? this.newBox(kind, PORT.blockKind[arm.block]); arm.box.kind = kind; this.dirty() } }, { k: 'hoist', y: 20 },
      ]
    }
    // 여정 컨테이너를 트레일러에 실을 때는 블록 어디에 있든 그 컨테이너를 꺼낸다(반출 순서 조정)
    const fetchFocus = (bay: number): Act[] => {
      const n = Math.max(0, blk[bay].indexOf(this.focus!))
      return [
        { k: 'gantry', x: PORT.blockBays[bay] }, { k: 'trolley', z: rowOf(n) }, { k: 'hoist', y: topY(n) },
        {
          k: 'do', fn: () => {
            const i = this.focus ? blk[bay].indexOf(this.focus) : -1
            arm.box = i >= 0 ? blk[bay].splice(i, 1)[0] : blk[bay].pop() ?? this.newBox('import', PORT.blockKind[arm.block])
            arm.box.kind = 'import'
            this.dirty()
          },
        },
        { k: 'hoist', y: 20 },
      ]
    }
    const focusBay = t.kind === 'landOut' && this.focus ? blk.findIndex((bay) => bay.includes(this.focus!)) : -1
    const endZ = t.kind === 'seaIn' || t.kind === 'seaOut' ? PORT.seaZ : PORT.landZ
    const toEnd: Act[] = [{ k: 'gantry', x: endZ }, { k: 'trolley', z: 0 }, { k: 'hoist', y: vehY }]
    if (t.kind === 'seaIn' || t.kind === 'landIn') {
      arm.acts = [
        ...toEnd,
        {
          k: 'do', fn: () => {
            if (t.kind === 'seaIn') {
              const agv = this.agvs[t.agv!]
              arm.box = agv.box
              agv.box = null
              agv.seaInPending = false
            } else {
              const slot = this.trailers.get(t.trailer!)
              arm.box = slot?.box ?? null
              if (slot) slot.box = null
            }
          },
        },
        { k: 'hoist', y: 20 },
        ...store(putBay()),
      ]
    } else {
      arm.acts = [
        ...(focusBay >= 0 ? fetchFocus(focusBay) : fetch(pickBay(), t.kind === 'seaOut' ? 'export' : 'import')),
        ...toEnd,
        {
          k: 'do', fn: () => {
            if (t.kind === 'seaOut') {
              const agv = this.agvs[t.agv!]
              agv.box = arm.box
              agv.seaOutPending = false
            } else {
              const slot = this.trailers.get(t.trailer!)
              if (slot && arm.box) {
                this.screen(arm.box)
                slot.box = arm.box
                slot.stage = 'done'
              }
            }
            arm.box = null
          },
        },
        { k: 'hoist', y: 20 },
      ]
    }
  }

  private stepArmgs(dt: number) {
    for (const arm of this.armgs) {
      if (!arm.acts.length) {
        // 트레일러(육측)는 먼저, 같은 트레일러의 반입→반출 순서를 지킨다
        const idx = arm.tasks.findIndex((t) => t.kind === 'landIn' || t.kind === 'landOut')
        const t = arm.tasks.splice(idx >= 0 ? idx : 0, 1)[0]
        if (t) this.planArmg(arm, t)
      }
      this.runActs(arm as unknown as { z: number; trolley: number; spreaderY: number; acts: Act[] }, dt, { gantry: 9, trolley: 4, hoist: 9 }, 'armg')
    }
  }

  // ───────────────────────── 외부 트레일러(육측 반출입)

  /** 트레일러가 블록 육측에 도착: 수출 컨테이너를 내리고 수입 컨테이너를 받는다 */
  requestLandside(id: string, block: number, exportBox: Box | null) {
    this.trailers.set(id, { block, stage: 'waiting', box: exportBox, takeExport: !!exportBox })
    const arm = this.armgs[block * 2 + 1]
    if (exportBox) arm.tasks.push({ kind: 'landIn', trailer: id })
    arm.tasks.push({ kind: 'landOut', trailer: id })
  }

  trailerBox(id: string) {
    return this.trailers.get(id)?.box ?? null
  }

  trailerDone(id: string) {
    return this.trailers.get(id)?.stage === 'done'
  }

  release(id: string) {
    const s = this.trailers.get(id)
    this.trailers.delete(id)
    return s?.box ?? null
  }

  /** 장치장 블록별 점유율(0~1) */
  occupancy() {
    return this.blocks.map((blk) => blk.reduce((n, bay) => n + bay.length, 0) / (blk.length * BAY_CAP))
  }

  /** 크레인이 새 작업을 받나: 작업 중이고 작업량이 남았거나, 따라가는 수입 컨테이너가 아직 배에 있으면 */
  get acceptingWork() {
    const B = this.berth
    if (B.phase !== 'working') return false
    return B.moves < B.target || (!!this.focus && this.ship.some((bay) => bay.includes(this.focus!)))
  }

  /** 선석: 작업량을 채우면(따라가는 수입 컨테이너가 배에 남아 있으면 기다림) 출항 → 잠시 비움 → 다음 배 입항 */
  private stepBerth(dt: number) {
    const B = this.berth
    const clock = this.clock()
    const go = (phase: BerthPhase) => {
      const last = B.history[B.history.length - 1]
      if (last && last.end === null) last.end = clock
      B.phase = phase
      B.t = 0
      B.history.push({ phase, vessel: B.vessel, start: clock, end: null })
      while (B.history.length > 12) B.history.shift()
    }
    if (!B.history.length) B.history.push({ phase: B.phase, vessel: B.vessel, start: clock - 1800, end: null })
    B.t += dt
    if (B.phase === 'working') {
      const focusAboard = !!this.focus && this.ship.some((bay) => bay.includes(this.focus!))
      const cranesIdle = this.sts.every((x) => !x.box && !x.acts.length && x.agv === null)
      if (B.moves >= B.target && !focusAboard && cranesIdle) go('departing')
    } else if (B.phase === 'departing') {
      B.offset = Math.min(BERTH_OUT, B.offset + dt * BERTH_SPEED)
      if (B.offset >= BERTH_OUT) go('away')
    } else if (B.phase === 'away') {
      if (B.t > 12 + B.extraAway) {
        // 다음 배: 수입 컨테이너를 싣고 들어온다(앞쪽 칸 양하, 뒤쪽 칸은 적하 공간). 기항 취소면 그다음 배
        B.vessel = (B.vessel + (B.skip ? 2 : 1)) % VESSELS.length
        B.extraAway = 0
        B.skip = false
        // 해상 여정이 따라가는 컨테이너가 (배가 바뀌는 사이에 골라져) 배에 있으면 새 배의 맨 위로 옮겨 실어 끊기지 않게 한다
        const keep = this.focus && this.ship.some((bay) => bay.includes(this.focus!)) ? this.focus : null
        this.ship.forEach((bay, i) => {
          bay.length = 0
          const n = i < 6 ? 14 + Math.floor(this.vr() * 10) : 6 + Math.floor(this.vr() * 8)
          for (let k = 0; k < n; k++) bay.push(this.newBox('import'))
        })
        if (keep) this.ship[2].push(keep)
        B.moves = 0
        B.target = 96 + Math.floor(this.vr() * 30)
        this.dirty()
        go('arriving')
      }
    } else if (B.phase === 'arriving') {
      B.offset = Math.max(0, B.offset - dt * BERTH_SPEED)
      if (B.offset <= 0) {
        B.since = clock
        go('working')
      }
    }
  }

  step(dt: number) {
    this.stepBerth(dt)
    this.stepAgvs(dt)
    this.sts.forEach((s) => this.runActs(s as unknown as { x: number; trolleyZ: number; spreaderY: number; acts: Act[] }, dt, { gantry: 3.5, trolley: 5.5, hoist: 9 }, 'sts'))
    this.stepArmgs(dt)
  }

  /** 지금 손에 들고 있는 컨테이너 위치(라벨용) */
  agvPos(i: number): V2 {
    const a = this.agvs[i]
    return v2(a.x, a.z)
  }
}
