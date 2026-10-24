import { AMR_STATE, idleTask, personInfo, siteAt } from './people'
import { sim, SPEEDUP, type Forklift, type Pallet, type Vehicle } from '../sim/sim'
import type { Aircraft } from '../sim/airport'
import { BARGE_STATE } from '../sim/barge'
import { CARRIERS, ITEMS } from '../sim/data'
import { SITE_META, type SiteId } from '../sim/world'
import { STOPS } from '../sim/sites'
import type { Selection } from '../store'
import { isEn, L, plural } from '../i18n'

export type Tone = 'green' | 'blue' | 'amber' | 'gray' | 'red'

export const pad2 = (n: number) => String(Math.floor(n)).padStart(2, '0')
export function hhmm(sec: number) {
  const s = ((sec % 86400) + 86400) % 86400
  return `${pad2(s / 3600)}:${pad2((s % 3600) / 60)}`
}
export const num = (n: number) => Math.round(n).toLocaleString('ko-KR')

const BASE: Partial<Record<Vehicle['phase'], [string, Tone]>> = {
  offsite: [L('지도 밖 운행', 'Off map'), 'gray'], highway: [L('간선 주행', 'On highway'), 'blue'], enroute: [L('진입 중', 'Entering'), 'blue'], gate: [L('게이트 통과', 'Passing gate'), 'amber'],
  inbound: [L('구내 이동', 'Moving on site'), 'blue'], docking: [L('도킹 중', 'Docking'), 'blue'], waiting: [L('도크 대기', 'Dock wait'), 'amber'], departing: [L('출차', 'Exit'), 'gray'],
  closing: [L('작업 완료', 'Work done'), 'green'], returning: [L('복귀 중', 'Returning'), 'blue'], delivering: [L('배송 중', 'Delivering'), 'blue'], craning: [L('ARMG 반출입', 'ARMG handling'), 'amber'],
  inspecting: [L('세관 X-ray 검사', 'Customs X-ray'), 'red'], yard: [L('야드 대기', 'Yard wait'), 'amber'], restArea: [L('휴게소 진입', 'Entering rest area'), 'blue'], resting: [L('휴게 중', 'Resting'), 'green'], swap: [L('기사 교대', 'Driver swap'), 'blue'],
}

const KIND: Record<Vehicle['kind'], Partial<Record<Vehicle['phase'], [string, Tone]>>> = {
  wing: { unloading: [L('하차 중', 'Unloading'), 'green'], loading: [L('상차 중', 'Loading'), 'green'], inbound: [L('하차장 이동', 'To unloading bay'), 'blue'] },
  box: { unloading: [L('하차 중', 'Unloading'), 'green'], loading: [L('상차 중', 'Loading'), 'green'], inbound: [L('도크 이동', 'To dock'), 'blue'] },
  van: { loading: [L('상차 중', 'Loading'), 'green'], inbound: [L('분류장 이동', 'To sort area'), 'blue'], departing: [L('배송 출발', 'Out for delivery'), 'blue'], offsite: [L('시내 배송 중', 'City delivery'), 'gray'] },
  reefer: { loading: [L('냉동 상차', 'Reefer loading'), 'green'], offsite: [L('새벽배송 운행', 'Dawn delivery run'), 'gray'] },
  trailer: { unloading: [L('컨테이너 하역', 'Container unloading'), 'green'], inbound: [L('구내 이동', 'Moving on site'), 'blue'] },
}

export function vehicleStatus(v: Vehicle): { label: string; tone: Tone } {
  if (v.kind === 'van' && v.phase === 'delivering' && v.walk.on) return { label: DROP_LABEL[v.walk.mode] ?? L('문 앞 배송', 'Doorstep delivery'), tone: 'green' }
  const [label, tone] = KIND[v.kind][v.phase] ?? BASE[v.phase] ?? [L('대기', 'Waiting'), 'gray']
  return { label, tone }
}

export const DROP_LABEL: Record<string, string> = {
  door: L('문 앞 배송', 'Doorstep delivery'), guard: L('경비실 맡김', 'Security office'), locker: L('무인택배함', 'Parcel locker'), handover: L('직접 전달', 'Hand-over'), reschedule: L('재배송 예약', 'Redelivery booked'), confirm: L('확인 통화', 'Confirm call'), moved: L('다음 차로 이관', 'Moved to next van'),
}
export const DROP_SHORT: Record<string, string> = {
  door: L('문 앞', 'Doorstep'), guard: L('경비실', 'Security office'), locker: L('무인택배함', 'Parcel locker'), handover: L('직접 전달', 'Hand-over'), reschedule: L('재배송', 'Redelivery'), unspecified: L('지정 없음 → 문 앞', 'None → Doorstep'), confirm: L('확인 필요', 'Needs check'),
}

