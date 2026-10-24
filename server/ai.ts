// AI(Claude) 판단 모음. 서버에서만 실행한다(API 키는 서버 환경 변수 ANTHROPIC_API_KEY · .env에만 있다).
// 코드가 흐름을 쥐고, AI는 좁은 판단(choice·noul·score)만 돌려준다. 호출 방식은 ./claude.ts.
import { JudgeClient, choice, noul, score, serverApiKey } from './claude.js'

/** 서버에 Claude API 키가 설정돼 있는가 */
export function aiConfigured() {
  return serverApiKey().length > 0
}

let client: JudgeClient | null = null

function judge() {
  if (!aiConfigured()) throw new Error('ANTHROPIC_API_KEY is not set (.env or environment)')
  client ??= new JudgeClient()
  return client
}

// ───────────────────────── A. 자연어 관제 명령 → 동작 + 닫힌 집합 인자

export const COMMAND_QUESTIONS = {
  action: choice('What does the operator want the logistics dashboard to do with `command`?', {
    show_site: 'Move the view to one logistics site, a place in the present (show me ~, go to ~, take me to ~, how is ~ doing; 특정 거점 화면으로 이동, ~보여줘, ~가자, ~상황 어때). Going to a past time or moment is rewind, not this',
    network: 'Show the whole national network map with every site (national network, network view, whole map, all sites; 전국 네트워크, 전체 지도)',
    follow_story: 'Follow the one tracked parcel and its journey (follow the tracked parcel or box, where is our parcel; 추적 중인 택배·상자 따라가기, 우리 택배 어디)',
    find_vehicle: 'Find and show trucks, vans or trailers matching a condition (find a vehicle, truck, van or driver; 차량·트럭·기사·차 찾기)',
    find_forklift: 'Find forklifts matching a condition (find forklifts; 지게차 찾기)',
    set_speed: 'Change the simulation playback speed (playback speed, 2x, speed up, faster, slow down; 배속, 빠르게, 천천히)',
    rewind: 'Go back in time on the replay bar to an earlier moment: some minutes ago, or the time when something happened such as a notice, message, accident or jam (rewind, go back 10 minutes, show me again when ~ happened, show me when the road was jammed, go to when ~, back to when the driver called; 되감기, ~분 전으로 돌려, 아까 ~했을 때 다시 보여줘, ~막혔을 때 보여줘, ~했던 때로 가 봐, ~연락 온 때로). Any request that names a past moment ("when ~", "the time ~", "~때") is rewind',
    live: 'Stop the replay and return to the live present (go live, back to now, real time; 라이브로, 지금으로 돌아가, 실시간으로)',
    none: 'Not a dashboard request: small talk or unrelated (chit-chat, unrelated to control; 관제와 무관한 말)',
  }),
  site: choice('Which logistics site does `command` mention, if any?', {
    GJ: 'Gonjiam mega hub (Gonjiam Mega Hub, Gonjiam, the hub; 곤지암 메가허브, 허브)',
    IC: 'Icheon fulfillment center (Icheon Fulfillment Center, Icheon FC, Icheon, warehouse, AMR robots, cold chain; 이천 풀필먼트센터, 이천 FC, 창고, AMR 로봇, 콜드체인)',
    IN: 'Incheon sub-terminal (Incheon Sub-terminal, Incheon terminal, wheel sorter; 인천 서브터미널, 인천 터미널, 휠소터 분류장)',
    TW: 'Daonmaeul delivery area (Daon Village, Daon Village Delivery Zone, apartment complex, neighborhood, villas, delivery zone; 다온마을, 아파트 단지, 동네, 빌라, 배송 구역)',
    BS: 'Busan New Port: the harbor with cranes, ships and containers (Busan New Port, Busan, port, harbor, docks, cranes, ships; 부산신항, 부산, 항만, 부두, 크레인, 선박)',
    AP: 'Incheon Airport cargo terminal with cargo planes (Incheon Airport, airport, freighter, cargo plane, air cargo; 인천공항, 공항, 화물기, 비행기, 항공 화물)',
    DJ: 'Daejeon central hub for the Chungcheong region (Daejeon Central Hub, Daejeon, Chungcheong, central region; 대전 중부허브, 대전, 충청, 중부권)',
    none: 'No site is mentioned',
  }),
  vehicle_kind: choice('Which kind of vehicle does `command` ask about?', {
    wing: '5-ton wing-body truck on the Icheon–Gonjiam linehaul; trucks going between Icheon (이천) and Gonjiam (곤지암) (wing-body, Icheon↔Gonjiam truck; 윙바디, 이천↔곤지암 트럭)',
    box: '11-ton box truck on the Gonjiam–Incheon linehaul; "linehaul (간선) going to/from Incheon (인천)" means this (11-ton, linehaul box truck, Incheon-bound linehaul; 11톤, 간선 탑차, 인천행 간선)',
    van: '1-ton parcel delivery van and its driver (1-ton, delivery van, parcel van, driver; 1톤, 택배차, 배송 차량, 기사님)',
    reefer: 'refrigerated cold-chain truck (reefer truck, reefer, freezer truck, refrigerated truck; 냉동탑차, 냉동차, 냉장차)',
    trailer: 'container trailer from the port (container trailer, trailer; 컨테이너 트레일러, 트레일러)',
    any: 'no specific vehicle kind',
  }),
  vehicle_status: choice('Which vehicle status does `command` filter for?', {
    highway: 'driving on the highway between sites (on the highway, on the expressway, driving; 간선도로·고속도로 주행 중, 달리는)',
    loading: 'being loaded (loading; 상차 중)',
    unloading: 'being unloaded (unloading; 하차 중)',
    waiting: 'waiting for a dock or stuck (waiting for a dock, waiting, stuck; 도크 대기, 기다리는, 막힌)',
    delivering: 'out delivering parcels to customers (delivering, out for delivery; 배송 중)',
    any: 'no status filter',
  }),
  rank: choice('Does `command` ask for one item picked by an ordering?', {
    latest: 'the one arriving last, the slowest or most delayed (latest, slowest, most delayed; 제일 늦는, 지연된)',
    most_cargo: 'the one carrying the most or busiest (most loaded, fullest, busiest; 제일 많이 실은, 가장 바쁜)',
    none: 'no ordering requested',
  }),
  speed: choice('Which simulation playback speed does `command` ask for?', {
    x1: 'normal real-time speed, or slowing down (1x, normal speed, slow down; 1배, 정상 속도, 천천히)',
    x2: 'two times (2x, double speed; 2배)',
    x4: 'four times, faster (4x, faster; 4배, 빠르게)',
    x8: 'eight times, the fastest (8x, max speed, fastest; 8배, 최대 속도)',
    none: 'speed is not mentioned',
  }),
  minutes_ago: choice('How many minutes back in time does `command` ask to go?', {
    m5: 'about 5 minutes ago or "just now" (5 min ago, just now; 5분 전, 방금)',
    m10: 'about 10 minutes ago (10 min ago; 10분 전)',
    m15: 'about 15 minutes ago (15 min ago, a quarter of an hour ago; 15분 전)',
    m20: 'about 20 minutes ago (20 min ago; 20분 전)',
    m30: 'about 30 minutes or half an hour ago (30 min ago, half an hour ago; 30분 전, 반시간 전)',
    m45: 'about 45 minutes ago (45 min ago; 45분 전)',
    m60: 'about an hour ago (1 hour ago, an hour ago; 1시간 전, 한 시간 전)',
    none: 'no amount of time is given',
  }),
  event: choice('Which moment does `command` want to go back to, described by what happened then?', {
    incident: 'when a road incident, accident, closure or traffic jam on a highway happened (accident, road closure, congestion, when the road was blocked; 사고, 통제, 정체, 막혔을 때)',
    gate: 'when trucks were queued or congested at a site gate (gate congestion, when the gate was jammed, when trucks backed up; 게이트·정문 혼잡, 정문 막혔을 때, 차가 밀렸을 때)',
    report: 'when a worker filed a field report about equipment, safety or cargo (field report, equipment failure, when someone got hurt; 현장 보고, 설비 고장, 사람 다쳤을 때)',
    vessel: 'when a shipping line sent a vessel delay notice (vessel delay notice, when the ship said it would be late; 선박 지연 통보, 배 늦는다고 했을 때)',
    driver: 'when a driver sent a message about a breakdown, delay or problem (driver message, when the driver called or got in touch; 기사 메시지, 기사가 연락했을 때)',
    none: 'no event is described',
  }),
  forklift: choice('Which forklift condition does `command` ask for?', {
    low_battery: 'low battery or needs charging (low battery, needs charging; 배터리 부족, 충전 필요)',
    working: 'currently working (working, busy; 작업 중)',
    idle: 'idle, not working (idle, waiting, sitting around; 대기, 놀고 있는)',
    any: 'no forklift condition',
  }),
}

