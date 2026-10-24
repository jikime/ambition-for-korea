// 현장 흐름(참고 영상의 "Warehouse flow"): 거점마다 실제 작업 순서대로 단계를 나누고, 단계마다 실시간 수치·한 줄 상태·
// 카메라가 갈 곳(대표 개체 선택 또는 구역)을 정한다. 투어 재생은 이 단계를 차례로 보여 준다.
import { sim, type Vehicle } from '../sim/sim'
import { TW, BS, IC } from '../sim/sites'
import * as LY from '../sim/layout'
import { AP } from '../sim/airport'
import { RACK } from '../sim/djwh'
import { VESSELS } from '../sim/port'
import { GJ_RAIL, RAIL_STATE_LABEL } from '../sim/rail'
import { SITE_META, SITE_ORDER, type SiteId } from '../sim/world'
import type { Selection } from '../store'
import { num, siteSummary } from './format'
import { idleTask } from './people'
import { L, plural } from '../i18n'

export type FlowIcon = 'gate' | 'dock' | 'scan' | 'down' | 'rack' | 'robot' | 'hand' | 'box' | 'sort' | 'truck' | 'ship' | 'train' | 'plane' | 'home' | 'site'

export interface FlowFocus {
  sel?: Selection
  zone?: { x: number; z: number; d: number }
}

export interface FlowStep {
  key: string
  label: string
  icon: FlowIcon
  count: string
  status: string
  focus: () => FlowFocus
  /** 투어에서 보여 줄 설명 */
  desc: string
}

const visible = (pred: (v: Vehicle) => boolean) => sim.vehicles.filter((v) => v.visible && pred(v))
const pickV = (list: Vehicle[]): Selection | undefined => (list[0] ? { kind: 'vehicle', id: list[0].id } : undefined)
const moving = (v: Vehicle) => v.phase === 'inbound' || v.phase === 'departing' || v.phase === 'docking' || v.phase === 'gate' || v.phase === 'yard'

