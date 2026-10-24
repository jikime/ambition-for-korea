// 거리의 삶: 주민·작업자·조업원이 걷고, 오토바이·배송 로봇·드론·우체국 집배원이 오가며 물건을 나른다.
// 실제 생활에서 보는 배송 방법을 한 장면에 담는다. 모두 정해진 경로를 돌며 잠깐씩 멈춘다.
import { mulberry32 } from './data'
import { TW } from './sites'
import { GATES } from './world'
import { AP } from './airport'
import { MAIN } from './layout'
import { L } from '../i18n'

type P = [number, number]

export interface Mover {
  id: string
  kind: 'person' | 'moto' | 'robot' | 'drone'
  role: string
  pts: P[]
  /** 웨이포인트에서 멈추는 시간(초) */
  stops: Record<number, number>
  speed: number
  loop: boolean
  i: number
  t: number
  pause: number
  x: number
  y: number
  z: number
  heading: number
  moving: boolean
  walkPhase: number
  look: { top: string; bottom: string; hair: string; helmet?: string; vest?: boolean; kid?: boolean; /** 들고 가는 것: 유모차 · 강아지 · 장바구니 카트 */ acc?: 'stroller' | 'dog' | 'cart' }
  carry: 'none' | 'box' | 'bag'
  /** 웨이포인트에 도착했을 때 들고 있는 것을 바꾼다 */
  carryAt: Record<number, 'none' | 'box' | 'bag'>
  /** 드론: 웨이포인트별 고도 */
  alt?: number[]
  /** 드론이 물건을 내리는 중(줄 길이) */
  winch: number
  label: string
  /** 충돌 회피가 정한 속도 상한 */
  cap: number
  /** 교착에서 빼 주는 중(서 있는 몸체를 무시하고 천천히 지나간다): 남은 시간 */
  ghostT: number
  /** 다른 모듈(대전 창고 등)이 직접 움직이는 사람: 경로를 돌지 않는다 */
  scripted?: boolean
}

const TOPS = ['#2F55E6', '#E45B4B', '#F2B92B', '#3E9A5A', '#7A4CC2', '#F4F6FA', '#2D3445', '#E88A3A', '#5FAFAA', '#C9472B']
const BOTTOMS = ['#2D3445', '#3B4458', '#5B6478', '#1F2633', '#7B828D']
const HAIRS = ['#1A1A1A', '#2B211B', '#3A2A20', '#5A4632', '#D9D9D9']

const SIDE_W = TW.road.x - 4.6
const SIDE_E = TW.road.x + 4.6
const APT_N = TW.apt.roadZ - 4.2
const APT_S = TW.apt.roadZ + 4.2
const STORE_DOOR: P = [TW.store.x - 5.4, TW.store.z]

export class LifeSim {
  movers: Mover[] = []
  /** 오늘 생활 배송 집계(화면 표시용) */
  stats = { robot: 0, drone: 0, moto: 0, post: 0, pickup: 0 }
  private r = mulberry32(2026)

