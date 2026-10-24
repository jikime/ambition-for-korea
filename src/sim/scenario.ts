// 명절 물량 폭증 "만약에" 시나리오: 단계별 처리 능력(시간당)과 물량을 견줘 병목·밀린 물량·해소 시간을 계산한다.
//  - 기준값은 평일 하루(운영 10시간)를 가정한 설명용 수치다. 실제 시뮬레이션 처리량(실측)은 화면에 함께 보여 준다.
//  - 시나리오는 단계별 물량 배수 + 처리 능력 배수(날씨). 대응(증차·인력·야간 연장·용차)은 처리 능력을 올린다.
//  - 공지 문장을 넣으면 AI가 행사 종류·규모·냉장/수입/날씨 영향을 고르고, 코드가 배수로 바꾼다(끄면 낱말 규칙).
import { L } from '../i18n'

export type StageId = 'ic' | 'lh1' | 'hub' | 'lh2' | 'sub' | 'lm' | 'cold' | 'port' | 'air'

export interface Stage {
  id: StageId
  label: string
  unit: string
  /** 평상시 시간당 물량 */
  base: number
  /** 시간당 처리 능력 */
  cap: number
  /** 한 대(한 조)가 늘리는 처리량: 대응 규모 계산용 */
  per: number
  perLabel: string
}

const BOXES_H = L('상자/시', 'boxes/h')
export const STAGES: Stage[] = [
  { id: 'ic', label: L('이천 FC 피킹·출고', 'Icheon FC picking · outbound'), unit: BOXES_H, base: 2600, cap: 3600, per: 420, perLabel: L('피킹 조', 'picking crew') },
  { id: 'lh1', label: L('간선 이천 → 곤지암', 'Linehaul Icheon → Gonjiam'), unit: BOXES_H, base: 2600, cap: 3400, per: 560, perLabel: L('윙바디', 'wing-body truck') },
  { id: 'hub', label: L('곤지암 허브 분류', 'Gonjiam hub sorting'), unit: BOXES_H, base: 21000, cap: 30000, per: 3000, perLabel: L('야간 조', 'night crew') },
  { id: 'lh2', label: L('간선 곤지암 → 서브', 'Linehaul Gonjiam → sub-terminal'), unit: BOXES_H, base: 6300, cap: 8000, per: 800, perLabel: L('11톤 탑차', '11-ton box truck') },
  { id: 'sub', label: L('서브터미널 분류', 'Sub-terminal sorting'), unit: BOXES_H, base: 6300, cap: 7800, per: 900, perLabel: L('분류 조', 'sorting crew') },
  { id: 'lm', label: L('라스트마일 배송', 'Last-mile delivery'), unit: BOXES_H, base: 6300, cap: 7600, per: 150, perLabel: L('1톤 용차', 'hired 1-ton van') },
  { id: 'cold', label: L('콜드체인·새벽배송', 'Cold chain · dawn delivery'), unit: L('주문/시', 'orders/h'), base: 900, cap: 1300, per: 210, perLabel: L('냉동탑차', 'reefer truck') },
  { id: 'port', label: L('부산신항 수입 반출', 'Busan New Port import release'), unit: L('TEU/시', 'TEU/h'), base: 14, cap: 20, per: 2, perLabel: L('트레일러', 'trailer') },
  { id: 'air', label: L('인천공항 항공 수출', 'Incheon Airport air export'), unit: L('ULD/시', 'ULD/h'), base: 9, cap: 14, per: 2, perLabel: L('빌드업 조', 'build-up crew') },
]

export type Mult = Partial<Record<StageId, number>>

export interface Scenario {
  key: string
  label: string
  desc: string
  load: Mult
  cap: Mult
}

export const PRESETS: Scenario[] = [
  { key: 'normal', label: L('평상시', 'Normal'), desc: L('평일 기준', 'Weekday baseline'), load: {}, cap: {} },
  { key: 'chuseok', label: L('추석 D-7', 'Chuseok D-7'), desc: L('선물세트·신선식품이 몰리는 추석 전 주', 'The week before Chuseok, when gift sets and fresh food pile up'), load: { ic: 1.9, lh1: 1.9, hub: 1.8, lh2: 1.8, sub: 1.8, lm: 1.8, cold: 2.4, port: 1.1, air: 1.0 }, cap: {} },
  { key: 'seollal', label: L('설 D-5', 'Seollal D-5'), desc: L('설 선물·제수용품 주문 폭증', 'Seollal gift and ancestral-rite food orders spike'), load: { ic: 1.7, lh1: 1.7, hub: 1.7, lh2: 1.7, sub: 1.7, lm: 1.7, cold: 2.2, port: 1.0, air: 1.0 }, cap: {} },
  { key: 'black_friday', label: L('해외 직구 대란', 'Cross-border shopping rush'), desc: L('블랙프라이데이·광군제 직구 물량', "Black Friday · Singles' Day direct-purchase volume"), load: { ic: 1.1, lh1: 1.1, hub: 1.45, lh2: 1.35, sub: 1.35, lm: 1.35, cold: 1.0, port: 2.6, air: 1.4 }, cap: {} },
  { key: 'monsoon', label: L('장마·태풍', 'Monsoon · typhoon'), desc: L('폭우로 간선 감속, 강풍으로 크레인 작업 중지', 'Heavy rain slows linehaul, strong wind halts crane work'), load: { lm: 1.05 }, cap: { lh1: 0.75, lh2: 0.75, lm: 0.8, port: 0.5, air: 0.85 } },
]