function gj(): FlowStep[] {
  const inSite = visible((v) => v.site === 'GJ' && v.x > LY.SITE.x0 - 4 && v.x < LY.SITE.x1 + 4 && v.z < 40)
  const wings = visible((v) => v.kind === 'wing' && v.site === 'GJ' && v.phase === 'unloading')
  const fls = sim.forklifts.filter((f) => f.site === 'GJ')
  const flBusy = fls.filter((f) => f.status !== 'idle' && f.status !== 'parking')
  const loading = visible((v) => v.site === 'GJ' && v.kind === 'box' && (v.phase === 'loading' || v.phase === 'unloading'))
  const vans = visible((v) => v.home === 'GJ' && v.kind === 'van' && v.site === 'GJ')
  const trailers = visible((v) => v.kind === 'trailer' && v.site === 'GJ')
  return [
    { key: 'gj-gate', label: L('정문·야드', 'Gate · yard'), icon: 'gate', count: String(inSite.filter(moving).length), status: L(`${inSite.filter(moving).length}대 구내 이동 · 구내 ${inSite.length}대`, `${inSite.filter(moving).length} moving · ${inSite.length} on site`), focus: () => ({ sel: pickV(inSite.filter(moving)), zone: { x: 62, z: 24, d: 70 } }), desc: L('트럭이 정문 차단기를 지나 하차장·출고 도크·컨테이너 야드로 갑니다', 'Trucks pass the gate barrier and head to the unloading bays, outbound docks and container yard') },
    { key: 'gj-bays', label: L('측면 하차(윙바디)', 'Side unloading'), icon: 'dock', count: `${sim.bays.filter((b) => b.vehicle).length}/3`, status: L(`하차 중 ${wings.length}대 · 오늘 ${sim.bays.reduce((s, b) => s + (b.today ?? 0), 0)}대`, `${wings.length} unloading · ${sim.bays.reduce((s, b) => s + (b.today ?? 0), 0)} today`), focus: () => ({ sel: pickV(wings), zone: { x: -42, z: 9, d: 60 } }), desc: L('이천 FC에서 온 윙바디가 날개를 열고, 지게차가 옆에서 파렛트를 내립니다', 'Wing-body trucks from Icheon FC open their wings and forklifts unload pallets from the side') },
    { key: 'gj-store', label: L('입고·보관', 'Receiving · storage'), icon: 'down', count: num(sim.stats.stock), status: L(`지게차 ${flBusy.length}/${fls.length} 작업 · 보관 ${num(sim.stats.stock)}파렛트`, `Forklifts ${flBusy.length}/${fls.length} busy · ${num(sim.stats.stock)} pallets stored`), focus: () => ({ sel: flBusy[0] ? { kind: 'forklift', id: flBusy[0].id } : undefined, zone: { x: -40, z: -26, d: 70 } }), desc: L('내린 파렛트를 지게차가 입고문으로 들여 보관합니다', 'Forklifts carry the unloaded pallets through the inbound door into storage') },
    { key: 'gj-sort', label: L('허브 분류(X1)', 'Hub sort (X1)'), icon: 'sort', count: sim.hub.rate ? num(sim.hub.rate) : '-', status: L(`리젝트 대기 ${sim.hub.deskQ.length} · 시간당 ${num(sim.hub.rate)}박스`, `Reject queue ${sim.hub.deskQ.length} · ${num(sim.hub.rate)} boxes/h`), focus: () => ({ sel: { kind: 'sorter', id: 'X1' } }), desc: L('크로스벨트 소터가 상자를 행선지 슈트로 나누고, 바코드를 못 읽은 상자는 리젝트 데스크로 갑니다', 'The cross-belt sorter splits boxes into destination chutes; boxes with unreadable barcodes go to the reject desk') },
    { key: 'gj-out', label: L('간선 출고 도크', 'Linehaul outbound docks'), icon: 'truck', count: `${sim.docks.filter((d) => d.vehicle).length}/4`, status: L(`상차·하차 ${loading.length}대 · 오늘 출고 ${sim.stats.trucksOut}대`, `${loading.length} loading/unloading · ${sim.stats.trucksOut} out today`), focus: () => ({ sel: pickV(loading), zone: { x: -2, z: -4, d: 60 } }), desc: L('인천·대전·인천공항으로 가는 11톤 간선이 도크에 붙어 상차합니다', '11-ton linehaul trucks bound for Incheon, Daejeon and Incheon Airport back onto the docks and load') },
    { key: 'gj-van', label: L('배송 분류장', 'Delivery sort area'), icon: 'box', count: `${sim.slots.filter((s) => s.vehicle).length}/12`, status: L(`1톤 상차 ${vans.filter((v) => v.phase === 'loading').length}대`, `${vans.filter((v) => v.phase === 'loading').length} 1-ton ${plural(vans.filter((v) => v.phase === 'loading').length, 'van')} loading`), focus: () => ({ zone: { x: 36, z: -30, d: 62 } }), desc: L('곤지암 지역 1톤 택배차가 슈트 옆에서 상자를 싣습니다', 'Gonjiam-area 1-ton delivery vans load boxes beside the chutes') },
    { key: 'gj-cy', label: L('컨테이너 야드', 'Container yard'), icon: 'ship', count: `${sim.cy.count} TEU`, status: L(`트레일러 ${trailers.length}대 · 오늘 ${sim.cy.today}개`, `${trailers.length} ${plural(trailers.length, 'trailer')} · ${sim.cy.today} today`), focus: () => ({ sel: pickV(trailers), zone: { x: 85, z: -5, d: 72 } }), desc: L('부산신항에서 온 컨테이너를 내리고 적출합니다', 'Containers from Busan New Port are unloaded and devanned') },
    { key: 'gj-rail', label: L('철송 하역', 'Rail unloading'), icon: 'train', count: `${sim.rail.gj.count(0)}`, status: `${RAIL_STATE_LABEL[sim.rail.state]}${sim.rail.state === 'GJ' ? ` · ${sim.rail.gj.work.done}/${sim.rail.gj.work.total}` : ''} · ${L('수출 대기', 'exports waiting')} ${sim.rail.gj.count(1)}`, focus: () => ({ zone: { x: (GJ_RAIL.x0 + GJ_RAIL.x1) / 2, z: GJ_RAIL.z + 10, d: 110 } }), desc: L('부산신항에서 온 셔틀 열차를 곤지암 철송장 RMG가 내려 CY로 넘기고, CY의 수출 컨테이너를 실어 돌려보냅니다', 'The Gonjiam rail terminal RMG unloads the shuttle train from Busan New Port into the CY and loads export containers for the trip back') },
  ]
}