  constructor() {
    const r = this.r
    const look = (o: Partial<Mover['look']> = {}): Mover['look'] => ({
      top: TOPS[Math.floor(r() * TOPS.length)],
      bottom: BOTTOMS[Math.floor(r() * BOTTOMS.length)],
      hair: HAIRS[Math.floor(r() * HAIRS.length)],
      ...o,
    })
    const add = (m: Partial<Mover> & { id: string; kind: Mover['kind']; role: string; pts: P[]; speed: number }) => {
      const mv: Mover = {
        stops: {}, loop: true, i: 0, t: 0, pause: 0, x: m.pts[0][0], y: 0, z: m.pts[0][1], heading: 0, moving: true, walkPhase: r() * 6,
        look: look(), carry: 'none', carryAt: {}, winch: 0, label: '', cap: Infinity, ghostT: 0, ...m,
      }
      // 시작 위치를 경로 위 아무 곳으로 흩어 놓는다
      mv.i = Math.floor(r() * (mv.pts.length - 1))
      mv.t = r()
      this.movers.push(mv)
      return mv
    }

    // ── 다온마을 주민
    const a101: P = [-440, TW.northZ + 6.3]
    const a104: P = [-440, TW.southZ - 6.3]
    const locker: P = [TW.locker.x, TW.locker.z - 1.6]
    add({ id: 'p-locker', kind: 'person', role: L('주민 · 택배함에서 찾기', 'Resident · locker pickup'), speed: 1.3, pts: [a101, [-440, APT_N], [-416, APT_N], locker, [-416, APT_N], [-440, APT_N]], stops: { 3: 5, 0: 8 }, carryAt: { 3: 'box', 0: 'none' }, label: L('무인택배함 수령', 'Parcel locker pickup') })
    add({ id: 'p-store', kind: 'person', role: L('주민 · 편의점 택배 찾기', 'Resident · store pickup'), speed: 1.25, pts: [a104, [-440, APT_S], [-404, APT_S], [SIDE_W, APT_S], [SIDE_W, 80], [SIDE_E, 80], STORE_DOOR, [SIDE_E, 72], [SIDE_W, 72], [SIDE_W, APT_S], [-404, APT_S], [-440, APT_S]], stops: { 6: 7, 0: 9 }, carryAt: { 6: 'bag', 0: 'none' }, label: L('편의점 픽업', 'Store pickup') })
    add({ id: 'p-jog', kind: 'person', role: L('주민 · 산책', 'Resident · walk'), speed: 1.6, pts: [[SIDE_E, 62], [SIDE_E, 255], [SIDE_W, 255], [SIDE_W, 62]] })
    add({ id: 'p-walk2', kind: 'person', role: L('주민 · 산책', 'Resident · walk'), speed: 1.1, pts: [[SIDE_W, 240], [SIDE_W, 66], [SIDE_E, 66], [SIDE_E, 240]] })
    add({ id: 'p-walk3', kind: 'person', role: L('주민 · 장보기', 'Resident · shopping'), speed: 1.15, pts: [[-470, APT_N], [-540, APT_N], [-540, APT_S], [-404, APT_S], [-404, APT_N]], carryAt: { 2: 'bag' } })
    add({ id: 'p-walk4', kind: 'person', role: L('주민 · 산책', 'Resident · walk'), speed: 1.0, pts: [[-548, 84], [-410, 84], [-410, 120], [-548, 120]] })
    add({ id: 'p-walk5', kind: 'person', role: L('주민 · 귀가', 'Resident · heading home'), speed: 1.2, pts: [[-548, 222], [-410, 222], [-410, 196], [-548, 196]] })
    // 놀이터: 보호자와 아이들
    add({ id: 'p-parent', kind: 'person', role: L('보호자', 'Parent'), speed: 0.7, pts: [[-476, 183], [-464, 183], [-464, 191], [-476, 191]], stops: { 1: 6, 3: 6 } })
    for (let k = 0; k < 3; k++) add({ id: `p-kid${k}`, kind: 'person', role: L('어린이', 'Child'), speed: 2.1, pts: [[-478 + k, 181], [-462, 184 + k], [-466, 193], [-478, 190 - k]], stops: { 2: 1 + k }, look: look({ kid: true }) })
    // 생활 장면(차도는 건너지 않는 길만): 유모차, 강아지 산책, 장바구니 카트, 학원 가는 학생, 분리수거, 편의점에 택배 맡기기
    const front = 67.6
    add({ id: 'p-stroller1', kind: 'person', role: L('주민 · 유모차 산책', 'Resident · stroller walk'), speed: 0.75, pts: [[-480, 181.5], [-462, 181.5], [-462, 192.5], [-480, 192.5]], stops: { 1: 8 }, look: look({ acc: 'stroller' }) })
    add({ id: 'p-stroller2', kind: 'person', role: L('주민 · 유모차 산책', 'Resident · stroller walk'), speed: 0.8, pts: [[-548, front], [-426, front]], stops: { 0: 6, 1: 10 }, loop: true, look: look({ acc: 'stroller' }) })
    add({ id: 'p-dog1', kind: 'person', role: L('주민 · 강아지 산책', 'Resident · dog walk'), speed: 0.95, pts: [[SIDE_W, 92], [SIDE_W, 140], [SIDE_W, 92]], stops: { 1: 4 }, look: look({ acc: 'dog' }) })
    add({ id: 'p-dog2', kind: 'person', role: L('주민 · 강아지 산책', 'Resident · dog walk'), speed: 1.0, pts: [[-550, 86.5], [-410, 86.5]], stops: { 0: 5, 1: 5 }, look: look({ acc: 'dog' }) })
    add({ id: 'p-cart', kind: 'person', role: L('주민 · 장보고 귀가', 'Resident · home from shopping'), speed: 0.7, pts: [[-488, front], [-404, front], [-404, 139], [-440, 139], [-404, 139], [-404, front]], stops: { 0: 12, 3: 10 }, look: look({ acc: 'cart', hair: '#D9D9D9' }), label: L('다온마트 → 101동', 'Daon Mart → Bldg 101') })
    for (let k = 0; k < 3; k++) add({ id: `p-student${k}`, kind: 'person', role: L('학생 · 학원', 'Student · after-school class'), speed: 1.3 + k * 0.1, pts: [[-421 - k, MAIN.z1 + 3.6], [-424 - k, front - 0.4], [-436 - k * 1.2, front - 0.4], [-424 - k, front - 0.4]], stops: { 2: 14 + k * 4, 0: 10 }, look: look({ kid: true }), carryAt: { 0: 'bag' } })
    add({ id: 'p-recycle', kind: 'person', role: L('주민 · 분리수거', 'Resident · recycling'), speed: 1.0, pts: [[-440, 139], [-460, 139], [-460, 119.4], [-460, 139]], stops: { 2: 6, 0: 14 }, carryAt: { 0: 'box', 2: 'none' }, label: L('택배 상자 분리수거', 'Recycling parcel boxes') })
    // 편의점은 마을 도로 건너편: 횡단보도(z 82)로 건넌다
    add({ id: 'p-send', kind: 'person', role: L('주민 · 편의점 택배 맡기기', 'Resident · drop-off at store'), speed: 1.1, pts: [[-472, front], [-404, front], [SIDE_W, front], [SIDE_W, 82], [SIDE_E, 82], STORE_DOOR, [SIDE_E, 82], [SIDE_W, 82], [SIDE_W, front], [-404, front]], stops: { 5: 6, 0: 16 }, carryAt: { 0: 'box', 5: 'none' }, label: L('편의점 택배 접수', 'Parcel drop-off at store') })
    // 버스 정류장 · 경비원 · 편의점 직원
    add({ id: 'p-bus', kind: 'person', role: L('버스 기다리는 주민', 'Resident at bus stop'), speed: 1.0, pts: [[-421, MAIN.z1 + 3.2], [-417, MAIN.z1 + 3.2]], stops: { 0: 20, 1: 14 } })
    add({ id: 'p-bus2', kind: 'person', role: L('버스 기다리는 주민', 'Resident at bus stop'), speed: 1.0, pts: [[-424, MAIN.z1 + 3.4], [-424, MAIN.z1 + 4.4]], stops: { 0: 30, 1: 20 }, carryAt: { 0: 'bag' } })
    add({ id: 'p-guard', kind: 'person', role: L('경비원', 'Security guard'), speed: 0.9, pts: [[TW.guard.x - 1, TW.guard.z + 2.4], [TW.locker.x + 2, TW.locker.z - 2], [TW.guard.x - 1, TW.guard.z + 2.4]], stops: { 0: 25, 1: 6 }, look: look({ top: '#3B4A6B', bottom: '#2D3445', helmet: '#2D3445' }) })
    add({ id: 'p-clerk', kind: 'person', role: L('편의점 직원', 'Store clerk'), speed: 0.8, pts: [[STORE_DOOR[0] + 0.4, STORE_DOOR[1] - 1.5], [STORE_DOOR[0] + 0.4, STORE_DOOR[1] + 1.5]], stops: { 0: 18, 1: 12 }, look: look({ top: '#1FA35B' }) })
    // 배송 로봇·드론을 받는 주민
    add({ id: 'p-robot', kind: 'person', role: L('주민 · 로봇 배송 수령', 'Resident · robot delivery pickup'), speed: 1.1, pts: [[-480, TW.northZ + 6.3], [-480, TW.northZ + 8.6]], stops: { 0: 30, 1: 14 }, carryAt: { 1: 'bag', 0: 'none' } })
    add({ id: 'p-drone', kind: 'person', role: L('주민 · 드론 배송 수령', 'Resident · drone delivery pickup'), speed: 1.2, pts: [[-520, TW.southZ - 6.3], [-520, APT_S + 5.5], [-500, APT_S + 5.5], [-500, 183.5], [-500, APT_S + 5.5], [-520, APT_S + 5.5]], stops: { 3: 6, 0: 20 }, carryAt: { 3: 'box', 0: 'none' } })

    // ── 곤지암 허브 · 인천 서브터미널 작업자
    add({ id: 'w-gj1', kind: 'person', role: L('허브 작업자', 'Hub worker'), speed: 1.3, pts: [[34, 1.5], [24, 1.5], [24, -14], [34, -14]], stops: { 2: 6 }, look: look({ vest: true, helmet: '#FFFFFF' }) })
    add({ id: 'w-gj2', kind: 'person', role: L('야드 작업자', 'Yard worker'), speed: 1.2, pts: [[-14, 26], [8, 26]], stops: { 0: 5, 1: 5 }, look: look({ vest: true, helmet: '#F2B92B' }) })
    add({ id: 'w-gate', kind: 'person', role: L('정문 보안요원', 'Gate security officer'), speed: 0.8, pts: [[GATES.GJ.x + 4.2, 33], [GATES.GJ.x + 4.2, 37]], stops: { 0: 15, 1: 15 }, look: look({ top: '#2D3445', helmet: '#2D3445', vest: true }) })
    add({ id: 'w-in1', kind: 'person', role: L('분류 작업자', 'Sorting worker'), speed: 1.1, pts: [[-505, -24.6], [-470, -24.6]], stops: { 0: 4, 1: 4 }, look: look({ vest: true, helmet: '#FFFFFF' }) })
    add({ id: 'w-in2', kind: 'person', role: L('분류 작업자', 'Sorting worker'), speed: 1.1, pts: [[-470, -27.4], [-505, -27.4]], stops: { 0: 6, 1: 6 }, look: look({ vest: true, helmet: '#FFFFFF' }) })
    // ── 부산신항 래싱 작업자 · 검수원
    add({ id: 'w-bs1', kind: 'person', role: L('래싱 작업자', 'Lashing worker'), speed: 1.0, pts: [[200, 297], [310, 297]], stops: { 0: 8, 1: 8 }, look: look({ vest: true, helmet: '#FF8A1F' }) })
    add({ id: 'w-bs2', kind: 'person', role: L('래싱 작업자', 'Lashing worker'), speed: 1.0, pts: [[300, 299], [210, 299]], stops: { 0: 6, 1: 6 }, look: look({ vest: true, helmet: '#FF8A1F' }) })
    add({ id: 'w-bs3', kind: 'person', role: L('게이트 검수원', 'Gate inspector'), speed: 0.8, pts: [[176, 70], [176, 75]], stops: { 0: 12, 1: 12 }, look: look({ vest: true, helmet: '#FFFFFF' }) })
    // ── 인천공항 조업원 · 조종사
    for (const [k, s] of AP.stands.entries()) {
      add({ id: `w-ap${k}`, kind: 'person', role: L('램프 조업원', 'Ramp crew'), speed: 1.3, pts: [[s.x + 12, s.z + 30], [s.x + 12, s.z - 22], [s.x - 12, s.z - 22], [s.x - 12, s.z + 30]], stops: { 1: 5, 3: 5 }, look: look({ vest: true, helmet: '#FFFFFF', top: '#F2B92B' }) })
    }
    add({ id: 'w-pilot', kind: 'person', role: L('운항 승무원', 'Flight crew'), speed: 1.2, pts: [[-900, AP.terminal.z0 - 3], [-955, AP.terminal.z0 - 3], [-958, -110], [-955, AP.terminal.z0 - 3]], stops: { 2: 10, 0: 20 }, look: look({ top: '#1A2340', bottom: '#1A2340', helmet: '#1A2340' }) })
    // ── 횡단보도 보행자(곤지암 정문)
    add({ id: 'p-cross', kind: 'person', role: L('보행자', 'Pedestrian'), speed: 1.3, pts: [[GATES.GJ.x + 15, MAIN.z0 - 1.5], [GATES.GJ.x + 15, MAIN.z1 + 1.5]], stops: { 0: 18, 1: 18 } })

    // ── 배송 수단: 배달 오토바이 · 우체국 집배원 · 퀵서비스
    add({ id: 'm-food', kind: 'moto', role: L('음식 배달 오토바이', 'Food delivery rider'), speed: 8, pts: [[TW.road.sb, 65], [TW.road.sb, TW.apt.wb], [-478, TW.apt.wb], [-478, TW.apt.eb], [TW.road.nb, TW.apt.eb], [TW.road.nb, 65]], stops: { 3: 9, 0: 7 }, look: look({ top: '#FF6B3D', helmet: '#FF6B3D' }), label: L('다온치킨 → 102동', 'Daon Chicken → Bldg 102') })
    add({ id: 'm-post', kind: 'moto', role: L('우체국 집배원', 'Postal carrier'), speed: 6, pts: [[TW.road.nb, 250], [TW.road.nb, 215], [TW.road.nb, 180], [TW.road.nb, 145], [TW.road.nb, 110], [TW.road.nb, 100], [TW.road.sb, 100], [TW.road.sb, 250]], stops: { 1: 6, 2: 6, 3: 6, 4: 6 }, look: look({ top: '#E2463C', helmet: '#E2463C' }), label: L('우체국 등기 배달', 'Registered mail delivery') })
    add({ id: 'm-quick', kind: 'moto', role: L('퀵서비스', 'Quick courier'), speed: 15, pts: [[-380, MAIN.ebOut], [360, MAIN.ebOut], [360, MAIN.wbOut], [-380, MAIN.wbOut]], look: look({ top: '#2D3445', helmet: '#F2B92B' }), label: L('퀵 서류 배송', 'Courier documents') })
    // ── 실외 배송 로봇(편의점 → 102동 앞)
    add({ id: 'r-bot', kind: 'robot', role: L('실외 배송 로봇', 'Outdoor delivery robot'), speed: 1.5, pts: [[STORE_DOOR[0] - 1, STORE_DOOR[1] + 3], [SIDE_E, STORE_DOOR[1] + 3], [SIDE_E, 84], [SIDE_W, 84], [SIDE_W, APT_N], [-480, APT_N], [-480, TW.northZ + 9.5], [-480, APT_N], [SIDE_W, APT_N], [SIDE_W, 82], [SIDE_E, 82], [SIDE_E, STORE_DOOR[1] + 3]], stops: { 6: 14, 0: 12 }, label: L('편의점 → 102동', 'Store → Bldg 102') })
    // ── 드론 배송(마을 끝 드론 거점 → 놀이터 옆 드롭 지점)
    const pad: P = [-548, 205]
    const drop: P = [-500, 186]
    add({ id: 'd-1', kind: 'drone', role: L('드론 배송', 'Drone delivery'), speed: 9, loop: true, pts: [pad, pad, drop, drop, drop, pad], alt: [3.2, 38, 38, 9, 38, 38], stops: { 0: 10, 3: 7 }, label: L('드론 거점 → 104·109동 사이 드롭존', 'Drone hub → drop zone between Bldg 104 & 109') })
    add({ id: 'd-2', kind: 'drone', role: L('드론 배송', 'Drone delivery'), speed: 9, loop: true, pts: [pad, pad, [-430, 112], [-430, 112], [-430, 112], pad], alt: [3.2, 44, 44, 9, 44, 44], stops: { 0: 16, 3: 7 }, label: L('드론 거점 → 110동 앞', 'Drone hub → front of Bldg 110') })
    for (const m of this.movers) this.place(m)
  }

