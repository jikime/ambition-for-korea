// 물류관리원 에이전트 오프라인 점검(API 호출 없음): 판단 검증기(server/agent/contract.ts)와 도구 실행기(src/ai/agent/tools.ts)
//   npx tsx scripts/agent-check.ts
import { validateDecision, SCHEMA_VERSION, TOOL_REGISTRY, DECISION_SCHEMA, type ToolCall } from '../server/agent/contract'
import { sim } from '../src/sim/sim'
import { runTool, argsKey, useTasks } from '../src/ai/agent/tools'

let pass = 0
let fail = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) pass++
  else fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ` — ${detail}` : ''}`)
}

// ───────────────────────── 판단 검증기

const REQ = 'req_check0001'
const evidenceIds = new Set(['ctx-now', 'ctx-story', `${REQ}-t1`])
const none = { tool: 'none', identifier: '', item: '', site: '', vehicle_id: '', title: '', detail: '', priority: '', plan_version: '' }
const cand = (choice: string, ok = true, parts: [number, number, number] = [38, 30, 22]) => ({
  choice, true_or_false: ok, score: parts[0] + parts[1] + parts[2],
  score_breakdown: { intent_fit: parts[0], evidence_sufficiency: parts[1], context_fit: parts[2] },
  evidence_status: 'verified', reason_summary: 'reason',
})
/** 통과하는 기본 판단(조회 결과로 답하기)에 덮어쓰기 */
const base = (over: Record<string, unknown> = {}) => ({
  schema_version: SCHEMA_VERSION, request_id: REQ, intent: 'shipment_status',
  choices: [cand('query_shipment')], selected_choice: 'query_shipment', decision: 'answer',
  answer: 'DV-4485는 14:39 기준 배송 중이고, 14:41에 도착 예정이에요. 운송장 7477-4472-4425, 남은 택배 1,906개.',
  speech_text: 'DV-4485는 14:39 기준 배송 중이에요. 14:41 도착 예정이고 운송장은 7477-4472-4425, 남은 택배는 1906개예요.',
  missing_fields: [], evidence_refs: [`${REQ}-t1`], tool_plan: none, ...over,
})
const v = (raw: unknown) => validateDecision(raw, { requestId: REQ, evidenceIds })
const issues = (raw: unknown) => v(raw).issues.join('; ')

check('기본 답변 통과(시각 · 운송장 · 천 단위 쉼표 비교)', v(base()).ok, issues(base()))
check('request_id 다르면 거절', !v(base({ request_id: 'req_other0001' })).ok)
check('점수 합 불일치 거절', !v(base({ choices: [{ ...cand('query_shipment'), score: 95 }] })).ok)
check('구성 점수 범위 초과 거절', !v(base({ choices: [cand('query_shipment', true, [41, 30, 20])] })).ok)
check('selected_choice가 false면 거절', !v(base({ choices: [cand('query_shipment', false)] })).ok)
check('후보 밖 selected_choice 거절', !v(base({ selected_choice: 'query_inventory' })).ok)
check('choice와 decision 조합 검사', !v(base({ decision: 'clarify', missing_fields: ['identifier'] })).ok)
check('후보 중복 거절', !v(base({ choices: [cand('query_shipment'), cand('query_shipment')] })).ok)
check('후보 4개 이상 거절', !v(base({ choices: ['query_shipment', 'query_inventory', 'query_operations', 'answer_question'].map((c) => cand(c)) })).ok)
check('speech_text가 숫자를 빠뜨리면 거절', !v(base({ speech_text: 'DV-4485는 배송 중이에요. 곧 도착해요.' })).ok)
check('speech_text가 숫자를 말로 풀어 쓰면 거절', !v(base({ speech_text: 'DV-4485는 열네 시 삼십구 분 기준 배송 중이에요.' })).ok)
check('모르는 evidence_refs 거절', !v(base({ evidence_refs: ['made-up'] })).ok)
check('데이터 답변에 근거가 없으면 거절', !v(base({ evidence_refs: [] })).ok)
check('내부 ID(근거 ID)를 문장에 넣으면 거절', !v(base({ answer: `조회(${REQ}-t1) 결과 배송 중이에요.`, speech_text: `조회(${REQ}-t1) 결과 배송 중이에요.` })).ok)
const clarify = base({ intent: 'shipment_status', choices: [cand('query_shipment', false), cand('ask_clarification')], selected_choice: 'ask_clarification', decision: 'clarify', answer: '운송장 번호를 알려 주세요.', speech_text: '운송장 번호를 알려 주세요.', evidence_refs: [], missing_fields: ['identifier'] })
check('식별자 없을 때 되묻기 통과', v(clarify).ok, issues(clarify))
check('되묻기에 missing_fields가 없으면 거절', !v({ ...clarify, missing_fields: [] }).ok)
const lookup = base({ decision: 'tool_request', answer: '조회해 볼게요.', speech_text: '조회해 볼게요.', evidence_refs: [], tool_plan: { ...none, tool: 'get_shipment_status', identifier: 'DV-4485' } })
check('조회 요청 통과', v(lookup).ok, issues(lookup))
check('조회 요청에 필수 인자가 없으면 거절', !v({ ...lookup, tool_plan: { ...none, tool: 'get_shipment_status' } }).ok)
check('choice와 다른 도구 거절', !v({ ...lookup, tool_plan: { ...none, tool: 'get_inventory', item: 'water' } }).ok)
check('도구 없는 결정에 도구 거절', !v(base({ tool_plan: { ...none, tool: 'get_inventory', item: 'water' } })).ok)
const task = base({ intent: 'work_task', choices: [cand('create_work_task')], selected_choice: 'create_work_task', decision: 'tool_request', answer: '작업 지시를 만들게요.', speech_text: '작업 지시를 만들게요.', evidence_refs: [], tool_plan: { ...none, tool: 'create_work_task', site: 'GJ', title: '도크 점검', priority: 'high' } })
check('작업 지시 요청 통과', v(task).ok, issues(task))
check('거점 enum 밖 거절', !v({ ...task, tool_plan: { ...task.tool_plan as object, site: 'SEOUL' } }).ok)
check('우선순위 enum 밖 거절', !v({ ...task, tool_plan: { ...task.tool_plan as object, priority: 'urgent' } }).ok)
const commit = base({ intent: 'dispatch_change', choices: [cand('execute_dispatch_change')], selected_choice: 'execute_dispatch_change', decision: 'tool_request', answer: 'DV-5147의 정차지 2곳을 넘기는 변경을 요청할게요.', speech_text: 'DV-5147의 정차지 2곳을 넘기는 변경을 요청할게요.', evidence_refs: [`${REQ}-t1`], tool_plan: { ...none, tool: 'commit_dispatch_change', vehicle_id: 'DV-5147', plan_version: 'DV-5147.3.0.V180+V110.DV-5102' } })
check('배차 변경 실행 요청 통과', v(commit).ok, issues(commit))
check('plan_version 없으면 거절', !v({ ...commit, tool_plan: { ...commit.tool_plan as object, plan_version: '' } }).ok)
check('plan_version을 문장에 넣으면 거절', !v({ ...commit, answer: '변경안 DV-5147.3.0.V180+V110.DV-5102로 요청할게요.', speech_text: '변경안 DV-5147.3.0.V180+V110.DV-5102로 요청할게요.' }).ok)
check('JSON이 아닌 값 거절', !v('not json').ok && !v(null).ok)
check('스키마: 모든 속성이 required', (() => {
  const s = DECISION_SCHEMA as unknown as { properties: Record<string, unknown>; required: string[] }
  return Object.keys(s.properties).every((k) => s.required.includes(k))
})())

// ───────────────────────── 정책 레지스트리

check('쓰기 도구는 모두 승인 필요', Object.values(TOOL_REGISTRY).every((t) => t.kind === 'read' || t.confirm))
check('배차 도구는 operator만', TOOL_REGISTRY.prepare_dispatch_change.roles.join() === 'operator' && TOOL_REGISTRY.commit_dispatch_change.roles.join() === 'operator')

// ───────────────────────── 도구 실행기(시뮬레이션 위에서)

for (let i = 0; i < 1200; i++) sim.step(0.5)
const call = (id: string, tool: ToolCall['tool'], args: ToolCall['args'], kind: ToolCall['kind'] = TOOL_REGISTRY[tool].kind): ToolCall => ({ call_id: id, tool, kind, args, requires_confirmation: TOOL_REGISTRY[tool].confirm })

const van = sim.vehicles.find((x) => x.visible && x.kind === 'van')
if (van) {
  const r = runTool(call('c-ship-1', 'get_shipment_status', { identifier: van.id }))
  check('배송차 조회: 찾음', r.status === 'completed' && (r.data as { found?: boolean }).found === true, JSON.stringify(r.data).slice(0, 120))
}
const missing = runTool(call('c-ship-2', 'get_shipment_status', { identifier: 'ZZ-0000' }))
check('없는 식별자: found false(지어내지 않음)', missing.status === 'completed' && (missing.data as { found?: boolean }).found === false)
const inv = runTool(call('c-inv-1', 'get_inventory', { item: 'water' }))
check('재고 조회 완료', inv.status === 'completed' && inv.data !== null)
const ops = runTool(call('c-ops-1', 'list_warehouse_operations', { site: 'GJ' }))
check('현장 조회: 차량 목록 포함', ops.status === 'completed' && Array.isArray((ops.data as { vehicles?: unknown[] }).vehicles))

const wt = call('c-task-1', 'create_work_task', { site: 'GJ', title: '도크 점검', priority: 'high' })
const before = useTasks.getState().tasks.length
check('쓰기: 승인 없이 거절', runTool(wt).status === 'failed' && useTasks.getState().tasks.length === before)
check('쓰기: 다른 인자의 승인 거절', runTool(wt, { callId: wt.call_id, argsKey: argsKey({ ...wt, args: { ...wt.args, title: '다른 작업' } }), expires: Date.now() + 60_000 }).status === 'failed')
check('쓰기: 다른 call의 승인 거절', runTool(wt, { callId: 'c-task-9', argsKey: argsKey(wt), expires: Date.now() + 60_000 }).status === 'failed')
check('쓰기: 만료된 승인 거절', runTool(wt, { callId: wt.call_id, argsKey: argsKey(wt), expires: Date.now() - 1 }).status === 'failed')
const ok1 = runTool(wt, { callId: wt.call_id, argsKey: argsKey(wt), expires: Date.now() + 60_000 })
const ok2 = runTool(wt, { callId: wt.call_id, argsKey: argsKey(wt), expires: Date.now() + 60_000 })
check('쓰기: 승인하면 한 번 실행', ok1.status === 'completed' && useTasks.getState().tasks.length === before + 1)
check('멱등성: 같은 call_id 재실행은 같은 결과 · 중복 생성 없음', ok2 === ok1 && useTasks.getState().tasks.length === before + 1)

// 배차 변경: 이관 가능한 배송차가 나올 때까지 시뮬레이션을 돌린다
let mover = sim.vehicles.find((x) => x.visible && sim.approvals.planMove(x))
for (let i = 0; i < 20000 && !mover; i++) {
  sim.step(0.5)
  if (i % 20 === 0) mover = sim.vehicles.find((x) => x.visible && sim.approvals.planMove(x))
}
if (!mover) check('배차 변경 대상 배송차 찾기', false, '시뮬레이션에서 이관 가능한 배송차를 찾지 못함')
else {
  const prep = runTool(call('c-prep-1', 'prepare_dispatch_change', { vehicle_id: mover.id }))
  const plan = prep.data as { possible: boolean; plan_version: string }
  check('변경안 준비: 가능 · plan_version', prep.status === 'completed' && plan.possible && !!plan.plan_version)
  const stale = call('c-commit-1', 'commit_dispatch_change', { vehicle_id: mover.id, plan_version: `${plan.plan_version}.old` })
  const sr = runTool(stale, { callId: stale.call_id, argsKey: argsKey(stale), expires: Date.now() + 60_000 })
  check('실행: 버전이 다르면 실행하지 않음', sr.status === 'failed' && !sim.movedStops.has(mover.id))
  const good = call('c-commit-2', 'commit_dispatch_change', { vehicle_id: mover.id, plan_version: plan.plan_version })
  const gr = runTool(good, { callId: good.call_id, argsKey: argsKey(good), expires: Date.now() + 60_000 })
  check('실행: 같은 버전 · 승인이면 이관', gr.status === 'completed' && sim.movedStops.has(mover.id), JSON.stringify(gr.data).slice(0, 160))
  const again = call('c-commit-3', 'commit_dispatch_change', { vehicle_id: mover.id, plan_version: plan.plan_version })
  check('실행: 이미 이관한 계획은 다시 실행하지 않음', runTool(again, { callId: again.call_id, argsKey: argsKey(again), expires: Date.now() + 60_000 }).status === 'failed')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