export type CommandAnswer = Record<keyof typeof COMMAND_QUESTIONS, { choice: string; confidence: number }>

export async function interpretCommand(text: string) {
  const r = await judge().systemOne({ state: { command: text.slice(0, 300) }, questions: COMMAND_QUESTIONS })
  return { answers: r.answers as CommandAnswer, model: r.model, tokens: r.usage.input_tokens }
}

// ───────────────────────── B. 고객 배송 요청 메모

const DROP = {
  door: 'leave it in front of the door (doorstep, leave it at the door, by the door; 문 앞)',
  guard: 'leave it at the apartment security office (security office, guard office, concierge; 경비실)',
  locker: 'put it in the parcel locker (parcel locker, locker, unmanned locker; 무인택배함, 택배함, 무인함)',
  handover: 'hand it to the customer in person, e.g. the customer says they will receive it themselves (hand-over, hand it to me, I will receive it myself, in person; 직접 전달, 직접 받을게요, 대면 수령)',
  reschedule: 'do not deliver now; deliver on another day or time (another day, redelivery, deliver later; 다른 날, 재배송)',
  unspecified: 'the memo does not say where to leave it',
}

export const MEMO_QUESTIONS = {
  drop: choice(
    {
      question: 'Where does the customer want the parcel left in the normal case, according to `memo`?',
      rule: 'When the memo names a main place and a backup for when the main place is unavailable (if full, if not possible, if nobody is there, otherwise; 꽉 차면, 안 되면, 없으면), answer the main place.',
    },
    DROP,
  ),
  fallback: choice(
    'Does `memo` name a backup place to use only when the main place is unavailable (if full, if that does not work, instead if I am out, otherwise; 꽉 차면, 안 되면, 부재 시 대신)? Answer the backup place.',
    { ...DROP, unspecified: 'no backup place is named' },
  ),
  no_bell: noul('Does `memo` ask the driver not to ring the doorbell or knock?', {
    true: 'asks not to ring or knock, including shorthand such as no bell, don\'t ring, no knocking, do not press the doorbell, 벨X, 노크 금지, 초인종 누르지 마세요',
    false: 'no request about the doorbell or knocking',
  }),
  fragile: noul('Does `memo` say the contents are fragile or need careful handling?'),
  call_first: noul('Does `memo` ask the driver to call or text the customer?'),
}

