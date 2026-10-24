// hubtrace 물류관리원 에이전트 한 단계: Claude 구조화 판단 → 서버 검증 → 도구 정책(역할 · 승인 · 단계 상한) → 다음 동작.
//  - 모델: 모든 경로 Claude Opus 5.5(CLAUDE_MODEL, Fast mode). 배차 변경 · 도구 실패/불확실은 서버 규칙으로 고난도 경로 → 같은 모델에서 추론량만 high
//    (CLAUDE_REASONING_MODEL로 고난도 경로 모델을 따로 지정할 수 있지만 기본은 같은 Opus 5.5)
//  - Fast mode가 거절되면(지원 안 함 · 용량) 같은 모델 표준 모드로 한 번 다시(낮은 모델로 몰래 바꾸지 않는다). 실제 쓰인 모델 · 속도는 응답 값을 기록
//  - 검증에 실패한 판단은 실행하지 않고 서버가 만든 고정 안내로 바꾼다
// 업무 데이터는 브라우저 시뮬레이션에 있어 도구는 화면(src/ai/agent/tools.ts)이 실행하고 결과를 다시 보낸다. 운영 백엔드가 생기면 실행기를 서버로 옮긴다.
import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'node:crypto'
import { serverApiKey } from '../claude.js'
import { SYSTEM_PROMPT, PROMPT_VERSION } from './prompt.js'
import {
  DECISION_SCHEMA, SCHEMA_VERSION, TOOL_REGISTRY, validateDecision,
  type AgentDecision, type AgentMeta, type AgentRequest, type AgentResponse, type Role, type ToolCall,
} from './contract.js'

const env = (k: string, d: string) => (process.env[k]?.trim() || d)
export const agentConfig = () => ({
  model: env('CLAUDE_MODEL', 'claude-opus-5-5'),
  reasoningModel: env('CLAUDE_REASONING_MODEL', env('CLAUDE_MODEL', 'claude-opus-5-5')),
  fast: env('CLAUDE_FAST_MODE', 'true') === 'true',
  /** 인증이 없는 데모: 역할 · 조직은 서버 설정으로 고정한다(모델이나 사용자 말로 바꾸지 않는다) */
  role: (env('AGENT_ROLE', 'operator') === 'viewer' ? 'viewer' : 'operator') as Role,
  tenant: env('AGENT_TENANT', 'hubtrace-demo'),
  budgetMs: Number(env('AGENT_TIME_BUDGET_MS', '30000')) || 30000,
})

/** 한 요청에서 도구를 부를 수 있는 횟수 */
const MAX_TOOL_ROUNDS = 3
/** 서버 규칙: 고난도 경로(배차 변경 · 여러 정차지 · 재배정) */
const HARD = /(배차|이관|정차지|재배정|넘겨|옮겨|바꿔|변경|reassign|dispatch|reroute|transfer|move (the )?stops?)/i

/** Fast mode를 쓸 수 없다고 확인된 모델(프로세스 동안 기억) */
const fastUnsupported = new Set<string>()

let client: Anthropic | null = null
const anthropic = () => (client ??= new Anthropic({ apiKey: serverApiKey(), maxRetries: 0 }))

const say = (lang: 'ko' | 'en', ko: string, en: string) => (lang === 'ko' ? ko : en)
/** 사용자에게 보이는 도구 이름 */
const TOOL_LABEL: Record<string, [string, string]> = {
  get_shipment_status: ['화물 조회', 'shipment lookup'],
  get_inventory: ['재고 조회', 'inventory lookup'],
  list_warehouse_operations: ['현장 현황 조회', 'site status lookup'],
  create_work_task: ['작업 지시 만들기', 'creating a work task'],
  prepare_dispatch_change: ['배차 변경', 'dispatch change'],
  commit_dispatch_change: ['배차 변경', 'dispatch change'],
}