const IC_LINES = IC.lines

function ic(): FlowStep[] {
  const busy = sim.robots.filter((r) => r.state !== 'idle')
  const picking = sim.robots.filter((r) => r.state === 'atStation')
  const wings = visible((v) => v.kind === 'wing' && v.site === 'IC' && (v.phase === 'loading' || v.phase === 'closing'))
  const reefers = visible((v) => v.kind === 'reefer' && v.site === 'IC')
  const inSite = visible((v) => v.site === 'IC' && moving(v))
  return [
    { key: 'ic-gate', label: L('정문·야드', 'Gate · yard'), icon: 'gate', count: String(inSite.length), status: L(`${inSite.length}대 구내 이동`, `${inSite.length} moving on site`), focus: () => ({ sel: pickV(inSite), zone: { x: 372, z: 22, d: 70 } }), desc: L('윙바디와 냉동탑차가 정문을 지나 상차장·냉동 도크로 갑니다', 'Wing-body and reefer trucks pass the gate to the loading bays and reefer docks') },
    { key: 'ic-amr', label: L('로봇 포드 운반', 'Robot pod transport'), icon: 'robot', count: `${busy.length}/${sim.robots.length}`, status: L(`포드 운반 ${busy.length}대`, `${busy.length} carrying pods`), focus: () => ({ sel: busy[0] ? { kind: 'robot', id: busy[0].id } : undefined, zone: { x: 420, z: -50, d: 60 } }), desc: L('구동 로봇이 상품이 든 포드를 들어 피킹 스테이션으로 가져옵니다', 'Drive robots lift pods full of goods and bring them to the picking stations') },
    { key: 'ic-pick', label: L('피킹', 'Picking'), icon: 'hand', count: num(sim.orders), status: L(`피킹 중 ${picking.length}/4 스테이션`, `Picking at ${picking.length}/4 stations`), focus: () => ({ sel: { kind: 'mover', id: `pk-${(picking[0]?.station ?? 0) + 1}` } }), desc: L('작업자가 포드에서 주문 상품을 꺼내 토트에 담습니다', 'Workers take ordered items from the pod and put them in totes') },
    { key: 'ic-pack', label: L('포장·분류', 'Packing · sorting'), icon: 'sort', count: num(sim.icSort.total), status: L(`분류 중 ${sim.icSort.onBelt} · 적재 ${IC_LINES.map((_, k) => `${sim.icSort.stackOf(k)}/8`).join(' ')}${sim.icSort.rush ? ' · 웨이브' : ''}`, `Sorting ${sim.icSort.onBelt} · Stacks ${IC_LINES.map((_, k) => `${sim.icSort.stackOf(k)}/8`).join(' ')}${sim.icSort.rush ? ' · wave' : ''}`), focus: () => ({ zone: { x: 440, z: -19.5, d: 46 } }), desc: L('포장한 상자가 슬라이딩 슈 분류기를 지나 롤러 슈트로 내려가 파렛트에 쌓입니다. 8개가 쌓이면 파렛트 하나가 출고 라인으로 나가고, 윙바디가 배차되면 그 차 몫 주문을 먼저 내보냅니다(웨이브)', 'Packed boxes pass the sliding-shoe sorter and roll down chutes onto pallets. Every 8 boxes, a pallet moves to the outbound line; when a wing-body truck is dispatched, its orders go out first (wave)') },
    { key: 'ic-wrap', label: L('랩핑·출고 라인', 'Wrapping · outbound line'), icon: 'box', count: String(sim.icLines.reduce((s, l) => s + l.pallets.length, 0)), status: L(`랩핑 중 ${sim.icLines.filter((l) => l.wrapping).length}/3`, `Wrapping ${sim.icLines.filter((l) => l.wrapping).length}/3`), focus: () => ({ zone: { x: 443, z: -6, d: 50 } }), desc: L('파렛트를 랩으로 감아 출고 라인으로 내보냅니다', 'Pallets are stretch-wrapped and sent to the outbound line') },
    { key: 'ic-load', label: L('윙바디 상차', 'Wing-body loading'), icon: 'truck', count: `${sim.icBays.filter((b) => b.vehicle).length}/3`, status: L(`상차 중 ${wings.length}대`, `${wings.length} loading`), focus: () => ({ sel: pickV(wings), zone: { x: 456, z: 10, d: 60 } }), desc: L('지게차가 파렛트를 윙바디 옆으로 싣습니다', 'Forklifts load pallets into the wing-body truck from the side') },
    { key: 'ic-cold', label: L('냉동 도크', 'Reefer dock'), icon: 'dock', count: `${sim.icReefers.filter((d) => d.vehicle).length}/2`, status: L(`냉동탑차 ${reefers.length}대 · 새벽배송`, `${reefers.length} reefer ${plural(reefers.length, 'truck')} · dawn delivery`), focus: () => ({ sel: pickV(reefers), zone: { x: 500, z: -8, d: 55 } }), desc: L('냉동탑차가 새벽배송 물량을 싣고 서울 새벽배송 거점으로 떠납니다', 'Reefer trucks load dawn-delivery orders and leave for the Seoul dawn-delivery hub') },
  ]
}