export interface MemoAnswer {
  drop: string
  dropConfidence: number
  fallback: string
  noBell: number
  fragile: number
  callFirst: number
}

/** 여러 메모를 병렬로 해석한다(메모마다 한 요청, 질문 5개는 한 요청 안에서 동시에) */
export async function interpretMemos(memos: string[]): Promise<MemoAnswer[]> {
  return Promise.all(
    memos.map(async (m) => {
      if (!m.trim()) return { drop: 'unspecified', dropConfidence: 1, fallback: 'unspecified', noBell: 0, fragile: 0, callFirst: 0 }
      const r = await judge().systemOne({ state: { memo: m.slice(0, 300) }, questions: MEMO_QUESTIONS })
      const a = r.answers
      return {
        drop: a.drop.choice,
        dropConfidence: a.drop.confidence,
        fallback: a.fallback.choice,
        noBell: a.no_bell.noul,
        fragile: a.fragile.noul,
        callFirst: a.call_first.noul,
      }
    }),
  )
}

// ───────────────────────── C. 현장 이슈 보고 분류

export const REPORT_QUESTIONS = {
  category: choice('What kind of problem does `report` describe?', {
    equipment: 'equipment or machine fault (equipment failure: conveyor, dock, leveler, scanner, forklift, refrigeration unit; 설비 고장: 컨베이어, 도크, 레벨러, 스캐너, 지게차, 냉동기)',
    safety: 'a hazard that could hurt people (safety risk: slipping, falling objects, caught or trapped, injury; 안전 위험: 미끄러짐, 낙하, 끼임, 부상)',
    cargo: 'damaged, lost or wrong cargo found by staff (damaged, lost or misdelivered cargo; 화물 파손·분실·오배송)',
    delay: 'delay or congestion (delay, congestion, waiting; 지연, 정체, 대기)',
    customer: 'a complaint or request coming from a customer, even when it is about damaged goods (customer complaint or request; 고객 민원·요청)',
    other: 'not an operational problem (notices, small talk; 공지, 잡담 등)',
  }),
  severity: score('How urgent is `report` for the operations manager?', [
    'Information only, or unrelated to operations; no action needed',
    'Needs attention within the shift',
    'Urgent; handle within minutes',
    'Critical; people are at risk and work at that spot must stop now',
  ]),
  stop_work: noul('Must work at that spot stop immediately because people could be hurt, according to `report`?', {
    true: 'continuing could injure someone: spills, falling objects, trapped hands or gloves, an injured worker',
    false: 'no danger to people: equipment stopped or degraded, damaged goods, delays, complaints, notices',
  }),
}

export interface ReportAnswer {
  category: string
  categoryConfidence: number
  severity: number
  severityConfidence: number
  stopWork: number
}

export async function triageReports(reports: string[]): Promise<ReportAnswer[]> {
  return Promise.all(
    reports.map(async (t) => {
      const r = await judge().systemOne({ state: { report: t.slice(0, 400) }, questions: REPORT_QUESTIONS })
      const a = r.answers
      return {
        category: a.category.choice,
        categoryConfidence: a.category.confidence,
        severity: a.severity.score,
        severityConfidence: a.severity.confidence,
        stopWork: a.stop_work.noul,
      }
    }),
  )
}

// ───────────────────────── D. 리젝트(바코드 미인식) 재분류 + 특수 취급

export const TERMINALS = {
  IN: 'Incheon sub-terminal: addresses in Incheon (Incheon, Seo-gu Incheon, Daon Village, Daonmaeul; 인천광역시, 인천 서구, 다온마을)',
  DJ: 'Daejeon central hub: Daejeon and Chungcheong (Daejeon, Sejong, Chungnam, Chungbuk, Cheongju, Cheonan; 대전, 세종, 충남, 충북, 청주, 천안)',
  BS: 'Busan: Busan and Gyeongnam (Busan, Gimhae, Changwon, Yangsan, Gyeongnam; 부산, 김해, 창원, 양산, 경남)',
  DG: 'Daegu: Daegu and Gyeongbuk (Daegu, Gyeongbuk, Gumi, Pohang, Gyeongsan; 대구, 경북, 구미, 포항, 경산)',
  WJ: 'Wonju: Gangwon province (Gangwon, Wonju, Chuncheon, Gangneung; 강원, 원주, 춘천, 강릉)',
  GJ: 'Gwangju-si local delivery in Gyeonggi near the hub (Gwangju-si Gyeonggi, Gonjiam, Chowol, Opo; 경기 광주시, 곤지암, 초월, 오포)',
  unknown: 'The destination cannot be determined from `label` (unreadable or missing city)',
}

export const ADDRESS_QUESTIONS = {
  terminal: choice('Which delivery terminal should receive this parcel, based on the destination address in `label`?', TERMINALS),
  incomplete: noul('Is the address in `label` missing the city/district or too garbled to deliver without checking?'),
  fragile: noul('Does `item` describe something fragile that can break (glass, ceramics, eggs, electronics screens)?'),
  liquid: noul('Does `item` contain liquid that could leak (drinks, sauces, detergent, cosmetics liquid)?'),
  perishable: noul('Does `item` need cold storage (frozen or chilled food, fresh meat, fish, dairy)?'),
  battery: noul('Does `item` contain lithium batteries or other dangerous goods (power banks, aerosols, fuel)?'),
  irregular: noul('Is `item` a bulky or odd-shaped thing that cannot ride a parcel conveyor (bicycle, golf bag, long tube, tire, furniture)?'),
}

