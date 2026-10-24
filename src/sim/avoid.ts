// 충돌 회피: 각 이동체가 자기 경로 앞쪽을 살펴 다른 차량·보행자·지게차가 있으면 속도를 줄이고 멈춘다.
// AI 같은 언어 판단이 아니라 매 스텝(초당 수십 번) 계산해야 하는 기하 문제라 코드로 푼다.

/** 이동체의 몸체: 중심에서 진행 방향으로 ±half 인 선분 + 반폭 w */
export interface Body {
  id: string
  x: number
  z: number
  dx: number
  dz: number
  half: number
  w: number
  speed: number
  /** 작업 중이라 한동안 움직이지 않는 차(배송 정차·상하차): 뒤차가 옆으로 비켜 지나갈 수 있다 */
  parked: boolean
  /** 같은 차의 다른 몸체(트랙터-트레일러)는 서로 막지 않는다 */
  group: string
}

/** 몸체를 48m 칸으로 나눠 둔 격자(주변만 빠르게 찾는다) */
export class Grid {
  private cells = new Map<number, Body[]>()
  static S = 48
  constructor(bodies: Body[]) {
    for (const b of bodies) {
      const k = Grid.key(Math.floor(b.x / Grid.S), Math.floor(b.z / Grid.S))
      const c = this.cells.get(k)
      if (c) c.push(b)
      else this.cells.set(k, [b])
    }
  }
  static key(cx: number, cz: number) {
    return (cx + 1000) * 4096 + (cz + 1000)
  }
  near(x: number, z: number, r: number, out: Body[]) {
    const x0 = Math.floor((x - r) / Grid.S)
    const x1 = Math.floor((x + r) / Grid.S)
    const z0 = Math.floor((z - r) / Grid.S)
    const z1 = Math.floor((z + r) / Grid.S)
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const c = this.cells.get(Grid.key(cx, cz))
      if (c) for (const b of c) out.push(b)
    }
    return out
  }
}

export type Ahead = (s: number) => { x: number; z: number; tx: number; tz: number } | null

export interface Scan {
  gap: number
  hit: Body | null
  /** 그대로 지나가도 맞부딪히지 않고 옆으로 스치기만 하는가(교착을 풀 때 이런 차만 먼저 보낸다) */
  graze: boolean
}

/** 점과 몸체 선분 사이 거리의 제곱 */
export function bodyDist2(px: number, pz: number, b: Body) {
  const rx = px - b.x
  const rz = pz - b.z
  let t = rx * b.dx + rz * b.dz
  if (t > b.half) t = b.half
  else if (t < -b.half) t = -b.half
  const qx = rx - b.dx * t
  const qz = rz - b.dz * t
  return qx * qx + qz * qz
}

/** 점과 몸체 선분 사이 거리 */
export function bodyDist(px: number, pz: number, b: Body) {
  return Math.sqrt(bodyDist2(px, pz, b))
}

/**
 * 경로 앞쪽을 일정 간격으로 짚어 가며 처음 부딪히는 몸체를 찾는다.
 * front: 내 중심에서 앞 범퍼까지 거리, lateral: 왼쪽(+)으로 비켜 갈 때 옆으로 옮긴 거리
 */
export function scanAhead(self: Body, ahead: Ahead, grid: Grid, look: number, opts: { front: number; lateral?: number; ignore?: (b: Body) => boolean }): Scan {
  const lateral = opts.lateral ?? 0
  const near: Body[] = []
  const r = look + opts.front + 16
  const p0 = ahead(opts.front)
  // 진행 방향 뒤쪽에 있는 몸체는 볼 필요가 없다
  const fx = p0 ? p0.tx : self.dx
  const fz = p0 ? p0.tz : self.dz
  for (const b of grid.near(self.x, self.z, r, [])) {
    if (b.group === self.group) continue
    if (Math.abs(b.x - self.x) > r || Math.abs(b.z - self.z) > r) continue
    if ((b.x - self.x) * fx + (b.z - self.z) * fz < -(b.half + self.half + 2)) continue
    if (opts.ignore?.(b)) continue
    near.push(b)
  }
  if (!near.length) return { gap: Infinity, hit: null, graze: true }
  // 옆으로 스칠 여유 -0.1m: 2m 간격 단지 안 왕복 차로(밴 반폭 합 1.8m)에서도 마주 오는 차끼리 막지 않는다.
  // 겹침 판정(반폭 합 - 0.15m)보다는 넓어 실제로 맞닿지는 않는다
  const reach2 = near.map((b) => (self.w + b.w - 0.1) ** 2)
  const step = 1.5
  for (let s = 0; s <= look; s += step) {
    const p = ahead(opts.front + s)
    if (!p) break
    // 왼쪽 법선: 진행 방향 (tx, tz) → (tz, -tx)
    const px = p.x + p.tz * lateral
    const pz = p.z - p.tx * lateral
    for (let k = 0; k < near.length; k++) {
      if (bodyDist2(px, pz, near[k]) < reach2[k]) {
        // 걸린 몸체까지 경로를 더 짚어 가장 가까운 거리를 본다: 반폭 합보다 멀면 스치기만 한다
        const hit = near[k]
        const touch = (self.w + hit.w - 0.15) ** 2
        let graze = true
        for (let s2 = s; s2 <= s + 14; s2 += 1) {
          const q = ahead(opts.front + s2)
          if (!q) break
          if (bodyDist2(q.x + q.tz * lateral, q.z - q.tx * lateral, hit) < touch) {
            graze = false
            break
          }
        }
        return { gap: s, hit, graze }
      }
    }
  }
  return { gap: Infinity, hit: null, graze: true }
}