function inn(): FlowStep[] {
  const unl = visible((v) => v.site === 'IN' && v.kind === 'box' && v.phase === 'unloading')
  const vans = sim.vehicles.filter((v) => v.home === 'IN')
  const loadV = vans.filter((v) => v.site === 'IN' && v.visible && v.phase === 'loading')
  const out = vans.filter((v) => v.site === 'TW')
  return [
    { key: 'in-dock', label: L('간선 하차', 'Linehaul unloading'), icon: 'dock', count: `${sim.inDocks.filter((d) => d.vehicle).length}/2`, status: L(`하차 중 ${unl.length}대`, `${unl.length} unloading`), focus: () => ({ sel: pickV(unl), zone: { x: -412, z: -26, d: 55 } }), desc: L('곤지암에서 온 11톤 간선이 후진으로 붙어 상자를 내립니다', '11-ton linehaul trucks from Gonjiam back onto the docks and unload boxes') },
    { key: 'in-sort', label: L('휠소터 분류', 'Wheel sorter'), icon: 'sort', count: '8,640', status: L('시간당 8,640박스 · 인식률 99.6%', '8,640 boxes/h · 99.6% read rate'), focus: () => ({ sel: { kind: 'sorter', id: 'S2' } }), desc: L('ITS 스캐너가 송장을 읽고 휠소터가 기사별 슈트로 보냅니다', 'ITS scanners read the labels and the wheel sorter sends each box to its driver\'s chute') },
    { key: 'in-chute', label: L('기사별 슈트', 'Driver chutes'), icon: 'box', count: num(sim.inSlots.reduce((s, x) => s + x.held, 0) * 8), status: L('슈트 대기 상자', 'Boxes waiting in chutes'), focus: () => ({ zone: { x: -488, z: -26, d: 50 } }), desc: L('슈트 끝에 쌓인 상자를 기사가 차에 싣습니다', 'Drivers load the boxes piled at the chute ends into their vans') },
    { key: 'in-load', label: L('1톤 상차', '1-ton loading'), icon: 'truck', count: `${loadV.length}/12`, status: L(`상차 중 ${loadV.length}대`, `${loadV.length} loading`), focus: () => ({ sel: pickV(loadV), zone: { x: -488, z: -26, d: 50 } }), desc: L('1톤 탑차가 자기 슬롯에서 상자를 싣고 배송 준비를 합니다', '1-ton vans load boxes at their own slots and get ready for delivery') },
    { key: 'in-go', label: L('배송 출발', 'Out for delivery'), icon: 'home', count: String(out.length), status: L(`다온마을 배송 ${out.length}대`, `${out.length} delivering in Daon Village`), focus: () => ({ sel: pickV(out.filter((v) => v.visible)), zone: { x: -392, z: 60, d: 80 } }), desc: L('배송차가 다온마을로 출발합니다', 'Delivery vans head out to Daon Village') },
  ]
}

