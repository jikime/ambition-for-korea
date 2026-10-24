// hubtrace 물류관리원 에이전트 도구 실행기(브라우저). 이 앱의 업무 데이터는 브라우저 시뮬레이션에 있어 여기서 실행한다.
//  - 서버 정책(허용 도구 · 역할 · 승인 필요, server/agent/run.ts)을 통과한 tool_call만 받는다
//  - 쓰기는 승인 카드에서 사용자가 승인한 같은 call_id · 같은 인자로만, 실행 직전 대상 버전을 다시 확인한다(바뀌었으면 실행하지 않음)
//  - 멱등성: call_id마다 결과를 기억해 중복 클릭 · 재전송에도 한 번만 실행한다
//  - 단일 조직 데모(테넌트 hubtrace-demo): 운영 백엔드가 생기면 이 실행기를 서버로 옮기고 인증 · 테넌트 검사를 서버에서 한다
import { create } from 'zustand'
import { sim, type Vehicle } from '../../sim/sim'
import { ITEMS, type ItemKey } from '../../sim/data'
import { SITE_META, type SiteId } from '../../sim/world'
import { moveEffect } from '../../sim/approvals'
import { STORY_STEPS, forkliftStatus, hhmm, palletStatus, storyAddress, vehicleEta, vehicleKindLabel, vehicleStatus, carrierName, cargoLabel } from '../../ui/format'
import type { ToolCall, ToolResult, ToolName } from '../../../server/agent/contract'
import { L } from '../../i18n'

// ───────────────────────── 작업 지시 게시판(create_work_task)

export interface WorkTask {
  id: string
  site: SiteId
  title: string
  detail: string
  priority: 'normal' | 'high'
  created: number
  /** 이 작업을 만든 요청(멱등성 키) */
  callId: string
  status: 'open'
}

export const useTasks = create<{ tasks: WorkTask[] }>(() => ({ tasks: [] }))

// ───────────────────────── 실행