export interface AddressAnswer {
  terminal: string
  terminalConfidence: number
  incomplete: number
  fragile: number
  liquid: number
  perishable: number
  battery: number
  irregular: number
}

export async function resortParcels(items: { label: string; item: string }[]): Promise<AddressAnswer[]> {
  return Promise.all(
    items.map(async (p) => {
      const r = await judge().systemOne({ state: { label: p.label.slice(0, 200), item: p.item.slice(0, 120) }, questions: ADDRESS_QUESTIONS })
      const a = r.answers
      return {
        terminal: a.terminal.choice,
        terminalConfidence: a.terminal.confidence,
        incomplete: a.incomplete.noul,
        fragile: a.fragile.noul,
        liquid: a.liquid.noul,
        perishable: a.perishable.noul,
        battery: a.battery.noul,
        irregular: a.irregular.noul,
      }
    }),
  )
}

// ───────────────────────── E. 수입 컨테이너 적하목록 검토

export const MANIFEST_QUESTIONS = {
  dangerous: noul('Does `cargo.description` indicate dangerous goods (flammable liquids, lithium batteries, compressed gas, corrosives, explosives; often written with UN numbers or IMDG classes)?'),
  reefer: noul('Does `cargo.description` require temperature control in a refrigerated container (frozen or chilled food, fresh produce, vaccines)?'),
  mismatch: noul('Does `cargo.description` describe different goods from `cargo.declared`, so the declaration looks wrong?', {
    true: 'the description names goods of a different kind than the declared goods',
    false: 'the description is the same kind of goods as declared, just more specific',
  }),
}

export interface ManifestAnswer {
  dangerous: number
  reefer: number
  mismatch: number
}

export async function reviewManifests(items: { declared: string; description: string }[]): Promise<ManifestAnswer[]> {
  return Promise.all(
    items.map(async (c) => {
      const r = await judge().systemOne({ state: { cargo: { declared: c.declared.slice(0, 120), description: c.description.slice(0, 200) } }, questions: MANIFEST_QUESTIONS })
      const a = r.answers
      return { dangerous: a.dangerous.noul, reefer: a.reefer.noul, mismatch: a.mismatch.noul }
    }),
  )
}

// ───────────────────────── F. 교통·현장 돌발 상황 → 영향 구간(경로 판단은 코드)

export const LINKS = {
  hw_ic_gj: 'the highway between Icheon and Gonjiam (Icheon↔Gonjiam section, Yeongdong Expressway Icheon IC–Gonjiam IC; 이천↔곤지암 구간, 영동고속도로 이천IC~곤지암IC)',
  hw_gj_in: 'the highway between Gonjiam and Incheon, including the road to the Incheon sub-terminal (Gonjiam↔Incheon section, western capital area, Incheon-bound, the road to the Seo-gu Incheon sub-terminal or delivery terminal; 곤지암↔인천 구간, 수도권 서부, 인천 방향, 인천 서구 서브터미널·배송터미널 가는 길)',
  hw_gj_bs: 'the road between Gonjiam and the Busan port (Gonjiam↔Busan New Port section, southern road, southbound, Busan-bound; 곤지암↔부산신항 구간, 남쪽 방향)',
  hw_gj_ap: 'the highway between Gonjiam and Incheon Airport (Gonjiam↔Incheon Airport section, Airport Expressway, Yeongjong Bridge, airport-bound; 곤지암↔인천공항 구간, 공항고속도로·영종대교, 공항 방향)',
  hw_gj_dj: 'the highway between Gonjiam and Daejeon (Gonjiam↔Daejeon section, Jungbu Expressway, Gyeongbu Expressway, Daejeon-bound; 곤지암↔대전 구간, 중부고속도로·경부선, 대전 방향)',
  town_gate: 'the main gate road of the Daonmaeul apartment complex (Daon Village main gate, complex entrance; 다온마을 정문, 단지 입구)',
  port_crane: 'crane work at the Busan New Port terminal (Busan New Port cranes, quay crane work; 부산신항 크레인·안벽 작업)',
  none: 'none of these places',
}

export const INCIDENT_QUESTIONS = {
  link: choice('Which part of the delivery network does `incident` affect?', LINKS),
  impact: score('How much does `incident` slow our trucks or work at the affected place?', [
    'No effect: traffic is normal, the problem was cleared, or it happens somewhere we do not operate',
    'Minor slowdown: light congestion, a few minutes late',
    'Heavy slowdown: some lanes closed, speed or work restrictions, 20 or more minutes late',
    'Fully blocked: road closed to all vehicles, no entry, or work stopped',
  ]),
}

export interface IncidentAnswer {
  link: string
  linkConfidence: number
  impact: number
  impactConfidence: number
}

export async function readIncident(text: string): Promise<IncidentAnswer> {
  const r = await judge().systemOne({ state: { incident: text.slice(0, 300) }, questions: INCIDENT_QUESTIONS })
  const a = r.answers
  return { link: a.link.choice, linkConfidence: a.link.confidence, impact: a.impact.score, impactConfidence: a.impact.confidence }
}

