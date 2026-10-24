// 곤지암 메가허브 분류동: 투입 → ITS 스캐너 → 순환형 크로스벨트 소터 → 행선지 슈트·롤테이너.
// 스캐너가 못 읽은 상자는 리젝트 슈트로 빠지고, 리젝트 데스크에서 송장 문구를 AI가 판독해 재투입한다.
// 판독 결과를 어떻게 쓸지(재투입·수작업·이형물 라인)는 코드가 정한다.
import { mulberry32 } from './data'
import { REJECT_POOL } from './texts'
import { ai } from './ai'
import { L } from '../i18n'

export const HUB = { cx: -8, cz: -26, half: 12, r: 4, y: 1.0, carriers: 60, speed: 2.4, feedZ: -37, spurZ: -31.2, feedX0: -27.6 }
const SL = 2 * HUB.half
const ARC = Math.PI * HUB.r
export const LOOP_LEN = 2 * SL + 2 * ARC
export const SPACING = LOOP_LEN / HUB.carriers

export type Dest = 'IN' | 'DJ' | 'BS' | 'DG' | 'WJ' | 'GJ'
export const DESTS: Dest[] = ['IN', 'DJ', 'BS', 'DG', 'WJ', 'GJ']
export const DEST_LABEL: Record<Dest, string> = {
  IN: L('인천', 'Incheon'), DJ: L('대전', 'Daejeon'), BS: L('부산', 'Busan'), DG: L('대구', 'Daegu'), WJ: L('원주', 'Wonju'), GJ: L('곤지암 지역', 'Gonjiam area'),
}
const DEST_W = [0.3, 0.15, 0.15, 0.12, 0.08, 0.2]

/** 순환 루프 위 위치. s=0은 북쪽 직선 서쪽 끝, 북쪽 직선은 동쪽(+x)으로 흐른다. h는 진행 방향 각도((cos h, sin h) = (x, z)) */
export function loopPos(s: number) {
  s = ((s % LOOP_LEN) + LOOP_LEN) % LOOP_LEN
  const { cx, cz, half, r } = HUB
  if (s < SL) return { x: cx - half + s, z: cz - r, h: 0 }
  s -= SL
  if (s < ARC) {
    const a = s / r
    return { x: cx + half + r * Math.sin(a), z: cz - r * Math.cos(a), h: a }
  }
  s -= ARC
  if (s < SL) return { x: cx + half - s, z: cz + r, h: Math.PI }
  s -= SL
  const a = s / r
  return { x: cx - half - r * Math.sin(a), z: cz + r * Math.cos(a), h: Math.PI + a }
}
const sNorth = (x: number) => x - (HUB.cx - HUB.half)
const sSouth = (x: number) => SL + ARC + (HUB.cx + HUB.half - x)

export const INDUCT_X = [-18, -14, -10, -6]
export const REINDUCT_X = -1
export const SCAN_X = -3
export const REJECT_X = 2
export const CHUTE_X: Record<Dest, number> = { GJ: 3.5, WJ: -1, DG: -5.5, BS: -10, DJ: -14.5, IN: -19 }
export const CHUTE_END_Z = HUB.cz + HUB.r + 2.6
export const CAGE_Z = CHUTE_END_Z + 1.25
export const REJECT_END_Z = HUB.cz - HUB.r - 3.4
export const DESK = { x: 2, z: -35.2 }
export const IRREG = { x: 9.5, z: -39 }
/** 곤지암 지역 슈트 → 캐노피 배송 분류장으로 이어지는 반출 컨베이어 */
export const GJ_OUT: [number, number][] = [[3.5, CHUTE_END_Z + 0.4], [10.5, CHUTE_END_Z + 0.4], [10.5, -30], [14.4, -30]]
export const CAGE_CAP = 24
const FEED_SPEED = 1.6
const GAP = 0.8

export const FEED_PATHS: [number, number][][] = [
  ...INDUCT_X.map((x): [number, number][] => [[HUB.feedX0, HUB.feedZ], [x, HUB.feedZ], [x, HUB.spurZ]]),
  [[DESK.x - 0.9, DESK.z], [REINDUCT_X, DESK.z], [REINDUCT_X, HUB.spurZ]],
]

