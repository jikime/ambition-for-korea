// hubtrace 물류관리원 에이전트의 판단 계약(choice → true_or_false → score). 서버와 화면이 같이 쓰는 순수 모듈(Node·브라우저 API 없음).
//  - Claude 구조화 출력용 JSON Schema(API가 못 거는 제약: 점수 범위·합계, 후보 간 관계는 validateDecision이 검사)
//  - 도구 레지스트리(읽기/쓰기, 승인 필요, 허용 역할)와 choice ↔ 도구 ↔ decision 허용 조합
//  - 서버 검증기: 통과하지 못한 결정은 실행하지 않고 고정 안내로 바꾼다
export const SCHEMA_VERSION = '1.0'

export const CHOICES = [
  'answer_question', 'query_shipment', 'query_inventory', 'query_operations', 'create_work_task',
  'prepare_dispatch_change', 'execute_dispatch_change', 'ask_clarification', 'request_confirmation', 'report_limitation',
] as const
export type Choice = (typeof CHOICES)[number]

export const DECISIONS = ['answer', 'clarify', 'confirm', 'tool_request', 'limitation'] as const
export type Decision = (typeof DECISIONS)[number]

export const EVIDENCE = ['verified', 'missing', 'conflicting', 'not_applicable'] as const
export type EvidenceStatus = (typeof EVIDENCE)[number]

export const INTENTS = ['shipment_status', 'inventory', 'operations', 'work_task', 'dispatch_change', 'general_question', 'greeting', 'out_of_scope'] as const
export type Intent = (typeof INTENTS)[number]

export const TOOLS = ['get_shipment_status', 'get_inventory', 'list_warehouse_operations', 'create_work_task', 'prepare_dispatch_change', 'commit_dispatch_change'] as const
export type ToolName = (typeof TOOLS)[number]

export const SITES = ['GJ', 'IC', 'IN', 'TW', 'BS', 'AP', 'DJ'] as const
export const ITEMS = ['water', 'rice', 'ramen', 'tissue', 'detergent', 'petfood', 'box', 'helmet'] as const
export const PRIORITIES = ['normal', 'high'] as const

export type Role = 'viewer' | 'operator'

export interface ToolSpec {
  name: ToolName
  kind: 'read' | 'write'
  /** 서버 정책: 실행 전 사용자 승인이 필요한가(모델 출력과 무관) */
  confirm: boolean
  roles: Role[]
  /** 필수 인자 */
  required: (keyof ToolArgs)[]
  description: string
}

/** 도구 인자(모델은 모든 칸을 채우고, 쓰지 않는 칸은 빈 문자열). 서버가 도구별로 정리한다 */
export interface ToolArgs {
  identifier: string
  item: string
  site: string
  vehicle_id: string
  title: string
  detail: string
  priority: string
  plan_version: string
}

export const TOOL_REGISTRY: Record<ToolName, ToolSpec> = {
  get_shipment_status: { name: 'get_shipment_status', kind: 'read', confirm: false, roles: ['viewer', 'operator'], required: ['identifier'], description: 'Look up one shipment, parcel, vehicle or pallet by its waybill/parcel number, vehicle ID, plate or pallet ID. Returns status, location, ETA and the time it was read.' },
  get_inventory: { name: 'get_inventory', kind: 'read', confirm: false, roles: ['viewer', 'operator'], required: [], description: 'Pallet inventory by item and site (pallets and pieces, stored/staged/in transit). Optional item and site filters.' },
  list_warehouse_operations: { name: 'list_warehouse_operations', kind: 'read', confirm: false, roles: ['viewer', 'operator'], required: ['site'], description: 'Live operations at one site: docks in use, forklifts (working/idle/low battery), vehicles by phase, sorter rate, active incidents, pending approvals.' },
  create_work_task: { name: 'create_work_task', kind: 'write', confirm: true, roles: ['operator'], required: ['site', 'title'], description: 'Create a work task on the site task board (title, detail, priority). Needs the user to confirm.' },
  prepare_dispatch_change: { name: 'prepare_dispatch_change', kind: 'read', confirm: false, roles: ['operator'], required: ['vehicle_id'], description: 'Draft a stop transfer for a Daon Village delivery van: which last stops move to which departing van, before/after and impact. Changes nothing; returns a plan_version.' },
  commit_dispatch_change: { name: 'commit_dispatch_change', kind: 'write', confirm: true, roles: ['operator'], required: ['vehicle_id', 'plan_version'], description: 'Apply a previously prepared stop transfer (same vehicle_id and plan_version from prepare_dispatch_change). Needs the user to confirm.' },
}

