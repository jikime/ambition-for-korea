import { useEffect, useState, type ReactNode } from 'react'
import { ArrowUp, Bot, Clock3, Eye, Home, Inbox, Minus, Network, Package, PackageCheck, PanelsTopLeft, Plus, RotateCcw, RotateCw, Ship, ShoppingCart, Sparkles, Tag, Truck, Plane, Boxes } from 'lucide-react'
import { sim } from '../sim/sim'
import * as LAYOUT from '../sim/layout'
import { useStore, type CamCmd } from '../store'
import type { SiteId } from '../sim/world'
import { num } from './format'
import { L, plural } from '../i18n'

function Kpi({ icon, label, value, unit, delta, sub }: { icon: ReactNode; label: string; value: string; unit?: string; delta: string; sub: string }) {
  return (
    <div className="panel flex min-w-[188px] items-center gap-3 whitespace-nowrap py-2.5 pl-3 pr-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">{icon}</span>
      <span className="min-w-0 leading-tight">
        <span className="block text-[11px] font-medium text-muted">{label}</span>
        <span className="mt-0.5 flex items-baseline gap-1.5">
          <span className="num text-[19px] font-bold tracking-[-0.02em] text-ink">{value}</span>
          {unit && <span className="text-[11px] font-semibold text-muted">{unit}</span>}
          <span className="num flex items-center text-[11px] font-semibold text-ok">
            <ArrowUp size={11} strokeWidth={3} />
            {delta}
          </span>
        </span>
        <span className="block text-[11px] text-faint">{sub}</span>
      </span>
    </div>
  )
}

