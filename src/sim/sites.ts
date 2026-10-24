// 이천 풀필먼트센터(IC) · 인천 서브터미널(IN) · 다온마을(TW) · 부산신항(BS) 배치도와 경로
import { leg, v2, type Leg, type V2 } from './path'
import { L } from '../i18n'

const SITE = { speed: 5, kmh: 18, r: 6 }
const REV = { reverse: true, speed: 1.9, kmh: 5 }
const TOWN = { speed: 9, kmh: 30, r: 5 }
const PORT_SPEED = { speed: 10, kmh: 35, r: 8 }

// ───────────────────────── 이천 풀필먼트센터

export const IC = {
  site: { x0: 360, x1: 530, z0: -80, z1: 34 },
  building: { x0: 385, x1: 520, z0: -70, z1: -15, h: 13 },
  glassX1: 455,
  bays: [430, 456, 482],
  bayZ: 10,
  lines: [417, 443, 469],
  wallZ: -15,
  wrapZ: -8.6,
  pickZ: -1.4,
  rollerY: 0.45,
  corridorZ: 3.4,
  reeferDocks: [492, 507],
  reeferZ: -15 + 4.6 + 0.25,
  yard: { z: 20, wb: 18.5, eb: 21.5, x0: 362, x1: 526 },
  entry: { x: 372, nb: 373.5, sb: 370.5 },
  charger: { x: 400, z: -14.3, spotZ: -11.6 },
  park: [v2(397, -4.5), v2(401, -4.5), v2(405, -4.5)],
  amr: { x0: 393, x1: 447, z0: -63, z1: -36, step: 3 },
  stations: [400, 412, 424, 436],
  stationZ: -28,
}

export function icWingIn(bay: number): Leg[] {
  const bx = IC.bays[bay]
  return [leg([v2(IC.entry.nb, 36.6), v2(IC.entry.nb, IC.yard.eb), v2(bx, IC.yard.eb), v2(bx, IC.bayZ)], { ...SITE, tag: 'inbound' })]
}
export function icWingOut(bay: number): Leg[] {
  const bx = IC.bays[bay]
  return [
    leg([v2(bx, IC.bayZ), v2(bx, IC.yard.wb), v2(bx + 6, IC.yard.wb)], { ...REV, r: 5, tag: 'reverse' }),
    leg([v2(bx + 6, IC.yard.wb), v2(IC.entry.sb, IC.yard.wb), v2(IC.entry.sb, 38)], { ...SITE, tag: 'exit-site' }),
  ]
}
export function icReeferIn(dock: number): Leg[] {
  const dx = IC.reeferDocks[dock]
  return [
    leg([v2(IC.entry.nb, 36.6), v2(IC.entry.nb, IC.yard.eb), v2(dx + 13, IC.yard.eb)], { ...SITE, tag: 'inbound' }),
    leg([v2(dx + 13, IC.yard.eb), v2(dx, IC.yard.eb), v2(dx, IC.reeferZ)], { ...REV, r: 7, tag: 'docking' }),
  ]
}
export function icReeferOut(dock: number): Leg[] {
  const dx = IC.reeferDocks[dock]
  return [leg([v2(dx, IC.reeferZ), v2(dx, IC.yard.wb), v2(IC.entry.sb, IC.yard.wb), v2(IC.entry.sb, 38)], { ...SITE, tag: 'exit-site' })]
}

// ───────────────────────── 인천 서브터미널

export const IN = {
  site: { x0: -532, x1: -372, z0: -74, z1: 34 },
  canopy: { x0: -522, x1: -420, z0: -44, z1: -8 },
  conv: { x0: -514, x1: -425.5, z: -26, y: 1.05 },
  docks: [-31, -21],
  dockRearX: -418,
  boxX: -418 + 5.5 + 0.25,
  vanXs: [-503, -497, -491, -485, -479, -473],
  vanNZ: -30.6,
  vanSZ: -21.4,
  vanNRear: -28.15,
  vanSRear: -23.85,
  laneN: { wb: -38.5, eb: -36.5 },
  laneS: { wb: -15.5, eb: -13.5 },
  entry: { x: -392, nb: -390.5, sb: -393.5 },
  scannerX: -437,
  sorterX0: -510,
  sorterX1: -466,
}

export const IN_SLOTS = [
  ...IN.vanXs.map((x) => ({ x, side: 'N' as const })),
  ...IN.vanXs.map((x) => ({ x, side: 'S' as const })),
]

/** 하차 도크 → 합류 지점까지 신축 컨베이어 */
export function inFeeder(dock: number): V2[] {
  const dz = IN.docks[dock]
  return [v2(-413.5, dz), v2(-421, dz), v2(IN.conv.x1, IN.conv.z), v2(IN.conv.x0, IN.conv.z)]
}

