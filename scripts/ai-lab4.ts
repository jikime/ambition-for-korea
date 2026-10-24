// 4차 실험: 새 기능의 질문(고객 문의·반품·콜드체인·HS 통관·주소 정정·명절 공지)을 앱에 흘러가는 문장과
// 일부러 헷갈리게 쓴 문장으로 확인한다. 정답과 비교하고, 코드 정책을 거친 최종 처리도 함께 본다.
// 사용: npm run ailab4 -- [inquiry|return|cold|hs|addr|notice|qc|driver|vessel] (생략하면 전부)
import { COLD_QUESTIONS, DRIVER_QUESTIONS, VESSEL_QUESTIONS, HS_QUESTIONS, INQUIRY_QUESTIONS, NOTICE_QUESTIONS, QC_QUESTIONS, RETURN_QUESTIONS, fixAddresses } from '../server/ai'
import { ruleQc } from '../src/sim/djwh'
import { ruleDriver } from '../src/sim/driver'
import { ruleVessel } from '../src/sim/vessel'
import { fromNotice, ruleNotice } from '../src/sim/scenario'
import { STOP_HINT, candidatesFor, ruleAddr } from '../src/sim/addrfix'
import { MANIFEST_POOL } from '../src/sim/port'
import { INQUIRY_POOL, RETURN_POOL } from '../src/sim/cs'
import { JudgeClient } from '../server/claude'

const client = new JudgeClient()
const only = process.argv[2]
const on = (k: string) => !only || only === k
const lat: number[] = []
let tokens = 0
async function ask(state: unknown, questions: any) {
  const t0 = performance.now()
  const r = await client.systemOne({ state: state as any, questions })
  lat.push(performance.now() - t0)
  tokens += r.usage.input_tokens
  return r.answers as any
}
const pct = (a: number, b: number) => `${Math.round((a / b) * 100)}%`

if (on('inquiry')) {
  // 앱 문장 + 헷갈리는 문장(정답 의도, 필요한 값)
  const extra: { text: string; hint: string; drop?: string; when?: string; reason?: string; unopened?: boolean }[] = [
    { text: '경비실은 밤에 문을 닫아서요, 그냥 문 앞에 놔 주세요', hint: 'change_drop', drop: 'door' },
    { text: '택배 언제 와요? 5시에 나가야 해서 그 전에 오면 좋겠어요', hint: 'where_is' },
    { text: '어제 받은 신발 반품할게요 한 번 신어 봤어요', hint: 'return', reason: 'other' },
    { text: '박스가 다 젖어서 왔네요 안에 책 다 버렸어요', hint: 'complaint', reason: 'damaged' },
    { text: '토요일에 받을 수 있게 해 주세요', hint: 'reschedule', when: 'weekend' },
    { text: '기사님 오시면 1층 편의점에 맡겨 달라고 전해 주실래요?', hint: 'contact_driver' },
    { text: '배송 완료 떴는데 우리 집 아니고 옆 동에 놓고 가셨어요', hint: 'complaint' },
    { text: '진짜 몇 번째예요 또 늦네 오늘 안 오면 취소할 거예요', hint: 'where_is' },
  ]
  const items = [...INQUIRY_POOL.map((p) => ({ text: p.text, hint: p.hint as string })), ...extra]
  const ans = await Promise.all(items.map((p) => ask({ message: p.text }, INQUIRY_QUESTIONS)))
  let ok = 0
  let human = 0
  let wrongAuto = 0
  const lines: string[] = []
  items.forEach((p, i) => {
    const a = ans[i]
    const intent = a.intent.choice
    const conf = a.intent.confidence
    const hit = intent === p.hint
    if (hit) ok++
    // 코드 정책: 의도 확신 0.55 미만이면 상담원
    const toHuman = conf < 0.55
    if (toHuman) human++
    else if (!hit) wrongAuto++
    const e = extra.find((x) => x.text === p.text)
    const detail = [
      e?.drop ? `drop ${a.drop.choice}${a.drop.choice === e.drop ? '✓' : '✗'}` : intent === 'change_drop' ? `drop ${a.drop.choice}` : '',
      e?.when ? `when ${a.when.choice}${a.when.choice === e.when ? '✓' : '✗'}` : intent === 'reschedule' ? `when ${a.when.choice}` : '',
      e?.reason ? `reason ${a.reason.choice}${a.reason.choice === e.reason ? '✓' : '✗'}` : intent === 'return' || intent === 'complaint' ? `reason ${a.reason.choice}` : '',
      `미개봉 ${a.unopened.noul.toFixed(2)}`,
      `화남 ${a.upset.noul.toFixed(2)}`,
    ].filter(Boolean).join(' · ')
    lines.push(`  ${toHuman ? '·' : hit ? '✓' : '✗'} "${p.text}" → ${intent} ${conf.toFixed(2)} (정답 ${p.hint}) ${detail}`)
  })
  console.log(`[A] 고객 문의 ${items.length}건 — 의도 ${pct(ok, items.length)} · 상담원 연결 ${human} · 자동 오처리 ${wrongAuto}`)
  lines.forEach((l) => console.log(l))
}

