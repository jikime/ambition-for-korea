// 주소 오류 바로잡기(인천 서브터미널 주소 정정 데스크).
//  다온마을로 가는 상자 중 주소가 오타·약칭·옛 이름·빠진 동/호수로 적힌 것이 섞여 온다.
//  1) 코드가 글자 유사도로 정차지 후보를 좁힌다(후보 4곳 + "해당 없음").
//  2) AI가 후보 중 이 주소가 가리키는 곳을 고르고(Choice), 동·호수가 빠졌는지 본다(Noul).
//  3) 정책은 코드: 확신 0.7 이상이면 정정해 그 동을 도는 배송차로, 애매하면 고객에게 알림톡으로 확인한다.
//  AI를 끄면 글자 유사도 1등을 쓰되, 점수가 낮거나 2등과 비슷하면 사람이 확인한다.
import type { Sim } from './sim'
import { STOPS } from './sites'
import { mulberry32 } from './data'
import { L, LL } from '../i18n'

const R = mulberry32(6161)
const pick = <T,>(a: readonly T[]) => a[Math.floor(R() * a.length)]

/** 정차지 설명(후보로 보여 줄 때 AI가 읽는다): 정식 이름 + 옛 이름·위치 */
export const STOP_HINT: Record<string, string> = LL({
  A101: '다온마을 아파트 101동 (옛 이름 다온1단지 101동 · 단지 북쪽 줄 동쪽 끝)',
  A102: '다온마을 아파트 102동 (옛 이름 다온1단지 102동 · 단지 북쪽 줄 가운데)',
  A103: '다온마을 아파트 103동 (옛 이름 다온1단지 103동 · 단지 북쪽 줄 서쪽 끝)',
  A104: '다온마을 아파트 104동 (옛 이름 다온1단지 104동 · 단지 남쪽 줄 동쪽 끝)',
  A105: '다온마을 아파트 105동 (옛 이름 다온1단지 105동 · 단지 남쪽 줄 가운데)',
  A106: '다온마을 아파트 106동 (옛 이름 다온1단지 106동 · 단지 남쪽 줄 서쪽 끝)',
  LOCK: '다온마을 아파트 관리동 무인택배함 (관리사무소·관리실 1층 택배함)',
  V215: '초록빌라 (다온마을로 빌라 골목 맨 북쪽, 4층)',
  V180: '다온캐슬 (빌라 골목 북쪽에서 두 번째, 4층)',
  V145: '해밀빌 (빌라 골목 가운데, 3층)',
  V110: '다솜하우스 (빌라 골목 남쪽 끝, 편의점 다온25 바로 북쪽 건물)',
  STORE: '편의점 다온25 (다온마을로 입구 상가 1층)',
}, {
  A101: 'Daon Village Apt Bldg 101 (formerly Daon Complex 1 Bldg 101 · north row of the complex, east end)',
  A102: 'Daon Village Apt Bldg 102 (formerly Daon Complex 1 Bldg 102 · north row of the complex, middle)',
  A103: 'Daon Village Apt Bldg 103 (formerly Daon Complex 1 Bldg 103 · north row of the complex, west end)',
  A104: 'Daon Village Apt Bldg 104 (formerly Daon Complex 1 Bldg 104 · south row of the complex, east end)',
  A105: 'Daon Village Apt Bldg 105 (formerly Daon Complex 1 Bldg 105 · south row of the complex, middle)',
  A106: 'Daon Village Apt Bldg 106 (formerly Daon Complex 1 Bldg 106 · south row of the complex, west end)',
  LOCK: 'Daon Village Apt management bldg parcel locker (lockers on 1F of the management office)',
  V215: 'Chorok Villa (northernmost on the villa alley off Daon Village-ro, 4 floors)',
  V180: 'Daon Castle (second from the north on the villa alley, 4 floors)',
  V145: 'Haemil Ville (middle of the villa alley, 3 floors)',
  V110: 'Dasom House (south end of the villa alley, the building just north of convenience store Daon25)',
  STORE: 'Daon25 convenience store (ground-floor shop at the Daon Village-ro entrance)',
})

