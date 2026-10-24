// 간선도로를 오가는 일반 차량(승용차·SUV·화물차). 차로를 따라 달리고, 앞차·트럭·보행자가 있으면 줄을 선다.
import { mulberry32 } from './data'
import { MAIN } from './layout'

export interface Lane {
  z: number
  dir: 1 | -1
  vmax: number
}

export const LANES: Lane[] = [
  { z: MAIN.wbIn, dir: -1, vmax: 23 },
  { z: MAIN.ebIn, dir: 1, vmax: 22 },
  { z: MAIN.ebOut, dir: 1, vmax: 18 },
  { z: MAIN.wbOut, dir: -1, vmax: 17 },
]

export interface Car {
  id: string
  lane: number
  x: number
  v: number
  vmax: number
  kind: 'car' | 'suv' | 'truck'
  color: string
  half: number
  cap: number
  /** 차로를 바꾸는 중: 새 차로 중심에서 옆으로 남은 거리(0으로 줄어든다) */
  zOff: number
}

const COLORS = ['#F4F6FA', '#2D3445', '#B8C2D6', '#E45B4B', '#5D79E8', '#F4F6FA', '#8A94A8', '#1F2633', '#C9D3E6']
const TRUCKS = ['donghae', 'hangil', 'baro']
export const TRAFFIC_X = 1150

/** 차로마다 일반 차량 수(인스턴스로 그리므로 늘려도 그리기 명령은 그대로) */
export const CARS_PER_LANE = 10

export class TrafficSim {
  cars: Car[] = []

  constructor(n = CARS_PER_LANE) {
    const r = mulberry32(99)
    LANES.forEach((lane, li) => {
      for (let k = 0; k < n; k++) {
        const kind: Car['kind'] = r() < 0.18 ? 'truck' : r() < 0.4 ? 'suv' : 'car'
        this.cars.push({
          id: `car-${li}-${k}`,
          lane: li,
          x: -TRAFFIC_X + ((k + r() * 0.6) / n) * TRAFFIC_X * 2,
          v: lane.vmax,
          vmax: lane.vmax * (0.85 + r() * 0.25) * (kind === 'truck' ? 0.8 : 1),
          kind,
          color: kind === 'truck' ? TRUCKS[Math.floor(r() * TRUCKS.length)] : COLORS[Math.floor(r() * COLORS.length)],
          half: kind === 'truck' ? 5.5 : 2.3,
          cap: Infinity,
          zOff: 0,
        })
      }
    })
  }

  laneOf(c: Car) {
    return LANES[c.lane]
  }

  /** 같은 방향 옆 차로로 옮긴다(앞에 멈춘 차가 있을 때) */
  changeLane(c: Car, to: number) {
    c.zOff = LANES[c.lane].z + c.zOff - LANES[to].z
    c.lane = to
  }

  step(dt: number) {
    for (const c of this.cars) {
      const lane = LANES[c.lane]
      const want = Math.min(c.vmax, c.cap)
      // 가속은 부드럽게, 감속은 빠르게
      c.v = c.v < want ? Math.min(want, c.v + 3 * dt) : Math.max(want, c.v - 9 * dt)
      c.x += lane.dir * c.v * dt
      if (c.zOff) {
        const k = Math.min(Math.abs(c.zOff), dt * 1.8)
        c.zOff -= Math.sign(c.zOff) * k
      }
      if (c.x > TRAFFIC_X) c.x = -TRAFFIC_X
      if (c.x < -TRAFFIC_X) c.x = TRAFFIC_X
    }
  }
}