function polyLen(pts: [number, number][]) {
  let n = 0
  for (let i = 1; i < pts.length; i++) n += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  return n
}
export function along(pts: [number, number][], d: number): [number, number] {
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1]
    const [bx, bz] = pts[i]
    const l = Math.hypot(bx - ax, bz - az)
    if (d <= l) return [ax + ((bx - ax) * d) / l, az + ((bz - az) * d) / l]
    d -= l
  }
  return pts[pts.length - 1]
}
const FEED_LEN = FEED_PATHS.map(polyLen)
const OUT_LEN = polyLen(GJ_OUT)

export interface AddressFlags {
  terminal: string
  terminalConfidence: number
  incomplete: number
  fragile: number
  liquid: number
  perishable: number
  battery: number
  irregular: number
}

export interface HubParcel {
  id: number
  dest: Dest
  /** 소터가 알고 있는 행선지(스캔 전이거나 못 읽으면 null) */
  known: Dest | null
  scanned: boolean
  reject: { label: string; item: string; truth: string } | null
  ai: AddressFlags | null
  aiStatus: 'none' | 'pending' | 'ready' | 'error'
  sent: boolean
  phase: 'feed' | 'loop' | 'chute' | 'rejectq' | 'desk' | 'carry' | 'out'
  station: number
  d: number
  carrier: number
  x: number
  y: number
  z: number
  t: number
  from: [number, number, number]
  to: [number, number, number]
  dur: number
  tint: number
  size: number
  spin: number
}

export interface DeskLog {
  time: number
  label: string
  item: string
  decision: string
  tone: 'blue' | 'amber' | 'red' | 'gray'
  notes: string[]
  ai: AddressFlags | null
  correct: boolean | null
}

export class HubSorter {
  offset = 0
  carriers: (HubParcel | null)[] = Array.from({ length: HUB.carriers }, () => null)
  parcels: HubParcel[] = []
  queues: HubParcel[][] = FEED_PATHS.map(() => [])
  cages = DESTS.filter((d) => d !== 'GJ').map((d) => ({ dest: d, count: Math.floor((DESTS.indexOf(d) * 7) % CAGE_CAP), swap: 0 }))
  deskQ: HubParcel[] = []
  desk: { cur: HubParcel | null; t: number; doneAt: number; mode: 'idle' | 'ai' | 'ok' | 'manual' | 'irregular'; act: (() => void) | null } = { cur: null, t: 0, doneAt: 0, mode: 'idle', act: null }
  log: DeskLog[] = []
  stats = { inducted: 0, sorted: 0, byDest: { IN: 0, DJ: 0, BS: 0, DG: 0, WJ: 0, GJ: 0 } as Record<Dest, number>, rejects: 0, ai: 0, aiCorrect: 0, manual: 0, irregular: 0, hold: 0, recirc: 0, cages: 0 }
  rate = 0
  onReject: ((p: HubParcel) => void) | null = null
  private seq = 1
  private spawnT = 0
  private rateWin: { t: number; n: number }[] = []
  private time = 0
  private r = mulberry32(4242)

  constructor(private clock: () => number) {
    // 시작부터 바쁘게: 루프와 투입 라인을 반쯤 채워 둔다
    for (let c = 0; c < HUB.carriers; c += 2) {
      const p = this.make()
      if (p.reject) continue
      p.known = p.dest
      p.scanned = true
      p.phase = 'loop'
      p.carrier = c
      this.carriers[c] = p
      this.parcels.push(p)
    }
  }

