// 고속도로 휴게소(다온휴게소). 실제처럼 방향마다 하나씩, 인천과 곤지암 사이 같은 지점의 양쪽에 있다.
//  - 북쪽: 인천 방향(서쪽으로 가는 차, 북쪽 차로)  - 남쪽: 곤지암·이천 방향(동쪽으로 가는 차, 남쪽 차로)
// 화물차 운전자는 2시간 연속 운전 후 15분 이상 쉬어야 한다(화물자동차 운수사업법 시행규칙).
// 휴게가 필요한 차는 간선 경로를 휴게소 앞에서 나눠: 진입 → 화물차 칸에 정차·휴식 → 다시 간선에 합류한다.
import { leg, v2, type Leg } from './path'
import { MAIN } from './layout'
import { HW_SPEED } from './world'
import { L } from '../i18n'

/** 연속 운전 한도: 2시간(시계) = 시뮬레이션 600초(SPEEDUP 12) */
export const DRIVE_LIMIT = 600
/** 의무 휴게: 15분(시계) = 시뮬레이션 75초 */
export const REST_MIN = 75
/** 이만큼 운전했으면 휴게소를 지날 때 들러 쉬고 싶어 한다(1시간 20분) */
export const DRIVE_TIRED = 400
/** 휴게소를 지나지 않는 셔틀 경로의 기사 교대(시계 1분 남짓) */
export const SWAP_T = 6

const RAMP = { speed: 8, kmh: 30, r: 7 }
const LOT = { speed: 5, kmh: 18, r: 6 }

export interface RestBay {
  x: number
  /** 트랙터(앞차) 중심이 서는 z */
  stopZ: number
  vehicle: string | null
}

export interface RestArea {
  id: 'N' | 'S'
  name: string
  /** 이 휴게소를 쓰는 진행 방향(+1 동쪽, -1 서쪽) */
  dir: 1 | -1
  /** 차로에서 빠지는 x(진행 방향 기준 휴게소 앞쪽 끝) */
  inX: number
  /** 차로로 다시 들어가는 x */
  outX: number
  /** 빠지고 들어가는 바깥 차로 */
  laneZ: number
  /** 간선과 나란한 진입로 */
  slipZ: number
  /** 화물차 칸 앞 통로(들어갈 때) */
  aisleZ: number
  /** 화물차 칸 뒤 통로(나갈 때) */
  outZ: number
  /** 휴게소 부지(그림·선택용) */
  x0: number
  x1: number
  z0: number
  z1: number
  bays: RestBay[]
  /** 휴게소 건물 입구(운전자가 걸어가는 곳) */
  door: { x: number; z: number }
}

const bays = (xs: number[], stopZ: number): RestBay[] => xs.map((x) => ({ x, stopZ, vehicle: null }))
const range = (a: number, b: number, step: number) => {
  const out: number[] = []
  for (let x = a; step > 0 ? x <= b : x >= b; x += step) out.push(x)
  return out
}

export const REST_AREAS: RestArea[] = [
  {
    id: 'N', name: L('다온휴게소(인천 방향)', 'Daon Rest Area (Incheon-bound)'), dir: -1,
    inX: -84, outX: -238, laneZ: MAIN.wbOut, slipZ: 35, aisleZ: 29, outZ: 2,
    x0: -246, x1: -78, z0: -24, z1: 39,
    bays: bays(range(-118, -222, -8), 10),
    door: { x: -168, z: -5 },
  },
  {
    id: 'S', name: L('다온휴게소(곤지암·이천 방향)', 'Daon Rest Area (Gonjiam/Icheon-bound)'), dir: 1,
    inX: -254, outX: -110, laneZ: MAIN.ebOut, slipZ: 61, aisleZ: 67, outZ: 94,
    x0: -262, x1: -102, z0: 57, z1: 120,
    bays: bays(range(-218, -138, 8), 86),
    door: { x: -168, z: 101 },
  },
]

/** 간선 구간 [sx → ex] 안에 이 휴게소 진입 x가 넉넉히 들어 있는가 */
export function onRoute(a: RestArea, sx: number, ex: number) {
  const d = Math.sign(ex - sx)
  if (d !== a.dir) return false
  const along = (x: number) => (x - sx) * d
  return along(a.inX) > 24 && along(a.outX) < along(ex) - 30
}

/** 간선에서 휴게소 화물차 칸까지: 간선(앞부분) + 진입로(approach) + 구내(rest) */
export function restIn(a: RestArea, bay: RestBay, sx: number, laneZ: number): Leg[] {
  const d = a.dir
  const ex = a.inX - d * 18
  return [
    leg([v2(sx, laneZ), v2(ex, laneZ)], { ...HW_SPEED, r: 0, tag: 'highway' }),
    // 바깥 차로로 옮겨 진입로로 빠진다(approach: 끼어들기 판단은 도로 쪽 끝점 기준)
    leg([v2(ex, laneZ), v2(a.inX - d * 6, a.laneZ), v2(a.inX, a.slipZ)], { ...RAMP, tag: 'approach' }),
    leg([v2(a.inX, a.slipZ), v2(a.inX + d * 14, a.slipZ), v2(a.inX + d * 22, a.aisleZ), v2(bay.x, a.aisleZ), v2(bay.x, bay.stopZ)], { ...LOT, tag: 'rest' }),
  ]
}

/** 화물차 칸에서 다시 간선으로: 구내(rest) + 합류(exit: 끼어들 틈을 본다) + 간선(뒷부분) */
export function restOut(a: RestArea, bay: RestBay, ex: number, laneZ: number): Leg[] {
  const d = a.dir
  const sx = a.outX + d * 16
  const pts: Leg[] = [
    leg([v2(bay.x, bay.stopZ), v2(bay.x, a.outZ), v2(a.outX, a.outZ), v2(a.outX, a.slipZ)], { ...LOT, tag: 'rest' }),
    leg([v2(a.outX, a.slipZ), v2(a.outX, laneZ), v2(sx, laneZ)], { ...RAMP, tag: 'exit' }),
  ]
  if ((ex - sx) * d > 1) pts.push(leg([v2(sx, laneZ), v2(ex, laneZ)], { ...HW_SPEED, r: 0, tag: 'highway' }))
  return pts
}

/** 간선 표지 위치: [500m 전, 입구] */
export function restSigns(a: RestArea): [number, number][] {
  const s = a.slipZ > MAIN.z ? 1 : -1
  const z = (s > 0 ? MAIN.z1 : MAIN.z0) + s * 4.5
  return [[a.inX - a.dir * 60, z], [a.inX - a.dir * 10, z]]
}

/** 길가 가로수·가로등을 두지 않을 곳(진입로·진출로·표지 자리). side: 간선 북쪽(N)/남쪽(S) */
export function restClear(x: number, side: 'N' | 'S') {
  for (const a of REST_AREAS) {
    if ((a.slipZ > MAIN.z ? 'S' : 'N') !== side) continue
    if (Math.abs(x - (a.inX - a.dir * 14)) < 20 || Math.abs(x - a.outX) < 10) return true
    if (restSigns(a).some(([sx]) => Math.abs(x - sx) < 5)) return true
  }
  return false
}