/** choice → 쓸 수 있는 도구 */
export const CHOICE_TOOL: Partial<Record<Choice, ToolName>> = {
  query_shipment: 'get_shipment_status',
  query_inventory: 'get_inventory',
  query_operations: 'list_warehouse_operations',
  create_work_task: 'create_work_task',
  prepare_dispatch_change: 'prepare_dispatch_change',
  execute_dispatch_change: 'commit_dispatch_change',
}

/** choice ↔ decision 허용 조합 */
export const CHOICE_DECISIONS: Record<Choice, Decision[]> = {
  answer_question: ['answer'],
  query_shipment: ['tool_request', 'answer'],
  query_inventory: ['tool_request', 'answer'],
  query_operations: ['tool_request', 'answer'],
  create_work_task: ['tool_request'],
  prepare_dispatch_change: ['tool_request', 'answer'],
  execute_dispatch_change: ['tool_request'],
  ask_clarification: ['clarify'],
  request_confirmation: ['confirm'],
  report_limitation: ['limitation'],
}

export interface ScoreBreakdown { intent_fit: number; evidence_sufficiency: number; context_fit: number }

export interface ChoiceCandidate {
  choice: Choice
  true_or_false: boolean
  score: number
  score_breakdown: ScoreBreakdown
  evidence_status: EvidenceStatus
  reason_summary: string
}

export interface ToolPlan { tool: ToolName; args: Partial<ToolArgs> }

export interface AgentDecision {
  schema_version: string
  request_id: string
  intent: Intent
  choices: ChoiceCandidate[]
  selected_choice: Choice
  decision: Decision
  answer: string
  speech_text: string
  missing_fields: string[]
  evidence_refs: string[]
  tool_plan: ToolPlan | null
}

/** 모델이 내는 원래 모양(tool_plan은 늘 객체, 안 쓰면 tool 'none') */
const ARG_KEYS: (keyof ToolArgs)[] = ['identifier', 'item', 'site', 'vehicle_id', 'title', 'detail', 'priority', 'plan_version']

/** Claude 구조화 출력용 JSON Schema(output_config.format) */
export const DECISION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['schema_version', 'request_id', 'intent', 'choices', 'selected_choice', 'decision', 'answer', 'speech_text', 'missing_fields', 'evidence_refs', 'tool_plan'],
  properties: {
    schema_version: { type: 'string', enum: [SCHEMA_VERSION] },
    request_id: { type: 'string' },
    intent: { type: 'string', enum: [...INTENTS] },
    choices: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['choice', 'true_or_false', 'score', 'score_breakdown', 'evidence_status', 'reason_summary'],
        properties: {
          choice: { type: 'string', enum: [...CHOICES] },
          true_or_false: { type: 'boolean' },
          score: { type: 'integer' },
          score_breakdown: {
            type: 'object',
            additionalProperties: false,
            required: ['intent_fit', 'evidence_sufficiency', 'context_fit'],
            properties: { intent_fit: { type: 'integer' }, evidence_sufficiency: { type: 'integer' }, context_fit: { type: 'integer' } },
          },
          evidence_status: { type: 'string', enum: [...EVIDENCE] },
          reason_summary: { type: 'string' },
        },
      },
    },
    selected_choice: { type: 'string', enum: [...CHOICES] },
    decision: { type: 'string', enum: [...DECISIONS] },
    answer: { type: 'string' },
    speech_text: { type: 'string' },
    missing_fields: { type: 'array', items: { type: 'string' } },
    evidence_refs: { type: 'array', items: { type: 'string' } },
    tool_plan: {
      type: 'object',
      additionalProperties: false,
      required: ['tool', ...ARG_KEYS],
      properties: {
        tool: { type: 'string', enum: ['none', ...TOOLS] },
        ...Object.fromEntries(ARG_KEYS.map((k) => [k, { type: 'string' }])),
      },
    },
  },
} as const

export interface ValidationResult {
  ok: boolean
  issues: string[]
  decision: AgentDecision | null
}

const isInt = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi
const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/**
 * 모델 출력 검증. evidenceIds: 서버가 이번 요청에 실제로 준 문맥 · 도구 결과 ID.
 * 통과한 경우에만 decision을 돌려준다(tool_plan은 도구별 인자만 남긴다).
 */