/** 직선 차로용 빠른 판정: 차로 중심선(z 고정, dir 방향) 앞쪽에서 처음 걸리는 몸체까지 거리 */
export function scanLine(self: Body, laneZ: number, dir: 1 | -1, front: number, look: number, grid: Grid): Scan {
  let gap = Infinity
  let hit: Body | null = null
  const x0 = self.x + dir * front
  for (const b of grid.near(self.x + dir * (front + look / 2), laneZ, look / 2 + 16, [])) {
    if (b.group === self.group) continue
    // 몸체 선분 양 끝
    const ax = b.x - b.dx * b.half
    const az = b.z - b.dz * b.half
    const bx = b.x + b.dx * b.half
    const bz = b.z + b.dz * b.half
    const reach = self.w + b.w - 0.1
    // 차로선과 가까운 구간의 x 범위
    const dz0 = Math.abs(az - laneZ)
    const dz1 = Math.abs(bz - laneZ)
    if (Math.min(dz0, dz1) > reach && Math.sign(az - laneZ) === Math.sign(bz - laneZ)) continue
    let lo: number
    let hi: number
    if (Math.abs(bz - az) < 1e-6) {
      lo = Math.min(ax, bx) - reach
      hi = Math.max(ax, bx) + reach
    } else {
      // 선분이 차로선에서 reach 이내인 매개변수 구간
      const t1 = (laneZ - reach - az) / (bz - az)
      const t2 = (laneZ + reach - az) / (bz - az)
      const ta = Math.max(0, Math.min(t1, t2))
      const tb = Math.min(1, Math.max(t1, t2))
      if (ta > tb) continue
      const xa = ax + (bx - ax) * ta
      const xb = ax + (bx - ax) * tb
      lo = Math.min(xa, xb) - reach
      hi = Math.max(xa, xb) + reach
    }
    const near = dir > 0 ? lo - x0 : x0 - hi
    const far = dir > 0 ? hi - x0 : x0 - lo
    if (far < 0 || near > look) continue
    const g = Math.max(0, near)
    if (g < gap) {
      gap = g
      hit = b
    }
  }
  return { gap, hit, graze: false }
}

/** 두 몸체(선분+반폭)가 겹치는지: 선분 사이 최소 거리 < 반폭 합 */
export function overlaps(a: Body, b: Body, slack = 0.15) {
  const r = a.w + b.w - slack
  if (Math.abs(a.x - b.x) > a.half + b.half + r || Math.abs(a.z - b.z) > a.half + b.half + r) return false
  // 선분-선분 거리: 끝점에서 상대 선분까지 거리의 최소(교차는 중심 거리로 보정)
  const ends = (s: Body) => [[s.x - s.dx * s.half, s.z - s.dz * s.half], [s.x + s.dx * s.half, s.z + s.dz * s.half], [s.x, s.z]]
  let d = Infinity
  for (const [x, z] of ends(a)) d = Math.min(d, bodyDist(x, z, b))
  for (const [x, z] of ends(b)) d = Math.min(d, bodyDist(x, z, a))
  return d < r
}

/** 앞까지 남은 거리로 낼 수 있는 속도: 제동 거리 안에서 멈추고, 1초 차간 간격을 지킨다 */
export function capFromGap(gap: number, minGap = 1.6) {
  if (!Number.isFinite(gap)) return Infinity
  const free = Math.max(0, gap - minGap)
  return Math.min(Math.sqrt(2 * 5 * free), free / 0.9)
}
