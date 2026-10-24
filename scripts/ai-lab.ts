// AI(Claude) 적용 후보 실험: 한국어 입력으로 정확도·지연·비용을 잰다.
// 실행: npm run ailab [command|memo|report] (키는 .env 또는 환경 변수 ANTHROPIC_API_KEY, 실제 API 비용이 듭니다)
import { JudgeClient } from '../server/claude'

const client = new JudgeClient()

interface Run {
  ms: number
  tokens: number
}
const runs: Run[] = []

async function ask<Q extends Record<string, any>>(state: unknown, questions: Q) {
  const t0 = performance.now()
  const r = await client.systemOne({ state: state as any, questions })
  runs.push({ ms: performance.now() - t0, tokens: r.usage.input_tokens })
  return r.answers as any
}

import { COMMAND_QUESTIONS, MEMO_QUESTIONS, REPORT_QUESTIONS } from '../server/ai'
const commandQuestions = (_lang: 'en' | 'ko') => COMMAND_QUESTIONS

type Expect = Partial<Record<keyof ReturnType<typeof commandQuestions>, string>>
const COMMANDS: [string, Expect][] = [
  ['부산 항만 보여줘', { action: 'show_site', site: 'BS' }],
  ['이천 창고에서 로봇들 일하는 거 보고 싶어', { action: 'show_site', site: 'IC' }],
  ['전체 지도로 봐야겠다', { action: 'network' }],
  ['우리 택배 지금 어디쯤 가고 있어?', { action: 'follow_story' }],
  ['그 상자 따라가 줘', { action: 'follow_story' }],
  ['인천으로 가는 간선 중에 제일 늦는 차 찾아줘', { action: 'find_vehicle', vehicle_kind: 'box', rank: 'latest' }],
  ['지금 고속도로 달리는 윙바디 있어?', { action: 'find_vehicle', vehicle_kind: 'wing', vehicle_status: 'highway' }],
  ['다온마을에서 배송 중인 기사님들 보여줘', { action: 'find_vehicle', vehicle_kind: 'van', site: 'TW', vehicle_status: 'delivering' }],
  ['냉동차 어디 있지', { action: 'find_vehicle', vehicle_kind: 'reefer' }],
  ['도크 기다리는 트럭 있나', { action: 'find_vehicle', vehicle_status: 'waiting' }],
  ['배터리 떨어져 가는 지게차', { action: 'find_forklift', forklift: 'low_battery' }],
  ['곤지암에서 놀고 있는 지게차 있어?', { action: 'find_forklift', forklift: 'idle', site: 'GJ' }],
  ['4배속으로 돌려', { action: 'set_speed', speed: 'x4' }],
  ['너무 빨라 천천히', { action: 'set_speed', speed: 'x1' }],
  ['최대 속도로 감아 줘', { action: 'set_speed', speed: 'x8' }],
  ['컨테이너 트레일러 지금 뭐 해', { action: 'find_vehicle', vehicle_kind: 'trailer' }],
  ['인천 터미널 분류 상황 어때', { action: 'show_site', site: 'IN' }],
  ['오늘 점심 뭐 먹지', { action: 'none' }],
  ['곤지암 허브로 가자', { action: 'show_site', site: 'GJ' }],
  ['제일 짐 많이 실은 11톤 보여줘', { action: 'find_vehicle', vehicle_kind: 'box', rank: 'most_cargo' }],
  ['이천에서 곤지암 가는 트럭 중 제일 늦는 거', { action: 'find_vehicle', vehicle_kind: 'wing', rank: 'latest' }],
  ['배송 나간 1톤들 어디 있어', { action: 'find_vehicle', vehicle_kind: 'van', vehicle_status: 'delivering' }],
  ['항만에서 크레인 작업하는 거 보자', { action: 'show_site', site: 'BS' }],
  // 되감기(D-38)
  ['20분 전 부산 게이트 막혔을 때로 돌려 줘', { action: 'rewind', minutes_ago: 'm20', event: 'gate', site: 'BS' }],
  ['아까 고속도로 사고 났을 때 다시 보여줘', { action: 'rewind', event: 'incident', minutes_ago: 'none' }],
  ['30분 전으로 되감아', { action: 'rewind', minutes_ago: 'm30', event: 'none' }],
  ['선사에서 배 늦는다고 연락 온 때로 가 봐', { action: 'rewind', event: 'vessel' }],
  ['한 시간 전 곤지암 어땠는지 보자', { action: 'rewind', minutes_ago: 'm60', site: 'GJ' }],
  ['기사님이 타이어 펑크 났다고 했을 때로', { action: 'rewind', event: 'driver' }],
  ['다시 실시간으로 돌아가', { action: 'live' }],
  ['라이브로', { action: 'live' }],
  ['곤지암 정문 막혔을 때 보여줘', { action: 'rewind', event: 'gate', site: 'GJ' }],
  ['인천 서브터미널 지금 상황 보여줘', { action: 'show_site', site: 'IN' }],
]