// ───────────────────────── G. 고객 문의(채팅 한 줄) → 의도 + 처리에 필요한 값(코드가 실제 처리)
// 의도마다 필요한 값을 미리 함께 묻는다(서로 독립인 질문은 한 요청에서 동시에 답한다). 코드는 고른 의도에 해당하는 값만 쓴다.

export const INQUIRY_QUESTIONS = {
  intent: choice('What does the customer want from the parcel delivery company in `message`?', {
    where_is: 'asks where the parcel is now or when it will arrive (where is it, when will it come, what time will it arrive, it has not arrived yet; 어디쯤, 언제 와요, 몇 시 도착, 아직 안 왔어요)',
    change_drop: 'wants today\'s delivery left at a different place: security office, parcel locker, the door, or handed over in person (please leave it at the security office, parcel locker, leave it at the door, I will take it myself; 경비실에 맡겨 주세요, 택배함, 문 앞에 두세요, 직접 받을게요)',
    reschedule: 'wants the delivery on another day or later time because nobody can receive it now (tomorrow, weekend, again this evening, away on a business trip; 내일, 주말, 저녁에 다시, 출장)',
    return: 'wants to send the item back, get a refund, exchange it, or have it picked up (return, refund, exchange, pickup; 반품, 환불, 교환, 회수)',
    complaint: 'complains about damage, a wrong or missing item, a parcel marked delivered but not received, or rude service (damaged, broken, lost, rude; 파손, 깨짐, 분실, 불친절)',
    contact_driver: 'wants the driver\'s contact or wants a message passed to the driver (driver\'s number, please tell the driver; 기사님 연락처, 기사님께 전해 주세요)',
    other: 'something else: greetings, business hours, unrelated questions',
  }),
  drop: choice(
    {
      question: 'If `message` asks to leave the parcel somewhere, which place does the customer finally want?',
      rule: 'When a place is mentioned only to reject it (not the security office, I do not want it at the door; 경비실 말고, 문 앞은 싫어요), answer the other place.',
    },
    {
      door: 'in front of the door (doorstep, at the door; 문 앞)',
      guard: 'the apartment security office (security office, guard office; 경비실)',
      locker: 'the unmanned parcel locker (parcel locker, locker; 무인택배함, 택배함)',
      handover: 'hand it over in person, possibly after a call (I will receive it myself, hand it to me; 직접 받을게요)',
      unspecified: 'no place is asked for',
    },
  ),
  when: choice('If `message` asks for a later delivery, when does the customer want it?', {
    tonight: 'later today or this evening (this evening, tonight, later today; 저녁에, 오늘 늦게)',
    tomorrow: 'tomorrow (tomorrow; 내일)',
    weekend: 'on the weekend (weekend, Saturday, Sunday; 주말, 토요일, 일요일)',
    unspecified: 'no time is given',
  }),
  reason: choice('If `message` is about a return or a complaint, what is the main reason?', {
    changed_mind: 'simple change of mind: ordered by mistake, no longer needed, or the right product arrived but the customer does not like its color or look (changed my mind, ordered by mistake, the color is darker than I expected; 단순 변심, 주문 실수, 생각보다 색이 어두워요)',
    size: 'size or fit does not suit (size, does not fit, hurts my feet; 사이즈, 발이 아파요)',
    damaged: 'arrived damaged or broken (damaged, broken, dented or crushed, wet; 파손, 깨짐, 찌그러짐, 젖음)',
    wrong_item: 'a different product, color or model than the one ordered arrived (wrong product, color or model; 주문과 다른 상품·색상·모델)',
    defective: 'the product does not work or has a defect (defective, will not turn on, broken; 불량, 안 켜져요, 고장)',
    late: 'delivery was too late (late delivery; 배송 지연)',
    other: 'another reason or no reason given',
  }),
  unopened: noul('Does `message` say the item is still unopened, unused or in its original packaging?'),
  upset: noul('Is the customer in `message` angry or strongly frustrated?', {
    true: 'clearly angry or demanding: blame, threats, many exclamation marks, "what are you going to do about this", "어떻게 하실 거예요"',
    false: 'calm or only mildly inconvenienced, including polite requests',
  }),
}

export interface InquiryAnswer {
  intent: string
  intentConfidence: number
  drop: string
  dropConfidence: number
  when: string
  reason: string
  reasonConfidence: number
  unopened: number
  upset: number
}

export async function readInquiries(messages: string[]): Promise<InquiryAnswer[]> {
  return Promise.all(
    messages.map(async (m) => {
      const r = await judge().systemOne({ state: { message: m.slice(0, 200) }, questions: INQUIRY_QUESTIONS })
      const a = r.answers
      return {
        intent: a.intent.choice,
        intentConfidence: a.intent.confidence,
        drop: a.drop.choice,
        dropConfidence: a.drop.confidence,
        when: a.when.choice,
        reason: a.reason.choice,
        reasonConfidence: a.reason.confidence,
        unopened: a.unopened.noul,
        upset: a.upset.noul,
      }
    }),
  )
}

// ───────────────────────── H. 반품 신청 사유 → 사유 · 미개봉 · 운송 중 파손(처리 방법은 코드가 정한다)

export const RETURN_QUESTIONS = {
  reason: INQUIRY_QUESTIONS.reason,
  unopened: INQUIRY_QUESTIONS.unopened,
  carrier_damage: noul('Does `reason_text` suggest the damage happened during delivery (crushed or wet box, broken on arrival) rather than a product defect?', {
    true: 'the box or item was crushed, wet, torn or broken when it arrived',
    false: 'no damage, or the product itself is faulty (does not turn on, does not charge)',
  }),
}

