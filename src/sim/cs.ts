// 고객 응대: "내 택배 어디쯤?" 조회, 고객 문의, 반품·회수(역물류).
//  - 문의: 고객이 쓴 한 줄을 AI가 읽어 의도(조회·수령 장소 변경·배송일 변경·반품·민원·기사 연락)와
//    필요한 값(맡길 곳·날짜·반품 사유·미개봉·화남)을 고른다. 실제 처리는 코드가 시뮬레이션 상태로 한다.
//    AI를 끄면 낱말 규칙으로 고른다.
//  - 반품: 접수 → 그 동을 도는 1톤 배송차가 배송하면서 회수 → 인천 서브 입고 → 간선(11톤 회송차)으로 곤지암 →
//    반품 검수대에서 처리(재입고·리퍼·판매자 반송·폐기). 각 단계는 실제 차량이 움직일 때 넘어간다.
import type { Sim, Vehicle } from './sim'
import { SPEEDUP } from './clock'
import { STOPS, VARIANTS } from './sites'
import { mulberry32 } from './data'
import { L, LL, plural } from '../i18n'

const R = mulberry32(5150)
const pick = <T,>(a: readonly T[]) => a[Math.floor(R() * a.length)]

export type Intent = 'where_is' | 'change_drop' | 'reschedule' | 'return' | 'complaint' | 'contact_driver' | 'other'
export type ReturnReason = 'changed_mind' | 'size' | 'damaged' | 'wrong_item' | 'defective' | 'late' | 'other'
export type Disposition = 'restock' | 'refurb' | 'seller' | 'dispose'

export const INTENT_LABEL: Record<Intent, string> = {
  where_is: L('배송 조회', 'Tracking'),
  change_drop: L('수령 장소 변경', 'Change drop-off'),
  reschedule: L('배송일 변경', 'Reschedule'),
  return: L('반품·교환', 'Return · exchange'),
  complaint: L('민원', 'Complaint'),
  contact_driver: L('기사 연락', 'Contact driver'),
  other: L('기타', 'Other'),
}
export const REASON_LABEL: Record<ReturnReason, string> = {
  changed_mind: L('단순 변심', 'Changed mind'),
  size: L('사이즈·착용감', 'Size · fit'),
  damaged: L('파손', 'Damaged'),
  wrong_item: L('오배송·다른 상품', 'Wrong item'),
  defective: L('불량·하자', 'Defective'),
  late: L('배송 지연', 'Late delivery'),
  other: L('기타', 'Other'),
}
export const DISPOSITION_LABEL: Record<Disposition, string> = {
  restock: L('재입고(A급)', 'Restock (grade A)'),
  refurb: L('리퍼(B급) 판매', 'Sell as refurb (grade B)'),
  seller: L('판매자 반송', 'Return to seller'),
  dispose: L('폐기', 'Dispose'),
}
const DROP_LABEL: Record<string, string> = { door: L('문 앞', 'Doorstep'), guard: L('경비실', 'Security office'), locker: L('무인택배함', 'Parcel locker'), handover: L('직접 전달', 'Hand-over') }
const WHEN_LABEL: Record<string, string> = { tonight: L('오늘 저녁', 'this evening'), tomorrow: L('내일', 'tomorrow'), weekend: L('이번 주말', 'this weekend'), unspecified: L('다음 배송일', 'on the next delivery day') }

/** AI 응답(서버 /api/ai/inquiry 와 같은 모양) */
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

/** AI 응답(서버 /api/ai/return) */
export interface ReturnAnswer {
  reason: string
  reasonConfidence: number
  unopened: number
  carrierDamage: number
}

export interface Item {
  name: string
  cat: 'food' | 'chilled' | 'apparel' | 'shoes' | 'electronics' | 'beauty' | 'living'
}

const ITEMS: Item[] = [
  { name: L('니트 원피스', 'Knit dress'), cat: 'apparel' },
  { name: L('러닝화 270mm', 'Running shoes 270mm'), cat: 'shoes' },
  { name: L('무선 이어폰', 'Wireless earbuds'), cat: 'electronics' },
  { name: L('전기포트', 'Electric kettle'), cat: 'electronics' },
  { name: L('수분 크림 세트', 'Moisturizing cream set'), cat: 'beauty' },
  { name: L('그릭요거트 6입', 'Greek yogurt × 6'), cat: 'chilled' },
  { name: L('냉동 만두 2kg', 'Frozen dumplings 2kg'), cat: 'chilled' },
  { name: L('생수 2L × 6입', 'Bottled water 2L × 6'), cat: 'food' },
  { name: L('견과 선물세트', 'Nut gift set'), cat: 'food' },
  { name: L('극세사 이불', 'Microfiber comforter'), cat: 'living' },
  { name: L('주방 수납장', 'Kitchen cabinet'), cat: 'living' },
  { name: L('어린이 운동화', "Kids' sneakers"), cat: 'shoes' },
]
const NAMES = LL(
  ['김*진', '이*우', '박*현', '최*나', '정*호', '한*율', '윤*서', '오*민', '서*아', '장*혁', '조*린', '임*준'],
  ['Kim *-jin', 'Lee *-u', 'Park *-hyeon', 'Choi *-na', 'Jeong *-ho', 'Han *-yul', 'Yun *-seo', 'Oh *-min', 'Seo *-a', 'Jang *-hyeok', 'Jo *-rin', 'Lim *-jun'],
)