// ───────────────────────── B. 고객 배송 요청 메모 해석

const memoQuestions = MEMO_QUESTIONS

const MEMOS: [string, { drop: string; no_bell?: boolean; fragile?: boolean; call_first?: boolean }][] = [
  ['문 앞에 놓아주세요', { drop: 'door' }],
  ['부재 시 경비실에 맡겨 주세요', { drop: 'guard' }],
  ['무인택배함에 넣어주시고 비번 문자 부탁드려요', { drop: 'locker', call_first: true }],
  ['아기가 자고 있어요. 벨 누르지 말고 노크도 하지 마세요', { drop: 'unspecified', no_bell: true }],
  ['깨지기 쉬운 유리 제품이에요 조심히 다뤄주세요', { drop: 'unspecified', fragile: true }],
  ['도착하면 전화 주세요 직접 받을게요', { drop: 'handover', call_first: true }],
  ['이번 주는 집에 없어서 다음 주 월요일에 와주세요', { drop: 'reschedule' }],
  ['문 앞에 두지 말고 꼭 경비실에!', { drop: 'guard' }],
  ['택배함 꽉 차 있으면 경비실에 두세요', { drop: 'locker' }],
  ['강아지가 짖어요 벨X 문앞O', { drop: 'door', no_bell: true }],
  ['냉동식품이라 빨리 받아야 해요, 직접 전해 주세요', { drop: 'handover' }],
  ['계란 들어있음 취급주의', { drop: 'unspecified', fragile: true }],
  ['공동현관 비번 1234#, 문 앞에 놔 주세요', { drop: 'door' }],
  ['배송 전에 문자 한 통만 주세요', { drop: 'unspecified', call_first: true }],
  ['', { drop: 'unspecified' }],
  ['무인택배함에 넣어 주세요. 안 되면 문 앞에', { drop: 'locker' }],
  ['초인종 누르지 마시고 문 앞에 두세요', { drop: 'door', no_bell: true }],
  ['경비실은 안 받아요. 무인함에 부탁해요', { drop: 'locker' }],
]

// ───────────────────────── C. 현장 이슈 보고 분류(심각도)

const reportQuestions = REPORT_QUESTIONS

const REPORTS: [string, { category: string; sev: number; stop?: boolean }][] = [
  ['3번 출고 도크 레벨러에서 쇳소리 나요. 작동은 됩니다', { category: 'equipment', sev: 1 }],
  ['하차장 바닥에 기름 새서 지게차 미끄러질 뻔했어요', { category: 'safety', sev: 3, stop: true }],
  ['랩핑 풀린 파렛트에서 상자 3개 떨어져서 찌그러짐', { category: 'cargo', sev: 1 }],
  ['인천 간선 2대가 고속도로 사고로 40분 지연 예상', { category: 'delay', sev: 2 }],
  ['고객이 상자 젖어서 왔다고 사진 보내옴', { category: 'customer', sev: 1 }],
  ['휠소터 S2 스캐너 인식 안 돼서 라인 멈춤', { category: 'equipment', sev: 2 }],
  ['랙 3단에서 상자 떨어져 작업자 어깨 다침', { category: 'safety', sev: 3, stop: true }],
  ['오늘 점심 메뉴 공지 확인 부탁', { category: 'other', sev: 0 }],
  ['다온마을 101동 경비실이 택배 안 받는다고 함', { category: 'customer', sev: 1 }],
  ['컨베이어 벨트 사이에 장갑 끼여서 비상정지 눌렀어요', { category: 'safety', sev: 3, stop: true }],
  ['FL-02 배터리 경고등 깜빡임', { category: 'equipment', sev: 1 }],
  ['냉동탑차 온도가 -5도까지 올라감', { category: 'equipment', sev: 2 }],
]