export interface ReturnAnswer {
  reason: string
  reasonConfidence: number
  unopened: number
  carrierDamage: number
}

export async function readReturns(texts: string[]): Promise<ReturnAnswer[]> {
  return Promise.all(
    texts.map(async (t) => {
      const r = await judge().systemOne({ state: { reason_text: t.slice(0, 200) }, questions: RETURN_QUESTIONS })
      const a = r.answers
      return { reason: a.reason.choice, reasonConfidence: a.reason.confidence, unopened: a.unopened.noul, carrierDamage: a.carrier_damage.noul }
    }),
  )
}

// ───────────────────────── I. 냉동탑차 기사·센서 메시지 → 냉동기 고장 · 문 문제 · 회복 중 · 변질 위험(조치는 코드가 온도 기준과 함께 정한다)

export const COLD_QUESTIONS = {
  cooling_failure: noul('Does `message` indicate the refrigeration unit itself is failing or not cooling (strange noise, fan not spinning, warning light, temperature keeps rising)?', {
    true: 'the cooling machine is broken or not producing cold air',
    false: 'the machine works; the problem is something else, or the message reports normal operation or recovery',
  }),
  door_issue: noul('Does `message` say a cargo door is not fully closed, a seal is damaged, or outside air is leaking in?'),
  recovering: noul('Does `message` say the temperature already went back to normal or is coming back down?'),
  risk: score('Given `message` and the sensor `reading`, how likely is the chilled or frozen food to spoil?', [
    'No risk: the temperature is within range and the unit works',
    'Low risk: a short rise that is already recovering',
    'Moderate risk: the temperature is above the limit or the unit may be failing',
    'High risk: the unit has failed and the temperature is well above the limit',
  ]),
}

export interface ColdAnswer {
  coolingFailure: number
  doorIssue: number
  recovering: number
  risk: number
  riskConfidence: number
}

export async function readColdMessages(items: { message: string; mode: string; setpoint: number; current: number; limit: number }[]): Promise<ColdAnswer[]> {
  return Promise.all(
    items.map(async (it) => {
      const r = await judge().systemOne({
        state: { message: it.message.slice(0, 200), reading: { cargo: it.mode, setpoint_c: it.setpoint, current_c: Math.round(it.current * 10) / 10, limit_c: it.limit } },
        questions: COLD_QUESTIONS,
      })
      const a = r.answers
      return { coolingFailure: a.cooling_failure.noul, doorIssue: a.door_issue.noul, recovering: a.recovering.noul, risk: a.risk.score, riskConfidence: a.risk.confidence }
    }),
  )
}

// ───────────────────────── J. 수입 신고 품목 분류(HS 류) — 상세 설명과 신고 품명을 각각 분류해 코드가 비교한다

const HS_OPTIONS = {
  '02': 'Ch.02 meat: beef, pork, chicken, chilled or frozen',
  '03': 'Ch.03 fish and seafood: shrimp, fish, squid',
  '08': 'Ch.08 edible fruit and nuts: bananas, citrus, nuts',
  '09': 'Ch.09 coffee, tea and spices',
  '21': 'Ch.21 food preparations and dietary supplements: vitamins, protein powder, general groceries',
  '24': 'Ch.24 tobacco and cigarettes',
  '28': 'Ch.28 inorganic chemicals and industrial gases: nitrogen, compressed gas cylinders',
  '30': 'Ch.30 pharmaceutical products: medicines, vaccines',
  '32': 'Ch.32 paints, varnishes, inks',
  '33': 'Ch.33 cosmetics, perfume, skin care, lipstick',
  '34': 'Ch.34 soap, detergents, cleaning and household sprays',
  '40': 'Ch.40 rubber products and tires',
  '61': 'Ch.61-62 clothing and apparel, knitted or woven, new or used',
  '64': 'Ch.64 footwear: shoes, sneakers, boots',
  '73': 'Ch.73 articles of iron or steel: cookware, kitchenware',
  '85': 'Ch.85 electrical machinery and electronics: TVs, phones, lithium batteries',
  '87': 'Ch.87 vehicles and vehicle parts: brake pads, auto parts, machine parts for cars',
  '94': 'Ch.94 furniture, lighting, bedding',
  '95': 'Ch.95 toys, games and sports equipment',
  mixed: 'many different consumer goods mixed in one shipment, such as consolidated online-shopping parcels',
  other: 'none of these chapters fits',
}

export const HS_QUESTIONS = {
  chapter: choice('Which customs tariff chapter (HS) best fits the goods actually described in `cargo.description`?', HS_OPTIONS),
  declared_chapter: choice('Which customs tariff chapter (HS) best fits the goods name the importer declared in `cargo.declared` (written in Korean or English)?', HS_OPTIONS),
  personal: noul('Is `cargo.description` a consolidated shipment of online-shopping parcels bought by individual consumers?'),
}

export interface HsAnswer {
  chapter: string
  chapterConfidence: number
  declaredChapter: string
  declaredConfidence: number
  personal: number
}

