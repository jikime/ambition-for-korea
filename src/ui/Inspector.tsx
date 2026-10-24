import { useState, type ReactNode } from 'react'
import { Bot, Crosshair, Loader2, Sparkles, UserRound, X } from 'lucide-react'
import { sim, SPEEDUP, type MemoPlan, type Vehicle } from '../sim/sim'
import { CARRIERS, ITEMS, type ItemKey } from '../sim/data'
import { FLOWS, SITE_META, SITE_ORDER, type SiteId } from '../sim/world'
import { STOPS } from '../sim/sites'
import { BAY_CAP, PORT, VESSELS } from '../sim/port'
import { CAGE_CAP, DEST_LABEL, DESTS } from '../sim/hub'
import { LINK_LABEL } from '../sim/incidents'
import { AP } from '../sim/airport'
import { useStore, type Selection } from '../store'
import { CarrierMark, Glyph, ItemIcon, type GlyphKind } from './icons'
import { Bar, Chip, IconButton, Row, SectionTitle } from './primitives'
import {
  DROP_LABEL, DROP_SHORT, STORY_STEPS, aircraftState, cargoLabel, carrierName, craneState, equipName, dockInfo, forkliftStatus, forkliftTask, hhmm, isMoving, loadLabel, num, boxesAboard, promiseChip,
  palletStatus, resLabel, siteCode, siteSummary as siteSummaryText, storyAddress, vehicleEta, vehicleKindLabel, vehicleStatus, type Tone,
} from './format'
import { ai } from '../sim/ai'
import { AMR_STATE, personInfo, podCell, podName } from './people'
import { DISPOSITION_LABEL, REASON_LABEL, RETURN_STEPS } from '../sim/cs'
import { DRIVE_LIMIT, DRIVE_TIRED, REST_AREAS, REST_MIN } from '../sim/rest'
import { CAUSE_LABEL } from '../sim/promise'
import { ROUTE_KM } from '../sim/carbon'
import { VCAUSE_LABEL, type VesselCause } from '../sim/vessel'
import { RAIL_STATE_LABEL, STOP, type TermId } from '../sim/rail'
import { BARGE, BARGE_STATE } from '../sim/barge'
import { L, LL, plural } from '../i18n'

function Header({ glyph, kicker, kickerColor, title, sub, sel, followable }: {
  glyph: ReactNode
  kicker: ReactNode
  kickerColor?: string
  title: string
  sub: string
  sel?: Selection
  followable?: boolean
}) {
  const follow = useStore((s) => s.follow)
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#F2F5FC]">{glyph}</span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[10.5px] font-bold uppercase tracking-[0.04em]" style={{ color: kickerColor ?? '#2F55E6' }}>{kicker}</span>
        <span className="block truncate text-[16px] font-bold tracking-[-0.01em] text-ink">{title}</span>
        <span className="block truncate text-[11.5px] text-muted">{sub}</span>
      </span>
      {sel && (
        <span className="flex gap-1">
          {followable && (
            <IconButton label={follow ? L('추적 해제', 'Stop following') : L('카메라 추적', 'Follow camera')} active={follow} onClick={() => useStore.getState().setFollow(!follow)}>
              <Crosshair size={14} />
            </IconButton>
          )}
          <IconButton label={L('닫기', 'Close')} onClick={() => useStore.getState().select(null)}>
            <X size={14} />
          </IconButton>
        </span>
      )}
    </div>
  )
}

function StatusLine({ tone, label, text }: { tone: Tone; label: string; text?: string }) {
  return (
    <div className="mt-3 flex items-center gap-2 text-[12px]">
      <Chip tone={tone}>{label}</Chip>
      {text && <span className="truncate text-muted">{text}</span>}
    </div>
  )
}

function Stat({ label, value, total, unit, tone = 'blue' }: { label: string; value: number | string; total?: number; unit?: string; tone?: Tone }) {
  return (
    <div className="rounded-xl border border-line-2 bg-[#FAFBFE] px-2.5 py-2">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="num mt-0.5 text-[14px] font-bold text-ink">
        {typeof value === 'number' ? num(value) : value}
        {total !== undefined && <span className="text-[11px] font-medium text-muted"> / {num(total)}</span>}
        {unit && <span className="text-[11px] font-medium text-muted"> {unit}</span>}
      </div>
      {total !== undefined && typeof value === 'number' && <Bar value={value / total} tone={tone} className="mt-1.5" />}
    </div>
  )
}

function Inventory({ rows }: { rows: { item: ItemKey; qty: number; low?: boolean }[] }) {
  return (
    <div className="divide-y divide-line-2">
      {rows.map((r) => (
        <div key={r.item} className="flex items-center gap-2.5 py-[7px] text-[12px]">
          <ItemIcon item={r.item} size={20} />
          <span className="flex-1 truncate text-ink">{ITEMS[r.item].name}</span>
          <span className="num font-semibold text-ink">{num(r.qty)}</span>
          <Chip tone={r.low ? 'amber' : 'green'} className="w-[38px] justify-center">{r.low ? L('부족', 'Low') : L('정상', 'OK')}</Chip>
        </div>
      ))}
    </div>
  )
}

function ForkliftLead({ site }: { site: 'GJ' | 'IC' }) {
  const fl = sim.forklifts.filter((f) => f.site === site)
  const working = fl.filter((f) => ['unloading', 'loading', 'putaway', 'toJob'].includes(f.status))
  const lead = working[0] ?? fl[0]
  return (
    <>
      <SectionTitle right={L(`${working.length}/${fl.length} 작업 중`, `${working.length}/${fl.length} working`)}>{L('지게차 현황', 'Forklifts')}</SectionTitle>
      <button type="button" onClick={() => useStore.getState().select({ kind: 'forklift', id: lead.id })} className="flex w-full items-center gap-2.5 rounded-lg py-1 text-left text-[12px] hover:bg-line-2">
        <span className="font-semibold">{lead.id}</span>
        <span className="flex-1 truncate text-muted">{forkliftTask(lead)}</span>
        <Bar value={lead.battery / 100} tone={lead.battery < 30 ? 'amber' : 'green'} className="w-12" />
        <span className="num w-8 text-right text-muted">{Math.round(lead.battery)}%</span>
      </button>
    </>
  )
}

