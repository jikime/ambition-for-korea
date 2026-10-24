// 충돌 회피 검증: 회피를 켜고/끄고 20분(12,000스텝) 돌리며 1초마다 겹친 쌍을 센다.
// 사용: npm run overlap -- on | off [스텝 수(기본 12000 = 20분)]
import { sim } from '../src/sim/sim'

const mode = process.argv[2] ?? 'on'
const N = Number(process.argv[3] ?? 12000)
sim.avoidEnabled = mode === 'on'
let vv = 0
let vp = 0
let samples = 0
let peak = 0
const t0 = performance.now()
let lastOut = 0
for (let i = 0; i < N; i++) {
  sim.step(0.1)
  if (i % 10 === 0) {
    const o = sim.overlapCount()
    vv += o.vv
    vp += o.vp
    peak = Math.max(peak, o.vv)
    samples++
  }
  // 10분마다 처리량(교착이면 멈춘다)
  if (i % 6000 === 5999) {
    console.log(`  ${((i + 1) / 600).toFixed(0)}분: 배송 ${sim.stats.delivered - sim.stats.deliveredBase} · 간선 출고 +${sim.stats.trucksOut - lastOut} · 정지 ${sim.avoidStats.stopped}`)
    lastOut = sim.stats.trucksOut
  }
}
const ms = performance.now() - t0
console.log(`회피 ${mode}: 차량끼리 겹침 평균 ${(vv / samples).toFixed(2)}쌍(최대 ${peak}) · 차량-보행자 ${(vp / samples).toFixed(2)} · ${(ms / N).toFixed(3)}ms/step`)
console.log('avoid', JSON.stringify(sim.avoidStats), '| 여정 단계', sim.story.stage, '여정 수', sim.storyCount, '| 항만 사이클', sim.port.stats.cycles, '| 화물기 출발', sim.airport.stats.departed, '| 배송 완료', sim.stats.delivered - sim.stats.deliveredBase, '| 간선 출고', sim.stats.trucksOut)