// ───────────────────────── 실행

const pct = (a: number, b: number) => `${Math.round((a / Math.max(1, b)) * 100)}%`

async function runCommands(lang: 'en' | 'ko') {
  const qs = commandQuestions(lang)
  let fields = 0
  let ok = 0
  let actionOk = 0
  const misses: string[] = []
  const answers = await Promise.all(COMMANDS.map(([c]) => ask({ command: c }, qs)))
  COMMANDS.forEach(([c, exp], i) => {
    const a = answers[i]
    if (a.action.choice === exp.action) actionOk++
    for (const [k, v] of Object.entries(exp)) {
      fields++
      if (a[k].choice === v) ok++
      else misses.push(`  ✗ "${c}" ${k}: ${a[k].choice} (기대 ${v}, conf ${a[k].confidence.toFixed(2)})`)
    }
  })
  console.log(`\n[A] 관제 명령 (지시문 ${lang}) — 동작 ${pct(actionOk, COMMANDS.length)}, 필드 ${pct(ok, fields)} (${ok}/${fields})`)
  misses.forEach((m) => console.log(m))
  return answers
}

async function runMemos() {
  const answers = await Promise.all(MEMOS.map(([m]) => ask({ memo: m }, memoQuestions)))
  let drop = 0
  let flags = 0
  let flagTotal = 0
  const misses: string[] = []
  MEMOS.forEach(([m, exp], i) => {
    const a = answers[i]
    if (a.drop.choice === exp.drop) drop++
    else misses.push(`  ✗ "${m}" drop: ${a.drop.choice} (기대 ${exp.drop}, conf ${a.drop.confidence.toFixed(2)})`)
    for (const f of ['no_bell', 'fragile', 'call_first'] as const) {
      flagTotal++
      const want = !!exp[f]
      const got = a[f].noul > 0.5
      if (want === got) flags++
      else misses.push(`  ✗ "${m}" ${f}: ${a[f].noul.toFixed(2)} (기대 ${want ? '예' : '아니오'})`)
    }
  })
  console.log(`\n[B] 배송 메모 — 맡길 곳 ${pct(drop, MEMOS.length)}, 요청 플래그 ${pct(flags, flagTotal)}`)
  misses.forEach((m) => console.log(m))
}

async function runReports() {
  const answers = await Promise.all(REPORTS.map(([t]) => ask({ report: t }, reportQuestions)))
  let cat = 0
  let sevNear = 0
  let stop = 0
  const misses: string[] = []
  REPORTS.forEach(([t, exp], i) => {
    const a = answers[i]
    if (a.category.choice === exp.category) cat++
    else misses.push(`  ✗ "${t}" category: ${a.category.choice} (기대 ${exp.category})`)
    if (Math.abs(a.severity.score - exp.sev) <= 0.75) sevNear++
    else misses.push(`  ✗ "${t}" severity: ${a.severity.score.toFixed(2)} (기대 ${exp.sev})`)
    if ((a.stop_work.noul > 0.5) === !!exp.stop) stop++
    else misses.push(`  ✗ "${t}" stop_work: ${a.stop_work.noul.toFixed(2)} (기대 ${exp.stop ? '예' : '아니오'})`)
  })
  console.log(`\n[C] 현장 보고 — 분류 ${pct(cat, REPORTS.length)}, 심각도(±0.75) ${pct(sevNear, REPORTS.length)}, 작업중지 ${pct(stop, REPORTS.length)}`)
  misses.forEach((m) => console.log(m))
}

// 실행할 묶음만 고르기: npm run ailab -- command
const only = process.argv[2]
if (!only || only === 'command') await runCommands('en')
if (!only || only === 'memo') await runMemos()
if (!only || only === 'report') await runReports()
const ms = runs.map((r) => r.ms).sort((a, b) => a - b)
const tok = runs.reduce((s, r) => s + r.tokens, 0)
console.log(`\n요청 ${runs.length}건 · 지연 중앙값 ${Math.round(ms[Math.floor(ms.length / 2)])}ms · p90 ${Math.round(ms[Math.floor(ms.length * 0.9)])}ms · 입력 토큰 ${tok.toLocaleString()} (≈ $${((tok / 1e6) * 0.042).toFixed(4)})`)
