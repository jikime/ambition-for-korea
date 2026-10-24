import { PendingPill, openApproval } from './ApproveDialog'
import { CONTROLLER } from '../sim/approvals'
import { LINK_LABEL as LINKS, impactFactor, type Incident as Inc, type LinkId } from '../sim/incidents'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, ChevronDown, ChevronRight, History, Search, Layers, Loader2, Sparkles, Volume2, VolumeX, X } from 'lucide-react'
import { sound } from '../audio/sound'
import { runCommand, type CommandResult } from '../ai/command'
import { sim } from '../sim/sim'
import { ITEMS, MANAGER } from '../sim/data'
import { SITE_META, SITE_ORDER } from '../sim/world'
import { useStore, type Selection } from '../store'
import { Avatar, LogoMark } from './icons'
import { Chip } from './primitives'
import { isCritical, reportPriority } from '../ai/judge'
import type { FieldReport } from '../sim/sim'
import { LINK_LABEL, type Incident } from '../sim/incidents'
import { EnvControl } from './EnvControl'
import { LangSwitch } from './LangSwitch'
import { exitReplay } from './replay'
import { AiSwitch } from './AiSwitch'
import { CenterButton } from './center/OpsCenter'
import { ai } from '../sim/ai'
import { carrierName, forkliftStatus, hhmm, siteOf, siteSummary, vehicleStatus, type Tone } from './format'
import { L, LL, isEn } from '../i18n'

interface Hit {
  sel: Selection
  title: string
  sub: string
  group: string
}

