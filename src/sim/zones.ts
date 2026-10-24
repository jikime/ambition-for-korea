// 배송 구역 · 경로 최적화(다온마을).
//  다온마을 길은 일방통행 순환로라 한 차의 정차 순서는 길이 정한다(단지 서행 → 회차 → 동행 → 빌라 골목 북행).
//  그래서 바꿀 수 있는 것은 "어느 노선이 어느 동을 맡느냐"다. 지금 노선 4개(apt·mix·villa·west)가 들르는 정차 횟수는
//  그대로 두고(배송량 유지), 동을 노선끼리 옮기거나 맞바꿔 실제 주행 거리(도로 경로 길이) 합을 줄인다.
//  거리는 시뮬레이션 도로 경로(townRoute)의 길이로 잰다. 적용하면 다음 출발부터 배송차가 새 노선을 탄다.
import type { Sim } from './sim'
import { STOPS, VARIANTS, townRoute } from './sites'
import { mulberry32 } from './data'

export const ORIGINAL: Record<string, string[]> = Object.fromEntries(Object.entries(VARIANTS).map(([k, v]) => [k, [...v]]))
const MAX_STOPS = 5

/** 노선 하나의 도로 경로 길이(시뮬레이션 m). 순서는 길이 정하므로 동 묶음만으로 정해진다 */
const lenMemo = new Map<string, number>()
export function routeLen(ids: string[]) {
  const key = [...ids].sort().join(',')
  let v = lenMemo.get(key)
  if (v === undefined) {
    v = townRoute(ids).reduce((s, seg) => s + seg.legs.reduce((a, l) => a + l.path.length, 0), 0)
    lenMemo.set(key, v)
  }
  return v
}

/** 노선 그림용 점(2D 지도) */
export function routePoints(ids: string[]) {
  const pts: { x: number; z: number }[] = []
  for (const seg of townRoute(ids)) for (const l of seg.legs) for (const p of l.path.pts) pts.push({ x: p.x, z: p.z })
  return pts
}

/** 노선별 배송차 수(가중치) */
export function fleetWeights(sim: Sim) {
  const w: Record<string, number> = {}
  for (const v of sim.vehicles) if (v.kind === 'van' && v.home === 'IN') w[v.variant] = (w[v.variant] ?? 0) + 1
  return w
}

export function totalLen(plan: Record<string, string[]>, w: Record<string, number>) {
  return Object.entries(plan).reduce((s, [k, ids]) => s + routeLen(ids) * (w[k] ?? 1), 0)
}

const boxes = (ids: string[]) => ids.reduce((s, id) => s + STOPS[id].boxes, 0)

/** 제약: 정차 2~5곳, 같은 동 두 번 금지, 노선별 상자 수가 평균의 55~145% */
function valid(plan: Record<string, string[]>) {
  const all = Object.values(plan)
  const avg = all.reduce((s, ids) => s + boxes(ids), 0) / all.length
  for (const ids of all) {
    if (ids.length < 2 || ids.length > MAX_STOPS || new Set(ids).size !== ids.length) return false
    const b = boxes(ids)
    if (b < avg * 0.55 || b > avg * 1.45) return false
  }
  return true
}

/**
 * 담금질 탐색(시드 고정이라 결과가 매번 같다): 동 하나 옮기기 · 두 동 맞바꾸기를 무작위로 시도해
 * 길어지는 수도 처음엔 가끔 받아들이며(국소 최적 탈출) 가장 짧았던 유효한 배치를 남긴다
 */
export function optimize(start: Record<string, string[]>, w: Record<string, number>, iters = 6000) {
  const R = mulberry32(777)
  const keys = Object.keys(start)
  let cur: Record<string, string[]> = Object.fromEntries(Object.entries(start).map(([k, v]) => [k, [...v]]))
  let curLen = totalLen(cur, w)
  let best = cur
  let bestLen = curLen
  let moves = 0
  for (let i = 0; i < iters; i++) {
    const T = 120 * (1 - i / iters) + 1
    const a = keys[Math.floor(R() * keys.length)]
    let b = keys[Math.floor(R() * keys.length)]
    if (a === b) b = keys[(keys.indexOf(a) + 1) % keys.length]
    let next: Record<string, string[]>
    if (R() < 0.5) {
      const id = cur[a][Math.floor(R() * cur[a].length)]
      if (cur[b].includes(id)) continue
      next = { ...cur, [a]: cur[a].filter((x) => x !== id), [b]: [...cur[b], id] }
    } else {
      const x = cur[a][Math.floor(R() * cur[a].length)]
      const y = cur[b][Math.floor(R() * cur[b].length)]
      if (x === y || cur[b].includes(x) || cur[a].includes(y)) continue
      next = { ...cur, [a]: cur[a].map((q) => (q === x ? y : q)), [b]: cur[b].map((q) => (q === y ? x : q)) }
    }
    if (!valid(next)) continue
    const len = totalLen(next, w)
    if (len < curLen || R() < Math.exp((curLen - len) / T)) {
      cur = next
      curLen = len
      moves++
      if (len < bestLen - 0.5) {
        best = next
        bestLen = len
      }
    }
  }
  return { plan: best, total: bestLen, moves }
}

export interface TripLog {
  van: string
  variant: string
  optimized: boolean
  /** 실제로 달린 거리(시뮬레이션 m) */
  dist: number
  stops: number
}

export class ZonePlanner {
  applied = false
  trips: TripLog[] = []
  private cache: { plan: Record<string, string[]>; total: number; base: number; moves: number } | null = null

  constructor(private sim: Sim) {}

  /** 최적화 결과(한 번 계산해 둔다) */
  result() {
    if (!this.cache) {
      const w = fleetWeights(this.sim)
      const base = totalLen(ORIGINAL, w)
      const r = optimize(ORIGINAL, w)
      this.cache = { ...r, base }
    }
    return this.cache
  }

  /** 적용·되돌리기: 다음 출발부터 새 노선 */
  apply(on: boolean) {
    const plan = on ? this.result().plan : ORIGINAL
    for (const k of Object.keys(VARIANTS)) VARIANTS[k] = [...plan[k]]
    this.applied = on
  }

  /** 배송차가 다온마을을 한 바퀴 돌고 터미널로 돌아왔을 때 */
  logTrip(v: { id: string; variant: string }, dist: number, stops: number) {
    this.trips.push({ van: v.id, variant: v.variant, optimized: this.applied, dist, stops })
    if (this.trips.length > 80) this.trips.shift()
  }
}
