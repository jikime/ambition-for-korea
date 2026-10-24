// 배·비행기로 가는 여정. 육로 택배 여정(Sim.story)과 같은 방식으로 단계·시각을 기록하고,
// 실제 시뮬레이션 안의 컨테이너·트럭·ULD·화물기를 그대로 따라간다(새로 꾸며 낸 움직임이 없다).
//  - 해상(수입): 컨테이너선 → 안벽 크레인 → 적하목록 심사 → AGV·장치장 → 트레일러 → 간선 → 곤지암 CY 적출
//  - 항공(수출): 곤지암 항공 도크 → 간선 → 화물터미널 → 위험물 사전 검사 → ULD → 화물기 탑재 → 푸시백 → 이륙
import type { Sim, Vehicle } from './sim'
import type { SiteId } from './world'
import { PORT, type Box } from './port'
import { AP, AP_DOCK_Z, type Aircraft, type AirShipment, type Uld } from './airport'
import { mulberry32 } from './data'
import { L, LL } from '../i18n'

export interface JourneyStep {
  label: string
  sub: string
  /** 이 단계에서 실제로 일어나는 일 */
  desc: string
}

export interface JourneyPos {
  x: number
  y: number
  z: number
  label: string
  site: SiteId
}

export type JourneyMode = 'sea' | 'air'

/** 진행 상태: 진행 중 · 완료 · 탑재 보류(항공 위험물) */
export type JourneyStatus = 'running' | 'done' | 'held'

export const SEA_STEPS: JourneyStep[] = [
  { label: L('선박 입항', 'Vessel arrival'), sub: L('다온오션호 · 부산신항', 'DAON OCEAN · Busan New Port'), desc: L('중국 상하이항에서 해외 직구 상품을 실은 컨테이너가 컨테이너선에 실려 부산신항 안벽에 접안했습니다. 입항 전에 적하목록(무엇이 들었는지 신고한 목록)이 미리 제출됩니다.', 'A container ship carrying overseas e-commerce goods from the port of Shanghai, China, has berthed at the Busan New Port quay. The manifest (the declared list of what is inside) is filed before arrival.') },
  { label: L('안벽 크레인 양하', 'Quay crane discharge'), sub: L('STS 크레인', 'STS crane'), desc: L('안벽 크레인(STS)이 배 위 컨테이너를 들어 올려 부두에 대기한 무인 운반차(AGV)에 내려놓습니다. 같은 크레인이 내리는 길에 수출 컨테이너도 함께 싣습니다(듀얼 사이클링).', 'The quay crane (STS) lifts a container off the ship and sets it on an automated guided vehicle (AGV) waiting on the quay. On the way back, the same crane also loads export containers (dual cycling).') },
  { label: L('적하목록 심사', 'Manifest review'), sub: L('AI · 세관', 'AI · Customs'), desc: L('AGV 위에서 적하목록의 신고 품명과 상세 설명을 대조합니다. 위험물이면 격리 블록, 냉동·냉장이면 전원이 있는 블록, 신고와 내용이 다르면 X-ray 검사 대상으로 표시합니다. AI를 끄면 일반 블록으로 보냅니다.', 'On the AGV, the declared item name in the manifest is checked against the detailed description. Dangerous goods go to the segregation block, frozen or chilled cargo to a block with power, and a container whose contents differ from its declaration is flagged for X-ray inspection. With AI off, it goes to a general block.') },
  { label: L('AGV 이송 · 장치', 'AGV transfer · Stacking'), sub: L('무인 운반차 → 야드', 'AGV → Yard'), desc: L('AGV가 정해진 장치장 블록의 바다 쪽 끝까지 운반하고, 해측 자동화 야드 크레인(ARMG)이 받아 블록에 쌓습니다.', 'The AGV carries the container to the sea-side end of its assigned yard block, where the sea-side automated yard crane (ARMG) takes it and stacks it in the block.') },
  { label: L('장치 · 반출 대기', 'Stacked · Awaiting release'), sub: L('수입 신고 수리', 'Import declaration accepted'), desc: L('세관 수입 신고가 수리되면 반출할 수 있습니다. 운송사가 트레일러를 배차하고, 블록 육측(게이트 쪽)으로 들어올 시각을 예약합니다.', 'Once customs accepts the import declaration, the container can leave. The carrier dispatches a trailer and books a time to come to the land side (gate side) of the block.') },
  { label: L('트레일러 상차', 'Trailer loading'), sub: L('육측 ARMG · 게이트', 'Land-side ARMG · Gate'), desc: L('육측 야드 크레인이 블록에서 컨테이너를 꺼내 트레일러 섀시에 올립니다. 신고 불일치로 표시된 컨테이너는 나가는 길에 세관 X-ray 검색대를 거칩니다.', 'The land-side yard crane takes the container out of the block and sets it on the trailer chassis. Containers flagged for a declaration mismatch pass through the customs X-ray on the way out.') },
  { label: L('간선 운송', 'Linehaul'), sub: L('부산신항 → 곤지암', 'Busan New Port → Gonjiam'), desc: L('트랙터가 컨테이너를 끌고 게이트를 나와 고속도로 간선으로 곤지암 메가허브 컨테이너 야드(CY)까지 갑니다.', 'The tractor pulls the container out of the gate and takes the highway linehaul to the container yard (CY) at Gonjiam Mega Hub.') },
  { label: L('CY 하역 · 적출', 'CY unloading · Devanning'), sub: L('곤지암 허브', 'Gonjiam Hub'), desc: L('곤지암 CY에서 컨테이너를 내리고 문을 열어 상자를 꺼냅니다(적출). 꺼낸 상자는 허브 분류동에 투입되어, 육로 택배 여정처럼 서브터미널과 1톤 배송차를 거쳐 고객 문 앞에 도착합니다.', 'At the Gonjiam CY the container is unloaded and opened, and the boxes are taken out (devanning). They go into the hub sorting building and, like the road parcel journey, pass through the sub-terminal and a 1-ton delivery van to the customer\'s doorstep.') },
]