export function vehicleKindLabel(v: Vehicle) {
  return {
    wing: L('5톤 윙바디 (간선)', '5-ton wing-body (linehaul)'), box: L('11톤 간선 탑차', '11-ton linehaul box truck'), van: L('1톤 배송 탑차', '1-ton delivery van'), reefer: L('5톤 냉동탑차', '5-ton reefer truck'), trailer: L('40ft 컨테이너 트레일러', '40ft container trailer'),
  }[v.kind]
}

export function carrierName(v: Vehicle) {
  if (v.kind === 'van') return L('다온택배', 'Daon Parcel')
  if (v.kind === 'reefer') return L('새벽팜 콜드체인', 'Dawn Farm Cold Chain')
  return CARRIERS[v.carrier].name
}

export function siteCode(id: SiteId | 'OFF' | null) {
  if (!id) return ''
  if (id === 'OFF') return L('지도 밖', 'Off map')
  return SITE_META[id].code
}

export function resLabel(v: Vehicle) {
  if (v.res < 0 && v.kind !== 'trailer') return '-'
  if (v.kind === 'trailer') return v.site === 'BS' ? L(`야드 블록 ${'ABCD'[v.crane]} 육측`, `Yard block ${'ABCD'[v.crane]} landside`) : L('CY 하역장', 'CY unloading area')
  if (v.kind === 'reefer') return sim.icReefers[v.res]?.id ?? '-'
  if (v.kind === 'van') return v.home === 'IN' ? sim.inSlots[v.res]?.id ?? '-' : sim.slots[v.res]?.id ?? '-'
  if (v.kind === 'wing') return v.site === 'IC' ? sim.icBays[v.res]?.id ?? '-' : sim.bays[v.res]?.id ?? '-'
  if (v.home === 'AP' && v.site === 'AP') return sim.apDocks[v.res]?.id ?? '-'
  if (v.home === 'DJ' && v.site === 'DJ') return sim.djDocks[v.res]?.id ?? '-'
  return v.site === 'IN' ? sim.inDocks[v.res]?.id ?? '-' : sim.docks[v.res]?.id ?? '-'
}

export function isMoving(v: Vehicle) {
  return ['enroute', 'gate', 'inbound', 'docking', 'highway', 'returning', 'departing', 'delivering'].includes(v.phase) && !v.walk.on
}

/** 다음 도착(또는 작업 완료) 예정 */
export function vehicleEta(v: Vehicle): { clock: number; min: number } | null {
  if (v.route && !v.route.done && isMoving(v)) {
    // 돌발 상황으로 느려진 구간이면 그만큼 늘려 잡는다
    const sec = (v.route.remainingTime() * SPEEDUP) / sim.legFactor(v, v.route.leg)
    return { clock: sim.clock + sec, min: Math.max(1, Math.round(sec / 60)) }
  }
  if (v.phase === 'unloading' || v.phase === 'loading') {
    const left = v.cargoTotal - v.cargoDone
    const per = v.kind === 'wing' ? 14 : v.kind === 'box' ? 1 / 18 : v.kind === 'reefer' ? 2.5 : 0.18
    const sec = left * per * SPEEDUP
    return { clock: sim.clock + sec, min: Math.max(1, Math.round(sec / 60)) }
  }
  return null
}

