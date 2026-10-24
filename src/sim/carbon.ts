// 탄소 배출 비교(예시 계수로 추정).
//  - 트럭: 차가 새 목적지로 출발할 때마다 한 운행으로 센다. 운행 거리는 지도(축소)가 아니라 실제 거점 간 거리(예시)를 쓴다.
//    배출 = 거리 × 차종별 km당 배출(경유 연비 기반 예시: 빈 차/짐 실은 차).
//  - 배: 부산신항에서 수입 컨테이너를 내릴 때마다 상하이→부산 해상 운송 1건(t·km × 해상 계수).
//  - 비행기: 화물기가 이륙할 때마다 실은 무게 × 비행 거리 × 항공 계수.
//  - 철도: 철송 셔틀이 부산신항 ↔ 곤지암 철송장에 설 때마다 실은 컨테이너(개당 18t) × 380km × 철도 계수(빈 화차 몫 1.3배).
//  실제 산정(GLEC 프레임워크·ISO 14083)은 차량별 연료 사용량·적재율·공차 운행 배분이 필요하다. 여기 값은 비교용 예시다.
import type { Sim } from './sim'
import type { Season, Weather } from './env'
import { L } from '../i18n'

/** 차종별 km당 배출(kg CO2e): [빈 차, 짐 실은 차]. 경유 1L ≈ 2.6kg CO2e, 연비 예시에서 계산 */
export const TRUCK_KG_KM: Record<string, [number, number]> = {
  van: [0.2, 0.24],
  wing: [0.45, 0.6],
  box: [0.55, 0.75],
  reefer: [0.5, 0.78],
  trailer: [0.75, 1.05],
}
export const TRUCK_LABEL: Record<string, string> = {
  van: L('1톤 택배차', '1-ton delivery van'), wing: L('5톤 윙바디', '5-ton wing-body truck'), box: L('11톤 탑차', '11-ton box truck'), reefer: L('냉동탑차', 'Reefer truck'), trailer: L('컨테이너 트레일러', 'Container trailer'),
}
/** t·km당 배출(kg CO2e) */
export const SEA_KG_TKM = 0.012
export const AIR_KG_TKM = 0.6
/** 화물 열차 t·km당(예시, 빈 화차 회송 포함은 아래에서 1.3배) */
export const RAIL_KG_TKM = 0.022

/** 거점 간 실제 거리(예시, km) */
export const ROUTE_KM: Record<string, number> = {
  'IC>GJ': 25, 'GJ>IC': 25, 'GJ>IN': 75, 'IN>GJ': 75, 'IN>TW': 18, 'GJ>GJ': 30,
  'GJ>AP': 95, 'AP>GJ': 95, 'BS>GJ': 380, 'GJ>BS': 380, 'IC>OFF': 60, 'OFF>IC': 60, 'GJ>DJ': 110, 'DJ>GJ': 110,
  // 대전 협력사 입고 트럭(지도 밖 협력사 물류센터 ↔ 대전): 출발 때 거점이 대전으로 잡혀 있다
  'DJ>DJ': 150, 'DJ>OFF': 150,
}
export const SEA_KM = 870
export const FLIGHT_KM = (route: string) => (/로스앤젤레스|Los Angeles/.test(route) ? 9600 : /프랑크푸르트|Frankfurt/.test(route) ? 8600 : 5000)

export type Mode = 'road' | 'sea' | 'air' | 'rail'
/** 철송 부산신항 ↔ 곤지암(예시, km) */
export const RAIL_KM = 380

export interface CarbonTrip {
  time: number
  mode: Mode
  label: string
  km: number
  kg: number
}

