// 내륙 컨테이너 화물선(40ft 6개 = 12TEU): 북쪽 계곡 상류 내륙 부두(화면 밖)와 대전 강변 부두(sim/river.ts WHARF)를 오간다.
// 다리가 모두 지면 높이라 곤지암 철송선 철교(z −100) 북쪽에서만 다닌다.
//  away(상류 부두, 보이지 않음) → down(하류로) → turn(정박지에서 제자리 180°) → berth(안벽으로 옆걸음)
//  → moored(하역 6 · 선적 6) → unberth → up(상류로) → away
// 위치·방향은 매 단계 결정론적으로 계산한다(난수 없음).
import { RIVER_LINE, WHARF } from './river'
import { L } from '../i18n'

export type BargeState = 'away' | 'down' | 'turn' | 'berth' | 'moored' | 'unberth' | 'up'

export const BARGE = {
  len: 46,
  beam: 9.5,
  /** 최고 속도(m/s, 약 20km/h) */
  vmax: 5.5,
  accel: 0.22,
  teu: 12,
  /** 40ft 컨테이너 수 */
  boxes: 6,
  /** 단계별 시간(초) */
  awayT: 70,
  turnT: 48,
  berthT: 22,
  moorT: 110,
  unberthT: 18,
  /** 상류 끝(계곡 안, 여기서 사라지고 나타난다) */
  topZ: -1600,
}

export const BARGE_STATE: Record<BargeState, string> = {
  away: L('상류 내륙 부두 정박', 'At the upstream inland wharf'),
  down: L('하류로 운항 · 대전 강변 부두행', 'Sailing downstream · to Daejeon River Wharf'),
  turn: L('정박지에서 선회', 'Turning in the basin'),
  berth: L('접안 중', 'Berthing'),
  moored: L('접안 · 하역 · 선적', 'Moored · unloading · loading'),
  unberth: L('이안 중', 'Unberthing'),
  up: L('상류로 운항 · 내륙 부두행', 'Sailing upstream · to the inland wharf'),
}

/** 운항 경로(상류 끝 → 강 중심선 → 정박지 입구 → 선회점), 호 길이로 */
const PATH: { x: number; z: number; s: number }[] = (() => {
  const pts: [number, number][] = RIVER_LINE.filter(([, z]) => z >= BARGE.topZ && z <= WHARF.entry.z - 45)
  pts.push([WHARF.entry.x, WHARF.entry.z], [WHARF.pivot.x, WHARF.pivot.z])
  let s = 0
  return pts.map(([x, z], i) => {
    if (i) s += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1])
    return { x, z, s }
  })
})()
export const BARGE_PATH_LEN = PATH[PATH.length - 1].s

/** 경로 위 s의 자리와 진행 방향(하류 쪽) */
function along(s: number) {
  const c = Math.max(0, Math.min(BARGE_PATH_LEN, s))
  let i = 1
  while (i < PATH.length - 1 && PATH[i].s < c) i++
  const a = PATH[i - 1]
  const b = PATH[i]
  const u = (c - a.s) / Math.max(1e-6, b.s - a.s)
  return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, heading: Math.atan2(b.x - a.x, b.z - a.z) }
}

const smooth = (t: number) => t * t * (3 - 2 * t)
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

export class Barge {
  readonly id = 'RB-01'
  readonly name = L('다온 리버 1호', 'Daon River 1')
  state: BargeState = 'moored'
  /** 경로 위치(m, 상류 끝 0 → 선회점) */
  s = BARGE_PATH_LEN
  x = WHARF.berth.x
  z = WHARF.berth.z
  heading = Math.PI
  /** 속도(m/s) */
  v = 0
  /** 지금 단계에서 지난 시간. 시뮬레이션은 시작할 때 150초를 미리 돌리므로, 첫 화면에서 접안해 막 하역을 시작하도록 그만큼 당겨 둔다 */
  t = -140
  /** 오늘 운항 · 처리 */
  trips = 3
  handled = 36