export function cargoLabel(v: Vehicle) {
  if (v.kind === 'wing') return L(`${v.cargoDone}/${v.cargoTotal} 파렛트 ${v.site === 'IC' ? '상차' : '하차'}`, `${v.cargoDone}/${v.cargoTotal} ${plural(v.cargoTotal, 'pallet')} ${v.site === 'IC' ? 'loaded' : 'unloaded'}`)
  if (v.kind === 'box') return L(`${num(v.cargoDone)}/${num(v.cargoTotal)} 박스 ${v.site === 'IN' ? '하차' : '상차'}`, `${num(v.cargoDone)}/${num(v.cargoTotal)} ${plural(v.cargoTotal, 'box', 'boxes')} ${v.site === 'IN' ? 'unloaded' : 'loaded'}`)
  if (v.kind === 'reefer') return L(`${Math.floor(v.cargoDone)}/${v.cargoTotal} 냉장 롤테이너`, `${Math.floor(v.cargoDone)}/${v.cargoTotal} chilled roll ${plural(v.cargoTotal, 'cage')}`)
  if (v.kind === 'trailer') return v.container ? L('40ft 1개 적재', '1 × 40ft loaded') : L('공차', 'Empty')
  if (v.home === 'IN' && v.site === 'TW') return L(`${v.delivered}/${v.stops.length}곳 배송`, `${v.delivered}/${v.stops.length} ${plural(v.stops.length, 'stop')} delivered`)
  return L(`${v.cargoDone}/${v.cargoTotal} 박스 상차`, `${v.cargoDone}/${v.cargoTotal} ${plural(v.cargoTotal, 'box', 'boxes')} loaded`)
}

/**
 * 11톤 탑차에 지금 실린 박스 수. cargoDone의 뜻이 구간마다 다르다:
 * 곤지암 상차 중·인천행 운행 = 실은 수, 인천 하차 중 = 내린 수(도착 때 0으로), 인천 → 곤지암 회송 = 빈 차.
 * 정문을 지날 때 거점이 바뀌어도 도크에 붙기 전까지는 cargoDone이 그대로라 거점만 보면 틀린다.
 */
export function boxesAboard(v: Vehicle) {
  if (v.kind !== 'box') return v.cargoDone
  if (/^(빈 차 회송|Empty)/i.test(v.shipment.customer) && v.phase !== 'loading') return 0
  if (v.site === 'IN' && (v.phase === 'unloading' || v.phase === 'closing')) return v.cargoTotal - v.cargoDone
  return v.cargoDone
}

/** 지금 실려 있는 짐 */
export function loadLabel(v: Vehicle) {
  if (v.kind === 'wing') {
    const left = v.cargo.filter(Boolean).length
    const kg = v.cargo.reduce((s, id) => s + (id ? sim.pallets.get(id)?.kg ?? 0 : 0), 0)
    return left ? L(`${left} 파렛트 · ${(kg / 1000).toFixed(1)} t`, `${left} ${plural(left, 'pallet')} · ${(kg / 1000).toFixed(1)} t`) : L('공 파렛트', 'Empty pallets')
  }
  if (v.kind === 'box') return L(`택배 ${num(boxesAboard(v))}박스`, `${num(boxesAboard(v))} ${plural(boxesAboard(v), 'parcel')}`)
  if (v.kind === 'reefer') return L(`냉장 롤테이너 ${Math.floor(v.cargoDone)}대`, `${Math.floor(v.cargoDone)} chilled roll ${plural(Math.floor(v.cargoDone), 'cage')}`)
  if (v.kind === 'trailer') return v.container ? L('40ft 수입 컨테이너', '40ft import container') : L('공차', 'Empty')
  return L(`택배 ${v.cargoDone}박스`, `${v.cargoDone} ${plural(v.cargoDone, 'parcel')}`)
}

const FLABEL: Record<Forklift['status'], [string, Tone]> = {
  idle: [L('대기', 'Idle'), 'gray'], toJob: [L('이동 중', 'Moving'), 'blue'], unloading: [L('하차 작업', 'Unloading'), 'green'], loading: [L('상차 작업', 'Loading'), 'green'], putaway: [L('입고 운반', 'Put-away'), 'green'],
  returning: [L('복귀 중', 'Returning'), 'blue'], toCharge: [L('충전 이동', 'To charger'), 'amber'], charging: [L('충전 중', 'Charging'), 'amber'], parking: [L('주차 이동', 'To parking'), 'gray'],
}
export function forkliftStatus(f: Forklift) {
  const [label, tone] = FLABEL[f.status]
  return { label, tone }
}
export function forkliftTask(f: Forklift) {
  if (f.status === 'charging') return L(`${sim.chargers[f.charger]?.id ?? ''} 충전기에서 충전 중`, `Charging at ${sim.chargers[f.charger]?.id ?? ''}`)
  if (f.status === 'toCharge') return L('충전 구역으로 이동', 'To charging area')
  if (f.status === 'returning') return f.site === 'IC' ? L('상차 완료 · 다음 파렛트', 'Loaded · next pallet') : L('입고 완료 · 다음 작업 대기', 'Stored · awaiting next job')
  if (f.job) {
    const v = sim.vehicle(f.job.vehicleId)
    const bay = v ? resLabel(v) : ''
    if (f.status === 'putaway') return `${f.carrying ?? ''} → ${sim.doors[v?.res ?? 0]?.id ?? L('입고문', 'Inbound door')}`
    if (f.site === 'IC') return `${f.carrying ?? L('파렛트', 'Pallet')} → ${f.job.vehicleId} · ${bay}`
    return L(`${f.job.vehicleId} 하차 · ${bay}`, `Unloading ${f.job.vehicleId} · ${bay}`)
  }
  return L('작업 대기', 'Awaiting job')
}

