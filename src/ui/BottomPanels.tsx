import { Boxes, CalendarRange, Check, DoorOpen, ChevronRight, ClipboardCheck, Construction, Container, Crosshair, Factory, Home, Layers, Package, PackageCheck, PackageOpen, Plane, PlaneTakeoff, Route, ScanSearch, Ship, ShieldCheck, Truck, Undo2, Warehouse, TrainFront } from 'lucide-react'
import type { ReactNode } from 'react'
import { sim, type Vehicle } from '../sim/sim'
import { CARRIERS, ITEMS } from '../sim/data'
import { SITE_META } from '../sim/world'
import { useStore, type OpsTab, type TrackMode } from '../store'
import { Glyph, type GlyphKind } from './icons'
import { Bar, Chip, Dot } from './primitives'
import {
  DROP_SHORT, STORY_STEPS, carrierName, num, dockInfo, forkliftStatus, forkliftTask, hhmm, isMoving, resLabel, shipmentSteps, siteCode, storyAddress,
  vehicleEta, vehicleStatus, promiseChip, type Step, type Tone,
} from './format'
import { ai } from '../sim/ai'
import { DISPOSITION_LABEL, REASON_LABEL, RETURN_STEPS } from '../sim/cs'
import { idleTask, peopleAt, robotsAt } from './people'
import { STOPS } from '../sim/sites'
import { DockSchedule } from './DockSchedule'
import { GateTable } from './GateTable'
import { L, plural } from '../i18n'

const STORY_ICONS: ReactNode[] = [
  <ClipboardCheck size={13} />, <Factory size={13} />, <Truck size={13} />, <Warehouse size={13} />,
  <Truck size={13} />, <Boxes size={13} />, <Route size={13} />, <Home size={13} />,
]
const SEA_ICONS: ReactNode[] = [
  <Ship size={13} />, <Construction size={13} />, <ScanSearch size={13} />, <Container size={13} />,
  <Layers size={13} />, <Truck size={13} />, <Route size={13} />, <PackageOpen size={13} />,
]
const SEA_RAIL_ICONS: ReactNode[] = [
  <Ship size={13} />, <Construction size={13} />, <ScanSearch size={13} />, <Container size={13} />,
  <Layers size={13} />, <Truck size={13} />, <Construction size={13} />, <TrainFront size={13} />, <PackageOpen size={13} />,
]
const AIR_ICONS: ReactNode[] = [
  <Warehouse size={13} />, <Truck size={13} />, <PackageCheck size={13} />, <ShieldCheck size={13} />,
  <Boxes size={13} />, <Plane size={13} />, <Route size={13} />, <PlaneTakeoff size={13} />,
]
const RET_ICONS: ReactNode[] = [
  <ClipboardCheck size={13} />, <Truck size={13} />, <Home size={13} />, <Warehouse size={13} />,
  <Route size={13} />, <ScanSearch size={13} />, <PackageCheck size={13} />,
]
const STEP_ICONS: ReactNode[] = [<ClipboardCheck size={14} />, <Package size={14} />, <Truck size={14} />, <Boxes size={14} />, <PackageCheck size={14} />]

/** 육로 택배 여정 단계별 지금 현장 수치(그 단계에 있는 차·상자) */
function storyLive(): string[] {
  const hw = (from: string, to: string, kind: Vehicle['kind']) => sim.vehicles.filter((v) => v.visible && v.kind === kind && v.site === from && v.dest === to && (v.phase === 'highway' || v.phase === 'enroute' || v.phase === 'departing')).length
  const icLoad = sim.vehicles.filter((v) => v.kind === 'wing' && v.site === 'IC' && v.phase === 'loading').length
  const toGJ = hw('IC', 'GJ', 'wing')
  const toIN = hw('GJ', 'IN', 'box')
  const out = sim.vehicles.filter((v) => v.home === 'IN' && v.site === 'TW').length
  return [
    L(`피킹 ${sim.robots.filter((r) => r.state === 'atStation').length}/4`, `Picking ${sim.robots.filter((r) => r.state === 'atStation').length}/4`),
    L(`상차 ${icLoad}대`, `${icLoad} loading`),
    L(`운행 ${toGJ}대`, `${toGJ} en route`),
    L(`${num(sim.hub.rate)}/시`, `${num(sim.hub.rate)}/h`),
    L(`운행 ${toIN}대`, `${toIN} en route`),
    L(`슈트 ${num(sim.inSlots.reduce((a, x) => a + x.held, 0) * 8)}`, `Chutes ${num(sim.inSlots.reduce((a, x) => a + x.held, 0) * 8)}`),
    L(`배송 ${out}대`, `${out} out`),
    L(`오늘 ${num(sim.stats.delivered)}`, `${num(sim.stats.delivered)} today`),
  ]
}

