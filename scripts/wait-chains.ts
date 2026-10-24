// 교착 진단: 서 있는 차들의 "누구를 기다리나" 사슬을 따라가 순환(↺)인지, 어디서 끊기는지(■) 본다. 사용: tsx scripts/wait-chains.ts [스텝 수]
import { sim } from '../src/sim/sim'
const T = Number(process.argv[2] ?? 6000)
for (let i = 0; i < T; i++) sim.step(0.1)
const byId = new Map<string, any>(sim.vehicles.map((v) => [v.id, v]))
const desc = (id: string) => {
  const v = byId.get(id)
  if (v) {
    const t = v.tasks[0]
    return `${id}[${t?.k}/${t?.route?.leg?.tag ?? ''} cap=${v.cap.toFixed(1)} @${v.x.toFixed(0)},${v.z.toFixed(0)}]`
  }
  const c = sim.traffic.cars.find((x) => x.id === id)
  if (c) return `${id}[car cap=${c.cap.toFixed(1)} v=${c.v.toFixed(1)} @${c.x.toFixed(0)}]`
  const m = sim.life.movers.find((x: any) => x.id === id) as any
  if (m) return `${id}[${m.kind} moving=${m.moving} pause=${m.pause?.toFixed?.(1)} @${m.x.toFixed(0)},${m.z.toFixed(0)}]`
  const f = sim.forklifts.find((x: any) => x.id === id) as any
  if (f) return `${id}[forklift @${f.x.toFixed(0)},${f.z.toFixed(0)}]`
  return `${id}[?]`
}
const done = new Set<string>()
for (const v of sim.vehicles) {
  if (!v.visible || v.cap > 0.3 || done.has(v.id)) continue
  const chain: string[] = [v.id]
  let cur = (v as any).waitFor as string | null
  while (cur && !chain.includes(cur) && chain.length < 20) {
    chain.push(cur)
    const n = byId.get(cur)
    cur = n ? n.waitFor : null
  }
  chain.forEach((c) => done.add(c))
  const cyc = cur && chain.includes(cur) ? ` ↺ ${cur}` : ' ■'
  console.log(chain.map(desc).join(' → ') + cyc)
}