export function palletStatus(p: Pallet): { label: string; tone: Tone; where: string } {
  if (p.state === 'onTruck') return { label: L('차량 적재', 'On truck'), tone: 'blue', where: L(`${p.vehicleId} 적재함`, `${p.vehicleId} cargo bed`) }
  if (p.state === 'onFork') return { label: L('운반 중', 'Moving'), tone: 'green', where: L(`${p.forkliftId} 포크`, `${p.forkliftId} forks`) }
  if (p.state === 'stored') return { label: L('입고 완료', 'Stored'), tone: 'gray', where: L('본동 랙 보관', 'Main building rack') }
  if (p.state === 'line') return { label: p.wrapped ? L('출고 대기', 'Ready to ship') : L('랩핑 중', 'Wrapping'), tone: p.wrapped ? 'blue' : 'amber', where: L('이천 FC 출고 라인', 'Icheon FC outbound line') }
  return { label: p.pinned ? L('확인 필요', 'Needs check') : L('적치', 'Put-away'), tone: p.pinned ? 'amber' : 'gray', where: L('입고 적치장', 'Inbound staging area') }
}

export function siteOf(sel: Selection): SiteId | undefined {
  if (sel.kind === 'site') return sel.id as SiteId
  if (sel.kind === 'vehicle') {
    const v = sim.vehicle(sel.id)
    return v ? (v.dest && v.dest !== 'OFF' && v.phase === 'highway' ? v.dest : v.site) : undefined
  }
  if (sel.kind === 'forklift') return sim.forklift(sel.id)?.site
  if (sel.kind === 'pallet') return sim.pallets.get(sel.id)?.site
  if (sel.kind === 'charger') return sim.chargers.find((c) => c.id === sel.id)?.site
  if (sel.kind === 'crane') return 'BS'
  if (sel.kind === 'aircraft') return 'AP'
  if (sel.kind === 'barge') return 'DJ'
  if (sel.kind === 'sorter') return sel.id === 'S2' ? 'IN' : 'GJ'
  if (sel.kind === 'story') return sim.journeyPos(sel.id).site
  if (sel.kind === 'dock') return dockInfo(sel.id)?.site
  if (sel.kind === 'robot') return 'IC'
  if (sel.kind === 'equip') return 'DJ'
  if (sel.kind === 'mover') {
    const m = sim.life.movers.find((x) => x.id === sel.id)
    return m ? siteAt(m.x, m.z) ?? undefined : undefined
  }
  return undefined
}