  private make(): HubParcel {
    const r = this.r
    let x = r()
    let k = 0
    while (k < DEST_W.length - 1 && x > DEST_W[k]) x -= DEST_W[k++]
    const reject = r() < 0.045 ? REJECT_POOL[Math.floor(r() * REJECT_POOL.length)] : null
    const dest = reject && reject.truth !== 'unknown' ? (reject.truth as Dest) : DESTS[k]
    return {
      id: this.seq++, dest, known: null, scanned: false, reject, ai: null, aiStatus: 'none', sent: false,
      phase: 'feed', station: 0, d: 0, carrier: -1, x: HUB.feedX0, y: HUB.y + 0.3, z: HUB.feedZ, t: 0,
      from: [0, 0, 0], to: [0, 0, 0], dur: 1, tint: r(), size: 0.75 + r() * 0.5, spin: (r() - 0.5) * 0.5,
    }
  }

  /** 리젝트 송장을 아직 판독 요청하지 않았으면 보낸다 */
  screen(p: HubParcel) {
    if (!p.reject || p.sent || !this.onReject) return
    p.sent = true
    p.aiStatus = 'pending'
    this.onReject(p)
  }

  private moveTo(p: HubParcel, to: [number, number, number], dur: number, phase: HubParcel['phase']) {
    p.from = [p.x, p.y, p.z]
    p.to = to
    p.t = 0
    p.dur = dur
    p.phase = phase
  }