export interface Response {
  key: string
  label: string
  desc: string
  cap: Mult
}

export const RESPONSES: Response[] = [
  { key: 'staff', label: L('임시 인력 투입', 'Temp staff'), desc: L('FC 피킹·서브 분류 인력 +30%', 'FC picking · sub-terminal sorting staff +30%'), cap: { ic: 1.3, sub: 1.25 } },
  { key: 'trucks', label: L('간선 증차', 'More linehaul trucks'), desc: L('윙바디·11톤 탑차 +40%', 'Wing-body · 11-ton box trucks +40%'), cap: { lh1: 1.4, lh2: 1.4, port: 1.3 } },
  { key: 'night', label: L('야간 연장 운영', 'Extended night shift'), desc: L('허브·서브 분류를 6시간 연장', 'Hub and sub-terminal sorting run 6 h longer'), cap: { hub: 1.35, sub: 1.2, air: 1.3 } },
  { key: 'vans', label: L('1톤 용차 투입', 'Hired 1-ton vans'), desc: L('외부 배송차 +35%', 'Outside delivery vans +35%'), cap: { lm: 1.35 } },
  { key: 'reefer', label: L('냉동탑차 임차', 'Leased reefer trucks'), desc: L('콜드체인 운행 +60%', 'Cold-chain runs +60%'), cap: { cold: 1.6 } },
]

/** 운영 시간(평상시) */
export const HOURS = 10

export interface StageResult {
  stage: Stage
  load: number
  cap: number
  capAfter: number
  util: number
  utilAfter: number
  /** 하루 동안 밀리는 물량 */
  backlog: number
  backlogAfter: number
  /** 다음 날 여유 능력으로 밀린 물량을 다 처리하는 데 걸리는 시간 */
  clearH: number
  clearHAfter: number
  /** 부족분을 메우려면 더 필요한 대수(조) */
  need: number
}

export function evaluate(load: Mult, cap: Mult, responses: string[]) {
  const resp = RESPONSES.filter((r) => responses.includes(r.key))
  const rows: StageResult[] = STAGES.map((s) => {
    const L = s.base * (load[s.id] ?? 1)
    const C = s.cap * (cap[s.id] ?? 1)
    const CA = C * resp.reduce((m, r) => m * (r.cap[s.id] ?? 1), 1)
    const backlog = Math.max(0, L - C) * HOURS
    const backlogAfter = Math.max(0, L - CA) * HOURS
    const spare = (c: number) => Math.max(1e-6, c - s.base)
    return {
      stage: s,
      load: L,
      cap: C,
      capAfter: CA,
      util: L / C,
      utilAfter: L / CA,
      backlog,
      backlogAfter,
      clearH: backlog / spare(C),
      clearHAfter: backlogAfter / spare(CA),
      need: Math.max(0, Math.ceil((L - C) / s.per)),
    }
  })
  const worst = rows.reduce((a, b) => (b.util > a.util ? b : a))
  const worstAfter = rows.reduce((a, b) => (b.utilAfter > a.utilAfter ? b : a))
  // 당일 처리율: 파이프라인 전체에서 가장 좁은 단계가 결정한다(택배 흐름 단계만)
  const flow = rows.filter((r) => ['ic', 'lh1', 'hub', 'lh2', 'sub', 'lm'].includes(r.stage.id))
  const sameDay = Math.min(1, ...flow.map((r) => r.cap / r.load))
  const sameDayAfter = Math.min(1, ...flow.map((r) => r.capAfter / r.load))
  // 대응 추천(코드): 넘치는 단계를 올려 주는 대응
  const recommend = RESPONSES.filter((r) => rows.some((x) => x.util > 1 && (r.cap[x.stage.id] ?? 1) > 1)).map((r) => r.key)
  return { rows, worst, worstAfter, sameDay, sameDayAfter, recommend }
}