/** 서버가 만드는 고정 응답(검증 실패 · 권한 부족 · 단계 초과) */
function fixed(requestId: string, lang: 'ko' | 'en', kind: 'invalid' | 'forbidden' | 'rounds' | 'unavailable', detail = ''): AgentDecision {
  const text = {
    invalid: say(lang, '판단 결과를 확인하지 못해 실행하지 않았어요. 다시 한 번 말씀해 주세요.', 'I could not verify my judgment, so I did not act on it. Please ask again.'),
    forbidden: say(lang, `이 작업은 현재 권한으로 실행할 수 없어요${detail ? `(${detail})` : ''}.`, `This action is not allowed with the current role${detail ? ` (${detail})` : ''}.`),
    rounds: say(lang, '조회 단계가 너무 많아 여기서 멈췄어요. 확인된 내용만 알려 드릴 수 있어요.', 'Too many lookup steps, so I stopped here. I can only report what was confirmed.'),
    unavailable: say(lang, `AI 응답을 받지 못했어요${detail ? `(${detail})` : ''}. 잠시 후 다시 시도해 주세요.`, `I could not get an AI response${detail ? ` (${detail})` : ''}. Please try again shortly.`),
  }[kind]
  return {
    schema_version: SCHEMA_VERSION, request_id: requestId, intent: 'out_of_scope',
    choices: [{ choice: 'report_limitation', true_or_false: true, score: 100, score_breakdown: { intent_fit: 40, evidence_sufficiency: 35, context_fit: 25 }, evidence_status: 'not_applicable', reason_summary: text }],
    selected_choice: 'report_limitation', decision: 'limitation', answer: text, speech_text: text, missing_fields: [], evidence_refs: [], tool_plan: null,
  }
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s)
/** 도구 결과가 너무 크면 앞부분만(문자열로) 넘긴다 */
const dataOf = (v: unknown) => {
  const s = JSON.stringify(v ?? null)
  return s.length <= 4000 ? (v ?? null) : { truncated: s.slice(0, 3900) }
}