function searchAll(q: string): Hit[] {
  const s = q.trim().toLowerCase()
  if (!s) return []
  const hits: Hit[] = []
  const has = (...xs: string[]) => xs.some((x) => x.toLowerCase().includes(s))
  for (const v of sim.vehicles) {
    if (!v.visible) continue
    if (has(v.id, v.plate, v.driver, carrierName(v), v.shipment.no)) hits.push({ sel: { kind: 'vehicle', id: v.id }, title: v.id, sub: `${carrierName(v)} · ${v.plate} · ${vehicleStatus(v).label}`, group: L('차량', 'Vehicle') })
  }
  for (const f of sim.forklifts) if (has(f.id, f.driver, L('지게차', 'forklift'))) hits.push({ sel: { kind: 'forklift', id: f.id }, title: f.id, sub: `${f.driver} · ${forkliftStatus(f).label}`, group: L('지게차', 'Forklift') })
  for (const p of sim.pallets.values()) {
    if (p.state === 'stored' || hits.length > 30) continue
    if (has(p.id, ITEMS[p.item].name, p.lot)) hits.push({ sel: { kind: 'pallet', id: p.id }, title: p.id, sub: L(`${ITEMS[p.item].name} · ${p.qty}개`, `${ITEMS[p.item].name} · ${p.qty} pcs`), group: L('파렛트', 'Pallet') })
  }
  for (const d of [...sim.bays, ...sim.docks, ...sim.slots, ...sim.icBays, ...sim.icReefers, ...sim.inDocks, ...sim.inSlots]) if (has(d.id, ...LL(['도크', '하차', '출고', '슬롯'], ['dock', 'unloading', 'outbound', 'slot']))) hits.push({ sel: { kind: 'dock', id: d.id }, title: d.id, sub: d.vehicle ? L(`${d.vehicle} 사용 중`, `In use · ${d.vehicle}`) : L('사용 가능', 'Available'), group: L('도크', 'Dock') })
  for (const c of sim.chargers) if (has(c.id, ...LL(['충전'], ['charger', 'charging']))) hits.push({ sel: { kind: 'charger', id: c.id }, title: L(`충전기 ${c.id}`, `Charger ${c.id}`), sub: c.forklift ? L(`${c.forklift} 충전 중`, `Charging ${c.forklift}`) : L('사용 가능', 'Available'), group: L('충전기', 'Charger') })
  for (const a of sim.airport.aircraft) if (has(a.flight, ...LL(['화물기', '비행기', '항공', '공항'], ['freighter', 'plane', 'air', 'airport']), a.type)) hits.push({ sel: { kind: 'aircraft', id: a.id }, title: a.flight, sub: `${a.airline === 'daon' ? L('다온항공', 'Daon Air') : L('한빛카고', 'Hanbit Cargo')} ${a.type} · ${a.route}`, group: L('화물기', 'Freighter') })
  if (has(...LL(['분류', '소터', 'X1', '크로스벨트', '리젝트', '허브'], ['sort', 'sorter', 'X1', 'cross-belt', 'reject', 'hub']))) hits.push({ sel: { kind: 'sorter', id: 'X1' }, title: L('크로스벨트 소터 X1', 'Cross-belt sorter X1'), sub: L('곤지암 허브 분류동 · 리젝트 데스크', 'Gonjiam Hub sort hall · Reject desk'), group: L('설비', 'Equip.') })
  if (has(...LL(['분류', '소터', 'S1', '컨베이어'], ['sort', 'sorter', 'S1', 'conveyor']))) hits.push({ sel: { kind: 'sorter', id: 'S1' }, title: L('분류 라인 S1', 'Sorting line S1'), sub: L('곤지암 배송 분류장', 'Gonjiam delivery sort area'), group: L('설비', 'Equip.') })
  if (has(...LL(['분류', '소터', 'S2', '휠소터', '인천'], ['sort', 'sorter', 'S2', 'wheel sorter', 'incheon']))) hits.push({ sel: { kind: 'sorter', id: 'S2' }, title: L('인천 휠소터 S2', 'Incheon wheel sorter S2'), sub: L('서브터미널 분류', 'Sub-terminal sorting'), group: L('설비', 'Equip.') })
  if (has(...LL(['크레인', '항만', '부산', 'STS'], ['crane', 'port', 'busan', 'STS']))) [0, 1, 2].forEach((i) => hits.push({ sel: { kind: 'crane', id: `sts-${i}` }, title: L(`안벽 크레인 STS-${i + 1}`, `Quay crane STS-${i + 1}`), sub: L('부산신항', 'Busan New Port'), group: L('설비', 'Equip.') }))
  if (has(...LL(['AGV', '무인'], ['AGV', 'automated', 'driverless']))) sim.port.agvs.forEach((a, i) => hits.push({ sel: { kind: 'crane', id: `agv-${i}` }, title: a.id, sub: L('부산신항 무인 운반차', 'Busan New Port driverless carrier'), group: L('설비', 'Equip.') }))
  if (has(...LL(['ARMG', '야드 크레인', '블록'], ['ARMG', 'yard crane', 'block']))) [0, 1, 2, 3, 4, 5, 6, 7].forEach((i) => hits.push({ sel: { kind: 'crane', id: `armg-${i}` }, title: `ARMG-${'ABCD'[i >> 1]}${i % 2 ? '2' : '1'}`, sub: L(`부산신항 야드 크레인 ${i % 2 ? '육측' : '해측'}`, `Busan New Port yard crane · ${i % 2 ? 'Landside' : 'Seaside'}`), group: L('설비', 'Equip.') }))
  if (has(...LL(['택배', '여정', '스토리', '육로', '트럭'], ['parcel', 'journey', 'story', 'road', 'truck']), sim.story.no)) hits.push({ sel: { kind: 'story', id: 'story' }, title: L(`택배 ${sim.story.no}`, `Parcel ${sim.story.no}`), sub: L('육로 · 한 상자의 여정 따라가기', 'Road · Follow one box’s journey'), group: L('여정', 'Journey') })
  if (has(...LL(['여정', '해상', '배', '선박', '컨테이너', '수입'], ['journey', 'sea', 'ship', 'vessel', 'container', 'import']), sim.sea.no)) hits.push({ sel: { kind: 'story', id: 'sea' }, title: L(`컨테이너 ${sim.sea.no}`, `Container ${sim.sea.no}`), sub: L('해상 · 배로 오는 해외 직구 따라가기', 'Sea · Follow an overseas order arriving by ship'), group: L('여정', 'Journey') })
  if (has(...LL(['여정', '항공', '비행기', '화물기', '수출'], ['journey', 'air', 'plane', 'freighter', 'export']), sim.air.no)) hits.push({ sel: { kind: 'story', id: 'air' }, title: sim.air.no || L(`항공 화물 #${sim.air.n}`, `Air cargo #${sim.air.n}`), sub: L('항공 · 비행기로 가는 역직구 따라가기', 'Air · Follow an export order leaving by plane'), group: L('여정', 'Journey') })
  for (const id of SITE_ORDER) {
    const m = SITE_META[id]
    if (has(m.code, m.name, m.type)) hits.push({ sel: { kind: 'site', id }, title: `${m.code} ${m.name}`, sub: m.type, group: L('거점', 'Site') })
  }
  return hits.slice(0, 9)
}