export function inBoxIn(dock: number): Leg[] {
  const dz = IN.docks[dock]
  return [
    leg([v2(IN.entry.nb, 36.6), v2(IN.entry.nb, dz - 12)], { ...SITE, tag: 'inbound' }),
    leg([v2(IN.entry.nb, dz - 12), v2(IN.entry.nb, dz), v2(IN.boxX, dz)], { ...REV, r: 7, tag: 'docking' }),
  ]
}
export function inBoxOut(dock: number): Leg[] {
  const dz = IN.docks[dock]
  return [leg([v2(IN.boxX, dz), v2(IN.entry.sb, dz), v2(IN.entry.sb, 38)], { ...SITE, tag: 'exit-site' })]
}
export function inVanIn(slot: number): Leg[] {
  const s = IN_SLOTS[slot]
  const laneZ = s.side === 'N' ? IN.laneN.wb : IN.laneS.wb
  const parkZ = s.side === 'N' ? IN.vanNZ : IN.vanSZ
  return [
    leg([v2(IN.entry.nb, 36.6), v2(IN.entry.nb, laneZ), v2(s.x - 7, laneZ)], { ...SITE, tag: 'inbound' }),
    leg([v2(s.x - 7, laneZ), v2(s.x, laneZ), v2(s.x, parkZ)], { ...REV, r: 3.5, tag: 'docking' }),
  ]
}
export function inVanOut(slot: number): Leg[] {
  const s = IN_SLOTS[slot]
  const parkZ = s.side === 'N' ? IN.vanNZ : IN.vanSZ
  const laneZ = s.side === 'N' ? IN.laneN.eb : IN.laneS.eb
  return [leg([v2(s.x, parkZ), v2(s.x, laneZ), v2(IN.entry.sb, laneZ), v2(IN.entry.sb, 38)], { ...SITE, r: 4, tag: 'exit-site' })]
}

// ───────────────────────── 다온마을(배송 구역)

export const TW = {
  road: { x: -392, sb: -393.5, nb: -390.5, z0: 56, z1: 262 },
  apt: { roadZ: 150, wb: 148.5, eb: 151.5, x0: -404, x1: -552 },
  northRow: [-440, -480, -520],
  northZ: 132,
  southRow: [-440, -480, -520],
  southZ: 168,
  locker: { x: -414, z: 158.5 },
  guard: { x: -402, z: 142.5 },
  villas: [110, 145, 180, 215],
  villaX: -376,
  store: { x: -374, z: 76 },
}

export interface Stop {
  id: string
  label: string
  van: V2
  door: V2
  boxes: number
  /** 동 경비실(있을 때만) */
  guard?: V2
  /** 동 무인택배함(있을 때만) */
  locker?: V2
}

const north = (x: number) => ({ guard: v2(x + 7, TW.northZ + 10.6), locker: v2(x - 7, TW.northZ + 6.9) })
const south = (x: number) => ({ guard: v2(x + 7, TW.southZ - 10.6), locker: v2(x - 7, TW.southZ - 6.9) })

const aptLabel = (n: number) => L(`다온마을 아파트 ${n}동`, `Daon Village Apt Bldg ${n}`)
export const STOPS: Record<string, Stop> = {
  A101: { id: 'A101', label: aptLabel(101), van: v2(-440, TW.apt.wb), door: v2(-440, TW.northZ + 6.3), boxes: 22, ...north(-440) },
  A102: { id: 'A102', label: aptLabel(102), van: v2(-480, TW.apt.wb), door: v2(-480, TW.northZ + 6.3), boxes: 18, ...north(-480) },
  A103: { id: 'A103', label: aptLabel(103), van: v2(-520, TW.apt.wb), door: v2(-520, TW.northZ + 6.3), boxes: 20, ...north(-520) },
  A106: { id: 'A106', label: aptLabel(106), van: v2(-520, TW.apt.eb), door: v2(-520, TW.southZ - 6.3), boxes: 16, ...south(-520) },
  A105: { id: 'A105', label: aptLabel(105), van: v2(-480, TW.apt.eb), door: v2(-480, TW.southZ - 6.3), boxes: 18, ...south(-480) },
  A104: { id: 'A104', label: aptLabel(104), van: v2(-440, TW.apt.eb), door: v2(-440, TW.southZ - 6.3), boxes: 20, ...south(-440) },
  LOCK: { id: 'LOCK', label: L('관리동 무인택배함', 'Parcel locker (management bldg)'), van: v2(TW.locker.x, TW.apt.eb), door: v2(TW.locker.x, TW.locker.z - 1.4), boxes: 12, locker: v2(TW.locker.x, TW.locker.z - 1.4) },
  V215: { id: 'V215', label: L('초록빌라', 'Chorok Villa'), van: v2(TW.road.nb, 215), door: v2(TW.villaX - 5.4, 215), boxes: 10 },
  V180: { id: 'V180', label: L('다온캐슬', 'Daon Castle'), van: v2(TW.road.nb, 180), door: v2(TW.villaX - 5.4, 180), boxes: 12 },
  V145: { id: 'V145', label: L('해밀빌', 'Haemil Ville'), van: v2(TW.road.nb, 145), door: v2(TW.villaX - 5.4, 145), boxes: 10 },
  V110: { id: 'V110', label: L('다솜하우스', 'Dasom House'), van: v2(TW.road.nb, 110), door: v2(TW.villaX - 5.4, 110), boxes: 12 },
  STORE: { id: 'STORE', label: L('편의점 다온25', 'Daon25 convenience store'), van: v2(TW.road.nb, TW.store.z), door: v2(TW.store.x - 4.2, TW.store.z), boxes: 14 },
}