/** 상자 한 개(2kg)의 여정별 배출 추정: 구간별 [이름, kg] */
export function journeyFootprint() {
  const parcel = 0.002 // t
  const truck = (kind: string, km: number, perTrip: number, back = true) => ((TRUCK_KG_KM[kind][1] + (back ? TRUCK_KG_KM[kind][0] : 0)) * km) / perTrip
  const land: [string, number][] = [
    [L('윙바디 이천 → 곤지암 25km', 'Wing-body Icheon → Gonjiam 25km'), truck('wing', 25, 480)],
    [L('11톤 곤지암 → 인천 75km', '11-ton Gonjiam → Incheon 75km'), truck('box', 75, 1200)],
    [L('1톤 다온마을 배송 18km', '1-ton Daon Village delivery 18km'), truck('van', 18, 180, false)],
  ]
  const sea: [string, number][] = [
    [L('컨테이너선 상하이 → 부산 870km', 'Container ship Shanghai → Busan 870km'), parcel * SEA_KM * SEA_KG_TKM * 1.4],
    [L('트레일러 부산 → 곤지암 380km', 'Trailer Busan → Gonjiam 380km'), truck('trailer', 380, 2000)],
    [L('11톤 곤지암 → 인천 75km', '11-ton Gonjiam → Incheon 75km'), truck('box', 75, 1200)],
    [L('1톤 다온마을 배송 18km', '1-ton Daon Village delivery 18km'), truck('van', 18, 180, false)],
  ]
  const air: [string, number][] = [
    [L('항공 트럭 곤지암 → 인천공항 95km', 'Air cargo truck Gonjiam → Incheon Airport 95km'), truck('box', 95, 600)],
    [L('화물기 인천 → 도쿄 1,160km', 'Freighter Incheon → Tokyo 1,160km'), parcel * 1160 * AIR_KG_TKM],
  ]
  const airLA: [string, number][] = [
    [L('항공 트럭 곤지암 → 인천공항 95km', 'Air cargo truck Gonjiam → Incheon Airport 95km'), truck('box', 95, 600)],
    [L('화물기 인천 → LA 9,600km', 'Freighter Incheon → LA 9,600km'), parcel * 9600 * AIR_KG_TKM],
  ]
  const seaLA: [string, number][] = [
    [L('트레일러 곤지암 → 부산 380km', 'Trailer Gonjiam → Busan 380km'), truck('trailer', 380, 2000)],
    [L('컨테이너선 부산 → LA 9,700km', 'Container ship Busan → LA 9,700km'), parcel * 9700 * SEA_KG_TKM * 1.4],
  ]
  // 부산 → 곤지암 내륙 운송: 트레일러 직송 vs 철송(부산신항 철송장 → 곤지암 철송장, 구내 트랙터로 CY까지)
  const inlandRoad: [string, number][] = [
    [L('트레일러 부산 → 곤지암 380km', 'Trailer Busan → Gonjiam 380km'), truck('trailer', 380, 2000)],
  ]
  const inlandRail: [string, number][] = [
    [L(`철송 부산신항 → 곤지암 철송장 ${RAIL_KM}km`, `Rail Busan New Port → Gonjiam rail terminal ${RAIL_KM}km`), parcel * RAIL_KM * RAIL_KG_TKM * 1.3 * 1.4],
  ]
  return { land, sea, air, airLA, seaLA, inlandRoad, inlandRail }
}

export class CarbonLedger {
  totals: Record<Mode, number> = { road: 0, sea: 0, air: 0, rail: 0 }
  byKind: Record<string, { trips: number; kg: number; km: number }> = {}
  /** 차량별 오늘 운행 거리(실거리 환산 km)와 배출 */
  byVehicle: Record<string, { km: number; kg: number; trips: number }> = {}
  log: CarbonTrip[] = []
  private dest = new Map<string, string | null>()
  private departed = -1
  private tons = 0
  private discharged = -1
  private railRuns = -1

  constructor(private sim: Sim) {}

  private add(t: CarbonTrip) {
    this.totals[t.mode] += t.kg
    this.log.unshift(t)
    if (this.log.length > 40) this.log.pop()
  }