export const AIR_STEPS: JourneyStep[] = [
  { label: L('항공 출고 상차', 'Air outbound loading'), sub: L('곤지암 항공 우선 도크', 'Gonjiam air priority dock'), desc: L('해외 고객이 주문한 상자를 곤지암 메가허브 항공 우선 출고 도크에서 항공 화물 트럭(다온항공 카고)에 싣습니다.', 'Boxes ordered by overseas customers are loaded onto an air cargo truck (Daon Air Cargo) at the air priority outbound dock of Gonjiam Mega Hub.') },
  { label: L('간선 운송', 'Linehaul'), sub: L('곤지암 → 인천공항', 'Gonjiam → Incheon Airport'), desc: L('트럭이 고속도로 간선으로 인천공항 화물터미널 육측 도크까지 갑니다.', 'The truck takes the highway linehaul to the land-side dock of the Incheon Airport Cargo Terminal.') },
  { label: L('화물터미널 반입', 'Cargo terminal intake'), sub: L('육측 도크 하차', 'Land-side dock unloading'), desc: L('화물터미널 도크에 화물을 내리고, 항공 화물 운송장 번호(AWB)를 붙여 수출 신고를 올립니다.', 'The cargo is unloaded at the cargo terminal dock, given an air waybill (AWB) number and filed for export declaration.') },
  { label: L('위험물 사전 검사', 'Dangerous goods pre-screening'), sub: L('AI · 보안검색', 'AI · Security screening'), desc: L('신고 품명과 상세 설명을 대조해 신고하지 않은 위험물(리튬 배터리·스프레이 등)과 냉장 화물을 가려냅니다. 위험물이 의심되면 항공 탑재를 보류하고 해상 운송으로 돌립니다. AI를 끄면 보안검색대에서 사람이 확인합니다.', 'The declared item name is checked against the detailed description to catch undeclared dangerous goods (lithium batteries, sprays, etc.) and chilled cargo. If dangerous goods are suspected, air loading is held and the cargo is switched to sea freight. With AI off, staff check it at security screening.') },
  { label: L('ULD 빌드업', 'ULD build-up'), sub: L('항공 탑재 단위', 'Air loading unit'), desc: L('검사를 마친 화물을 항공기에 싣는 단위(ULD) 팔레트에 쌓고 망을 씌워 고정한 뒤, 돌리에 올려 견인차 열차로 주기장까지 끌고 갑니다.', 'Screened cargo is stacked on a ULD pallet (the unit loaded onto aircraft), netted and secured, then put on a dolly and towed to the stand by the tug train.') },
  { label: L('화물기 탑재', 'Freighter loading'), sub: L('메인덱 로더', 'Main deck loader'), desc: L('메인덱 로더가 ULD를 화물문 높이까지 들어 올려 기내로 밀어 넣습니다. 모두 실으면 화물문을 닫고 출발을 준비합니다.', 'The main deck loader lifts the ULD to cargo door height and pushes it into the aircraft. When everything is loaded, the cargo door closes and the aircraft prepares to depart.') },
  { label: L('푸시백 · 지상 이동', 'Pushback · Taxi'), sub: L('유도로 → 활주로', 'Taxiway → Runway'), desc: L('견인차가 기체를 뒤로 밀어낸 뒤(푸시백) 화물기가 유도로를 따라 활주로 대기점까지 가고, 관제탑 허가를 받아 활주로에 들어섭니다.', 'A tug pushes the aircraft back (pushback), then the freighter taxis along the taxiway to the runway holding point and enters the runway with tower clearance.') },
  { label: L('이륙 · 해외 운송', 'Takeoff · Overseas transport'), sub: L('화물기 출발', 'Freighter departure'), desc: L('활주로를 달려 이륙합니다. 도착 공항에서 통관을 마치면 현지 택배사가 고객에게 배달합니다.', 'It rolls down the runway and takes off. After customs clearance at the destination airport, a local courier delivers to the customer.') },
]