if (on('return')) {
  const truth: { reason: string; unopened: boolean; carrier: boolean }[] = [
    { reason: 'changed_mind', unopened: true, carrier: false },
    { reason: 'size', unopened: false, carrier: false },
    { reason: 'damaged', unopened: false, carrier: true },
    { reason: 'wrong_item', unopened: false, carrier: false },
    { reason: 'late', unopened: true, carrier: false },
    { reason: 'defective', unopened: false, carrier: false },
    { reason: 'changed_mind', unopened: true, carrier: false },
    { reason: 'other', unopened: false, carrier: false },
  ]
  const ans = await Promise.all(RETURN_POOL.map((t) => ask({ reason_text: t }, RETURN_QUESTIONS)))
  let reason = 0
  let unopened = 0
  let carrier = 0
  const lines: string[] = []
  RETURN_POOL.forEach((t, i) => {
    const a = ans[i]
    const T = truth[i]
    if (a.reason.choice === T.reason) reason++
    if (a.unopened.noul > 0.5 === T.unopened) unopened++
    if (a.carrier_damage.noul > 0.5 === T.carrier) carrier++
    lines.push(`  "${t}" → ${a.reason.choice}${a.reason.choice === T.reason ? '✓' : '✗(' + T.reason + ')'} ${a.reason.confidence.toFixed(2)} · 미개봉 ${a.unopened.noul.toFixed(2)}${a.unopened.noul > 0.5 === T.unopened ? '✓' : '✗'} · 운송 파손 ${a.carrier_damage.noul.toFixed(2)}${a.carrier_damage.noul > 0.5 === T.carrier ? '✓' : '✗'}`)
  })
  console.log(`[B] 반품 사유 ${RETURN_POOL.length}건 — 사유 ${pct(reason, 8)} · 미개봉 ${pct(unopened, 8)} · 운송 중 파손 ${pct(carrier, 8)}`)
  lines.forEach((l) => console.log(l))
}

