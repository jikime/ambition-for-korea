// 해상·항공 여정 점검: 단계가 바뀔 때마다 시각·위치 설명을 찍는다. 사용: tsx scripts/journey-check.ts [스텝]
import { sim } from '../src/sim/sim'
const hhmm = (sec: number) => {
  const s = ((sec % 86400) + 86400) % 86400
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`
}
const N = Number(process.argv[2] ?? 15000)
const last = { sea: '', air: '' }
for (let i = 0; i < N; i++) {
  sim.step(0.1)
  for (const k of ['sea', 'air'] as const) {
    const j = sim[k]
    const key = `${j.n}:${j.stage}:${j.status}`
    if (key !== last[k]) {
      last[k] = key
      const p = j.pos()
      console.log(`${(sim.elapsed / 60).toFixed(1).padStart(5)}분 ${k} #${j.n} ${j.stage + 1}.${j.steps[j.stage].label} [${j.status}] ${p.label} @${p.site} ${hhmm(sim.clock)}${j.decision ? ' · ' + j.decision : ''}`)
    }
  }
}
