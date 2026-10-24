// 통관 품목 분류(HS 코드): 부산신항 수입 컨테이너의 적하목록을 세관 신고서로 만든다.
//  - 상세 설명(영문)과 신고 품명(한글)을 각각 HS 류(類, 앞 2자리)로 분류한다(AI Choice 둘, 끄면 낱말 규칙).
//  - 두 류가 다르면 "세번 불일치 → 정밀 심사", 같으면 통관 진행. 세율·부가세·목록통관 여부는 코드 규칙(예시 값)으로 계산한다.
//  실제 품목 분류는 10단위 세번(HSK)·관세율표 해석 통칙·FTA 원산지 등을 따져야 한다. 여기 세율은 설명용 예시다.
import type { Sim } from './sim'
import type { Box } from './port'
import { mulberry32 } from './data'
import { L } from '../i18n'

const R = mulberry32(8282)

export const HS: Record<string, { label: string; desc: string; rate: number; food?: boolean }> = {
  '02': { label: L('02류 육류', 'Ch.02 Meat'), desc: 'Ch.02 meat: beef, pork, chicken, chilled or frozen', rate: 40, food: true },
  '03': { label: L('03류 어패류', 'Ch.03 Fish & seafood'), desc: 'Ch.03 fish and seafood: shrimp, fish, squid', rate: 20, food: true },
  '08': { label: L('08류 과실·견과', 'Ch.08 Fruit & nuts'), desc: 'Ch.08 edible fruit and nuts: bananas, citrus, nuts', rate: 30, food: true },
  '09': { label: L('09류 커피·차', 'Ch.09 Coffee & tea'), desc: 'Ch.09 coffee, tea and spices', rate: 2, food: true },
  '21': { label: L('21류 조제식품', 'Ch.21 Food preparations'), desc: 'Ch.21 food preparations and dietary supplements: vitamins, protein powder', rate: 8, food: true },
  '24': { label: L('24류 담배', 'Ch.24 Tobacco'), desc: 'Ch.24 tobacco and cigarettes', rate: 40 },
  '28': { label: L('28류 화학품·가스', 'Ch.28 Chemicals & gases'), desc: 'Ch.28 inorganic chemicals and industrial gases: nitrogen, compressed gas', rate: 5.5 },
  '30': { label: L('30류 의약품', 'Ch.30 Pharmaceuticals'), desc: 'Ch.30 pharmaceutical products: medicines, vaccines', rate: 0, food: true },
  '32': { label: L('32류 페인트', 'Ch.32 Paints'), desc: 'Ch.32 paints, varnishes, inks', rate: 6.5 },
  '33': { label: L('33류 화장품·향수', 'Ch.33 Cosmetics & perfume'), desc: 'Ch.33 cosmetics, perfume, skin care, lipstick', rate: 6.5 },
  '34': { label: L('34류 세제·생활화학', 'Ch.34 Soap & detergents'), desc: 'Ch.34 soap, detergents, cleaning and household sprays', rate: 6.5 },
  '40': { label: L('40류 고무·타이어', 'Ch.40 Rubber & tires'), desc: 'Ch.40 rubber products and tires', rate: 8 },
  '61': { label: L('61·62류 의류', 'Ch.61-62 Apparel'), desc: 'Ch.61-62 clothing and apparel, knitted or woven, new or used', rate: 13 },
  '64': { label: L('64류 신발', 'Ch.64 Footwear'), desc: 'Ch.64 footwear: shoes, sneakers, boots', rate: 13 },
  '73': { label: L('73류 철강 제품', 'Ch.73 Iron & steel goods'), desc: 'Ch.73 articles of iron or steel: cookware, kitchenware', rate: 8 },
  '85': { label: L('85류 전기·전자', 'Ch.85 Electrical & electronics'), desc: 'Ch.85 electrical machinery and electronics: TVs, phones, lithium batteries', rate: 8 },
  '87': { label: L('87류 자동차 부품', 'Ch.87 Vehicle parts'), desc: 'Ch.87 vehicles and vehicle parts: brake pads, auto parts', rate: 8 },
  '94': { label: L('94류 가구·조명', 'Ch.94 Furniture & lighting'), desc: 'Ch.94 furniture, lighting, bedding', rate: 8 },
  '95': { label: L('95류 완구·운동', 'Ch.95 Toys & sports'), desc: 'Ch.95 toys, games and sports equipment', rate: 8 },
  mixed: { label: L('여러 류 혼재', 'Mixed chapters'), desc: 'many different consumer goods mixed in one shipment, such as consolidated online-shopping parcels', rate: 8 },
  other: { label: L('기타', 'Other'), desc: 'none of these chapters', rate: 8 },
}
export type HsKey = keyof typeof HS