function kpisFor(site: SiteId) {
  const st = sim.stats
  if (site === 'IC') {
    const working = sim.robots.filter((r) => r.state !== 'idle').length
    return [
      { icon: <ShoppingCart size={19} />, label: L('오늘 출고 주문', 'Orders out today'), value: num(sim.orders), unit: L('건', ''), delta: num(sim.orders - 8412 + 120), sub: L('AMR 피킹 · IC-03', 'AMR picking · IC-03') },
      { icon: <Bot size={19} />, label: L('AMR 가동', 'AMRs active'), value: `${working}/${sim.robots.length}`, unit: L('대', ''), delta: String(working), sub: L(`피킹 스테이션 4곳 · IC-03`, `4 picking stations · IC-03`) },
      { icon: <Package size={19} />, label: L('출고 파렛트', 'Outbound pallets'), value: num(st.icPallets), unit: L('개', ''), delta: String(st.icPallets - st.icPalletsBase + 12), sub: L('랩핑 후 윙바디 상차', 'Wrapped, then loaded on wing-body') },
    ]
  }
  if (site === 'IN') {
    const held = sim.inSlots.reduce((s, x) => s + x.held, 0) * 8
    const out = sim.vehicles.filter((v) => v.home === 'IN' && v.site === 'TW').length
    return [
      { icon: <Package size={19} />, label: L('슈트 분류 대기', 'Waiting at chutes'), value: num(held), unit: L('박스', 'boxes'), delta: String(sim.inParcels.length), sub: L('휠소터 → 기사별 슈트', 'Wheel sorter → per-driver chutes') },
      { icon: <Truck size={19} />, label: L('배송 출발 차량', 'Vans out'), value: `${out}/12`, unit: L('대', ''), delta: String(out), sub: L('다온마을 라스트마일', 'Daon Village last mile') },
      { icon: <Clock3 size={19} />, label: L('당일 배송률', 'Same-day delivery'), value: '99.1%', delta: '0.2%', sub: L('최근 30일 · IN-05', 'Last 30 days · IN-05') },
    ]
  }
  if (site === 'TW') {
    const out = sim.vehicles.filter((v) => v.home === 'IN' && v.site === 'TW')
    const walking = out.filter((v) => v.walk.on).length
    return [
      { icon: <PackageCheck size={19} />, label: L('오늘 배송 완료', 'Delivered today'), value: num(st.delivered), unit: L('박스', 'boxes'), delta: num(st.delivered - st.deliveredBase + 64), sub: L('다온마을 배송구역', 'Daon Village Delivery Zone') },
      { icon: <Truck size={19} />, label: L('운행 중 1톤', '1-ton vans out'), value: String(out.length), unit: L('대', ''), delta: String(walking), sub: L(`${walking}명 문 앞 배송 중`, `${walking} delivering to doorsteps`) },
      { icon: <Inbox size={19} />, label: L('무인택배함 보관', 'In parcel lockers'), value: String(st.lockerBoxes), unit: L('건', ''), delta: '3', sub: L('관리동 무인택배함', 'Admin building parcel locker') },
    ]
  }
  if (site === 'DJ') {
    const trucks = sim.vehicles.filter((v) => v.home === 'DJ')
    const here = trucks.filter((v) => v.site === 'DJ' && v.visible).length
    const moving = trucks.filter((v) => v.visible && (v.phase === 'highway' || v.phase === 'enroute' || v.phase === 'departing')).length
    const trips = sim.djDocks.reduce((s, d) => s + d.today, 0)
    const cage = sim.hub.cages.find((c) => c.dest === 'DJ')
    return [
      { icon: <Truck size={19} />, label: L('곤지암 ↔ 대전 간선', 'Gonjiam ↔ Daejeon linehaul'), value: String(trips), unit: L('회', plural(trips, 'trip')), delta: String(moving), sub: L(`${moving}대 운행 중 · 도크 ${here}/${sim.djDocks.length}`, `${moving} on the road · Docks ${here}/${sim.djDocks.length}`) },
      { icon: <Boxes size={19} />, label: L('대전행 분류(곤지암)', 'Sorted for Daejeon (Gonjiam)'), value: num(sim.hub.stats.byDest.DJ), unit: L('박스', 'boxes'), delta: String(cage?.count ?? 0), sub: L(`대전 롤테이너 적재 ${cage?.count ?? 0}/24`, `Daejeon roll cage ${cage?.count ?? 0}/24`) },
      { icon: <Package size={19} />, label: L('대전 하역 물량', 'Unloaded at Daejeon'), value: num(trips * 1200), unit: L('박스', 'boxes'), delta: '1,200', sub: L('11톤 1대 = 1,200박스', '1 × 11-ton truck = 1,200 boxes') },
    ]
  }
  if (site === 'AP') {
    const A = sim.airport
    const S = A.stats
    const parked = A.aircraft.filter((a) => a.phase === 'parked').length
    return [
      { icon: <Plane size={19} />, label: L('오늘 화물기 운항', 'Freighter flights today'), value: `${S.landed + 14} · ${S.departed + 13}`, unit: L('편', ''), delta: String(parked), sub: L(`도착 · 출발 · 주기장 ${parked}/2 작업 중`, `Arr · Dep · ${parked}/2 stands working`) },
      { icon: <Boxes size={19} />, label: L('ULD 하역 · 적재', 'ULDs unloaded · loaded'), value: `${S.uldIn} · ${S.uldOut}`, unit: L('개', ''), delta: num(S.tons + 412), sub: L(`탑재 ${num(S.tons + 412)}톤 · 메인덱 로더`, `${num(S.tons + 412)} t loaded · Main-deck loader`) },
      { icon: <Sparkles size={19} />, label: L('AI 항공 위험물 검사', 'AI air DG screening'), value: String(S.screened), unit: L('건', ''), delta: String(S.held), sub: L(`탑재 보류 ${S.held} · 냉장 ${S.cold} · X-ray ${S.xray}`, `Held ${S.held} · Chilled ${S.cold} · X-ray ${S.xray}`) },
    ]
  }
  if (site === 'BS') {
    const P = sim.port.stats
    const busy = sim.port.agvs.filter((a) => a.box).length
    return [
      { icon: <Ship size={19} />, label: L('양하 · 적하', 'Discharged · Loaded'), value: `${P.discharged} · ${P.loaded}`, unit: L('개', ''), delta: String(P.cycles), sub: L(`누적 ${num(sim.teu)} TEU · 듀얼 사이클링`, `${num(sim.teu)} TEU total · Dual cycling`) },
      { icon: <Bot size={19} />, label: L('AGV 적재 운행', 'AGVs carrying'), value: `${busy}/${sim.port.agvs.length}`, unit: L('대', ''), delta: String(busy), sub: L('안벽 ↔ 자동화 야드', 'Quay ↔ automated yard') },
      { icon: <Sparkles size={19} />, label: L('AI 통관 검토', 'AI customs review'), value: String(P.dg + P.reefer + P.xray), unit: L('건', ''), delta: String(P.xray), sub: L(`위험물 ${P.dg} · 냉동 ${P.reefer} · X-ray ${P.xray}`, `DG ${P.dg} · Reefer ${P.reefer} · X-ray ${P.xray}`) },
    ]
  }
  const onSite = sim.vehicles.filter((v) => v.visible && v.x > LAYOUT.SITE.x0 && v.x < LAYOUT.SITE.x1 + 2 && v.z > LAYOUT.SITE.z0 && v.z < LAYOUT.SITE.z1).length
  const inbound = sim.vehicles.filter((v) => v.visible && v.site === 'GJ' && (v.phase === 'enroute' || v.phase === 'highway')).length
  return [
    { icon: <Package size={19} />, label: L('오늘 처리 물량', 'Processed today'), value: num(st.boxes), unit: L('박스', 'boxes'), delta: num(2140 + st.boxes - st.boxesBase), sub: L('분류 완료 · GJ-01', 'Sorted · GJ-01') },
    { icon: <Truck size={19} />, label: L('구내 차량', 'Vehicles on site'), value: String(onSite), unit: L('대', ''), delta: String(inbound), sub: L(`${inbound}대 진입 중 · CY ${sim.cy.count}TEU`, `${inbound} inbound · CY ${sim.cy.count} TEU`) },
    (() => {
      // 화면을 연 뒤 간선 도착 약속 실측(도착이 쌓이기 전에는 지난 30일 값)
      const rate = sim.promises.onTimeRate
      const n = sim.promises.stats.ontime + sim.promises.stats.late
      return rate === null
        ? { icon: <Clock3 size={19} />, label: L('정시 도착률', 'On-time arrival'), value: `${st.onTime.toFixed(1)}%`, delta: '0.4%', sub: L('최근 30일 · 간선 도착 약속', 'Last 30 days · Linehaul arrival promise') }
        : { icon: <Clock3 size={19} />, label: L('정시 도착률', 'On-time arrival'), value: `${rate.toFixed(1)}%`, delta: String(n), sub: L(`화면을 연 뒤 간선 ${n}회 · 지연 ${sim.promises.stats.late}`, `${n} linehaul ${plural(n, 'run')} since open · ${sim.promises.stats.late} late`) }
    })(),
  ]
}

