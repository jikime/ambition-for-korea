export interface V2 {
  x: number
  z: number
}

export const v2 = (x: number, z: number): V2 => ({ x, z })
const dist = (a: V2, b: V2) => Math.hypot(b.x - a.x, b.z - a.z)
const lerp = (a: V2, b: V2, t: number): V2 => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })

/** 꺾인 점들을 반지름 r의 곡선으로 다듬는다(2차 베지어). */
function fillet(p: V2[], r: number): V2[] {
  const pts = dedupe(p)
  if (pts.length < 3 || r <= 0) return pts
  const out: V2[] = [pts[0]]
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const c = pts[i + 1]
    const l1 = dist(a, b)
    const l2 = dist(b, c)
    const rr = Math.min(r, l1 / 2, l2 / 2)
    const p1 = lerp(b, a, rr / l1)
    const p2 = lerp(b, c, rr / l2)
    const steps = 10
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      const u = 1 - t
      out.push({
        x: u * u * p1.x + 2 * u * t * b.x + t * t * p2.x,
        z: u * u * p1.z + 2 * u * t * b.z + t * t * p2.z,
      })
    }
  }
  out.push(pts[pts.length - 1])
  return dedupe(out)
}

function dedupe(p: V2[]) {
  const out: V2[] = []
  for (const q of p) if (!out.length || dist(out[out.length - 1], q) > 0.05) out.push(q)
  return out
}

/** 호 길이로 위치·접선을 찾는 경로. */
export class Path {
  pts: V2[]
  cum: number[]
  length: number

  constructor(control: V2[], radius = 4) {
    this.pts = fillet(control, radius)
    this.cum = [0]
    for (let i = 1; i < this.pts.length; i++) this.cum.push(this.cum[i - 1] + dist(this.pts[i - 1], this.pts[i]))
    this.length = this.cum[this.cum.length - 1] ?? 0
  }

  at(d: number) {
    const pts = this.pts
    if (pts.length === 1) return { x: pts[0].x, z: pts[0].z, tx: 0, tz: 1 }
    const dd = Math.max(0, Math.min(this.length, d))
    let lo = 0
    let hi = this.cum.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (this.cum[mid] <= dd) lo = mid
      else hi = mid
    }
    const seg = this.cum[hi] - this.cum[lo] || 1
    const t = (dd - this.cum[lo]) / seg
    const a = pts[lo]
    const b = pts[hi]
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, tx: (b.x - a.x) / seg, tz: (b.z - a.z) / seg }
  }

  pointsFrom(d: number) {
    const out: V2[] = []
    const p = this.at(d)
    out.push({ x: p.x, z: p.z })
    for (let i = 0; i < this.pts.length; i++) if (this.cum[i] > d) out.push(this.pts[i])
    return out
  }
}

export interface Leg {
  path: Path
  reverse: boolean
  speed: number
  kmh: number
  tag?: string
}

export const leg = (pts: V2[], o: { reverse?: boolean; speed?: number; kmh?: number; r?: number; tag?: string } = {}): Leg => ({
  path: new Path(pts, o.r ?? 5),
  reverse: o.reverse ?? false,
  speed: o.speed ?? 5,
  kmh: o.kmh ?? 20,
  tag: o.tag,
})

const ACCEL = 5
const DECEL = 3.2

/** 여러 구간(전진/후진)을 순서대로 따라가는 이동체. 가속·감속을 부드럽게 처리한다. */
export class Route {
  i = 0
  d = 0
  vel = 0
  done = false
  moved = 0
  legs: Leg[]

  constructor(legs: Leg[]) {
    this.legs = legs.filter((l) => l.path.length > 0.01)
    if (!this.legs.length) this.done = true
  }

  get leg() {
    return this.legs[Math.min(this.i, this.legs.length - 1)]
  }

  /** 앞으로의 구간 제한속도와 정지점(경로 끝·전후진 전환)을 보고 목표 속도를 정한다 */
  private target() {
    const L = this.leg
    let limit = L.speed
    let dist = L.path.length - this.d
    for (let k = this.i + 1; k < this.legs.length; k++) {
      const n = this.legs[k]
      if (n.reverse !== L.reverse) break
      limit = Math.min(limit, Math.sqrt(2 * DECEL * dist + n.speed * n.speed))
      dist += n.path.length
    }
    return Math.min(limit, Math.sqrt(2 * DECEL * Math.max(0, dist)) + 0.25)
  }

  /** 지금 위치에서 진행 방향으로 s만큼 앞 지점(전진/후진이 바뀌는 곳이나 경로 끝을 넘으면 null) */
  peek(s: number): { x: number; z: number; tx: number; tz: number } | null {
    if (this.done) return null
    const rev = this.leg.reverse
    let i = this.i
    let d = this.d + s
    while (i < this.legs.length) {
      const L = this.legs[i]
      if (L.reverse !== rev) return null
      if (d <= L.path.length) {
        const p = L.path.at(d)
        return L.reverse ? { x: p.x, z: p.z, tx: -p.tx, tz: -p.tz } : p
      }
      d -= L.path.length
      i++
    }
    return null
  }

  /** cap: 앞 차량·보행자 때문에 낼 수 있는 최고 속도(충돌 회피가 정한다) */
  step(dt: number, cap = Infinity) {
    if (this.done) return 0
    const t = Math.min(this.target(), cap)
    this.vel = this.vel < t ? Math.min(t, this.vel + ACCEL * dt) : t
    let ds = this.vel * dt
    this.moved = ds
    while (ds > 0 && !this.done) {
      const len = this.leg.path.length
      if (this.d + ds < len) {
        this.d += ds
        ds = 0
      } else {
        ds -= len - this.d
        const flip = this.i + 1 < this.legs.length && this.legs[this.i + 1].reverse !== this.leg.reverse
        if (this.i + 1 >= this.legs.length) {
          this.d = len
          this.done = true
          this.vel = 0
        } else {
          this.i++
          this.d = 0
          if (flip) {
            this.vel = 0
            ds = 0
          }
        }
      }
    }
    return this.moved
  }

  pose() {
    const L = this.leg
    const p = L.path.at(this.d)
    const tx = L.reverse ? -p.tx : p.tx
    const tz = L.reverse ? -p.tz : p.tz
    return { x: p.x, z: p.z, heading: Math.atan2(tx, tz), reverse: L.reverse }
  }

  get speedKmh() {
    if (this.done) return 0
    return Math.round((this.vel / this.leg.speed) * this.leg.kmh)
  }

  remaining() {
    let s = this.leg.path.length - this.d
    for (let k = this.i + 1; k < this.legs.length; k++) s += this.legs[k].path.length
    return s
  }

  remainingTime() {
    let t = (this.leg.path.length - this.d) / this.leg.speed
    for (let k = this.i + 1; k < this.legs.length; k++) t += this.legs[k].path.length / this.legs[k].speed
    return t
  }

  /** 지금 구간부터 같은 방향(전진/후진)으로 이어지는 남은 점들 */
  runPoints() {
    const rev = this.leg.reverse
    const out = this.leg.path.pointsFrom(this.d)
    for (let k = this.i + 1; k < this.legs.length && this.legs[k].reverse === rev; k++) out.push(...this.legs[k].path.pts)
    return out
  }

  remainingPoints() {
    const out = this.leg.path.pointsFrom(this.d)
    for (let k = this.i + 1; k < this.legs.length; k++) out.push(...this.legs[k].path.pts)
    return out
  }
}

export function angleLerp(a: number, b: number, t: number) {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}
