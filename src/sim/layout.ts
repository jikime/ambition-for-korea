// 곤지암 메가허브 배치도. 단위는 m에 가깝다. x=동쪽, z=남쪽, 진행 방향 모델 기준 +z.
import { leg, v2, type Leg, type V2 } from './path'

export const SITE = { x0: -62, x1: 102, z0: -48, z1: 34 }
/** 컨테이너 야적장(CY) */
export const CY = { x0: 70, x1: 100, z0: -36, z1: 26, laneZ: 14, backZ: -26, turnX: 96, dropX: 86 }
export const BUILDING = { x0: -58, x1: 14, z0: -44, z1: -10, h: 11 }
/** 본동 동쪽은 유리 지붕 분류동(크로스벨트 소터) */
export const SORT_HALL_X0 = -28

/** 지게차 입고문(정면 벽 z=-10) */
export const IN_DOORS = [-50, -41, -32]
/** 간선 탑차 출고 도크 */
/** 마지막(11.5)은 항공 화물 트럭이 먼저 쓰는 도크 */
export const OUT_DOCKS = [-16, -6, 4, 11.5]
/** 윙바디 측면 하차장(트럭 중심 z=BAY_Z, 북쪽을 향해 주차) */
export const BAYS = [-54, -42, -30]
export const BAY_Z = 9
export const CHARGERS = [-26.5, -22.5]
export const CHARGER_Z = -9.3
export const CHARGE_SPOT_Z = -6.6
export const PARK_SPOTS: V2[] = [v2(-27.2, -2.6), v2(-24.6, -2.6), v2(-22, -2.6)]
export const TRANSIT_Z = 0.8
export const DOOR_IN_Z = -12.5
export const DOOR_OUT_Z = -2.2

/** 배송 분류장(캐노피)과 컨베이어 */
export const CANOPY = { x0: 18, x1: 54, z0: -44, z1: -16 }
export const CONVEYOR = { x0: 14, x1: 53, z: -30, y: 1.05, width: 1.1 }
export const VAN_XS = [22, 27, 32, 37, 42, 47]
export const VAN_SLOTS = [
  ...VAN_XS.map((x) => ({ x, side: 'N' as const })),
  ...VAN_XS.map((x) => ({ x, side: 'S' as const })),
]
export const VAN_N_Z = -34.45
export const VAN_S_Z = -25.55
export const VAN_N_REAR = -32
export const VAN_S_REAR = -28

/** 도로 */
export const YARD = { z: 22, wb: 20.5, eb: 23.5, x0: -62, x1: 66 }
export const ENTRY = { x: 62, nb: 63.5, sb: 60.5, z0: -44, z1: 40 }
export const LANE_N = { z: -40.5, wb: -41.5, eb: -39.5 }
export const LANE_S = { z: -19, wb: -20, eb: -18 }
/** 왕복 4차로. 서행(서쪽) 바깥 42.75 · 안쪽 46.25, 동행(동쪽) 안쪽 49.75 · 바깥 53.25 */
export const MAIN = { z: 48, z0: 41, z1: 55, wbOut: 42.75, wbIn: 46.25, ebIn: 49.75, ebOut: 53.25 }
export const GATE_Z = 34
export const GATE_STOP_Z = 36.6

/** 크기(모델과 시뮬레이션이 함께 쓴다) */
export const WING = { len: 10.2, width: 2.5, bodyZ: -1.25, bodyLen: 7.4, bedY: 1.3, bodyH: 2.55 }
export const BOX = { len: 11, width: 2.5 }
export const VAN = { len: 4.9, width: 1.8 }
export const WING_SLOTS = [0.62, -0.62].flatMap((lx) => [2.7, 0.9, -0.9, -2.7].map((dz) => ({ lx, lz: WING.bodyZ + dz })))
export const DOCKED_BOX_Z = BUILDING.z1 + BOX.len / 2 + 0.25

const SITE_SPEED = { speed: 5, kmh: 18, r: 6 }
const REV = { reverse: true, speed: 1.9, kmh: 5 }