function SiteView({ id }: { id: SiteId }) {
  const m = SITE_META[id]
  const head = <Header glyph={<Glyph kind={id === 'BS' ? 'crane' : id === 'TW' ? 'locker' : id === 'IN' ? 'sorter' : 'site'} />} kicker={`${m.type} · ${m.code}`} title={m.name} sub={m.address} />
  if (id === 'GJ') {
    const busy = sim.bays.filter((b) => b.vehicle).length + sim.docks.filter((d) => d.vehicle).length
    const arriving = sim.vehicles.filter((v) => v.visible && v.site === 'GJ' && (v.phase === 'enroute' || v.phase === 'gate')).length
    return (
      <>
        {head}
        <StatusLine tone="green" label={L('정상 운영', 'Normal ops')} text={L(`도크 ${busy}/6 · ${arriving}대 진입 · CY ${sim.cy.count} TEU · 철송 ${sim.rail.gj.count(0)}개 하역 대기`, `Docks ${busy}/6 · ${arriving} entering · CY ${sim.cy.count} TEU · ${sim.rail.gj.count(0)} off rail`)} />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Stat label={L('보관 재고', 'Stock')} value={sim.stats.stock} total={1800} />
          <Stat label={L('도크 사용', 'Docks in use')} value={busy} total={6} tone="green" />
          <Stat label={L('오늘 간선 출고', 'Linehaul out today')} value={sim.stats.trucksOut} unit={L('대', plural(sim.stats.trucksOut, 'truck'))} />
          <Stat label={L('오늘 입고', 'Received today')} value={sim.stats.palletsIn} unit={L('파렛트', plural(sim.stats.palletsIn, 'pallet'))} />
        </div>
        <SectionTitle right={<span className="flex items-center gap-1"><Sparkles size={11} />AI</span>}>{L('분류동 크로스벨트 소터', 'Cross-belt sorter')}</SectionTitle>
        <button type="button" onClick={() => useStore.getState().select({ kind: 'sorter', id: 'X1' }, 'GJ')} className="flex w-full items-center gap-2 rounded-lg bg-[#FAFBFE] px-2.5 py-2 text-left text-[12px] hover:bg-line-2">
          <span className="flex-1">
            <span className="font-semibold">X1 · {sim.hub.rate ? L(`${num(sim.hub.rate)} 박스/시`, `${num(sim.hub.rate)} boxes/h`) : L('가동 중', 'Running')}</span>
            <span className="block text-[11px] text-muted">{L(`리젝트 ${sim.hub.stats.rejects}건 중 AI 재분류 ${sim.hub.stats.ai} · 수작업 ${sim.hub.stats.manual} · 이형물 ${sim.hub.stats.irregular}`, `${sim.hub.stats.rejects} rejects: AI re-sorted ${sim.hub.stats.ai} · manual ${sim.hub.stats.manual} · irregular ${sim.hub.stats.irregular}`)}</span>
          </span>
          <span className="text-faint">›</span>
        </button>
        <RailShuttleCard here="GJ" />
        <SectionTitle right={L('수량', 'Qty')}>{L('주요 재고', 'Key stock')}</SectionTitle>
        <Inventory rows={[{ item: 'water', qty: 1906 }, { item: 'rice', qty: 297 }, { item: 'tissue', qty: 212, low: true }, { item: 'box', qty: 4448 }]} />
        <ForkliftLead site="GJ" />
      </>
    )
  }
  if (id === 'IC') {
    const loading = sim.vehicles.filter((v) => v.site === 'IC' && v.kind === 'wing' && v.phase === 'loading').length
    const robots = sim.robots.filter((r) => r.state !== 'idle').length
    return (
      <>
        {head}
        <StatusLine tone="green" label={L('정상 운영', 'Normal ops')} text={L(`윙바디 ${loading}대 상차 · AMR ${robots}대 가동`, `${loading} ${plural(loading, 'wing-body', 'wing-bodies')} loading · ${robots} ${plural(robots, 'AMR')} active`)} />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Stat label={L('오늘 출고 주문', 'Orders out today')} value={sim.orders} unit={L('건', '')} />
          <Stat label={L('AMR 가동', 'AMRs active')} value={robots} total={sim.robots.length} tone="green" />
          <Stat label={L('출고 파렛트', 'Pallets out')} value={sim.stats.icPallets} unit={L('개', '')} />
          <Stat label={L('냉동 도크', 'Reefer docks')} value={sim.icReefers.filter((d) => d.vehicle).length} total={2} />
        </div>
        <SectionTitle right={L('재고', 'Stock')}>{L('보관 재고 (상온·냉장)', 'Stock (ambient · chilled)')}</SectionTitle>
        <Inventory rows={[{ item: 'water', qty: 8420 }, { item: 'ramen', qty: 6210 }, { item: 'detergent', qty: 1180 }, { item: 'petfood', qty: 640, low: true }]} />
        <ForkliftLead site="IC" />
      </>
    )
  }
  if (id === 'IN') {
    const home = sim.vehicles.filter((v) => v.home === 'IN')
    const held = sim.inSlots.reduce((s, x) => s + x.held, 0) * 8
    const unloading = sim.inDocks.filter((d) => d.vehicle && sim.vehicle(d.vehicle)?.phase === 'unloading').length
    return (
      <>
        {head}
        <StatusLine tone="green" label={L('분류 중', 'Sorting')} text={L(`간선 하차 ${unloading}/2 · 슈트 대기 ${num(held)}박스`, `Linehaul unloading ${unloading}/2 · ${num(held)} boxes at chutes`)} />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Stat label={L('터미널 대기 기사', 'Drivers at terminal')} value={home.filter((v) => v.site === 'IN').length} total={12} tone="green" />
          <Stat label={L('배송 중 기사', 'Drivers delivering')} value={home.filter((v) => v.site === 'TW').length} total={12} />
          <Stat label={L('벨트 위 상자', 'Boxes on belt')} value={sim.inParcels.filter((p) => p.phase < 2).length} unit={L('개', '')} />
          <Stat label={L('휠소터 인식률', 'Wheel sorter read rate')} value="99.6%" />
        </div>
        <SectionTitle right={L('상차', 'Loading')}>{L('기사별 슬롯', 'Driver slots')}</SectionTitle>
        <div className="grid grid-cols-6 gap-1">
          {sim.inSlots.map((s) => {
            const v = s.vehicle ? sim.vehicle(s.vehicle) : null
            const here = v?.site === 'IN'
            return (
              <button key={s.id} type="button" onClick={() => useStore.getState().select({ kind: 'dock', id: s.id }, 'IN')} className={`rounded-md px-1 py-1 text-center text-[10.5px] font-semibold ${here ? 'bg-ok-soft text-ok' : 'bg-brand-soft text-brand'}`}>
                {s.id}
                <span className="num block text-[10px] font-medium opacity-80">{here ? `${v!.cargoDone}` : L('배송', 'Out')}</span>
              </button>
            )
          })}
        </div>
      </>
    )
  }
  if (id === 'AP') return <AirportView head={head} />
  if (id === 'DJ') {
    const trucks = sim.vehicles.filter((v) => v.home === 'DJ')
    return (
      <>
        {head}
        <StatusLine tone="green" label={L('정상 운영', 'Normal ops')} text={L(`대전·충청행 롤테이너 하역 · 도크 ${sim.djDocks.filter((d) => d.vehicle).length}/${sim.djDocks.length}`, `Unloading Daejeon-bound cages · Docks ${sim.djDocks.filter((d) => d.vehicle).length}/${sim.djDocks.length}`)} />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Stat label={L('오늘 간선 하역', 'Linehaul unloads today')} value={sim.djDocks.reduce((s, d) => s + d.today, 0)} unit={L('회', '')} />
          <Stat label={L('대전행 분류(곤지암)', 'Sorted to DJ (Gonjiam)')} value={sim.hub.stats.byDest.DJ} unit={L('박스', plural(sim.hub.stats.byDest.DJ, 'box', 'boxes'))} />
        </div>
        <SectionTitle right={L('곤지암 ↔ 대전', 'Gonjiam ↔ Daejeon')}>{L('11톤 간선', '11-ton linehaul')}</SectionTitle>
        <div className="divide-y divide-line-2">
          {trucks.map((v) => (
            <button key={v.id} type="button" onClick={() => useStore.getState().select({ kind: 'vehicle', id: v.id })} className="flex w-full items-center justify-between py-[7px] text-left text-[12px] hover:bg-line-2">
              <span className="font-semibold text-ink">{v.id}</span>
              <span className="text-muted">{vehicleStatus(v).label} · {v.site === 'DJ' ? L('대전', 'Daejeon') : v.site === 'GJ' ? L('곤지암', 'Gonjiam') : L('간선', 'Linehaul')}</span>
            </button>
          ))}
        </div>
        <SectionTitle right={L('도크', 'Docks')}>{L('대전 하역 도크', 'Daejeon unloading docks')}</SectionTitle>
        <div className="grid grid-cols-3 gap-1">
          {sim.djDocks.map((d) => (
            <button key={d.id} type="button" onClick={() => useStore.getState().select({ kind: 'dock', id: d.id }, 'DJ')} className={`rounded-md px-1 py-1.5 text-center text-[11px] font-semibold ${d.vehicle ? 'bg-ok-soft text-ok' : 'bg-line-2 text-muted'}`}>
              {d.id}
              <span className="block text-[10px] font-medium opacity-80">{d.vehicle ?? L('비어 있음', 'Empty')}</span>
            </button>
          ))}
        </div>
      </>
    )
  }
  if (id === 'TW') {
    const out = sim.vehicles.filter((v) => v.home === 'IN' && v.site === 'TW')
    return (
      <>
        {head}
        <StatusLine tone="blue" label={L('배송 진행', 'Delivering')} text={L(`1톤 ${out.length}대 운행 · 문 앞 배송 ${out.filter((v) => v.walk.on).length}명`, `${out.length} 1-ton ${plural(out.length, 'van')} out · ${out.filter((v) => v.walk.on).length} at doorstep`)} />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Stat label={L('오늘 배송 완료', 'Delivered today')} value={sim.stats.delivered} unit={L('박스', plural(sim.stats.delivered, 'box', 'boxes'))} />
          <Stat label={L('무인택배함', 'Parcel locker')} value={sim.stats.lockerBoxes} unit={L('건', '')} />
        </div>
        <SectionTitle right={<span className="flex items-center gap-1"><Sparkles size={11} />AI</span>}>{L('배송 메모 해석', 'Delivery note reading')}</SectionTitle>
        <div className="mb-1 flex flex-wrap gap-1 text-[10.5px]">
          {Object.entries(sim.memoStats).filter(([, n]) => n > 0).map(([k, n]) => (
            <span key={k} className="num rounded-md bg-line-2 px-1.5 py-0.5 font-semibold text-ink-2">{DROP_LABEL[k]} {n}</span>
          ))}
        </div>
        <div className="space-y-1">
          {sim.memoLog.slice(0, 4).map((m, i) => (
            <div key={i} className="rounded-lg bg-[#FAFBFE] px-2 py-1.5 text-[11px]">
              <div className="flex items-center justify-between"><span className="font-semibold text-ink">{m.stop}</span><span className="num text-faint">{hhmm(m.time)}</span></div>
              <div className="truncate text-muted">“{m.text || L('메모 없음', 'No note')}”</div>
              <div className="mt-0.5 flex items-center gap-1.5"><Chip tone={m.mode === 'confirm' ? 'amber' : 'green'}>{DROP_LABEL[m.mode]}</Chip>{m.flags.map((f) => <Chip key={f} tone="amber">{f}</Chip>)}{m.confidence !== null && <span className="num text-faint">{m.confidence.toFixed(2)}</span>}</div>
              {m.note && <div className="mt-0.5 text-[10.5px] text-warn">{m.note}</div>}
            </div>
          ))}
        </div>
        <SectionTitle right={L('배송지', 'Next stop')}>{L('운행 중 기사', 'Drivers on route')}</SectionTitle>
        <div className="divide-y divide-line-2">
          {out.slice(0, 6).map((v) => (
            <button key={v.id} type="button" onClick={() => useStore.getState().select({ kind: 'vehicle', id: v.id }, 'TW')} className="flex w-full items-center gap-2 py-[6px] text-left text-[12px] hover:bg-line-2">
              <span className="font-semibold">{v.id}</span>
              <span className="flex-1 truncate text-muted">{v.stops[v.stopIdx]?.label ?? L('복귀 중', 'Returning')}</span>
              <span className="num text-muted">{v.delivered}/{v.stops.length}</span>
            </button>
          ))}
        </div>
      </>
    )
  }
  const P = sim.port
  const trailers = sim.vehicles.filter((v) => v.kind === 'trailer')
  const shipBoxes = P.ship.reduce((n, b) => n + b.length, 0)
  return (
    <>
      {head}
      {(() => {
        const B = P.berth
        const V = VESSELS[B.vessel]
        const label = B.phase === 'working' ? L('접안 작업', 'At berth') : B.phase === 'departing' ? L('출항 중', 'Departing') : B.phase === 'away' ? L('선석 비움', 'Berth empty') : L('입항 중', 'Arriving')
        const pct = Math.min(1, B.moves / B.target)
        // 남은 작업 시간: 크레인 3기 듀얼 사이클(한 사이클 2개)의 최근 속도로 추정
        const hours = (P.clock() - B.since) / 3600
        const rate = B.phase === 'working' && hours > 0.05 ? B.moves / hours : 0
        const left = rate > 0 ? Math.max(0, B.target - B.moves) / rate : null
        return (
          <>
            <StatusLine tone={B.phase === 'working' ? 'green' : 'blue'} label={label} text={L(`${V.name} · 선박 위 ${shipBoxes}개`, `${V.name} · ${shipBoxes} on board`)} />
            {sim.vessel.notices.slice(0, 2).map((n) => (
              <div key={n.id} className="mt-1.5 rounded-lg bg-line-2 px-2 py-1.5 text-[10.5px]">
                <div className="flex items-center gap-1.5">
                  <span className="num text-faint">{hhmm(n.time)}</span>
                  <span className="font-semibold text-ink-2">{L('선사 통보', 'Line notice')}</span>
                  {n.answer && <Chip tone={n.answer.skip > 0.6 ? 'red' : n.answer.confirmed > 0.6 && n.answer.delay >= 0.5 ? 'amber' : 'gray'}>{VCAUSE_LABEL[n.answer.cause as VesselCause] ?? n.answer.cause}{n.answer.confirmed > 0.6 ? L(' · 확정', ' · confirmed') : L(' · 미확정', ' · unconfirmed')}</Chip>}
                  <span className="ml-auto text-faint">{n.by === 'ai' ? 'AI' : n.by === 'rule' ? L('규칙', 'Rule') : L('판독 중', 'Reading…')}</span>
                </div>
                <div className="mt-0.5 text-ink-2">{n.text}</div>
                <div className="text-muted">→ {n.decision}</div>
              </div>
            ))}
            <div className="mt-2">
              <div className="flex justify-between text-[11px] text-muted"><span>{L('선박 작업 진행', 'Vessel progress')}</span><span className="num">{B.moves}/{B.target}{L(' 개', ' moves')} · {Math.round(pct * 100)}%</span></div>
              <Bar value={pct} tone={B.phase === 'working' ? 'green' : 'blue'} className="mt-1" />
              <div className="mt-1 text-[10.5px] text-faint">
                {B.phase === 'working' ? L(`크레인 시간당 ${rate ? Math.round(rate) : '-'}개 · 출항 예정 ${left !== null ? hhmm(P.clock() + left * 3600) : '-'}`, `Cranes ${rate ? Math.round(rate) : '-'}/h · ETD ${left !== null ? hhmm(P.clock() + left * 3600) : '-'}`) : L(`다음 배 ${VESSELS[(B.vessel + (B.phase === 'arriving' ? 0 : 1)) % VESSELS.length].name}`, `Next vessel ${VESSELS[(B.vessel + (B.phase === 'arriving' ? 0 : 1)) % VESSELS.length].name}`)}{P.windFactor < 1 ? L(` · 강풍 크레인 ${Math.round(P.windFactor * 100)}%`, ` · high wind: cranes ${Math.round(P.windFactor * 100)}%`) : ''}
              </div>
            </div>
          </>
        )
      })()}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stat label={L('양하(수입)', 'Discharged (import)')} value={P.stats.discharged} unit={L('개', '')} />
        <Stat label={L('적하(수출)', 'Loaded (export)')} value={P.stats.loaded} unit={L('개', '')} />
        <Stat label={L('위험물 블록 배정', 'Dangerous goods block')} value={P.stats.dg} unit={L('개', '')} />
        <Stat label={L('세관 X-ray', 'Customs X-ray')} value={P.stats.xray} unit={L('대', plural(P.stats.xray, 'truck'))} />
      </div>
      <BsHinterland />
      <SectionTitle right={L('상태', 'Status')}>{L('장비', 'Equipment')}</SectionTitle>
      <div className="divide-y divide-line-2">
        {[...P.sts.map((_, i) => `sts-${i}`), ...P.armgs.map((_, i) => `armg-${i}`).filter((_, i) => i % 2 === 0)].map((id) => (
          <button key={id} type="button" onClick={() => useStore.getState().select({ kind: 'crane', id }, 'BS')} className="flex w-full items-center gap-2 py-[6px] text-left text-[12px] hover:bg-line-2">
            <span className="w-[86px] shrink-0 font-semibold">{equipName(id).replace('안벽 크레인 ', '').replace('야드 크레인 ', '').replace('Quay crane ', '').replace('Yard crane ', '')}</span>
            <span className="flex-1 truncate text-muted">{craneState(id)}</span>
          </button>
        ))}
      </div>
      <SectionTitle right={<span className="flex items-center gap-1"><Sparkles size={11} />AI</span>}>{L('적하목록 AI 검토', 'Manifest AI review')}</SectionTitle>
      <div className="space-y-1">
        {P.log.slice(0, 4).map((l, i) => {
          const f = l.manifest?.flags
          return (
            <div key={i} className="rounded-lg bg-[#FAFBFE] px-2 py-1.5 text-[11px]">
              <div className="flex items-center justify-between"><span className="num font-semibold text-ink">{l.id}</span><span className="num text-faint">{hhmm(l.time)}</span></div>
              <div className="truncate text-muted">{L(`신고 “${l.manifest?.declared ?? ''}” · 실제 “${l.manifest?.description ?? ''}”`, `Declared “${l.manifest?.declared ?? ''}” · actual “${l.manifest?.description ?? ''}”`)}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1">
                <Chip tone={f && f.dangerous > 0.5 ? 'red' : f && f.reefer > 0.5 ? 'blue' : 'gray'}>{l.decision}</Chip>
                {f && <span className="num text-faint">{L(`위험 ${f.dangerous.toFixed(2)} · 냉동 ${f.reefer.toFixed(2)} · 불일치 ${f.mismatch.toFixed(2)}`, `DG ${f.dangerous.toFixed(2)} · reefer ${f.reefer.toFixed(2)} · mismatch ${f.mismatch.toFixed(2)}`)}</span>}
              </div>
            </div>
          )
        })}
        {!P.log.length && <div className="text-[11.5px] text-muted">{L('양하가 시작되면 표시됩니다', 'Shown once discharge starts')}</div>}
      </div>
      <SectionTitle right={L('위치', 'Location')}>{L('트레일러', 'Trailers')}</SectionTitle>
      {trailers.map((v) => (
        <button key={v.id} type="button" onClick={() => useStore.getState().select({ kind: 'vehicle', id: v.id }, v.site)} className="flex w-full items-center gap-2 py-[6px] text-left text-[12px] hover:bg-line-2">
          <span className="font-semibold">{v.id}</span>
          <span className="flex-1 truncate text-muted">{vehicleStatus(v).label} · {siteCode(v.phase === 'highway' ? v.dest : v.site)}</span>
        </button>
      ))}
    </>
  )
}

type VTab = 'overview' | 'route' | 'load' | 'log'
const VTABS: [VTab, string][] = [['overview', L('개요', 'Overview')], ['route', L('경로', 'Route')], ['load', L('적재', 'Load')], ['log', L('기록', 'Log')]]

