// 이천 FC 포장 뒤 슬라이딩 슈 분류기. 피킹 스테이션 컨베이어(z −24)에서 서쪽 끝으로 모인 상자가 봉함기를 지나
// 분류기(z −19.6)를 동쪽으로 흐르고, 출고 라인(417·443·469) 앞에서 슈가 옆으로 밀어 롤러 슈트로 내려보낸다.
// 슈트 끝 적재 자리에 상자가 PER개 쌓이면 출고 라인 파렛트 1개가 된다(sim.stepIcLines가 take()로 가져감).
// 화면 상자 1개는 실제 택배 여러 개를 묶은 단위다.
import { IC } from './sites'

export const ICS = {
  /** 투입(봉함기) 벨트: x 고정, z inZ0 → z */
  inX: 394.5,
  inZ0: -23.4,
  /** 분류기 벨트 */
  z: -19.6,
  x0: 393.6,
  x1: 476,
  y: 0.95,
  /** 슈트 끝(파렛트 적재 자리 바로 뒤) */
  chuteZ1: -17.0,
  chuteY1: 0.62,
  speed: 2.2,
  chuteSpeed: 1.5,
  /** 파렛트 1개 = 상자 8개(2×2 두 단) */
  PER: 8,
  /** 슈트 끝에 줄 서서 기다릴 수 있는 상자 수와 간격 */
  QMAX: 5,
  QSTEP: 0.5,
  /** 적재 자리(라인 머리) z: 파렛트가 생기는 곳 */
  headZ: -15.8,
}

export interface SortBox {
  id: number
  x: number
  y: number
  z: number
  line: number
  /** 0 투입 벨트 · 1 분류기 · 2 슈트 */
  stage: 0 | 1 | 2
  tint: number
  /** 슈가 미는 중(0~1): 화면에서 상자를 살짝 돌린다 */
  push: number
}

/** 분류기가 매 스텝 받는 현장 상황 */
export interface SortNeed {
  /** 피킹 중인 스테이션 수(0~4) */
  busy: number
  /** 상차할 윙바디 몫보다 모자란 파렛트 수(>0이면 그 차 몫 주문을 먼저 내보낸다: 웨이브 릴리스) */
  deficit: number
  /** 라인별 올라가 있는 파렛트 수 */
  pallets: number[]
  /** 라인별 적재 자리가 비었나(앞 파렛트가 떠났나) */
  headClear: boolean[]
}

export class IcSorter {
  boxes: SortBox[] = []
  /** 오늘 누적(시작 시점 값은 예시) */
  total = 12840
  perLine = [0, 0, 0]
  /** 라인별 슈트 끝에 모인 상자(적재 자리 + 줄 선 것) */
  build = IC.lines.map(() => ICS.PER)
  /** 라인별 적재 자리가 비었나(화면: 쌓는 중인 파렛트를 보여 줄지) */
  headClear = IC.lines.map(() => true)
  /** 지금 웨이브 릴리스(빠른 투입) 중인가 */
  rush = false
  private seq = 0
  private gap = 0
  private rnd = 12345

  private rand() {
    this.rnd = (this.rnd * 9301 + 49297) % 233280
    return this.rnd / 233280
  }

  get onBelt() {
    return this.boxes.length
  }

  /** 적재 자리에 보이는 상자 수 / 슈트 끝에 줄 선 상자 수 */
  stackOf(k: number) {
    return this.headClear[k] ? Math.min(this.build[k], ICS.PER) : 0
  }
  queueOf(k: number) {
    return Math.min(ICS.QMAX, this.build[k] - this.stackOf(k))
  }

  /** 라인 k의 적재가 끝났나(파렛트로 만들 수 있나) */
  ready(k: number) {
    return this.headClear[k] && this.build[k] >= ICS.PER
  }

  /** 다 쌓인 상자 PER개를 파렛트로 가져간다 */
  take(k: number) {
    this.build[k] -= ICS.PER
    // 새 파렛트가 적재 자리를 차지했다(다음 스텝에 라인 상태로 다시 계산)
    this.headClear[k] = false
  }

  private cap(k: number) {
    return (this.headClear[k] ? ICS.PER : 0) + ICS.QMAX
  }

  /** 다음 상자를 보낼 라인: 빈 자리가 있고, 쌓인 것 + 오는 중 + 라인 파렛트가 가장 적은 라인 */
  private route(need: SortNeed, inflight: number[]) {
    let best = -1
    let bestLevel = Infinity
    IC.lines.forEach((_, k) => {
      if (this.cap(k) - this.build[k] - inflight[k] <= 0) return
      const level = this.build[k] + inflight[k] + need.pallets[k] * ICS.PER
      if (level < bestLevel) {
        bestLevel = level
        best = k
      }
    })
    return best
  }

  step(dt: number, need: SortNeed) {
    this.headClear = need.headClear
    this.rush = need.deficit > 0
    const inflight = IC.lines.map(() => 0)
    for (const b of this.boxes) inflight[b.line]++

    this.gap -= dt
    const last = this.boxes[this.boxes.length - 1]
    const clear = !last || last.stage !== 0 || last.z - ICS.inZ0 > 1.1
    if (this.gap <= 0 && clear && this.boxes.length < 60) {
      const line = this.route(need, inflight)
      if (line < 0) {
        // 모든 슈트가 꽉 참: 잠깐 투입을 멈춘다
        this.gap = 0.3
      } else {
        this.gap = this.rush ? 0.55 + this.rand() * 0.1 : need.busy > 0 ? 1.4 / Math.min(4, need.busy) + this.rand() * 0.3 : 1.9
        this.boxes.push({ id: ++this.seq, x: ICS.inX, y: ICS.y, z: ICS.inZ0, line, stage: 0, tint: Math.floor(this.rand() * 4), push: 0 })
        inflight[line]++
      }
    }

    for (const b of this.boxes) {
      if (b.stage === 0) {
        b.z += ICS.speed * dt
        if (b.z >= ICS.z) {
          b.x += b.z - ICS.z
          b.z = ICS.z
          b.stage = 1
        }
      } else if (b.stage === 1) {
        const tx = IC.lines[b.line]
        b.x += ICS.speed * dt
        if (b.x >= tx - 0.7) b.push = Math.min(1, (b.x - (tx - 0.7)) / 0.7)
        if (b.x >= tx) {
          b.x = tx
          b.stage = 2
          b.z += 0.6
        }
      } else {
        b.z += ICS.chuteSpeed * dt
        const t = (b.z - ICS.z) / (ICS.chuteZ1 - ICS.z)
        b.y = ICS.y + (ICS.chuteY1 - ICS.y) * Math.min(1, t)
        b.push = Math.max(0, 1 - t)
      }
    }
    // 슈트 끝(줄 선 상자 뒤)에 닿은 상자는 적재 자리로
    const before = this.boxes.length
    this.boxes = this.boxes.filter((b) => {
      if (b.stage !== 2) return true
      const stop = ICS.chuteZ1 - 0.25 - this.queueOf(b.line) * ICS.QSTEP
      if (b.z < stop) return true
      this.build[b.line]++
      this.perLine[b.line]++
      return false
    })
    this.total += before - this.boxes.length
  }
}
