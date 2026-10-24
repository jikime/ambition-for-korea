// 2차 실험: 리젝트 재분류·특수 취급, 적하목록 검토, 돌발 상황 영향 구간
import { ADDRESS_QUESTIONS, INCIDENT_QUESTIONS, MANIFEST_QUESTIONS } from '../server/ai'
import { JudgeClient } from '../server/claude'

const client = new JudgeClient()
const lat: number[] = []
let tokens = 0
async function ask(state: unknown, questions: any) {
  const t0 = performance.now()
  const r = await client.systemOne({ state: state as any, questions })
  lat.push(performance.now() - t0)
  tokens += r.usage.input_tokens
  return r.answers as any
}

const PARCELS: [string, string, { terminal: string; flags?: string[] }][] = [
  ['인천 서구 다온마을로 12 103동 1204호 김지은', '세탁세제 3L', { terminal: 'IN', flags: ['liquid'] }],
  ['인천시 서구 다온 아파트 1O3동 12O4호', '유리 화병', { terminal: 'IN', flags: ['fragile'] }],
  ['부산 강서구 신항배후로 220 사무실', '보조배터리 20000mAh 10개', { terminal: 'BS', flags: ['battery'] }],
  ['대전 대덕구 다온물류로 45 2층', '냉동 만두 2kg', { terminal: 'DJ', flags: ['perishable'] }],
  ['강원 원주시 단구로 17', '골프백 (캐디백)', { terminal: 'WJ', flags: ['irregular'] }],
  ['대구 동구 동부로 88 동부빌딩 3층', '노트북', { terminal: 'DG', flags: ['fragile'] }],
  ['경기 광주시 곤지암읍 다온로 7', '자전거 (완성차)', { terminal: 'GJ', flags: ['irregular'] }],
  ['세종시 한별대로 300', '계란 30구', { terminal: 'DJ', flags: ['fragile'] }],
  ['김해시 장유로 50 상가 1층', '참기름 1.8L', { terminal: 'BS', flags: ['liquid'] }],
  ['###  서구  ##동 ###호', '의류', { terminal: 'unknown' }],
  ['춘천 퇴계로 99', '한우 등심 1kg 냉장', { terminal: 'WJ', flags: ['perishable'] }],
  ['청주시 상당구 상당로 10', '헤어스프레이 6개', { terminal: 'DJ', flags: ['battery'] }],
]
const MANIFESTS: [string, string, { dangerous?: boolean; reefer?: boolean; mismatch?: boolean }][] = [
  ['자동차 부품', 'AUTO PARTS - BRAKE PADS', {}],
  ['자동차 부품', 'LITHIUM ION BATTERIES UN3480 PACKED WITH EQUIPMENT', { dangerous: true, mismatch: true }],
  ['냉동 새우', 'FROZEN SHRIMP -18C', { reefer: true }],
  ['의류', 'USED CLOTHING IN BALES', {}],
  ['완구', 'PERFUME 100ML, FLAMMABLE LIQUID UN1266', { dangerous: true, mismatch: true }],
  ['화장품', 'COSMETICS: LIPSTICK, CREAM', {}],
  ['신선 과일', 'FRESH BANANAS 13C', { reefer: true }],
  ['가구', 'WOODEN FURNITURE - CHAIRS', {}],
  ['기계 부품', 'COMPRESSED NITROGEN GAS CYLINDERS UN1066', { dangerous: true, mismatch: true }],
  ['식료품', 'FROZEN PORK BELLY', { reefer: true }],
  ['전자제품', 'LED TV 55 INCH', {}],
  ['잡화', 'CIGARETTES 50 CARTONS', { mismatch: true }],
]
const INCIDENTS: [string, { link: string; impact: number }][] = [
  ['영동고속도로 이천IC 부근 화물차 사고로 2개 차로 통제', { link: 'hw_ic_gj', impact: 2 }],
  ['이천IC~곤지암IC 양방향 전면 통제 (화재)', { link: 'hw_ic_gj', impact: 3 }],
  ['인천 방향 간선도로 공사로 정체 30분', { link: 'hw_gj_in', impact: 2 }],
  ['다온마을 정문 앞 상수도 공사로 차량 진입 불가', { link: 'town_gate', impact: 3 }],
  ['부산신항 강풍주의보, 안벽 크레인 작업 속도 제한', { link: 'port_crane', impact: 2 }],
  ['곤지암IC~이천 구간 가벼운 정체', { link: 'hw_ic_gj', impact: 1 }],
  ['부산 가는 남쪽 도로 폭우로 서행', { link: 'hw_gj_bs', impact: 2 }],
  ['서울 강남역 인근 시위', { link: 'none', impact: 0 }],
  ['인천 서구 방향 고속도로 사고 처리 완료, 정상 소통', { link: 'hw_gj_in', impact: 0 }],
  ['영종대교 공항 방향 안개로 서행', { link: 'hw_gj_ap', impact: 1 }],
  ['중부고속도로 대전 방향 공사로 40분 정체', { link: 'hw_gj_dj', impact: 2 }],
  ['인천 서구 배송터미널 가는 길 공사 정체 20분', { link: 'hw_gj_in', impact: 2 }],
]

