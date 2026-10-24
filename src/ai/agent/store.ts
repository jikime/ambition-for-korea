// hubtrace 물류관리원 대화 상태 머신(화면). 실제 라이프사이클은 여기서 정하고, 모델이 보낸 문자열로 성공 · 말하기를 시작하지 않는다.
//  send → thinking → (서버가 tool이면 읽기 도구 실행 → 결과를 다시 보냄)* → final(답) | confirm(승인 카드)
//  승인 → 쓰기 도구 실행(승인 바인딩 · 대상 버전 · 멱등성은 tools.ts) → 실제 결과로만 안내(추가 모델 호출 없이)
//  새 질문 · 말하기 시작 · 취소는 요청 세대(gen)를 올려 이전 응답 · 음성 콜백을 무시한다
import { create } from 'zustand'
import type { AgentDecision, AgentMeta, AgentRequest, AgentResponse, ChatTurn, ToolCall, ToolResult } from '../../../server/agent/contract'
import type { AssistantState } from './mascot/motion.mjs'
import { agentContext, argsKey, runTool } from './tools'
import { stt, tts } from './speech'
import { useStore } from '../../store'
import { ai } from '../../sim/ai'
import { LANG, L } from '../../i18n'

export type Phase = 'idle' | 'listening' | 'thinking' | 'tool' | 'speaking'

export interface Confirmation {
  call: ToolCall
  requestId: string
  /** 승인 카드에 보여 줄 실행 내용(배차 변경이면 준비한 계획) */
  plan: unknown
  state: 'pending' | 'approved' | 'rejected' | 'expired'
  expires: number
}

export interface Msg {
  id: number
  role: 'user' | 'assistant' | 'step'
  text: string
  /** 판단 보기(모델 응답일 때) */
  decision?: AgentDecision
  meta?: AgentMeta
  /** 이 답의 근거가 된 도구 결과 */
  tools?: { tool: string; status: string; read_at: string }[]
  confirm?: Confirmation
  tone?: 'ok' | 'error'
}

export interface Metric {
  kind: 'simple' | 'tool' | 'write'
  /** 제출 → 대기 표시(ms) */
  ack: number
  /** 제출 → 검증된 답 표시 */
  answer: number
  /** 서버 Claude 시간(단계 합) */
  claude: number
  /** 답 표시 → 첫 음성(ms, 음성 켰을 때) */
  tts?: number
  steps: number
  speed: string
}

interface AgentState {
  open: boolean
  phase: Phase
  /** 캐릭터 상태(일회성 동작은 끝나면 컴포넌트가 idle로 알려 준다) */
  character: AssistantState
  actionKey: number
  messages: Msg[]
  draft: string
  voice: boolean
  /** 진행 중 단계 문구 */
  step: string
  metrics: Metric[]
  error: string
}

let seq = 1
let gen = 0
let abort: AbortController | null = null
let listening: { stop(): void } | null = null
let answerShownAt = 0
let pendingTtsMetric: Metric | null = null
let sleepTimer: ReturnType<typeof setTimeout> | null = null

export const useAgent = create<AgentState>(() => ({
  open: false, phase: 'idle', character: 'idle', actionKey: 0, messages: [], draft: '', voice: true, step: '', metrics: [], error: '',
}))

const set = useAgent.setState
const get = useAgent.getState

function push(m: Omit<Msg, 'id'>) {
  const msg = { ...m, id: seq++ }
  set((s) => ({ messages: [...s.messages, msg].slice(-60) }))
  return msg.id
}

function patch(id: number, p: Partial<Msg>) {
  set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, ...p } : m)) }))
}

/** 오래 가만히 있으면 휴식 동작 */
function armSleep() {
  if (sleepTimer) clearTimeout(sleepTimer)
  sleepTimer = setTimeout(() => {
    if (get().phase === 'idle' && get().open) set({ character: 'sleep' })
  }, 90_000)
}

function setCharacter(c: AssistantState) {
  set((s) => ({ character: c, actionKey: c === 'wave' || c === 'success' || c === 'error' ? s.actionKey + 1 : s.actionKey }))
  armSleep()
}

function history(): ChatTurn[] {
  return get().messages.filter((m) => m.role !== 'step').slice(-8).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', text: m.text }))
}

