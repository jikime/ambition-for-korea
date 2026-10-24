// 3차 실험: 앱에 실제로 흘러가는 문장(리젝트 송장·돌발 상황)으로 판독 정확도와
// "코드 정책을 거친 최종 처리" 결과(자동 처리 · 오처리 · 사람 확인)를 함께 잰다.
import { ADDRESS_QUESTIONS, INCIDENT_QUESTIONS, MANIFEST_QUESTIONS } from '../server/ai'
import { AIR_POOL, REJECT_POOL } from '../src/sim/texts'
import { INCIDENT_POOL } from '../src/sim/incidents'
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
const pct = (a: number, b: number) => `${Math.round((a / b) * 100)}%`
const IRREGULAR = ['골프백', '자전거', '타이어']

{
  // 허브 리젝트 데스크 정책(src/sim/hub.ts decide와 같은 규칙)
  const ans = await Promise.all(REJECT_POOL.map((p) => ask({ label: p.label, item: p.item }, ADDRESS_QUESTIONS)))
  let term = 0
  let autoOk = 0
  let autoBad = 0
  let human = 0
  let irrOk = 0
  const lines: string[] = []
  REJECT_POOL.forEach((p, i) => {
    const a = ans[i]
    const t = a.terminal.choice
    const conf = a.terminal.confidence
    if (t === p.truth) term++
    const wantIrr = IRREGULAR.some((w) => p.item.includes(w))
    if ((a.irregular.noul > 0.7) === wantIrr) irrOk++
    let outcome: string
    if (a.irregular.noul > 0.7) {
      outcome = '이형물 라인'
      if (wantIrr) autoOk++
      else autoBad++
    } else if (t !== 'unknown' && conf >= 0.6) {
      outcome = `재투입 ${t}`
      if (t === p.truth) autoOk++
      else autoBad++
    } else {
      outcome = '사람 확인'
      human++
    }
    const mark = outcome === '사람 확인' ? '·' : (outcome === '이형물 라인' ? wantIrr : t === p.truth) ? '✓' : '✗'
    lines.push(`  ${mark} "${p.label}" / ${p.item} → ${outcome} (판독 ${t} ${conf.toFixed(2)}, 이형 ${a.irregular.noul.toFixed(2)}, 정답 ${p.truth})`)
  })
  console.log(`[G] 리젝트 송장(앱 데이터 ${REJECT_POOL.length}건) — 터미널 판독 ${pct(term, REJECT_POOL.length)}, 이형물 판정 ${pct(irrOk, REJECT_POOL.length)}`)
  console.log(`    정책 적용 결과: 자동 처리 ${autoOk + autoBad}건 중 정확 ${autoOk} · 오처리 ${autoBad} · 사람 확인 ${human}`)
  lines.forEach((l) => console.log(l))
}
{
  // 돌발 상황 정책(src/sim/sim.ts resolveIncident와 같은 규칙)
  const ans = await Promise.all(INCIDENT_POOL.map((p) => ask({ incident: p.text }, INCIDENT_QUESTIONS)))
  let link = 0
  let ok = 0
  let bad = 0
  let human = 0
  const lines: string[] = []
  INCIDENT_POOL.forEach((p, i) => {
    const a = ans[i]
    const l = a.link.choice
    const imp = a.impact.score
    if (l === p.link) link++
    let outcome: string
    let good: boolean | null
    if (l === 'none') {
      outcome = '조치 없음'
      good = p.link === 'none' || p.impact === 0
    } else if (imp < 0.5) {
      outcome = `${l} 정상화/영향 없음`
      good = p.impact === 0 && (p.link === l || p.link === 'none')
    } else if (a.link.confidence < 0.6 || a.impact.confidence < 0.4) {
      outcome = '관제사 확인'
      good = null
    } else {
      outcome = `${l} 제한(영향 ${imp.toFixed(2)})`
      good = l === p.link && Math.abs(imp - p.impact) <= 1
    }
    if (good === null) human++
    else if (good) ok++
    else bad++
    lines.push(`  ${good === null ? '·' : good ? '✓' : '✗'} "${p.text}" → ${outcome} (정답 ${p.link}/${p.impact}, 구간 신뢰도 ${a.link.confidence.toFixed(2)}, 영향 신뢰도 ${a.impact.confidence.toFixed(2)})`)
  })
  console.log(`[H] 돌발 상황(앱 데이터 ${INCIDENT_POOL.length}건) — 영향 구간 ${pct(link, INCIDENT_POOL.length)}`)
  console.log(`    정책 적용 결과: 올바른 처리 ${ok} · 잘못된 처리 ${bad} · 관제사 확인 ${human}`)
  lines.forEach((l) => console.log(l))
}
{
  // 항공 수출 화물 위험물 사전 검사(src/sim/airport.ts resolve와 같은 규칙)
  const want: Record<string, { dg: boolean; cold: boolean; mismatch?: boolean }> = {
    'SKIN CARE SET: TONER, CREAM, SERUM': { dg: false, cold: false },
    'NAIL POLISH REMOVER (ACETONE) 12 BOTTLES': { dg: true, cold: false },
    'POWER BANK 20000MAH LITHIUM ION, 30 PCS': { dg: true, cold: false },
    'K-POP T-SHIRTS AND HOODIES': { dg: false, cold: false },
    'KIMCHI 10KG, KEEP REFRIGERATED': { dg: false, cold: true },
    'FROZEN DUMPLINGS -18C, 40 BOXES': { dg: false, cold: true },
    'BUTANE GAS LIGHTERS 200 PCS': { dg: true, cold: false, mismatch: true },
    'PRINTED BOOKS AND PHOTO ALBUMS': { dg: false, cold: false },
    'INSULIN PENS, KEEP AT 2-8C': { dg: false, cold: true },
    'AEROSOL HAIR SPRAY 48 CANS UN1950': { dg: true, cold: false },
    'SMARTPHONE CASES, NO BATTERY': { dg: false, cold: false },
    'E-CIGARETTE DEVICES WITH LITHIUM BATTERIES': { dg: true, cold: false },
    'RED GINSENG EXTRACT, 60 JARS': { dg: false, cold: false },
    'LEATHER HANDBAGS AND WALLETS': { dg: false, cold: false },
  }
  const ans = await Promise.all(AIR_POOL.map((p) => ask({ cargo: { declared: p.declared, description: p.description } }, MANIFEST_QUESTIONS)))
  let ok = 0
  let n = 0
  const lines: string[] = []
  AIR_POOL.forEach((p, i) => {
    const a = ans[i]
    const w = want[p.description]
    const dg = a.dangerous.noul > 0.5
    const cold = a.reefer.noul > 0.5
    const good = dg === w.dg && cold === w.cold && (w.mismatch === undefined || (a.mismatch.noul > 0.6) === w.mismatch)
    n++
    if (good) ok++
    const decision = dg ? '탑재 보류' : a.mismatch.noul > 0.6 ? 'X-ray' : cold ? '냉장 ULD' : '일반 ULD'
    lines.push(`  ${good ? '✓' : '✗'} ${p.declared} / ${p.description} → ${decision} (위험 ${a.dangerous.noul.toFixed(2)}, 냉장 ${a.reefer.noul.toFixed(2)}, 불일치 ${a.mismatch.noul.toFixed(2)})`)
  })
  console.log(`[I] 항공 수출 화물(앱 데이터 ${AIR_POOL.length}건) — 위험물·냉장 판정 ${pct(ok, n)}`)
  lines.forEach((l) => console.log(l))
}
lat.sort((a, b) => a - b)
console.log(`요청 ${lat.length}건 · 중앙값 ${Math.round(lat[lat.length >> 1])}ms · 입력 토큰 ${tokens} (≈ $${((tokens / 1e6) * 0.042).toFixed(4)})`)