if (on('cold')) {
  // 메시지 + 센서 값, 정답(냉동기 고장 / 문 문제 / 회복 중)
  const cases: { message: string; current: number; failure: boolean; door: boolean; recovering: boolean }[] = [
    { message: '냉동기 쪽에서 덜컹거리는 소리가 나더니 표시창 온도가 계속 올라가요', current: -15.2, failure: true, door: false, recovering: false },
    { message: '냉동기 팬이 안 도는 것 같아요. 찬바람이 안 나와요', current: -16.1, failure: true, door: false, recovering: false },
    { message: '컴프레서 경고등이 들어오고 온도가 안 내려갑니다', current: -14.0, failure: true, door: false, recovering: false },
    { message: '뒷문 고무 패킹이 찢어져서 문이 꽉 안 닫히는 것 같아요', current: -15.8, failure: false, door: true, recovering: false },
    { message: '상차 끝나고 보니 옆문 잠금이 반쯤 걸려 있었어요. 틈으로 바람이 들어와요', current: -16.4, failure: false, door: true, recovering: false },
    { message: '휴게소에서 쉬는 동안 온도가 조금 올랐는데 지금은 다시 내려가는 중이에요', current: -15.5, failure: false, door: false, recovering: true },
    { message: '오늘 새벽 물량이 많아서 상차 때 문을 자주 열었어요. 지금은 정상입니다', current: -17.4, failure: false, door: false, recovering: true },
    { message: '온도 표시가 잠깐 깜빡였는데 냉동기는 정상으로 돌아가는 소리가 나요', current: -17.2, failure: false, door: false, recovering: false },
    { message: '시동 껐다 켰더니 냉동기가 다시 안 돌아요', current: -13.1, failure: true, door: false, recovering: false },
    { message: '문은 확실히 닫았고 냉동기도 잘 돌아가요. 온도 정상', current: -17.9, failure: false, door: false, recovering: false },
  ]
  const ans = await Promise.all(cases.map((c) => ask({ message: c.message, reading: { cargo: 'frozen', setpoint_c: -18, current_c: c.current, limit_c: -12 } }, COLD_QUESTIONS)))
  let f = 0
  let d = 0
  let rc = 0
  const lines: string[] = []
  cases.forEach((c, i) => {
    const a = ans[i]
    const F = a.cooling_failure.noul > 0.6
    const D = a.door_issue.noul > 0.6
    const RC = a.recovering.noul > 0.6
    if (F === c.failure) f++
    if (D === c.door) d++
    if (RC === c.recovering) rc++
    // 코드 정책(src/sim/cold.ts resolve와 같은 순서)
    const act = c.current > -12 ? '재냉각(한계 초과)' : RC && !F && !D ? '회복 중 · 조치 없음' : F ? '재냉각(고장)' : D ? '도어 점검' : c.current > -15 ? '모니터링' : '조치 없음'
    lines.push(`  "${c.message}" (${c.current}°C) → 고장 ${a.cooling_failure.noul.toFixed(2)}${F === c.failure ? '✓' : '✗'} · 문 ${a.door_issue.noul.toFixed(2)}${D === c.door ? '✓' : '✗'} · 회복 ${a.recovering.noul.toFixed(2)}${RC === c.recovering ? '✓' : '✗'} · 위험 ${a.risk.score.toFixed(1)} ⇒ ${act}`)
  })
  console.log(`[C] 냉동탑차 메시지 ${cases.length}건 — 냉동기 고장 ${pct(f, cases.length)} · 문 문제 ${pct(d, cases.length)} · 회복 중 ${pct(rc, cases.length)}`)
  lines.forEach((l) => console.log(l))
}