/** AI 응답(서버 /api/ai/addrfix) */
export interface AddrAnswer {
  stop: string
  confidence: number
  unitMissing: number
}

export interface AddrCase {
  id: number
  time: number
  label: string
  /** 실제 정답(시뮬레이션이 안다. 배송 뒤 확인된 주소로 화면에 보여 준다) */
  truth: string
  kind: string
  candidates: { id: string; score: number }[]
  status: 'pending' | 'ready' | 'error'
  ai: AddrAnswer | null
  by: 'ai' | 'rule'
  /** 코드 판정 */
  outcome: 'fixed' | 'contact' | 'manual'
  stop: string | null
  unitMissing: boolean
  note: string
  /** 고객 확인 답을 기다리는 시간 */
  wait: number
  resolved: boolean
}

const norm = (s: string) =>
  s
    // 영어 주소 낱말은 같은 뜻의 한국어 토큰으로 맞춘다(같은 주소면 언어와 상관없이 같은 점수)
    .replace(/\b(?:Bldg\.?|Building)\s*(\d+)/gi, '$1동')
    .replace(/(\d)\s*-?\s*dong\b/gi, '$1동')
    .replace(/(\d)\s*-?\s*ho\b/gi, '$1호')
    .replace(/\b(?:Complex|Danji)\s*1\b/gi, '1단지')
    .replace(/\bDaon\s*Village\b/gi, '다온마을')
    .replace(/\bDaon\b/gi, '다온')
    .replace(/\b(?:Apartments?|Aprt|Appt|Apt)\b/gi, '아파트')
    .replace(/APT|apt|아퍄트|아파트/g, '아파트')
    .replace(/[Oo]/g, '0')
    .replace(/[\s\-·,.()]/g, '')

function bigrams(s: string) {
  const out = new Map<string, number>()
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2)
    out.set(g, (out.get(g) ?? 0) + 1)
  }
  return out
}

/** 글자 짝(바이그램) 다이스 유사도 0~1 */
export function similarity(a: string, b: string) {
  const A = bigrams(norm(a))
  const B = bigrams(norm(b))
  let inter = 0
  let n = 0
  for (const [g, c] of A) {
    n += c
    inter += Math.min(c, B.get(g) ?? 0)
  }
  for (const c of B.values()) n += c
  return n ? (2 * inter) / n : 0
}