/** 순서가 정해진 배송 노선: 단지 서행 → 막다른 길 회차 → 단지 동행 → 도로 남쪽 회차 → 빌라·상가(북행) */
const APT_WEST = ['A101', 'A102', 'A103']
const APT_EAST = ['A106', 'A105', 'A104', 'LOCK']
const ROAD_NORTH = ['V215', 'V180', 'V145', 'V110', 'STORE']

export const VARIANTS: Record<string, string[]> = {
  apt: ['A101', 'A103', 'A104', 'LOCK', 'STORE'],
  mix: ['A102', 'A106', 'A105', 'V180', 'V110'],
  villa: ['V215', 'V145', 'STORE'],
  west: ['A101', 'A102', 'LOCK', 'V215', 'V110'],
}

export interface TownSeg {
  legs: Leg[]
  stop?: Stop
}

/** 배송 노선을 정차 지점 단위 구간으로 나눈다 */
export function townRoute(stops: string[]): TownSeg[] {
  const set = new Set(stops)
  const useApt = stops.some((s) => s.startsWith('A') || s === 'LOCK')
  const segs: TownSeg[] = []
  let pts: V2[] = [v2(TW.road.sb, 38)]
  const flush = (stop?: Stop) => {
    segs.push({ legs: [leg(pts, { ...TOWN, tag: 'town' })], stop })
    pts = [pts[pts.length - 1]]
  }
  const add = (...p: V2[]) => pts.push(...p)
  if (useApt) {
    add(v2(TW.road.sb, TW.apt.wb), v2(TW.apt.x0, TW.apt.wb))
    for (const id of APT_WEST) if (set.has(id)) { add(STOPS[id].van); flush(STOPS[id]) }
    add(v2(-532, TW.apt.wb), v2(-544, 143.5), v2(-552, 150), v2(-544, 156.5), v2(-532, TW.apt.eb))
    for (const id of APT_EAST) if (set.has(id)) { add(STOPS[id].van); flush(STOPS[id]) }
    add(v2(TW.apt.x0, TW.apt.eb), v2(TW.road.sb, TW.apt.eb))
  }
  const villas = ROAD_NORTH.filter((id) => set.has(id))
  if (villas.some((id) => id.startsWith('V'))) {
    add(v2(TW.road.sb, 250), v2(-398, 258), v2(TW.road.x, 264), v2(-386, 258), v2(TW.road.nb, 250))
  } else {
    // 빌라가 없으면 단지에서 나와 바로 북쪽으로 돌아간다
    add(v2(TW.road.sb, TW.apt.eb + 8), v2(-398, 168), v2(TW.road.x, 174), v2(-386, 168), v2(TW.road.nb, TW.apt.eb + 8))
  }
  for (const id of villas) { add(STOPS[id].van); flush(STOPS[id]) }
  add(v2(TW.road.nb, 36.6))
  flush()
  return segs
}

// ───────────────────────── 부산신항(자동화 터미널: 상세 배치는 port.ts의 PORT)

export const BS = {
  site: { x0: 120, x1: 372, z0: 64, z1: 302 },
  quayZ: 302,
  ship: { x0: 172, x1: 334, z: 318 },
  entry: { x: 180, sb: 178.5, nb: 181.5 },
  truckLane: 98,
  exitLane: 84,
  loopX: 352,
  xrayX: 300,
}

/** 트레일러: 게이트 → 블록 육측 반출입 지점(컨테이너가 ARMG 아래 오도록 트랙터는 7.6m 앞에 선다) */
export function bsInLegs(blockX: number): Leg[] {
  return [leg([v2(BS.entry.sb, 61.4), v2(BS.entry.sb, BS.truckLane), v2(blockX + 7.6, BS.truckLane)], { ...PORT_SPEED, tag: 'inbound' })]
}

/** 반출입 후 → (필요하면 X-ray 검색기 정차) → 게이트 */
export function bsOutLegs(blockX: number, xray: boolean): Leg[] {
  const toPortal = [v2(blockX + 7.6, BS.truckLane), v2(BS.loopX, BS.truckLane), v2(BS.loopX, BS.exitLane), v2(BS.xrayX, BS.exitLane)]
  const rest = [v2(BS.xrayX, BS.exitLane), v2(BS.entry.nb, BS.exitLane), v2(BS.entry.nb, 60)]
  if (xray) return [leg(toPortal, { ...PORT_SPEED, tag: 'exit-site' }), leg(rest, { ...PORT_SPEED, tag: 'exit-site' })]
  return [leg([...toPortal, ...rest.slice(1)], { ...PORT_SPEED, tag: 'exit-site' })]
}