if (on('hs')) {
  // 상세 설명 류(허용 답 여러 개), 신고 품명 류, 불일치로 걸러야 하는가(? = 애매)
  const truth: { desc: string[]; decl: string[]; mismatch: boolean | null }[] = [
    { desc: ['87'], decl: ['87'], mismatch: false },
    { desc: ['85'], decl: ['87'], mismatch: true },
    { desc: ['03'], decl: ['03'], mismatch: false },
    { desc: ['61'], decl: ['61'], mismatch: false },
    { desc: ['33'], decl: ['95'], mismatch: true },
    { desc: ['33'], decl: ['33'], mismatch: false },
    { desc: ['08'], decl: ['08'], mismatch: false },
    { desc: ['94'], decl: ['94'], mismatch: false },
    { desc: ['28'], decl: ['87', 'other'], mismatch: true },
    { desc: ['02'], decl: ['21', 'other', 'mixed'], mismatch: null },
    { desc: ['85'], decl: ['85'], mismatch: false },
    { desc: ['24'], decl: ['other', 'mixed'], mismatch: true },
    { desc: ['02'], decl: ['02'], mismatch: false },
    { desc: ['32'], decl: ['32'], mismatch: false },
    { desc: ['40'], decl: ['40'], mismatch: false },
    { desc: ['34', '33'], decl: ['34', 'other', 'mixed'], mismatch: null },
    { desc: ['21'], decl: ['21'], mismatch: false },
    { desc: ['09'], decl: ['09'], mismatch: false },
    { desc: ['30'], decl: ['30'], mismatch: false },
    { desc: ['73'], decl: ['73'], mismatch: false },
    { desc: ['mixed'], decl: ['mixed'], mismatch: false },
    { desc: ['21', 'mixed'], decl: ['mixed'], mismatch: false },
    { desc: ['61', 'mixed'], decl: ['61'], mismatch: false },
  ]
  const ans = await Promise.all(MANIFEST_POOL.map((c) => ask({ cargo: { declared: c.declared, description: c.description } }, HS_QUESTIONS)))
  let desc = 0
  let decl = 0
  let mm = 0
  let mmN = 0
  const lines: string[] = []
  MANIFEST_POOL.forEach((c, i) => {
    const a = ans[i]
    const T = truth[i]
    const okD = T.desc.includes(a.chapter.choice)
    const okC = T.decl.includes(a.declared_chapter.choice)
    if (okD) desc++
    if (okC) decl++
    // 코드 정책(src/sim/customs.ts resolve)
    const sure = a.chapter.confidence >= 0.6 && a.declared_chapter.confidence >= 0.6
    const broadOk = a.personal.noul > 0.5 && (a.chapter.choice === 'mixed' || a.declared_chapter.choice === 'mixed')
    const flagged = sure && !broadOk && a.chapter.choice !== a.declared_chapter.choice
    if (T.mismatch !== null) {
      mmN++
      if (flagged === T.mismatch) mm++
    }
    const mark = T.mismatch === null ? '?' : flagged === T.mismatch ? '✓' : '✗'
    lines.push(`  ${mark} ${c.declared} / ${c.description} → 내용 ${a.chapter.choice}${okD ? '' : '✗'} ${a.chapter.confidence.toFixed(2)} · 신고 ${a.declared_chapter.choice}${okC ? '' : '✗'} ${a.declared_chapter.confidence.toFixed(2)} · 직구 ${a.personal.noul.toFixed(2)} ⇒ ${flagged ? '정밀 심사' : '통관 진행'}`)
  })
  console.log(`[D] HS 분류 ${MANIFEST_POOL.length}건 — 상세 설명 류 ${pct(desc, MANIFEST_POOL.length)} · 신고 품명 류 ${pct(decl, MANIFEST_POOL.length)} · 불일치 판정 ${mm}/${mmN}`)
  lines.forEach((l) => console.log(l))
}

if (on('addr')) {
  // 주소 표기, 정답(null이면 동을 알 수 없어 고객 확인이 맞음), 호수 누락 정답
  const cases: { label: string; truth: string | null; unitMissing: boolean }[] = [
    { label: '다온마을 아퍄트 1O2동 805호', truth: 'A102', unitMissing: false },
    { label: '다온APT 104-1203', truth: 'A104', unitMissing: false },
    { label: '다온1단지 105동 302호', truth: 'A105', unitMissing: false },
    { label: '다온 마을 106동 701호', truth: 'A106', unitMissing: false },
    { label: '다온마을 아파트 805호', truth: null, unitMissing: false },
    { label: '다온마을 아파트 103동', truth: 'A103', unitMissing: true },
    { label: '초록빌리 201호', truth: 'V215', unitMissing: false },
    { label: '다온캐쓸 302호', truth: 'V180', unitMissing: false },
    { label: '해밀 빌라 B01호', truth: 'V145', unitMissing: false },
    { label: '다솜하우스', truth: 'V110', unitMissing: true },
    { label: '다온25 편의점 바로 위쪽 빌라 3층', truth: 'V110', unitMissing: false },
    { label: '다온이십오 편의점', truth: 'STORE', unitMissing: false },
    { label: '다온마을 관리실 택배함', truth: 'LOCK', unitMissing: false },
    { label: '빌라 골목 맨 끝 4층 건물 401호', truth: 'V215', unitMissing: false },
    { label: '다온 아파트 101 동 1502', truth: 'A101', unitMissing: false },
    { label: '다온마을 2동 302호', truth: null, unitMissing: false },
  ]
  const t0 = performance.now()
  const ans = await fixAddresses(cases.map((c) => ({ label: c.label, candidates: candidatesFor(c.label).map((x) => ({ id: x.id, desc: STOP_HINT[x.id] })) })))
  lat.push(performance.now() - t0)
  let jok = 0
  let jbad = 0
  let jask = 0
  let rok = 0
  let rbad = 0
  let rask = 0
  let unit = 0
  const lines: string[] = []
  cases.forEach((c, i) => {
    const a = ans[i]
    const cand = candidatesFor(c.label)
    // 코드 정책(src/sim/addrfix.ts resolve): 후보 안 + 확신 0.7 이상이면 정정, 아니면 고객 확인
    const jFix = cand.some((x) => x.id === a.stop) && a.confidence >= 0.7 ? a.stop : null
    if (jFix === null) jask++
    else if (jFix === c.truth) jok++
    else jbad++
    const r = ruleAddr({ label: c.label, candidates: cand })
    const rFix = r.stop !== 'none' ? r.stop : null
    if (rFix === null) rask++
    else if (rFix === c.truth) rok++
    else rbad++
    if (a.unitMissing > 0.6 === c.unitMissing) unit++
    const mark = (fix: string | null) => (fix === null ? (c.truth === null ? '확인✓' : '확인') : fix === c.truth ? `${fix}✓` : `${fix}✗`)
    lines.push(`  "${c.label}" (정답 ${c.truth ?? '알 수 없음'}) → AI ${a.stop} ${a.confidence.toFixed(2)} ⇒ ${mark(jFix)} · 호수 누락 ${a.unitMissing.toFixed(2)}${a.unitMissing > 0.6 === c.unitMissing ? '' : '✗'} | 규칙 ⇒ ${mark(rFix)} [후보 ${cand.map((x) => `${x.id} ${x.score.toFixed(2)}`).join(', ')}]`)
  })
  console.log(`[E] 주소 정정 ${cases.length}건 — AI: 정정 ${jok + jbad}(오정정 ${jbad}) · 고객 확인 ${jask} | 규칙: 정정 ${rok + rbad}(오정정 ${rbad}) · 사람 확인 ${rask} | 호수 누락 ${pct(unit, cases.length)}`)
  lines.forEach((l) => console.log(l))
}

