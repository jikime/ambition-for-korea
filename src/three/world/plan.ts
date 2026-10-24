// 거점 밖 땅의 배치(순수 계산, 화면 모듈이 함께 쓴다):
//  - 빈 땅 채우기 칸(60m 격자, 공장·창고·주차장·밭·논·숲·빈터)
//  - 칸 경계를 따라가는 왕복 2차로 이면도로와 간선으로 나가는 연결로(240m마다)
//  - 북쪽 산에서 내려와 바다로 드는 강의 중심선
// 모두 결정론적(mulberry32)이고 시뮬레이션과 무관하다.
import { mulberry32 } from '../../sim/data'
import * as L from '../../sim/layout'
import { NO_TREE, rectBlocked, type Rect } from './zones'

export type CellKind = 'factory' | 'warehouse' | 'parking' | 'field' | 'paddy' | 'grove' | 'empty'
export interface Cell { x: number; z: number; kind: CellKind; seed: number }

export const CELL = 60
/** 칸 가운데의 z 시작(경계가 간선 띠(z 37~62)를 피해 z 15 · 75에 오도록) */
const Z0 = -375
/** 이면도로 반폭 */
export const ROAD_HALF = 3.5

let cellsMemo: Cell[] | null = null
/** 격자 칸 고르기(결정론적) */
export function infillPlan(): Cell[] {
  if (cellsMemo) return cellsMemo
  const r = mulberry32(2026)
  const out: Cell[] = []
  for (let x = -870; x <= 870; x += CELL) {
    for (let z = Z0; z <= 405; z += CELL) {
      const roll = r()
      const seed = Math.floor(r() * 1e6)
      // 칸 안쪽 6m 여백을 두고 거점·도로와 겹치면 비운다
      if (rectBlocked(x - CELL / 2 + 6, x + CELL / 2 - 6, z - CELL / 2 + 6, z + CELL / 2 - 6)) continue
      const kind: CellKind = roll < 0.24 ? 'factory' : roll < 0.4 ? 'warehouse' : roll < 0.48 ? 'parking' : roll < 0.58 ? 'field' : roll < 0.68 ? 'paddy' : roll < 0.9 ? 'grove' : 'empty'
      out.push({ x, z, kind, seed })
    }
  }
  cellsMemo = out
  return out
}

/** 축에 나란한 도로 한 토막(x0≤x1, z0≤z1; 가로면 z0=z1, 세로면 x0=x1) */
export interface RoadSeg { x0: number; z0: number; x1: number; z1: number; link?: boolean }

const MAIN_BAND: Rect = [-1300, 1300, 37, 62]
const segRect = (s: RoadSeg): Rect => (s.z0 === s.z1 ? [s.x0, s.x1, s.z0 - ROAD_HALF, s.z0 + ROAD_HALF] : [s.x0 - ROAD_HALF, s.x0 + ROAD_HALF, s.z0, s.z1])
const overlaps = (a: Rect, b: Rect) => a[0] < b[1] && a[1] > b[0] && a[2] < b[3] && a[3] > b[2]

let roadsMemo: RoadSeg[] | null = null
/** 이면도로: 빈 땅 채우기 칸의 네 변(겹치면 하나), 거점·시설·강에 걸리는 토막은 뺀다. 간선 양옆 가로 도로(z 15 · 75)에서 120m마다 간선으로 연결로 */
export function roadPlan(): RoadSeg[] {
  if (roadsMemo) return roadsMemo
  const map = new Map<string, RoadSeg>()
  const add = (s: RoadSeg) => {
    if (NO_TREE.some((n) => overlaps(segRect(s), n))) return
    map.set(`${s.x0},${s.z0},${s.x1},${s.z1}`, s)
  }
  const h = CELL / 2
  for (const c of infillPlan()) {
    add({ x0: c.x - h, x1: c.x + h, z0: c.z - h, z1: c.z - h })
    add({ x0: c.x - h, x1: c.x + h, z0: c.z + h, z1: c.z + h })
    add({ x0: c.x - h, x1: c.x - h, z0: c.z - h, z1: c.z + h })
    add({ x0: c.x + h, x1: c.x + h, z0: c.z - h, z1: c.z + h })
  }
  const segs = [...map.values()]
  // 간선 연결로: 120m 간격 세로 경계에서 가로 도로(z 15 · 75)가 있으면 간선 가장자리까지(간선 띠는 겹쳐도 된다)
  const others = NO_TREE.filter((n) => !(n[0] === MAIN_BAND[0] && n[1] === MAIN_BAND[1] && n[2] === MAIN_BAND[2] && n[3] === MAIN_BAND[3]))
  const has = (x: number, z: number) => segs.some((s) => (s.z0 === z && s.z1 === z && s.x0 <= x && s.x1 >= x) || (s.x0 === x && s.x1 === x && s.z0 <= z && s.z1 >= z))
  for (let x = -900; x <= 900; x += CELL * 2) {
    const links: [RoadSeg, number][] = [
      [{ x0: x, x1: x, z0: 15, z1: L.MAIN.z0, link: true }, 15],
      [{ x0: x, x1: x, z0: L.MAIN.z1, z1: 75, link: true }, 75],
    ]
    for (const [s, zEnd] of links) {
      if (!has(x, zEnd) || others.some((n) => overlaps(segRect(s), n))) continue
      segs.push(s)
    }
  }
  roadsMemo = segs
  return segs
}

/** 이면도로가 지나는 사각형들(나무를 심지 않는다) */
export function roadRects(): Rect[] {
  return roadPlan().map((s) => {
    const r = segRect(s)
    return [r[0] - 1.5, r[1] + 1.5, r[2] - 1.5, r[3] + 1.5] as Rect
  })
}

/** 강 중심선(북쪽 산골짜기 → 간선 다리 → 철교 → 바다), 평지 구간 폭 34m */
export const RIVER: [number, number][] = [
  [818, -2150], [796, -1700], [826, -1300], [800, -950], [812, -700], [796, -480], [806, -250], [794, 0], [806, 180], [800, 300], [802, 420],
]
export const RIVER_W = 34