function Stepper({ steps, icons, live }: { steps: Step[]; icons: ReactNode[]; live?: string[] }) {
  const doneUpTo = steps.findIndex((x) => x.state !== 'done')
  const fill = doneUpTo < 0 ? 1 : doneUpTo / (steps.length - 1)
  const w = 100 / steps.length
  return (
    <div className="relative mt-3">
      <div className="absolute top-[13px] h-[3px] rounded-full bg-line" style={{ left: `${w / 2}%`, right: `${w / 2}%` }} />
      <div className="absolute top-[13px] h-[3px] rounded-full bg-brand transition-[width] duration-500" style={{ left: `${w / 2}%`, width: `${(100 - w) * fill}%` }} />
      <ol className="relative flex">
        {steps.map((st, i) => (
          <li key={i} className="flex min-w-0 flex-1 flex-col items-center text-center">
            <span
              className={`grid h-[28px] w-[28px] place-items-center rounded-full border-2 ${
                st.state === 'done' ? 'border-brand bg-brand text-white' : st.state === 'active' ? 'pulse-ring border-brand bg-white text-brand' : 'border-line bg-white text-faint'
              }`}
            >
              {st.state === 'done' ? <Check size={13} strokeWidth={3} /> : icons[i]}
            </span>
            <span className={`mt-1.5 w-full truncate px-0.5 text-[11px] font-semibold ${st.state === 'todo' ? 'text-muted' : 'text-ink'}`}>{st.label}</span>
            <span className="w-full truncate px-0.5 text-[10px] text-faint">{st.sub}</span>
            <span className="num text-[10.5px] text-faint">{st.state === 'todo' ? (st.eta ? L(`예정 ${hhmm(st.eta)}`, `ETA ${hhmm(st.eta)}`) : '') : st.state === 'active' ? L('진행 중', 'In progress') : hhmm(st.time)}</span>
            {live?.[i] && <span className="num mt-0.5 max-w-full truncate rounded bg-line-2 px-1 py-px text-[9.5px] font-semibold text-ink-2" title={L('지금 이 단계 현장 수치', 'Live count at this step')}>{live[i]}</span>}
          </li>
        ))}
      </ol>
    </div>
  )
}

/**
 * 택배 여정 단계별 걸린 시간(관제 시계 초): 헤드리스 실행으로 잰 값에서 시작해, 화면을 연 뒤 끝난 단계로 지수 이동 평균.
 * i번째 = i단계 시작 → i+1단계 시작
 */
const STAGE_DUR = [2, 43, 59, 28, 25, 54, 20].map((m) => m * 60)
const learned = new Set<string>()

/** 앞으로 올 단계의 도착 예정: 간선 운송 중이면 그 차의 도착 약속, 나머지는 단계별 평균 시간을 이어 붙인다 */
function storyEtas(): (number | undefined)[] {
  const s = sim.story
  for (let i = 1; i < s.times.length; i++) {
    const key = `${s.n}:${i}`
    if (!s.times[i] || !s.times[i - 1] || learned.has(key)) continue
    learned.add(key)
    STAGE_DUR[i - 1] = STAGE_DUR[i - 1] * 0.6 + (s.times[i] - s.times[i - 1]) * 0.4
  }
  const out: (number | undefined)[] = []
  if (s.stage < 0 || s.stage >= 7) return out
  const a = s.stage
  const v = s.vehicle ? sim.vehicle(s.vehicle) : null
  const st = v && (a === 2 || a === 4) ? sim.promises.status(v) : null
  let t = st && !st.state.startsWith('done') ? st.eta : Math.max(sim.clock + 60, (s.times[a] || sim.clock) + STAGE_DUR[a])
  for (let i = a + 1; i < STORY_STEPS.length; i++) {
    out[i] = t
    t += STAGE_DUR[i] ?? 0
  }
  return out
}