if (on('notice')) {
  // 공지, 정답(행사, 규모 점수 범위, 냉장, 수입, 날씨)
  const cases: { text: string; event: string; scale: [number, number]; cold: boolean; imports: boolean; weather: boolean }[] = [
    { text: '다음 주 추석 연휴를 앞두고 선물세트 주문이 평소의 두 배 가까이 몰릴 예정입니다. 특히 한우·과일 같은 냉장 선물이 많습니다.', event: 'chuseok', scale: [1.6, 3], cold: true, imports: false, weather: false },
    { text: '광군제 주간에 중국발 해외 직구 물량이 크게 늘어 부산신항 수입 컨테이너가 평소보다 많이 들어옵니다.', event: 'black_friday', scale: [1, 3], cold: false, imports: true, weather: false },
    { text: '이번 주말 태풍 북상으로 중부지방에 강한 비바람이 예상됩니다. 물량은 평소와 비슷합니다.', event: 'monsoon', scale: [0, 0.7], cold: false, imports: false, weather: true },
    { text: '설 명절 대목입니다. 작년 설 대비 물량 30% 증가 예상, 제수용 과일·정육 냉장 물량 비중 큼', event: 'seollal', scale: [0.7, 1.6], cold: true, imports: false, weather: false },
    { text: '다온몰 창립 기념 반값 행사가 금요일부터 시작됩니다. 생활용품 위주로 주문이 평소의 1.5배 수준', event: 'promo', scale: [1, 2.2], cold: false, imports: false, weather: false },
    { text: '추석 연휴가 끝나 다음 주부터 물량은 평소 수준으로 돌아옵니다', event: 'none', scale: [0, 0.7], cold: false, imports: false, weather: false },
    { text: '블프 직구 시즌인데 장마까지 겹쳐서 항만 작업이 자주 멈출 것 같습니다. 직구 물량은 두 배 넘게 예상', event: 'black_friday', scale: [2.2, 3], cold: false, imports: true, weather: true },
  ]
  const ans = await Promise.all(cases.map((c) => ask({ notice: c.text }, NOTICE_QUESTIONS)))
  let ev = 0
  let sc = 0
  let fl = 0
  let rev = 0
  const lines: string[] = []
  cases.forEach((c, i) => {
    const a = ans[i]
    const okE = a.event.choice === c.event
    const okS = a.scale.score >= c.scale[0] && a.scale.score <= c.scale[1]
    const okF = (a.cold.noul > 0.6) === c.cold && (a.imports.noul > 0.6) === c.imports && (a.weather.noul > 0.6) === c.weather
    if (okE) ev++
    if (okS) sc++
    if (okF) fl++
    const r = ruleNotice(c.text)
    if (r.event === c.event) rev++
    const s = fromNotice({ event: a.event.choice, eventConfidence: a.event.confidence, scale: a.scale.score, cold: a.cold.noul, imports: a.imports.noul, weather: a.weather.noul })
    lines.push(`  "${c.text.slice(0, 40)}…" → ${a.event.choice}${okE ? '✓' : '✗(' + c.event + ')'} ${a.event.confidence.toFixed(2)} · 규모 ${a.scale.score.toFixed(2)}${okS ? '✓' : '✗'} · 냉장 ${a.cold.noul.toFixed(2)} 수입 ${a.imports.noul.toFixed(2)} 날씨 ${a.weather.noul.toFixed(2)}${okF ? '✓' : '✗'} ⇒ ${s.summary.join(' · ')} | 규칙 ${r.event}${r.event === c.event ? '✓' : '✗'}`)
  })
  console.log(`[F] 물량 공지 ${cases.length}건 — 행사 ${pct(ev, cases.length)} · 규모 ${pct(sc, cases.length)} · 영향 3종 ${pct(fl, cases.length)} | 규칙 행사 ${pct(rev, cases.length)}`)
  lines.forEach((l) => console.log(l))
}