/** 자동으로 들어오는 문의(의도별 표현). 일부는 일부러 헷갈리게 썼다 */
export const INQUIRY_POOL: { text: string; hint: Intent }[] = LL([
  { text: '제 택배 지금 어디쯤 왔어요?', hint: 'where_is' },
  { text: '오늘 온다던 택배 몇 시쯤 도착하나요', hint: 'where_is' },
  { text: '배송 출발 문자 받았는데 언제 와요? 나갔다 와도 될지 궁금해서요', hint: 'where_is' },
  { text: '아직도 안 왔네요.. 오늘 받을 수 있는 거 맞죠?', hint: 'where_is' },
  { text: '오늘 집에 아무도 없어서 경비실에 맡겨 주세요', hint: 'change_drop' },
  { text: '문 앞 말고 택배함에 넣어 주실 수 있을까요?', hint: 'change_drop' },
  { text: '경비실 말고 그냥 문 앞에 두고 가 주세요', hint: 'change_drop' },
  { text: '직접 받을게요. 도착하기 전에 전화 한 통만 주세요', hint: 'change_drop' },
  { text: '이번 주 내내 출장이라 주말에 받을 수 있을까요?', hint: 'reschedule' },
  { text: '오늘 말고 내일 배송해 주세요', hint: 'reschedule' },
  { text: '지금 집에 없는데 저녁에 다시 와 주실 수 있나요?', hint: 'reschedule' },
  { text: '사이즈가 안 맞아서 반품하고 싶어요. 포장도 안 뜯었어요', hint: 'return' },
  { text: '주문 잘못해서 환불 받고 싶은데 회수는 언제 오나요? 박스 그대로예요', hint: 'return' },
  { text: '받아 보니 다른 색상이 왔어요. 교환해 주세요', hint: 'return' },
  { text: '전원이 안 켜져요. 불량 같은데 반품 접수해 주세요', hint: 'return' },
  { text: '상자가 찌그러져서 왔고 안에 병이 깨져 있어요. 어떻게 하실 거예요?', hint: 'complaint' },
  { text: '배송 완료라고 떴는데 문 앞에 아무것도 없어요', hint: 'complaint' },
  { text: '기사님이 너무 불친절하셨어요. 확인 부탁드립니다', hint: 'complaint' },
  { text: '기사님 연락처 좀 알려 주세요', hint: 'contact_driver' },
  { text: '기사님께 공동현관에서 1203 호출하시면 열어 드린다고 전해 주세요', hint: 'contact_driver' },
  { text: '안녕하세요~ 고객센터 운영 시간이 어떻게 되나요?', hint: 'other' },
], [
  { text: "Where's my package right now?", hint: 'where_is' },
  { text: "What time will the package that's due today get here?", hint: 'where_is' },
  { text: "Got the out-for-delivery text. When will it come? Wondering if it's OK to step out for a bit", hint: 'where_is' },
  { text: "Still hasn't arrived.. I'll get it today, right?", hint: 'where_is' },
  { text: "Nobody's home today, so please leave it at the security office", hint: 'change_drop' },
  { text: 'Instead of the doorstep, could you put it in the parcel locker?', hint: 'change_drop' },
  { text: 'Not the security office, just leave it at my door please', hint: 'change_drop' },
  { text: "I'll take it in person. Just give me a call before you get here", hint: 'change_drop' },
  { text: "I'm on a business trip all week. Could I get it on the weekend?", hint: 'reschedule' },
  { text: 'Not today, please deliver it tomorrow', hint: 'reschedule' },
  { text: "I'm not home right now. Could you come back in the evening?", hint: 'reschedule' },
  { text: "The size doesn't fit, so I'd like to return it. I haven't even opened the packaging", hint: 'return' },
  { text: "I ordered the wrong thing and want a refund. When does the pickup come? It's still sealed", hint: 'return' },
  { text: 'Opened it and a different color came. Please exchange it', hint: 'return' },
  { text: "It won't turn on. Looks defective, please register a return", hint: 'return' },
  { text: 'The box arrived crushed and the bottle inside is broken. What are you going to do about it?', hint: 'complaint' },
  { text: "It says delivered, but there's nothing at my door", hint: 'complaint' },
  { text: 'The driver was really rude. Please look into it', hint: 'complaint' },
  { text: "Can I have the driver's phone number?", hint: 'contact_driver' },
  { text: "Please tell the driver to buzz 1203 at the building's shared entrance and I'll let them in", hint: 'contact_driver' },
  { text: "Hi~ What are your customer center's opening hours?", hint: 'other' },
])

