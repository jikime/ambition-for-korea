// 대전 중부허브(DJ-07): 이천 FC 동쪽, 간선 북쪽. 곤지암 허브가 분류한 대전·충청행 롤테이너를 11톤 간선이 실어 온다.
// 크로스도크 건물 남쪽 면에 도크 3개. 트럭은 정문으로 들어와 도크 앞 통로를 지나쳤다가 후진으로 도크에 붙는다(인천공항 화물터미널과 같은 방식).
import { leg, v2, type Leg } from './path'
import { BOX } from './layout'
import { GATES } from './world'

const SITE = { speed: 5, kmh: 18, r: 6 }
const REV = { reverse: true, speed: 1.9, kmh: 5 }

export const DJ = {
  site: { x0: 584, x1: 718, z0: -78, z1: 34 },
  /** 야드 대기 칸(도크가 다 차 있으면 여기서 기다린다). 트럭 앞쪽이 남쪽(−z)을 보고 선다 */
  yard: [707.5, 712.5],
  yardZ: 5,
  building: { x0: 596, x1: 684, z0: -64, z1: -32, h: 12 },
  docks: [618, 641, 664],
  landIn: -14,
  landOut: -8,
}
/** 도크에 붙은 트럭 중심 z */
export const DJ_DOCK_Z = DJ.building.z1 + BOX.len / 2 + 0.25

export function djInLegs(dock: number): Leg[] {
  const g = GATES.DJ
  const dx = DJ.docks[dock]
  return [
    leg([v2(g.inX, g.stopZ), v2(g.inX, DJ.landIn), v2(dx - 13, DJ.landIn)], { ...SITE, tag: 'inbound' }),
    leg([v2(dx - 13, DJ.landIn), v2(dx, DJ.landIn), v2(dx, DJ_DOCK_Z)], { ...REV, r: 7, tag: 'docking' }),
  ]
}

export function djOutLegs(dock: number): Leg[] {
  const g = GATES.DJ
  const dx = DJ.docks[dock]
  return [leg([v2(dx, DJ_DOCK_Z), v2(dx, DJ.landOut), v2(g.outX, DJ.landOut), v2(g.outX, g.exitZ)], { ...SITE, r: 6, tag: 'exit-site' })]
}

/** 정문 → 야드 대기 칸 */
export function djYardIn(stall: number): Leg[] {
  const g = GATES.DJ
  const sx = DJ.yard[stall]
  return [leg([v2(g.inX, g.stopZ), v2(g.inX, 27), v2(sx, 19), v2(sx, DJ.yardZ)], { ...SITE, r: 5, tag: 'inbound' })]
}

/** 야드 대기 칸 → 도크(도크 앞 통로를 지나쳤다가 후진) */
export function djYardToDock(stall: number, dock: number): Leg[] {
  const sx = DJ.yard[stall]
  const dx = DJ.docks[dock]
  return [
    leg([v2(sx, DJ.yardZ), v2(sx, DJ.landIn + 5), v2(sx - 6, DJ.landIn), v2(dx - 13, DJ.landIn)], { ...SITE, r: 5, tag: 'inbound' }),
    leg([v2(dx - 13, DJ.landIn), v2(dx, DJ.landIn), v2(dx, DJ_DOCK_Z)], { ...REV, r: 7, tag: 'docking' }),
  ]
}