const R = mulberry32(4242)
const pick = <T,>(a: readonly T[]) => a[Math.floor(R() * a.length)]

/** 한 여정이 이 시간(시뮬레이션 초) 넘게 한 단계에 머물면 새로 시작한다(드문 예외 상황 대비) */
const STUCK = 900

// ───────────────────────── 해상(수입)

export class SeaJourney {
  n = 0
  no = ''
  stage = 0
  times: number[] = []
  status: JourneyStatus = 'running'
  box: Box | null = null
  /** 컨테이너를 실은 트레일러 */
  truck: string | null = null
  /** 적하목록 판정(장치 블록 결정) */
  decision = ''
  /** 끝난 뒤 다음 여정까지, 또는 한 단계에 머문 시간 */
  timer = 0
  private stay = 0
  private last: JourneyPos = { x: PORT.bays[3], y: 6, z: PORT.rowsZ[4], label: '', site: 'BS' }

  constructor(private sim: Sim) {}

  get steps() {
    return SEA_STEPS
  }

  start() {
    const p = this.sim.port
    // 안벽 크레인 근처 칸 중 가장 많이 쌓인 칸의 맨 위 컨테이너(곧 내릴 컨테이너)
    const near = new Set<number>()
    p.sts.forEach((s) => PORT.bays.forEach((x, i) => { if (Math.abs(x - s.home) < 26) near.add(i) }))
    const bay = [...near].filter((i) => p.ship[i].length > 0).sort((a, b) => p.ship[b].length - p.ship[a].length)[0]
    const box = bay !== undefined ? p.ship[bay][p.ship[bay].length - 1] : null
    if (!box) return
    p.screen(box)
    this.n++
    this.no = box.id
    this.box = box
    p.focus = box
    this.stage = 0
    this.times = [this.sim.clock, 0, 0, 0, 0, 0, 0, 0]
    this.status = 'running'
    this.truck = null
    this.decision = ''
    this.timer = 0
    this.stay = 0
  }

  private to(stage: number) {
    if (stage <= this.stage) return
    for (let i = this.stage + 1; i <= stage; i++) this.times[i] = this.sim.clock
    this.stage = stage
    this.stay = 0
  }