  get visible() {
    return this.state !== 'away'
  }
  /** 하역·선적 진행(0~1, 접안 중에만) */
  get work() {
    return this.state === 'moored' ? Math.min(1, Math.max(0, this.t) / BARGE.moorT) : 0
  }
  /** 다음 도착까지 남은 시간(초, 대략) */
  get eta() {
    const B = BARGE
    const sail = BARGE_PATH_LEN / (B.vmax * 0.92)
    switch (this.state) {
      case 'away': return B.awayT - this.t + sail
      case 'down': return (BARGE_PATH_LEN - this.s) / Math.max(1.5, this.v) + B.turnT + B.berthT
      case 'turn': return B.turnT - this.t + B.berthT
      case 'berth': return B.berthT - this.t
      case 'moored': return B.moorT - this.t + B.unberthT + sail
      case 'unberth': return B.unberthT - this.t + sail
      case 'up': return this.s / Math.max(1.5, this.v)
    }
  }

  private go(next: BargeState) {
    this.state = next
    this.t = 0
  }

  /** 가속하며 가다가 끝에서 멈추게(남은 거리로 감속) */
  private sail(dt: number, remaining: number) {
    const brake = Math.sqrt(2 * BARGE.accel * Math.max(0, remaining)) + 0.25
    this.v = Math.min(BARGE.vmax, brake, this.v + BARGE.accel * dt)
    return this.v * dt
  }

  private face(target: number, dt: number) {
    this.heading = wrap(this.heading + wrap(target - this.heading) * Math.min(1, dt * 1.2))
  }

  step(dt: number) {
    const B = BARGE
    const W = WHARF
    this.t += dt
    switch (this.state) {
      case 'away':
        this.v = 0
        if (this.t >= B.awayT) {
          this.s = 0
          const p = along(0)
          this.x = p.x
          this.z = p.z
          this.heading = p.heading
          this.go('down')
        }
        break
      case 'down': {
        this.s = Math.min(BARGE_PATH_LEN, this.s + this.sail(dt, BARGE_PATH_LEN - this.s))
        const p = along(this.s)
        this.x = p.x
        this.z = p.z
        this.face(p.heading, dt)
        if (this.s >= BARGE_PATH_LEN - 0.05) {
          this.v = 0
          this.go('turn')
        }
        break
      }
      case 'turn': {
        // 하류를 보던 배를 제자리에서 상류 쪽으로(시계 방향 반 바퀴)
        const k = smooth(Math.min(1, this.t / B.turnT))
        this.x = W.pivot.x
        this.z = W.pivot.z
        this.heading = wrap(k * Math.PI)
        this.v = 0
        if (this.t >= B.turnT) {
          this.heading = Math.PI
          this.go('berth')
        }
        break
      }
      case 'berth': {
        const k = smooth(Math.min(1, this.t / B.berthT))
        this.x = W.pivot.x + (W.berth.x - W.pivot.x) * k
        this.z = W.pivot.z
        this.heading = Math.PI
        this.v = 0
        if (this.t >= B.berthT) this.go('moored')
        break
      }
      case 'moored':
        this.x = W.berth.x
        this.z = W.berth.z
        this.heading = Math.PI
        this.v = 0
        if (this.t >= B.moorT) {
          this.handled += B.boxes * 2
          this.go('unberth')
        }
        break
      case 'unberth': {
        const k = smooth(Math.min(1, this.t / B.unberthT))
        this.x = W.berth.x + (W.pivot.x - W.berth.x) * k
        this.z = W.pivot.z
        this.heading = Math.PI
        if (this.t >= B.unberthT) {
          this.s = BARGE_PATH_LEN
          this.go('up')
        }
        break
      }
      case 'up': {
        this.s = Math.max(0, this.s - this.sail(dt, this.s))
        const p = along(this.s)
        this.x = p.x
        this.z = p.z
        this.face(p.heading + Math.PI, dt)
        if (this.s <= 0.05) {
          this.trips++
          this.go('away')
        }
        break
      }
    }
  }
}