export function entityLabel(sel: Selection): { title: string; status?: string; tone: Tone } {
  if (sel.kind === 'vehicle') {
    const v = sim.vehicle(sel.id)
    if (!v) return { title: sel.id, tone: 'gray' }
    const s = vehicleStatus(v)
    return { title: v.id, status: s.label, tone: s.tone }
  }
  if (sel.kind === 'forklift') {
    const f = sim.forklift(sel.id)
    if (!f) return { title: sel.id, tone: 'gray' }
    const s = forkliftStatus(f)
    return { title: f.id, status: s.label, tone: s.tone }
  }
  if (sel.kind === 'pallet') {
    const p = sim.pallets.get(sel.id)
    if (!p) return { title: sel.id, tone: 'gray' }
    return { title: p.id, status: ITEMS[p.item].name, tone: palletStatus(p).tone }
  }
  if (sel.kind === 'charger') {
    const c = sim.chargers.find((x) => x.id === sel.id)
    return { title: L(`충전기 ${sel.id}`, `Charger ${sel.id}`), status: c?.forklift ? L('사용 중', 'In use') : L('사용 가능', 'Available'), tone: c?.forklift ? 'amber' : 'green' }
  }
  if (sel.kind === 'dock') {
    const d = dockInfo(sel.id)
    return { title: sel.id, status: d?.status, tone: d?.tone ?? 'gray' }
  }
  if (sel.kind === 'crane') return { title: equipName(sel.id), status: craneState(sel.id), tone: 'blue' }
  if (sel.kind === 'sorter') return { title: sel.id === 'S2' ? L('인천 휠소터 S2', 'Incheon wheel sorter S2') : sel.id === 'X1' ? L('크로스벨트 소터 X1', 'Cross-belt sorter X1') : L('분류 라인 S1', 'Sort line S1'), status: sel.id === 'X1' ? L(`리젝트 대기 ${sim.hub.deskQ.length + (sim.hub.desk.cur ? 1 : 0)}`, `Reject queue ${sim.hub.deskQ.length + (sim.hub.desk.cur ? 1 : 0)}`) : L('가동 중', 'Running'), tone: 'green' }
  if (sel.kind === 'story') return { title: '', tone: 'blue' }
  if (sel.kind === 'aircraft') {
    const a = sim.airport.aircraft.find((x) => x.id === sel.id)
    return { title: a?.flight ?? sel.id, status: a ? aircraftState(a) : '', tone: 'blue' }
  }
  if (sel.kind === 'barge') return { title: sim.barge.name, status: BARGE_STATE[sim.barge.state], tone: sim.barge.state === 'moored' ? 'green' : 'blue' }
  if (sel.kind === 'mover') {
    const m = sim.life.movers.find((x) => x.id === sel.id)
    if (!m) return { title: sel.id, tone: 'gray' }
    const p = personInfo(m)
    return { title: m.kind === 'person' || m.kind === 'moto' ? p.name : p.role, status: p.doing, tone: p.tone }
  }
  if (sel.kind === 'robot') {
    const r = sim.robots.find((x) => x.id === sel.id)
    return { title: sel.id, status: r ? AMR_STATE[r.state] : '', tone: 'blue' }
  }
  if (sel.kind === 'equip') {
    const e = sim.djwh.equipById(sel.id)
    return { title: sel.id, status: e?.task, tone: idleTask(e?.task) ? 'gray' : 'green' }
  }
  return { title: SITE_META[sel.id as SiteId]?.name ?? '', tone: 'blue' }
}

/** 화물기 상태 한 줄 */
export function aircraftState(a: Aircraft) {
  const s = sim.airport.stands[a.stand]
  switch (a.phase) {
    case 'away': return L('운항 중(지도 밖)', 'In flight (off map)')
    case 'approach': return L('착륙 접근 · 활주로 09', 'Approach · runway 09')
    case 'rollout': return L('착륙 감속', 'Landing rollout')
    case 'taxiIn': return L(`지상 이동 → 주기장 ${601 + Math.max(0, a.stand)}`, `Taxiing → stand ${601 + Math.max(0, a.stand)}`)
    case 'parked': return s?.label ?? L('주기 중', 'Parked')
    case 'pushback': return L('푸시백', 'Pushback')
    case 'taxiOut': return L('지상 이동 → 활주로 09', 'Taxiing → runway 09')
    case 'hold': return L('이륙 허가 대기', 'Awaiting takeoff clearance')
    case 'lineup': return L('활주로 진입', 'Lining up')
    case 'takeoff': return L('이륙 활주', 'Takeoff roll')
    case 'climb': return L('상승 · 출발', 'Climbing · departed')
  }
}

/** 항만 장비 상태 한 줄(sts-0 · armg-1 · agv-2) */
export function craneState(id: string) {
  const [type, n] = id.split('-')
  const i = Number(n)
  const P = sim.port
  if (type === 'sts') {
    const s = P.sts[i]
    if (!s) return ''
    if (s.agv === null) return L('다음 AGV 대기', 'Waiting for next AGV')
    const a = s.acts[0]
    if (!a) return L('대기', 'Idle')
    return s.box ? (s.trolleyZ > 300 ? L('선박에 적하 중', 'Loading onto ship') : L('AGV에 내려놓는 중', 'Setting down on AGV')) : s.trolleyZ > 300 ? L('선박에서 양하 중', 'Discharging from ship') : L('AGV에서 들어 올리는 중', 'Lifting from AGV')
  }
  if (type === 'armg') {
    const arm = P.armgs[i]
    if (!arm) return ''
    if (!arm.acts.length) return arm.tasks.length ? L('작업 준비', 'Preparing job') : L('대기', 'Idle')
    return arm.z < 110 ? L('육측 트레일러 반출입', 'Landside trailer handling') : arm.z > 250 ? L('해측 AGV 반출입', 'Seaside AGV handling') : arm.box ? L('장치 위치로 이동', 'Moving to stack slot') : L('컨테이너 꺼내는 중', 'Picking container')
  }
  const a = P.agvs[i]
  if (!a) return ''
  return {
    toBlock: L(`블록 ${'ABCD'[a.block]}로 이동`, `To block ${'ABCD'[a.block]}`),
    atBlock: L(`블록 ${'ABCD'[a.block]} 반출입 대기`, `Waiting at block ${'ABCD'[a.block]}`),
    toCrane: L(`안벽 크레인 ${a.crane + 1}로 이동`, `To quay crane ${a.crane + 1}`),
    queue: L(`크레인 ${a.crane + 1} 대기열`, `Crane ${a.crane + 1} queue`),
    atCrane: L(`크레인 ${a.crane + 1} 듀얼 사이클`, `Crane ${a.crane + 1} dual cycle`),
    review: L('적하목록 AI 검토 중', 'AI manifest review'),
  }[a.state]
}