/** 쇼핑몰 반품 신청서에 적힌 사유(고객 문장) */
export const RETURN_POOL: string[] = LL([
  '단순 변심이에요. 한 번도 안 입었고 택도 그대로 있어요',
  '두 번 신어 봤는데 발이 아파서 반품합니다',
  '택배 받았을 때부터 상자가 젖어 있었고 제품이 망가져 있었어요',
  '주문한 거랑 다른 모델이 왔어요. 뜯어 보고 알았어요',
  '배송이 너무 늦어서 필요 없어졌어요. 미개봉입니다',
  '충전이 안 되고 한쪽 소리가 안 나요',
  '생각보다 색이 어두워서요. 비닐도 안 뜯었습니다',
  '유통기한이 얼마 안 남은 제품이 왔어요',
], [
  "Just changed my mind. Never worn it once and the tags are still on",
  "Tried them on twice but they hurt my feet, so I'm returning them",
  'The box was already wet when the parcel came, and the product was wrecked',
  'A different model from the one I ordered came. Only found out after opening it',
  "Delivery was so late I don't need it anymore. It's unopened",
  "It won't charge and one side has no sound",
  "The color is darker than I expected. I haven't even torn the plastic wrap",
  'The product I got is close to its expiration date',
])

export interface Inquiry {
  id: number
  time: number
  customer: string
  /** 고객이 기다리는 택배(그 동을 도는 배송차와 정차지) */
  van: string
  stopId: string
  parcelNo: string
  item: Item
  text: string
  source: 'auto' | 'user'
  status: 'pending' | 'ready' | 'error'
  ai: InquiryAnswer | null
  by: 'ai' | 'rule'
  intent: Intent
  /** 코드가 실제로 한 일 */
  action: string
  /** 고객에게 보낸 답 */
  reply: string
  /** 상담원 연결이 필요한가(판단이 불확실하거나 화가 난 고객) */
  human: boolean
  ret?: number
}

export const RETURN_STEPS = [
  { label: L('반품 접수', 'Return requested'), sub: L('고객 앱·문의', 'Customer app · inquiry'), desc: L('고객이 앱이나 문의로 반품을 신청했습니다. AI가 사유 문장을 읽어 반품 사유(단순 변심·파손·오배송 등)와 미개봉 여부를 고릅니다(끄면 낱말 규칙).', 'The customer requested a return in the app or via an inquiry. AI reads the reason text and picks the return reason (changed mind, damaged, wrong item, etc.) and whether it is unopened (keyword rules when AI is off).') },
  { label: L('회수 배정', 'Pickup assigned'), sub: L('1톤 배송차', '1-ton delivery van'), desc: L('그 동을 도는 다음 1톤 배송차에 회수를 붙였습니다. 기사님은 배송하면서 같은 동에서 반품 상자를 함께 가져옵니다.', 'The pickup was added to the next 1-ton delivery van covering that building. The driver collects the return box from the same building while delivering.') },
  { label: L('회수 완료', 'Picked up'), sub: L('고객 문 앞', "Customer's doorstep"), desc: L('기사님이 고객 문 앞에서 반품 상자를 받아 차에 실었습니다. 회수 송장이 붙어 이제부터 반대 방향으로 이동합니다.', "The driver took the return box at the customer's door and loaded it. With a return label on, it now travels in the reverse direction.") },
  { label: L('서브 입고', 'Into sub-terminal'), sub: L('인천 서브터미널', 'Incheon Sub-terminal'), desc: L('배송차가 터미널로 돌아와 반품 상자를 내립니다. 반품은 정방향 택배와 섞이지 않게 반품 전용 롤테이너에 모읍니다.', "The van returns to the terminal and unloads the return box. Returns go into a dedicated roll cage so they don't mix with outbound parcels.") },
  { label: L('간선 회송', 'Linehaul back'), sub: L('인천 → 곤지암', 'Incheon → Gonjiam'), desc: L('곤지암으로 돌아가는 11톤 간선 차가 반품 롤테이너를 싣고 출발합니다(빈 차 회송을 활용).', 'An 11-ton linehaul truck heading back to Gonjiam leaves with the return roll cages (using the empty backhaul).') },
  { label: L('반품 검수', 'Return inspection'), sub: L('곤지암 반품 검수대', 'Gonjiam return desk'), desc: L('곤지암 반품 검수대에서 상자를 열어 상태를 확인합니다. 처리 방법은 코드가 정합니다: 미개봉이면 재입고, 개봉한 단순 변심은 리퍼, 불량·파손은 판매자 반송, 신선식품은 폐기.', 'At the Gonjiam return desk the box is opened and checked. Code decides what happens: unopened → restock, opened change of mind → refurb, defective or damaged → back to the seller, fresh food → disposal.') },
  { label: L('처리 완료', 'Done'), sub: L('재입고·반송·폐기', 'Restock · to seller · dispose'), desc: L('검수 결과대로 처리하고 고객에게 환불을 승인했습니다. 재입고 상품은 다음 윙바디로 이천 FC에 돌아가 다시 팔립니다.', 'Handled per the inspection result and the refund was approved. Restocked items go back to Icheon FC on the next wing-body truck to be sold again.') },
]

export interface ReturnReq {
  id: number
  no: string
  time: number
  customer: string
  stopId: string
  item: Item
  text: string
  status: 'pending' | 'ready' | 'error'
  ai: ReturnAnswer | null
  by: 'ai' | 'rule'
  reason: ReturnReason
  unopened: boolean
  carrierDamage: boolean
  stage: number
  times: (number | null)[]
  van: string | null
  truck: string | null
  disposition: Disposition | null
  note: string
  /** 검수 뒤 처리 완료까지 남은 시간 */
  timer: number
  inquiry?: number
}