  step(dt: number) {
    this.time += dt
    const ds = HUB.speed * dt
    const prev = this.offset
    this.offset = (this.offset + ds) % LOOP_LEN

    this.spawnT -= dt
    if (this.spawnT <= 0 && this.parcels.length < 240) {
      this.spawnT = 0.55 + this.r() * 0.25
      const p = this.make()
      let best = 0
      for (let i = 1; i < INDUCT_X.length; i++) if (this.queues[i].length < this.queues[best].length) best = i
      if (this.queues[best].length < 7) {
        p.station = best
        this.queues[best].push(p)
        this.parcels.push(p)
      }
    }

    // 투입 라인: 앞 상자와 간격을 지키며 스퍼 끝까지
    this.queues.forEach((q, st) => {
      const len = FEED_LEN[st]
      q.forEach((p, k) => {
        p.d = Math.min(p.d + FEED_SPEED * dt, len - k * GAP)
        const [x, z] = along(FEED_PATHS[st], p.d)
        p.x = x
        p.z = z
        p.y = HUB.y + 0.28
      })
    })

    // 캐리어가 각 지점을 지날 때 일어나는 일
    const crossed = (sp: number, c: number) => {
      const s0 = prev + c * SPACING
      return (((sp - s0) % LOOP_LEN) + LOOP_LEN) % LOOP_LEN < ds
    }
    // 재투입 대기가 있으면 캐리어 세 개 중 하나는 비워서 보낸다(소터 제어기의 빈 캐리어 예약)
    const reserve = this.queues[FEED_PATHS.length - 1].length > 0
    for (let c = 0; c < HUB.carriers; c++) {
      let p = this.carriers[c]
      if (!p) {
        for (let st = 0; st < FEED_PATHS.length; st++) {
          if (reserve && c % 3 === 0 && st < INDUCT_X.length) continue
          const sx = st < INDUCT_X.length ? INDUCT_X[st] : REINDUCT_X
          const head = this.queues[st][0]
          if (head && head.d >= FEED_LEN[st] - 0.02 && crossed(sNorth(sx), c)) {
            this.queues[st].shift()
            head.phase = 'loop'
            head.carrier = c
            this.carriers[c] = head
            if (st < INDUCT_X.length) this.stats.inducted++
            p = head
            break
          }
        }
        if (!p) continue
      }
      if (!p.scanned && crossed(sNorth(SCAN_X), c)) {
        p.scanned = true
        if (p.reject) {
          this.stats.rejects++
          this.screen(p)
        } else p.known = p.dest
      }
      if (p.scanned && !p.known && crossed(sNorth(REJECT_X), c)) {
        this.carriers[c] = null
        const pos = loopPos(prev + c * SPACING + ds)
        p.x = pos.x
        p.z = pos.z
        this.moveTo(p, [REJECT_X + (this.r() - 0.5) * 0.5, 0.95, REJECT_END_Z], 0.8, 'chute')
        continue
      }
      if (p.known && crossed(sSouth(CHUTE_X[p.known]), c)) {
        const cage = this.cages.find((g) => g.dest === p.known)
        if (cage && cage.swap > 0) {
          this.stats.recirc++
          continue
        }
        this.carriers[c] = null
        const pos = loopPos(prev + c * SPACING + ds)
        p.x = pos.x
        p.z = pos.z
        this.moveTo(p, [CHUTE_X[p.known] + (this.r() - 0.5) * 0.4, 0.62, CHUTE_END_Z], 0.7, 'chute')
      }
    }

    // 캐리어 위 상자 위치
    for (let c = 0; c < HUB.carriers; c++) {
      const p = this.carriers[c]
      if (!p) continue
      const pos = loopPos(this.offset + c * SPACING)
      p.x = pos.x
      p.z = pos.z
      p.y = HUB.y + 0.34
    }

    // 슈트·데스크·운반
    const keep: HubParcel[] = []
    for (const p of this.parcels) {
      if (p.phase === 'chute' || p.phase === 'carry') {
        p.t += dt / p.dur
        const k = Math.min(1, p.t)
        p.x = p.from[0] + (p.to[0] - p.from[0]) * k
        p.y = p.from[1] + (p.to[1] - p.from[1]) * k + (p.phase === 'carry' ? 0.25 * Math.sin(Math.PI * k) : 0)
        p.z = p.from[2] + (p.to[2] - p.from[2]) * k
        if (k >= 1) {
          if (p.phase === 'carry') continue
          if (!p.known) {
            p.phase = 'rejectq'
            this.deskQ.push(p)
          } else if (p.known === 'GJ') {
            p.phase = 'out'
            p.d = 0
            this.sorted(p.known)
          } else {
            const cage = this.cages.find((g) => g.dest === p.known)!
            cage.count++
            if (cage.count >= CAGE_CAP) {
              cage.swap = 5
              this.stats.cages++
            }
            this.sorted(p.known)
            continue
          }
        }
      } else if (p.phase === 'out') {
        p.d += dt * 2.4
        if (p.d >= OUT_LEN) continue
        const [x, z] = along(GJ_OUT, p.d)
        p.x = x
        p.z = z
        p.y = 0.95
      }
      keep.push(p)
    }
    this.parcels = keep
    this.deskQ.forEach((p, i) => {
      p.x = REJECT_X - 0.6 + (i % 3) * 0.55
      p.z = REJECT_END_Z - 0.3 - Math.floor(i / 3) * 0.45
      p.y = 0.95 + Math.floor(i / 6) * 0.35
    })
    this.cages.forEach((g) => {
      if (g.swap > 0) {
        g.swap -= dt
        if (g.swap <= 0) {
          g.swap = 0
          g.count = 0
        }
      }
    })
    this.stepDesk(dt)
    if (this.time - (this.rateWin[this.rateWin.length - 1]?.t ?? -99) > 30) {
      this.rateWin.push({ t: this.time, n: this.stats.sorted })
      if (this.rateWin.length > 8) this.rateWin.shift()
      const a = this.rateWin[0]
      const b = this.rateWin[this.rateWin.length - 1]
      // 상자 1개 = 실제 상자 여러 개를 묶은 표시 단위(6개)
      this.rate = b.t > a.t ? Math.round(((b.n - a.n) / (b.t - a.t)) * 3600 * 6) : 0
    }
  }

  private sorted(d: Dest) {
    this.stats.sorted++
    this.stats.byDest[d]++
  }

  // ───────────────────────── 리젝트 데스크

  private stepDesk(dt: number) {
    const D = this.desk
    if (!D.cur) {
      const p = this.deskQ.shift()
      if (!p) {
        D.mode = 'idle'
        return
      }
      this.screen(p)
      D.cur = p
      D.t = 0
      D.doneAt = 0
      D.act = null
      D.mode = 'ai'
      p.phase = 'desk'
      p.x = DESK.x
      p.y = 1.12
      p.z = DESK.z + 0.35
      return
    }
    const p = D.cur
    D.t += dt
    if (!D.act) {
      const waiting = p.aiStatus === 'pending' && D.t < 6
      if (D.t < 2 || waiting) return
      this.decide(p)
      return
    }
    if (D.t >= D.doneAt) {
      D.act()
      D.cur = null
      D.act = null
    }
  }