const results = new Map<string, ToolResult>()
const norm = (s: string) => s.replace(/[#\s]/g, '').toUpperCase()
const now = () => hhmm(sim.clock)
const siteName = (id: string) => (SITE_META[id as SiteId]?.name ?? id)

/** 사용자가 승인 카드에서 승인한 내용(call_id · 인자 · 만료) */
export interface Approval {
  callId: string
  argsKey: string
  expires: number
}
export const argsKey = (call: Pick<ToolCall, 'tool' | 'args'>) => `${call.tool}:${JSON.stringify(Object.entries(call.args).sort())}`

function vehicleView(v: Vehicle) {
  const eta = vehicleEta(v)
  return {
    kind: 'vehicle', id: v.id, type: vehicleKindLabel(v), carrier: carrierName(v), plate: v.plate,
    status: vehicleStatus(v).label, site: siteName(v.site), destination: v.dest && v.dest !== 'OFF' ? siteName(v.dest) : null,
    eta: eta ? `${hhmm(eta.clock)} (${Math.round(eta.min)}${L('분 후', ' min')})` : null,
    load: cargoLabel(v), waybill: v.shipment.no || null, customer: v.shipment.customer || null,
    ...(v.kind === 'van' && v.home === 'IN' ? { delivered_stops: v.delivered, remaining_stops: Math.max(0, v.stops.length - v.stopIdx) } : {}),
  }
}

function shipment(identifier: string) {
  const id = norm(identifier)
  if (!id) return { found: false, identifier }
  const st = sim.story
  if (st.no && norm(st.no) === id) {
    const stage = Math.max(0, Math.min(7, st.stage))
    return {
      found: true, kind: 'parcel', number: st.no, item: ITEMS[st.item]?.name, to: storyAddress(),
      step: `${stage + 1}/8`, status: STORY_STEPS[stage]?.label, where: STORY_STEPS[stage]?.sub,
      delivered: st.stage >= 7,
      vehicle: st.van ?? st.vehicle ?? null,
    }
  }
  const v = sim.vehicles.find((x) => norm(x.id) === id || norm(x.plate) === id || (x.shipment.no && norm(x.shipment.no) === id))
  if (v) return { found: true, ...vehicleView(v) }
  const p = [...sim.pallets.values()].find((x) => norm(x.id) === id)
  if (p) {
    const ps = palletStatus(p)
    return { found: true, kind: 'pallet', id: p.id, item: ITEMS[p.item]?.name, qty: p.qty, unit: L('개', 'pcs'), lot: p.lot, status: ps.label, where: ps.where, site: siteName(p.site) }
  }
  return { found: false, identifier }
}

function inventory(item?: string, site?: string) {
  const rows = new Map<string, { item: string; site: string; pallets: number; pieces: number; stored: number; staged: number; moving: number }>()
  for (const p of sim.pallets.values()) {
    if (item && p.item !== item) continue
    if (site && p.site !== site) continue
    const key = `${p.item}:${p.site}`
    const r = rows.get(key) ?? { item: ITEMS[p.item as ItemKey]?.name ?? p.item, site: siteName(p.site), pallets: 0, pieces: 0, stored: 0, staged: 0, moving: 0 }
    r.pallets++
    r.pieces += p.qty
    if (p.state === 'stored') r.stored++
    else if (p.state === 'staged') r.staged++
    else r.moving++
    rows.set(key, r)
  }
  return {
    basis: L('파렛트 단위 재고(시뮬레이션), 수량은 낱개', 'Pallet inventory (simulation); pieces are single units'),
    filter: { item: item ? ITEMS[item as ItemKey]?.name ?? item : null, site: site ? siteName(site) : null },
    rows: [...rows.values()].sort((a, b) => b.pieces - a.pieces).slice(0, 20),
    total_pallets: [...rows.values()].reduce((s, r) => s + r.pallets, 0),
  }
}

function operations(site: string) {
  const vs = sim.vehicles.filter((v) => v.visible && v.site === site)
  const byStatus: Record<string, number> = {}
  for (const v of vs) {
    const s = vehicleStatus(v).label
    byStatus[s] = (byStatus[s] ?? 0) + 1
  }
  const fl = sim.forklifts.filter((f) => f.site === site)
  const docks = site === 'GJ' ? { outbound: { busy: sim.docks.filter((d) => d.vehicle).length, total: sim.docks.length }, unloading: { busy: sim.bays.filter((d) => d.vehicle).length, total: sim.bays.length } }
    : site === 'IC' ? { loading: { busy: sim.icBays.filter((d) => d.vehicle).length, total: sim.icBays.length }, reefer: { busy: sim.icReefers.filter((d) => d.vehicle).length, total: sim.icReefers.length } }
      : site === 'IN' ? { linehaul: { busy: sim.inDocks.filter((d) => d.vehicle).length, total: sim.inDocks.length } }
        : null
  return {
    site: siteName(site),
    vehicles_on_site: vs.length,
    vehicles_by_status: byStatus,
    // 차량 목록(앞 12대): 배차 변경처럼 특정 차를 골라야 할 때 쓴다. 배송차는 남은 정차지 수도
    vehicles: vs.slice(0, 12).map((v) => ({ id: v.id, status: vehicleStatus(v).label, ...(v.kind === 'van' ? { stops_left: Math.max(0, v.stops.length - v.stopIdx) } : {}) })),
    docks,
    forklifts: fl.length ? { total: fl.length, low_battery: fl.filter((f) => f.battery < 25).length, list: fl.map((f) => ({ id: f.id, status: forkliftStatus(f).label, battery: Math.round(f.battery) })) } : null,
    sorter: site === 'GJ' ? { rate_per_hour: Math.round(sim.hub.rate), reject_queue: sim.hub.deskQ.length + (sim.hub.desk.cur ? 1 : 0) } : null,
    active_incidents: sim.incidents.filter((i) => i.state === 'active' || i.state === 'confirm').slice(0, 5).map((i) => i.text.slice(0, 80)),
    pending_approvals: sim.approvals.pending.length,
    open_tasks: useTasks.getState().tasks.filter((t) => t.site === site).map((t) => `${t.id} ${t.title}`),
  }
}

function prepareDispatch(vehicleId: string) {
  const v = sim.vehicle(vehicleId.trim().toUpperCase())
  if (!v) return { possible: false, reason: L('그런 차량이 없습니다', 'No such vehicle') }
  const plan = sim.approvals.planMove(v)
  if (!plan) return { possible: false, vehicle_id: v.id, status: vehicleStatus(v).label, reason: L('다온마을에서 배송 중이고 남은 정차지가 2곳 이상인 배송차만 이관할 수 있습니다(이미 이관했거나 받을 차가 없으면 불가)', 'Only a delivery van out in Daon Village with 2+ stops left can hand over stops (not if already moved or no receiving van)') }
  return {
    possible: true, vehicle_id: v.id, plan_version: plan.version,
    from: v.id, to: plan.to.id,
    stops_moved: plan.moved.map((s) => s.label),
    before: { [v.id]: plan.rest.map((s) => s.label) },
    after: { [v.id]: plan.rest.slice(0, plan.rest.length - plan.moved.length).map((s) => s.label), [plan.to.id]: plan.moved.map((s) => `+ ${s.label}`) },
    effect: moveEffect(plan),
  }
}

function commitDispatch(vehicleId: string, version: string) {
  const v = sim.vehicle(vehicleId.trim().toUpperCase())
  const plan = v ? sim.approvals.planMove(v) : null
  // 승인 뒤 대상 상태(남은 정차지 · 받는 차)가 바뀌었으면 이전 승인으로 실행하지 않는다
  if (!v || !plan || plan.version !== version) {
    return { ok: false, error: L('승인한 뒤 배송차 상태가 바뀌어 실행하지 않았습니다. 이관 계획을 다시 확인해야 합니다', 'The van changed after approval, so nothing was applied. The plan must be prepared again') }
  }
  const prop = sim.approvals.proposePlan(plan, L('물류관리원 AI 요청(사용자 승인)', 'hubtrace assistant request (user approved)'))
  const done = sim.approvals.approve(prop.id, L('사용자(물류관리원 AI 승인 카드)', 'User (hubtrace assistant approval card)'))
  if (!done || done.state !== 'approved') return { ok: false, error: L('대상이 이미 지나가 제안이 만료됐습니다', 'The target already passed; the proposal expired') }
  return { ok: true, proposal_id: done.id, outcome: done.outcome, from: v.id, to: plan.to.id, moved: plan.moved.map((s) => s.label) }
}

/** 도구 실행. 쓰기 도구는 approval이 이 call과 맞아야 한다 */
export function runTool(call: ToolCall, approval?: Approval): ToolResult {
  const hit = results.get(call.call_id)
  if (hit) return hit
  const base = { call_id: call.call_id, tool: call.tool as ToolName, args: call.args, read_at: now() }
  const fail = (error: string, status: ToolResult['status'] = 'failed'): ToolResult => ({ ...base, status, data: null, error })
  if (call.kind === 'write') {
    if (!approval || approval.callId !== call.call_id || approval.argsKey !== argsKey(call)) return fail(L('승인 없이 실행할 수 없습니다', 'Cannot run without approval'))
    if (Date.now() > approval.expires) return fail(L('승인이 만료됐습니다', 'The approval expired'))
  }
  let out: ToolResult
  try {
    const a = call.args
    switch (call.tool) {
      case 'get_shipment_status': out = { ...base, status: 'completed', data: shipment(a.identifier ?? '') }; break
      case 'get_inventory': out = { ...base, status: 'completed', data: inventory(a.item, a.site) }; break
      case 'list_warehouse_operations': out = { ...base, status: 'completed', data: operations(a.site ?? 'GJ') }; break
      case 'prepare_dispatch_change': out = { ...base, status: 'completed', data: prepareDispatch(a.vehicle_id ?? '') }; break
      case 'create_work_task': {
        const t: WorkTask = {
          id: `T-${String(useTasks.getState().tasks.length + 101)}`, site: (a.site as SiteId) ?? 'GJ', title: (a.title ?? '').slice(0, 80),
          detail: (a.detail ?? '').slice(0, 300), priority: a.priority === 'high' ? 'high' : 'normal', created: sim.clock, callId: call.call_id, status: 'open',
        }
        useTasks.setState((s) => ({ tasks: [t, ...s.tasks].slice(0, 30) }))
        sim.approvals.log(L('사용자(물류관리원 AI)', 'User (hubtrace assistant)'), L('작업 지시', 'Work task'), `${t.id} · ${siteName(t.site)} · ${t.title}`)
        out = { ...base, status: 'completed', data: { ok: true, task_id: t.id, site: siteName(t.site), title: t.title, priority: t.priority, created_at: now() } }
        break
      }
      case 'commit_dispatch_change': {
        const r = commitDispatch(a.vehicle_id ?? '', a.plan_version ?? '')
        out = r.ok ? { ...base, status: 'completed', data: r } : { ...base, status: 'failed', data: r, error: r.error }
        break
      }
      default: out = fail('unknown tool')
    }
  } catch (e) {
    // 실행 중 오류는 결과를 단정할 수 없다(unknown): 완료했다고 말하지 않는다
    out = fail(e instanceof Error ? e.message : String(e), 'unknown')
  }
  results.set(call.call_id, out)
  return out
}

/** 서버로 보낼 업무 문맥(지금 화면 · 선택 · 시각). id는 근거 참조에 쓴다 */
export function agentContext(selected: { kind: string; id: string } | null, site: SiteId) {
  const items = [
    { id: 'ctx-now', kind: 'clock', text: L(`시뮬레이션 시각 ${now()}`, `Simulation time ${now()}`) },
    { id: 'ctx-view', kind: 'view', text: L(`지금 보는 거점: ${siteName(site)} (${site})`, `Current site in view: ${siteName(site)} (${site})`) },
    { id: 'ctx-story', kind: 'parcel', text: L(`따라가는 택배: ${sim.story.no || '없음'} · ${STORY_STEPS[Math.max(0, sim.story.stage)]?.label ?? ''}`, `Tracked parcel: ${sim.story.no || 'none'} · ${STORY_STEPS[Math.max(0, sim.story.stage)]?.label ?? ''}`) },
  ]
  if (selected) items.push({ id: 'ctx-selected', kind: 'selection', text: L(`선택한 개체: ${selected.kind} ${selected.id}`, `Selected: ${selected.kind} ${selected.id}`) })
  const tasks = useTasks.getState().tasks.slice(0, 5)
  if (tasks.length) items.push({ id: 'ctx-tasks', kind: 'tasks', text: tasks.map((t) => `${t.id} ${siteName(t.site)} ${t.title} (${t.priority})`).join(' / ') })
  return items
}
