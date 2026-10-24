// 재생 막대(항만 관제 영상 분석 2순위): 지난 60분(관제 시계) 기록을 끌어서 되감고, 재생 ×1·×4·×8, LIVE 복귀.
// 막대 위 마름모는 돌발·현장 보고·선사 통보·기사 메시지·승인(누르면 그 시각으로). 재생 중에는 시뮬레이션이 멈추고,
// LIVE로 돌아오면 멈춘 시점부터 이어 간다(src/sim/history.ts).
import { useEffect, useRef, type PointerEvent } from 'react'
import { Pause, Play, Radio, RotateCcw, X } from 'lucide-react'
import { sim } from '../sim/sim'
import { useStore } from '../store'
import { hhmm } from './format'
import { exitReplay, seekReplay } from './replay'
import { L } from '../i18n'

const TONE: Record<string, string> = { red: 'bg-bad', amber: 'bg-warn', blue: 'bg-brand', gray: 'bg-faint' }

export function Timeline() {
  useStore((s) => s.tick)
  const show = useStore((s) => s.timeline)
  const R = useStore((s) => s.replay)
  const track = useRef<HTMLDivElement>(null)
  useEffect(() => {
    document.documentElement.style.setProperty('--tl', show ? '56px' : '0px')
    return () => document.documentElement.style.setProperty('--tl', '0px')
  }, [show])
  if (!show) return null
  const { t0, t1 } = sim.history.range()
  const span = Math.max(1, t1 - t0)
  const cur = R.on ? R.t : t1
  const pct = (t: number) => `${((t - t0) / span) * 100}%`
  const events = sim.history.events(t0, t1)
  const ticks: number[] = []
  for (let t = Math.ceil(t0 / 600) * 600; t <= t1; t += 600) ticks.push(t)
  const fromX = (x: number) => {
    const r = track.current!.getBoundingClientRect()
    return t0 + Math.max(0, Math.min(1, (x - r.left) / r.width)) * span
  }
  const down = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    seekReplay(fromX(e.clientX), false)
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (e.buttons & 1) seekReplay(fromX(e.clientX), false)
  }
  const ago = Math.round((t1 - cur) / 60)
  const toggle = () => {
    if (!R.on) seekReplay(Math.max(t0, t1 - 15 * 60), true)
    else useStore.getState().setReplay({ playing: !R.playing })
  }
  return (
    <section className="panel pointer-events-auto absolute inset-x-4 bottom-4 z-20 flex h-11 items-center gap-2.5 px-2.5" aria-label={L('재생 막대', 'Replay bar')}>
      <button
        type="button"
        onClick={toggle}
        title={R.on ? (R.playing ? L('일시 정지', 'Pause') : L('재생', 'Replay')) : L('15분 전부터 재생', 'Replay from 15 min ago')}
        aria-label={R.on && R.playing ? L('일시 정지', 'Pause') : L('재생', 'Replay')}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-white hover:brightness-110"
      >
        {R.on && R.playing ? <Pause size={13} /> : <Play size={13} />}
      </button>
      <div className="flex h-7 shrink-0 items-center rounded-full bg-line-2 p-0.5" role="group" aria-label={L('재생 배속', 'Replay speed')}>
        {[1, 4, 8].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => useStore.getState().setReplay({ rate: n })}
            aria-pressed={R.rate === n}
            className={`num h-6 rounded-full px-1.5 text-[11px] font-semibold ${R.rate === n ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
          >
            ×{n}
          </button>
        ))}
      </div>
      <span className={`num w-[118px] shrink-0 text-[11.5px] font-semibold ${!R.on ? 'text-ok' : R.playing ? 'text-brand' : 'text-warn'}`}>
        {!R.on ? `LIVE ${hhmm(t1)}` : L(`${R.playing ? '재생' : '정지'} ${hhmm(cur)} · ${ago}분 전`, `${R.playing ? 'Replay' : 'Paused'} ${hhmm(cur)} · ${ago} min ago`)}
      </span>
      <div
        ref={track}
        onPointerDown={down}
        onPointerMove={move}
        className="relative h-8 min-w-0 flex-1 cursor-pointer touch-none select-none"
        title={L('끌어서 되감기', 'Drag to rewind')}
      >
        <div className="absolute inset-x-0 top-[13px] h-1.5 rounded-full bg-line-2" />
        <div className="absolute left-0 top-[13px] h-1.5 rounded-full bg-brand/35" style={{ width: pct(cur) }} />
        {ticks.map((t) => (
          <span key={t} className="num pointer-events-none absolute top-[21px] -translate-x-1/2 text-[9.5px] text-faint" style={{ left: pct(t) }}>
            {hhmm(t)}
          </span>
        ))}
        {events.map((e, i) => (
          <button
            key={`${e.kind}${e.t}${i}`}
            type="button"
            title={`${hhmm(e.t)} ${e.label}`}
            aria-label={`${hhmm(e.t)} ${e.label}`}
            onPointerDown={(ev) => {
              ev.stopPropagation()
              seekReplay(e.t, false)
            }}
            className={`absolute top-[2px] h-2 w-2 -translate-x-1/2 rotate-45 rounded-[1px] ring-1 ring-white ${TONE[e.tone]}`}
            style={{ left: pct(e.t) }}
          />
        ))}
        <div className="pointer-events-none absolute top-[6px] h-5 w-[3px] -translate-x-1/2 rounded-full bg-brand shadow" style={{ left: pct(cur) }} />
      </div>
      <button
        type="button"
        onClick={() => seekReplay((R.on ? R.t : t1) - 5 * 60, false)}
        title={L('5분 뒤로', 'Back 5 min')}
        aria-label={L('5분 뒤로', 'Back 5 min')}
        className="flex h-7 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-semibold text-muted ring-1 ring-line hover:text-ink"
      >
        <RotateCcw size={12} />{L('5분', '5 min')}
      </button>
      <button
        type="button"
        onClick={exitReplay}
        disabled={!R.on}
        className={`flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold ${R.on ? 'bg-ok text-white hover:brightness-110' : 'bg-ok-soft text-ok'}`}
      >
        <Radio size={12} />LIVE
      </button>
      <button
        type="button"
        onClick={() => {
          exitReplay()
          useStore.getState().setTimeline(false)
        }}
        aria-label={L('재생 막대 닫기', 'Close replay bar')}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted hover:bg-line-2 hover:text-ink"
      >
        <X size={14} />
      </button>
    </section>
  )
}