/** 차량: 머리(상태·진행) 아래를 개요 · 경로 · 적재 · 기록 탭으로 나눈다(항만 관제 영상의 인스펙터 탭) */
function VehicleView({ v }: { v: Vehicle }) {
  const [tab, setTab] = useState<VTab>('overview')
  const s = vehicleStatus(v)
  const eta = vehicleEta(v)
  const moving = isMoving(v)
  const dist = v.route && !v.route.done ? v.route.remaining() : 0
  const work = v.phase === 'unloading' || v.phase === 'loading' || v.phase === 'closing'
  const progress = work ? v.cargoDone / Math.max(1, v.cargoTotal) : v.kind === 'van' && v.site === 'TW' ? v.delivered / Math.max(1, v.stops.length) : moving && v.route ? 1 - Math.min(1, dist / 600) : 1
  const carrier = CARRIERS[v.carrier]
  const res = resLabel(v)
  const where = v.phase === 'highway' ? L(`${siteCode(v.site)} → ${siteCode(v.dest)} 간선도로`, `${siteCode(v.site)} → ${siteCode(v.dest)} highway`) : v.kind === 'van' && v.site === 'TW' ? v.walk.on ? L(`${STOPS[v.walk.stop]?.label ?? ''} 문 앞`, `${STOPS[v.walk.stop]?.label ?? ''} · doorstep`) : L(`다음: ${v.stops[v.stopIdx]?.label ?? '터미널 복귀'}`, `Next: ${v.stops[v.stopIdx]?.label ?? 'back to terminal'}`) : `${siteCode(v.site)} · ${res}`
  const glyph: GlyphKind = v.kind === 'reefer' ? 'reefer' : v.kind === 'trailer' ? 'trailer' : v.kind
  const pc = v.promise ? promiseChip(v) : null
  const town = v.kind === 'van' && v.home === 'IN' && v.stops.length > 0
  const dot: Partial<Record<VTab, string>> = {
    route: pc && pc.tone !== 'green' && pc.tone !== 'gray' ? (pc.tone === 'red' ? 'bg-bad' : 'bg-warn') : town && sim.promises.vanRisks(v).length ? 'bg-warn' : '',
  }
  return (
    <>
      <Header
        glyph={<Glyph kind={glyph} color={v.kind === 'reefer' ? '#13A39A' : carrier.color} />}
        kicker={<span className="flex items-center gap-1"><CarrierMark carrier={v.carrier} size={12} />{carrierName(v)}</span>}
        kickerColor={v.kind === 'reefer' ? '#0C7A73' : carrier.color}
        title={v.id}
        sub={`${v.driver} · ${v.plate}`}
        sel={{ kind: 'vehicle', id: v.id }}
        followable
      />
      <StatusLine tone={s.tone} label={s.label} text={where} />
      <Bar value={progress} tone={work ? 'green' : 'blue'} className="mt-2.5" />
      <div className="num mt-1 text-right text-[11px] text-muted">
        {work ? cargoLabel(v) : moving && dist > 0 ? L(`${dist > 1000 ? (dist / 1000).toFixed(1) + ' km' : Math.round(dist) + ' m'} 남음`, `${dist > 1000 ? (dist / 1000).toFixed(1) + ' km' : Math.round(dist) + ' m'} left`) : cargoLabel(v)}
      </div>
      <div role="tablist" aria-label={L('차량 정보', 'Vehicle info')} className="mt-1.5 flex gap-0.5 rounded-lg bg-line-2 p-0.5">
        {VTABS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`flex flex-1 items-center justify-center gap-1 rounded-md py-1 text-[11.5px] font-semibold ${tab === k ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
          >
            {label}
            {dot[k] && <span className={`h-1.5 w-1.5 rounded-full ${dot[k]}`} />}
          </button>
        ))}
      </div>
      {tab === 'overview' && (
        <div className="mt-1 divide-y divide-line-2">
          <Row label={v.kind === 'van' ? L('송장 번호', 'Label no.') : L('운송장', 'Waybill')}><span className="text-brand">#{v.shipment.no}</span></Row>
          <Row label={L('구간', 'Leg')}>{v.shipment.origin.replace(/^[A-Z]{2}-\d\d /, '')} → {v.shipment.dest.replace(/^[A-Z]{2}-\d\d /, '')}</Row>
          <Row label={v.kind === 'van' ? L('배송', 'Delivery') : L('화주', 'Shipper')}>{town ? L(`${v.stops.length}곳 · ${v.variant === 'villa' ? '빌라·상가' : '아파트 단지'}`, `${v.stops.length} ${plural(v.stops.length, 'stop')} · ${v.variant === 'villa' ? 'villas & shops' : 'apartments'}`) : v.shipment.customer}</Row>
          <Row label={work ? L('작업 완료 예정', 'Done by') : L('도착 예정', 'ETA')}>{eta ? L(`${hhmm(eta.clock)} (${eta.min}분)`, `${hhmm(eta.clock)} (${eta.min} min)`) : '-'}</Row>
          {pc && <Row label={L('도착 약속', 'Arrival promise')}><Chip tone={pc.tone}>{pc.label}</Chip></Row>}
          <Row label={L('속도', 'Speed')}>{v.kmh} km/h</Row>
          <Row label={L('위치', 'Location')}>{res}</Row>
          <Row label={L('차종', 'Vehicle type')}>{vehicleKindLabel(v)}</Row>
        </div>
      )}
      {tab === 'route' && (
        <>
          {v.promise && <PromiseBlock v={v} />}
          {v.promise && v.promise.arrived === null && (() => {
            // 간선 실거리(예시)와 시간 진행으로 본 대략의 위치
            const km = ROUTE_KM[`${v.promise.route.split(':')[1]}`]
            const st = sim.promises.status(v)
            if (!km || !st) return null
            const frac = Math.min(1, Math.max(0, (sim.clock - v.promise.departed) / Math.max(1, st.eta - v.promise.departed)))
            return <div className="divide-y divide-line-2"><Row label={L('운행 거리', 'Distance')}>{L(`총 ${km} km 중 약 ${Math.round(km * frac)} km`, `~${Math.round(km * frac)} of ${km} km`)}</Row></div>
          })()}
          {town && <StopList v={v} />}
          {v.kind !== 'van' && <DriveHours v={v} />}
          {!v.promise && !town && v.kind !== 'van' && <p className="mt-2 text-[11px] text-muted">{L('지금은 도착 약속이 없는 운행입니다(구내 작업 중이거나 지도 밖).', 'No arrival promise on this run (on-site work or off the map).')}</p>}
        </>
      )}
      {tab === 'load' && (
        <>
          <div className="mt-1 divide-y divide-line-2">
            <Row label={L('적재', 'Load')}>{loadLabel(v)}</Row>
          </div>
          {v.kind !== 'van' && <LoadPlan v={v} />}
          {town && <MemoList v={v} />}
        </>
      )}
      {tab === 'log' && (
        <>
          {sim.carbon.byVehicle[v.id] && (
            <div className="mt-1 divide-y divide-line-2">
              <Row label={L('오늘 운행', 'Today')}>{num(sim.carbon.byVehicle[v.id].km)} km · {L(`${sim.carbon.byVehicle[v.id].trips}회`, `${sim.carbon.byVehicle[v.id].trips} ${plural(sim.carbon.byVehicle[v.id].trips, 'trip')}`)} · CO₂e {num(sim.carbon.byVehicle[v.id].kg)} kg</Row>
            </div>
          )}
          {v.log.length > 0 ? <TripLog v={v} /> : <p className="mt-2 text-[11px] text-muted">{L('아직 운행 기록이 없습니다.', 'No trip log yet.')}</p>}
          <GateHistory v={v} />
        </>
      )}
    </>
  )
}

/** 다온마을 배송차: 정차지 순서 · 고객 안내 시간대 · 도착 예정 */
function StopList({ v }: { v: Vehicle }) {
  const moved = sim.movedStops.get(v.id)
  return (
    <div className="mt-3">
      <SectionTitle>{L('정차지 · 안내 시간대', 'Stops · Time windows')}</SectionTitle>
      <ol className="mt-1 space-y-0.5">
        {v.stops.map((st, i) => {
          const inTown = v.site === 'TW'
          const done = inTown && i < v.stopIdx
          const now = inTown && i === v.stopIdx
          const win = sim.promises.vanWin(v, st.id)
          const eta = done ? null : sim.promises.vanEta(v, st.id)
          const late = !!win && eta !== null && eta > win[1]
          return (
            <li key={st.id} className={`flex items-center gap-2 text-[11px] ${now ? 'font-semibold text-ink' : done ? 'text-faint' : 'text-ink-2'}`}>
              <span className="num w-4 shrink-0 text-right text-faint">{i + 1}</span>
              <span className={`min-w-0 flex-1 truncate ${done ? 'line-through' : ''}`}>{st.label.replace('다온마을 아파트 ', '').replace('Daon Village Apt ', '')}</span>
              {moved?.has(st.id) ? <Chip tone="gray">{L('이관', 'Moved')}</Chip> : win && <span className="num text-muted">{hhmm(win[0])}~{hhmm(win[1])}</span>}
              {eta !== null && !moved?.has(st.id) && <span className={`num w-14 text-right ${late ? 'text-bad' : 'text-ink-2'}`}>{L('예정', 'ETA')} {hhmm(eta)}</span>}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** 이 차의 정문 출입 기록 */
function GateHistory({ v }: { v: Vehicle }) {
  const rows = sim.gateLog.entries.filter((e) => e.vehicle === v.id && e.t <= sim.clock).slice(0, 5)
  if (!rows.length) return null
  return (
    <div className="mt-3">
      <SectionTitle>{L('정문 출입', 'Gate log')}</SectionTitle>
      <ol className="mt-1 space-y-0.5">
        {rows.map((e) => (
          <li key={e.id} className="flex gap-2 text-[11px]">
            <span className="num w-9 shrink-0 text-faint">{hhmm(e.t)}</span>
            <span className="text-ink-2">
              {SITE_META[e.gate].name} {e.dir === 'in' ? L('진입', 'entry') : L('출차', 'exit')}
              <span className="text-muted">{e.dir === 'in' ? (e.wait && e.wait >= 30 ? L(` · 대기 ${Math.round(e.wait / 60)}분`, ` · wait ${Math.round(e.wait / 60)} min`) : '') : e.dwell !== undefined ? L(` · 체류 ${Math.round(e.dwell / 60)}분`, ` · dwell ${Math.round(e.dwell / 60)} min`) : ''}{e.note ? ` · ${e.note}` : ''}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** 철송 셔틀(부산신항 ↔ 곤지암): 이 철송장 기준으로 지금 상태 · 도착 예정 · 진행 막대 */
function RailShuttleCard({ here }: { here: TermId }) {
  const R = sim.rail
  const other: TermId = here === 'BS' ? 'GJ' : 'BS'
  const name = (t: TermId) => (t === 'BS' ? L('부산', 'Busan') : L('곤지암', 'Gonjiam'))
  const toHere = R.state === (here === 'BS' ? 'toBS' : 'toGJ')
  const until = R.untilArrive
  const span = Math.abs(STOP.GJ - STOP.BS)
  const moved = R.state === 'toGJ' || R.state === 'toBS' ? 1 - Math.abs(STOP[R.state === 'toGJ' ? 'GJ' : 'BS'] - R.s) / span : 0
  const T = R.at
  const text = R.state === here && T
    ? R.state === 'BS' && T.waited > 0
      ? L(`장치장 반출 기다리는 중 · 상하차 ${T.work.done}/${T.work.total}`, `Waiting for yard release · Handling ${T.work.done}/${T.work.total}`)
      : L(`상하차 ${T.work.done}/${T.work.total}`, `Handling ${T.work.done}/${T.work.total}`)
    : toHere
      ? L(`${name(here)} 도착 예정 ${until !== null ? hhmm(sim.clock + until * SPEEDUP) : '-'}`, `Due at ${name(here)} ${until !== null ? hhmm(sim.clock + until * SPEEDUP) : '-'}`)
      : R.state === other
        ? L(`${name(other)} 철송장에서 상하차 중`, `Handling at ${name(other)} rail terminal`)
        : L(`${name(other)}행 운행 중`, `Running to ${name(other)}`)
  return (
    <>
      <SectionTitle right={<span className="num">{RAIL_STATE_LABEL[R.state]}</span>}>{L('철송 셔틀 · 부산신항 ↔ 곤지암', 'Rail shuttle · Busan ↔ Gonjiam')}</SectionTitle>
      <div className="flex justify-between text-[11px] text-muted">
        <span>{text}</span>
        <span className="num">{L(`오늘 ${R.stats.arrivals + 6}회`, `${R.stats.arrivals + 6} today`)}</span>
      </div>
      <Bar value={R.state === here ? R.progress : toHere ? moved : R.state === other ? 0 : 1 - moved} tone={R.state === here ? 'green' : 'blue'} className="mt-1" />
      <div className="num mt-0.5 text-[10.5px] text-faint">{L(`곤지암행 ${R.stats.toGj}개 · 부산행 ${R.stats.toBs}개 · 화차 9량`, `${R.stats.toGj} to Gonjiam · ${R.stats.toBs} to Busan · 9 wagons`)}</div>
    </>
  )
}

/**
 * 부산신항 배후 시설(항만 관제 영상의 물류단지 패널): 철송장 셔틀 열차, 반출 수단 분담(도로·철도),
 * 트럭 대기장 · 세관 검사동 · 장치장 · 철송장 한 줄 상태. 줄을 누르면 카메라가 그곳으로.
 */
function BsHinterland() {
  const R = sim.rail
  const G = sim.gateLog
  const X = G.xray
  const occ = Math.max(...sim.port.occupancy())
  const roadTeu = G.stats.BS.out * 2
  const railTeu = R.stats.toGj * 2
  const share = roadTeu + railTeu ? railTeu / (roadTeu + railTeu) : 0
  const go = (x: number, z: number, d: number) => useStore.getState().goZone(x, z, d, 'BS')
  const rows: { name: string; text: string; warn?: boolean; at: [number, number, number] }[] = [
    { name: L('트럭 대기장', 'Truck lot'), text: L(`정문 대기 ${G.queue('BS').length}대 · 대기 트레일러 7대`, `${G.queue('BS').length} at gate · 7 trailers parked`), warn: G.queue('BS').length >= 2, at: [92, 96, 70] },
    { name: L('세관 검사동', 'Customs'), text: L(`X-ray 대기 ${X.pending.size + X.since.size}대 · 검사 ${X.done}대${X.done ? ` · 평균 ${Math.round(X.sum / X.done / 60)}분` : ''}`, `X-ray queue ${X.pending.size + X.since.size} · ${X.done} inspected${X.done ? ` · avg ${Math.round(X.sum / X.done / 60)} min` : ''}`), warn: X.pending.size + X.since.size >= 2, at: [318, 80, 60] },
    { name: L('장치장', 'Yard'), text: L(`블록 최고 ${Math.round(occ * 100)}%${occ >= 0.9 ? ' · 포화 주의' : ''}`, `Peak block ${Math.round(occ * 100)}%${occ >= 0.9 ? ' · near full' : ''}`), warn: occ >= 0.9, at: [258, 180, 150] },
    { name: L('철송장', 'Rail terminal'), text: L(`${RAIL_STATE_LABEL[R.state]} · 실을 수입 ${R.bs.count(1)}개 · 내린 수출 ${R.bs.count(0)}개`, `${RAIL_STATE_LABEL[R.state]} · ${R.bs.count(1)} imports to load · ${R.bs.count(0)} exports unloaded`), at: [485, 282, 120] },
  ]
  return (
    <>
      <RailShuttleCard here="BS" />
      <div className="mt-2 text-[11px] text-muted">{L('반출 수단(화면을 연 뒤, TEU)', 'Outbound mode (since opening, TEU)')}</div>
      <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-line-2">
        <div className="h-full bg-brand" style={{ width: `${(1 - share) * 100}%` }} />
        <div className="h-full bg-ok" style={{ width: `${share * 100}%` }} />
      </div>
      <div className="num mt-0.5 flex justify-between text-[10.5px] text-faint">
        <span>{L('도로 트레일러', 'Road trailer')} {roadTeu}</span>
        <span>{L('철도', 'Rail')} {railTeu} · {Math.round(share * 100)}%</span>
      </div>
      <SectionTitle>{L('배후 시설', 'Hinterland')}</SectionTitle>
      <div className="divide-y divide-line-2">
        {rows.map((r) => (
          <button key={r.name} type="button" onClick={() => go(...r.at)} className="flex w-full items-center gap-2 py-[6px] text-left text-[12px] hover:bg-line-2">
            <span className="w-[76px] shrink-0 font-semibold">{r.name}</span>
            <span className={`flex-1 truncate ${r.warn ? 'text-warn' : 'text-muted'}`}>{r.text}</span>
          </button>
        ))}
      </div>
    </>
  )
}

/** 도착 약속: 약속 시간대 · 도착 예정 · 계획 대비 · 원인 */
function PromiseBlock({ v }: { v: Vehicle }) {
  const p = v.promise!
  const st = sim.promises.status(v)
  const pc = promiseChip(v)
  if (!st || !pc) return null
  const done = p.arrived !== null
  return (
    <div className="mt-3">
      <SectionTitle right={<Chip tone={pc.tone}>{pc.label}</Chip>}>{L('도착 약속', 'Arrival promise')} · {p.dest}</SectionTitle>
      <div className="divide-y divide-line-2">
        <Row label={L('약속 시간대', 'Promise window')}>{hhmm(p.win[0])} ~ {hhmm(p.win[1])}</Row>
        <Row label={done ? L('도착', 'Arrived') : L('도착 예정', 'ETA')}>{hhmm(st.eta)} <span className="text-muted">{L(`(계획 ${hhmm(p.planned)} · ${st.delta >= 0 ? '+' : ''}${st.delta}분)`, `(plan ${hhmm(p.planned)} · ${st.delta >= 0 ? '+' : ''}${st.delta} min)`)}</span></Row>
        {!done && st.causes.length > 0 && (
          <Row label={L('원인', 'Cause')}>{st.causes.map((c) => (c === 'incident' && st.incident ? st.incident : CAUSE_LABEL[c])).join(' · ')}</Row>
        )}
        <Row label={L('노선 실측 배율', 'Route time factor')}>{(sim.promises.ratio[p.route] ?? 1.6).toFixed(2)} {L('× 자유 주행', '× free flow')}</Row>
      </div>
    </div>
  )
}

/** 운행 기록(최근 사건) */
function TripLog({ v }: { v: Vehicle }) {
  return (
    <div className="mt-3">
      <SectionTitle>{L('운행 기록', 'Trip log')}</SectionTitle>
      <ol className="mt-1 space-y-1">
        {v.log.slice(0, 6).map((l, i) => (
          <li key={`${l.t}-${i}`} className="flex gap-2 text-[11px]">
            <span className="num w-9 shrink-0 text-faint">{hhmm(l.t)}</span>
            <span className={/지연|\blate\b|\bdelay/i.test(l.text) ? 'text-bad' : 'text-ink-2'}>{l.text}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

const LOOK_COLOR: Record<string, string> = { water: '#6FA8E8', boxes: '#D7A86E', wrapped: '#C9D2E6', mixed: '#B58BD8', parcel: '#D7A86E', stretch: '#9FC3EA' }
/** 적재 한도(예시, t) */
const PAYLOAD_T: Partial<Record<Vehicle['kind'], number>> = { wing: 8.5, box: 11, reefer: 4.5, trailer: 26 }

/** 적재도: 짐칸을 위에서 본 칸(앞 = 운전석 쪽)과 총중량 */
function LoadPlan({ v }: { v: Vehicle }) {
  type Cell = { on: boolean; title: string; color: string; sub?: string }
  let cells: Cell[] = []
  let cols = 4
  let kg = 0
  let note = ''
  if (v.kind === 'wing') {
    // WING_SLOTS 순서 = 왼쪽 줄 4칸(앞→뒤), 오른쪽 줄 4칸: 4열 격자에 그대로 놓으면 위아래 두 줄이 된다
    cells = v.cargo.map((id) => {
      const p = id ? sim.pallets.get(id) : null
      if (!p) return { on: false, title: L('빈 자리', 'Empty'), color: '' }
      kg += p.kg
      return { on: true, title: `${ITEMS[p.item].name} · ${p.kg}kg · ${p.id}`, color: LOOK_COLOR[p.look] ?? '#D7A86E', sub: `${(p.kg / 1000).toFixed(1)}t` }
    })
    note = L('측면 상차 · 파렛트 8칸', 'Side loading · 8 pallet slots')
  } else if (v.kind === 'box') {
    const boxes = boxesAboard(v)
    const n = Math.round((Math.max(0, boxes) / Math.max(1, v.cargoTotal || 1200)) * 16)
    cols = 8
    cells = Array.from({ length: 16 }, (_, i) => ({ on: i % 8 < Math.ceil(n / 2) && (i < 8 || i % 8 < Math.floor(n / 2)), title: L('롤테이너(약 75박스)', 'Roll cage (~75 boxes)'), color: '#D7A86E' }))
    kg = Math.max(0, boxes) * 2.1 + n * 38
    note = L(`롤테이너 16대 · 택배 ${num(Math.max(0, boxes))}박스`, `16 roll cages · ${num(Math.max(0, boxes))} parcels`)
  } else if (v.kind === 'reefer') {
    const n = Math.floor(v.cargoDone)
    const total = Math.max(v.cargoTotal, 1)
    cols = Math.ceil(total / 2)
    cells = Array.from({ length: total }, (_, i) => ({ on: i % cols < Math.ceil(n / 2) && (i < cols || i % cols < Math.floor(n / 2)), title: L('냉장 롤테이너', 'Chilled roll cage'), color: '#7FD3CB' }))
    kg = n * 180
    note = L(`냉장 롤테이너 ${n}/${total}`, `Chilled roll cages ${n}/${total}`)
  } else if (v.kind === 'trailer') {
    cols = 1
    cells = [{ on: !!v.container, title: v.container ?? L('공차', 'Empty'), color: '#E8453C', sub: v.container ?? '' }]
    kg = v.container ? 18000 + 3800 : 0
    note = v.container ? L(`40ft 컨테이너 ${v.container}`, `40ft container ${v.container}`) : L('샤시만(공차)', 'Chassis only (empty)')
  }
  const cap = PAYLOAD_T[v.kind] ?? 10
  const t = kg / 1000
  return (
    <div className="mt-3">
      <SectionTitle right={`${t.toFixed(1)} / ${cap} t`}>{L('적재도', 'Load plan')}</SectionTitle>
      <div className="flex items-stretch gap-1">
        <div className="grid w-6 shrink-0 place-items-center rounded-l-lg rounded-r-sm bg-line text-[9.5px] font-semibold text-muted [writing-mode:vertical-rl]">{L('운전석', 'Cab')}</div>
        <div className="grid flex-1 gap-1 rounded-md border border-line p-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {cells.map((c, i) => (
            <div
              key={i}
              title={c.title}
              className={`num grid h-7 place-items-center truncate rounded-[5px] text-[9.5px] font-semibold ${c.on ? 'text-ink' : 'border border-dashed border-line text-faint'}`}
              style={c.on ? { background: c.color } : undefined}
            >
              {c.on ? c.sub ?? '' : ''}
            </div>
          ))}
        </div>
      </div>
      <Bar value={t / cap} tone={t > cap ? 'red' : t > cap * 0.85 ? 'amber' : 'blue'} className="mt-1.5" />
      <div className="mt-1 text-[10.5px] text-muted">{note}</div>
      <AxleLoads v={v} payload={t} />
    </div>
  )
}

/** 차종별 축 무리: [이름, 축 수, 빈 차 하중(t), 짐 몫] — 예시 값(실제는 차량 제원·적재 위치로 계산) */
const AXLES: Partial<Record<Vehicle['kind'], [string, number, number, number][]>> = {
  wing: [[L('앞축', 'Front'), 1, 3.2, 0.3], [L('뒤축', 'Rear'), 1, 3.0, 0.7]],
  reefer: [[L('앞축', 'Front'), 1, 3.4, 0.32], [L('뒤축', 'Rear'), 1, 3.3, 0.68]],
  box: [[L('앞축', 'Front'), 1, 4.2, 0.25], [L('뒤축', 'Rear'), 2, 4.8, 0.75]],
  trailer: [[L('조향축', 'Steer'), 1, 5.0, 0.04], [L('구동축', 'Drive'), 2, 4.5, 0.43], [L('트레일러축', 'Trailer'), 2, 4.5, 0.53]],
}
const AXLE_LIMIT = 10
const GROSS_LIMIT = 40

/** 축중(경로 관리 영상 Load plan의 STEER·DRIVE·TRAILER·GROSS): 축 무리마다 축 하나당 하중과 기준(10t) */
function AxleLoads({ v, payload }: { v: Vehicle; payload: number }) {
  const groups = AXLES[v.kind]
  if (!groups) return null
  const rows = groups.map(([label, n, tare, share]) => ({ label, n, per: (tare + payload * share) / n }))
  const gross = rows.reduce((s, r) => s + r.per * r.n, 0)
  const over = rows.some((r) => r.per > AXLE_LIMIT) || gross > GROSS_LIMIT
  return (
    <div className="mt-2 rounded-lg bg-[#FAFBFE] px-2 py-1.5 ring-1 ring-line">
      <div className="flex items-center justify-between text-[10.5px]">
        <span className="font-semibold text-ink-2">{L('축중(예시)', 'Axle load (example)')}</span>
        <span className={`num ${over ? 'font-semibold text-bad' : 'text-muted'}`}>{L(`총중량 ${gross.toFixed(1)} / ${GROSS_LIMIT} t${over ? ' · 초과' : ''}`, `Gross weight ${gross.toFixed(1)} / ${GROSS_LIMIT} t${over ? ' · over' : ''}`)}</span>
      </div>
      <div className="mt-1 space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2 text-[10.5px]">
            <span className="w-[66px] shrink-0 text-muted">{r.label}{r.n > 1 ? ` ×${r.n}` : ''}</span>
            <div className="relative h-1.5 flex-1 rounded-full bg-line-2">
              <div className={`h-full rounded-full ${r.per > AXLE_LIMIT ? 'bg-bad' : r.per > AXLE_LIMIT * 0.85 ? 'bg-warn' : 'bg-brand'}`} style={{ width: `${Math.min(100, (r.per / (AXLE_LIMIT * 1.2)) * 100)}%` }} />
              <span className="absolute -top-0.5 h-2.5 w-px bg-ink-2" style={{ left: `${(1 / 1.2) * 100}%` }} title={L('축 하나 기준 10t', 'Limit 10 t per axle')} />
            </div>
            <span className="num w-12 shrink-0 text-right text-ink-2">{r.per.toFixed(1)} t</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 화물차 운전 시간: 2시간 연속 운전하면 15분 이상 쉬어야 한다 */
function DriveHours({ v }: { v: Vehicle }) {
  const mins = (simSec: number) => Math.round((simSec * SPEEDUP) / 60)
  const hm = (m: number) => (m >= 60 ? L(`${Math.floor(m / 60)}시간 ${m % 60}분`, `${Math.floor(m / 60)} h ${m % 60} min`) : L(`${m}분`, `${m} min`))
  const drove = mins(v.driveT)
  const left = mins(Math.max(0, DRIVE_LIMIT - v.driveT))
  const r = v.rest
  const area = r?.area ? REST_AREAS.find((a) => a.id === r.area) : null
  const over = v.driveT > DRIVE_LIMIT
  return (
    <div className="mt-3">
      <SectionTitle>{L('운전 시간 · 휴게', 'Driving time · Rest')}</SectionTitle>
      <Bar value={Math.min(1, v.driveT / DRIVE_LIMIT)} tone={over ? 'red' : v.driveT > DRIVE_TIRED ? 'amber' : 'green'} className="mt-1.5" />
      <div className="mt-1 divide-y divide-line-2">
        <Row label={L('연속 운전', 'Continuous driving')}>{hm(drove)} / {L('2시간', '2 h')}</Row>
        <Row label={L('다음 휴게까지', 'Next rest in')}>
          {r ? (r.area ? (r.parked ? L(`휴게 중 · ${Math.max(1, mins(r.dur - r.t))}분 남음`, `Resting · ${Math.max(1, mins(r.dur - r.t))} min left`) : L(`${area?.name ?? '휴게소'} 진입 중`, `Entering ${area?.name ?? 'rest area'}`)) : r.dur < REST_MIN ? L('기사 교대 중', 'Driver swap') : L('구내 휴게 중', 'Resting on site')) : over ? <span className="text-bad">{L('2시간 초과 · 다음 휴게소에서 휴식', 'Over 2 h · rest at next stop')}</span> : `${hm(left)}`}
        </Row>
        <Row label={L('오늘 휴게', 'Rests today')}>{L(`${v.rests}회${v.swaps ? ` · 기사 교대 ${v.swaps}회` : ''}`, `${v.rests}${v.swaps ? ` · ${v.swaps} driver ${plural(v.swaps, 'swap')}` : ''}`)}</Row>
      </div>
    </div>
  )
}

function MemoChips({ plan }: { plan: MemoPlan }) {
  const drop = plan.dropConfidence >= 0.6 ? plan.drop : 'confirm'
  return (
    <span className="flex flex-wrap gap-1">
      <Chip tone={drop === 'confirm' ? 'amber' : drop === 'reschedule' ? 'gray' : 'blue'}>{DROP_SHORT[drop]}</Chip>
      {plan.noBell > 0.5 && <Chip tone="amber">{L('벨·노크 금지', 'No bell/knock')}</Chip>}
      {plan.fragile > 0.5 && <Chip tone="red">{L('취급주의', 'Fragile')}</Chip>}
      {plan.callFirst > 0.5 && <Chip tone="blue">{L('연락 요청', 'Call first')}</Chip>}
      <span className="num text-[10.5px] text-faint">{plan.dropConfidence.toFixed(2)}</span>
    </span>
  )
}

/** 정차지별 고객 메모와 AI 해석 */
function MemoList({ v }: { v: Vehicle }) {
  return (
    <>
      <SectionTitle right={<span className="flex items-center gap-1"><Sparkles size={11} />{L('AI 해석', 'AI reading')}</span>}>{L('배송 메모', 'Delivery notes')}</SectionTitle>
      <div className="space-y-1.5">
        {v.stops.map((st, i) => {
          const m = v.memos[st.id]
          const now = v.site === 'TW' && i === v.stopIdx
          return (
            <div key={st.id} className={`rounded-lg px-2 py-1.5 text-[11.5px] ${now ? 'bg-brand-soft' : i < v.stopIdx && v.site === 'TW' ? 'opacity-55' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-ink">{st.label}</span>
                {m?.status === 'pending' && <Loader2 size={11} className="animate-spin text-muted" />}
              </div>
              <div className="mt-0.5 text-muted">{m?.text ? `“${m.text}”` : L('메모 없음 · 문 앞', 'No note · doorstep')}</div>
              {m?.plan && <div className="mt-1"><MemoChips plan={m.plan} /></div>}
              {m?.status === 'error' && !m.plan && <div className="mt-0.5 text-[11px] text-faint">{ai.on ? L('AI 해석 실패', 'AI reading failed') : L('AI 꺼짐', 'AI off')}{L(' · 기본 규칙(문 앞)', ' · default rule (doorstep)')}</div>}
            </div>
          )
        })}
      </div>
    </>
  )
}