function StoryTracker() {
  const s = sim.story
  const pos = sim.storyPos()
  const etas = storyEtas()
  const steps: Step[] = STORY_STEPS.map((x, i) => ({
    label: x.label,
    sub: x.sub,
    time: s.times[i] || sim.clock,
    state: s.stage === 7 || i < s.stage ? 'done' : i === s.stage ? 'active' : 'todo',
    eta: etas[i],
  }))
  const following = useStore((st) => st.selected?.kind === 'story')
  return (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between text-[12px]">
          <span className="flex items-center gap-2 font-semibold text-ink">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-[#FFF1EB] text-[#D9531E]"><Package size={13} /></span>
            {L('택배 한 상자의 여정', 'Journey of one parcel')}
            <span className="rounded-md bg-line-2 px-1.5 py-0.5 text-[10.5px] font-semibold text-muted">#{s.n}</span>
          </span>
          <span className="truncate text-muted">{L('이천 FC → 곤지암 → 인천 → 다온마을', 'Icheon FC → Gonjiam → Incheon → Daon Village')}</span>
        </div>
        <Stepper steps={steps} icons={STORY_ICONS} live={storyLive()} />
      </div>
      <div className="flex w-[226px] shrink-0 flex-col justify-between rounded-xl border border-line bg-[#FAFBFE] p-2.5">
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[12.5px] font-bold text-ink">#{s.no}</div>
          <div className="truncate text-[11px] text-muted">{ITEMS[s.item].name} · {s.seller}</div>
          <div className="mt-0.5 truncate text-[11px] text-muted">{L('받는 분', 'To')} {s.customer} · {storyAddress()}</div>
          {s.memo && (
            <div className="mt-0.5 truncate text-[11px] text-brand" title={s.memo}>
              ✦ “{s.memo}” → {s.memoPlan ? (s.memoPlan.dropConfidence >= 0.6 ? DROP_SHORT[s.memoPlan.drop] : L('확인 필요', 'Needs check')) : s.memoStatus === 'pending' ? L('해석 중', 'Reading…') : ai.on ? L('해석 실패 · 문 앞', 'Read failed · Doorstep') : L('AI 꺼짐 · 문 앞', 'AI off · Doorstep')}
            </div>
          )}
          <div className="mt-1.5 flex items-center gap-1.5">
            <Chip tone={s.stage >= 7 ? 'green' : 'blue'}>{STORY_STEPS[Math.max(0, s.stage)].label}</Chip>
            <span className="truncate text-[11px] text-muted">{pos.label}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            const st = useStore.getState()
            if (following) st.select(null)
            else {
              st.select({ kind: 'story', id: 'story' }, pos.site)
              if (st.speed < 4) st.setSpeed(4)
            }
          }}
          className={`mt-2 flex h-8 items-center justify-center gap-1.5 rounded-lg text-[12px] font-semibold ${following ? 'bg-[#FF6B3D] text-white' : 'bg-brand text-white hover:bg-brand-2'}`}
        >
          <Crosshair size={13} />
          {following ? L('따라가는 중 · 해제', 'Following · stop') : L('여정 따라가기 (×4)', 'Follow journey (×4)')}
        </button>
      </div>
    </>
  )
}