/** 답을 말하거나(음성 켬) 끝 동작(성공 · 다시 확인)으로 마무리 */
function finish(text: string, tone: 'ok' | 'error' | 'plain', metric: Metric | null) {
  answerShownAt = performance.now()
  if (metric) {
    metric.answer = Math.round(answerShownAt - metric.answer)
    set((s) => ({ metrics: [...s.metrics, metric].slice(-100) }))
  }
  if (get().voice && tts.supported) {
    const myGen = gen
    pendingTtsMetric = metric
    set({ phase: 'speaking', step: '' })
    tts.speak(text, LANG, {
      onStart: () => {
        if (myGen !== gen) return
        if (pendingTtsMetric) {
          pendingTtsMetric.tts = Math.round(performance.now() - answerShownAt)
          set((s) => ({ metrics: [...s.metrics] }))
          pendingTtsMetric = null
        }
        setCharacter('speaking')
      },
      onEnd: () => {
        if (myGen !== gen) return
        set({ phase: 'idle' })
        // 말이 끝나면 입을 닫고 대기(성공 · 확인 필요는 짧은 동작으로)
        setCharacter(tone === 'ok' ? 'success' : tone === 'error' ? 'error' : 'idle')
      },
    })
  } else {
    set({ phase: 'idle', step: '' })
    setCharacter(tone === 'ok' ? 'success' : tone === 'error' ? 'error' : 'idle')
  }
}

const TOOL_STEP: Record<string, () => string> = {
  get_shipment_status: () => L('화물 상태를 조회하고 있어요', 'Looking up the shipment'),
  get_inventory: () => L('재고를 조회하고 있어요', 'Checking inventory'),
  list_warehouse_operations: () => L('현장 현황을 조회하고 있어요', 'Checking site operations'),
  prepare_dispatch_change: () => L('이관 계획을 계산하고 있어요', 'Drafting the stop transfer'),
}

