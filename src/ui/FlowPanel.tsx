// 현장 흐름 패널: 지금 거점의 작업 단계(정문 → … → 출고)를 실시간 수치와 함께 세로 단계로 보여 준다.
// 단계를 누르면 카메라가 그 단계의 대표 개체(또는 구역)로 가고, '투어 재생'은 단계를 차례로 자동 순회한다.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowDownToLine, Bot, Box, ChevronDown, ChevronUp, DoorOpen, Hand, Home, Layers, MapPin, Pause, Plane, Play, ScanLine, Ship, Split, TrainFront, Truck, Warehouse } from 'lucide-react'
import { useStore } from '../store'
import { SITE_META, type SiteId } from '../sim/world'
import { flowSteps, type FlowIcon, type FlowStep } from './flow'
import { L } from '../i18n'

const ICON: Record<FlowIcon, ReactNode> = {
  gate: <DoorOpen size={14} />,
  dock: <Warehouse size={14} />,
  scan: <ScanLine size={14} />,
  down: <ArrowDownToLine size={14} />,
  rack: <Layers size={14} />,
  robot: <Bot size={14} />,
  hand: <Hand size={14} />,
  box: <Box size={14} />,
  sort: <Split size={14} />,
  truck: <Truck size={14} />,
  ship: <Ship size={14} />,
  train: <TrainFront size={14} />,
  plane: <Plane size={14} />,
  home: <Home size={14} />,
  site: <MapPin size={14} />,
}

/** 투어에서 한 단계를 보여 주는 시간(ms) */
const STEP_MS = 7000

type Scope = { view: 'site' | 'network'; site: SiteId }

export function focusStep(step: FlowStep, scope: Scope) {
  const st = useStore.getState()
  st.setFlowStep(step.key)
  if (scope.view === 'network') {
    // 네트워크 단계 = 거점: 그 거점 화면으로 들어간다
    const id = step.key.slice(4) as SiteId
    st.setSite(id)
    return
  }
  const f = step.focus()
  if (f.sel) st.select(f.sel, scope.site)
  else if (f.zone) st.goZone(f.zone.x, f.zone.z, f.zone.d, scope.site)
}