function ForkliftView({ id }: { id: string }) {
  const f = sim.forklift(id)!
  const s = forkliftStatus(f)
  const p = f.carrying ? sim.pallets.get(f.carrying) : null
  return (
    <>
      <Header glyph={<Glyph kind="forklift" />} kicker={L(`카운터밸런스 지게차 · 2.5t · ${SITE_META[f.site].code}`, `Counterbalance forklift · 2.5t · ${SITE_META[f.site].code}`)} title={f.id} sub={L(`운전 ${f.driver} · ${f.model}`, `Driver ${f.driver} · ${f.model}`)} sel={{ kind: 'forklift', id }} followable />
      <StatusLine tone={s.tone} label={s.label} text={forkliftTask(f)} />
      <div className="mt-2.5 flex items-center gap-2">
        <Bar value={f.battery / 100} tone={f.battery < 30 ? 'amber' : 'green'} className="flex-1" />
        <span className="num text-[11px] text-muted">{L('배터리', 'Battery')} {Math.round(f.battery)}%</span>
      </div>
      <div className="mt-1 divide-y divide-line-2">
        <Row label={L('운반 중', 'Carrying')}>{p ? <button type="button" className="text-brand" onClick={() => useStore.getState().select({ kind: 'pallet', id: p.id })}>{p.id} · {ITEMS[p.item].name}</button> : L('없음', 'None')}</Row>
        <Row label={L('오늘 작업', 'Moves today')}>{f.moves}{L('회', '')}</Row>
        <Row label={L('속도', 'Speed')}>{f.kmh} km/h</Row>
        <Row label={L('포크 높이', 'Fork height')}>{f.fork.toFixed(2)} m</Row>
        <Row label={L('오늘 이동 거리', 'Distance today')}>{(f.dist / 1000).toFixed(2)} km</Row>
        <Row label={L('충전기', 'Charger')}>{f.charger >= 0 ? sim.chargers[f.charger].id : f.site === 'GJ' ? 'C1 · C2' : 'C3'}</Row>
        <Row label={L('거점', 'Site')}>{SITE_META[f.site].name}</Row>
      </div>
    </>
  )
}