export function Kpis() {
  useStore((s) => s.tick)
  const site = useStore((s) => s.site)
  const view = useStore((s) => s.view)
  const items = view === 'network'
    ? [
        (() => {
          let risk = 0
          let late = 0
          for (const v of sim.vehicles) {
            const s = sim.promises.status(v)
            if (s?.state === 'risk') risk++
            else if (s?.state === 'late') late++
          }
          return { icon: <Network size={19} />, label: L('운행 중 차량', 'Vehicles on the road'), value: String(sim.vehicles.filter((v) => v.visible && (v.phase === 'highway' || v.phase === 'delivering')).length), unit: L('대', ''), delta: String(sim.vehicles.length), sub: L(`도착 약속 위험 ${risk} · 지연 ${late}`, `Promise at risk ${risk} · Late ${late}`) }
        })(),
        { icon: <Package size={19} />, label: L('오늘 처리 물량', 'Processed today'), value: num(sim.stats.boxes), unit: L('박스', 'boxes'), delta: num(2140 + sim.stats.boxes - sim.stats.boxesBase), sub: L('곤지암 허브 기준', 'At Gonjiam Hub') },
        { icon: <PackageCheck size={19} />, label: L('오늘 배송 완료', 'Delivered today'), value: num(sim.stats.delivered), unit: L('박스', 'boxes'), delta: num(sim.stats.delivered - sim.stats.deliveredBase + 64), sub: L('다온마을 배송구역', 'Daon Village Delivery Zone') },
      ]
    : kpisFor(site)
  return (
    <div className="pointer-events-auto absolute left-4 top-[72px] z-20 flex gap-2.5">
      {items.map((k) => (
        <Kpi key={k.label} {...k} />
      ))}
    </div>
  )
}