if (on('qc')) {
  // 검수 메모, 정답(파손·수량·들기 위험·라벨)
  const cases: { note: string; d: boolean; m: boolean; u: boolean; l: boolean }[] = [
    { note: '랩 일부 찢어짐, 상자 2개 모서리 젖음', d: true, m: false, u: false, l: false },
    { note: '송장 48박스인데 세어 보니 46박스', d: false, m: true, u: false, l: false },
    { note: '파렛트 하단 받침 하나가 부러져 지게차로 들면 위험해 보임', d: false, m: false, u: true, l: false },
    { note: '라벨이 번져서 바코드가 안 읽힘', d: false, m: false, u: false, l: true },
    { note: '외관 이상 없음, 수량 일치', d: false, m: false, u: false, l: false },
    { note: '상단 상자가 기울어 있음. 다시 쌓아야 할 듯', d: false, m: false, u: true, l: false },
    { note: '박스 찌그러짐 1건, 내용물은 괜찮아 보임', d: true, m: false, u: false, l: false },
    { note: '수량 맞음. 라벨만 살짝 구겨졌는데 스캔은 됨', d: false, m: false, u: false, l: false },
    { note: '랩이 느슨하긴 한데 상자는 멀쩡함', d: false, m: false, u: false, l: false },
    { note: '2박스 더 왔음(50박스), 송장은 48', d: false, m: true, u: false, l: false },
  ]
  const ans = await Promise.all(cases.map((c) => ask({ note: c.note }, QC_QUESTIONS)))
  let ok = 0
  let rok = 0
  const lines: string[] = []
  cases.forEach((c, i) => {
    const a = ans[i]
    const got = { d: a.damaged.noul > 0.6, m: a.mismatch.noul > 0.6, u: a.unsafe.noul > 0.6, l: a.label.noul > 0.6 }
    const hit = got.d === c.d && got.m === c.m && got.u === c.u && got.l === c.l
    if (hit) ok++
    const r = ruleQc(c.note)
    const rhit = (r.damaged > 0.6) === c.d && (r.mismatch > 0.6) === c.m && (r.unsafe > 0.6) === c.u && (r.label > 0.6) === c.l
    if (rhit) rok++
    lines.push(`  ${hit ? '✓' : '✗'} "${c.note}" → 파손 ${a.damaged.noul.toFixed(2)} · 수량 ${a.mismatch.noul.toFixed(2)} · 위험 ${a.unsafe.noul.toFixed(2)} · 라벨 ${a.label.noul.toFixed(2)} | 규칙 ${rhit ? '✓' : '✗'}`)
  })
  console.log(`[G] 입고 검수 메모 ${cases.length}건 — 4가지 판정 모두 맞음 ${pct(ok, cases.length)} | 낱말 규칙 ${pct(rok, cases.length)}`)
  lines.forEach((l) => console.log(l))
}