  /** 다른 모듈이 움직이는 사람을 추가한다 */
  addScripted(id: string, role: string, x: number, z: number, look: Partial<Mover['look']>) {
    const r = this.r
    const m: Mover = {
      id, kind: 'person', role, pts: [[x, z], [x, z]], stops: {}, speed: 1.3, loop: true, i: 0, t: 0, pause: 0, x, y: 0, z, heading: Math.PI, moving: false, walkPhase: r() * 6,
      look: { top: '#2F55E6', bottom: BOTTOMS[0], hair: HAIRS[0], ...look }, carry: 'none', carryAt: {}, winch: 0, label: '', cap: Infinity, ghostT: 0, scripted: true,
    }
    this.movers.push(m)
    return m
  }

  private place(m: Mover) {
    const a = m.pts[m.i]
    const b = m.pts[(m.i + 1) % m.pts.length]
    m.x = a[0] + (b[0] - a[0]) * m.t
    m.z = a[1] + (b[1] - a[1]) * m.t
    if (m.alt) m.y = m.alt[m.i] + (m.alt[(m.i + 1) % m.alt.length] - m.alt[m.i]) * m.t
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    if (Math.abs(dx) + Math.abs(dz) > 0.01) m.heading = Math.atan2(dx, dz)
  }

  /** 경로를 따라 s만큼 앞 지점(충돌 회피용) */
  ahead(m: Mover, s: number) {
    let i = m.i
    let t = m.t
    let left = s
    for (let k = 0; k < m.pts.length; k++) {
      const a = m.pts[i]
      const b = m.pts[(i + 1) % m.pts.length]
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      const rest = len * (1 - t)
      if (left <= rest && len > 0.01) {
        const u = t + left / len
        return { x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u, tx: (b[0] - a[0]) / len, tz: (b[1] - a[1]) / len }
      }
      left -= rest
      // 멈출 웨이포인트를 넘어서는 보지 않는다
      if (m.stops[(i + 1) % m.pts.length]) return null
      i = (i + 1) % m.pts.length
      t = 0
    }
    return null
  }