/** AI 응답(서버 /api/ai/hs) */
export interface HsAnswer {
  chapter: string
  chapterConfidence: number
  declaredChapter: string
  declaredConfidence: number
  personal: number
}

export interface Declaration {
  id: string
  no: string
  time: number
  declared: string
  description: string
  shipper: string
  origin: string
  /** 신고 가격(US$) */
  value: number
  /** 직구 묶음이면 상자 수 */
  parcels: number
  status: 'pending' | 'ready' | 'error'
  ai: HsAnswer | null
  by: 'ai' | 'rule'
  chapter: HsKey
  declaredChapter: HsKey
  personal: boolean
  /** 코드 판정 */
  mismatch: boolean
  clearance: 'list' | 'general'
  duty: number
  vat: number
  action: string
}

export const USD_KRW = 1380

// ───────────────────────── 낱말 규칙(AI를 끈 상태)

const RULES: [RegExp, HsKey][] = [
  [/E-COMMERCE|직구|특송/i, 'mixed'],
  [/BEEF|PORK|CHICKEN|MEAT|육류|돼지|소고기/i, '02'],
  [/SHRIMP|FISH|SQUID|새우|생선|수산/i, '03'],
  [/BANANA|FRUIT|과일|바나나/i, '08'],
  [/COFFEE|TEA|커피|차\b/i, '09'],
  [/VITAMIN|SUPPLEMENT|PROTEIN|FOODSTUFF|건강식품|식료품/i, '21'],
  [/CIGARETTE|TOBACCO|담배/i, '24'],
  [/NITROGEN|GAS CYLINDER|COMPRESSED/i, '28'],
  [/VACCINE|MEDICINE|PHARMA|의약품/i, '30'],
  [/PAINT|페인트/i, '32'],
  [/PERFUME|COSMETIC|LIPSTICK|CREAM|화장품/i, '33'],
  [/AEROSOL|DETERGENT|SOAP|HOUSEHOLD|생활용품/i, '34'],
  [/TIRE|타이어/i, '40'],
  [/CLOTHING|APPAREL|DRESS|T-SHIRT|의류/i, '61'],
  [/SNEAKER|SHOE|신발/i, '64'],
  [/COOKWARE|KITCHENWARE|STEEL|주방용품/i, '73'],
  [/LITHIUM|BATTER|TV|ELECTRON|전자제품/i, '85'],
  [/AUTO PART|MACHINE PART|BRAKE|자동차 부품|기계 부품/i, '87'],
  [/FURNITURE|CHAIR|가구/i, '94'],
  [/TOY|완구/i, '95'],
]

export function ruleHs(declared: string, description: string): HsAnswer {
  const find = (t: string): HsKey => RULES.find(([re]) => re.test(t))?.[1] ?? 'other'
  return { chapter: find(description), chapterConfidence: 1, declaredChapter: find(declared), declaredConfidence: 1, personal: /E-COMMERCE|직구/i.test(description + declared) ? 1 : 0 }
}

export class CustomsDesk {
  list: Declaration[] = []
  stats = { declared: 0, mismatch: 0, list: 0, general: 0, duty: 0, vat: 0 }
  onDeclare: ((d: Declaration) => void) | null = null
  private seen = new Set<string>()
  private poll = 0

  constructor(private sim: Sim) {}