export function validateDecision(raw: unknown, ctx: { requestId: string; evidenceIds: Set<string> }): ValidationResult {
  const issues: string[] = []
  const r = raw as Record<string, unknown> | null
  if (!r || typeof r !== 'object') return { ok: false, issues: ['not an object'], decision: null }
  if (r.schema_version !== SCHEMA_VERSION) issues.push('schema_version')
  if (r.request_id !== ctx.requestId) issues.push('request_id mismatch')
  if (!INTENTS.includes(r.intent as Intent)) issues.push('intent enum')
  const choices = Array.isArray(r.choices) ? (r.choices as Record<string, unknown>[]) : []
  if (choices.length < 1 || choices.length > 3) issues.push(`choices count ${choices.length}`)
  const seen = new Set<string>()
  const parsed: ChoiceCandidate[] = []
  for (const c of choices) {
    const name = c?.choice as Choice
    if (!CHOICES.includes(name)) { issues.push(`choice enum ${String(name)}`); continue }
    if (seen.has(name)) issues.push(`duplicate choice ${name}`)
    seen.add(name)
    const b = (c.score_breakdown ?? {}) as Record<string, unknown>
    if (!isInt(c.score, 0, 100)) issues.push(`${name}: score range`)
    if (!isInt(b.intent_fit, 0, 40) || !isInt(b.evidence_sufficiency, 0, 35) || !isInt(b.context_fit, 0, 25)) issues.push(`${name}: breakdown range`)
    else if ((b.intent_fit as number) + (b.evidence_sufficiency as number) + (b.context_fit as number) !== c.score) issues.push(`${name}: score sum`)
    if (typeof c.true_or_false !== 'boolean') issues.push(`${name}: true_or_false type`)
    if (!EVIDENCE.includes(c.evidence_status as EvidenceStatus)) issues.push(`${name}: evidence_status`)
    parsed.push({
      choice: name,
      true_or_false: c.true_or_false === true,
      score: Number(c.score),
      score_breakdown: { intent_fit: Number(b.intent_fit), evidence_sufficiency: Number(b.evidence_sufficiency), context_fit: Number(b.context_fit) },
      evidence_status: c.evidence_status as EvidenceStatus,
      reason_summary: str(c.reason_summary, 300),
    })
  }
  const selected = r.selected_choice as Choice
  const pick = parsed.find((c) => c.choice === selected)
  if (!pick) issues.push('selected_choice not in choices')
  else if (!pick.true_or_false) issues.push('selected_choice is false')
  const decision = r.decision as Decision
  if (!DECISIONS.includes(decision)) issues.push('decision enum')
  else if (pick && !CHOICE_DECISIONS[pick.choice].includes(decision)) issues.push(`decision ${decision} not allowed for ${pick.choice}`)
  const answer = str(r.answer)
  const speech = str(r.speech_text)
  if (!answer) issues.push('empty answer')
  if (!speech) issues.push('empty speech_text')
  // 음성 문장이 숫자(운송장 · 수량 · 시각)를 빠뜨리지 않았는가: 숫자 묶음 단위로(14:41 = 14 · 41, 1,906 = 1906)
  const digits = (s: string): string[] => s.replace(/(\d),(?=\d{3}\b)/g, '$1').match(/\d+/g) ?? []
  const spoken = digits(speech)
  const missingDigits = digits(answer).filter((d) => !spoken.includes(d))
  if (missingDigits.length) issues.push(`speech_text drops numbers ${missingDigits.slice(0, 3).join(',')}`)
  const refs = Array.isArray(r.evidence_refs) ? (r.evidence_refs as unknown[]).map((x) => String(x)) : []
  const unknownRefs = refs.filter((x) => !ctx.evidenceIds.has(x))
  if (unknownRefs.length) issues.push(`unknown evidence_refs ${unknownRefs.slice(0, 3).join(',')}`)
  const missing = Array.isArray(r.missing_fields) ? (r.missing_fields as unknown[]).map((x) => str(x, 60)).filter(Boolean) : []
  if (decision === 'clarify' && !missing.length) issues.push('clarify without missing_fields')
  // 조회형 답변은 실제 근거(도구 결과 · 문맥 ID)가 있어야 한다
  if (pick && decision === 'answer' && CHOICE_TOOL[pick.choice] && !refs.length) issues.push('data answer without evidence_refs')
  // tool_plan: 도구 요청 · 승인 요청에만, 고른 choice에 맞는 도구로
  const tp = (r.tool_plan ?? {}) as Record<string, unknown>
  const tool = tp.tool as ToolName | 'none'
  let plan: ToolPlan | null = null
  const needsTool = decision === 'tool_request' || decision === 'confirm'
  if (needsTool) {
    const want = pick ? (pick.choice === 'request_confirmation' ? 'commit_dispatch_change' : CHOICE_TOOL[pick.choice]) : undefined
    if (!TOOLS.includes(tool as ToolName)) issues.push('tool_plan missing for tool request')
    else if (want && tool !== want) issues.push(`tool ${tool} does not match ${pick?.choice}`)
    else {
      const spec = TOOL_REGISTRY[tool as ToolName]
      const args: Partial<ToolArgs> = {}
      for (const k of ARG_KEYS) {
        const v = str(tp[k], k === 'detail' ? 400 : 120)
        if (v) args[k] = v
      }
      for (const k of spec.required) if (!args[k]) issues.push(`tool ${tool} missing ${k}`)
      if (args.site && !SITES.includes(args.site as (typeof SITES)[number])) issues.push('site enum')
      if (args.item && !ITEMS.includes(args.item as (typeof ITEMS)[number])) issues.push('item enum')
      if (args.priority && !PRIORITIES.includes(args.priority as (typeof PRIORITIES)[number])) issues.push('priority enum')
      plan = { tool: tool as ToolName, args }
    }
  } else if (tool && tool !== 'none') issues.push(`tool_plan ${tool} with decision ${decision}`)
  // 내부 값(계획 버전 · 근거 ID)은 사용자 문장에 넣지 않는다(음성으로 읽힌다)
  const internal = [str(tp.plan_version, 120), ...refs].filter((x) => x.length >= 6)
  if (internal.some((x) => answer.includes(x) || speech.includes(x))) issues.push('answer exposes internal ids (plan_version / evidence ids)')
  if (issues.length) return { ok: false, issues, decision: null }
  return {
    ok: true,
    issues: [],
    decision: {
      schema_version: SCHEMA_VERSION,
      request_id: ctx.requestId,
      intent: r.intent as Intent,
      choices: parsed,
      selected_choice: selected,
      decision,
      answer,
      speech_text: speech,
      missing_fields: missing,
      evidence_refs: refs,
      tool_plan: plan,
    },
  }
}