function tw(): FlowStep[] {
  const vans = sim.vehicles.filter((v) => v.home === 'IN' && v.site === 'TW' && v.visible)
  const walking = vans.filter((v) => v.walk.on)
  const bot = sim.life.movers.find((m) => m.id === 'r-bot')
  return [
    { key: 'tw-in', label: L('배송 진입', 'Vans in zone'), icon: 'truck', count: String(vans.length), status: L(`배송차 ${vans.length}대`, `${vans.length} delivery ${plural(vans.length, 'van')}`), focus: () => ({ sel: pickV(vans), zone: { x: -392, z: 120, d: 80 } }), desc: L('1톤 탑차가 단지 순환로와 빌라 골목을 돕니다', '1-ton vans circle the complex loop road and the villa alleys') },
    { key: 'tw-door', label: L('문 앞 배송', 'Doorstep delivery'), icon: 'home', count: String(walking.length), status: L(`${walking.length}명 걸어서 배송 · 완료 ${num(sim.stats.delivered - sim.stats.deliveredBase)}`, `${walking.length} on foot · ${num(sim.stats.delivered - sim.stats.deliveredBase)} done`), focus: () => ({ sel: pickV(walking), zone: { x: -480, z: 150, d: 70 } }), desc: L('기사가 핸드카트로 문 앞·경비실·택배함에 상자를 둡니다(메모는 AI가 읽음)', 'Drivers use hand carts to leave boxes at the door, security office or parcel locker (AI reads the notes)') },
    { key: 'tw-locker', label: L('무인택배함', 'Parcel locker'), icon: 'box', count: String(sim.stats.lockerBoxes), status: L('관리동 무인택배함 보관', 'Held in the office parcel lockers'), focus: () => ({ zone: { x: TW.locker.x, z: TW.locker.z, d: 40 } }), desc: L('주민이 택배함에서 상자를 찾아갑니다', 'Residents collect their boxes from the parcel locker') },
    { key: 'tw-life', label: L('로봇·드론 배송', 'Robot · drone delivery'), icon: 'robot', count: String(sim.life.stats.robot + sim.life.stats.drone), status: L(`로봇 ${sim.life.stats.robot} · 드론 ${sim.life.stats.drone}`, `Robot ${sim.life.stats.robot} · Drone ${sim.life.stats.drone}`), focus: () => ({ sel: bot ? { kind: 'mover', id: bot.id } : undefined, zone: { x: -470, z: 120, d: 70 } }), desc: L('실외 배송 로봇과 드론이 편의점·드론 거점에서 동 앞까지 배송합니다', 'Outdoor delivery robots and drones deliver from the convenience store and drone hub to the building entrances') },
  ]
}