if (on('driver')) {
  // 기사 메시지(⑮): 정답 사유 · 운행 불가 · 지연 단계(0~3) · 통화 요청. 앱 풀 + 헷갈리는 문장
  const cases: { text: string; reason: string; cannot: boolean; delay: number; call: boolean }[] = [
    { text: '타이어 펑크 났어요. 갓길에서 교체하면 40분쯤 늦을 것 같습니다', reason: 'breakdown', cannot: false, delay: 2, call: false },
    { text: '앞차랑 접촉 사고 났습니다. 경찰 오는 중이라 운행 못 할 것 같아요', reason: 'accident', cannot: true, delay: 3, call: false },
    { text: '배가 너무 아파서 더는 운전 못 하겠어요. 교대 부탁드립니다', reason: 'health', cannot: true, delay: 3, call: false },
    { text: '점심 먹고 15분 뒤에 출발할게요', reason: 'break', cannot: false, delay: 1, call: false },
    { text: '도크가 다 차서 대기 중이에요. 전화 한 통 부탁드려요', reason: 'customer', cannot: false, delay: 1, call: true },
    { text: '정상 운행 중입니다. 예정대로 도착해요', reason: 'other', cannot: false, delay: 0, call: false },
    { text: '시동이 안 걸려요. 견인차 불러야 할 것 같습니다. 연락 주세요', reason: 'breakdown', cannot: true, delay: 3, call: true },
    // 헷갈리는 것: "못 할 뻔했다"는 운행 가능, "사고 현장 지나는 중"은 정체, 숫자 없이 "꽤 늦어요"
    { text: '사고 날 뻔했는데 괜찮아요. 계속 갑니다', reason: 'other', cannot: false, delay: 0, call: false },
    { text: '앞에 사고 현장 지나가느라 길이 막혀요. 한 시간은 걸릴 듯', reason: 'traffic', cannot: false, delay: 3, call: false },
    { text: '허리를 삐끗해서 남은 집은 못 돌 것 같아요', reason: 'health', cannot: true, delay: 3, call: false },
    { text: '냉동기 소리가 이상해서 한번 봐 주실 수 있을까요? 일단 운행은 합니다', reason: 'breakdown', cannot: false, delay: 0, call: false },
    { text: '고객님이 안 계셔서 10분 기다렸다가 다음 집 갑니다', reason: 'customer', cannot: false, delay: 1, call: false },
  ]
  const ans = await Promise.all(cases.map((c) => ask({ message: c.text }, DRIVER_QUESTIONS)))
  let ok = 0
  let rok = 0
  const lines: string[] = []
  cases.forEach((c, i) => {
    const a = ans[i]
    const got = { reason: a.reason.choice, cannot: a.cannot_continue.noul > 0.6, delay: Math.round(a.delay.score), call: a.call.noul > 0.6 }
    // 사유 · 운행 불가 · 통화는 정확히, 지연은 한 단계 차이까지 허용
    const hit = got.reason === c.reason && got.cannot === c.cannot && got.call === c.call && Math.abs(got.delay - c.delay) <= 1
    if (hit) ok++
    const r = ruleDriver(c.text)
    const rhit = r.reason === c.reason && (r.cannotContinue > 0.6) === c.cannot && (r.call > 0.6) === c.call && Math.abs(r.delay - c.delay) <= 1
    if (rhit) rok++
    lines.push(`  ${hit ? '✓' : '✗'} "${c.text}" → ${got.reason}(${a.reason.confidence.toFixed(2)}) · 불가 ${a.cannot_continue.noul.toFixed(2)} · 지연 ${a.delay.score.toFixed(2)} · 통화 ${a.call.noul.toFixed(2)} | 규칙 ${rhit ? '✓' : '✗'} ${r.reason}`)
  })
  console.log(`[H] 기사 메시지 ${cases.length}건 — 모두 맞음 ${pct(ok, cases.length)} | 낱말 규칙 ${pct(rok, cases.length)}`)
  lines.forEach((l) => console.log(l))
}

