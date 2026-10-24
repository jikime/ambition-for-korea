// LIVE(이 컴퓨터의 현재 시각) + 계절·시간대·날씨 선택. 기본은 자동(오늘 날짜 → 계절, 현재 시각 → 시간대, 날씨는 날짜·시간대별)
import { useEffect, useRef, useState } from 'react'
import { CloudRain, Flower2, Leaf, Moon, Snowflake, Sun, Sunrise, Sunset, TreeDeciduous, TreePine } from 'lucide-react'
import { SPEEDUP, sim } from '../sim/sim'
import { SEASON_LABEL, TIME_LABEL, WEATHER_LABEL, daySeconds, type Season, type TimeOfDay, type Weather } from '../sim/env'
import { useStore } from '../store'
import { useEnvView } from '../three/env/state'
import { hhmm } from './format'
import { exitReplay } from './replay'
import { L } from '../i18n'

const SEASON_ICON: Record<Season, typeof Sun> = { spring: Flower2, summer: TreeDeciduous, autumn: Leaf, winter: TreePine }
const TIME_ICON: Record<TimeOfDay, typeof Sun> = { dawn: Sunrise, day: Sun, sunset: Sunset, night: Moon }
const WEATHER_ICON: Record<Weather, typeof Sun> = { clear: Sun, rain: CloudRain, snow: Snowflake }

