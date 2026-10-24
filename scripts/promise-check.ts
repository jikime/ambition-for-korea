// 간선 도착 약속 점검(헤드리스 1시간): 정시·위험·지연 비율과 원인 분포, 도착 결과.
// 창 폭(WIN_EARLY·WIN_LATE)을 정할 때 쓴다. 평상시 위험은 5~15%가 목표.
import { sim } from '../src/sim/sim'
import { CAUSE_LABEL, type Cause } from '../src/sim/promise'

const steps = Number(process.argv[2] ?? 36000)
const snap = { ontime: 0, risk: 0, late: 0 }
const causes: Record<string, number> = {}
let samples = 0
for (let i = 0; i < steps; i++) {
  sim.step(0.1)
  if ((i + 1) % 6000 === 0) {
    const st = sim.promises.stats
    console.log(`${(i + 1) / 600}분: 도착 ${st.ontime + st.late}회 · 정시 ${st.ontime} · 지연 ${st.late} · 정시율 ${sim.promises.onTimeRate?.toFixed(1) ?? '-'}%`)
  }
  if (i % 50 !== 0) continue
  for (const v of sim.vehicles) {
    const s = sim.promises.status(v)
    if (!s || s.state.startsWith('done')) continue
    samples++
    snap[s.state as 'ontime' | 'risk' | 'late']++
    for (const c of s.causes) causes[c] = (causes[c] ?? 0) + 1
  }
}
const pct = (n: number) => `${((n / Math.max(1, samples)) * 100).toFixed(1)}%`
console.log(`운행 중 표본 ${samples}: 정시 ${pct(snap.ontime)} · 위험 ${pct(snap.risk)} · 지연 ${pct(snap.late)}`)
console.log('원인: ' + Object.entries(causes).map(([k, n]) => `${CAUSE_LABEL[k as Cause]} ${n}`).join(' · '))
const st = sim.promises.stats
console.log(`도착 ${st.ontime + st.late}회 · 평균 지연(늦은 것만) ${(st.delaySum / Math.max(1, st.late + st.ontime)).toFixed(1)}분`)