/** 배·비행기 여정: 단계와 지금 일어나는 일, 따라가기 */
function JourneyTracker({ mode }: { mode: 'sea' | 'air' }) {
  const j = mode === 'sea' ? sim.sea : sim.air
  const pos = j.pos()
  const running = j.status === 'running'
  const steps: Step[] = j.steps.map((x, i) => ({
    label: x.label,
    sub: x.sub,
    time: j.times[i] || sim.clock,
    state: !running && j.status === 'done' ? 'done' : i < j.stage ? 'done' : i === j.stage ? 'active' : 'todo',
  }))
  const cur = j.steps[Math.max(0, j.stage)]
  const following = useStore((st) => st.selected?.kind === 'story' && st.selected.id === mode)
  const sea = mode === 'sea'
  const m = sea ? sim.sea.box?.manifest : null
  const held = j.status === 'held'
  return (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between text-[12px]">
          <span className="flex items-center gap-2 font-semibold text-ink">
            <span className={`grid h-6 w-6 place-items-center rounded-md ${sea ? 'bg-[#E8F1FF] text-[#2563EB]' : 'bg-[#EEF0FF] text-[#5B5BD6]'}`}>{sea ? <Ship size={13} /> : <Plane size={13} />}</span>
            {sea ? L('배로 오는 해외 직구 컨테이너', 'Import container by sea') : L('비행기로 가는 역직구 상자', 'Export parcel by air')}
            <span className="rounded-md bg-line-2 px-1.5 py-0.5 text-[10.5px] font-semibold text-muted">#{j.n}</span>
          </span>
          <span className="truncate text-muted">{sea ? (sim.sea.via === 'rail' ? L('상하이 → 부산신항 → 철송 → 곤지암', 'Shanghai → Busan New Port → Rail → Gonjiam') : L('상하이 → 부산신항 → 곤지암', 'Shanghai → Busan New Port → Gonjiam')) : L(`곤지암 → 인천공항 → ${sim.air.dest || '해외'}`, `Gonjiam → Incheon Airport → ${sim.air.dest || 'Overseas'}`)}</span>
        </div>
        <Stepper steps={steps} icons={sea ? (sim.sea.via === 'rail' ? SEA_RAIL_ICONS : SEA_ICONS) : AIR_ICONS} />
        <p className="mt-2 line-clamp-2 rounded-lg bg-line-2 px-2 py-1.5 text-[11px] leading-snug text-ink-2" title={cur.desc}>
          <span className="font-semibold text-ink">{held ? L('탑재 보류 · ', 'Loading held · ') : j.status === 'done' ? L('완료 · ', 'Done · ') : L('지금 · ', 'Now · ')}{cur.label}</span> {held ? L('신고하지 않은 위험물이 의심되어 항공 탑재를 보류하고 해상 운송으로 돌렸습니다.', 'Suspected undeclared dangerous goods: air loading was held and the shipment moved to sea freight.') : cur.desc}
        </p>
      </div>
      <div className="flex w-[226px] shrink-0 flex-col justify-between rounded-xl border border-line bg-[#FAFBFE] p-2.5">
        <div className="min-w-0 leading-tight">
          <div className="num truncate text-[12.5px] font-bold text-ink">{sea ? L(`컨테이너 ${j.no}`, `Container ${j.no}`) : j.no || L(`항공 화물 #${j.n} · AWB 발급 전`, `Air cargo #${j.n} · no AWB yet`)}</div>
          {sea ? (
            <>
              <div className="truncate text-[11px] text-muted" title={m?.description}>{m ? `${m.declared} · ${m.shipper}` : L('적하목록 확인 중', 'Checking manifest')}</div>
              <div className="mt-0.5 truncate text-[11px] text-muted">{sim.sea.via === 'rail' ? L('40ft 수입 컨테이너 · 철송(셔틀 열차)', '40ft import container · by rail (shuttle train)') : sim.sea.truck ? L(`트레일러 ${sim.sea.truck}`, `Trailer ${sim.sea.truck}`) : L('40ft 수입 컨테이너', '40ft import container')}</div>
            </>
          ) : (
            <>
              <div className="truncate text-[11px] text-muted">{sim.air.item} · {sim.air.dest}</div>
              <div className="mt-0.5 truncate text-[11px] text-muted">{sim.air.ac ? `${sim.air.ac.flight} · ${sim.air.ac.type}` : L(`트럭 ${sim.air.truck ?? '-'}`, `Truck ${sim.air.truck ?? '-'}`)}</div>
            </>
          )}
          {j.decision && <div className="mt-0.5 truncate text-[11px] text-brand" title={j.decision}>✦ {j.decision}</div>}
          <div className="mt-1.5 flex items-center gap-1.5">
            <Chip tone={held ? 'amber' : j.status === 'done' ? 'green' : 'blue'}>{held ? L('탑재 보류', 'Loading held') : cur.label}</Chip>
            <span className="truncate text-[11px] text-muted">{pos.label}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            const st = useStore.getState()
            if (following) st.select(null)
            else {
              st.select({ kind: 'story', id: mode }, pos.site)
              if (st.speed < 4) st.setSpeed(4)
            }
          }}
          className={`mt-2 flex h-8 items-center justify-center gap-1.5 rounded-lg text-[12px] font-semibold ${following ? 'bg-[#FF6B3D] text-white' : 'bg-brand text-white hover:bg-brand-2'}`}
        >
          <Crosshair size={13} />
          {following ? L('따라가는 중 · 해제', 'Following · stop') : L('여정 따라가기 (×4)', 'Follow journey (×4)')}
        </button>
      </div>
    </>
  )
}

