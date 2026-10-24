// 운영 센터 기능 헤드리스 점검(AI 훅 없음 = 기본 규칙): 고객 문의·반품·콜드체인·통관·주소 정정·경로 최적화·탄소·대전 허브·휴게.
// 사용: npm run ops -- [스텝(기본 18000 = 30분)] [routes] — routes를 붙이면 처음부터 최적 노선을 적용한다
import { sim } from '../src/sim/sim'
import { INTENT_LABEL, DISPOSITION_LABEL, RETURN_STEPS } from '../src/sim/cs'
import { ACTION_LABEL } from '../src/sim/cold'

const N = Number(process.argv[2] ?? 18000)
if (process.argv[3] === 'routes') sim.zones.apply(true)
for (let i = 0; i < N; i++) sim.step(0.1)
const min = (N / 600).toFixed(0)
const cs = sim.cs.stats
console.log(`[${min}분] 배송 ${sim.stats.delivered - sim.stats.deliveredBase} · 간선 출고 ${sim.stats.trucksOut}`)
console.log(`고객 문의 ${cs.inquiries}건 · 자동 처리 ${cs.auto} · 상담원 ${cs.human} ·`, Object.entries(cs.byIntent).map(([k, n]) => `${INTENT_LABEL[k as keyof typeof INTENT_LABEL]} ${n}`).join(' / '))
const stages = RETURN_STEPS.map((s, i) => `${s.label} ${sim.cs.returns.filter((r) => r.stage === i).length}`).join(' · ')
console.log(`반품 ${cs.returns}건 · 처리 완료 ${cs.done} (${Object.entries(cs.byDisp).map(([k, n]) => `${DISPOSITION_LABEL[k as keyof typeof DISPOSITION_LABEL]} ${n}`).join(', ')}) · 현재 단계: ${stages}`)
const c = sim.cold.stats
console.log(`콜드체인: 새벽배송 주문 ${c.dawnOrders}건 · 운행 ${c.dawnTrips} · 고장 ${c.faults} · 재냉각 ${c.recool}(메시지로 미리 ${c.early} / 센서 경보 뒤 ${c.late}) · 한계 초과 ${c.excursions} · 메시지 ${c.messages}`)
for (const m of sim.cold.messages.slice(0, 3)) console.log(`  ${m.vehicle} ${m.temp.toFixed(1)}°C "${m.text}" → ${ACTION_LABEL[m.action]}`)
const cu = sim.customs.stats
console.log(`통관: 신고 ${cu.declared} · 세번 불일치 ${cu.mismatch} · 목록통관 ${cu.list} · 일반 ${cu.general}`)
const a = sim.addr.stats
console.log(`주소 정정: ${a.cases}건 · 자동 ${a.fixed} · 고객 확인 ${a.contact} · 사람 확인 ${a.manual} · 정정 맞음 ${a.correct} / 틀림 ${a.wrong}`)
const r = sim.zones.result()
const t = sim.zones.trips
console.log(`경로: 노선 합계 ${Math.round(r.base)} → ${Math.round(r.total)} m(${Math.round((1 - r.total / r.base) * 100)}% 짧음) · 실측 한 바퀴 평균 ${t.length ? Math.round(t.reduce((s, x) => s + x.dist, 0) / t.length) : '-'} m(${t.length}회, 최적 노선 ${sim.zones.applied ? '적용' : '미적용'})`)
const co = sim.carbon
console.log(`탄소: 육로 ${(co.totals.road / 1000).toFixed(1)} t · 해상 ${(co.totals.sea / 1000).toFixed(1)} t · 항공 ${(co.totals.air / 1000).toFixed(1)} t`)
console.log(`대전 중부허브: 도크 하역 ${sim.djDocks.reduce((s, d) => s + d.today, 0)}회(시작값 포함) · 휴게소 ${sim.restStats.stops}회 · 기사 교대 ${sim.restStats.swaps}회`)