  private decide(p: HubParcel) {
    const D = this.desk
    const a = p.ai
    const rej = p.reject!
    const notes: string[] = []
    if (a) {
      if (a.battery > 0.6) notes.push(L('리튬·위험물 표기', 'Lithium / DG label'))
      if (a.fragile > 0.6) notes.push(L('취급주의 스티커', 'Fragile sticker'))
      if (a.perishable > 0.6) notes.push(L('신선 우선 상차', 'Load fresh first'))
      if (a.liquid > 0.6) notes.push(L('누액 방지 봉투', 'Leak-proof bag'))
    }
    const entry = (decision: string, tone: DeskLog['tone'], correct: boolean | null) => {
      this.log.unshift({ time: this.clock(), label: rej.label, item: rej.item, decision, tone, notes, ai: a, correct })
      if (this.log.length > 12) this.log.pop()
    }
    if (a && a.irregular > 0.7) {
      // 컨베이어에 못 태우는 이형물: 사람이 이형물 라인으로 옮긴다
      D.mode = 'irregular'
      D.doneAt = D.t + 2.5
      this.stats.irregular++
      const to = a.terminal in DEST_LABEL ? DEST_LABEL[a.terminal as Dest] : L('행선지 확인', 'check destination')
      entry(L(`이형물 라인 → ${to}`, `Irregular line → ${to}`), 'amber', a.terminal === rej.truth)
      D.act = () => this.moveTo(p, [IRREG.x + (this.r() - 0.5) * 2, 0.5, IRREG.z + (this.r() - 0.5) * 1.5], 2.2, 'carry')
      return
    }
    if (a && a.terminal !== 'unknown' && a.terminalConfidence >= 0.6 && a.terminal in DEST_LABEL) {
      const t = a.terminal as Dest
      if (a.incomplete > 0.6) notes.push(L('호수 확인 → 배송 기사 통화', 'Unit no. check → call delivery driver'))
      D.mode = 'ok'
      D.doneAt = D.t + 1.2
      this.stats.ai++
      if (t === rej.truth) this.stats.aiCorrect++
      entry(L(`재투입 → ${DEST_LABEL[t]} 슈트`, `Re-induct → ${DEST_LABEL[t]} chute`), 'blue', t === rej.truth)
      D.act = () => this.reinduct(p, t)
      return
    }
    // 신뢰도가 낮거나 판독 실패: 사람이 송장 원본·주문 정보를 조회해 직접 입력
    D.mode = 'manual'
    D.doneAt = D.t + 9
    if (rej.truth === 'unknown') {
      this.stats.hold++
      entry(L('주소 불명 → 고객 확인 보류', 'Unknown address → hold for customer check'), 'red', a ? a.terminal === 'unknown' : null)
      D.act = () => this.moveTo(p, [DESK.x + 1.6, 0.6, DESK.z - 0.6], 1.2, 'carry')
      return
    }
    this.stats.manual++
    const why = a ? L(` (AI 신뢰도 ${Math.round(a.terminalConfidence * 100)}%)`, ` (AI confidence ${Math.round(a.terminalConfidence * 100)}%)`) : p.sent ? L(' (판독 지연)', ' (reading delayed)') : ai.on ? L(' (AI 연결 전)', ' (AI not connected yet)') : L(' (AI 꺼짐)', ' (AI off)')
    entry(L(`수작업 입력 → ${DEST_LABEL[rej.truth as Dest]}${why}`, `Manual entry → ${DEST_LABEL[rej.truth as Dest]}${why}`), 'gray', null)
    D.act = () => this.reinduct(p, rej.truth as Dest)
  }

  private reinduct(p: HubParcel, d: Dest) {
    p.known = d
    p.phase = 'feed'
    p.station = FEED_PATHS.length - 1
    p.d = 0
    this.queues[p.station].push(p)
  }
}