/** 반품 회수 여정: 고객 문 앞 → 배송차 → 인천 서브 → 간선 회송 → 곤지암 반품 검수 */
function ReturnTracker() {
  const r = sim.cs.focus
  const following = useStore((st) => st.selected?.kind === 'story' && st.selected.id === 'ret')
  if (!r) return <div className="flex-1 py-6 text-center text-[12px] text-muted">{L('반품 접수를 기다리는 중입니다', 'Waiting for a return request')}</div>
  const pos = sim.journeyPos('ret')
  const steps: Step[] = RETURN_STEPS.map((x, i) => ({
    label: x.label,
    sub: i === 1 && r.van ? r.van : i === 4 && r.truck ? r.truck : x.sub,
    time: r.times[i] ?? sim.clock,
    state: r.stage === 6 || i < r.stage ? 'done' : i === r.stage ? 'active' : 'todo',
  }))
  const cur = RETURN_STEPS[r.stage]
  return (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between text-[12px]">
          <span className="flex items-center gap-2 font-semibold text-ink">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-warn-soft text-warn"><Undo2 size={13} /></span>
            {L('고객이 돌려보내는 반품 상자', 'Return box sent back by a customer')}
            <span className="rounded-md bg-line-2 px-1.5 py-0.5 text-[10.5px] font-semibold text-muted">{r.no}</span>
          </span>
          <span className="truncate text-muted">{STOPS[r.stopId]?.label} {L('→ 인천 서브 → 곤지암 검수', '→ Incheon Sub → Gonjiam QC')}</span>
        </div>
        <Stepper steps={steps} icons={RET_ICONS} />
        <p className="mt-2 line-clamp-2 rounded-lg bg-line-2 px-2 py-1.5 text-[11px] leading-snug text-ink-2" title={cur.desc}>
          <span className="font-semibold text-ink">{r.stage === 6 ? L('완료 · ', 'Done · ') : L('지금 · ', 'Now · ')}{cur.label}</span> {r.stage >= 5 && r.note ? `${r.note}.` : cur.desc}
        </p>
      </div>
      <div className="flex w-[226px] shrink-0 flex-col justify-between rounded-xl border border-line bg-[#FAFBFE] p-2.5">
        <div className="min-w-0 leading-tight">
          <div className="num truncate text-[12.5px] font-bold text-ink">{r.item.name}</div>
          <div className="truncate text-[11px] text-muted">{r.customer} · “{r.text}”</div>
          <div className="mt-0.5 truncate text-[11px] text-brand">✦ {r.status === 'pending' ? L('사유 판독 중', 'Reading reason…') : `${REASON_LABEL[r.reason]}${r.unopened ? L(' · 미개봉', ' · unopened') : ''} (${r.by === 'ai' ? 'AI' : L('규칙', 'Rules')})`}</div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <Chip tone={r.stage === 6 ? 'green' : 'amber'}>{r.stage === 6 && r.disposition ? DISPOSITION_LABEL[r.disposition] : cur.label}</Chip>
            <span className="truncate text-[11px] text-muted">{pos.label}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            const st = useStore.getState()
            if (following) st.select(null)
            else {
              st.select({ kind: 'story', id: 'ret' }, pos.site)
              if (st.speed < 4) st.setSpeed(4)
            }
          }}
          className={`mt-2 flex h-8 items-center justify-center gap-1.5 rounded-lg text-[12px] font-semibold ${following ? 'bg-[#FF6B3D] text-white' : 'bg-brand text-white hover:bg-brand-2'}`}
        >
          <Crosshair size={13} />
          {following ? L('따라가는 중 · 해제', 'Following · stop') : L('여정 따라가기 (×4)', 'Follow journey (×4)')}
        </button>
      </div>
    </>
  )
}

function VehicleTracker({ v }: { v: Vehicle }) {
  const steps = shipmentSteps(v)
  const s = vehicleStatus(v)
  const eta = vehicleEta(v)
  const c = CARRIERS[v.carrier]
  const glyph: GlyphKind = v.kind === 'reefer' ? 'reefer' : v.kind === 'trailer' ? 'trailer' : v.kind
  return (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between text-[12px]">
          <span className="flex items-center gap-2 font-semibold text-ink">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-brand-soft text-brand"><Truck size={13} /></span>
            {L('차량 운송 추적', 'Vehicle tracking')}
          </span>
          <span className="text-muted">{v.id} · {carrierName(v)}</span>
        </div>
        <Stepper steps={steps} icons={STEP_ICONS} />
      </div>
      <button
        type="button"
        onClick={() => useStore.getState().select({ kind: 'vehicle', id: v.id })}
        className="flex w-[226px] shrink-0 items-center gap-2.5 rounded-xl border border-line bg-[#FAFBFE] px-2.5 text-left hover:border-brand/40"
      >
        <Glyph kind={glyph} color={c.color} size={38} />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[12.5px] font-bold text-ink">#{v.shipment.no}</span>
          <span className="block truncate text-[11px] text-muted">{v.shipment.origin.replace(/^[A-Z]{2}-\d\d /, '')} → {v.shipment.dest.replace(/^[A-Z]{2}-\d\d /, '')}</span>
          <Chip tone={s.tone} className="mt-1">{s.label}</Chip>
          <span className="num mt-1 block truncate text-[11px] text-muted">
            {resLabel(v)}
            {eta ? (isMoving(v) ? L(` · ${eta.min}분 후 도착`, ` · arrives in ${eta.min} min`) : L(` · ${eta.min}분 남음`, ` · ${eta.min} min left`)) : ''}
          </span>
        </span>
        <ChevronRight size={15} className="text-faint" />
      </button>
    </>
  )
}