function bs(): FlowStep[] {
  const P = sim.port
  const agvBusy = P.agvs.filter((a) => a.box)
  const stored = P.blocks.reduce((s, b) => s + b.reduce((a, bay) => a + bay.length, 0), 0)
  const trailers = visible((v) => v.kind === 'trailer' && v.site === 'BS')
  return [
    { key: 'bs-sts', label: L('입항·양하', 'Arrival · discharge'), icon: 'ship', count: `${Math.round(Math.min(1, P.berth.moves / P.berth.target) * 100)}%`, status: `${VESSELS[P.berth.vessel].name} · ${P.berth.phase === 'working' ? L(`작업 ${P.berth.moves}/${P.berth.target}`, `Moves ${P.berth.moves}/${P.berth.target}`) : P.berth.phase === 'departing' ? L('출항 중', 'Departing') : P.berth.phase === 'away' ? L('선석 비움', 'Berth empty') : L('입항 중', 'Arriving')}`, focus: () => ({ sel: { kind: 'crane', id: 'sts-1' } }), desc: L('배가 접안하면 안벽 크레인이 컨테이너를 내리고 싣고(듀얼 사이클링), 작업량을 채우면 출항하고 묘박지의 다음 배가 들어옵니다', 'Once a ship berths, quay cranes unload and load containers (dual cycling); when the moves are done it departs and the next ship comes in from the anchorage') },
    { key: 'bs-agv', label: L('AGV 이송', 'AGV transfer'), icon: 'robot', count: `${agvBusy.length}/${P.agvs.length}`, status: L(`운반 중 ${agvBusy.length}대 · 적하목록 심사`, `${agvBusy.length} carrying · manifest review`), focus: () => ({ sel: { kind: 'crane', id: `agv-${Math.max(0, P.agvs.indexOf(agvBusy[0]))}` } }), desc: L('무인 운반차가 컨테이너를 장치장 블록으로 나르고, 적하목록은 AI가 심사합니다', 'AGVs carry containers to the yard blocks, and AI reviews the manifests') },
    { key: 'bs-yard', label: L('장치장 블록', 'Yard blocks'), icon: 'rack', count: String(stored), status: (() => { const occ = sim.port.occupancy(); const max = Math.max(...occ); return L(`최고 ${Math.round(max * 100)}%${max >= 0.9 ? ' · 포화 주의' : ''} · ARMG 8기`, `Peak ${Math.round(max * 100)}%${max >= 0.9 ? ' · near full' : ''} · 8 ARMGs`) })(), focus: () => ({ sel: { kind: 'crane', id: 'armg-2' } }), desc: L('자동화 야드 크레인이 블록에 쌓고 꺼냅니다', 'Automated yard cranes stack and retrieve containers in the blocks') },
    { key: 'bs-rail', label: L('철송', 'Rail'), icon: 'train', count: L(`${sim.rail.stats.arrivals + 6}회`, `${sim.rail.stats.arrivals + 6} runs`), status: `${RAIL_STATE_LABEL[sim.rail.state]}${sim.rail.state === 'BS' ? ` · ${sim.rail.bs.work.done}/${sim.rail.bs.work.total}` : ''} · ${L('곤지암행', 'to Gonjiam')} ${sim.rail.stats.toGj * 2} TEU`, focus: () => ({ zone: { x: 485, z: 282, d: 120 } }), desc: L('철송장에 셔틀 열차가 서면 레일 위 갠트리 크레인(RMG)이 곤지암에서 온 수출 컨테이너를 내리고, 장치장에서 넘어온 수입 컨테이너를 실어 곤지암 철송장으로 보냅니다', 'When the shuttle train stops, the rail-mounted gantry crane (RMG) unloads export containers from Gonjiam and loads import containers from the yard, bound for the Gonjiam rail terminal') },
    { key: 'bs-out', label: L('반출·게이트', 'Gate-out'), icon: 'truck', count: String(trailers.length), status: L(`트레일러 ${trailers.length}대 · X-ray ${P.stats.xray}`, `${trailers.length} ${plural(trailers.length, 'trailer')} · X-ray ${P.stats.xray}`), focus: () => ({ sel: pickV(trailers), zone: { x: BS.entry.x, z: 80, d: 70 } }), desc: L('트레일러가 컨테이너를 싣고 게이트를 나갑니다(신고 불일치는 X-ray)', 'Trailers carry containers out through the gate (declaration mismatches go to X-ray)') },
  ]
}