// ───────────────────────── 화면 ↔ 서버 요청 · 응답

export interface ChatTurn { role: 'user' | 'assistant'; text: string }

/** 화면이 보내는 업무 문맥(브라우저 시뮬레이션에서 읽은 값). 서버는 ID 목록을 근거 검증에 쓴다 */
export interface ContextItem { id: string; kind: string; text: string }

export interface ToolResult {
  call_id: string
  tool: ToolName
  args: Partial<ToolArgs>
  status: 'completed' | 'failed' | 'unknown'
  /** 근거로 쓸 수 있는 결과 ID(= call_id) */
  data: unknown
  error?: string
  /** 시뮬레이션 시각(조회 기준) */
  read_at: string
}

export interface AgentRequest {
  request_id?: string
  message: string
  lang: 'ko' | 'en'
  history: ChatTurn[]
  context: ContextItem[]
  tool_results: ToolResult[]
}

export interface ToolCall {
  call_id: string
  tool: ToolName
  kind: 'read' | 'write'
  args: Partial<ToolArgs>
  requires_confirmation: boolean
}

export interface AgentMeta {
  model: string
  speed: 'fast' | 'standard' | null
  route: 'default' | 'reasoning'
  prompt_version: string
  schema_version: string
  attempts: { model: string; speed: string; ok: boolean; error?: string; ms: number }[]
  ms: { claude: number; validate: number; total: number }
  usage: { input: number; output: number; cache_read: number }
  validation: { ok: boolean; issues: string[] }
}

export interface AgentResponse {
  request_id: string
  /** final: 답을 보여 준다 · tool: 읽기 도구를 실행해 결과를 다시 보낸다 · confirm: 승인 카드를 보여 준다 */
  next: 'final' | 'tool' | 'confirm'
  decision: AgentDecision
  tool_call: ToolCall | null
  meta: AgentMeta
}
