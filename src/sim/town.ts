// 다온마을 생활 물류 상태: 배송 결과가 동네에 남긴 흔적.
//  - 문 앞·경비실 택배 더미: 기사가 맡기면 늘고, 주민이 가져가면 준다
//  - 무인택배함 칸: 맡기면 차고(빨강), 주민이 찾아가면 빈다(초록)
//  - 편의점 택배 접수: 주민이 보낼 상자를 맡기면 쌓이고, 배송차가 편의점에 들르면 수거해 간다
//  - 분리수거장 골판지: 택배 상자를 뜯은 만큼 쌓이고, 수거차가 오면 비워진다
// 화면은 src/three/entities/TownLife.tsx. 시뮬레이션 전역 난수(r)는 쓰지 않는다(차량 흐름이 그대로 유지되게).
import type { DropMode } from './sim'
import { STOPS } from './sites'

export const PILE_CAP = 8
/** 무인택배함 한 대의 칸 수(화면 텍스처의 칸과 같다) */
export const LOCKER_CELLS = 27
/** 동별 무인택배함이 있는 정차지 + 관리동 */
export const LOCKER_IDS = ['A101', 'A102', 'A103', 'A104', 'A105', 'A106', 'LOCK']
export const RECYCLE_IDS = ['R1', 'R2', 'R3']
/** 분리수거장 자리(동 사이 빈터) */
export const RECYCLE_SPOTS: Record<string, [number, number]> = { R1: [-460, 116], R2: [-512, 186], R3: [-423, 186] }

export class TownLife {
  piles: Record<string, { door: number; guard: number }> = {}
  lockers: Record<string, number> = {}
  /** 편의점에 맡겨진 보낼 상자 */
  storeDrop = 4
  /** 분리수거장 골판지 높이(0~1) */
  recycle: Record<string, number> = { R1: 0.45, R2: 0.25, R3: 0.65 }
  stats = { pickedUp: 0, lockerOut: 0, sent: 0, collected: 0 }
  private rnd = 20251005

  constructor() {
    for (const id of Object.keys(STOPS)) {
      this.piles[id] = { door: id === 'LOCK' || id === 'STORE' ? 0 : this.int(1, 5), guard: STOPS[id].guard ? this.int(1, 5) : 0 }
    }
    for (const id of LOCKER_IDS) this.lockers[id] = this.int(10, 20)
  }

  private rand() {
    this.rnd = (this.rnd * 1103515245 + 12345) % 2147483648
    return this.rnd / 2147483648
  }
  private int(a: number, b: number) {
    return a + Math.floor(this.rand() * (b - a + 1))
  }

  /** 기사가 정차지에 도착해 상자를 맡겼다 */
  onDrop(stopId: string, mode: DropMode) {
    const p = this.piles[stopId]
    if (!p) return
    const k = 1 + Math.floor(this.rand() * 2)
    if (stopId === 'LOCK' || mode === 'locker') {
      // 동 무인택배함이 있으면 그 함, 없으면(관리동 정차) 관리동 함
      const id = stopId in this.lockers ? stopId : 'LOCK'
      this.lockers[id] = Math.min(LOCKER_CELLS, this.lockers[id] + 2)
    } else if (mode === 'guard') p.guard = Math.min(PILE_CAP, p.guard + k)
    else if (mode === 'door' || mode === 'confirm') p.door = Math.min(PILE_CAP, p.door + k)
    if (stopId === 'STORE') {
      // 배송차가 편의점에 들르면 맡겨진 보낼 상자를 수거한다
      this.stats.sent += this.storeDrop
      this.storeDrop = 0
    }
  }

  /** 주민 행동 타이머: 더미 수령 · 택배함 수령 · 편의점 맡김(배송차가 정차지에 들르는 간격과 비슷하게 맞춤) */
  private tPile = 6
  private tLocker = 4
  private tStore = 12

  step(dt: number) {
    this.tPile -= dt
    this.tLocker -= dt
    this.tStore -= dt
    if (this.tPile <= 0) {
      // 주민이 문 앞·경비실 상자를 가져감 → 상자를 뜯어 분리수거장에 골판지가 쌓임
      // 쌓인 상자가 많을수록 집에 온 주민이 많아 자주 가져간다(평형 약 20~35개)
      const total = Object.values(this.piles).reduce((n, p) => n + p.door + p.guard, 0)
      this.tPile = ((14 + this.rand() * 16) * 12) / Math.max(12, total)
      const ids = Object.keys(this.piles).filter((id) => this.piles[id].door + this.piles[id].guard > 0)
      if (ids.length) {
        const p = this.piles[ids[Math.floor(this.rand() * ids.length)]]
        if (p.door > 0 && (p.guard === 0 || this.rand() < 0.6)) p.door--
        else p.guard--
        this.stats.pickedUp++
        this.addCardboard()
      }
    }
    if (this.tLocker <= 0) {
      // 무인택배함에서 찾아감
      const filled = LOCKER_IDS.reduce((n, id) => n + this.lockers[id], 0)
      this.tLocker = ((9 + this.rand() * 12) * 40) / Math.max(20, filled)
      // 택배함은 늘 어느 정도 차 있다(낮에 집에 없는 주민 몫): 9칸 이하로는 줄지 않음
      const ids = LOCKER_IDS.filter((id) => this.lockers[id] > 9)
      if (ids.length) {
        this.lockers[ids[Math.floor(this.rand() * ids.length)]]--
        this.stats.lockerOut++
        this.addCardboard()
      }
    }
    if (this.tStore <= 0) {
      // 주민이 편의점에 보낼 상자를 맡김(중고거래·반품)
      this.tStore = 12 + this.rand() * 14
      if (this.storeDrop < 10) this.storeDrop++
    }
  }

  private addCardboard() {
    const id = RECYCLE_IDS[Math.floor(this.rand() * RECYCLE_IDS.length)]
    this.recycle[id] += 0.035
    if (this.recycle[id] > 1) {
      // 재활용 수거차가 비우고 감
      this.recycle[id] = 0.12
      this.stats.collected++
    }
  }
}