export function MapControls() {
  const cam = (c: CamCmd) => () => useStore.getState().camera(c)
  const labels = useStore((s) => s.labels)
  const panels = useStore((s) => s.panels)
  const view = useStore((s) => s.view)
  const beaconMode = useStore((s) => s.beaconMode)
  const lens = useStore((s) => s.lens)
  const btn = 'grid h-9 w-9 place-items-center text-ink-2 hover:bg-line-2 hover:text-ink transition-colors'
  const on = 'grid h-9 w-9 place-items-center bg-brand-soft text-brand transition-colors'
  return (
    <div className={`pointer-events-auto absolute ${panels ? 'right-[332px]' : 'right-4'} top-[72px] z-20 flex flex-col items-end`}>
      <div className="panel flex flex-col overflow-hidden">
        <button type="button" aria-label={L('확대', 'Zoom in')} title={L('확대', 'Zoom in')} className={btn} onClick={cam('zoomIn')}><Plus size={17} /></button>
        <button type="button" aria-label={L('축소', 'Zoom out')} title={L('축소', 'Zoom out')} className={`${btn} border-t border-line`} onClick={cam('zoomOut')}><Minus size={17} /></button>
      </div>
      <div className="panel mt-2 flex flex-col overflow-hidden">
        <button type="button" aria-label={L('왼쪽으로 회전', 'Rotate left')} title={L('왼쪽으로 회전', 'Rotate left')} className={btn} onClick={cam('rotL')}><RotateCcw size={16} /></button>
        <button type="button" aria-label={L('오른쪽으로 회전', 'Rotate right')} title={L('오른쪽으로 회전', 'Rotate right')} className={`${btn} border-t border-line`} onClick={cam('rotR')}><RotateCw size={16} /></button>
        <button type="button" aria-label={L('전체 보기', 'Reset view')} title={L('전체 보기', 'Reset view')} className={`${btn} border-t border-line`} onClick={cam('home')}><Home size={16} /></button>
      </div>
      {view === 'network' && (
        <div className="panel mt-2 w-[118px] p-1.5 text-[10.5px]">
          <div className="mb-1 font-semibold text-ink">{L('차량 점 색', 'Vehicle dots')}</div>
          <div className="flex gap-1">
            {(['kind', 'promise'] as const).map((m) => (
              <button key={m} type="button" aria-pressed={beaconMode === m} onClick={() => useStore.getState().setBeaconMode(m)} className={`flex-1 rounded-md px-1 py-0.5 font-semibold ${beaconMode === m ? 'bg-brand text-white' : 'bg-line-2 text-muted hover:text-ink'}`}>
                {m === 'kind' ? L('차종', 'Type') : L('약속', 'Promise')}
              </button>
            ))}
          </div>
          {beaconMode === 'promise' && (
            <div className="mt-1.5 space-y-0.5 text-muted">
              {[['#22B07D', L('정시', 'On time')], ['#F2A33A', L('위험', 'At risk')], ['#E8453C', L('지연', 'Late')], ['#A3ABBF', L('약속 없음', 'No promise')]].map(([c, t]) => (
                <div key={t} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: c }} />{t}</div>
              ))}
            </div>
          )}
        </div>
      )}
      {view === 'site' && labels && (
        <div className="panel mt-2 w-[118px] p-1.5 text-[10.5px]">
          <div className="mb-1 font-semibold text-ink">{L('이름표', 'Labels')}</div>
          <div className="flex gap-1" role="group" aria-label={L('이름표 묶음', 'Label groups')}>
            {([['vehicles', L('차량', 'Fleet')], ['facilities', L('시설', 'Infra')], ['all', L('전체', 'All')]] as const).map(([k, t]) => (
              <button key={k} type="button" aria-pressed={lens === k} onClick={() => useStore.getState().setLens(k)} className={`flex-1 rounded-md px-0.5 py-0.5 font-semibold ${lens === k ? 'bg-brand text-white' : 'bg-line-2 text-muted hover:text-ink'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="panel mt-2 flex flex-col overflow-hidden">
        <button type="button" aria-label={L('이름표 보기', 'Show labels')} title={labels ? L('이름표 숨기기', 'Hide labels') : L('이름표 보기', 'Show labels')} aria-pressed={labels} className={labels ? on : btn} onClick={() => useStore.getState().setLabels(!labels)}><Tag size={16} /></button>
        <button type="button" aria-label={L('패널 보기', 'Show panels')} title={panels ? L('패널 숨기기(장면만 보기)', 'Hide panels (scene only)') : L('패널 보기', 'Show panels')} aria-pressed={panels} className={`${panels ? on : btn} border-t border-line`} onClick={() => useStore.getState().setPanels(!panels)}>{panels ? <PanelsTopLeft size={16} /> : <Eye size={16} />}</button>
      </div>
    </div>
  )
}

export function Toast() {
  const toast = useStore((s) => s.toast)
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (!toast) return
    setShow(true)
    const id = setTimeout(() => setShow(false), 4200)
    return () => clearTimeout(id)
  }, [toast])
  if (!toast || !show) return null
  return (
    <div className="rise pointer-events-none absolute left-1/2 top-[76px] z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[12px] font-medium text-white shadow-lg">
      {toast.text}
    </div>
  )
}