/** 후보 좁히기(코드): 정식 이름·옛 이름 둘 다와 비교해 높은 쪽 */
export function candidatesFor(label: string) {
  return Object.keys(STOPS)
    .map((id) => {
      const names = [STOPS[id].label, STOP_HINT[id].split(' (')[0], STOP_HINT[id].replace(/[()]/g, ' ')]
      if (id.startsWith('A')) names.push(L(`다온1단지 ${id.slice(1)}동`, `Daon Complex 1 Bldg ${id.slice(1)}`))
      return { id, score: Math.max(...names.map((n) => similarity(label, n))) }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
}

/** 흐트러진 주소의 종류(화면에 보이는 이름) */
const KIND = {
  typo: L('오타', 'Typo'),
  abbr: L('약칭', 'Abbreviation'),
  old: L('옛 이름', 'Old name'),
  spacing: L('띄어쓰기·누락', 'Spacing · missing word'),
  noBldg: L('동 누락', 'Missing building'),
  noUnit: L('호수 누락', 'Missing unit'),
  where: L('위치 설명', 'Location description'),
}

/** 흐트러진 주소 만들기: [표기, 정답 정차지, 종류] */
function messyLabel(): [string, string, string] {
  const apt = pick(['A101', 'A102', 'A103', 'A104', 'A105', 'A106'])
  const n = apt.slice(1)
  const unit = `${1 + Math.floor(R() * 15)}0${1 + Math.floor(R() * 4)}`
  const roll = R()
  if (roll < 0.14) return [L(`다온마을 아퍄트 ${n.replace(/0/g, 'O')}동 ${unit}호`, `Daon Village Aprt ${n.replace(/0/g, 'O')}-dong ${unit}-ho`), apt, KIND.typo]
  if (roll < 0.26) return [L(`다온APT ${n}-${unit}`, `Daon APT ${n}-${unit}`), apt, KIND.abbr]
  if (roll < 0.38) return [L(`다온1단지 ${n}동 ${unit}호`, `Daon Complex 1, ${n}-dong ${unit}-ho`), apt, KIND.old]
  if (roll < 0.48) return [L(`다온 마을 ${n}동 ${unit}호`, `DaonVillage ${n}-dong ${unit}-ho`), apt, KIND.spacing]
  if (roll < 0.58) return [L(`다온마을 아파트 ${unit}호`, `Daon Village Apt ${unit}-ho`), apt, KIND.noBldg]
  if (roll < 0.68) return [L(`다온마을 아파트 ${n}동`, `Daon Village Apt ${n}-dong`), apt, KIND.noUnit]
  const villa = pick<[string, string, string]>(LL([
    ['초록빌리 201호', 'V215', '오타'],
    ['다온캐쓸 302호', 'V180', '오타'],
    ['해밀 빌라 B01호', 'V145', '띄어쓰기·누락'],
    ['다솜하우스', 'V110', '호수 누락'],
    ['다온25 편의점 바로 위쪽 빌라 3층', 'V110', '위치 설명'],
    ['다온이십오 편의점', 'STORE', '오타'],
    ['다온마을 관리실 택배함', 'LOCK', '약칭'],
    ['빌라 골목 맨 끝 4층 건물 401호', 'V215', '위치 설명'],
  ], [
    ['Chorog Bila 201-ho', 'V215', KIND.typo],
    ['Daon Kassl 302-ho', 'V180', KIND.typo],
    ['Haemil B01-ho', 'V145', KIND.spacing],
    ['Dasom House', 'V110', KIND.noUnit],
    ['The villa just up from the Daon25 store, 3rd floor', 'V110', KIND.where],
    ['Daon Twenty-Five Convenience Store', 'STORE', KIND.typo],
    ['Daon Village mgmt office parcel box', 'LOCK', KIND.abbr],
    ['Last building at the end of the villa alley, 4th floor, unit 401', 'V215', KIND.where],
  ]))
  return villa
}

/** 받침에 맞는 조사 "로/으로" */
export function ro(word: string) {
  const ch = word.trim().slice(-1)
  const digit: Record<string, boolean> = { '0': true, '1': false, '2': false, '3': true, '4': false, '5': false, '6': true, '7': false, '8': false, '9': false }
  if (ch in digit) return digit[ch] ? '으로' : '로'
  const code = ch.charCodeAt(0) - 0xac00
  if (code < 0 || code > 11171) return '로'
  const fin = code % 28
  return fin === 0 || fin === 8 ? '로' : '으로'
}

export function ruleAddr(c: { label: string; candidates: { id: string; score: number }[] }): AddrAnswer {
  const [a, b] = c.candidates
  const ok = a && a.score >= 0.55 && (!b || a.score - b.score >= 0.08)
  return { stop: ok ? a.id : 'none', confidence: ok ? 1 : 0, unitMissing: /호|층|무인|편의점/.test(c.label) || /\d\s*-?\s*ho\b|\bunit\b|#\s*\d|\b\d+\s*f\b|\b\d+(?:st|nd|rd|th)\s*floor\b|locker|convenience/i.test(c.label) ? 0 : 1 }
}

export class AddressDesk {
  list: AddrCase[] = []
  stats = { cases: 0, fixed: 0, contact: 0, manual: 0, correct: 0, wrong: 0 }
  onCase: ((c: AddrCase) => void) | null = null
  private next = 10
  private seq = 0

  constructor(private sim: Sim) {}

  /** 새 주소(자동 또는 화면에서 직접 입력) */
  add(label?: string): AddrCase {
    const [l, truth, kind] = label ? [label, '', L('직접 입력', 'Manual entry')] : messyLabel()
    const c: AddrCase = {
      id: ++this.seq, time: this.sim.clock, label: l, truth, kind, candidates: candidatesFor(l),
      status: 'pending', ai: null, by: 'rule', outcome: 'manual', stop: null, unitMissing: false, note: '', wait: 0, resolved: false,
    }
    this.list.unshift(c)
    if (this.list.length > 30) this.list.pop()
    this.stats.cases++
    if (this.onCase) this.onCase(c)
    else this.resolve(c, null)
    return c
  }

  resolve(c: AddrCase, a: AddrAnswer | null) {
    const ans = a ?? ruleAddr(c)
    c.ai = a
    c.by = a ? 'ai' : 'rule'
    c.status = 'ready'
    const known = c.candidates.some((x) => x.id === ans.stop)
    c.unitMissing = ans.unitMissing > 0.6
    if (known && ans.confidence >= 0.7) {
      c.outcome = c.unitMissing ? 'contact' : 'fixed'
      c.stop = ans.stop
      const name = STOPS[ans.stop].label
      c.note = c.unitMissing ? L(`${name}${ro(name)} 정정 · 호수 없음 → 알림톡으로 호수 확인`, `Fixed to ${name} · no unit number → ask for it by message`) : L(`${name}${ro(name)} 정정 → 그 동을 도는 배송차에 상차`, `Fixed to ${name} → loaded on the van covering that building`)
    } else if (a) {
      c.outcome = 'contact'
      c.stop = null
      c.note = ans.stop === 'none' ? L('후보 중 확실한 곳 없음 → 고객에게 알림톡으로 주소 확인', 'No clear match among candidates → confirm the address with the customer by message') : L(`판단 불확실(${ans.confidence.toFixed(2)}) → 고객 확인`, `Unclear (${ans.confidence.toFixed(2)}) → check with the customer`)
    } else {
      c.outcome = c.candidates[0]?.score >= 0.55 && ans.stop !== 'none' ? 'fixed' : 'manual'
      c.stop = ans.stop !== 'none' ? ans.stop : null
      c.note = c.stop ? L(`글자 유사도 1등(${c.candidates[0].score.toFixed(2)})으로 정정`, `Fixed to the top text-similarity match (${c.candidates[0].score.toFixed(2)})`) : L('유사도가 낮거나 후보가 비슷함 → 주소 정정 데스크에서 사람이 확인', 'Low similarity or close candidates → staff check at the address fix desk')
    }
    if (c.outcome === 'fixed') this.stats.fixed++
    else if (c.outcome === 'contact') this.stats.contact++
    else this.stats.manual++
    if (c.truth && c.stop) {
      if (c.stop === c.truth) this.stats.correct++
      else this.stats.wrong++
    }
    // 확인이 필요하면 고객 답(알림톡) 또는 사람 확인을 기다린다
    c.wait = c.outcome === 'fixed' ? 0 : c.outcome === 'contact' ? 20 + R() * 25 : 35 + R() * 30
    c.resolved = c.outcome === 'fixed'
  }

  step(dt: number) {
    this.next -= dt
    if (this.next <= 0) {
      this.next = 16 + R() * 18
      this.add()
    }
    for (const c of this.list) {
      if (c.resolved || c.status !== 'ready') continue
      c.wait -= dt
      if (c.wait <= 0) {
        c.resolved = true
        if (c.truth) c.stop = c.truth
        c.note += c.outcome === 'contact' ? L(' → 고객 답장으로 확정', ' → confirmed by customer reply') : L(' → 담당자가 확인해 확정', ' → confirmed by staff')
      }
    }
  }
}