  private register(b: Box) {
    const m = b.manifest!
    this.seen.add(b.id)
    const origin = /\(([A-Z]{2})\)/.exec(m.shipper)?.[1] ?? '--'
    const ecommerce = /E-COMMERCE/i.test(m.description)
    const parcels = ecommerce ? Number(/\(([\d,]+) PCS\)/.exec(m.description)?.[1].replace(',', '') ?? 900) : 0
    const d: Declaration = {
      id: b.id,
      no: `IM-${String(Math.floor(R() * 900000) + 100000)}`,
      time: this.sim.clock,
      declared: m.declared,
      description: m.description,
      shipper: m.shipper,
      origin,
      value: ecommerce ? Math.round(parcels * (24 + R() * 60)) : Math.round(18000 + R() * 100000),
      parcels,
      status: 'pending',
      ai: null,
      by: 'rule',
      chapter: 'other',
      declaredChapter: 'other',
      personal: false,
      mismatch: false,
      clearance: 'general',
      duty: 0,
      vat: 0,
      action: '',
    }
    this.list.unshift(d)
    if (this.list.length > 30) this.list.pop()
    this.stats.declared++
    if (this.onDeclare) this.onDeclare(d)
    else this.resolve(d, null)
  }

  /** 분류 결과로 판정(정책은 코드) */
  resolve(d: Declaration, a: HsAnswer | null) {
    const ans = a ?? ruleHs(d.declared, d.description)
    d.ai = a
    d.by = a ? 'ai' : 'rule'
    d.status = 'ready'
    const key = (k: string): HsKey => (k in HS ? k : 'other')
    d.chapter = key(ans.chapter)
    d.declaredChapter = key(ans.declaredChapter)
    d.personal = ans.personal > 0.5
    // 불일치: 둘 다 확신(0.6 이상)하고 류가 다를 때. 개인 직구 묶음은 품명이 넓어도("해외 직구 특송") 정상으로 본다.
    // 기업 화물을 "잡화"처럼 넓게 신고했는데 내용이 특정 품목이면 불일치다(담배를 잡화로 신고하는 식)
    const sure = !a || (a.chapterConfidence >= 0.6 && a.declaredConfidence >= 0.6)
    const broadOk = d.personal && (d.declaredChapter === 'mixed' || d.chapter === 'mixed')
    d.mismatch = sure && !broadOk && d.chapter !== d.declaredChapter
    const hs = HS[d.chapter]
    // 목록통관(예시 규칙): 개인 자가사용 직구 묶음 · 상자당 US$150 이하 · 식품·의약품류가 아닐 것
    const perParcel = d.parcels ? d.value / d.parcels : d.value
    d.clearance = d.personal && d.parcels > 0 && perParcel <= 150 && !hs.food && !d.mismatch ? 'list' : 'general'
    // 세액(예시): 목록통관은 개별 상자가 면세 한도 안이라 0, 일반 신고는 과세 가격 × 예시 세율 + 부가세 10%
    const krw = d.value * USD_KRW
    d.duty = d.clearance === 'list' ? 0 : Math.round(krw * (hs.rate / 100))
    d.vat = d.clearance === 'list' ? 0 : Math.round((krw + d.duty) * 0.1)
    d.action = d.mismatch
      ? L(`세번 불일치(신고 ${HS[d.declaredChapter].label} ↔ 내용 ${hs.label}) → 정밀 심사·검사 지정`, `HS mismatch (declared ${HS[d.declaredChapter].label} ↔ contents ${hs.label}) → detailed review · inspection`)
      : d.clearance === 'list'
        ? L(`목록통관 · 상자 ${d.parcels.toLocaleString('ko-KR')}개를 송장 목록으로 신고`, `List clearance · ${d.parcels.toLocaleString('en-US')} parcels declared as a waybill list`)
        : L(`일반 수입신고 · ${hs.label} 예시 세율 ${hs.rate}%`, `Standard import declaration · ${hs.label} · sample rate ${hs.rate}%`)
    if (d.mismatch) this.stats.mismatch++
    if (d.clearance === 'list') this.stats.list++
    else this.stats.general++
    this.stats.duty += d.duty
    this.stats.vat += d.vat
  }

  step(dt: number) {
    this.poll -= dt
    if (this.poll > 0) return
    this.poll = 1
    // 안벽 크레인이 내려 AGV에 실은 수입 컨테이너부터 신고한다(배 위에 쌓인 것은 내릴 때)
    for (const a of this.sim.port.agvs) {
      const b = a.box
      if (b?.manifest && !this.seen.has(b.id)) this.register(b)
    }
    if (this.seen.size > 300) this.seen = new Set([...this.seen].slice(-150))
  }
}