export async function classifyHs(items: { declared: string; description: string }[]): Promise<HsAnswer[]> {
  return Promise.all(
    items.map(async (c) => {
      const r = await judge().systemOne({ state: { cargo: { declared: c.declared.slice(0, 120), description: c.description.slice(0, 200) } }, questions: HS_QUESTIONS })
      const a = r.answers
      return { chapter: a.chapter.choice, chapterConfidence: a.chapter.confidence, declaredChapter: a.declared_chapter.choice, declaredConfidence: a.declared_chapter.confidence, personal: a.personal.noul }
    }),
  )
}

// ───────────────────────── K. 주소 정정: 코드가 좁힌 후보 중 이 주소가 가리키는 곳 + 동·호수 누락

export interface AddrAnswer {
  stop: string
  confidence: number
  unitMissing: number
}

export async function fixAddresses(items: { label: string; candidates: { id: string; desc: string }[] }[]): Promise<AddrAnswer[]> {
  return Promise.all(
    items.map(async (it) => {
      // 후보는 요청마다 다르다: 코드가 고른 후보 + "해당 없음"
      const options: Record<string, string> = {}
      for (const c of it.candidates) options[c.id] = c.desc
      options.none = 'none of these places, or the address could mean more than one of them (for example only a unit number without the building)'
      const r = await judge().systemOne({
        state: { label: it.label.slice(0, 120) },
        questions: {
          stop: choice(
            {
              question: 'Which delivery place does the handwritten or mistyped address in `label` refer to?',
              rule: 'Typos (one wrong or missing letter such as Vila for Villa, Casle for Castle, 빌리 for 빌라 or 쓸 for 슬, letter O for zero), abbreviations (APT, Bldg), old complex names and spacing errors still point to that one place. Answer none only when the building cannot be told apart, for example a unit number with no building.',
            },
            options,
          ),
          unit_missing: noul('Is the unit number (unit or apt no. such as #1204, 호수; or the floor for a villa) missing from `label`, so the driver would not know which door?', {
            true: 'no unit number or floor is written, e.g. only the building name or building number',
            false: 'a unit number or floor is written, or the place is a shop or a parcel locker that needs no unit',
          }),
        },
      })
      const a = r.answers
      return { stop: a.stop.choice, confidence: a.stop.confidence, unitMissing: a.unit_missing.noul }
    }),
  )
}

// ───────────────────────── L. 물량 공지 → 행사 종류 · 규모 · 냉장/수입/날씨 영향(배수 계산은 코드)

export const NOTICE_QUESTIONS = {
  event: choice('What kind of upcoming volume event does the operations notice `notice` announce?', {
    chuseok: 'the Chuseok (Korean Thanksgiving, harvest festival; 추석, 한가위) holiday gift season',
    seollal: 'the Lunar New Year (Seollal, Lunar New Year; 설, 설날) holiday gift season',
    black_friday: 'an overseas shopping festival with a surge of direct purchases from abroad (Black Friday, Singles\' Day, 11.11, overseas direct purchase, cross-border shopping; 블랙프라이데이, 광군제, 해외 직구)',
    monsoon: 'heavy rain, a typhoon or monsoon weather that slows operations (monsoon, rainy season, typhoon, heavy rain, downpour; 장마, 태풍, 폭우)',
    promo: 'a big sale or promotion by a domestic online shopping mall',
    none: 'no unusual volume event is coming, including when an event has just ended and volume returns to normal',
  }),
  scale: score('How much larger than usual will parcel volume be, according to `notice`?', [
    'About the same as usual, or no volume change is mentioned',
    'Somewhat more: about 1.3 times, 20 to 40 percent more',
    'Much more: about 1.8 times, 60 to 90 percent more',
    'More than double: two times or more',
  ]),
  cold: noul('Does `notice` say chilled or frozen goods (fresh food gift sets, meat, fruit) will increase?'),
  imports: noul('Does `notice` say imported goods or overseas direct-purchase parcels will increase?'),
  weather: noul('Does `notice` warn about bad weather that will slow trucks, deliveries or port cranes?'),
}

export interface NoticeAnswer {
  event: string
  eventConfidence: number
  scale: number
  cold: number
  imports: number
  weather: number
}

export async function readNotice(text: string): Promise<NoticeAnswer> {
  const r = await judge().systemOne({ state: { notice: text.slice(0, 400) }, questions: NOTICE_QUESTIONS })
  const a = r.answers
  return { event: a.event.choice, eventConfidence: a.event.confidence, scale: a.scale.score, cold: a.cold.noul, imports: a.imports.noul, weather: a.weather.noul }
}

// ───────────────────────── M. 입고 검수 메모 → 파손 · 수량 불일치 · 들기 위험 · 라벨 불량(처리 순서·보류 시간은 코드)

export const QC_QUESTIONS = {
  damaged: noul('Does the receiving inspection note `note` report damaged goods or packaging (torn wrap, wet or crushed boxes)?', {
    true: 'some goods or boxes are damaged, torn, wet or crushed',
    false: 'no damage is reported, including notes that say the outside looks fine or only mention a label',
  }),
  mismatch: noul('Does `note` say the counted quantity differs from the quantity on the shipping document?'),
  unsafe: noul('Does `note` say the pallet is unsafe to lift or move as it is (broken pallet board, leaning or collapsing stack)?', {
    true: 'a broken pallet or a leaning, unstable stack that must be fixed before a forklift lifts it',
    false: 'the pallet can be handled normally',
  }),
  label: noul('Does `note` say the label or barcode cannot be read and must be replaced?', {
    true: 'the barcode cannot be scanned or the label is unreadable',
    false: 'the label scans fine, even if it is slightly wrinkled, or labels are not mentioned',
  }),
}