export function equipName(id: string) {
  const [type, n] = id.split('-')
  const i = Number(n)
  if (type === 'sts') return L(`안벽 크레인 STS-${i + 1}`, `Quay crane STS-${i + 1}`)
  if (type === 'armg') return L(`야드 크레인 ARMG-${'ABCD'[i >> 1]}${i % 2 ? '2 육측' : '1 해측'}`, `Yard crane ARMG-${'ABCD'[i >> 1]}${i % 2 ? '2 landside' : '1 seaside'}`)
  return sim.port.agvs[i]?.id ?? 'AGV'
}

export interface DockInfo {
  id: string
  type: string
  site: SiteId
  vehicle: Vehicle | null
  status: string
  tone: Tone
  today: number
}

export function dockInfo(id: string): DockInfo | null {
  const lists: [string, SiteId, { id: string; vehicle: string | null; today?: number }[]][] = [
    [L('윙바디 측면 하차장', 'Wing-body side unloading bay'), 'GJ', sim.bays],
    [L('레벨러 출고 도크', 'Leveler outbound dock'), 'GJ', sim.docks],
    [L('배송 분류장 슬롯', 'Delivery sort slot'), 'GJ', sim.slots],
    [L('윙바디 상차장', 'Wing-body loading bay'), 'IC', sim.icBays],
    [L('냉동 도크', 'Reefer dock'), 'IC', sim.icReefers],
    [L('간선 하차 도크', 'Linehaul unloading dock'), 'IN', sim.inDocks],
    [L('기사 배송 슬롯', 'Driver delivery slot'), 'IN', sim.inSlots],
    [L('항공 화물 도크', 'Air cargo dock'), 'AP', sim.apDocks],
    [L('대전 하역 도크', 'Daejeon handling dock'), 'DJ', sim.djDocks],
  ]
  for (const [type, site, list] of lists) {
    const d = list.find((x) => x.id === id)
    if (!d) continue
    const v = d.vehicle ? sim.vehicle(d.vehicle) ?? null : null
    let status = L('사용 가능', 'Available')
    let tone: Tone = 'gray'
    if (v) {
      const here = v.site === site
      if (here && ['unloading', 'loading', 'closing'].includes(v.phase)) {
        status = vehicleStatus(v).label
        tone = 'green'
      } else if (here && v.phase === 'departing') {
        status = L('출차 중', 'Exiting')
      } else if (site === 'IN' && /슬롯|slot/i.test(type) && v.site === 'TW') {
        status = L('배송 중', 'Delivering')
        tone = 'blue'
      } else {
        status = L('도착 예정', 'Arriving')
        tone = 'blue'
      }
    }
    return { id: d.id, type, site, vehicle: v, status, tone, today: d.today ?? 0 }
  }
  return null
}

export interface Step {
  label: string
  sub: string
  time: number
  state: 'done' | 'active' | 'todo'
  /** 아직 오지 않은 단계의 도착 예정(관제 시계) */
  eta?: number
}