  step() {
    // 트럭: 목적지가 새로 정해지면 출발로 본다
    for (const v of this.sim.vehicles) {
      const prev = this.dest.get(v.id)
      const cur = v.dest
      this.dest.set(v.id, cur)
      if (prev === undefined || !cur || cur === prev) continue
      const key = `${v.site}>${cur}`
      const km = ROUTE_KM[key]
      if (!km) continue
      const loaded =
        v.kind === 'van' ? true
          : v.kind === 'wing' ? key === 'IC>GJ'
            : v.kind === 'box' ? key !== 'IN>GJ'
              : v.kind === 'reefer' ? key === 'IC>OFF'
                : v.kind === 'trailer' ? !!v.container
                  : true
      const f = TRUCK_KG_KM[v.kind] ?? TRUCK_KG_KM.box
      const kg = km * f[loaded ? 1 : 0]
      const k = (this.byKind[v.kind] ??= { trips: 0, kg: 0, km: 0 })
      k.trips++
      k.kg += kg
      k.km += km
      const bv = (this.byVehicle[v.id] ??= { km: 0, kg: 0, trips: 0 })
      bv.km += km
      bv.kg += kg
      bv.trips++
      this.add({ time: this.sim.clock, mode: 'road', label: `${v.id} ${TRUCK_LABEL[v.kind] ?? v.kind} ${key.replace('>', '→')}${loaded ? '' : L(' (빈 차)', ' (empty)')}`, km, kg })
    }
    // 배: 수입 컨테이너 양하
    const port = this.sim.port.stats
    if (this.discharged < 0) this.discharged = port.discharged
    while (this.discharged < port.discharged) {
      this.discharged++
      const kg = 18 * SEA_KM * SEA_KG_TKM
      this.add({ time: this.sim.clock, mode: 'sea', label: L('수입 컨테이너 상하이 → 부산(18t)', 'Import container Shanghai → Busan (18t)'), km: SEA_KM, kg })
    }
    // 철도: 철송 셔틀이 철송장에 섰다(실은 컨테이너 × 18t × 380km, 빈 화차 회송 몫 1.3배)
    const rail = this.sim.rail
    if (this.railRuns < 0) this.railRuns = rail.stats.arrivals
    if (rail.stats.arrivals > this.railRuns && rail.last) {
      this.railRuns = rail.stats.arrivals
      const { from, to, n } = rail.last
      const name = (t: string) => (t === 'BS' ? L('부산신항', 'Busan New Port') : L('곤지암', 'Gonjiam'))
      this.add({ time: this.sim.clock, mode: 'rail', label: L(`철송 ${name(from)} → ${name(to)} 컨테이너 ${n}개(${n * 18}t)`, `Rail ${name(from)} → ${name(to)} ${n} containers (${n * 18}t)`), km: RAIL_KM, kg: Math.max(1, n) * 18 * RAIL_KM * RAIL_KG_TKM * 1.3 })
    }
    // 비행기: 이륙
    const ap = this.sim.airport.stats
    if (this.departed < 0) {
      this.departed = ap.departed
      this.tons = ap.tons
    }
    if (ap.departed > this.departed) {
      const dt = Math.max(0, ap.tons - this.tons)
      const per = dt / (ap.departed - this.departed)
      for (const a of this.sim.airport.aircraft.filter((x) => x.phase === 'climb').slice(0, ap.departed - this.departed)) {
        const km = FLIGHT_KM(a.route)
        this.add({ time: this.sim.clock, mode: 'air', label: `${a.flight} ${a.route}(${per.toFixed(0)}t)`, km, kg: per * km * AIR_KG_TKM })
      }
      this.departed = ap.departed
      this.tons = ap.tons
    }
  }
}

// ───────────────────────── 지붕 태양광
// 거점 지붕 태양광의 발전량(예시 용량)을 관제 시계의 해 높이·날씨로 추정하고, 한국 전력망 배출계수로 상쇄량을 계산한다.