export interface QcAnswer {
  damaged: number
  mismatch: number
  unsafe: number
  label: number
}

export async function readQcNotes(notes: string[]): Promise<QcAnswer[]> {
  return Promise.all(
    notes.map(async (n) => {
      const r = await judge().systemOne({ state: { note: n.slice(0, 200) }, questions: QC_QUESTIONS })
      const a = r.answers
      return { damaged: a.damaged.noul, mismatch: a.mismatch.noul, unsafe: a.unsafe.noul, label: a.label.noul }
    }),
  )
}

// ───────── ⑮ 기사 메시지(경로 관리 영상 분석 2순위)
// 기사가 관제에 보낸 짧은 메시지에서 사유·운행 불가·지연 정도·통화 요청을 판단한다. 조치(이관 제안·도착 예정 조정·관제사 확인)는 코드.

export const DRIVER_REASONS = {
  breakdown: 'a vehicle problem: flat tire, engine or warning light, battery, broken refrigeration unit',
  accident: "the driver's own truck was in an accident or collision (not a near miss, and not someone else's accident ahead)",
  traffic: "slow or blocked roads: congestion, someone else's accident ahead, a closed road, construction, a detour or bad weather",
  health: 'the driver feels sick, is injured or is too tired to keep driving safely',
  break: 'a planned meal, rest or restroom stop',
  customer: 'waiting at a stop: for a customer, a dock, loading or paperwork',
  other: 'anything else, including a near miss with no harm, or no problem at all',
}

export const DRIVER_QUESTIONS = {
  reason: choice('What is the main reason the truck driver gives in `message` for a delay or a problem on this trip?', DRIVER_REASONS),
  cannot_continue: noul('Does `message` say the driver cannot finish this trip or the remaining deliveries?', {
    true: 'the driver cannot finish: the truck cannot move, or the driver says they cannot drive or deliver any more (I can\'t do this, I don\'t think I can finish the route, please send a relief driver; 못 하겠다, 못 돌 것 같다, 교대 부탁)',
    false: 'the driver can still continue, even if late',
  }),
  delay: score('How long a delay does `message` suggest for the rest of the trip?', [
    'No delay or under 10 minutes',
    'About 10 to 30 minutes',
    'About 30 minutes to 1 hour',
    'More than 1 hour, or stopped for an unknown long time',
  ]),
  call: noul('Does `message` ask the control center to phone or contact the driver?', {
    true: 'the driver asks to be phoned or contacted (please call me, contact me, give me a call; 전화 주세요, 연락 주세요, 전화 한 통 부탁드려요)',
    false: 'no request for a phone call; asking for something else, such as a check, does not count',
  }),
}

export interface DriverAnswer {
  reason: string
  reasonConfidence: number
  cannotContinue: number
  delay: number
  delayConfidence: number
  call: number
}

export async function readDriverMessages(texts: string[]): Promise<DriverAnswer[]> {
  return Promise.all(
    texts.map(async (t) => {
      const r = await judge().systemOne({ state: { message: t.slice(0, 240) }, questions: DRIVER_QUESTIONS })
      const a = r.answers
      return { reason: a.reason.choice, reasonConfidence: a.reason.confidence, cannotContinue: a.cannot_continue.noul, delay: a.delay.score, delayConfidence: a.delay.confidence, call: a.call.noul }
    }),
  )
}

// ───────── ⑯ 선사 지연 통보(항만 관제 영상 분석 2순위)
// 선사가 보낸 입항 지연 통보에서 지연 정도·원인·확정 여부·기항 취소를 판단한다. 선석 일정 조정은 코드.

export const VESSEL_CAUSES = {
  weather: 'bad weather at sea or at a port: typhoon, strong wind, fog, high waves',
  mechanical: 'a problem with the ship itself: engine, inspection, repair, crew',
  congestion: 'congestion or waiting at a previous port or at this port',
  schedule: 'a planned schedule change by the shipping line',
  other: 'anything else, or no delay is mentioned',
}

export const VESSEL_QUESTIONS = {
  delay: score('How late will the ship arrive at our port according to `notice`?', [
    'On time, or less than 1 hour late',
    'About 1 to 3 hours late',
    'About 3 to 6 hours late',
    'More than 6 hours late, or the arrival time is unknown',
  ]),
  cause: choice('What is the main cause of the delay in `notice`?', VESSEL_CAUSES),
  confirmed: noul('Is the new arrival time in `notice` stated as confirmed, rather than possible, expected or still to be decided?', {
    true: 'the delay or new time is fixed or confirmed (confirmed, fixed, final; 확정)',
    false: 'the delay is only possible, expected, under review or not yet decided (expected, possible, likely, under review, TBD; 예정·가능·검토 중)',
  }),
  skip: noul('Does `notice` say the ship will skip our port or cancel this port call?'),
}

export interface VesselAnswer {
  delay: number
  delayConfidence: number
  cause: string
  confirmed: number
  skip: number
}

export async function readVesselNotices(texts: string[]): Promise<VesselAnswer[]> {
  return Promise.all(
    texts.map(async (t) => {
      const r = await judge().systemOne({ state: { notice: t.slice(0, 300) }, questions: VESSEL_QUESTIONS })
      const a = r.answers
      return { delay: a.delay.score, delayConfidence: a.delay.confidence, cause: a.cause.choice, confirmed: a.confirmed.noul, skip: a.skip.noul }
    }),
  )
}