/** 차량 운송 단계 */
export function shipmentSteps(v: Vehicle): Step[] {
  // 복사본(아래에서 약속 시각으로 바꿔 쓰므로 원본을 건드리지 않게)
  const t = [...v.shipment.times]
  const s = (label: string, sub: string, i: number, active: number): Step => ({ label, sub, time: t[i] ?? sim.clock, state: i < active ? 'done' : i === active ? 'active' : 'todo' })
  const moving = ['departing', 'highway', 'enroute', 'gate', 'inbound', 'docking', 'returning'].includes(v.phase)
  if (v.kind === 'van' && v.home === 'IN') {
    const a = v.site === 'IN' ? (v.phase === 'loading' || v.phase === 'closing' ? 1 : v.phase === 'departing' ? 2 : 4) : v.delivered >= v.stops.length ? 4 : 3
    return [
      s(L('분류 완료', 'Sorted'), L('휠소터', 'Wheel sorter'), 0, a),
      s(L('상차', 'Loading'), L(`${v.cargoDone}박스`, `${v.cargoDone} ${plural(v.cargoDone, 'box', 'boxes')}`), 1, a),
      s(L('배송 출발', 'Depart'), L('다온마을', 'Daon Village'), 2, a),
      s(L('배송 중', 'Delivering'), L(`${v.delivered}/${v.stops.length}곳`, `${v.delivered}/${v.stops.length} ${plural(v.stops.length, 'stop')}`), 3, a),
      s(L('복귀', 'Return'), L('인천 서브', 'Incheon Sub'), 4, a),
    ]
  }
  if (v.kind === 'trailer') {
    const a = v.site === 'BS' ? (v.phase === 'craning' ? 1 : v.phase === 'inspecting' ? 2 : v.phase === 'departing' ? 2 : 0) : v.phase === 'unloading' ? 4 : 3
    return [
      s(L('수출 반입', 'Export gate-in'), L('게이트 OCR', 'Gate OCR'), 0, a),
      s(L('수입 반출', 'Import gate-out'), `ARMG ${'ABCD'[v.crane]}`, 1, a),
      s(L('통관', 'Customs'), v.box?.manifest?.flags && v.box.manifest.flags.mismatch > 0.6 ? L('X-ray 검사', 'X-ray check') : L('서류 통과', 'Docs cleared'), 2, a),
      s(L('육상 운송', 'Road haul'), L('곤지암 CY', 'Gonjiam CY'), 3, a),
      s(L('하역·교체', 'Unload · swap'), 'CY', 4, a),
    ]
  }
  const work = v.phase === 'loading' || v.phase === 'unloading' || v.phase === 'closing'
  const a = work ? 3 : moving ? 2 : 4
  // 도착 약속이 있으면 출발·도착 시각을 실제 값으로(운송장의 예시 시각 대신)
  const p = v.promise
  const pst = p ? sim.promises.status(v) : null
  if (p && pst) {
    t[1] = p.departed
    t[2] = p.arrived ?? pst.eta
    t[3] = p.arrived ?? pst.eta
  }
  const road = pst?.incident ? L(`돌발 · ${pst.incident.split(' · ').pop()}`, `Incident · ${pst.incident.split(' · ').pop()}`) : pst?.causes.includes('rest') ? L('간선 · 휴게 포함', 'Linehaul · incl. rest stop') : L('간선도로', 'Highway')
  // 거점 이름 한 낱말: 한국어는 끝 낱말(메가허브·서브터미널), 영어는 코드(GJ-01)를 뗀 이름(Gonjiam Mega Hub)
  const place = (name: string) => (isEn ? name.replace(/^[A-Z]{2}-\d\d /, '') : name.split(' ').slice(-1)[0])
  return [
    s(L('배차', 'Dispatch'), v.shipment.customer, 0, a),
    s(L('출발', 'Depart'), place(v.shipment.origin), 1, a),
    s(L('운행', 'In transit'), p && pst && !p.arrived ? L(`${road} · 예정 ${hhmm(pst.eta)}`, `${road} · ETA ${hhmm(pst.eta)}`) : road, 2, a),
    s(v.phase === 'loading' ? L('상차', 'Loading') : L('하차', 'Unloading'), cargoLabel(v), 3, a),
    s(L('완료', 'Done'), place(v.shipment.dest), 4, a),
  ]
}

// ───────────────────────── 스토리

export const STORY_STEPS = [
  { label: L('주문·피킹', 'Picking'), sub: L('이천 FC', 'Icheon FC') },
  { label: L('출고 상차', 'Loading'), sub: L('이천 FC', 'Icheon FC') },
  { label: L('간선 운송', 'Linehaul'), sub: L('→ 곤지암', '→ Gonjiam') },
  { label: L('허브 분류', 'Hub sort'), sub: L('곤지암', 'Gonjiam') },
  { label: L('간선 운송', 'Linehaul'), sub: L('→ 인천', '→ Incheon') },
  { label: L('서브 분류', 'Sub sort'), sub: L('인천', 'Incheon') },
  { label: L('배송 출발', 'Dispatch'), sub: L('1톤 탑차', '1-ton van') },
  { label: L('배송 완료', 'Delivered'), sub: L('다온마을', 'Daon Village') },
]

