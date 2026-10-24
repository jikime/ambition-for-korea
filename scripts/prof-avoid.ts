// 회피 계산 비용: 함수별 누적 시간
import { sim } from '../src/sim/sim'
const S = sim as any
const acc: Record<string, [number, number]> = {}
for (const name of ['stepAvoid', 'bodies', 'junctionGap', 'junctionRes', 'mergeGap', 'crossGap', 'cleanJunctionRes']) {
  const orig = S[name].bind(S)
  acc[name] = [0, 0]
  S[name] = (...a: unknown[]) => {
    const t = performance.now()
    const r = orig(...a)
    acc[name][0] += performance.now() - t
    acc[name][1]++
    return r
  }
}
const N = Number(process.argv[2] ?? 6000)
const a0 = performance.now()
for (let i = 0; i < N; i++) sim.step(0.1)
const total = performance.now() - a0
console.log(`total ${(total / N).toFixed(3)}ms/step`)
for (const [k, [t, n]] of Object.entries(acc)) console.log(k.padEnd(18), `${(t / N).toFixed(3)}ms/step`, `${n} calls`, `${((t / n) * 1000).toFixed(1)}µs/call`)
