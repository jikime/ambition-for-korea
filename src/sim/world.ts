// 전체 지도: 간선도로(z=48, 왕복 4차로)를 따라 여러 거점이 붙어 있다.
import { leg, v2, type Leg, type V2 } from './path'
import { MAIN } from './layout'
import { L } from '../i18n'

export type SiteId = 'GJ' | 'IN' | 'IC' | 'BS' | 'TW' | 'AP' | 'DJ'
export type Endpoint = 'GJ' | 'IN' | 'IC' | 'BS' | 'AP' | 'DJ' | 'S' | 'W' | 'E'

export interface Gate {
  x: number
  side: 'N' | 'S'
  /** 진입 차로(도로에서 거점 쪽으로) */
  inX: number
  /** 진출 차로 */
  outX: number
  /** 차단기 위치 */
  gateZ: number
  /** 진입 정지선 */
  stopZ: number
  /** 거점 내부 출차 경로가 끝나는 지점 */
  exitZ: number
  barrier: boolean
}

function northGate(x: number): Gate {
  return { x, side: 'N', inX: x + 1.5, outX: x - 1.5, gateZ: 34, stopZ: 36.6, exitZ: 38, barrier: true }
}

export const GATES: Record<Exclude<Endpoint, 'W' | 'E'>, Gate> = {
  GJ: northGate(62),
  IN: northGate(-392),
  IC: northGate(372),
  BS: { x: 180, side: 'S', inX: 178.5, outX: 181.5, gateZ: 64, stopZ: 61.4, exitZ: 60, barrier: true },
  AP: northGate(-700),
  DJ: northGate(700),
  // 광주 시내로 빠지는 지방도(지도 밖)
  S: { x: -60, side: 'S', inX: -61.5, outX: -58.5, gateZ: 64, stopZ: 270, exitZ: 270, barrier: false },
}

export const OFFMAP_X = 1150
export const HW_SPEED = { speed: 24, kmh: 80 }
const RAMP = { speed: 8, kmh: 30, r: 7 }

const xOf = (e: Endpoint) => (e === 'W' ? -OFFMAP_X : e === 'E' ? OFFMAP_X : GATES[e].x)

/** 거점(또는 지도 끝) 사이를 간선도로로 잇는 경로 */
export function connector(from: Endpoint, to: Endpoint): Leg[] {
  const dir = Math.sign(xOf(to) - xOf(from)) || 1
  const toGate = to === 'W' || to === 'E' ? null : GATES[to]
  const laneZ = dir < 0 ? (toGate?.side === 'S' ? MAIN.wbIn : MAIN.wbOut) : toGate?.side === 'S' ? MAIN.ebOut : MAIN.ebIn
  const legs: Leg[] = []
  let sx: number
  if (from === 'W' || from === 'E') {
    sx = xOf(from)
  } else {
    const g = GATES[from]
    sx = g.outX + dir * 16
    const slow = from === 'S' ? { ...RAMP, speed: 13, kmh: 50 } : RAMP
    legs.push(leg([v2(g.outX, g.exitZ), v2(g.outX, laneZ), v2(sx, laneZ)], { ...slow, tag: 'exit' }))
  }
  if (!toGate) {
    legs.push(leg([v2(sx, laneZ), v2(xOf(to), laneZ)], { ...HW_SPEED, r: 0, tag: 'highway' }))
    return legs
  }
  const ex = toGate.inX - dir * 16
  legs.push(leg([v2(sx, laneZ), v2(ex, laneZ)], { ...HW_SPEED, r: 0, tag: 'highway' }))
  const slow = to === 'S' ? { ...RAMP, speed: 13, kmh: 50 } : RAMP
  legs.push(leg([v2(ex, laneZ), v2(toGate.inX, laneZ), v2(toGate.inX, toGate.stopZ)], { ...slow, tag: 'approach' }))
  return legs
}

/** 지도 끝에서 시작하는 경우의 첫 위치 */
export function spawnPoint(from: 'W' | 'E', to: Endpoint): V2 {
  const legs = connector(from, to)
  return legs[0].path.pts[0]
}

export interface SiteMeta {
  id: SiteId
  code: string
  name: string
  type: string
  address: string
  center: [number, number]
  dist: number
  azimuth?: number
}