export async function runAgentTurn(req: AgentRequest): Promise<AgentResponse> {
  const cfg = agentConfig()
  const t0 = Date.now()
  const lang = req.lang === 'ko' ? 'ko' : 'en'
  const requestId = typeof req.request_id === 'string' && /^req_[a-z0-9]{8,32}$/.test(req.request_id) ? req.request_id : `req_${randomUUID().replace(/-/g, '').slice(0, 16)}`
  const results = (req.tool_results ?? []).slice(0, MAX_TOOL_ROUNDS + 1)
  const context = (req.context ?? []).slice(0, 24)
  const hard = HARD.test(req.message) || results.some((r) => r.tool === 'prepare_dispatch_change' || r.tool === 'commit_dispatch_change' || r.status !== 'completed')
  const model = hard ? cfg.reasoningModel : cfg.model
  const meta: AgentMeta = {
    model, speed: null, route: hard ? 'reasoning' : 'default', prompt_version: PROMPT_VERSION, schema_version: SCHEMA_VERSION,
    attempts: [], ms: { claude: 0, validate: 0, total: 0 }, usage: { input: 0, output: 0, cache_read: 0 }, validation: { ok: false, issues: [] },
  }
  const done = (decision: AgentDecision, next: AgentResponse['next'] = 'final', tool_call: ToolCall | null = null): AgentResponse => {
    meta.ms.total = Date.now() - t0
    return { request_id: requestId, next, decision, tool_call, meta }
  }

  // 모델에 주는 입력: 서버가 정한 역할 · 조직 · 요청 ID와 화면이 읽어 보낸 문맥 · 도구 결과(자유 텍스트는 데이터로 표시)
  const payload = {
    request_id: requestId,
    lang,
    server: { role: cfg.role, tenant: cfg.tenant },
    conversation: (req.history ?? []).slice(-8).map((t) => ({ role: t.role === 'assistant' ? 'assistant' : 'user', text: clip(String(t.text ?? ''), 500) })),
    context: context.map((c) => ({ id: String(c.id), kind: String(c.kind), text: clip(String(c.text ?? ''), 400) })),
    tool_results: results.map((r) => ({ id: r.call_id, tool: r.tool, args: r.args, status: r.status, read_at: r.read_at, error: r.error, data: dataOf(r.data) })),
    user_message: clip(String(req.message ?? ''), 800),
  }

  // Claude 호출(시간 예산 안에서): Fast mode → 거절되면 같은 모델 표준 모드로 한 번. repair: 검증 실패 내용을 알려 한 번 고쳐 받는다
  type Turn = { role: 'user' | 'assistant'; content: string }
  let messages: Turn[] = [{ role: 'user', content: JSON.stringify(payload) }]
  const call = async (speed: 'fast' | 'standard') => {
    const left = cfg.budgetMs - (Date.now() - t0)
    if (left < 2500) throw new Error('time budget exhausted')
    const started = Date.now()
    try {
      const body = {
        model,
        max_tokens: 3000,
        system: [{ type: 'text' as const, text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' as const } }],
        messages,
        // 정확도 우선: 일반 medium, 고난도 high(Fast mode가 출력 속도를 보완한다)
        output_config: { effort: (hard ? 'high' : 'medium') as 'medium' | 'high', format: { type: 'json_schema' as const, schema: DECISION_SCHEMA as unknown as Record<string, unknown> } },
        ...(speed === 'fast' ? { speed: 'fast' as const, betas: ['fast-mode-2026-02-01'] } : {}),
      }
      const res = await anthropic().beta.messages.create(body, { timeout: Math.min(left - 500, 28000) })
      meta.attempts.push({ model: res.model, speed: res.usage.speed ?? speed, ok: true, ms: Date.now() - started })
      return res
    } catch (e) {
      meta.attempts.push({ model, speed, ok: false, error: e instanceof Error ? e.message.slice(0, 160) : String(e), ms: Date.now() - started })
      throw e
    }
  }
  const wantFast = cfg.fast && model.startsWith('claude-opus') && !fastUnsupported.has(model)
  const evidenceIds = new Set([...context.map((c) => String(c.id)), ...results.map((r) => r.call_id)])
  /** 한 번 묻고 검증까지(실패하면 문제 목록과 모델 원문을 돌려준다) */
  const attempt = async () => {
    const c0 = Date.now()
    let res
    try {
      try {
        res = await call(wantFast ? 'fast' : 'standard')
      } catch (e) {
        const fastProblem = wantFast && (e instanceof Anthropic.BadRequestError || e instanceof Anthropic.RateLimitError || e instanceof Anthropic.PermissionDeniedError)
        const transient = e instanceof Anthropic.InternalServerError || e instanceof Anthropic.APIConnectionError
        if (fastProblem && e instanceof Anthropic.BadRequestError && /speed|fast/i.test(e.message)) fastUnsupported.add(model)
        if (!fastProblem && !transient) throw e
        res = await call('standard')
      }
    } finally {
      meta.ms.claude += Date.now() - c0
    }
    meta.model = res.model
    meta.speed = res.usage.speed ?? null
    meta.usage.input += res.usage.input_tokens
    meta.usage.output += res.usage.output_tokens
    meta.usage.cache_read += res.usage.cache_read_input_tokens ?? 0
    const v0 = Date.now()
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
    let raw: unknown = null
    const issues: string[] = []
    if (res.stop_reason === 'refusal') issues.push('refusal')
    else if (res.stop_reason === 'max_tokens') issues.push('output cut off (max_tokens)')
    else {
      try {
        raw = JSON.parse(text)
      } catch {
        issues.push('JSON parse failed')
      }
    }
    const checked = issues.length ? { ok: false, issues, decision: null } : validateDecision(raw, { requestId, evidenceIds })
    meta.ms.validate += Date.now() - v0
    return { checked, text, stop: res.stop_reason }
  }
  let checked
  try {
    let a = await attempt()
    // 검증 실패(거절 제외): 문제 목록을 알려 한 번 고쳐 받는다. 부분 결과로 실행하지 않는다
    if (!a.checked.ok && a.stop !== 'refusal' && cfg.budgetMs - (Date.now() - t0) > 8000) {
      meta.validation.issues = [...a.checked.issues]
      messages = [...messages, { role: 'assistant', content: a.text || '{}' }, { role: 'user', content: `Server validation rejected that output: ${a.checked.issues.join('; ')}. Return the corrected decision for the same request (same request_id), following every rule. Change only what is needed.` }]
      a = await attempt()
      if (a.checked.ok) meta.validation.issues = [`repaired: ${meta.validation.issues.join('; ')}`]
    }
    checked = a.checked
  } catch (e) {
    // 인증 · 크레딧 오류는 기존 AI 오류 처리(server/http.ts)에서 알린다
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError || (e instanceof Anthropic.BadRequestError && /credit balance/i.test(e.message))) throw e
    return done(fixed(requestId, lang, 'unavailable', e instanceof Error ? clip(e.message, 80) : ''))
  }
  meta.validation = { ok: checked.ok, issues: checked.ok ? meta.validation.issues : checked.issues }
  if (!checked.ok || !checked.decision) return done(fixed(requestId, lang, 'invalid'))
  const d = checked.decision

  // 도구 정책: 허용 역할 · 승인 필요 여부 · 단계 상한은 서버가 정한다
  if (d.tool_plan) {
    const spec = TOOL_REGISTRY[d.tool_plan.tool]
    if (!spec.roles.includes(cfg.role)) return done(fixed(requestId, lang, 'forbidden', say(lang, ...(TOOL_LABEL[spec.name] ?? [spec.name, spec.name]))))
    if (results.length >= MAX_TOOL_ROUNDS) return done(fixed(requestId, lang, 'rounds'))
    // 같은 조회를 같은 인자로 또 부르면 반복이다: 이미 받은 결과로 답하게 한다
    const repeat = results.some((r) => r.tool === d.tool_plan!.tool && JSON.stringify(r.args) === JSON.stringify(d.tool_plan!.args))
    if (repeat) return done(fixed(requestId, lang, 'rounds'))
    const call: ToolCall = {
      call_id: `${requestId}-t${results.length + 1}`,
      tool: spec.name,
      kind: spec.kind,
      args: d.tool_plan.args,
      requires_confirmation: spec.confirm,
    }
    return done(d, spec.confirm ? 'confirm' : 'tool', call)
  }
  return done(d)
}