  /** 컨테이너가 지금 어디 있는지 찾아 단계를 정한다 */
  step(dt: number) {
    if (!this.box) {
      this.start()
      return
    }
    if (this.status !== 'running') {
      this.timer -= dt
      if (this.timer <= 0) this.start()
      return
    }
    this.stay += dt
    if (this.stay > STUCK) {
      this.start()
      return
    }
    const p = this.sim.port
    const b = this.box
    // 같은 컨테이너가 배로 되돌아가 다시 내려지기도 하므로, 심사가 끝난 뒤의 최신 기록만 본다
    if (this.stage >= 3 && !this.decision) this.decision = p.log.find((l) => l.id === b.id)?.decision ?? ''
    const truck = this.sim.vehicles.find((v) => v.box === b)
    if (truck) this.truck = truck.id
    if (p.ship.some((bay) => bay.includes(b))) return
    if (p.sts.some((s) => s.box === b)) return this.to(1)
    const agv = p.agvs.find((a) => a.box === b)
    if (agv) return this.to(agv.state === 'review' ? 2 : 3)
    const arm = p.armgs.find((a) => a.box === b)
    if (arm) return this.to(arm.side === 'sea' ? 3 : 5)
    if (p.blocks.some((blk) => blk.some((bay) => bay.includes(b)))) return this.to(4)
    if ([...p.trailers.values()].some((t) => t.box === b)) return this.to(5)
    if (truck) {
      if (truck.site === 'GJ' && (truck.phase === 'unloading' || truck.phase === 'inbound')) return this.to(7)
      if (truck.dest === 'GJ' && truck.phase !== 'craning' && truck.phase !== 'inspecting') return this.to(6)
      return this.to(5)
    }
    // 어디에도 없으면: 곤지암 CY에서 내려 적출을 마쳤다(트레일러가 수출 컨테이너로 바꿔 실었다)
    if (this.stage >= 6) {
      this.to(7)
      this.status = 'done'
      this.timer = 14
      if (p.focus === b) p.focus = null
    } else this.start()
  }

  pos(): JourneyPos {
    const p = this.sim.port
    const b = this.box
    const set = (x: number, y: number, z: number, label: string, site: SiteId = 'BS') => (this.last = { x, y, z, label, site })
    if (!b) return this.last
    for (let i = 0; i < p.ship.length; i++) {
      const k = p.ship[i].indexOf(b)
      if (k >= 0) return set(PORT.bays[i], PORT.deckY + Math.floor(k / PORT.rowsZ.length) * 2.6 + 1.3, PORT.rowsZ[k % PORT.rowsZ.length], L(`컨테이너선 ${i + 1}번 칸 · 양하 대기`, `Container ship bay ${i + 1} · awaiting discharge`))
    }
    const s = p.sts.findIndex((x) => x.box === b)
    if (s >= 0) return set(p.sts[s].x, p.sts[s].spreaderY, p.sts[s].trolleyZ, L(`안벽 크레인 ${s + 1} 양하 중`, `Quay crane ${s + 1} discharging`))
    const a = p.agvs.find((x) => x.box === b)
    if (a) return set(a.x, 3, a.z, a.state === 'review' ? L(`${a.id} 위 · 적하목록 심사 중`, `On ${a.id} · manifest review`) : L(`${a.id} → ${'ABCD'[a.block]} 블록`, `${a.id} → block ${'ABCD'[a.block]}`))
    const arm = p.armgs.find((x) => x.box === b)
    if (arm) return set(PORT.blocks[arm.block], arm.spreaderY, arm.z, arm.side === 'sea' ? L(`${'ABCD'[arm.block]} 블록 해측 크레인 반입`, `Block ${'ABCD'[arm.block]} sea-side crane intake`) : L(`${'ABCD'[arm.block]} 블록 육측 크레인 반출`, `Block ${'ABCD'[arm.block]} land-side crane release`))
    for (let bi = 0; bi < p.blocks.length; bi++) {
      for (let bay = 0; bay < p.blocks[bi].length; bay++) {
        const k = p.blocks[bi][bay].indexOf(b)
        if (k >= 0) return set(PORT.blocks[bi] + PORT.blockRows[k % PORT.blockRows.length], Math.floor(k / PORT.blockRows.length) * 2.6 + 1.3, PORT.blockBays[bay], L(`${'ABCD'[bi]} 블록 장치 · 트레일러 배차 대기`, `Stacked in block ${'ABCD'[bi]} · awaiting trailer`))
      }
    }
    const v = this.sim.vehicles.find((x) => x.box === b) ?? (this.truck ? this.sim.vehicle(this.truck) : undefined)
    if (v) {
      const q = this.sim.locate('vehicle', v.id)
      if (q) {
        const label = v.phase === 'craning' ? L(`${v.id} 트레일러 상차`, `${v.id} trailer loading`) : v.phase === 'inspecting' ? L(`${v.id} 세관 X-ray 검사`, `${v.id} customs X-ray`) : v.site === 'GJ' ? L(`${v.id} 곤지암 CY 하역`, `${v.id} unloading at Gonjiam CY`) : L(`${v.id} 간선 운송`, `${v.id} linehaul`)
        return set(q.x, q.y, q.z, label, v.site === 'GJ' ? 'GJ' : 'BS')
      }
    }
    if (this.status === 'done') return set(this.last.x, this.last.y, this.last.z, L('곤지암 CY 적출 · 허브 분류 투입', 'Devanned at Gonjiam CY · into hub sorting'), 'GJ')
    return this.last
  }
}