/** 거점별 지붕 태양광 용량(kWp, 예시) */
export const SOLAR_KWP: Record<string, { kwp: number; name: string }> = {
  GJ: { kwp: 820, name: L('곤지암 보관동 지붕', 'Gonjiam storage roof') },
  IC: { kwp: 640, name: L('이천 콜드체인동 지붕', 'Icheon cold chain roof') },
  DJ: { kwp: 1100, name: L('대전 창고 지붕', 'Daejeon warehouse roof') },
  AP: { kwp: 1500, name: L('인천공항 화물터미널 지붕', 'Incheon Airport Cargo Terminal roof') },
}
/** 전력망 배출계수(kg CO₂e/kWh, 예시) */
export const GRID_KG_KWH = 0.456
const SUN: Record<Season, [number, number]> = { spring: [6.2, 19.0], summer: [5.4, 19.8], autumn: [6.6, 18.1], winter: [7.6, 17.4] }
const WEATHER_K: Record<Weather, number> = { clear: 1, rain: 0.22, snow: 0.12 }

/** 0~1: 시각(시)과 계절로 본 발전 비율(정오 맑은 날 ≈ 0.8) */
export function sunFactor(hour: number, season: Season) {
  const [rise, set] = SUN[season]
  if (hour <= rise || hour >= set) return 0
  return 0.8 * Math.pow(Math.sin((Math.PI * (hour - rise)) / (set - rise)), 1.4)
}

export class SolarMeter {
  season: Season = 'autumn'
  weather: Weather = 'clear'
  /** 오늘 누적 발전량(kWh): 거점별 */
  kwh: Record<string, number> = {}
  /** 시간대별 발전량(kWh, 0~23시) */
  byHour = new Array(24).fill(0) as number[]
  /** 화면(장면)의 시각. 자동이면 LIVE 현재 시각, 고정하면 그 시각. 없으면(헤드리스) 관제 시계 */
  envHour: number | null = null
  private last = -1

  constructor(private sim: Sim) {}

  private kwAt(hour: number) {
    const f = sunFactor(hour, this.season) * WEATHER_K[this.weather]
    const out: Record<string, number> = {}
    for (const [id, s] of Object.entries(SOLAR_KWP)) out[id] = s.kwp * f
    return out
  }

  /** 지금 발전 출력(kW): 거점별 */
  get kw() {
    return this.kwAt(this.hour)
  }
  get totalKw() {
    return Object.values(this.kw).reduce((a, b) => a + b, 0)
  }
  get totalKwh() {
    return Object.values(this.kwh).reduce((a, b) => a + b, 0)
  }
  get offsetKg() {
    return this.totalKwh * GRID_KG_KWH
  }
  /** 장면의 낮밤과 같은 시각을 쓴다(발전 출력·누적 모두) */
  get hour() {
    if (this.envHour !== null) return this.envHour
    return ((this.sim.clock / 3600) % 24 + 24) % 24
  }

  /** 오늘 0시부터 지금까지를 한 번에 채운다(시작할 때 · 날이 바뀔 때) */
  private backfill(toHour: number) {
    this.kwh = {}
    this.byHour.fill(0)
    for (let h = 0; h < toHour; h += 0.1) {
      const kw = this.kwAt(h)
      for (const [id, v] of Object.entries(kw)) {
        this.kwh[id] = (this.kwh[id] ?? 0) + v * 0.1
        this.byHour[Math.floor(h)] += v * 0.1
      }
    }
  }

  step() {
    const h = this.hour
    // 처음 · 날이 바뀜 · 화면 시각을 크게 바꿈 → 0시부터 다시 채운다
    if (this.last < 0 || h < this.last || h - this.last > 0.25) {
      this.backfill(h)
      this.last = h
      return
    }
    const dh = h - this.last
    if (dh <= 0) return
    const kw = this.kwAt(h)
    for (const [id, v] of Object.entries(kw)) {
      this.kwh[id] = (this.kwh[id] ?? 0) + v * dh
      this.byHour[Math.floor(h)] += v * dh
    }
    this.last = h
  }
}
