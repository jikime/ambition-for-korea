// 좁은 판단 질문(choice·noul·score)을 정의하고 Claude 한 번 호출로 답을 받는다. 서버에서만 실행한다(API 키는 서버 환경 변수·.env에만 둔다).
// 질문 묶음을 JSON 스키마로 바꿔 structured outputs로 받으므로, 답은 늘 정해진 모양(선택지 키·0~1 확률·척도 값)이다.
// 신뢰도·확률은 모델이 스스로 매긴 값이다(보정된 확률이 아니다). 정책(문턱값·조치)은 호출한 코드가 정한다.
import Anthropic from '@anthropic-ai/sdk'

export const MODEL = 'claude-haiku-5-5'

/** 서버 키: 환경 변수 ANTHROPIC_API_KEY. 없으면 프로젝트 루트의 .env에서 한 번 읽는다(배포 환경은 플랫폼 환경 변수를 쓴다) */
export function serverApiKey(): string {
  if (!process.env.ANTHROPIC_API_KEY) {
    try {
      process.loadEnvFile('.env')
    } catch {
      // .env가 없으면(배포 환경 등) 환경 변수만 쓴다
    }
  }
  return process.env.ANTHROPIC_API_KEY?.trim() ?? ''
}

/** 여러 선택지 중 하나 */
export interface ChoiceQ {
  kind: 'choice'
  question: string
  rule?: string
  options: Record<string, string>
}
/** 예/아니오 확률 */
export interface NoulQ {
  kind: 'noul'
  question: string
  labels?: { true: string; false: string }
}
/** 0..(anchors.length-1) 척도 */
export interface ScoreQ {
  kind: 'score'
  question: string
  anchors: string[]
}
export type Question = ChoiceQ | NoulQ | ScoreQ

export function choice(q: string | { question: string; rule?: string }, options: Record<string, string>): ChoiceQ {
  return typeof q === 'string' ? { kind: 'choice', question: q, options } : { kind: 'choice', question: q.question, rule: q.rule, options }
}

export function noul(question: string, labels?: { true: string; false: string }): NoulQ {
  return { kind: 'noul', question, labels }
}

export function score(question: string, anchors: string[]): ScoreQ {
  return { kind: 'score', question, anchors }
}

export type Answer<Q extends Question> = Q extends ChoiceQ
  ? { choice: string; confidence: number }
  : Q extends NoulQ
    ? { noul: number }
    : { score: number; confidence: number }

export type Answers<Qs extends Record<string, Question>> = { [K in keyof Qs]: Answer<Qs[K]> }

const SYSTEM = `You answer narrow judgment questions for a parcel and logistics control dashboard.
The user message holds \`state\` (JSON with text written by people: customers, drivers, workers, shipping lines; Korean or English) and a list of questions about it.
Answer every question from the state alone. Do not invent facts the text does not support.
Answer formats:
- choice: "choice" is exactly one option key. "confidence" is your probability (0 to 1) that this option is right.
- yes/no: "p" is your probability (0 to 1) that the answer is yes.
- scale: "score" is a number on the given scale (decimals allowed when the text falls between two levels). "confidence" is your probability (0 to 1) that the level nearest your score is right.
Be calibrated: use values near 0.5 when the text is ambiguous, and near 0 or 1 only when it is clear.`

function describe(key: string, q: Question) {
  if (q.kind === 'choice') {
    const opts = Object.entries(q.options).map(([k, v]) => `    ${k}: ${v}`).join('\n')
    return `- ${key} (choice): ${q.question}${q.rule ? `\n  Rule: ${q.rule}` : ''}\n  Options:\n${opts}`
  }
  if (q.kind === 'noul') {
    return `- ${key} (yes/no): ${q.question}${q.labels ? `\n  Yes means: ${q.labels.true}\n  No means: ${q.labels.false}` : ''}`
  }
  const levels = q.anchors.map((a, i) => `    ${i}: ${a}`).join('\n')
  return `- ${key} (scale 0 to ${q.anchors.length - 1}): ${q.question}\n  Levels:\n${levels}`
}

function schemaFor(q: Question) {
  if (q.kind === 'choice') return { type: 'object', properties: { choice: { type: 'string', enum: Object.keys(q.options) }, confidence: { type: 'number' } }, required: ['choice', 'confidence'], additionalProperties: false }
  if (q.kind === 'noul') return { type: 'object', properties: { p: { type: 'number' } }, required: ['p'], additionalProperties: false }
  return { type: 'object', properties: { score: { type: 'number' }, confidence: { type: 'number' } }, required: ['score', 'confidence'], additionalProperties: false }
}

const clamp = (v: unknown, lo: number, hi: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo
}

/** 모델 답을 질문 모양으로 정리한다(범위를 벗어난 값은 잘라 낸다) */
function normalize(q: Question, raw: any) {
  if (q.kind === 'choice') {
    const keys = Object.keys(q.options)
    return { choice: keys.includes(raw?.choice) ? raw.choice : keys[keys.length - 1], confidence: clamp(raw?.confidence, 0, 1) }
  }
  if (q.kind === 'noul') return { noul: clamp(raw?.p, 0, 1) }
  return { score: clamp(raw?.score, 0, q.anchors.length - 1), confidence: clamp(raw?.confidence, 0, 1) }
}

export class JudgeClient {
  private client: Anthropic

  /** apiKey를 빼면 서버 키(ANTHROPIC_API_KEY, .env)를 쓴다 */
  constructor(opts: { apiKey?: string; timeout?: number } = {}) {
    this.client = new Anthropic({ apiKey: opts.apiKey || serverApiKey(), timeout: opts.timeout ?? 25000, maxRetries: 1 })
  }

  async systemOne<Qs extends Record<string, Question>>(req: { state: unknown; questions: Qs }): Promise<{ answers: Answers<Qs>; model: string; usage: { input_tokens: number; output_tokens: number } }> {
    const entries = Object.entries(req.questions)
    const schema = {
      type: 'object',
      properties: Object.fromEntries(entries.map(([k, q]) => [k, schemaFor(q)])),
      required: entries.map(([k]) => k),
      additionalProperties: false,
    }
    const prompt = `state:\n${JSON.stringify(req.state, null, 1)}\n\nQuestions:\n${entries.map(([k, q]) => describe(k, q)).join('\n')}`
    // Haiku 5.5는 server-side fallback이 없다: 거절(refusal)은 아래에서 오류로 돌려 기본 규칙으로 넘긴다
    const res = await this.client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      // 짧은 분류라 생각은 적게(속도 우선)
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    })
    if (res.stop_reason === 'refusal') throw new Error('Claude declined to answer (refusal)')
    if (res.stop_reason === 'max_tokens') throw new Error('Claude answer was cut off (max_tokens)')
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
    const raw = JSON.parse(text)
    const answers = Object.fromEntries(entries.map(([k, q]) => [k, normalize(q, raw?.[k])])) as Answers<Qs>
    return { answers, model: res.model, usage: { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens } }
  }
}