/** 사람(작업자·주민·배달 기사)과 다온마을 배송 로봇·드론 */
function PersonView({ id }: { id: string }) {
  const m = sim.life.movers.find((x) => x.id === id)
  if (!m) return null
  const p = personInfo(m)
  const robotish = m.kind === 'robot' || m.kind === 'drone'
  // 상태 칩 글자 수 한도(영어 글자가 좁아 더 길게)
  const cut = LL(14, 24)
  return (
    <>
      <Header
        glyph={robotish ? <Bot size={22} className="text-brand" /> : <UserRound size={22} className="text-brand" />}
        kicker={p.role}
        title={robotish ? (m.kind === 'drone' ? L(`배송 드론 ${m.id.slice(2)}`, `Delivery drone ${m.id.slice(2)}`) : L('실외 배송 로봇', 'Outdoor delivery robot')) : p.name}
        sub={robotish ? m.label || p.zone : `${m.id.toUpperCase()} · ${p.zone}`}
        sel={{ kind: 'mover', id }}
        followable
      />
      <StatusLine tone={p.tone} label={p.doing.length > cut ? p.doing.slice(0, cut) + '…' : p.doing} text={p.site ? SITE_META[p.site].name : L('간선도로', 'Highway')} />
      <div className="mt-2 divide-y divide-line-2">
        <Row label={L('하는 일', 'Doing')}>{p.doing}</Row>
        {!robotish && <Row label={L('근무', 'Shift')}>{p.shift}</Row>}
        <Row label={L('구역', 'Zone')}>{p.zone}</Row>
        <Row label={L('처리량', 'Throughput')}>{p.rate}</Row>
        {m.carry !== 'none' && <Row label={L('들고 있는 것', 'Carrying')}>{m.carry === 'box' ? L('택배 상자', 'Parcel box') : L('쇼핑백', 'Shopping bag')}</Row>}
        <Row label={L('속도', 'Speed')}>{m.moving ? `${(Math.min(m.speed, m.cap) * 3.6).toFixed(1)} km/h` : L('정지', 'Stopped')}</Row>
      </div>
    </>
  )
}

/** 이천 AMR(상품→작업자 구동 로봇) */
function RobotView({ id }: { id: string }) {
  const r = sim.robots.find((x) => x.id === id)
  if (!r) return null
  const moving = r.path.length > 0 && r.wait <= 0
  return (
    <>
      <Header glyph={<Bot size={22} className="text-brand" />} kicker={L('구동 로봇 · 상품→작업자', 'Drive robot · goods-to-person')} title={r.id} sub={L('450kg 포드를 들어 피킹대로 운반', 'Lifts 450 kg pods to picking stations')} sel={{ kind: 'robot', id }} followable />
      <StatusLine tone={r.state === 'idle' ? 'gray' : 'blue'} label={AMR_STATE[r.state] ?? r.state} text={L(`피킹 스테이션 ${r.station + 1}`, `Picking station ${r.station + 1}`)} />
      <div className="mt-2.5 flex items-center gap-2">
        <Bar value={r.battery / 100} tone={r.battery < 30 ? 'amber' : 'green'} className="flex-1" />
        <span className="num text-[11px] text-muted">{L('배터리', 'Battery')} {Math.round(r.battery)}%</span>
      </div>
      <div className="mt-1 divide-y divide-line-2">
        <Row label={L('작업', 'Task')}>{AMR_STATE[r.state] ?? r.state}</Row>
        <Row label={L('포드', 'Pod')}>{podName(r.pod)}</Row>
        <Row label={L('격자 칸', 'Grid cell')}>{r.pod >= 0 ? podCell(r.pod) : '-'}</Row>
        <Row label={L('속도', 'Speed')}>{moving ? '2.40 m/s' : '0.00 m/s'}</Row>
        <Row label={L('오늘 이동 거리', 'Distance today')}>{(r.dist / 1000).toFixed(2)} km</Row>
        <Row label={L('거점', 'Site')}>{L('이천 풀필먼트센터', 'Icheon Fulfillment Center')}</Row>
      </div>
    </>
  )
}

/** 대전 창고 장비(리치트럭·도크 지게차) */
function DjEquipView({ id }: { id: string }) {
  const e = sim.djwh.equipById(id)
  if (!e) return null
  const p = e.carrying ? sim.djwh.pallets.get(e.carrying) : null
  const reach = e.kind === 'reach'
  // 작업 글자는 djwh가 만든다: 한국어·영어 어느 쪽이든 읽는다
  const idle = e.task === '대기' || /^(idle|wait)/i.test(e.task)
  const out = e.task.startsWith('반출') || /^retriev/i.test(e.task)
  return (
    <>
      <Header glyph={<Glyph kind="forklift" />} kicker={reach ? L('리치트럭 · 10.5m 마스트 · DJ-07', 'Reach truck · 10.5m mast · DJ-07') : L('카운터밸런스 지게차 · 2.5t · DJ-07', 'Counterbalance forklift · 2.5t · DJ-07')} title={e.id} sub={L(`운전 ${e.operator}`, `Driver ${e.operator}`)} sel={{ kind: 'equip', id }} followable />
      <StatusLine tone={idle ? 'gray' : 'green'} label={idle ? L('대기', 'Idle') : reach ? (out ? L('반출', 'Retrieve') : L('적치', 'Put-away')) : L('운반', 'Moving')} text={e.task} />
      <div className="mt-2.5 flex items-center gap-2">
        <Bar value={e.battery / 100} tone={e.battery < 30 ? 'amber' : 'green'} className="flex-1" />
        <span className="num text-[11px] text-muted">{L('배터리', 'Battery')} {Math.round(e.battery)}%</span>
      </div>
      <div className="mt-1 divide-y divide-line-2">
        <Row label={L('작업', 'Task')}>{e.task}</Row>
        <Row label={L('들고 있는 것', 'Carrying')}>{p ? `${p.id}${p.loc >= 0 ? ` → ${sim.djwh.locs[p.loc].code}` : ''}` : L('없음', 'None')}</Row>
        <Row label={L('포크 높이', 'Fork height')}>{e.fork.toFixed(2)} m</Row>
        {reach && <Row label={L('포크 뻗음', 'Fork reach')}>{Math.round(e.reach * 100)}%</Row>}
        <Row label={L('속도', 'Speed')}>{e.kmh.toFixed(1)} km/h</Row>
        <Row label={L('오늘 이동 거리', 'Distance today')}>{(e.dist / 1000).toFixed(2)} km</Row>
        <Row label={L('오늘 작업', 'Moves today')}>{e.moves}{L('회', '')}</Row>
        <Row label={reach ? L('맡은 통로', 'Aisles') : L('맡은 도크', 'Dock')}>{reach ? e.aisles.map((k) => `A${String(k + 1).padStart(2, '0')}`).join(' · ') : L(`대전 ${e.dock + 1}`, `Daejeon ${e.dock + 1}`)}</Row>
      </div>
    </>
  )
}

function PalletView({ id }: { id: string }) {
  const p = sim.pallets.get(id)!
  const s = palletStatus(p)
  const item = ITEMS[p.item]
  return (
    <>
      <Header glyph={<Glyph kind="pallet" />} kicker={L(`파렛트 · ${item.category}`, `Pallet · ${item.category}`)} title={item.name} sub={p.id} sel={{ kind: 'pallet', id }} />
      <StatusLine tone={s.tone} label={s.label} text={s.where} />
      <div className="mt-2 divide-y divide-line-2">
        <Row label={L('수량', 'Qty')}>{num(p.qty)}{L(' 개', '')}</Row>
        <Row label={L('총중량', 'Gross weight')}>{num(p.kg)} kg</Row>
        <Row label={L('포장', 'Wrap')}>{p.wrapped ? L('스트레치 랩핑', 'Stretch-wrapped') : L('미포장', 'Unwrapped')}</Row>
        <Row label={L('로트', 'Lot')}>{p.lot}</Row>
        <Row label={L('입고 시각', 'Received at')}>{hhmm(p.received)}</Row>
        <Row label={L('거점', 'Site')}>{SITE_META[p.site].name}</Row>
      </div>
      {p.story && <div className="mt-2 rounded-lg bg-[#FFF1EB] px-2.5 py-2 text-[11.5px] text-[#D9531E]">{L(`이 파렛트에 추적 중인 택배 ${sim.story.no}가 실려 있습니다`, `Tracked parcel ${sim.story.no} is on this pallet`)}</div>}
      {p.pinned && <div className="mt-2 rounded-lg bg-warn-soft px-2.5 py-2 text-[11.5px] text-warn">{L('외박스 파손 의심 · 검수 후 입고 처리 필요', 'Outer box may be damaged · inspect before receiving')}</div>}
    </>
  )
}