const pct = (a: number, b: number) => `${Math.round((a / b) * 100)}%`
{
  const ans = await Promise.all(PARCELS.map(([label, item]) => ask({ label, item }, ADDRESS_QUESTIONS)))
  let term = 0
  let flagOk = 0
  let flagN = 0
  const miss: string[] = []
  PARCELS.forEach(([label, item, exp], i) => {
    const a = ans[i]
    if (a.terminal.choice === exp.terminal) term++
    else miss.push(`  ✗ "${label}" terminal ${a.terminal.choice} (기대 ${exp.terminal}, conf ${a.terminal.confidence.toFixed(2)})`)
    for (const f of ['fragile', 'liquid', 'perishable', 'battery', 'irregular']) {
      flagN++
      const want = exp.flags?.includes(f) ?? false
      if ((a[f].noul > 0.5) === want) flagOk++
      else miss.push(`  ✗ "${item}" ${f} ${a[f].noul.toFixed(2)} (기대 ${want ? '예' : '아니오'})`)
    }
  })
  console.log(`[D] 리젝트 재분류 — 터미널 ${pct(term, PARCELS.length)}, 특수취급 플래그 ${pct(flagOk, flagN)}`)
  miss.forEach((m) => console.log(m))
}
{
  const ans = await Promise.all(MANIFESTS.map(([declared, description]) => ask({ cargo: { declared, description } }, MANIFEST_QUESTIONS)))
  let ok = 0
  let n = 0
  const miss: string[] = []
  MANIFESTS.forEach(([d, desc, exp], i) => {
    for (const f of ['dangerous', 'reefer', 'mismatch'] as const) {
      n++
      const want = !!exp[f]
      if ((ans[i][f].noul > 0.5) === want) ok++
      else miss.push(`  ✗ ${d} / ${desc} ${f} ${ans[i][f].noul.toFixed(2)} (기대 ${want ? '예' : '아니오'})`)
    }
  })
  console.log(`[E] 적하목록 검토 — 플래그 ${pct(ok, n)}`)
  miss.forEach((m) => console.log(m))
}
{
  const ans = await Promise.all(INCIDENTS.map(([t]) => ask({ incident: t }, INCIDENT_QUESTIONS)))
  let link = 0
  let imp = 0
  const miss: string[] = []
  INCIDENTS.forEach(([t, exp], i) => {
    if (ans[i].link.choice === exp.link) link++
    else miss.push(`  ✗ "${t}" link ${ans[i].link.choice} (기대 ${exp.link}, conf ${ans[i].link.confidence.toFixed(2)})`)
    if (Math.abs(ans[i].impact.score - exp.impact) <= 0.75) imp++
    else miss.push(`  ✗ "${t}" impact ${ans[i].impact.score.toFixed(2)} (기대 ${exp.impact})`)
  })
  console.log(`[F] 돌발 상황 — 영향 구간 ${pct(link, INCIDENTS.length)}, 영향도(±0.75) ${pct(imp, INCIDENTS.length)}`)
  miss.forEach((m) => console.log(m))
}
lat.sort((a, b) => a - b)
console.log(`요청 ${lat.length}건 · 중앙값 ${Math.round(lat[lat.length >> 1])}ms · 입력 토큰 ${tokens} (≈ $${((tokens / 1e6) * 0.042).toFixed(4)})`)