export function storyStageLabel(stage: number) {
  return STORY_STEPS[Math.max(0, Math.min(7, stage))]?.label ?? ''
}

export function storyAddress() {
  const s = sim.story
  const stop = STOPS[s.stopId]
  if (!stop) return ''
  return stop.id.startsWith('A') ? `${stop.label} ${s.unit}` : stop.label
}

/** 거점 요약 한 줄 */
export function siteSummary(id: SiteId) {
  if (id === 'GJ') {
    const busy = sim.bays.filter((b) => b.vehicle).length + sim.docks.filter((d) => d.vehicle).length
    return L(`도크 ${busy}/${sim.bays.length + sim.docks.length} · 분류 ${num(sim.stats.boxes - sim.stats.boxesBase + 2140)}`, `Docks ${busy}/${sim.bays.length + sim.docks.length} · Sorted ${num(sim.stats.boxes - sim.stats.boxesBase + 2140)}`)
  }
  if (id === 'IC') return L(`AMR 10대 · 출고 ${sim.stats.icPallets}파렛트`, `10 AMRs · ${sim.stats.icPallets} ${plural(sim.stats.icPallets, 'pallet')} out`)
  if (id === 'IN') {
    const home = sim.vehicles.filter((v) => v.home === 'IN' && v.site === 'IN').length
    const chute = sim.inSlots.reduce((s, x) => s + x.held, 0) * 8
    return L(`기사 ${home}/12 대기 · 슈트 ${chute}박스`, `Drivers ${home}/12 in · Chutes ${chute} ${plural(chute, 'box', 'boxes')}`)
  }
  if (id === 'TW') {
    const out = sim.vehicles.filter((v) => v.home === 'IN' && v.site === 'TW').length
    return L(`배송 차량 ${out}대 · 완료 ${num(sim.stats.delivered - sim.stats.deliveredBase)}`, `${out} delivery ${plural(out, 'van')} · ${num(sim.stats.delivered - sim.stats.deliveredBase)} done`)
  }
  if (id === 'DJ') {
    const busy = sim.djDocks.filter((d) => d.vehicle && sim.vehicle(d.vehicle)?.site === 'DJ').length
    const trips = sim.djDocks.reduce((s, d) => s + d.today, 0)
    return L(`도크 ${busy}/${sim.djDocks.length} · 간선 ${trips}회`, `Docks ${busy}/${sim.djDocks.length} · ${trips} linehaul ${plural(trips, 'trip')}`)
  }
  if (id === 'AP') {
    const parked = sim.airport.aircraft.filter((a) => a.phase === 'parked').length
    return L(`화물기 ${parked}/2 주기 · ULD ${sim.airport.stats.uldIn + sim.airport.stats.uldOut}`, `Freighters ${parked}/2 parked · ULD ${sim.airport.stats.uldIn + sim.airport.stats.uldOut}`)
  }
  return `STS 3 · AGV 6 · ${num(sim.teu)} TEU`
}

/** 약속 상태 칩(차량 목록·상태 칩·인스펙터): 정시 / 위험 +n분 / 지연 +n분 */
export function promiseChip(v: Vehicle): { label: string; tone: Tone; delta: number } | null {
  const st = sim.promises.status(v)
  if (!st) return null
  if (st.state === 'done-ontime') return { label: L('약속 안 도착', 'Arrived on time'), tone: 'green', delta: st.delta }
  if (st.state === 'done-late') return { label: L('약속 지연 도착', 'Arrived late'), tone: 'red', delta: st.delta }
  if (st.state === 'late') {
    const m = Math.max(1, Math.round((sim.clock - v.promise!.win[1]) / 60))
    return { label: L(`지연 +${m}분`, `Late +${m} min`), tone: 'red', delta: st.delta }
  }
  if (st.state === 'risk') {
    const m = Math.max(1, Math.round((st.eta - v.promise!.win[1]) / 60))
    return { label: L(`위험 +${m}분`, `At risk +${m} min`), tone: 'amber', delta: st.delta }
  }
  return { label: L('정시', 'On time'), tone: 'green', delta: st.delta }
}