// ───────────────────────── 항공(수출)

const AIR_ITEMS = LL(['K-뷰티 화장품 세트', '한방 홍삼 선물 세트', '아이돌 앨범·굿즈', '김·과자 간식 꾸러미', '아웃도어 의류'], ['K-beauty cosmetics set', 'Red ginseng gift set', 'K-pop albums & merch', 'Laver & snack bundle', 'Outdoor apparel'])
const AIR_DEST = LL(['미국 LA', '일본 도쿄', '독일 프랑크푸르트', '베트남 호찌민', '호주 시드니'], ['Los Angeles, USA', 'Tokyo, Japan', 'Frankfurt, Germany', 'Ho Chi Minh City, Vietnam', 'Sydney, Australia'])

export class AirJourney {
  n = 0
  no = ''
  stage = 0
  times: number[] = []
  status: JourneyStatus = 'running'
  item = ''
  dest = ''
  truck: string | null = null
  shipment: AirShipment | null = null
  decision = ''
  uld: Uld | null = null
  stand = -1
  ac: Aircraft | null = null
  timer = 0
  private dock = 0
  private stay = 0
  private last: JourneyPos = { x: 11.5, y: 3, z: -6, label: '', site: 'GJ' }

  constructor(private sim: Sim) {}

  get steps() {
    return AIR_STEPS
  }

  start() {
    // 곤지암에 있는(또는 곤지암으로 오는) 항공 화물 트럭을 고른다
    const ats = this.sim.vehicles.filter((v) => v.home === 'AP')
    const atGj = ats.filter((v) => v.site === 'GJ' && v.dest !== 'AP')
    const coming = ats.filter((v) => v.dest === 'GJ')
    const t = atGj[0] ?? coming[0]
    if (!t) return
    this.n++
    // 운송장(AWB) 번호는 화물터미널에 반입할 때 붙는다
    this.no = ''
    this.item = pick(AIR_ITEMS)
    this.dest = pick(AIR_DEST)
    this.truck = t.id
    this.shipment = null
    this.decision = ''
    this.uld = null
    this.stand = -1
    this.ac = null
    this.stage = 0
    this.times = [this.sim.clock, 0, 0, 0, 0, 0, 0, 0]
    this.status = 'running'
    this.timer = 0
    this.stay = 0
    this.sim.airport.onExportUld = null
  }

  private to(stage: number) {
    if (stage <= this.stage) return
    for (let i = this.stage + 1; i <= stage; i++) this.times[i] = this.sim.clock
    this.stage = stage
    this.stay = 0
  }

  /** 트럭이 화물터미널에 수출 화물을 내렸다(Sim.planAir에서 부른다) */
  unloaded(v: Vehicle, made: AirShipment[]) {
    if (this.status !== 'running' || v.id !== this.truck || this.shipment || !made.length) return
    this.shipment = made[0]
    this.no = made[0].awb
    this.dock = v.res
    this.to(3)
  }