if (on('vessel')) {
  // ⑯ 선사 지연 통보: 정답 지연 단계(0~3) · 원인 · 확정 · 기항 취소
  const cases: { text: string; delay: number; cause: string; confirmed: boolean; skip: boolean }[] = [
    { text: 'HANBIT STAR 태풍 영향으로 상하이 출항 지연, 부산 입항 약 5시간 늦어질 예정(확정)', delay: 2, cause: 'weather', confirmed: true, skip: false },
    { text: 'SEOHAE PIONEER 기관 점검으로 입항 2시간 지연 확정', delay: 1, cause: 'mechanical', confirmed: true, skip: false },
    { text: 'KORI BRIDGE 전 기항지 혼잡으로 입항이 3~4시간 늦어질 수 있음, 확정되면 다시 안내', delay: 2, cause: 'congestion', confirmed: false, skip: false },
    { text: 'DAON OCEAN 예정대로 입항합니다', delay: 0, cause: 'other', confirmed: true, skip: false },
    { text: 'HANBIT STAR 일정 조정으로 이번 항차 부산 기항 생략', delay: 3, cause: 'schedule', confirmed: true, skip: true },
    { text: 'SEOHAE PIONEER 짙은 안개로 도선 대기, 약 1시간 지연 예상', delay: 1, cause: 'weather', confirmed: false, skip: false },
    // 헷갈리는 것: 지연이 "해소"됨, 다른 항구 이야기
    { text: 'KORI BRIDGE 앞서 안내한 3시간 지연은 해소되어 정시 입항 확정', delay: 0, cause: 'other', confirmed: true, skip: false },
    { text: 'DAON OCEAN 선원 교대로 출항이 하루 늦어져 입항 일정 미정', delay: 3, cause: 'mechanical', confirmed: false, skip: false },
  ]
  const ans = await Promise.all(cases.map((c) => ask({ notice: c.text }, VESSEL_QUESTIONS)))
  let ok = 0
  let rok = 0
  const lines: string[] = []
  cases.forEach((c, i) => {
    const a = ans[i]
    const got = { delay: Math.round(a.delay.score), cause: a.cause.choice, confirmed: a.confirmed.noul > 0.6, skip: a.skip.noul > 0.6 }
    // 최종 처리로 비교한다(코드 정책과 같은 순서): 기항 취소 → 지연 없음 → 확정 지연(단계 ±1 허용) → 미확정 주의.
    // 확정 여부는 지연이 있을 때만 의미가 있다
    const decide = (d: number, conf: boolean, skip: boolean) => (skip ? 'skip' : d < 0.5 ? 'none' : conf ? `delay${d}` : 'warn')
    const same = (a: string, b: string) => a === b || (a.startsWith('delay') && b.startsWith('delay') && Math.abs(Number(a.slice(5)) - Number(b.slice(5))) <= 1)
    const want = decide(c.delay, c.confirmed, c.skip)
    const hit = same(decide(got.delay, got.confirmed, got.skip), want)
    if (hit) ok++
    const r = ruleVessel(c.text)
    const rhit = same(decide(Math.round(r.delay), r.confirmed > 0.6, r.skip > 0.6), want)
    if (rhit) rok++
    lines.push(`  ${hit ? '✓' : '✗'} "${c.text}" → 지연 ${a.delay.score.toFixed(2)} · ${got.cause}${got.cause === c.cause ? '' : `(기대 ${c.cause})`} · 확정 ${a.confirmed.noul.toFixed(2)} · 취소 ${a.skip.noul.toFixed(2)} | 규칙 ${rhit ? '✓' : '✗'}`)
  })
  console.log(`[I] 선사 지연 통보 ${cases.length}건 — 최종 처리(선석 일정) 맞음 ${pct(ok, cases.length)} | 낱말 규칙 ${pct(rok, cases.length)}`)
  lines.forEach((l) => console.log(l))
}

const sorted = [...lat].sort((a, b) => a - b)
console.log(`\n호출 ${lat.length}회 · 지연 p50 ${Math.round(sorted[Math.floor(sorted.length / 2)] ?? 0)}ms · p90 ${Math.round(sorted[Math.floor(sorted.length * 0.9)] ?? 0)}ms · 입력 토큰 ${tokens}`)