function exitLegs(from: V2[]): Leg[] {
  return [leg([...from, v2(ENTRY.sb, YARD.eb), v2(ENTRY.sb, 38)], { ...SITE_SPEED, r: 6, tag: 'exit-site' })]
}

export function wingInLegs(bay: number): Leg[] {
  const bx = BAYS[bay]
  return [leg([v2(ENTRY.nb, GATE_STOP_Z), v2(ENTRY.nb, YARD.wb), v2(bx, YARD.wb), v2(bx, BAY_Z)], { ...SITE_SPEED, tag: 'inbound' })]
}

export function wingOutLegs(bay: number): Leg[] {
  const bx = BAYS[bay]
  return [
    leg([v2(bx, BAY_Z), v2(bx, YARD.eb), v2(bx - 6, YARD.eb)], { ...REV, r: 5, tag: 'reverse' }),
    ...exitLegs([v2(bx - 6, YARD.eb)]),
  ]
}

export function boxInLegs(dock: number): Leg[] {
  const dx = OUT_DOCKS[dock]
  return [
    leg([v2(ENTRY.nb, GATE_STOP_Z), v2(ENTRY.nb, YARD.wb), v2(dx - 13, YARD.wb)], { ...SITE_SPEED, tag: 'inbound' }),
    leg([v2(dx - 13, YARD.wb), v2(dx, YARD.wb), v2(dx, DOCKED_BOX_Z)], { ...REV, r: 7, tag: 'docking' }),
  ]
}

export function boxOutLegs(dock: number): Leg[] {
  const dx = OUT_DOCKS[dock]
  return exitLegs([v2(dx, DOCKED_BOX_Z), v2(dx, YARD.eb)])
}

export function vanInLegs(slot: number): Leg[] {
  const s = VAN_SLOTS[slot]
  const laneZ = s.side === 'N' ? LANE_N.wb : LANE_S.wb
  const parkZ = s.side === 'N' ? VAN_N_Z : VAN_S_Z
  return [
    leg([v2(ENTRY.nb, GATE_STOP_Z), v2(ENTRY.nb, laneZ), v2(s.x - 7, laneZ)], { ...SITE_SPEED, tag: 'inbound' }),
    leg([v2(s.x - 7, laneZ), v2(s.x, laneZ), v2(s.x, parkZ)], { ...REV, r: 3.5, tag: 'docking' }),
  ]
}

export function vanOutLegs(slot: number): Leg[] {
  const s = VAN_SLOTS[slot]
  const parkZ = s.side === 'N' ? VAN_N_Z : VAN_S_Z
  const laneZ = s.side === 'N' ? LANE_N.eb : LANE_S.eb
  return exitLegs([v2(s.x, parkZ), v2(s.x, laneZ), v2(ENTRY.sb, laneZ)])
}

/** 로컬 좌표(모델 기준)를 월드 좌표로 */
export function toWorld(x: number, z: number, heading: number, lx: number, lz: number): V2 {
  const c = Math.cos(heading)
  const s = Math.sin(heading)
  return { x: x + lx * c + lz * s, z: z - lx * s + lz * c }
}

/** 컨테이너 트레일러: 정문 → CY 하역 지점 */
export function trailerInLegs(): Leg[] {
  return [leg([v2(ENTRY.nb, GATE_STOP_Z), v2(ENTRY.nb, CY.laneZ), v2(CY.dropX, CY.laneZ)], { ...SITE_SPEED, r: 8, tag: 'inbound' })]
}

/** CY를 한 바퀴 돌아 정문으로 */
export function trailerOutLegs(): Leg[] {
  return [
    leg([v2(CY.dropX, CY.laneZ), v2(CY.turnX, CY.laneZ), v2(CY.turnX, CY.backZ), v2(ENTRY.sb, CY.backZ), v2(ENTRY.sb, 38)], { ...SITE_SPEED, r: 8, tag: 'exit-site' }),
  ]
}