/** 하단 왼쪽: 스토리 여정 / 차량 운송 추적 */
export function Tracker() {
  useStore((s) => s.tick)
  const mode = useStore((s) => s.trackMode)
  const tracked = useStore((s) => s.tracked)
  const v = sim.vehicle(tracked)
  const showVehicle = mode === 'vehicle' && v
  const tabs: { m: TrackMode; label: ReactNode }[] = [
    { m: 'story', label: <><Truck size={12} />{L('육로 택배', 'Road parcel')}</> },
    { m: 'sea', label: <><Ship size={12} />{L('해상 수입', 'Sea import')}</> },
    { m: 'air', label: <><Plane size={12} />{L('항공 수출', 'Air export')}</> },
    { m: 'ret', label: <><Undo2 size={12} />{L('반품 회수', 'Return pickup')}</> },
    { m: 'dock', label: <><CalendarRange size={12} />{L('도크 일정', 'Dock schedule')}</> },
    { m: 'gate', label: <><DoorOpen size={12} />{L('정문 출입', 'Gate log')}</> },
    { m: 'vehicle', label: L(`차량 ${v ? v.id : ''}`, `Vehicle ${v ? v.id : ''}`) },
  ]
  return (
    <section className="panel pointer-events-auto absolute left-4 z-20 w-[min(780px,calc(100vw-440px))] p-3.5" style={{ bottom: 'calc(1rem + var(--tl, 0px))' }} aria-label={L('배송 추적', 'Delivery tracking')}>
      <div className="absolute -top-8 left-0 flex gap-1" role="tablist">
        {tabs.map(({ m, label }) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => useStore.getState().setTrackMode(m)}
            className={`flex items-center gap-1 rounded-t-lg px-2.5 py-1 text-[11.5px] font-semibold ${mode === m ? 'bg-white text-ink shadow-sm' : 'bg-white/60 text-muted hover:text-ink'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex items-stretch gap-4">{showVehicle ? <VehicleTracker v={v} /> : mode === 'dock' ? <DockSchedule /> : mode === 'gate' ? <GateTable /> : mode === 'sea' || mode === 'air' ? <JourneyTracker mode={mode} /> : mode === 'ret' ? <ReturnTracker /> : <StoryTracker />}</div>
    </section>
  )
}

function ListRow({ title, sub, tone, text, chip, value, right, onClick, active }: {
  title: string
  sub: string
  tone: Tone
  text: string
  chip: string
  value?: number
  right: string
  onClick: () => void
  active?: boolean
}) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-2 rounded-lg px-2 py-[7px] text-left text-[12px] ${active ? 'bg-brand-soft' : 'hover:bg-line-2'}`}>
      <span className="w-[62px] shrink-0 leading-tight">
        <span className="block font-semibold text-ink">{title}</span>
        <span className="block truncate text-[10.5px] text-faint">{sub}</span>
      </span>
      <Dot tone={tone} />
      <span className="min-w-0 flex-1 truncate text-ink-2">{text}</span>
      <Chip tone={tone} className="min-w-[64px] max-w-[132px] shrink-0 justify-center"><span className="min-w-0 truncate">{chip}</span></Chip>
      <span className="w-[52px] shrink-0">
        {value !== undefined && <Bar value={value} tone={tone === 'amber' ? 'amber' : 'green'} />}
        <span className="num block text-right text-[10.5px] text-muted">{right}</span>
      </span>
      <ChevronRight size={13} className="shrink-0 text-faint" />
    </button>
  )
}

/** 하단 오른쪽: 현재 거점의 도크·지게차·차량 목록 */
export function OpsPanel() {
  useStore((s) => s.tick)
  const tab = useStore((s) => s.opsTab)
  const site = useStore((s) => s.site)
  const view = useStore((s) => s.view)
  const selected = useStore((s) => s.selected)
  const select = useStore.getState().select
  const docks =
    site === 'GJ' ? [...sim.bays, ...sim.docks, ...sim.slots]
      : site === 'IC' ? [...sim.icBays, ...sim.icReefers]
        : site === 'IN' || site === 'TW' ? [...sim.inDocks, ...sim.inSlots]
          : site === 'AP' ? sim.apDocks
            : site === 'DJ' ? sim.djDocks
            : []
  const busyDocks = docks.filter((d) => d.vehicle && sim.vehicle(d.vehicle)?.site === site).length
  const forklifts = sim.forklifts.filter((f) => site === 'GJ' || site === 'IC' ? f.site === site : false)
  const djEquip = site === 'DJ' ? sim.djwh.equip : []
  const working = forklifts.filter((f) => f.status !== 'idle' && f.status !== 'parking').length + djEquip.filter((e) => !idleTask(e.task)).length
  const robots = robotsAt(site, view === 'network').filter((r) => r.sel.kind !== 'equip')
  const people = peopleAt(site, view === 'network')
  // 도크 묶음: 입고(하차) / 출고(상차) / 입출고. 도크 종류 이름(format.ts dockInfo)을 한국어·영어 모두 읽는다
  // (영어 'unloading' 안의 'loading'은 상차로 치지 않는다)
  const dockGroup = (type: string): 'in' | 'out' | 'both' =>
    /하차|입고|unloading|inbound/i.test(type) && !/상차|(^|[^n])loading/i.test(type) ? 'in' : /대전|항공|daejeon|\bair\b/i.test(type) ? 'both' : 'out'
  const vehicles = sim.vehicles.filter((v) => v.visible && (view === 'network' || v.site === site || v.dest === site || (site === 'TW' && v.home === 'IN' && v.site === 'TW')))
  const order: Record<string, number> = { unloading: 0, loading: 0, delivering: 1, craning: 1, closing: 2, docking: 3, inbound: 4, gate: 5, enroute: 6, highway: 7, departing: 8, returning: 8, waiting: 9, yard: 9 }
  // 약속 위험·지연인 차를 먼저(경로 관리 영상: 위험 먼저 보기), 그다음 작업 단계 순
  const riskRank = (v: Vehicle) => {
    const st = sim.promises.status(v)
    return st?.state === 'late' ? 0 : st?.state === 'risk' ? 1 : 2
  }
  vehicles.sort((a, b) => riskRank(a) - riskRank(b) || (order[a.phase] ?? 9) - (order[b.phase] ?? 9) || a.id.localeCompare(b.id))
  const tabs: { key: OpsTab; label: string; count: string }[] = [
    { key: 'docks', label: L('도크', 'Docks'), count: `${busyDocks}/${docks.length}` },
    { key: 'vehicles', label: L('트럭', 'Trucks'), count: String(vehicles.length) },
    { key: 'forklifts', label: site === 'DJ' ? L('장비', 'Equipment') : L('지게차', 'Forklifts'), count: `${working}/${forklifts.length + djEquip.length}` },
    { key: 'robots', label: L('로봇', 'Robots'), count: String(robots.length) },
    { key: 'people', label: L('사람', 'People'), count: String(people.length) },
  ]
  const isSel = (kind: string, id: string) => selected?.kind === kind && selected.id === id
  const empty = (text: string) => <div className="px-2 py-6 text-center text-[12px] text-muted">{text}</div>
  return (
    <section className="panel pointer-events-auto absolute right-4 z-20 w-[412px] p-2" style={{ bottom: 'calc(1rem + var(--tl, 0px))' }} aria-label={L('운영 현황', 'Operations status')}>
      <div className="flex items-center justify-between px-1 pb-1.5">
        <div className="flex gap-1 rounded-lg bg-line-2 p-0.5" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => useStore.getState().setTab(t.key)}
              className={`whitespace-nowrap rounded-md px-1.5 py-1 text-[11.5px] font-semibold ${tab === t.key ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
            >
              {t.label} <span className="num font-medium text-muted">{t.count}</span>
            </button>
          ))}
        </div>
        <span className="truncate pl-1 text-[10.5px] text-muted">{view === 'network' ? L('전국', 'National') : SITE_META[site].code}</span>
      </div>
      <div className="scroll-thin h-[178px] overflow-y-auto">
        {tab === 'docks' && (docks.length ? docks.map((d, i) => {
          const info = dockInfo(d.id)!
          const v = info.vehicle
          const here = v && v.site === info.site
          const group = dockGroup(info.type)
          const prev = i > 0 ? dockGroup(dockInfo(docks[i - 1].id)!.type) : ''
          return (
            <div key={d.id}>
            {group !== prev && <div className="px-2 pb-0.5 pt-1.5 text-[10.5px] font-bold text-faint">{group === 'in' ? L('입고 · 하차', 'Inbound · unloading') : group === 'out' ? L('출고 · 상차', 'Outbound · loading') : L('입출고', 'Inbound/outbound')}</div>}
            <ListRow
              key={d.id}
              title={d.id}
              sub={info.type.replace(/^(윙바디|Wing-body) /, '').replace(/ (도크|dock)$/, '').replace(/^[a-z]/, (c) => c.toUpperCase())}
              tone={info.tone}
              text={v ? `${v.id} · ${carrierName(v)}` : L('배정 차량 없음', 'No vehicle assigned')}
              chip={info.status}
              value={here && v.cargoTotal ? v.cargoDone / v.cargoTotal : undefined}
              right={here ? `${Math.floor(v.cargoDone)}/${v.cargoTotal}` : ''}
              onClick={() => select({ kind: 'dock', id: d.id }, info.site)}
              active={isSel('dock', d.id)}
            />
            </div>
          )
        }) : empty(L('이 거점은 도크 대신 안벽 크레인을 씁니다', 'This site uses quay cranes instead of docks')))}
        {tab === 'docks' && site === 'DJ' && sim.djYard.map((y) => {
          const v = y.vehicle ? sim.vehicle(y.vehicle) : null
          return (
            <ListRow key={y.id} title={y.id} sub={L('야드 대기', 'Yard wait')} tone={v ? 'amber' : 'gray'} text={v ? L(`${v.id} · 도크 배정 대기`, `${v.id} · awaiting dock`) : L('비어 있음', 'Empty')} chip={v ? L('대기 중', 'Waiting') : L('비어 있음', 'Empty')} right="" onClick={() => v && select({ kind: 'vehicle', id: v.id }, 'DJ')} active={false} />
          )
        })}
        {tab === 'forklifts' && (forklifts.length ? forklifts.map((f) => {
          const s = forkliftStatus(f)
          return (
            <ListRow
              key={f.id}
              title={f.id}
              sub={SITE_META[f.site].code}
              tone={s.tone}
              text={forkliftTask(f)}
              chip={s.label}
              value={f.battery / 100}
              right={`${Math.round(f.battery)}%`}
              onClick={() => select({ kind: 'forklift', id: f.id }, f.site)}
              active={isSel('forklift', f.id)}
            />
          )
        }) : null)}
        {tab === 'forklifts' && djEquip.map((e) => (
          <ListRow
            key={e.id}
            title={e.id}
            sub={e.kind === 'reach' ? L('리치트럭', 'Reach truck') : L('지게차', 'Forklift')}
            tone={idleTask(e.task) ? 'gray' : 'green'}
            text={e.task}
            chip={idleTask(e.task) ? L('대기', 'Idle') : e.kind === 'reach' ? (/^(반출|retriev)/i.test(e.task) ? L('반출', 'Retrieve') : L('적치', 'Put-away')) : L('운반', 'Moving')}
            value={e.battery / 100}
            right={`${Math.round(e.battery)}%`}
            onClick={() => select({ kind: 'equip', id: e.id }, 'DJ')}
            active={isSel('equip', e.id)}
          />
        ))}
        {tab === 'forklifts' && !forklifts.length && !djEquip.length && empty(L('이 거점에는 지게차가 없습니다', 'No forklifts at this site'))}
        {tab === 'robots' && (robots.length ? robots.map((r) => (
          <ListRow
            key={r.id}
            title={r.title}
            sub={r.sub}
            tone={r.tone}
            text={r.status}
            chip={r.tone === 'gray' ? L('대기', 'Idle') : L('작업 중', 'Working')}
            value={r.battery !== null ? r.battery / 100 : undefined}
            right={r.battery !== null ? `${Math.round(r.battery)}%` : ''}
            onClick={() => select(r.sel, r.site ?? undefined)}
            active={isSel(r.sel.kind, r.sel.id)}
          />
        )) : empty(L('이 거점에는 로봇이 없습니다', 'No robots at this site')))}
        {tab === 'people' && (people.length ? people.map((p) => (
          <ListRow
            key={p.id}
            title={p.name}
            sub={p.role}
            tone={p.tone}
            text={p.doing}
            chip={p.shift === '-' ? L('주민', 'Resident') : p.tone === 'gray' ? L('대기', 'Idle') : L('근무 중', 'On duty')}
            right={p.rate !== '-' ? p.rate : p.shift !== '-' ? p.shift.slice(0, 5) : ''}
            onClick={() => select(p.sel, p.site ?? undefined)}
            active={isSel('mover', p.id)}
          />
        )) : empty(L('지금 이 거점에 사람이 없습니다', 'Nobody at this site right now')))}
        {tab === 'vehicles' && (vehicles.length ? vehicles.map((v) => {
          const s = vehicleStatus(v)
          const eta = vehicleEta(v)
          const pc = promiseChip(v)
          // 약속 칩 문구(format.ts promiseChip): 이미 도착한 차('…도착' · 'Arrived …')는 경고하지 않는다
          const warn = pc && (pc.tone === 'amber' || pc.tone === 'red') && !/도착|arrived/i.test(pc.label)
          const work = v.phase === 'unloading' || v.phase === 'loading'
          const where = v.phase === 'highway' ? `${siteCode(v.site)} → ${siteCode(v.dest)}` : v.site === 'TW' ? (v.stops[v.stopIdx]?.label ?? L('복귀', 'Returning')) : `${siteCode(v.site)} · ${resLabel(v)}`
          return (
            <ListRow
              key={v.id}
              title={v.id}
              sub={carrierName(v)}
              tone={warn ? pc.tone : s.tone}
              text={where}
              chip={warn ? L(`${s.label} · ${pc.label}`, pc.label) : s.label}
              value={work ? v.cargoDone / v.cargoTotal : v.site === 'TW' ? v.delivered / Math.max(1, v.stops.length) : undefined}
              right={work ? `${Math.floor(v.cargoDone)}/${v.cargoTotal}` : v.site === 'TW' ? L(`${v.delivered}/${v.stops.length}곳`, `${v.delivered}/${v.stops.length} ${plural(v.stops.length, 'stop')}`) : eta ? L(`${eta.min}분`, `${eta.min} min`) : ''}
              onClick={() => select({ kind: 'vehicle', id: v.id }, v.site)}
              active={isSel('vehicle', v.id)}
            />
          )
        }) : empty(L('지금 이 거점에 차량이 없습니다', 'No vehicles at this site right now')))}
      </div>
    </section>
  )
}
