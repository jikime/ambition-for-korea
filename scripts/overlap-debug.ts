// 교착(ghost)·겹침이 어디서 생기는지 기록
import { sim } from '../src/sim/sim'
import { overlaps } from '../src/sim/avoid'
const S = sim as any
const ghosts: string[] = []
const origAvoid = S.stepAvoid.bind(S)
S.stepAvoid = (dt: number) => {
  const before = sim.avoidStats.ghosts
  origAvoid(dt)
  if (sim.avoidStats.ghosts > before) {
    for (const v of sim.vehicles) if (v.ghostT > 5.9) ghosts.push(`${v.id}(${v.kind},${v.site},${v.phase}) @${v.x.toFixed(0)},${v.z.toFixed(0)}`)
  }
}
const pairs = new Map<string, number>()
for (let i = 0; i < 12000; i++) {
  sim.step(0.1)
  if (i % 10 === 0) {
    const all = S.bodies() as any[]
    const veh = all.filter((b) => !/^(p-|w-|FL-|r-|m-)/.test(b.id))
    for (let a = 0; a < veh.length; a++) for (let b = a + 1; b < veh.length; b++) {
      if (veh[a].group === veh[b].group) continue
      if (overlaps(veh[a], veh[b])) {
        const va = sim.vehicles.find((v) => v.id === veh[a].group)
        const vb = sim.vehicles.find((v) => v.id === veh[b].group)
        const key = `${veh[a].group}[${va?.phase ?? 'car'}] × ${veh[b].group}[${vb?.phase ?? 'car'}] @${Math.round(veh[a].x / 10) * 10},${Math.round(veh[a].z / 10) * 10}`
        pairs.set(key, (pairs.get(key) ?? 0) + 1)
      }
    }
  }
}
console.log('ghost events', ghosts.length)
const gc = new Map<string, number>()
for (const g of ghosts) { const k = g.replace(/@.*/, ''); gc.set(k, (gc.get(k) ?? 0) + 1) }
console.log([...gc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${n}× ${k}`).join('\n'))
console.log('--- ghost positions'); console.log(ghosts.slice(0, 12).join('\n'))
console.log('--- overlap pairs (top)')
console.log([...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, n]) => `${n}s ${k}`).join('\n'))