  step(dt: number) {
    for (const m of this.movers) {
      if (m.scripted) continue
      if (m.pause > 0) {
        m.pause -= dt
        m.moving = false
        // 드론은 멈춘 동안 줄을 내렸다 올린다
        if (m.kind === 'drone') m.winch = m.i === 3 ? Math.min(1, Math.sin(Math.PI * Math.min(1, 1 - m.pause / 7)) * 1.2) : 0
        continue
      }
      m.winch = 0
      const a = m.pts[m.i]
      const b = m.pts[(m.i + 1) % m.pts.length]
      const ya = m.alt ? m.alt[m.i] : 0
      const yb = m.alt ? m.alt[(m.i + 1) % m.alt.length] : 0
      const len = Math.max(0.01, Math.hypot(b[0] - a[0], b[1] - a[1], yb - ya))
      const sp = Math.min(m.speed, m.cap)
      m.t += (sp * dt) / len
      m.moving = sp > 0.05
      if (!m.moving) continue
      m.walkPhase += dt * sp * 3.2
      if (m.t >= 1) {
        m.t = 0
        m.i = (m.i + 1) % m.pts.length
        const stop = m.stops[m.i]
        if (stop) m.pause = stop
        const c = m.carryAt[m.i]
        if (c !== undefined) {
          if (c !== 'none' && m.carry === 'none') {
            if (m.id === 'p-locker' || m.id === 'p-store' || m.id === 'p-drone' || m.id === 'p-robot') this.stats.pickup++
          }
          m.carry = c
        }
        if (m.kind === 'robot' && m.i === 6) this.stats.robot++
        if (m.kind === 'drone' && m.i === 3) this.stats.drone++
        if (m.id === 'm-food' && m.i === 3) this.stats.moto++
        if (m.id === 'm-post' && m.stops[m.i]) this.stats.post++
      }
      this.place(m)
    }
  }
}