// ───────────────────────── 낱말 규칙(AI를 끈 상태의 기본 판단)

export function ruleInquiry(text: string): InquiryAnswer {
  const t = text.replace(/\s+/g, '')
  // 영어 문장: 소문자 원문에 정규식(낱말 경계)으로
  const e = text.toLowerCase().replace(/[‘’]/g, "'")
  const has = (...w: (string | RegExp)[]) => w.some((x) => (typeof x === 'string' ? t.includes(x) : x.test(e)))
  let intent: Intent = 'other'
  if (has('반품', '환불', '교환', '회수', '취소', /\b(return|refund|exchange|pick-?\s?up|cancel)/)) intent = 'return'
  else if (has('파손', '깨져', '깨졌', '찌그러', '없어요', '분실', '불친절', '잘못왔', '다른상품', /\b(damaged|broken|crushed|dented|lost|missing|rude)\b|nothing (is |was )?(at|in front|here|there)|wrong item came|different product/)) intent = 'complaint'
  else if (has('내일', '주말', '저녁에', '다음에', '출장', /\b(tomorrow|weekend|tonight)\b|(in the|this) evening|another day|next time|business trip/)) intent = 'reschedule'
  else if (has('경비실', '택배함', '문앞', '직접받', /security office|\bguard|locker|\bdoor|in person/)) intent = 'change_drop'
  else if (has('연락처', '전해', '전달', '기사님께', /driver's (phone|number|contact)|phone number|contact (number|info)|(tell|let) the driver|pass (it|this) on/)) intent = 'contact_driver'
  else if (has('어디', '언제', '몇시', '도착', '조회', '안왔', /\b(where|when)\b|what time|arriv|\btrack|hasn't come|not here yet/)) intent = 'where_is'
  // 규칙은 앞에 나온 장소를 고른다("경비실 말고 문 앞"처럼 부정이 섞이면 틀린다)
  const drop = has('경비실', /security office|\bguard/) ? 'guard' : has('택배함', '무인함', /locker/) ? 'locker' : has('직접', /in person|hand it|hand-?over/) ? 'handover' : has('문앞', /\bdoor/) ? 'door' : 'unspecified'
  const when = has('주말', /weekend/) ? 'weekend' : has('내일', /tomorrow/) ? 'tomorrow' : has('저녁', /evening|tonight/) ? 'tonight' : 'unspecified'
  const reason = has('사이즈', '안맞', '발이', /\bsize\b|(doesn't|don't|didn't) fit|hurts? my feet|too (small|big|tight)/) ? 'size' : has('파손', '깨', '망가', '젖어', /\b(damaged|broken|crushed|cracked|smashed|wrecked|wet|soaked)\b/) ? 'damaged' : has('다른', '잘못', /\b(different|wrong)\b/) ? 'wrong_item' : has('불량', '안켜', '고장', '안되', /defective|faulty|won't (turn on|charge|work)|doesn't (turn on|charge|work)|not working/) ? 'defective' : has('늦어', '지연', /\b(late|delayed?)\b|took (so|too) long/) ? 'late' : has('변심', '마음', /changed my mind|change of mind|don't like/) ? 'changed_mind' : 'other'
  return { intent, intentConfidence: 1, drop, dropConfidence: 1, when, reason, reasonConfidence: 1, unopened: has('안뜯', '미개봉', '그대로', '안입', '포장도', /unopened|(haven't|never|not) (even )?(opened|torn|unwrapped|worn)|still sealed|tags are still on/) ? 1 : 0, upset: has('어떻게하실', '너무', '!!', /what are you going to do|how are you going to|really rude|so rude|unacceptable/) ? 1 : 0 }
}

export function ruleReturn(text: string): ReturnAnswer {
  const a = ruleInquiry(text)
  const t = text.replace(/\s+/g, '')
  return { reason: a.reason, reasonConfidence: 1, unopened: a.unopened, carrierDamage: /젖어|찌그러|박스가|상자가/.test(t) || /\b(wet|soaked|crushed|dented)\b|\bbox (was|came|arrived)/i.test(text) ? 1 : 0 }
}

// ───────────────────────── 고객 응대

export class CustomerService {
  inquiries: Inquiry[] = []
  returns: ReturnReq[] = []
  /** 반품 여정(하단 탭·따라가기)에서 따라가는 반품 */
  focus: ReturnReq | null = null
  stats = { inquiries: 0, auto: 0, human: 0, byIntent: {} as Record<string, number>, returns: 0, done: 0, byDisp: { restock: 0, refurb: 0, seller: 0, dispose: 0 } as Record<Disposition, number> }
  /** AI 판단 요청(연결돼 있으면 AI, 아니면 규칙으로 바로) */
  onInquiry: ((q: Inquiry) => void) | null = null
  onReturn: ((r: ReturnReq) => void) | null = null
  private nextInquiry = 6
  private nextReturn = 40
  private seq = 0
  private retSeq = 0

  constructor(private sim: Sim) {}

  /** 배송 중인(경로가 정해진) 다온마을 배송차와 아직 안 간 정차지 */
  private liveParcels() {
    const out: { v: Vehicle; stopId: string; idx: number }[] = []
    for (const v of this.sim.vehicles) {
      if (v.kind !== 'van' || v.home !== 'IN' || v.dest !== 'TW') continue
      v.stops.forEach((s, i) => {
        if (i >= v.stopIdx) out.push({ v, stopId: s.id, idx: i })
      })
    }
    return out
  }

  private tracking() {
    const d = () => String(Math.floor(R() * 10000)).padStart(4, '0')
    return `${d()}-${d()}-${d()}`
  }

  /** 고객 문의 하나를 만든다(자동 또는 화면에서 고객이 직접 쓴 것) */
  ask(text: string, target?: { van: string; stopId: string; parcelNo?: string; customer?: string; item?: Item }, source: 'auto' | 'user' = 'auto'): Inquiry | null {
    let van = target?.van
    let stopId = target?.stopId
    if (!van || !stopId) {
      const live = this.liveParcels()
      if (!live.length) return null
      const p = pick(live)
      van = p.v.id
      stopId = p.stopId
    }
    const q: Inquiry = {
      id: ++this.seq,
      time: this.sim.clock,
      customer: target?.customer ?? pick(NAMES),
      van,
      stopId,
      parcelNo: target?.parcelNo ?? this.tracking(),
      item: target?.item ?? pick(ITEMS),
      text: text.slice(0, 200),
      source,
      status: 'pending',
      ai: null,
      by: 'rule',
      intent: 'other',
      action: '',
      reply: '',
      human: false,
    }
    this.inquiries.unshift(q)
    if (this.inquiries.length > 40) this.inquiries.pop()
    this.stats.inquiries++
    if (this.onInquiry) this.onInquiry(q)
    else this.resolveInquiry(q, null)
    return q
  }

  /** 판단 결과(없으면 규칙)로 실제 처리한다. 정책은 코드가 쥔다 */
  resolveInquiry(q: Inquiry, a: InquiryAnswer | null) {
    const ans = a ?? ruleInquiry(q.text)
    q.ai = a
    q.by = a ? 'ai' : 'rule'
    q.status = 'ready'
    const intent = (Object.keys(INTENT_LABEL) as Intent[]).includes(ans.intent as Intent) ? (ans.intent as Intent) : 'other'
    q.intent = intent
    this.stats.byIntent[intent] = (this.stats.byIntent[intent] ?? 0) + 1
    const v = this.sim.vehicle(q.van)
    const stop = STOPS[q.stopId]
    const idx = v ? v.stops.findIndex((s) => s.id === q.stopId) : -1
    const done = !v || v.dest !== 'TW' || idx < 0 || idx < v.stopIdx
    // 의도가 불확실하면 상담원에게 넘긴다(코드가 정한 기준: 0.55)
    if (a && a.intentConfidence < 0.55) {
      q.human = true
      q.action = L(`의도 불확실(${INTENT_LABEL[intent]} ${a.intentConfidence.toFixed(2)}) → 상담원 연결`, `Intent unclear (${INTENT_LABEL[intent]} ${a.intentConfidence.toFixed(2)}) → human agent`)
      q.reply = L('문의 내용을 상담원이 직접 확인해 바로 연락드릴게요.', 'An agent will review your inquiry and contact you shortly.')
      this.stats.human++
      return
    }
    const eta = v && !done ? this.eta(v, q.stopId) : null
    switch (intent) {
      case 'where_is': {
        if (done) {
          q.action = L('배송 완료 확인', 'Delivery already completed')
          q.reply = L(`${stop?.label ?? ''} 배송을 마쳤어요. 문 앞·경비실·택배함을 확인해 주세요.`, `Delivery to ${stop?.label ?? ''} is done. Please check your doorstep, the security office and the parcel locker.`)
        } else {
          q.action = L(`위치 조회 → ${v!.id} · 앞에 ${idx - v!.stopIdx}곳 남음`, `Location lookup → ${v!.id} · ${idx - v!.stopIdx} ${plural(idx - v!.stopIdx, 'stop')} ahead`)
          const ahead = idx - v!.stopIdx
          q.reply = L(
            `${v!.driver} 기사님이 배송 중이에요. ${ahead ? `앞에 ${ahead}곳을 들른 뒤` : '다음 정차지가 고객님 동이에요.'} 약 ${eta?.min ?? '-'}분 후(${hhmm(eta?.clock ?? this.sim.clock)}쯤) 도착 예정입니다.`,
            `Driver ${v!.driver} is out delivering. ${ahead ? `After ${ahead} more ${plural(ahead, 'stop')}, it` : 'Your building is the next stop. It'} should arrive in about ${eta?.min ?? '-'} min (around ${hhmm(eta?.clock ?? this.sim.clock)}).`,
          )
        }
        break
      }
      case 'change_drop': {
        const drop = ans.drop in DROP_LABEL ? ans.drop : 'unspecified'
        if (done) {
          q.action = L('이미 배송 완료 → 변경 불가', "Already delivered → can't change")
          q.reply = L('이미 배송을 마쳐 장소를 바꿀 수 없어요. 불편하시면 다시 말씀해 주세요.', "It's already been delivered, so the drop-off spot can't be changed. Let us know if that's a problem.")
        } else if (drop === 'unspecified' || (a && a.dropConfidence < 0.6)) {
          q.human = true
          q.action = L('맡길 곳 불확실 → 기사에게 고객 통화 요청', 'Drop-off spot unclear → driver to call the customer')
          q.reply = L('어디에 두면 좋을지 기사님이 도착 전에 전화로 여쭤볼게요.', 'The driver will call you before arriving to ask where to leave it.')
        } else {
          const m = v!.memos[q.stopId]
          const plan = { drop, dropConfidence: 1, fallback: 'unspecified', noBell: 0, fragile: 0, callFirst: drop === 'handover' ? 1 : 0 }
          if (m) {
            m.text = q.text
            m.plan = plan
            m.status = 'ready'
          } else v!.memos[q.stopId] = { text: q.text, plan, status: 'ready' }
          q.action = L(`${v!.id} 정차지 메모 변경 → ${DROP_LABEL[drop]}`, `${v!.id} stop note changed → ${DROP_LABEL[drop]}`)
          q.reply = L(`${DROP_LABEL[drop]}${drop === 'handover' ? '로 바꾸고 도착 전에 연락드리도록' : '에 두도록'} 기사님께 전달했어요.`, `We've told the driver: ${DROP_LABEL[drop]}${drop === 'handover' ? ', with a call before arriving' : ''}.`)
        }
        break
      }
      case 'reschedule': {
        if (done) {
          q.action = L('이미 배송 완료', 'Already delivered')
          q.reply = L('이미 배송을 마쳤어요. 받으셨는지 확인 부탁드려요.', "It's already been delivered. Please check that you received it.")
        } else {
          const plan = { drop: 'reschedule', dropConfidence: 1, fallback: 'unspecified', noBell: 0, fragile: 0, callFirst: 0 }
          v!.memos[q.stopId] = { text: q.text, plan, status: 'ready' }
          const when = WHEN_LABEL[ans.when] ?? WHEN_LABEL.unspecified
          q.action = L(`${v!.id} 이번 배송에서 빼고 재배송 예약(${when})`, `${v!.id} dropped from this run · redelivery booked (${when})`)
          q.reply = L(`오늘은 배송하지 않고 ${when}에 다시 보내 드릴게요.`, `We won't deliver it today and will send it again ${when}.`)
        }
        break
      }
      case 'return': {
        const r = this.openReturn(q.text, q.stopId, q.item, q.customer, a ? { reason: ans.reason, reasonConfidence: ans.reasonConfidence, unopened: ans.unopened, carrierDamage: 0 } : null)
        r.inquiry = q.id
        q.ret = r.id
        q.action = L(`반품 접수 ${r.no} · 사유 ${REASON_LABEL[r.reason]}${r.unopened ? ' · 미개봉' : ''}`, `Return ${r.no} registered · reason ${REASON_LABEL[r.reason]}${r.unopened ? ' · unopened' : ''}`)
        q.reply = L(`반품을 접수했어요(회수 송장 ${r.no}). 그 동을 도는 배송 기사님이 다음 배송 때 상자를 가져갑니다.`, `Your return is registered (pickup label ${r.no}). The driver covering your building will collect the box on the next delivery.`)
        break
      }
      case 'complaint': {
        q.human = ans.upset > 0.5
        q.action = q.human ? L('민원 접수 · 화난 고객 → 상담원 즉시 연결', 'Complaint logged · upset customer → agent right away') : L('민원 접수 → 담당 부서 전달', 'Complaint logged → sent to the team in charge')
        q.reply = q.human ? L('불편을 드려 정말 죄송합니다. 상담원이 지금 바로 전화드리겠습니다.', "We're truly sorry for the trouble. An agent will call you right away.") : L('불편을 드려 죄송합니다. 확인 후 오늘 안에 연락드릴게요.', "Sorry for the trouble. We'll look into it and get back to you today.")
        if (q.human) this.stats.human++
        break
      }
      case 'contact_driver': {
        q.action = v && !done ? L(`${v.id} 기사 앱으로 메시지 전달`, `Message sent to ${v.id} driver app`) : L('담당 기사에게 메시지 전달', 'Message sent to the assigned driver')
        q.reply = L('기사님께 메시지를 전달했어요. 통화가 필요하면 안심번호 0507-1234-5678로 연결됩니다.', "We've passed your message to the driver. If you need to talk, you'll be connected through the safe number 0507-1234-5678.")
        break
      }
      default:
        q.action = L('일반 안내', 'General info')
        q.reply = L('고객센터는 평일 9시~18시에 운영해요. 택배 조회는 언제든 이 화면에서 하실 수 있어요.', 'The customer center is open weekdays 9:00–18:00. You can track your parcel on this screen anytime.')
    }
    if (!q.human) this.stats.auto++
  }

  /** 반품 접수 */
  openReturn(text: string, stopId: string, item: Item, customer: string, pre: ReturnAnswer | null = null): ReturnReq {
    const r: ReturnReq = {
      id: ++this.retSeq,
      no: `R-${String(70000 + this.retSeq * 37).slice(-5)}`,
      time: this.sim.clock,
      customer,
      stopId,
      item,
      text,
      status: 'pending',
      ai: null,
      by: 'rule',
      reason: 'other',
      unopened: false,
      carrierDamage: false,
      stage: 0,
      times: [this.sim.clock, null, null, null, null, null, null],
      van: null,
      truck: null,
      disposition: null,
      note: '',
      timer: 0,
    }
    this.returns.unshift(r)
    if (this.returns.length > 40) {
      const old = this.returns.pop()
      if (old && old === this.focus) this.focus = null
    }
    this.stats.returns++
    if (!this.focus || this.focus.stage >= 6) this.focus = r
    if (pre) this.resolveReturn(r, pre, true)
    else if (this.onReturn) this.onReturn(r)
    else this.resolveReturn(r, null)
    return r
  }

  resolveReturn(r: ReturnReq, a: ReturnAnswer | null, fromInquiry = false) {
    const ans = a ?? ruleReturn(r.text)
    r.ai = a
    r.by = a ? 'ai' : 'rule'
    r.status = 'ready'
    r.reason = (Object.keys(REASON_LABEL) as ReturnReason[]).includes(ans.reason as ReturnReason) ? (ans.reason as ReturnReason) : 'other'
    // 사유 판단이 불확실하면 '기타'로 두고 검수대에서 상태로 정한다(코드 기준 0.5)
    if (a && a.reasonConfidence < 0.5) r.reason = 'other'
    r.unopened = ans.unopened > 0.5
    r.carrierDamage = !fromInquiry && ans.carrierDamage > 0.5
  }

  private stage(r: ReturnReq, s: number) {
    if (s <= r.stage) return
    r.stage = s
    r.times[s] = this.sim.clock
  }

  // ───────────── 시뮬레이션 사건 훅(차량이 실제로 움직일 때 단계를 넘긴다)

  /** 배송차가 인천 서브에서 출발: 그 차가 도는 동의 반품을 회수로 붙인다 */
  onVanDepart(v: Vehicle) {
    const ids = new Set(v.stops.map((s) => s.id))
    for (const r of this.returns) if (r.stage === 0 && r.status === 'ready' && ids.has(r.stopId)) {
      r.van = v.id
      this.stage(r, 1)
    }
  }

  /** 배송차 기사가 그 동 문 앞에 닿음 */
  onStopVisit(v: Vehicle, stopId: string) {
    for (const r of this.returns) if (r.stage === 1 && r.van === v.id && r.stopId === stopId) this.stage(r, 2)
  }

  /** 배송차가 인천 서브로 돌아옴 */
  onVanBack(v: Vehicle) {
    for (const r of this.returns) {
      if (r.van !== v.id) continue
      if (r.stage === 2) this.stage(r, 3)
      // 회수 배정됐지만 그 정차지를 건너뛴 경우(재배송 등): 다음 차에 다시 붙인다
      else if (r.stage === 1) {
        r.stage = 0
        r.van = null
      }
    }
  }

  /** 인천 → 곤지암 간선 회송차 출발 */
  onTruckDepartIN(v: Vehicle) {
    for (const r of this.returns) if (r.stage === 3) {
      r.truck = v.id
      this.stage(r, 4)
    }
  }

  /** 회송차가 곤지암에 도착: 반품 검수대에서 처리 방법을 정한다(코드) */
  onTruckArriveGJ(v: Vehicle) {
    for (const r of this.returns) if (r.stage === 4 && r.truck === v.id) {
      this.stage(r, 5)
      this.inspect(r)
      r.timer = 18 + R() * 14
    }
  }

  /** 검수: 고객이 쓴 사유·미개봉(AI 또는 규칙)과 실제 상자 상태(검수 결과)로 처리 방법을 정한다 */
  private inspect(r: ReturnReq) {
    const food = r.item.cat === 'food' || r.item.cat === 'chilled'
    // 검수 결과: 고객이 미개봉이라 했어도 열어 본 흔적이 있을 수 있다(약 1할)
    const opened = !r.unopened || R() < 0.1
    const claimedButOpened = r.unopened && opened
    let d: Disposition
    let note: string
    if (food) {
      d = 'dispose'
      note = L('신선·식품은 재판매하지 않음 → 폐기', 'Fresh food is not resold → disposed')
    } else if (r.reason === 'damaged') {
      d = r.carrierDamage ? 'dispose' : 'seller'
      note = r.carrierDamage ? L('운송 중 파손 → 폐기 · 택배사 배상 접수', 'Damaged in transit → disposed · carrier compensation claim filed') : L('상품 파손 → 판매자 반송', 'Product damaged → returned to seller')
    } else if (r.reason === 'defective') {
      d = 'seller'
      note = L('불량 → 판매자 반송(제조사 검사)', 'Defective → returned to seller (manufacturer check)')
    } else if (r.reason === 'wrong_item') {
      d = 'restock'
      note = L('오발송 상품은 이상 없음 → 재입고 · 맞는 상품 재발송', 'Wrongly shipped item is fine → restocked · correct item reshipped')
    } else if (!opened) {
      d = 'restock'
      note = L('미개봉 확인 → 재입고(A급)', 'Confirmed unopened → restocked (grade A)')
    } else {
      d = 'refurb'
      note = claimedButOpened ? L('고객은 미개봉이라 했으나 개봉 흔적 → 리퍼(B급)', 'Customer said unopened but it was opened → refurb (grade B)') : L('개봉 상품 → 리퍼(B급) 판매', 'Opened item → sold as refurb (grade B)')
    }
    r.disposition = d
    r.note = note
  }

  /** 문의 대상 택배가 지금 어디 있고 언제 도착하는가(배송차 남은 경로를 따라 계산) */
  eta(v: Vehicle, stopId: string): { clock: number; min: number; ahead: number } | null {
    const idx = v.stops.findIndex((s) => s.id === stopId)
    if (idx < v.stopIdx || v.dest !== 'TW') return null
    let need = idx - v.stopIdx
    let sec = 0
    for (const t of v.tasks) {
      if (t.k === 'drive') sec += t.route ? t.route.remainingTime() : t.legs.reduce((s, l) => s + l.path.length / Math.max(1, l.speed), 0)
      else if (t.k === 'work' && t.phase === 'delivering') {
        if (need === 0) break
        need--
        sec += 14
      } else if (t.k === 'wait') sec += t.t
    }
    const clock = this.sim.clock + sec * SPEEDUP
    return { clock, min: Math.max(1, Math.round((sec * SPEEDUP) / 60)), ahead: idx - v.stopIdx }
  }

  step(dt: number) {
    this.nextInquiry -= dt
    if (this.nextInquiry <= 0) {
      this.nextInquiry = 24 + R() * 22
      const p = pick(INQUIRY_POOL)
      this.ask(p.text)
    }
    this.nextReturn -= dt
    if (this.nextReturn <= 0) {
      this.nextReturn = 55 + R() * 40
      const stops = [...new Set(Object.values(VARIANTS).flat())]
      this.openReturn(pick(RETURN_POOL), pick(stops), pick(ITEMS.filter((i) => i.cat !== 'food')), pick(NAMES))
    }
    for (const r of this.returns) {
      if (r.stage !== 5) continue
      r.timer -= dt
      if (r.timer <= 0) {
        this.stage(r, 6)
        this.stats.done++
        if (r.disposition) this.stats.byDisp[r.disposition]++
      }
    }
    // 따라가던 반품이 끝나면 잠시 뒤 아직 초기 단계인 다른 반품으로 넘어간다
    const f = this.focus
    if (f && f.stage >= 6 && this.sim.clock - (f.times[6] ?? this.sim.clock) > 30 * SPEEDUP) {
      this.focus = this.returns.find((r) => r.stage < 3) ?? f
    }
  }

  /** 반품 여정 위치(따라가기·3D 핀) */
  focusPos(): { x: number; y: number; z: number; label: string; site: 'TW' | 'IN' | 'GJ' } | null {
    const r = this.focus
    if (!r) return null
    const stop = STOPS[r.stopId]
    if (r.stage <= 1) {
      const v = r.van ? this.sim.vehicle(r.van) : null
      if (r.stage === 1 && v && v.visible) return { x: v.x, y: 4, z: v.z, label: L(`${v.id} 회수 가는 중`, `${v.id} heading to pickup`), site: v.site === 'TW' ? 'TW' : 'IN' }
      return { x: stop.door.x, y: 3, z: stop.door.z, label: L(`${stop.label} 회수 대기`, `${stop.label} awaiting pickup`), site: 'TW' }
    }
    if (r.stage === 2 || (r.stage === 3 && r.van)) {
      const v = r.van ? this.sim.vehicle(r.van) : null
      if (v && v.visible && r.stage === 2) return { x: v.x, y: 4, z: v.z, label: L(`${v.id} 반품 싣고 복귀`, `${v.id} heading back with the return`), site: v.site === 'TW' ? 'TW' : 'IN' }
    }
    if (r.stage === 3) return { x: -440, y: 3, z: -26, label: L('인천 서브 반품 롤테이너', 'Incheon Sub-terminal return roll cage'), site: 'IN' }
    if (r.stage === 4) {
      const v = r.truck ? this.sim.vehicle(r.truck) : null
      if (v && v.visible) return { x: v.x, y: 5, z: v.z, label: L(`${v.id} 간선 회송`, `${v.id} linehaul back to Gonjiam`), site: v.site === 'IN' ? 'IN' : 'GJ' }
    }
    return { x: -36, y: 3, z: 12, label: r.stage >= 6 ? L(`처리 완료 · ${r.disposition ? DISPOSITION_LABEL[r.disposition] : ''}`, `Done · ${r.disposition ? DISPOSITION_LABEL[r.disposition] : ''}`) : L('곤지암 반품 검수대', 'Gonjiam return desk'), site: 'GJ' }
  }
}

function hhmm(sec: number) {
  const s = ((sec % 86400) + 86400) % 86400
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`
}