function AiResultCard({ r, onClose }: { r: CommandResult; onClose: () => void }) {
  return (
    <div className="panel rise absolute left-0 right-0 top-11 z-40 p-2.5" role="status">
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md ${r.ok ? 'bg-brand-soft text-brand' : 'bg-warn-soft text-warn'}`}><Sparkles size={13} /></span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] text-muted">“{r.text}”</div>
          <div className="mt-0.5 text-[12.5px] font-semibold text-ink">{r.summary}</div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {r.chips.map((c) => (
              <span key={c.label} className="num rounded-md bg-line-2 px-1.5 py-[3px] text-[10.5px] font-semibold text-ink-2">
                {c.label} <span className={c.confidence < 0.7 ? 'text-warn' : 'text-faint'}>{c.confidence.toFixed(2)}</span>
              </span>
            ))}
            <span className="num rounded-md px-1.5 py-[3px] text-[10.5px] text-faint">AI · {Math.round(r.ms)}ms</span>
          </div>
        </div>
        <button type="button" aria-label={L('닫기', 'Close')} onClick={onClose} className="grid h-6 w-6 place-items-center rounded-md text-muted hover:bg-line-2"><X size={13} /></button>
      </div>
      {r.matches.length > 1 && (
        <div className="mt-2 grid grid-cols-2 gap-1 border-t border-line-2 pt-2">
          {r.matches.slice(0, 6).map((m) => (
            <button key={m.title} type="button" onClick={() => useStore.getState().select(m.sel, m.site)} className="flex items-center justify-between rounded-md px-2 py-1 text-left text-[11.5px] hover:bg-brand-soft">
              <span className="font-semibold text-ink">{m.title}</span>
              <span className="num truncate pl-2 text-[10.5px] text-muted">{m.sub}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SearchBox() {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [idx, setIdx] = useState(0)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<CommandResult | null>(null)
  const input = useRef<HTMLInputElement>(null)
  useStore((s) => s.tick)
  const hits = useMemo(() => searchAll(q), [q])
  const rows = q.trim().length >= 2 ? hits.length + 1 : hits.length
  const aiFirst = q.trim().length >= 2

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        input.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!result) return
    const id = setTimeout(() => setResult(null), 14000)
    return () => clearTimeout(id)
  }, [result])

  const choose = (h: Hit) => {
    useStore.getState().select(h.sel, siteOf(h.sel))
    setQ('')
    setOpen(false)
    input.current?.blur()
  }

  const command = async () => {
    const text = q.trim()
    if (!text || busy) return
    setBusy(true)
    setOpen(false)
    setResult(null)
    const r = await runCommand(text)
    setBusy(false)
    setResult(r)
    if (r.ok) setQ('')
    input.current?.blur()
  }

  const pickRow = (i: number) => {
    if (aiFirst && i === 0) {
      if (ai.on) void command()
      else useStore.getState().setAiOpen(true)
    }
    else {
      const h = hits[aiFirst ? i - 1 : i]
      if (h) choose(h)
    }
  }

  return (
    <div className="relative w-[min(380px,20vw)]">
      <label className="flex h-9 items-center gap-2 rounded-xl border border-line bg-white px-3 text-[13px] text-muted focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15">
        {busy ? <Loader2 size={15} className="animate-spin text-brand" /> : <Search size={15} strokeWidth={2.2} />}
        <input
          ref={input}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setIdx(0); setResult(null) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(rows - 1, i + 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)) }
            if (e.key === 'Enter') pickRow(idx)
            if (e.key === 'Escape') { setQ(''); input.current?.blur() }
          }}
          placeholder={L('명령하거나 검색 · 예: 인천 가는 간선 중 제일 늦는 차', 'Command or search · e.g. latest linehaul truck to Incheon')}
          aria-label={L('검색 또는 명령', 'Search or command')}
          className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-faint"
        />
        <kbd className="rounded-md border border-line px-1.5 py-0.5 text-[11px] font-medium text-faint">/</kbd>
      </label>
      {open && q && (
        <div className="panel rise absolute left-0 right-0 top-11 z-50 overflow-hidden p-1">
          {aiFirst && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); if (ai.on) void command(); else useStore.getState().setAiOpen(true) }}
              onMouseEnter={() => setIdx(0)}
              className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left ${idx === 0 ? 'bg-brand-soft' : ''}`}
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-brand text-white"><Sparkles size={13} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-ink">{ai.on ? L(`AI에게 명령: “${q}”`, `Ask AI: “${q}”`) : L('AI를 켜면 말로 명령할 수 있어요', 'Turn on AI to give commands in plain words')}</span>
                <span className="block text-[11px] text-muted">{ai.on ? L('말로 거점 이동·차량 찾기·여정 따라가기·속도 변경', 'Go to sites, find vehicles, follow journeys, change speed') : L('지금은 꺼짐 · 눌러서 AI 설정 열기(아래 검색 결과는 그대로 쓸 수 있어요)', 'Off now · Click to open AI settings (search results below still work)')}</span>
              </span>
              <kbd className="rounded-md border border-line px-1.5 py-0.5 text-[10.5px] text-faint">Enter</kbd>
            </button>
          )}
          {hits.map((h, i) => {
            const row = aiFirst ? i + 1 : i
            return (
              <button
                key={`${h.sel.kind}-${h.sel.id}`}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); choose(h) }}
                onMouseEnter={() => setIdx(row)}
                className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left ${row === idx ? 'bg-brand-soft' : ''}`}
              >
                <span className={`${isEn ? 'w-14' : 'w-12'} shrink-0 text-[11px] font-semibold text-muted`}>{h.group}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-ink">{h.title}</span>
                  <span className="block truncate text-[11px] text-muted">{h.sub}</span>
                </span>
                <ChevronRight size={14} className="text-faint" />
              </button>
            )
          })}
        </div>
      )}
      {result && !(open && q) && <AiResultCard r={result} onClose={() => setResult(null)} />}
    </div>
  )
}

function SiteSwitcher() {
  const [open, setOpen] = useState(false)
  const site = useStore((s) => s.site)
  const view = useStore((s) => s.view)
  useStore((s) => s.tick)
  const m = SITE_META[site]
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 items-center gap-2.5 whitespace-nowrap rounded-xl border border-line bg-white py-1 pl-1.5 pr-2 hover:bg-line-2"
        aria-expanded={open}
      >
        <span className={`grid h-7 shrink-0 place-items-center whitespace-nowrap rounded-lg px-1.5 text-[11px] font-bold text-white ${view === 'network' ? 'bg-ink' : 'bg-brand'}`}>{view === 'network' ? 'ALL' : m.code}</span>
        <span className="text-left leading-tight">
          <span className="block max-w-[150px] truncate text-[13px] font-semibold text-ink">{view === 'network' ? L('전국 네트워크', 'National network') : m.name}</span>
          <span className="num block max-w-[150px] truncate text-[11px] text-muted">{view === 'network' ? L(`${SITE_ORDER.length}개 거점 · 간선 운행 중`, `${SITE_ORDER.length} sites · Linehaul running`) : siteSummary(site)}</span>
        </span>
        <ChevronDown size={15} className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="panel rise absolute right-0 top-12 z-50 w-[320px] p-1.5">
          <button type="button" onClick={() => { setOpen(false); useStore.getState().showNetwork() }} className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left ${view === 'network' ? 'bg-brand-soft' : 'hover:bg-line-2'}`}>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink text-white"><Layers size={15} /></span>
            <span className="leading-tight">
              <span className="block text-[13px] font-semibold">{L('전국 네트워크', 'National network')}</span>
              <span className="block text-[11px] text-muted">{L(`${SITE_ORDER.length}개 거점과 간선 흐름 한눈에 보기`, `All ${SITE_ORDER.length} sites and linehaul flows at a glance`)}</span>
            </span>
          </button>
          {SITE_ORDER.map((id) => {
            const s = SITE_META[id]
            const active = view === 'site' && id === site
            return (
              <button
                key={id}
                type="button"
                onClick={() => { setOpen(false); useStore.getState().setSite(id) }}
                className={`mt-0.5 flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left ${active ? 'bg-brand-soft' : 'hover:bg-line-2'}`}
              >
                <span className="grid h-8 w-12 shrink-0 place-items-center rounded-lg bg-brand text-[11px] font-bold text-white">{s.code}</span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="flex items-center justify-between text-[12px] font-semibold">
                    {s.name}
                    <span className="text-[10.5px] font-medium text-muted">{s.type}</span>
                  </span>
                  <span className="num mt-0.5 block truncate text-[11px] text-muted">{siteSummary(id)}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SpeedControl() {
  const speed = useStore((s) => s.speed)
  const timeline = useStore((s) => s.timeline)
  return (
    <div className="flex h-8 items-center rounded-full bg-line-2 p-0.5" role="group" aria-label={L('시뮬레이션 속도', 'Simulation speed')}>
      <button
        type="button"
        onClick={() => {
          if (timeline) exitReplay()
          useStore.getState().setTimeline(!timeline)
        }}
        aria-pressed={timeline}
        title={L('재생 막대(지난 60분 되감기)', 'Replay bar (rewind the last 60 min)')}
        aria-label={L('재생 막대', 'Replay bar')}
        className={`flex h-7 items-center rounded-full px-2 ${timeline ? 'bg-white text-brand shadow-sm' : 'text-muted hover:text-ink'}`}
      >
        <History size={13} />
      </button>
      {[1, 2, 4, 8].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => useStore.getState().setSpeed(n)}
          aria-pressed={speed === n}
          className={`num h-7 rounded-full px-2 text-[11.5px] font-semibold ${speed === n ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
        >
          ×{n}
        </button>
      ))}
    </div>
  )
}

const CAT: Record<string, [string, Tone]> = {
  equipment: [L('설비', 'Equipment'), 'blue'], safety: [L('안전', 'Safety'), 'red'], cargo: [L('화물', 'Cargo'), 'amber'], delay: [L('지연', 'Delay'), 'amber'], customer: [L('고객', 'Customer'), 'blue'], other: [L('기타', 'Other'), 'gray'],
}
const SEV = LL(['정보', '근무 중 처리', '긴급', '최우선'], ['Info', 'This shift', 'Urgent', 'Top priority'])

function ReportRow({ r }: { r: FieldReport }) {
  const t = r.triage
  const crit = isCritical(t)
  const [label, tone]: [string, Tone] = t ? CAT[t.category] ?? [L('기타', 'Other'), 'gray'] : [r.status === 'error' ? L('미분류', 'Unclassified') : L('분류 중', 'Classifying'), 'gray']
  const sev = t ? Math.round(t.severity) : 0
  return (
    <div className={`rounded-lg px-2 py-2 ${crit ? 'bg-bad-soft' : 'hover:bg-line-2'}`}>
      <div className="flex items-center gap-1.5 text-[11px]">
        {r.status === 'pending' ? <Loader2 size={11} className="animate-spin text-muted" /> : <Chip tone={tone}>{label}</Chip>}
        {t && <span className={`font-semibold ${sev >= 2 ? 'text-bad' : sev === 1 ? 'text-warn' : 'text-muted'}`}>{SEV[Math.min(3, Math.max(0, sev))]}</span>}
        {t && t.stopWork > 0.6 && <Chip tone="red">{L('작업 중지', 'Stop work')}</Chip>}
        <span className="ml-auto text-faint">{SITE_META[r.site]?.code} · {hhmm(r.time)}</span>
      </div>
      <div className="mt-1 text-[12px] leading-snug text-ink">{r.text}</div>
      <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-faint">
        <span>{r.source}</span>
        {t && <span className="num">{L(`AI 심각도 ${t.severity.toFixed(2)} · 분류 신뢰도 ${t.categoryConfidence.toFixed(2)}`, `AI severity ${t.severity.toFixed(2)} · Category conf. ${t.categoryConfidence.toFixed(2)}`)}</span>}
        {r.status === 'error' && <span className={ai.on ? 'text-warn' : ''}>{ai.on ? L('분류 실패 · 수동 확인', 'Triage failed · Check manually') : L('AI 꺼짐 · 관제사가 직접 확인', 'AI off · Controller checks manually')}</span>}
      </div>
    </div>
  )
}

const IMPACT = LL(['영향 없음', '경미한 지연', '심한 지연', '전면 통제'], ['No impact', 'Minor delay', 'Major delay', 'Full closure'])
const STATE: Record<Incident['state'], [string, Tone]> = {
  reading: [L('판독 중', 'Reading'), 'gray'], active: [L('적용 중', 'Applied'), 'red'], confirm: [L('확인 필요', 'Needs review'), 'amber'], info: [L('정보', 'Info'), 'blue'], ignored: [L('조치 없음', 'No action'), 'gray'], cleared: [L('해제', 'Cleared'), 'green'],
}

function IncidentRow({ i }: { i: Incident }) {
  const a = i.ai
  const [label, tone] = STATE[i.state]
  const lvl = a ? Math.round(a.impact) : 0
  return (
    <div className={`rounded-lg px-2 py-2 ${i.state === 'active' ? 'bg-bad-soft' : i.state === 'confirm' ? 'bg-warn-soft' : 'hover:bg-line-2'}`}>
      <div className="flex items-center gap-1.5 text-[11px]">
        {i.status === 'pending' ? <Loader2 size={11} className="animate-spin text-muted" /> : <Chip tone={tone}>{label}</Chip>}
        {a && <span className="font-semibold text-ink-2">{LINK_LABEL[a.link as keyof typeof LINK_LABEL] ?? a.link}</span>}
        {a && a.link !== 'none' && <span className={`font-semibold ${lvl >= 2 ? 'text-bad' : lvl === 1 ? 'text-warn' : 'text-muted'}`}>{IMPACT[Math.min(3, Math.max(0, lvl))]}</span>}
        <span className="ml-auto text-faint">{hhmm(i.time)}</span>
      </div>
      <div className="mt-1 text-[12px] leading-snug text-ink">{i.text}</div>
      <div className="mt-0.5 text-[11px] font-medium text-ink-2">→ {i.decision}</div>
      <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-faint">
        <span>{i.source}</span>
        {a && <span className="num">{L(`구간 신뢰도 ${a.linkConfidence.toFixed(2)} · 영향 ${a.impact.toFixed(2)}`, `Segment conf. ${a.linkConfidence.toFixed(2)} · Impact ${a.impact.toFixed(2)}`)}</span>}
      </div>
      {i.state === 'confirm' && (
        <div className="mt-1.5 flex gap-1.5">
          <button type="button" onClick={() => proposeIncident(i)} className="h-7 rounded-md bg-bad px-2.5 text-[11.5px] font-semibold text-white">{L('제한 적용', 'Apply limit')}</button>
          <button type="button" onClick={() => { sim.confirmIncident(i.id, false); sim.approvals.log(CONTROLLER, L('무시', 'Ignored'), L(`돌발 상황 #${i.id} ${i.text.slice(0, 24)}`, `Incident #${i.id} ${i.text.slice(0, 24)}`)) }} className="h-7 rounded-md border border-line px-2.5 text-[11.5px] font-semibold text-ink-2">{L('무시', 'Ignore')}</button>
        </div>
      )}
    </div>
  )
}

function Notifications() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'reports' | 'incidents'>('reports')
  const [text, setText] = useState('')
  const site = useStore((s) => s.site)
  useStore((s) => s.tick)
  const list = [...sim.reports].sort((a, b) => reportPriority(b) - reportPriority(a))
  const urgent = sim.reports.filter((r) => r.triage && (r.triage.severity >= 2 || r.triage.stopWork > 0.6)).length
  const live = sim.incidents.filter((i) => i.state === 'active' || i.state === 'confirm').length
  const incidents = [...sim.incidents].sort((a, b) => Number(b.state === 'active' || b.state === 'confirm') - Number(a.state === 'active' || a.state === 'confirm') || b.time - a.time)
  const submit = () => {
    const t = text.trim()
    if (!t) return
    if (tab === 'reports') sim.addReport(site, L('관제사 입력', 'Controller input'), t)
    else sim.addIncident(t, L('관제사 입력', 'Controller input'))
    setText('')
  }
  const tabCls = (on: boolean) => `h-7 rounded-md px-2.5 text-[12px] font-semibold ${on ? 'bg-white text-ink shadow-sm' : 'text-muted'}`
  return (
    <div className="relative">
      <button type="button" aria-label={L('현장 보고·돌발 상황', 'Field reports & incidents')} onClick={() => setOpen((o) => !o)} className="relative grid h-9 w-9 place-items-center rounded-xl text-ink-2 hover:bg-line-2">
        <Bell size={18} />
        {urgent + live > 0 && <span className="num absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] font-bold text-white ring-2 ring-white">{urgent + live}</span>}
      </button>
      {open && (
        <div className="panel rise absolute right-0 top-11 z-50 w-[370px] p-1.5">
          <div className="flex items-center justify-between px-1.5 py-1">
            <div className="flex gap-0.5 rounded-lg bg-line-2 p-0.5">
              <button type="button" className={tabCls(tab === 'reports')} onClick={() => setTab('reports')}>{L('현장 보고', 'Field reports')}{urgent ? ` ${urgent}` : ''}</button>
              <button type="button" className={tabCls(tab === 'incidents')} onClick={() => setTab('incidents')}>{L('돌발 상황', 'Incidents')}{live ? ` ${live}` : ''}</button>
            </div>
            <span className="flex items-center gap-1 text-[11px] text-muted"><Sparkles size={11} />{tab === 'reports' ? L('AI 자동 분류', 'AI auto-triage') : L('AI 구간·영향 판독', 'AI reads segment & impact')}</span>
          </div>
          <form className="flex gap-1.5 px-1.5 pb-1.5" onSubmit={(e) => { e.preventDefault(); submit() }}>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={tab === 'reports' ? L(`${SITE_META[site].code} 현장 보고 입력 (예: 3번 도크 바닥 미끄러움)`, `${SITE_META[site].code} field report (e.g. Dock 3 floor is slippery)`) : L('교통·기상 정보 입력 (예: 이천IC 사고로 2개 차로 통제)', 'Traffic or weather info (e.g. Crash at Icheon IC, 2 lanes closed)')}
              aria-label={tab === 'reports' ? L('현장 보고 입력', 'Enter field report') : L('돌발 상황 입력', 'Enter incident')}
              className="h-8 min-w-0 flex-1 rounded-lg border border-line px-2 text-[12px] outline-none focus:border-brand"
            />
            <button type="submit" className="h-8 rounded-lg bg-brand px-2.5 text-[12px] font-semibold text-white">{tab === 'reports' ? L('보고', 'Report') : L('전달', 'Send')}</button>
          </form>
          <div className="scroll-thin max-h-[420px] space-y-0.5 overflow-y-auto">
            {tab === 'reports' && list.slice(0, 14).map((r) => <ReportRow key={r.id} r={r} />)}
            {tab === 'reports' && !list.length && <div className="px-2 py-6 text-center text-[12px] text-muted">{L('아직 보고가 없습니다', 'No reports yet')}</div>}
            {tab === 'incidents' && incidents.slice(0, 12).map((i) => <IncidentRow key={i.id} i={i} />)}
            {tab === 'incidents' && !incidents.length && <div className="px-2 py-6 text-center text-[12px] text-muted">{L('들어온 교통·기상 정보가 없습니다', 'No traffic or weather info yet')}</div>}
          </div>
        </div>
      )}
    </div>
  )
}

/** 소리 켜기·끄기(기본 켜짐, 브라우저 정책상 첫 클릭·키 입력 때 들리기 시작). 철송·트럭·허브 소리와 안내 음성이 화면 언어로 나온다 */
function SoundToggle() {
  const state = useStore((s) => s.sound)
  const on = state !== 'off'
  const [busy, setBusy] = useState(false)
  const click = () => {
    if (busy) return
    // 첫 클릭을 기다리던 중이면 이 클릭이 켠다(끄지 않는다)
    if (state === 'on') {
      void sound.disable()
      return
    }
    setBusy(true)
    sound.enable().catch(() => {}).finally(() => setBusy(false))
  }
  return (
    <button
      type="button"
      onClick={click}
      aria-label={on ? L('소리 끄기', 'Turn sound off') : L('소리 켜기', 'Turn sound on')}
      aria-pressed={on}
      title={state === 'on' ? L('소리 켜짐 · 누르면 끕니다', 'Sound on · click to mute') : state === 'armed' ? L('소리 켜짐 · 화면을 한 번 누르면 들리기 시작합니다', 'Sound on · starts after your first click') : L('소리 꺼짐 · 누르면 현장 소리와 안내 음성이 나옵니다', 'Sound off · click for site sounds and voice alerts')}
      className={`grid h-8 w-8 place-items-center rounded-full ${on ? 'bg-brand-soft text-brand' : 'bg-line-2 text-muted hover:text-ink'}`}
    >
      {busy ? <Loader2 size={15} className="animate-spin" /> : on ? <Volume2 size={15} /> : <VolumeX size={15} />}
    </button>
  )
}

export function TopBar() {
  useStore((s) => s.tick)
  return (
    <header className="pointer-events-auto absolute inset-x-0 top-0 z-30 flex h-14 items-center gap-4 border-b border-line bg-white/95 px-4 backdrop-blur">
      <div className="flex items-center gap-2">
        <LogoMark size={26} />
        <span className="text-[17px] font-extrabold tracking-[-0.02em]">HubTrace</span>
        <span className="hidden whitespace-nowrap rounded-md bg-line-2 px-1.5 py-0.5 text-[11px] font-semibold text-muted 2xl:inline">{L('다온로지스 관제', 'Daon Logistics Control')}</span>
      </div>
      <div className="ml-6">
        <SearchBox />
      </div>
      <div className="ml-auto flex items-center gap-2.5">
        <CenterButton />
        <PendingPill />
        <SiteSwitcher />
        <SpeedControl />
        <AiSwitch />
        <SoundToggle />
        <EnvControl />
        <LangSwitch />
        <Notifications />
        <div className="flex items-center gap-2 border-l border-line pl-3">
          <Avatar size={32} />
          <span className="hidden leading-tight 2xl:block">
            <span className="block whitespace-nowrap text-[13px] font-semibold">{MANAGER.name}</span>
            <span className="block whitespace-nowrap text-[11px] text-muted">{MANAGER.role}</span>
          </span>
          <ChevronDown size={15} className="text-muted" />
        </div>
      </div>
    </header>
  )
}

/** 확인이 필요한 돌발 상황의 속도 제한을 승인 창으로 */
function proposeIncident(i: Inc) {
  const link = (i.ai?.link && i.ai.link !== 'none' ? i.ai.link : i.truth && i.truth.link !== 'none' ? i.truth.link : null) as LinkId | null
  const existing = sim.approvals.list.find((p) => p.kind === 'incident' && p.target === String(i.id) && p.state === 'pending')
  if (existing) return openApproval(existing.id)
  const impact = Math.max(1, i.ai?.impact ?? 2)
  const p = sim.approvals.propose({
    kind: 'incident', target: String(i.id), impact: 'high',
    title: L(`${link ? LINKS[link] : '구간 미확정'} 속도 제한`, `${link ? LINKS[link] : 'Unconfirmed segment'} speed limit`),
    why: L(`"${i.text}" — 판독 신뢰도가 낮아 관제사 확인이 필요합니다.`, `"${i.text}" — Reading confidence is low, so a controller needs to confirm.`),
    cur: { title: L('제한 없음', 'No limit'), lines: [L('운행 중인 차는 평소 속도로 달립니다', 'Vehicles on the road run at normal speed')] },
    next: { title: L(`속도 ${Math.round(impactFactor(impact) * 100)}%로 제한`, `Limit speed to ${Math.round(impactFactor(impact) * 100)}%`), lines: [L(`${link ? LINKS[link] : '해당 구간'}을 지나는 차의 도착 예정을 다시 계산`, `Recalculate ETAs for vehicles passing ${link ? LINKS[link] : 'the segment'}`), L('지도에 경고 표지 · 간선 흐름 빨강', 'Warning sign on the map · Linehaul flow in red')] },
    effect: [L('도착 약속 위험이 화면에 바로 반영', 'Arrival promise risk shows on screen right away'), L('제한은 정해진 시간 뒤 자동 해제', 'Limit lifts automatically after a set time')],
    apply: () => {
      sim.confirmIncident(i.id, true)
      return i.decision
    },
    valid: () => i.state === 'confirm',
  })
  openApproval(p.id)
}
