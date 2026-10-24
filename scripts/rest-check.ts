// 휴게소 점검: 휴게소 칸에 들어오는 차·기사 교대, 휴게 횟수, 가장 긴 연속 운전(시계 시간)
// 사용: npm run rest -- [스텝(기본 12000 = 20분)]
import { sim } from '../src/sim/sim'
const N = Number(process.argv[2] ?? 12000)
const seen = new Map<string, string>()
const clock = (s: number) => {
  const m = Math.round((s * 12) / 60)
  return `${Math.floor(m / 60)}시간 ${m % 60}분`
}
let maxNow = 0
for (let i = 0; i < N; i++) {
  sim.step(0.1)
  for (const v of sim.vehicles) {
    const key = v.rest ? `${v.rest.area ?? '구내'}:${v.rest.bay}:${v.rest.parked ? 'P' : 'in'}` : ''
    if (key !== (seen.get(v.id) ?? '')) {
      if (v.rest?.parked) console.log(`${(sim.elapsed / 60).toFixed(1).padStart(5)}분 ${v.id} ${v.kind} ${v.rest.area ? '휴게소 ' + v.rest.area + ' 칸 ' + v.rest.bay + (v.rest.voluntary ? ' (피곤해서)' : ' (의무)') : '기사 교대(휴게소 없는 경로)'} · 직전 연속 운전 ${clock(v.driveT)}`)
      seen.set(v.id, key)
    }
    if (v.kind !== 'van') maxNow = Math.max(maxNow, v.driveT)
  }
}
console.log('restStats', JSON.stringify(sim.restStats), '| 가장 긴 연속 운전', clock(maxNow), '| 배송', sim.stats.delivered - sim.stats.deliveredBase, '간선 출고', sim.stats.trucksOut)
console.log('bays', sim.restAreas.map((a) => `${a.id}:${a.bays.filter((b) => b.vehicle).length}/${a.bays.length}`).join(' '))