/** AI 응답(서버 /api/ai/notice) */
export interface NoticeAnswer {
  event: string
  eventConfidence: number
  scale: number
  cold: number
  imports: number
  weather: number
}

/** 공지 판독 결과 → 시나리오 배수(정책은 코드) */
export function fromNotice(a: NoticeAnswer): { label: string; load: Mult; cap: Mult; summary: string[] } {
  const preset = PRESETS.find((p) => p.key === a.event)
  // 규모(0~3점) → 전체 물량 배수
  const k = [1, 1.3, 1.8, 2.3]
  const s = Math.max(0, Math.min(3, a.scale))
  const mult = k[Math.floor(s)] + (k[Math.min(3, Math.floor(s) + 1)] - k[Math.floor(s)]) * (s - Math.floor(s))
  const load: Mult = {}
  for (const st of STAGES) {
    const p = preset?.load[st.id]
    // 프리셋의 단계별 모양을 쓰되, 공지의 규모에 맞춰 키운다(프리셋이 없으면 고르게)
    load[st.id] = p ? 1 + (p - 1) * ((mult - 1) / 0.8 || 0) : st.id === 'port' || st.id === 'air' ? 1 : mult
  }
  if (a.cold > 0.6) load.cold = Math.max(load.cold ?? 1, mult * 1.3)
  if (a.imports > 0.6) {
    load.port = Math.max(load.port ?? 1, mult * 1.3)
    load.hub = Math.max(load.hub ?? 1, mult)
  }
  const cap: Mult = { ...(preset?.cap ?? {}) }
  if (a.weather > 0.6) Object.assign(cap, PRESETS.find((p) => p.key === 'monsoon')!.cap)
  // 규모가 평소 수준이고 날씨 영향도 없으면 행사 이름과 상관없이 평상시로 본다
  const calm = s < 0.5 && a.weather <= 0.6
  const summary = [
    calm ? L('평상시 수준', 'Normal level') : `${preset?.label ?? (a.event === 'promo' ? L('온라인 대형 할인', 'Big online sale') : L('행사 없음', 'No event'))}`,
    L(`물량 약 ×${mult.toFixed(1)}`, `Volume ≈ ×${mult.toFixed(1)}`),
    ...(a.cold > 0.6 ? [L('냉장·냉동 증가', 'More chilled/frozen')] : []),
    ...(a.imports > 0.6 ? [L('수입·직구 증가', 'More imports/direct purchases')] : []),
    ...(a.weather > 0.6 ? [L('악천후 감속', 'Bad-weather slowdown')] : []),
  ]
  return { label: calm ? L('평상시 수준', 'Normal level') : preset?.label ?? L('공지 기반', 'From notice'), load, cap, summary }
}

/** 낱말 규칙(AI를 끈 상태) */
export function ruleNotice(text: string): NoticeAnswer {
  const t = text.replace(/\s+/g, '')
  // 영어 공지: 소문자 원문에서 같은 뜻의 낱말을 찾는다
  const e = text.toLowerCase().replace(/[‘’]/g, "'")
  const has = (ko: RegExp, en: RegExp) => ko.test(t) || en.test(e)
  const event = has(/추석|한가위/, /chuseok|hangawi|korean thanksgiving/) ? 'chuseok' : has(/설날|설연휴|설명절/, /seollal|lunar new year/) ? 'seollal' : has(/블랙프라이데이|광군제|직구/, /black friday|singles'? day|direct[- ]purchas/) ? 'black_friday' : has(/장마|태풍|폭우/, /monsoon|typhoon|heavy rain/) ? 'monsoon' : has(/할인|세일|프로모션/, /discount|\bsales?\b|promotion/) ? 'promo' : 'none'
  const times = /(\d+(?:\.\d+)?)배/.exec(t) ?? /(\d+(?:\.\d+)?)\s*(?:x|×|times)(?![a-z])/.exec(e)
  const m = times ? Number(times[1]) : has(/두배|2배/, /\b(twice|double|doubled|doubling)\b/) ? 2 : event === 'none' ? 1 : 1.5
  const scale = m >= 2.2 ? 3 : m >= 1.7 ? 2 : m >= 1.2 ? 1 : 0
  return { event, eventConfidence: 1, scale, cold: has(/냉장|냉동|신선|정육|과일/, /chilled|refrigerat|frozen|fresh|meat|fruit/) ? 1 : 0, imports: has(/수입|직구|해외/, /\bimports?\b|direct[- ]purchas|overseas|cross-border/) ? 1 : 0, weather: has(/장마|태풍|폭우|강풍|폭설/, /monsoon|typhoon|heavy rain|strong wind|gale|heavy snow|snowstorm/) ? 1 : 0 }
}