function Seg<T extends string>({ label, value, auto, options, onPick }: {
  label: string
  value: T | 'auto'
  auto: string
  options: { v: T; label: string }[]
  onPick: (v: T | 'auto') => void
}) {
  const btn = (on: boolean) => `h-7 flex-1 rounded-md px-1.5 text-[11.5px] font-semibold ${on ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="font-semibold text-ink-2">{label}</span>
        {value === 'auto' && <span className="text-faint">{L('자동', 'Auto')} → {auto}</span>}
      </div>
      <div className="flex gap-0.5 rounded-lg bg-line-2 p-0.5">
        <button type="button" className={btn(value === 'auto')} onClick={() => onPick('auto')}>{L('자동', 'Auto')}</button>
        {options.map((o) => (
          <button key={o.v} type="button" className={btn(value === o.v)} onClick={() => onPick(o.v)}>{o.label}</button>
        ))}
      </div>
    </div>
  )
}

export function EnvControl() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const env = useEnvView((s) => s.env)
  const set = useStore((s) => s.env)
  const setEnv = useStore((s) => s.setEnv)
  useStore((s) => s.tick)
  const R = useStore((s) => s.replay)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])
  const TIcon = TIME_ICON[env.time]
  const WIcon = env.weather === 'clear' ? TIcon : WEATHER_ICON[env.weather]
  const SIcon = SEASON_ICON[env.season]
  const allAuto = set.season === 'auto' && set.time === 'auto' && set.weather === 'auto'
  const today = new Date()
  const month = today.getMonth() + 1
  const now = hhmm(daySeconds(today))
  // 재생 막대로 되감는 중이면 LIVE 대신 재생 상태(누르면 LIVE로)
  if (R.on) {
    return (
      <button
        type="button"
        onClick={exitReplay}
        title={L('LIVE로 돌아가기', 'Back to LIVE')}
        className={`num flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12px] font-semibold hover:brightness-95 ${R.playing ? 'bg-brand-soft text-brand' : 'bg-warn-soft text-warn'}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${R.playing ? 'bg-brand' : 'bg-warn'}`} />
        {R.playing ? L(`재생 ×${R.rate}`, `Replay ×${R.rate}`) : L('정지', 'Paused')} {hhmm(R.t)}
        <span className="mx-0.5 h-3 w-px bg-current opacity-30" />
        {L('LIVE로', 'Go LIVE')}
      </button>
    )
  }
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={L('현재 시각과 환경 설정', 'Current time and environment settings')}
        className="num flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full bg-ok-soft px-2.5 text-[12px] font-semibold text-ok hover:brightness-95"
        title={`${SEASON_LABEL[env.season]} · ${TIME_LABEL[env.time]} · ${WEATHER_LABEL[env.weather]}${allAuto ? L(' (자동)', ' (auto)') : L(' (수동)', ' (manual)')}`}
      >
        <span className="live-dot h-1.5 w-1.5 rounded-full bg-ok" />
        LIVE {now}
        <span className="mx-0.5 h-3 w-px bg-ok/30" />
        <SIcon size={13} />
        <WIcon size={13} />
        <span className="hidden 2xl:inline">{SEASON_LABEL[env.season]} · {env.weather === 'clear' ? TIME_LABEL[env.time] : WEATHER_LABEL[env.weather]}</span>
        {!allAuto && <span className="h-1.5 w-1.5 rounded-full bg-warn" />}
      </button>
      {open && (
        <div className="panel rise absolute right-0 top-11 z-50 w-[320px] space-y-3 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] font-semibold">{L('환경 · 계절과 날씨', 'Environment · Season & weather')}</span>
            {!allAuto && (
              <button type="button" className="text-[11.5px] font-semibold text-brand" onClick={() => setEnv({ season: 'auto', time: 'auto', weather: 'auto' })}>{L('모두 자동으로', 'All to auto')}</button>
            )}
          </div>
          <Seg<Season>
            label={L('계절', 'Season')}
            value={set.season}
            auto={L(`${month}월 · ${SEASON_LABEL[env.season]}`, `${today.toLocaleString('en-US', { month: 'short' })} · ${SEASON_LABEL[env.season]}`)}
            options={(['spring', 'summer', 'autumn', 'winter'] as const).map((v) => ({ v, label: SEASON_LABEL[v] }))}
            onPick={(v) => setEnv({ season: v })}
          />
          <Seg<Exclude<TimeOfDay, 'dawn'>>
            label={L('시간대', 'Time of day')}
            value={set.time}
            auto={L(`현재 ${now} · ${TIME_LABEL[env.time]}`, `Now ${now} · ${TIME_LABEL[env.time]}`)}
            options={(['day', 'sunset', 'night'] as const).map((v) => ({ v, label: TIME_LABEL[v] }))}
            onPick={(v) => setEnv({ time: v })}
          />
          <Seg<Weather>
            label={L('날씨', 'Weather')}
            value={set.weather}
            auto={WEATHER_LABEL[env.weather]}
            options={(['clear', 'rain', 'snow'] as const).map((v) => ({ v, label: WEATHER_LABEL[v] }))}
            onPick={(v) => setEnv({ weather: v })}
          />
          <p className="text-[11px] leading-snug text-muted">
            {L('LIVE 시각은 이 컴퓨터의 현재 시각입니다. 자동이면 오늘 날짜로 계절을, 현재 시각으로 낮·석양·야간을 정합니다. 날씨는 날짜와 3시간 단위로 계절별 확률에 따라 바뀝니다.', 'LIVE time is this computer’s current time. On auto, today’s date sets the season and the current time sets day, sunset or night. Weather changes in 3-hour blocks by date, using seasonal odds.')}
          </p>
          <p className="num rounded-lg bg-line-2 px-2 py-1.5 text-[11px] leading-snug text-muted">
            {L(`시뮬레이션 시각 ${hhmm(sim.clock)} · 화면을 연 시각에서 시작해 ×1에서 실제보다 ${SPEEDUP}배 빠르게 흐릅니다(배속을 올리면 그만큼 더). 택배 여정·현장 기록·도착 예정 시각은 이 시계를 씁니다.`, `Sim time ${hhmm(sim.clock)} · Starts when you open the page and runs ${SPEEDUP}× faster than real time at ×1 (faster still at higher speeds). Parcel journeys, field logs and ETAs use this clock.`)}
          </p>
        </div>
      )}
    </div>
  )
}