export function FlowPanel() {
  useStore((s) => s.tick)
  const site = useStore((s) => s.site)
  const view = useStore((s) => s.view)
  const tour = useStore((s) => s.tour)
  const flowStep = useStore((s) => s.flowStep)
  const center = useStore((s) => s.center)
  const [open, setOpen] = useState(true)
  // 투어 중에는 시작할 때의 범위(거점 또는 네트워크)를 유지한다: 네트워크 투어가 거점으로 들어가도 목록이 바뀌지 않게
  const [scope, setScope] = useState<Scope>({ view, site })
  const cur: Scope = tour !== null ? scope : { view, site }
  const steps = flowSteps(cur.site, cur.view)
  const started = useRef(0)
  const [, force] = useState(0)

  // 투어 진행: STEP_MS마다 다음 단계로
  useEffect(() => {
    if (tour === null) return
    started.current = performance.now()
    const id = window.setTimeout(() => {
      const st = useStore.getState()
      if (st.tour === null) return
      const list = flowSteps(scope.site, scope.view)
      const next = (tour + 1) % list.length
      focusStep(list[next], scope)
      st.setTour(next)
    }, STEP_MS)
    const bar = window.setInterval(() => force((n) => n + 1), 200)
    return () => {
      window.clearTimeout(id)
      window.clearInterval(bar)
    }
  }, [tour, scope])

  // 거점을 바꾸면 고른 단계 표시를 지운다. 투어 중에 사용자가 다른 거점으로 가면 투어를 멈춘다
  useEffect(() => {
    const st = useStore.getState()
    if (st.tour === null) st.setFlowStep(null)
    else if (scope.view === 'site' && (view !== 'site' || site !== scope.site)) st.setTour(null)
  }, [site, view, scope])

  // 운영 센터를 열면 투어를 멈춘다(패널이 가려져 멈춤 버튼이 안 보이므로)
  useEffect(() => {
    if (center && useStore.getState().tour !== null) useStore.getState().setTour(null)
  }, [center])

  if (center) return null

  const startTour = () => {
    const sc = { view, site }
    setScope(sc)
    started.current = performance.now()
    const list = flowSteps(sc.site, sc.view)
    focusStep(list[0], sc)
    useStore.getState().setTour(0)
  }
  const stopTour = () => useStore.getState().setTour(null)
  const activeIdx = tour !== null ? tour : steps.findIndex((s) => s.key === flowStep)
  const progress = tour !== null ? Math.min(1, (performance.now() - started.current) / STEP_MS) : 0
  const title = cur.view === 'network' ? L('네트워크 흐름', 'Network flow') : L(`${SITE_META[cur.site].name} 현장 흐름`, `${SITE_META[cur.site].name} · Site flow`)

  return (
    <section className="panel pointer-events-auto absolute left-4 top-[148px] z-20 w-[236px] overflow-hidden" aria-label={L('현장 흐름', 'Site flow')}>
      <div className="flex items-center gap-2 px-3 pb-2 pt-2.5">
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink">{title}</span>
        <button
          type="button"
          onClick={tour !== null ? stopTour : startTour}
          className={`flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-semibold transition-colors ${tour !== null ? 'bg-brand text-white' : 'bg-brand-soft text-brand hover:bg-brand hover:text-white'}`}
          aria-pressed={tour !== null}
        >
          {tour !== null ? <Pause size={11} /> : <Play size={11} />}
          {tour !== null ? L('투어 멈춤', 'Stop tour') : L('투어 재생', 'Play tour')}
        </button>
        <button type="button" aria-label={open ? L('접기', 'Collapse') : L('펼치기', 'Expand')} title={open ? L('접기', 'Collapse') : L('펼치기', 'Expand')} onClick={() => setOpen(!open)} className="grid h-6 w-6 place-items-center rounded-md text-muted hover:bg-line-2 hover:text-ink">
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>
      {tour !== null && (
        <div className="mx-3 mb-1.5 h-[3px] overflow-hidden rounded-full bg-line-2">
          <div className="h-full rounded-full bg-brand" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      {open && (
        <ol className="scroll-thin overflow-y-auto px-2 pb-1" style={{ maxHeight: 'min(440px, calc(100vh - 420px - var(--tl, 0px)))' }}>
          {steps.map((s, i) => {
            const on = i === activeIdx
            const last = i === steps.length - 1
            return (
              <li key={s.key} className="relative">
                {!last && <span className={`absolute left-[19px] top-[30px] bottom-[-4px] w-[2px] rounded-full ${on ? 'bg-brand/40' : 'bg-line'}`} aria-hidden />}
                <button
                  type="button"
                  onClick={() => {
                    if (tour !== null) stopTour()
                    focusStep(s, cur)
                  }}
                  className={`flex w-full items-start gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors ${on ? 'bg-brand-soft' : 'hover:bg-line-2'}`}
                >
                  <span className={`relative grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full ${on ? 'bg-brand text-white' : 'bg-line-2 text-ink-2'}`}>{ICON[s.icon]}</span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="flex items-baseline gap-1.5">
                      <span className={`truncate text-[12px] font-semibold ${on ? 'text-brand' : 'text-ink'}`}>{s.label}</span>
                      <span className="num ml-auto shrink-0 text-[11.5px] font-bold text-ink">{s.count}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[10.5px] text-muted">{s.status}</span>
                    {on && <span className="mt-1 block text-[10.5px] leading-snug text-ink-2">{s.desc}</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
      <div className="border-t border-line px-3 py-1.5 text-[10px] text-faint">{L('가상 데이터 · 실제 공정 단계를 본뜬 시뮬레이션', 'Simulated data · modeled on real process steps')}</div>
    </section>
  )
}
