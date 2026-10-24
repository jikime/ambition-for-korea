import { sim } from '../src/sim/sim'
const hh = (s: number) => `${String(Math.floor(s / 3600) % 24).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`
// ORACLE=1: 돌발 상황을 정답으로 판독했다고 치고 적용 효과(속도 제한·해제)를 확인한다
if (process.env.ORACLE) sim.onIncident = (i) => sim.resolveIncident(i, i.truth ? { link: i.truth.link, linkConfidence: 0.9, impact: i.truth.impact, impactConfidence: 0.8 } : null)
let slowSamples = 0
const t0 = performance.now()
const stageLog: string[] = []
let last = sim.story.stage
let lastN = sim.story.n
const counts: Record<string, number> = {}
for (let i = 0; i < 20 * 60 * 10; i++) { // 20분(실시간) 분량
  sim.step(0.1)
  if (sim.vehicles.some((v) => v.visible && v.route && sim.legFactor(v, v.route.leg) < 0.99)) slowSamples++
  if (sim.story.n !== lastN) { stageLog.push(`--- 새 스토리 #${sim.story.n} @${hh(sim.clock)}`); lastN = sim.story.n; last = sim.story.stage }
  if (sim.story.stage !== last) { last = sim.story.stage; stageLog.push(`${hh(sim.clock)} t=${(i / 10).toFixed(0)}s stage ${last} · ${sim.storyPos().label}`) }
  if (i % 600 === 0) {
    for (const v of sim.vehicles) { const k = `${v.kind}:${v.phase}`; counts[k] = (counts[k] ?? 0) + 1 }
  }
}
const ms = performance.now() - t0
console.log(`sim 12000 steps: ${ms.toFixed(0)} ms (${(ms / 12000).toFixed(3)} ms/step)`)
console.log(stageLog.join('\n'))
console.log('phase histogram (sampled):', Object.entries(counts).sort().map(([k, n]) => `${k}=${n}`).join(' '))
console.log('stats', JSON.stringify({ delivered: sim.stats.delivered - sim.stats.deliveredBase, boxes: sim.stats.boxes - sim.stats.boxesBase, ic: sim.stats.icPallets - sim.stats.icPalletsBase, teu: sim.teu, cy: sim.cy, inParcels: sim.inParcels.length, held: sim.inSlots.map((s) => s.held).join(',') }))
console.log('port', JSON.stringify(sim.port.stats), 'ship', sim.port.ship.map((b) => b.length).join(','), 'agv', sim.port.agvs.map((a) => a.state).join(','))
console.log('trailers', sim.vehicles.filter((v) => v.kind === 'trailer').map((v) => `${v.id}:${v.site}/${v.phase}`).join(' '))
console.log('vehicles now:', sim.vehicles.map((v) => `${v.id}:${v.site}/${v.phase}`).join(' '))
console.log('forklifts:', sim.forklifts.map((f) => `${f.id}:${f.status}:${Math.round(f.battery)}`).join(' '))
const H = sim.hub
console.log('hub', JSON.stringify(H.stats), 'rate/h', H.rate, 'parcels', H.parcels.length, 'onLoop', H.carriers.filter(Boolean).length, 'queues', H.queues.map((q) => q.length).join(','), 'deskQ', H.deskQ.length, 'cages', H.cages.map((c) => `${c.dest}:${c.count}${c.swap ? '*' : ''}`).join(' '))
console.log('desk', H.log.slice(0, 5).map((l) => `${l.decision} | ${l.label}`).join('\n     '))
console.log('slowed vehicle-steps', slowSamples, 'factors', JSON.stringify(sim.linkFactor))
console.log('incidents', sim.incidents.map((i) => `${i.state}:${i.text.slice(0, 18)}`).join(' | '))
const A = sim.airport
console.log('airport', JSON.stringify(A.stats), A.aircraft.map((a) => `${a.flight}:${a.phase}`).join(' '), 'trucks', sim.vehicles.filter((v) => v.home === 'AP').map((v) => `${v.id}:${v.site}/${v.phase}`).join(' '))