function ap(): FlowStep[] {
  const A = sim.airport
  const moving2 = A.aircraft.filter((a) => a.phase !== 'parked' && a.phase !== 'away')
  const parked = A.aircraft.filter((a) => a.phase === 'parked')
  const trucks = visible((v) => v.home === 'AP' && v.site === 'AP')
  return [
    { key: 'ap-land', label: L('착륙·지상 이동', 'Landing · taxiing'), icon: 'plane', count: String(moving2.length), status: L(`움직이는 화물기 ${moving2.length}대`, `${moving2.length} ${plural(moving2.length, 'freighter')} moving`), focus: () => ({ sel: moving2[0] ? { kind: 'aircraft', id: moving2[0].id } : undefined, zone: { x: -900, z: -200, d: 200 } }), desc: L('화물기가 착륙해 유도로로 주기장까지 갑니다', 'Freighters land and taxi along the taxiway to their stands') },
    { key: 'ap-stand', label: L('주기장 ULD 작업', 'ULD work at stand'), icon: 'box', count: `${parked.length}/2`, status: L(`ULD 하역 ${A.stats.uldIn} · 적재 ${A.stats.uldOut}`, `ULD off ${A.stats.uldIn} · on ${A.stats.uldOut}`), focus: () => ({ sel: parked[0] ? { kind: 'aircraft', id: parked[0].id } : undefined, zone: { x: AP.stands[0].x, z: AP.stands[0].z, d: 110 } }), desc: L('메인덱 로더와 돌리 열차가 ULD를 내리고 싣습니다', 'Main-deck loaders and dolly trains unload and load ULDs') },
    { key: 'ap-dock', label: L('화물터미널 도크', 'Cargo terminal docks'), icon: 'dock', count: `${sim.apDocks.filter((d) => d.vehicle).length}/${sim.apDocks.length}`, status: L(`항공 트럭 ${trucks.length}대`, `${trucks.length} air cargo ${plural(trucks.length, 'truck')}`), focus: () => ({ sel: pickV(trucks), zone: { x: -950, z: -20, d: 70 } }), desc: L('곤지암에서 온 항공 화물 트럭이 수출 화물을 내립니다', 'Air cargo trucks from Gonjiam unload export freight') },
    { key: 'ap-screen', label: L('위험물 검사', 'Dangerous goods check'), icon: 'scan', count: String(A.stats.screened), status: L(`탑재 보류 ${A.stats.held} · 냉장 ${A.stats.cold}`, `Held ${A.stats.held} · Chilled ${A.stats.cold}`), focus: () => ({ zone: { x: -900, z: -58, d: 80 } }), desc: L('신고 품명과 설명을 대조해 미신고 위험물을 가려냅니다(AI)', 'Declared item names are checked against descriptions to catch undeclared dangerous goods (AI)') },
    { key: 'ap-takeoff', label: L('이륙', 'Takeoff'), icon: 'plane', count: String(A.stats.departed), status: L(`오늘 출발 ${A.stats.departed + 13}편`, `${A.stats.departed + 13} departures today`), focus: () => ({ zone: { x: -900, z: -280, d: 260 } }), desc: L('푸시백 뒤 활주로 대기점에서 허가를 받아 이륙합니다', 'After pushback, freighters get clearance at the runway holding point and take off') },
  ]
}

