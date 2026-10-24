// 계절·시간대·날씨. 기본은 자동(실제 날짜 → 계절, 이 컴퓨터의 현재 시각 → 시간대, 날짜+3시간 단위 → 날씨)이고
// 사용자가 하나씩 직접 고를 수 있다. 화면(조명·하늘·눈비)은 three/env 가 이 결과를 따른다.
import { mulberry32 } from './data'
import { L } from '../i18n'

export type Season = 'spring' | 'summer' | 'autumn' | 'winter'
export type TimeOfDay = 'dawn' | 'day' | 'sunset' | 'night'
export type Weather = 'clear' | 'rain' | 'snow'

export interface EnvSettings {
  season: Season | 'auto'
  time: Exclude<TimeOfDay, 'dawn'> | 'auto'
  weather: Weather | 'auto'
}

export interface EnvState {
  season: Season
  time: TimeOfDay
  weather: Weather
  /** 0~24 시. 해 위치 계산에 쓴다 */
  hour: number
}

export const SEASON_LABEL: Record<Season, string> = { spring: L('봄', 'Spring'), summer: L('여름', 'Summer'), autumn: L('가을', 'Autumn'), winter: L('겨울', 'Winter') }
export const TIME_LABEL: Record<TimeOfDay, string> = { dawn: L('새벽', 'Dawn'), day: L('낮', 'Day'), sunset: L('석양', 'Sunset'), night: L('야간', 'Night') }
export const WEATHER_LABEL: Record<Weather, string> = { clear: L('맑음', 'Clear'), rain: L('비', 'Rain'), snow: L('눈', 'Snow') }

export function seasonOf(date: Date): Season {
  const m = date.getMonth() + 1
  if (m >= 3 && m <= 5) return 'spring'
  if (m >= 6 && m <= 8) return 'summer'
  if (m >= 9 && m <= 11) return 'autumn'
  return 'winter'
}

/** 계절별 해 뜨고 지는 시각(서울 근사) */
const SUN: Record<Season, [number, number]> = { spring: [6.2, 19.0], summer: [5.3, 19.8], autumn: [6.5, 18.2], winter: [7.4, 17.5] }

export function timeOf(hour: number, season: Season): TimeOfDay {
  const [rise, set] = SUN[season]
  if (hour >= rise - 0.6 && hour < rise + 0.7) return 'dawn'
  if (hour >= rise + 0.7 && hour < set - 0.8) return 'day'
  if (hour >= set - 0.8 && hour < set + 0.6) return 'sunset'
  return 'night'
}

/** 날짜와 3시간 구간으로 정해지는 날씨(같은 날 같은 시간대면 늘 같다) */
export function weatherOf(date: Date, hour: number, season: Season): Weather {
  const block = Math.floor(hour / 3)
  const seed = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate()
  const x = mulberry32(seed * 8 + block)()
  const p = { spring: [0.18, 0], summer: [0.32, 0], autumn: [0.18, 0], winter: [0.05, 0.3] }[season]
  if (x < p[1]) return 'snow'
  if (x < p[1] + p[0]) return 'rain'
  return 'clear'
}

/** 수동 시간대를 고르면 그 시간대의 대표 시각으로 해를 놓는다 */
const FIXED_HOUR: Record<Exclude<TimeOfDay, 'dawn'>, (s: Season) => number> = {
  day: () => 13,
  sunset: (s) => SUN[s][1] - 0.15,
  night: () => 22.5,
}

/** 하루 중 초(0~86399) */
export function daySeconds(d: Date) {
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()
}

/** date: 오늘 날짜, daySec: 하루 중 초(화면에서는 현재 시각) */
export function resolveEnv(s: EnvSettings, date: Date, daySec: number): EnvState {
  const season = s.season === 'auto' ? seasonOf(date) : s.season
  const clockHour = ((daySec / 3600) % 24 + 24) % 24
  const hour = s.time === 'auto' ? clockHour : FIXED_HOUR[s.time](season)
  const time = s.time === 'auto' ? timeOf(hour, season) : s.time
  let weather = s.weather === 'auto' ? weatherOf(date, clockHour, season) : s.weather
  // 눈은 겨울에만 자동으로 온다. 다른 계절에 직접 고르면 그대로 보여 준다
  if (s.weather === 'auto' && weather === 'snow' && season !== 'winter') weather = 'rain'
  return { season, time, weather, hour }
}

/** 해의 고도(라디안, 음수면 지평선 아래)와 방위(동쪽 0 → 남쪽 → 서쪽 π) */
export function sunAngles(hour: number, season: Season) {
  const [rise, set] = SUN[season]
  const t = (hour - rise) / (set - rise)
  const peak = { spring: 0.95, summer: 1.2, autumn: 0.85, winter: 0.55 }[season]
  return { elevation: Math.sin(Math.PI * t) * peak - (t < 0 || t > 1 ? 0.3 : 0), azimuth: Math.PI * Math.min(1, Math.max(0, t)) }
}