export const SITE_META: Record<SiteId, SiteMeta> = {
  GJ: { id: 'GJ', code: 'GJ-01', name: L('곤지암 메가허브', 'Gonjiam Mega Hub'), type: L('메가허브', 'Mega hub'), address: L('경기 광주시 곤지암읍 다온로 120', '120 Daon-ro, Gonjiam-eup, Gwangju-si, Gyeonggi'), center: [8, -6], dist: 185 },
  IC: { id: 'IC', code: 'IC-03', name: L('이천 풀필먼트센터', 'Icheon Fulfillment Center'), type: L('풀필먼트 · 콜드체인', 'Fulfillment · Cold chain'), address: L('경기 이천시 마장면 물류로 77', '77 Mullyu-ro, Majang-myeon, Icheon-si, Gyeonggi'), center: [446, -18], dist: 170 },
  IN: { id: 'IN', code: 'IN-05', name: L('인천 서브터미널', 'Incheon Sub-terminal'), type: L('서브터미널', 'Sub-terminal'), address: L('인천 서구 배송로 88', '88 Baesong-ro, Seo-gu, Incheon'), center: [-452, -16], dist: 150 },
  TW: { id: 'TW', code: 'TW-01', name: L('다온마을 배송구역', 'Daon Village Delivery Zone'), type: L('라스트마일', 'Last mile'), address: L('인천 서구 다온마을로 일대', 'Daonmaeul-ro area, Seo-gu, Incheon'), center: [-448, 150], dist: 215 },
  BS: { id: 'BS', code: 'BS-04', name: L('부산신항 물류센터', 'Busan New Port Logistics Center'), type: L('항만 물류', 'Port logistics'), address: L('부산 강서구 신항배후로 220', '220 Sinhangbaehu-ro, Gangseo-gu, Busan'), center: [258, 252], dist: 270, azimuth: Math.PI + 0.55 },
  AP: { id: 'AP', code: 'AP-06', name: L('인천공항 화물터미널', 'Incheon Airport Cargo Terminal'), type: L('항공 화물', 'Air cargo'), address: L('인천 중구 공항화물로 160', '160 Gonghanghwamul-ro, Jung-gu, Incheon'), center: [-905, -150], dist: 330, azimuth: Math.PI - 0.5 },
  DJ: { id: 'DJ', code: 'DJ-07', name: L('대전 중부허브', 'Daejeon Central Hub'), type: L('중부권 허브', 'Central region hub'), address: L('대전 대덕구 물류단지로 77', '77 Mullyudanji-ro, Daedeok-gu, Daejeon'), center: [648, -22], dist: 165 },
}

export const SITE_ORDER: SiteId[] = ['IC', 'GJ', 'DJ', 'IN', 'TW', 'BS', 'AP']
export const NETWORK_VIEW = { center: [-75, 10] as [number, number], dist: 2520 }

/** 네트워크 보기의 간선 흐름 */
export const FLOWS = [
  { key: 'icgj', label: L('이천 FC ↔ 곤지암 (윙바디)', 'Icheon FC ↔ Gonjiam (wing-body)'), color: '#3D63FF', pts: [[373, 38], [373, 46], [62, 46], [62, 38]] },
  { key: 'gjin', label: L('곤지암 ↔ 인천 (11톤 간선)', 'Gonjiam ↔ Incheon (11-ton linehaul)'), color: '#7A5CFF', pts: [[61, 38], [61, 50], [-391, 50], [-391, 38]] },
  { key: 'intw', label: L('인천 ↔ 다온마을 (1톤 배송)', 'Incheon ↔ Daon Village (1-ton delivery)'), color: '#16B3A8', pts: [[-394, 38], [-394, 150], [-520, 150]] },
  { key: 'bsgj', label: L('부산신항 ↔ 곤지암 CY (트레일러)', 'Busan New Port ↔ Gonjiam CY (trailer)'), color: '#FF8A3D', pts: [[64, 38], [64, 53], [180, 53], [180, 292], [262, 292]] },
  { key: 'gjap', label: L('곤지암 ↔ 인천공항 (항공 화물)', 'Gonjiam ↔ Incheon Airport (air cargo)'), color: '#3A9BD9', pts: [[59, 38], [59, 44], [-700, 44], [-700, -14], [-940, -14]] },
  { key: 'gjdj', label: L('곤지암 ↔ 대전 중부허브 (11톤 간선)', 'Gonjiam ↔ Daejeon Central Hub (11-ton linehaul)'), color: '#E0A100', pts: [[64, 38], [64, 51], [701, 51], [701, -14], [640, -14]] },
  { key: 'rail', label: L('부산신항 ↔ 곤지암 철송장 (컨테이너 열차)', 'Busan New Port ↔ Gonjiam rail terminal (container train)'), color: '#16A34A', pts: [[400, 291], [1000, 291], [1000, -100], [-55, -100]] },
] as const