async function post(body: AgentRequest, signal: AbortSignal): Promise<AgentResponse> {
  const res = await fetch('/api/ai/agent', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-lang': LANG },
    body: JSON.stringify(body),
    signal,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
  return data as AgentResponse
}

/** 사용자가 패널을 닫았는지(이 탭 동안 기억: 다시 열 때까지 자동으로 열지 않는다) */
const PANEL_KEY = 'hubtrace.agent'
const remember = (v: 'open' | 'closed') => {
  try {
    sessionStorage.setItem(PANEL_KEY, v)
  } catch {
    // 저장소를 못 쓰면 기억하지 않는다
  }
}
const closedBefore = () => {
  try {
    return sessionStorage.getItem(PANEL_KEY) === 'closed'
  } catch {
    return false
  }
}

export const agent = {
  /** 첫 화면에서 기본으로 연다(태블릿 이하 좁은 화면 · 사용자가 닫은 탭은 제외) */
  autoOpen() {
    if (closedBefore() || window.innerWidth < 1024) return
    agent.openPanel(true)
  },
  openPanel(auto = false) {
    if (!auto) remember('open')
    if (get().open) return
    set({ open: true })
    setCharacter('wave')
    if (!get().messages.length) {
      push({ role: 'assistant', text: L('안녕하세요, hubtrace 물류관리원이에요. 화물 위치, 재고, 현장 현황을 물어보시거나 작업 지시 · 배차 변경을 맡겨 주세요.', "Hi, I'm the hubtrace logistics assistant. Ask about shipments, inventory or site operations, or hand me a work task or a dispatch change.") })
    }
  },
  closePanel() {
    remember('closed')
    agent.cancel()
    agent.stopListening()
    set({ open: false, character: 'idle' })
  },

  toggleVoice() {
    const on = !get().voice
    if (!on) agent.stopSpeaking()
    set({ voice: on })
  },

  stopSpeaking() {
    tts.stop()
    if (get().phase === 'speaking') set({ phase: 'idle' })
    setCharacter('idle')
  },

  /** 진행 중인 답 생성 · 음성을 멈춘다(이미 실행한 업무는 되돌리지 않는다) */
  /** 진행 중인 판단 · 조회 · 말하기를 멈춘다. note: 사용자가 멈추기를 눌렀으면 멈췄다고 남긴다 */
  cancel(note = false) {
    gen++
    abort?.abort()
    abort = null
    tts.stop()
    const was = get().phase
    if (was === 'thinking' || was === 'tool' || was === 'speaking') {
      set({ phase: 'idle', step: '' })
      setCharacter('idle')
      if (note && was !== 'speaking') push({ role: 'assistant', text: L('멈췄어요. 이 질문은 처리하지 않았어요.', 'Stopped. I did not finish this request.') })
    }
  },

  setDraft(text: string) {
    set({ draft: text })
  },

  startListening() {
    if (!stt.supported || listening) return
    agent.cancel()
    set({ phase: 'listening', draft: '', error: '' })
    setCharacter('listening')
    listening = stt.start(LANG, {
      onText: (text) => set({ draft: text }),
      onEnd: (reason, error) => {
        listening = null
        if (get().phase === 'listening') set({ phase: 'idle' })
        setCharacter('idle')
        if (reason === 'error' && error !== 'no-speech' && error !== 'aborted') {
          set({ error: error === 'not-allowed' ? L('마이크 권한이 없어요. 브라우저 설정에서 허용하거나 글로 입력해 주세요', 'No microphone permission. Allow it in the browser or type instead') : L('음성을 인식하지 못했어요. 다시 말하거나 글로 입력해 주세요', 'Could not recognise speech. Try again or type instead') })
        }
      },
    })
  },

  stopListening() {
    listening?.stop()
    listening = null
  },

  async send(textIn?: string) {
    const text = (textIn ?? get().draft).trim()
    if (!text) return
    agent.stopListening()
    agent.cancel()
    const myGen = gen
    const t0 = performance.now()
    set({ draft: '', error: '' })
    push({ role: 'user', text })
    if (!ai.on) {
      push({ role: 'assistant', text: L('AI가 꺼져 있어요. 상단의 AI 스위치를 켜면 대화할 수 있어요.', 'AI is off. Turn on the AI switch at the top to chat.'), tone: 'error' })
      setCharacter('error')
      return
    }
    set({ phase: 'thinking', step: L('질문을 이해하고 있어요', 'Understanding your question') })
    setCharacter('thinking')
    const metric: Metric = { kind: 'simple', ack: Math.round(performance.now() - t0), answer: t0, claude: 0, steps: 0, speed: '' }
    abort = new AbortController()
    const results: ToolResult[] = []
    let requestId: string | undefined
    const tools: Msg['tools'] = []
    try {
      for (let round = 0; round < 4; round++) {
        const st = useStore.getState()
        const res = await post({ request_id: requestId, message: text, lang: LANG, history: history().slice(0, -1), context: agentContext(st.selected, st.site), tool_results: results }, abort.signal)
        if (myGen !== gen) return
        requestId = res.request_id
        metric.claude += res.meta.ms.claude
        metric.steps++
        metric.speed = res.meta.speed ?? 'standard'
        if (res.next === 'tool' && res.tool_call) {
          // 읽기 도구: 시뮬레이션에서 조회하고 결과를 다시 보낸다
          metric.kind = 'tool'
          set({ phase: 'tool', step: TOOL_STEP[res.tool_call.tool]?.() ?? L('조회하고 있어요', 'Looking it up') })
          const r = runTool(res.tool_call)
          results.push(r)
          tools.push({ tool: r.tool, status: r.status, read_at: r.read_at })
          continue
        }
        if (res.next === 'confirm' && res.tool_call) {
          metric.kind = 'write'
          const plan = res.tool_call.tool === 'commit_dispatch_change' ? results.find((r) => r.tool === 'prepare_dispatch_change')?.data ?? null : res.tool_call.args
          push({
            role: 'assistant', text: res.decision.answer, decision: res.decision, meta: res.meta, tools: [...tools],
            confirm: { call: res.tool_call, requestId: res.request_id, plan, state: 'pending', expires: Date.now() + 120_000 },
          })
          finish(res.decision.speech_text, 'plain', metric)
          return
        }
        // 되묻기는 오류가 아니다: 한계 안내 · 도구 실패만 오류 톤
        const tone = res.decision.decision === 'limitation' || tools.some((t) => t.status !== 'completed') ? 'error' : tools.length ? 'ok' : 'plain'
        push({ role: 'assistant', text: res.decision.answer, decision: res.decision, meta: res.meta, tools: [...tools], tone: tone === 'error' ? 'error' : undefined })
        finish(res.decision.speech_text, tone, metric)
        return
      }
    } catch (e) {
      if (myGen !== gen || (e instanceof DOMException && e.name === 'AbortError')) return
      const msg = e instanceof Error ? e.message : String(e)
      push({ role: 'assistant', text: L(`처리하지 못했어요: ${msg}`, `Something went wrong: ${msg}`), tone: 'error' })
      set({ phase: 'idle', step: '' })
      setCharacter('error')
    } finally {
      if (myGen === gen) abort = null
    }
  },

  /** 승인 카드: 승인하면 같은 call · 같은 인자로만 실행한다 */
  approve(msgId: number) {
    const m = get().messages.find((x) => x.id === msgId)
    const c = m?.confirm
    if (!m || !c || c.state !== 'pending') return
    if (Date.now() > c.expires) {
      patch(msgId, { confirm: { ...c, state: 'expired' } })
      return
    }
    agent.cancel()
    patch(msgId, { confirm: { ...c, state: 'approved' } })
    const t0 = performance.now()
    const r = runTool(c.call, { callId: c.call.call_id, argsKey: argsKey(c.call), expires: c.expires })
    const data = (r.data ?? {}) as Record<string, unknown>
    const ok = r.status === 'completed'
    let text: string
    if (c.call.tool === 'create_work_task') {
      text = ok
        ? L(`작업 지시를 만들었어요: ${data.task_id} · ${data.site} · ${data.title}${data.priority === 'high' ? ' (우선순위 높음)' : ''}. 기준 ${r.read_at}.`, `Created work task ${data.task_id}: ${data.site} · ${data.title}${data.priority === 'high' ? ' (high priority)' : ''}. As of ${r.read_at}.`)
        : L(`작업 지시를 만들지 못했어요: ${r.error}`, `Could not create the work task: ${r.error}`)
    } else {
      const moved = Array.isArray(data.moved) ? (data.moved as string[]).join(', ') : ''
      text = ok
        ? L(`${data.from}의 정차지 ${moved}를 ${data.to}로 이관했어요(승인 기록 #${data.proposal_id}). 기준 ${r.read_at}.`, `Moved ${moved} from ${data.from} to ${data.to} (approval record #${data.proposal_id}). As of ${r.read_at}.`)
        : r.status === 'unknown'
          ? L(`이관 결과를 확인하지 못했어요: ${r.error}. 배송차 상태를 다시 조회해 확인할게요.`, `The transfer result is unknown: ${r.error}. Look up the van again to confirm.`)
          : L(`이관하지 못했어요: ${r.error}`, `The transfer was not applied: ${r.error}`)
    }
    push({ role: 'assistant', text, tools: [{ tool: r.tool, status: r.status, read_at: r.read_at }], tone: ok ? 'ok' : 'error' })
    set((s) => ({ metrics: [...s.metrics, { kind: 'write', ack: 0, answer: Math.round(performance.now() - t0), claude: 0, steps: 0, speed: '-' } as Metric].slice(-100) }))
    answerShownAt = performance.now()
    finish(text, ok ? 'ok' : 'error', null)
  },

  reject(msgId: number) {
    const m = get().messages.find((x) => x.id === msgId)
    if (!m?.confirm || m.confirm.state !== 'pending') return
    patch(msgId, { confirm: { ...m.confirm, state: 'rejected' } })
    const text = L('취소했어요. 아무것도 바꾸지 않았어요.', 'Cancelled. Nothing was changed.')
    push({ role: 'assistant', text })
    finish(text, 'plain', null)
  },

  /** 일회성 동작이 끝나 캐릭터가 idle로 돌아왔음을 알린다 */
  characterSettled(state: AssistantState) {
    if (state === 'idle' && get().character !== 'idle' && get().character !== 'speaking' && get().character !== 'listening' && get().character !== 'thinking') set({ character: 'idle' })
  },
}

/** 세션 지연 통계(P50/P95, ms) */
export function percentiles(list: number[]) {
  if (!list.length) return null
  const s = [...list].sort((a, b) => a - b)
  const at = (p: number) => s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]
  return { p50: at(50), p95: at(95), n: s.length }
}