function ChargerView({ id }: { id: string }) {
  const c = sim.chargers.find((x) => x.id === id)!
  const f = c.forklift ? sim.forklift(c.forklift) : null
  const charging = f?.status === 'charging'
  return (
    <>
      <Header glyph={<Glyph kind="charger" />} kicker={L(`충전기 · ${SITE_META[c.site].code}`, `Charger · ${SITE_META[c.site].code}`)} title={c.id} sub={L('48V 리튬이온 지게차 충전기', '48V Li-ion forklift charger')} sel={{ kind: 'charger', id }} />
      <StatusLine tone={charging ? 'amber' : f ? 'blue' : 'green'} label={charging ? L('충전 중', 'Charging') : f ? L('배정됨', 'Assigned') : L('사용 가능', 'Available')} text={f ? L(`${f.id} ${charging ? '충전 중' : '이동 중'}`, `${f.id} ${charging ? 'charging' : 'on the way'}`) : L('대기 중인 지게차 없음', 'No forklift waiting')} />
      <div className="mt-2 divide-y divide-line-2">
        <Row label={L('지게차', 'Forklift')}>{f ? <span className="text-brand">{f.id} · {L('배터리', 'Battery')} {Math.round(f.battery)}%</span> : '-'}</Row>
        <Row label={L('오늘 충전', 'Charges today')}>{c.sessions}{L('회', '')}</Row>
        <Row label={L('오늘 충전량', 'Energy today')}>{c.kwh.toFixed(1)} kWh</Row>
        <Row label={L('충전 속도', 'Charge rate')}>{charging ? L(`${((2.4 * 60) / SPEEDUP).toFixed(0)}% / 분`, `${((2.4 * 60) / SPEEDUP).toFixed(0)}% / min`) : '-'}</Row>
        <Row label={L('거점', 'Site')}>{SITE_META[c.site].name}</Row>
      </div>
    </>
  )
}

function BargeView() {
  const b = sim.barge
  const moving = b.state === 'down' || b.state === 'up'
  const tone = b.state === 'moored' ? 'green' : b.state === 'away' ? 'gray' : 'blue'
  const next = b.state === 'up' || b.state === 'away' ? L('상류 내륙 부두', 'Upstream inland wharf') : L('대전 강변 부두', 'Daejeon River Wharf')
  const done = Math.floor(b.work * BARGE.boxes * 2)
  return (
    <>
      <Header glyph={<Glyph kind="barge" />} kicker={L('내륙 화물선 · 대전 강변 부두', 'Inland barge · Daejeon River Wharf')} title={b.name} sub={L(`${b.id} · 40ft 컨테이너 ${BARGE.boxes}개(${BARGE.teu}TEU)`, `${b.id} · ${BARGE.boxes} × 40ft containers (${BARGE.teu} TEU)`)} sel={{ kind: 'barge', id: b.id }} followable={b.visible} />
      <StatusLine tone={tone} label={BARGE_STATE[b.state]} text={b.state === 'moored' ? L(`하역 ${Math.min(done, BARGE.boxes)}/${BARGE.boxes} · 선적 ${Math.max(0, done - BARGE.boxes)}/${BARGE.boxes}`, `Unloaded ${Math.min(done, BARGE.boxes)}/${BARGE.boxes} · loaded ${Math.max(0, done - BARGE.boxes)}/${BARGE.boxes}`) : L(`${next} 도착 약 ${Math.max(1, Math.round(b.eta / 60))}분`, `${next} in about ${Math.max(1, Math.round(b.eta / 60))} min`)} />
      {b.state === 'moored' && <Bar value={b.work} tone="green" className="mt-2.5" />}
      <div className="mt-2 divide-y divide-line-2">
        <Row label={L('속도', 'Speed')}>{moving ? `${(b.v * 3.6).toFixed(1)} km/h` : '-'}</Row>
        <Row label={L('다음 기항', 'Next call')}>{next}</Row>
        <Row label={L('항로', 'Route')}>{L('상류 내륙 부두 ↔ 대전 강변 부두 · 약 1.5km', 'Inland wharf ↔ Daejeon River Wharf · ~1.5 km')}</Row>
        <Row label={L('오늘 운항', 'Trips today')}>{L(`${b.trips}회`, `${b.trips}`)}</Row>
        <Row label={L('오늘 처리', 'Handled today')}>{L(`컨테이너 ${b.handled}개`, `${b.handled} containers`)}</Row>
        <Row label={L('제원', 'Vessel')}>{L(`길이 ${BARGE.len}m · 폭 ${BARGE.beam}m`, `${BARGE.len} m long · ${BARGE.beam} m beam`)}</Row>
      </div>
    </>
  )
}

function DockView({ id }: { id: string }) {
  const d = dockInfo(id)!
  const v = d.vehicle
  return (
    <>
      <Header glyph={<Glyph kind="dock" />} kicker={L(`도크 · ${d.type}`, `Dock · ${d.type}`)} title={d.id} sub={`${SITE_META[d.site].name} · ${SITE_META[d.site].code}`} sel={{ kind: 'dock', id }} />
      <StatusLine tone={d.tone} label={d.status} text={v ? `${v.id} · ${carrierName(v)}` : L('배정 차량 없음', 'No vehicle assigned')} />
      {v && <Bar value={v.cargoTotal ? v.cargoDone / v.cargoTotal : 0} tone="green" className="mt-2.5" />}
      <div className="mt-2 divide-y divide-line-2">
        <Row label={L('차량', 'Vehicle')}>{v ? <button type="button" className="text-brand" onClick={() => useStore.getState().select({ kind: 'vehicle', id: v.id })}>{v.id}</button> : '-'}</Row>
        <Row label={L('적재', 'Load')}>{v ? cargoLabel(v) : '-'}</Row>
        {d.site === 'IN' && /슬롯|slot/i.test(d.type) && <Row label={L('슈트 대기', 'At chute')}>{(sim.inSlots.find((s) => s.id === id)?.held ?? 0) * 8}{L(' 박스', ' boxes')}</Row>}
        <Row label={L('오늘 처리', 'Handled today')}>{L(`${d.today}대`, `${d.today} ${plural(d.today, 'vehicle')}`)}</Row>
      </div>
    </>
  )
}

const DESK_STATE = { idle: L('대기', 'Idle'), ai: L('AI 송장 판독 중', 'AI reading label'), ok: L('판독 완료 · 재투입', 'Read · re-inducted'), manual: L('수작업 입력 중', 'Manual entry'), irregular: L('이형물 라인으로 이동', 'To irregulars line') }

function HubSorterView() {
  const H = sim.hub
  const st = H.stats
  const acc = st.ai ? Math.round((st.aiCorrect / st.ai) * 100) : null
  const deskWait = H.deskQ.length + (H.desk.cur ? 1 : 0)
  return (
    <>
      <Header glyph={<Glyph kind="sorter" />} kicker={L('분류 설비 · GJ-01', 'Sorting equipment · GJ-01')} title={L('크로스벨트 소터 X1', 'Cross-belt sorter X1')} sub={L('투입 4라인 → ITS 6면 스캐너 → 순환 루프 60캐리어 → 행선지 슈트', '4 induct lines → ITS 6-side scanner → 60-carrier loop → destination chutes')} sel={{ kind: 'sorter', id: 'X1' }} />
      <StatusLine tone={deskWait > 4 ? 'amber' : 'green'} label={deskWait > 4 ? L('리젝트 적체', 'Reject backlog') : L('가동 중', 'Running')} text={L(`루프 위 ${H.carriers.filter(Boolean).length}/60 · 리젝트 대기 ${deskWait}`, `On loop ${H.carriers.filter(Boolean).length}/60 · rejects waiting ${deskWait}`)} />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stat label={L('처리 속도', 'Throughput')} value={H.rate ? num(H.rate) : '—'} unit={L('박스/시', 'boxes/h')} />
        <Stat label={L('오늘 분류', 'Sorted today')} value={st.sorted * 6} unit={L('박스', plural(st.sorted * 6, 'box', 'boxes'))} />
        <Stat label={L('리젝트(미판독)', 'Rejects (no read)')} value={st.rejects} unit={L('건', '')} tone="amber" />
        <Stat label={L('AI 재분류', 'AI re-sorted')} value={st.ai} unit={acc === null ? L('건', '') : L(`건 · 정확 ${acc}%`, `· ${acc}% correct`)} tone="green" />
      </div>
      <div className="mt-2 divide-y divide-line-2">
        <Row label={L('수작업 입력', 'Manual entry')}>{st.manual}{L('건', '')}</Row>
        <Row label={L('이형물 라인', 'Irregulars line')}>{st.irregular}{L('건', '')}</Row>
        <Row label={L('주소 불명 보류', 'Held: unknown address')}>{st.hold}{L('건', '')}</Row>
        <Row label={L('재순환(롤테이너 교체 중)', 'Recirculated (cage swap)')}>{st.recirc}{L('회', '')}</Row>
        <Row label={L('리젝트 데스크', 'Reject desk')}>{DESK_STATE[H.desk.mode]}</Row>
      </div>
      <SectionTitle right={L('롤테이너', 'Roll cage')}>{L('행선지 슈트', 'Destination chutes')}</SectionTitle>
      <div className="space-y-1.5">
        {DESTS.map((d) => {
          const cage = H.cages.find((c) => c.dest === d)
          return (
            <div key={d} className="flex items-center gap-2 text-[12px]">
              <span className="w-[74px] shrink-0 font-semibold">{d} {DEST_LABEL[d]}</span>
              {cage ? <Bar value={cage.swap > 0 ? 0 : cage.count / CAGE_CAP} tone={cage.swap > 0 ? 'amber' : 'blue'} className="flex-1" /> : <span className="flex-1 text-muted">{L('캐노피 배송장으로 반출', 'Out to canopy delivery yard')}</span>}
              <span className="num w-[52px] text-right text-muted">{cage?.swap ? L('교체 중', 'Swapping') : `${num(st.byDest[d] * 6)}`}</span>
            </div>
          )
        })}
      </div>
      <SectionTitle right={<span className="flex items-center gap-1"><Sparkles size={11} />AI</span>}>{L('리젝트 송장 판독', 'Reject label reading')}</SectionTitle>
      <div className="space-y-1">
        {H.log.slice(0, 5).map((l, i) => (
          <div key={i} className="rounded-lg bg-[#FAFBFE] px-2 py-1.5 text-[11px]">
            <div className="flex items-center justify-between gap-2"><span className="truncate font-semibold text-ink">“{l.label}”</span><span className="num shrink-0 text-faint">{hhmm(l.time)}</span></div>
            <div className="truncate text-muted">{L('품목', 'Item')} {l.item}{l.ai ? L(` · 행선지 ${l.ai.terminal} ${Math.round(l.ai.terminalConfidence * 100)}%`, ` · dest ${l.ai.terminal} ${Math.round(l.ai.terminalConfidence * 100)}%`) : ''}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              <Chip tone={l.tone}>{l.decision}</Chip>
              {l.notes.map((n) => <Chip key={n} tone="gray">{n}</Chip>)}
            </div>
          </div>
        ))}
        {!H.log.length && <div className="text-[11.5px] text-muted">{L('스캐너가 못 읽은 상자가 나오면 표시됩니다', 'Shown when the scanner misses a box')}</div>}
      </div>
    </>
  )
}

// ───────────────────────── 인천공항 화물터미널

const AIRLINE = { daon: L('다온항공', 'Daon Air'), hanbit: L('한빛카고', 'Hanbit Cargo') }

function AirportView({ head }: { head: ReactNode }) {
  const A = sim.airport
  const S = A.stats
  const trucks = sim.vehicles.filter((v) => v.home === 'AP')
  return (
    <>
      {head}
      <StatusLine tone={A.runwayBusy ? 'amber' : 'green'} label={A.runwayBusy ? L('활주로 사용 중', 'Runway in use') : L('활주로 비어 있음', 'Runway clear')} text={L(`활주로 09/27 · 주기장 ${A.stands.filter((s) => s.ac >= 0).length}/${AP.stands.length}`, `Runway 09/27 · Stands ${A.stands.filter((s) => s.ac >= 0).length}/${AP.stands.length}`)} />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stat label={L('도착 · 출발', 'Arrivals · Departures')} value={`${S.landed} · ${S.departed}`} unit={L('편', 'flights')} />
        <Stat label={L('ULD 하역 · 적재', 'ULD in · out')} value={`${S.uldIn} · ${S.uldOut}`} unit={L('개', '')} tone="green" />
        <Stat label={L('출발 탑재', 'Loaded out')} value={num(S.tons)} unit={L('톤', 't')} />
        <Stat label={L('위험물 탑재 보류', 'Dangerous goods held')} value={S.held} unit={L('건', '')} tone="amber" />
      </div>
      <SectionTitle right={L('상태', 'Status')}>{L('화물기', 'Freighters')}</SectionTitle>
      <div className="divide-y divide-line-2">
        {A.aircraft.map((a) => (
          <button key={a.id} type="button" onClick={() => useStore.getState().select({ kind: 'aircraft', id: a.id }, 'AP')} className="flex w-full items-center gap-2 py-[7px] text-left text-[12px] hover:bg-line-2">
            <span className="w-[62px] shrink-0 font-semibold">{a.flight}</span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-ink-2">{AIRLINE[a.airline]} {a.type}</span>
              <span className="block truncate text-[11px] text-muted">{aircraftState(a)}</span>
            </span>
          </button>
        ))}
      </div>
      <SectionTitle right={<span className="flex items-center gap-1"><Sparkles size={11} />AI</span>}>{L('항공 위험물 사전 검사', 'Air dangerous goods check')}</SectionTitle>
      <div className="space-y-1">
        {A.log.slice(0, 4).map((l, i) => (
          <div key={i} className="rounded-lg bg-[#FAFBFE] px-2 py-1.5 text-[11px]">
            <div className="flex items-center justify-between gap-2"><span className="num font-semibold text-ink">AWB {l.awb} → {l.dest}</span><span className="num shrink-0 text-faint">{hhmm(l.time)}</span></div>
            <div className="truncate text-muted">{L(`신고 “${l.declared}” · 내용 “${l.description}”`, `Declared “${l.declared}” · contents “${l.description}”`)}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              <Chip tone={l.tone}>{l.decision}</Chip>
              {l.flags && <span className="num text-faint">{L(`위험 ${l.flags.dangerous.toFixed(2)} · 냉장 ${l.flags.reefer.toFixed(2)} · 불일치 ${l.flags.mismatch.toFixed(2)}`, `DG ${l.flags.dangerous.toFixed(2)} · chilled ${l.flags.reefer.toFixed(2)} · mismatch ${l.flags.mismatch.toFixed(2)}`)}</span>}
            </div>
          </div>
        ))}
        {!A.log.length && <div className="text-[11.5px] text-muted">{L('곤지암에서 수출 화물 트럭이 도착하면 표시됩니다', 'Shown when an export truck arrives from Gonjiam')}</div>}
      </div>
      <SectionTitle right={L('위치', 'Location')}>{L('항공 화물 트럭', 'Air cargo trucks')}</SectionTitle>
      {trucks.map((v) => (
        <button key={v.id} type="button" onClick={() => useStore.getState().select({ kind: 'vehicle', id: v.id }, v.site)} className="flex w-full items-center gap-2 py-[6px] text-left text-[12px] hover:bg-line-2">
          <span className="font-semibold">{v.id}</span>
          <span className="flex-1 truncate text-muted">{vehicleStatus(v).label} · {siteCode(v.phase === 'highway' && v.dest && v.dest !== 'OFF' ? v.dest : v.site)}</span>
        </button>
      ))}
    </>
  )
}