  step(dt: number) {
    if (!this.truck) {
      this.start()
      return
    }
    if (this.status !== 'running') {
      this.timer -= dt
      if (this.timer <= 0) this.start()
      return
    }
    this.stay += dt
    if (this.stay > STUCK) {
      this.start()
      return
    }
    const ap = this.sim.airport
    if (this.stage <= 2) {
      const t = this.sim.vehicle(this.truck)
      if (!t) return this.start()
      // 곤지암에서 싣고 공항으로 떠나면 간선, 공항 게이트를 지나면 반입(곤지암으로 오던 트럭은 먼저 곤지암을 거친다)
      if (this.stage === 0 && t.dest === 'AP' && t.phase !== 'loading' && t.phase !== 'closing' && t.phase !== 'unloading') this.to(1)
      else if (this.stage === 1 && t.site === 'AP') this.to(2)
      return
    }
    if (this.stage === 3) {
      const sh = this.shipment!
      // 판독 훅이 없으면(헤드리스 점검) 기다리지 않고 기본 규칙으로 넘어간다
      if (sh.status === 'pending' && ap.onScreen) return
      const log = ap.log.find((l) => l.awb === sh.awb)
      this.decision = log?.decision ?? L('기본 규칙 → 보안검색대 수작업 확인', 'Default rule → manual check at security screening')
      if (sh.flags && sh.flags.dangerous > 0.5) {
        this.status = 'held'
        this.timer = 16
        return
      }
      this.to(4)
      ap.onExportUld = (u, k) => {
        if (this.uld || this.stage !== 4) return
        this.uld = u
        this.stand = k
        this.ac = ap.aircraft[ap.stands[k].ac] ?? null
        ap.onExportUld = null
      }
      return
    }
    if (this.stage === 4) {
      const u = this.uld
      if (u && (!u.vis || !ap.stands[this.stand].dolly.includes(u))) this.to(5)
      return
    }
    const a = this.ac
    if (!a) return this.start()
    if (this.stage === 5 && (a.phase === 'pushback' || a.phase === 'taxiOut' || a.phase === 'hold' || a.phase === 'lineup')) this.to(6)
    if (this.stage <= 6 && (a.phase === 'takeoff' || a.phase === 'climb')) this.to(7)
    if (this.stage === 7 && a.phase === 'away') {
      this.status = 'done'
      this.timer = 14
    }
  }

  pos(): JourneyPos {
    const set = (x: number, y: number, z: number, label: string, site: SiteId = 'AP') => (this.last = { x, y, z, label, site })
    if (this.stage <= 2) {
      const t = this.truck ? this.sim.vehicle(this.truck) : undefined
      const q = t ? this.sim.locate('vehicle', t.id) : null
      if (t && q) {
        const label = this.stage === 0 ? (t.site === 'GJ' ? L(`${t.id} 곤지암 항공 도크 상차`, `${t.id} loading at Gonjiam air dock`) : L(`${t.id} 곤지암으로 이동 · 상차 대기`, `${t.id} heading to Gonjiam · awaiting loading`)) : this.stage === 1 ? L(`${t.id} 간선 운송 → 인천공항`, `${t.id} linehaul → Incheon Airport`) : L(`${t.id} 화물터미널 도크 하차`, `${t.id} unloading at cargo terminal dock`)
        return set(q.x, q.y, q.z, label, t.site === 'AP' ? 'AP' : t.site === 'GJ' ? 'GJ' : this.stage === 0 ? 'GJ' : 'AP')
      }
      return this.last
    }
    const dockX = AP.docks[this.dock] ?? AP.docks[0]
    if (this.stage === 3) return set(dockX, 2, AP_DOCK_Z - 8, this.shipment?.status === 'pending' ? L('화물터미널 · 위험물 사전 검사 중', 'Cargo terminal · DG pre-screening') : L('화물터미널 · 검사 완료', 'Cargo terminal · screening done'))
    const u = this.uld
    if (this.stage === 4) {
      if (u && u.vis) return set(u.x, u.y, u.z, `${L('ULD 돌리 열차', 'ULD dolly train')} → ${this.ac?.flight ?? L('화물기', 'freighter')}`)
      return set(dockX, 2, AP_DOCK_Z - 8, L('ULD 빌드업 · 다음 화물기 대기', 'ULD build-up · awaiting next freighter'))
    }
    const a = this.ac
    if (!a) return this.last
    if (this.stage === 5 && u && u.vis) return set(u.x, u.y, u.z, L(`${a.flight} 메인덱 로더 탑재 중`, `${a.flight} main deck loader loading`))
    const label = this.stage === 5 ? L(`${a.flight} 기내 탑재 · 출발 준비`, `${a.flight} loaded · preparing departure`) : this.stage === 6 ? `${a.flight} ${a.phase === 'pushback' ? L('푸시백', 'pushback') : a.phase === 'hold' ? L('활주로 대기', 'holding for runway') : L('유도로 이동', 'taxiing')}` : this.status === 'done' ? L(`${a.flight} 이륙 · ${this.dest}행`, `${a.flight} took off · to ${this.dest}`) : L(`${a.flight} 이륙 중`, `${a.flight} taking off`)
    return set(a.x, a.y + 6, a.z, label)
  }
}