function dj(): FlowStep[] {
  const W = sim.djwh
  const s = W.summary()
  // 야드 칸 예약은 출발할 때 잡히므로, 실제로 야드에 서 있는 차(phase 'yard')만 센다
  const yard = visible((v) => v.site === 'DJ' && v.phase === 'yard')
  const unl = visible((v) => v.site === 'DJ' && v.phase === 'unloading')
  const load = visible((v) => v.site === 'DJ' && v.phase === 'loading')
  const rtBusy = W.equip.filter((e) => e.kind === 'reach' && !idleTask(e.task))
  const flBusy = W.equip.filter((e) => e.kind === 'fl' && !idleTask(e.task))
  const inYard = visible((v) => v.site === 'DJ' && (moving(v) || v.phase === 'yard'))
  return [
    { key: 'dj-gate', label: L('정문·야드', 'Gate · yard'), icon: 'gate', count: String(inYard.length), status: L(`야드 대기 ${yard.length}대 · 이동 ${inYard.filter(moving).length}대`, `Yard wait ${yard.length} · Moving ${inYard.filter(moving).length}`), focus: () => ({ sel: pickV(yard.length ? yard : inYard), zone: { x: 706, z: 8, d: 60 } }), desc: L('도크가 다 차 있으면 트럭은 야드 대기 칸 Y1·Y2에서 기다렸다가 도크가 비면 후진으로 붙습니다', 'When all docks are full, trucks wait in yard slots Y1 and Y2, then back onto a dock as soon as one frees up') },
    { key: 'dj-dock', label: L('도크 하차', 'Dock unloading'), icon: 'dock', count: `${unl.length}/3`, status: L(`하차 중 ${unl.length}대 · 입고 레인 ${s.laneIn}`, `${unl.length} unloading · Inbound lane ${s.laneIn}`), focus: () => ({ sel: pickV(unl), zone: { x: 641, z: -30, d: 50 } }), desc: L('도크 작업자가 파렛트를 입고 레인에 내립니다. 레인이 차면 하차가 잠깐 멈춥니다', 'Dock workers set pallets down in the inbound lane. When the lane is full, unloading pauses briefly') },
    { key: 'dj-qc', label: L('입고 검수', 'Inbound QC'), icon: 'scan', count: String(s.qcWait), status: L(`스캔 대기 ${s.qcWait} · 보류 ${s.hold}`, `Scan queue ${s.qcWait} · Hold ${s.hold}`), focus: () => ({ sel: { kind: 'mover', id: 'qc-1' } }), desc: L('검수원이 파렛트를 스캔하고, 검수 메모(파손·수량·들기 위험·라벨)는 AI가 읽어 보류 여부를 정합니다', 'Inspectors scan each pallet; AI reads the QC notes (damage, quantity, lifting risk, label) and decides whether to hold it') },
    { key: 'dj-put', label: L('적치(리치트럭)', 'Put-away (reach truck)'), icon: 'down', count: `${rtBusy.length}/4`, status: L(`리치트럭 ${rtBusy.length}/4 작업 · P&D ${s.pd}`, `Reach trucks ${rtBusy.length}/4 busy · P&D ${s.pd}`), focus: () => ({ sel: rtBusy[0] ? { kind: 'equip', id: rtBusy[0].id } : { kind: 'equip', id: 'RT-1' } }), desc: L('지게차가 P&D 칸에 놓은 파렛트를 리치트럭이 통로로 가져가 랙 위치(예: A07-05-3)에 올립니다', 'Reach trucks take the pallets forklifts left in P&D slots down the aisle and lift them into rack locations (e.g. A07-05-3)') },
    { key: 'dj-store', label: L('보관(고층 랙)', 'Storage (high-bay rack)'), icon: 'rack', count: num(s.stored), status: L(`${s.locations}칸 중 ${Math.round((s.stored / s.locations) * 100)}% 사용`, `${Math.round((s.stored / s.locations) * 100)}% of ${s.locations} slots used`), focus: () => ({ zone: { x: 640, z: (RACK.frontZ + RACK.backZ) / 2, d: 80 } }), desc: L('통로 15개 × 양쪽 × 베이 6 × 단 5 = 900칸 고층 랙', '15 aisles × 2 sides × 6 bays × 5 levels = 900-slot high-bay rack') },
    { key: 'dj-pick', label: L('반출·출고 레인', 'Retrieval · outbound lane'), icon: 'box', count: String(s.laneOut), status: L(`출고 레인 ${s.laneOut} · 지게차 ${flBusy.length}/3`, `Outbound lane ${s.laneOut} · Forklifts ${flBusy.length}/3`), focus: () => ({ sel: flBusy[0] ? { kind: 'equip', id: flBusy[0].id } : { kind: 'equip', id: 'FL-D2' } }), desc: L('리치트럭이 꺼낸 파렛트를 지게차가 출고 레인으로 옮깁니다', 'Forklifts move the pallets that reach trucks retrieved to the outbound lane') },
    { key: 'dj-load', label: L('상차', 'Loading'), icon: 'truck', count: `${load.length}/3`, status: L(`상차 중 ${load.length}대 · 오늘 출고 ${W.stats.shipped}파렛트`, `${load.length} loading · ${W.stats.shipped} ${plural(W.stats.shipped, 'pallet')} out today`), focus: () => ({ sel: pickV(load), zone: { x: 641, z: -24, d: 55 } }), desc: L('출고 레인 파렛트를 트럭에 싣고 곤지암·대전·충청 거래처로 보냅니다', 'Outbound-lane pallets are loaded onto trucks for Gonjiam and for Daejeon and Chungcheong customers') },
  ]
}

function network(): FlowStep[] {
  return SITE_ORDER.map((id) => ({
    key: `net-${id}`,
    label: SITE_META[id].name,
    icon: 'site' as FlowIcon,
    count: SITE_META[id].code,
    status: siteSummary(id),
    focus: () => ({ sel: { kind: 'site', id } as Selection }),
    desc: SITE_META[id].type,
  }))
}

export function flowSteps(site: SiteId, view: 'site' | 'network'): FlowStep[] {
  if (view === 'network') return network()
  switch (site) {
    case 'GJ': return gj()
    case 'IC': return ic()
    case 'IN': return inn()
    case 'TW': return tw()
    case 'BS': return bs()
    case 'AP': return ap()
    case 'DJ': return dj()
  }
}