function AircraftView({ id }: { id: string }) {
  const A = sim.airport
  const a = A.aircraft.find((x) => x.id === id)
  if (!a) return null
  const kmh = Math.round(a.speed * 3.6)
  return (
    <>
      <Header glyph={<Glyph kind="trailer" />} kicker={L(`${AIRLINE[a.airline]} 화물기 · AP-06`, `${AIRLINE[a.airline]} freighter · AP-06`)} title={a.flight} sub={`${a.type} · ${a.route}`} sel={{ kind: 'aircraft', id }} followable />
      <StatusLine tone={a.phase === 'parked' ? 'green' : 'blue'} label={aircraftState(a)} text={a.phase === 'away' ? '' : `${kmh} km/h${a.y > 1 ? L(` · 고도 ${Math.round(a.y * 3.28)} ft`, ` · alt ${Math.round(a.y * 3.28)} ft`) : ''}`} />
      <div className="mt-2 divide-y divide-line-2">
        <Row label={L('주기장', 'Stand')}>{a.stand >= 0 ? L(`${601 + a.stand}번`, `${601 + a.stand}`) : '-'}</Row>
        <Row label={L('실은 ULD', 'ULDs on board')}>{a.onboard}{L('개', '')}</Row>
        <Row label={L('이번 편 탑재', 'This flight')}>{a.tons}{L('톤', ' t')}</Row>
        <Row label={L('화물문', 'Cargo door')}>{a.door > 0.9 ? L('열림', 'Open') : a.door > 0.05 ? L('여닫는 중', 'Moving') : L('닫힘', 'Closed')}</Row>
        <Row label={L('착륙장치', 'Landing gear')}>{a.gear > 0.9 ? L('내림', 'Down') : a.gear > 0.05 ? L('접는 중', 'Retracting') : L('올림', 'Up')}</Row>
      </div>
    </>
  )
}

function SorterView({ id }: { id: string }) {
  if (id === 'X1') return <HubSorterView />
  const s2 = id === 'S2'
  const loading = sim.vehicles.filter((v) => v.kind === 'van' && v.home === (s2 ? 'IN' : 'GJ') && v.phase === 'loading').length
  return (
    <>
      <Header glyph={<Glyph kind="sorter" />} kicker={L(`분류 설비 · ${s2 ? 'IN-05' : 'GJ-01'}`, `Sorting equipment · ${s2 ? 'IN-05' : 'GJ-01'}`)} title={s2 ? L('인천 휠소터 S2', 'Incheon wheel sorter S2') : L('분류 라인 S1', 'Sort line S1')} sub={s2 ? L('신축 컨베이어 → ITS 스캐너 → 휠소터 → 슈트', 'Telescopic conveyor → ITS scanner → wheel sorter → chutes') : L('휠소터 배송 분류장 · SUB-A', 'Wheel sorter delivery sort area · SUB-A')} sel={{ kind: 'sorter', id }} />
      <StatusLine tone="green" label={L('가동 중', 'Running')} text={L(`상차 중 ${loading}/12 슬롯`, `Loading ${loading}/12 slots`)} />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stat label={L('처리 속도', 'Throughput')} value={s2 ? 5760 : 8640} unit={L('박스/시', 'boxes/h')} />
        <Stat label={L('벨트 위 상자', 'Boxes on belt')} value={s2 ? sim.inParcels.filter((p) => p.phase < 2).length : sim.parcels.length} unit={L('개', '')} />
      </div>
      <div className="mt-2 divide-y divide-line-2">
        <Row label={L('라인 속도', 'Line speed')}>2.4 m/s</Row>
        <Row label={L('스캐너 인식률', 'Scanner read rate')}>99.6%</Row>
        {s2 && <Row label={L('슈트 대기', 'At chute')}>{num(sim.inSlots.reduce((s, x) => s + x.held, 0) * 8)}{L(' 박스', ' boxes')}</Row>}
      </div>
    </>
  )
}

function EquipView({ id }: { id: string }) {
  const [type, n] = id.split('-')
  const i = Number(n)
  const P = sim.port
  const box = type === 'sts' ? P.sts[i]?.box : type === 'armg' ? P.armgs[i]?.box : P.agvs[i]?.box
  const m = box?.manifest
  const sub = type === 'sts' ? L('듀얼 트롤리 안벽 크레인 · 40ft 스프레더', 'Dual-trolley quay crane · 40ft spreader') : type === 'armg' ? L(`자동화 레일 야드 크레인 · 블록 ${'ABCD'[i >> 1]} ${i % 2 ? '육측(트레일러)' : '해측(AGV)'}`, `Automated rail yard crane · Block ${'ABCD'[i >> 1]} ${i % 2 ? 'landside (trailer)' : 'seaside (AGV)'}`) : L('무인 운반차 · 안벽 ↔ 야드', 'Automated guided vehicle · quay ↔ yard')
  return (
    <>
      <Header glyph={<Glyph kind={type === 'agv' ? 'trailer' : 'crane'} />} kicker={L('부산신항 · BS-04', 'Busan New Port · BS-04')} title={equipName(id)} sub={sub} sel={{ kind: 'crane', id }} followable={type === 'agv'} />
      <StatusLine tone="blue" label={craneState(id)} />
      <div className="mt-2 divide-y divide-line-2">
        <Row label={L('컨테이너', 'Container')}>{box ? <span className="num">{box.id} · {box.kind === 'import' ? L('수입', 'Import') : L('수출', 'Export')}</span> : L('없음', 'None')}</Row>
        {type === 'sts' && <Row label={L('누적 작업', 'Total moves')}>{P.sts[i].moves}{L(' 사이클', ' cycles')}</Row>}
        {type === 'armg' && <Row label={L('대기 작업', 'Queued tasks')}>{P.armgs[i].tasks.length}{L('건', '')}</Row>}
        {type === 'armg' && <Row label={L('블록 장치량', 'Block stock')}>{P.blocks[i >> 1].reduce((s, b) => s + b.length, 0)} / {PORT.blockBays.length * BAY_CAP}</Row>}
        {m && <Row label={L('신고 품명', 'Declared goods')}>{m.declared}</Row>}
        {m && <Row label={L('화주', 'Shipper')}>{m.shipper}</Row>}
      </div>
      {m && (
        <div className="mt-2 rounded-lg bg-[#FAFBFE] px-2.5 py-2 text-[11.5px]">
          <div className="flex items-center gap-1 font-semibold text-ink"><Sparkles size={11} className="text-brand" />{L('적하목록 (AI 검토)', 'Manifest (AI review)')}</div>
          <div className="mt-0.5 text-muted">“{m.description}”</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {m.status === 'pending' && <span className="text-faint">{L('검토 중…', 'Reviewing…')}</span>}
            {m.status === 'error' && <span className="text-faint">{ai.on ? L('검토 지연', 'Review delayed') : L('AI 꺼짐', 'AI off')}{L(' · 기본 규칙(일반 블록)', ' · default rule (general block)')}</span>}
            {m.flags && (
              <>
                {m.flags.dangerous > 0.5 && <Chip tone="red">{L('위험물', 'Dangerous goods')}</Chip>}
                {m.flags.reefer > 0.5 && <Chip tone="blue">{L('냉동·냉장', 'Frozen · chilled')}</Chip>}
                {m.flags.mismatch > 0.6 && <Chip tone="amber">{L('신고 불일치 → X-ray', 'Mismatch → X-ray')}</Chip>}
                {m.flags.dangerous <= 0.5 && m.flags.reefer <= 0.5 && m.flags.mismatch <= 0.6 && <Chip tone="green">{L('일반 통관', 'Normal clearance')}</Chip>}
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function StoryView() {
  const s = sim.story
  const pos = sim.storyPos()
  return (
    <>
      <Header glyph={<Glyph kind="story" color="#FF6B3D" />} kicker={<span style={{ color: '#D9531E' }}>{L(`택배 한 상자의 여정 · ${s.n}번째`, `Parcel journey · #${s.n}`)}</span>} title={`#${s.no}`} sub={`${ITEMS[s.item].name} · ${s.seller}`} sel={{ kind: 'story', id: 'story' }} followable />
      <StatusLine tone={s.stage >= 7 ? 'green' : 'blue'} label={STORY_STEPS[Math.max(0, s.stage)].label} text={pos.label} />
      <div className="mt-2 divide-y divide-line-2">
        <Row label={L('받는 분', 'Recipient')}>{L(`${s.customer} 고객`, s.customer)}</Row>
        <Row label={L('배송지', 'Address')}>{storyAddress()}</Row>
        <Row label={L('현재 거점', 'Current site')}>{SITE_META[pos.site].name}</Row>
        <Row label={L('주문 시각', 'Ordered at')}>{hhmm(s.times[0])}</Row>
      </div>
      <div className="mt-2 rounded-lg bg-[#FAFBFE] px-2.5 py-2 text-[11.5px]">
        <div className="flex items-center gap-1 font-semibold text-ink"><Sparkles size={11} className="text-brand" />{L('배송 요청 메모', 'Delivery note')}</div>
        <div className="mt-0.5 text-muted">“{s.memo || L('메모 없음', 'No note')}”</div>
        <div className="mt-1">{s.memoPlan ? <MemoChips plan={s.memoPlan} /> : s.memoStatus === 'pending' ? <span className="text-faint">{L('AI 해석 중…', 'AI reading…')}</span> : <span className="text-faint">{ai.on || !s.memo ? '' : L('AI 꺼짐 · ', 'AI off · ')}{L('기본 규칙: 문 앞', 'Default rule: doorstep')}</span>}</div>
        {s.dropMode && <div className="mt-1 text-[11px] text-ok">{L('실제 처리: ', 'Handled as: ')}{DROP_LABEL[s.dropMode]}</div>}
      </div>
      <ol className="mt-2 space-y-1">
        {STORY_STEPS.map((st, i) => (
          <li key={i} className="flex items-center gap-2 text-[11.5px]">
            <span className={`grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold ${i < s.stage || s.stage === 7 ? 'bg-brand text-white' : i === s.stage ? 'bg-[#FF6B3D] text-white' : 'bg-line text-muted'}`}>{i + 1}</span>
            <span className={i <= s.stage ? 'text-ink' : 'text-muted'}>{st.label}</span>
            <span className="text-faint">{st.sub}</span>
            <span className="num ml-auto text-faint">{s.times[i] ? hhmm(s.times[i]) : ''}</span>
          </li>
        ))}
      </ol>
    </>
  )
}

/** 반품 회수 여정 */
function ReturnView() {
  const r = sim.cs.focus
  if (!r) return <div className="text-[12px] text-muted">{L('따라갈 반품이 없습니다', 'No return to follow')}</div>
  const pos = sim.journeyPos('ret')
  const cur = RETURN_STEPS[r.stage]
  return (
    <>
      <Header
        glyph={<Glyph kind="van" color="#D97706" />}
        kicker={<span className="text-warn">{L('반품 회수 · 역물류', 'Return pickup · reverse logistics')}</span>}
        title={L(`반품 ${r.no}`, `Return ${r.no}`)}
        sub={`${r.item.name} · ${r.customer}`}
        sel={{ kind: 'story', id: 'ret' }}
        followable
      />
      <StatusLine tone={r.stage === 6 ? 'green' : 'amber'} label={r.stage === 6 && r.disposition ? DISPOSITION_LABEL[r.disposition] : cur.label} text={pos.label} />
      <div className="mt-2 divide-y divide-line-2">
        <Row label={L('회수지', 'Pickup at')}>{STOPS[r.stopId]?.label}</Row>
        <Row label={L('반품 사유', 'Reason')}>{REASON_LABEL[r.reason]}{r.by === 'ai' ? ' (AI)' : L(' (규칙)', ' (rule)')}</Row>
        <Row label={L('미개봉', 'Unopened')}>{r.unopened ? L('예', 'Yes') : L('아니오', 'No')}</Row>
        <Row label={L('회수 차량', 'Pickup van')}>{r.van ?? L('배정 전', 'Unassigned')}</Row>
        <Row label={L('간선 회송', 'Linehaul back')}>{r.truck ?? '-'}</Row>
        <Row label={L('처리', 'Disposition')}>{r.disposition ? DISPOSITION_LABEL[r.disposition] : L('검수 전', 'Not inspected')}</Row>
      </div>
      <div className="mt-2 rounded-lg bg-[#FAFBFE] px-2.5 py-2 text-[11.5px]">
        <div className="font-semibold text-ink">{L('고객이 쓴 사유', 'Customer’s reason')}</div>
        <div className="mt-0.5 text-muted">“{r.text}”</div>
        {r.note && <div className="mt-1 text-[11px] font-medium text-ink-2">→ {r.note}</div>}
      </div>
      <SectionTitle right={L('단계별로 일어나는 일', 'What happens at each step')}>{L('여정', 'Journey')}</SectionTitle>
      <ol className="space-y-2">
        {RETURN_STEPS.map((st, i) => {
          const done = r.stage === 6 || i < r.stage
          const now = i === r.stage && r.stage !== 6
          return (
            <li key={i} className={`rounded-lg px-2 py-1.5 ${now ? 'bg-warn-soft' : ''}`}>
              <div className="flex items-center gap-2 text-[11.5px]">
                <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] font-bold ${done ? 'bg-brand text-white' : now ? 'bg-[#FF6B3D] text-white' : 'bg-line text-muted'}`}>{i + 1}</span>
                <span className={`font-semibold ${done || now ? 'text-ink' : 'text-muted'}`}>{st.label}</span>
                <span className="truncate text-faint">{st.sub}</span>
                <span className="num ml-auto shrink-0 text-faint">{r.times[i] != null ? hhmm(r.times[i]!) : ''}</span>
              </div>
              <p className={`mt-0.5 pl-6 text-[11px] leading-snug ${done || now ? 'text-ink-2' : 'text-muted'}`}>{st.desc}</p>
            </li>
          )
        })}
      </ol>
    </>
  )
}

/** 배·비행기 여정: 무엇을 따라가는지와 단계별로 실제 무슨 일이 일어나는지 */
function JourneyView({ mode }: { mode: 'sea' | 'air' }) {
  const sea = mode === 'sea'
  const j = sea ? sim.sea : sim.air
  const pos = j.pos()
  const m = sea ? sim.sea.box?.manifest : null
  const a = sim.air
  const held = j.status === 'held'
  const cur = j.steps[Math.max(0, j.stage)]
  return (
    <>
      <Header
        glyph={<Glyph kind={sea ? 'trailer' : 'box'} color={sea ? '#2563EB' : '#5B5BD6'} />}
        kicker={<span style={{ color: sea ? '#2563EB' : '#5B5BD6' }}>{sea ? L('배로 오는 여정 · 해상 수입', 'Journey by sea · import') : L('비행기로 가는 여정 · 항공 수출', 'Journey by air · export')}{L(` · ${j.n}번째`, ` · #${j.n}`)}</span>}
        title={sea ? L(`컨테이너 ${j.no}`, `Container ${j.no}`) : j.no || L(`항공 화물 #${j.n}`, `Air cargo #${j.n}`)}
        sub={sea ? (m ? `${m.declared} · ${m.shipper}` : L('해외 직구 수입 컨테이너', 'Cross-border import container')) : L(`${a.item} · ${a.dest}행`, `${a.item} · to ${a.dest}`)}
        sel={{ kind: 'story', id: mode }}
        followable
      />
      <StatusLine tone={held ? 'amber' : j.status === 'done' ? 'green' : 'blue'} label={held ? L('탑재 보류 · 해상 전환', 'Held · switched to sea') : cur.label} text={pos.label} />
      <div className="mt-2 divide-y divide-line-2">
        {sea ? (
          <>
            <Row label={L('경로', 'Route')}>{L('상하이 → 부산신항 → 곤지암 CY', 'Shanghai → Busan New Port → Gonjiam CY')}</Row>
            <Row label={L('신고 품명', 'Declared goods')}>{m?.declared ?? '-'}</Row>
            <Row label={L('화주', 'Shipper')}>{m?.shipper ?? '-'}</Row>
            <Row label={L('트레일러', 'Trailer')}>{sim.sea.truck ?? L('배차 전', 'Not dispatched')}</Row>
          </>
        ) : (
          <>
            <Row label={L('경로', 'Route')}>{L('곤지암 → 인천공항 → ', 'Gonjiam → Incheon Airport → ')}{a.dest}</Row>
            <Row label={L('신고 품명', 'Declared goods')}>{a.shipment?.declared ?? L('반입 전', 'Not received')}</Row>
            <Row label={L('트럭', 'Truck')}>{a.truck ?? '-'}</Row>
            <Row label={L('화물기', 'Freighter')}>{a.ac ? `${a.ac.flight} · ${a.ac.type}` : L('ULD 배정 전', 'ULD not assigned')}</Row>
          </>
        )}
        <Row label={L('현재 거점', 'Current site')}>{SITE_META[pos.site].name}</Row>
        <Row label={L('출발 시각', 'Departed at')}>{hhmm(j.times[0] ?? sim.clock)}</Row>
      </div>
      {(sea ? m?.description : a.shipment?.description) && (
        <div className="mt-2 rounded-lg bg-[#FAFBFE] px-2.5 py-2 text-[11.5px]">
          <div className="flex items-center gap-1 font-semibold text-ink"><Sparkles size={11} className="text-brand" />{sea ? L('적하목록 심사', 'Manifest review') : L('위험물 사전 검사', 'Dangerous goods check')}{ai.on ? ' (AI)' : L(' (기본 규칙)', ' (default rules)')}</div>
          <div className="mt-0.5 text-muted">“{sea ? m?.description : a.shipment?.description}”</div>
          <div className="mt-1 text-[11px] font-medium text-ink-2">{j.decision ? `→ ${j.decision}` : L('심사 전', 'Not reviewed')}</div>
        </div>
      )}
      <SectionTitle right={L('단계별로 일어나는 일', 'What happens at each step')}>{L('여정', 'Journey')}</SectionTitle>
      <ol className="space-y-2">
        {j.steps.map((st, i) => {
          const done = j.status === 'done' || i < j.stage
          const now = i === j.stage && j.status !== 'done'
          return (
            <li key={i} className={`rounded-lg px-2 py-1.5 ${now ? (held ? 'bg-warn-soft' : 'bg-brand-soft') : ''}`}>
              <div className="flex items-center gap-2 text-[11.5px]">
                <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] font-bold ${done ? 'bg-brand text-white' : now ? 'bg-[#FF6B3D] text-white' : 'bg-line text-muted'}`}>{i + 1}</span>
                <span className={`font-semibold ${done || now ? 'text-ink' : 'text-muted'}`}>{st.label}</span>
                <span className="truncate text-faint">{st.sub}</span>
                <span className="num ml-auto shrink-0 text-faint">{j.times[i] && (done || now) ? hhmm(j.times[i]) : ''}</span>
              </div>
              <p className={`mt-0.5 pl-6 text-[11px] leading-snug ${done || now ? 'text-ink-2' : 'text-muted'}`}>{st.desc}</p>
            </li>
          )
        })}
      </ol>
    </>
  )
}

function NetworkView() {
  const inTransit = (kind: Vehicle['kind']) => sim.vehicles.filter((v) => v.kind === kind && v.visible && (v.phase === 'highway' || v.phase === 'delivering' || v.phase === 'returning')).length
  const air = sim.vehicles.filter((v) => v.home === 'AP' && v.visible && (v.phase === 'highway' || v.phase === 'departing' || v.phase === 'enroute')).length
  const counts: Record<string, number> = { icgj: inTransit('wing'), gjin: inTransit('box') - air, intw: inTransit('van'), bsgj: inTransit('trailer'), gjap: air, rail: sim.rail.state === 'toGJ' || sim.rail.state === 'toBS' ? 1 : 0 }
  const flowLink: Record<string, keyof typeof sim.linkFactor> = { icgj: 'hw_ic_gj', gjin: 'hw_gj_in', intw: 'town_gate', bsgj: 'hw_gj_bs' }
  const live = sim.incidents.filter((i) => i.state === 'active' || i.state === 'confirm')
  return (
    <>
      <Header glyph={<Glyph kind="site" />} kicker={L('전국 네트워크', 'National network')} title={L('다온로지스 물류망', 'Daon Logistics network')} sub={L(`허브 앤 스포크 · ${SITE_ORDER.length}개 거점`, `Hub & spoke · ${SITE_ORDER.length} sites`)} />
      <StatusLine tone={live.length ? 'amber' : 'green'} label={live.length ? L(`돌발 상황 ${live.length}건`, `${live.length} ${plural(live.length, 'incident')}`) : L('정상 운영', 'Normal ops')} text={L(`운행 차량 ${sim.vehicles.filter((v) => v.visible).length}대 · 택배 여정 #${sim.story.n}`, `Vehicles on road ${sim.vehicles.filter((v) => v.visible).length} · Parcel journey #${sim.story.n}`)} />
      {live.length > 0 && (
        <>
          <SectionTitle right={<span className="flex items-center gap-1"><Sparkles size={11} />{L('AI 판독 → 코드 적용', 'AI reads → code applies')}</span>}>{L('돌발 상황', 'Incidents')}</SectionTitle>
          <div className="space-y-1">
            {live.map((i) => (
              <div key={i.id} className={`rounded-lg px-2 py-1.5 text-[11px] ${i.state === 'active' ? 'bg-bad-soft' : 'bg-warn-soft'}`}>
                <div className="flex items-center justify-between gap-2"><span className="font-semibold text-ink">{i.applied ? LINK_LABEL[i.applied.link] : L('확인 필요', 'Needs check')}</span><span className="num text-faint">{hhmm(i.time)}</span></div>
                <div className="truncate text-muted">{i.text}</div>
                <div className="font-medium text-ink-2">→ {i.decision}</div>
              </div>
            ))}
          </div>
        </>
      )}
      <SectionTitle right={L('상태', 'Status')}>{L('거점', 'Sites')}</SectionTitle>
      <div className="divide-y divide-line-2">
        {SITE_ORDER.map((id) => (
          <button key={id} type="button" onClick={() => useStore.getState().setSite(id)} className="flex w-full items-center gap-2 py-[7px] text-left text-[12px] hover:bg-line-2">
            <span className="w-11 shrink-0 rounded-md bg-brand-soft py-0.5 text-center text-[10.5px] font-bold text-brand">{SITE_META[id].code}</span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate font-semibold text-ink">{SITE_META[id].name}</span>
              <span className="num block truncate text-[11px] text-muted">{siteSummaryText(id)}</span>
            </span>
          </button>
        ))}
      </div>
      <SectionTitle right={L('운행 중', 'Active')}>{L('간선 흐름', 'Linehaul flows')}</SectionTitle>
      <div className="space-y-1.5">
        {FLOWS.map((f) => (
          <div key={f.key} className="flex items-center gap-2 text-[12px]">
            <span className="h-1.5 w-5 rounded-full" style={{ background: f.color }} />
            <span className="flex-1 truncate text-ink-2">{f.label}</span>
            {flowLink[f.key] && sim.linkFactor[flowLink[f.key]] < 0.99 && <Chip tone="red">{Math.round(sim.linkFactor[flowLink[f.key]] * 100)}%</Chip>}
            <span className="num font-semibold text-ink">{counts[f.key]}{L('대', '')}</span>
          </div>
        ))}
      </div>
    </>
  )
}

export function Inspector() {
  useStore((s) => s.tick)
  const sel = useStore((s) => s.selected)
  const site = useStore((s) => s.site)
  const view = useStore((s) => s.view)
  let body: ReactNode = view === 'network' ? <NetworkView /> : <SiteView id={site} />
  if (sel?.kind === 'vehicle') {
    const v = sim.vehicle(sel.id)
    if (v) body = <VehicleView v={v} />
  } else if (sel?.kind === 'forklift' && sim.forklift(sel.id)) body = <ForkliftView id={sel.id} />
  else if (sel?.kind === 'pallet' && sim.pallets.get(sel.id)) body = <PalletView id={sel.id} />
  else if (sel?.kind === 'charger') body = <ChargerView id={sel.id} />
  else if (sel?.kind === 'dock' && dockInfo(sel.id)) body = <DockView id={sel.id} />
  else if (sel?.kind === 'sorter') body = <SorterView id={sel.id} />
  else if (sel?.kind === 'crane') body = <EquipView id={sel.id} />
  else if (sel?.kind === 'aircraft') body = <AircraftView id={sel.id} />
  else if (sel?.kind === 'mover') body = <PersonView id={sel.id} />
  else if (sel?.kind === 'robot') body = <RobotView id={sel.id} />
  else if (sel?.kind === 'equip') body = <DjEquipView id={sel.id} />
  else if (sel?.kind === 'barge') body = <BargeView />
  else if (sel?.kind === 'story') body = sel.id === 'sea' || sel.id === 'air' ? <JourneyView mode={sel.id} /> : sel.id === 'ret' ? <ReturnView /> : <StoryView />
  else if (sel?.kind === 'site') body = <SiteView id={sel.id as SiteId} />
  return (
    <aside
      key={sel ? `${sel.kind}-${sel.id}` : `site-${site}`}
      className="panel rise scroll-thin pointer-events-auto absolute right-4 top-[72px] z-20 w-[304px] overflow-y-auto p-3.5"
      style={{ maxHeight: 'calc(100vh - 72px - 262px - var(--tl, 0px))' }}
      aria-label={L('상세 정보', 'Details')}
    >
      {body}
    </aside>
  )
}
