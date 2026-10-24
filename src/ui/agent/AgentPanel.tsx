// hubtrace 물류관리원 패널: 3D 캐릭터 · 대화 · 입력(글 · 음성) · 판단 보기 · 승인 카드 · 음성 켜기/정지.
// 3D(WebGL)나 캐릭터 불러오기가 실패해도 대화는 그대로 쓴다(오류 경계 → 아바타 그림).
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { ChevronDown, ChevronRight, Mic, MicOff, Send, Square, Volume2, VolumeX, X } from 'lucide-react'
import { HubtraceAssistant } from '../../ai/agent/mascot/HubtraceAssistant'
import { agent, percentiles, useAgent, type Msg } from '../../ai/agent/store'
import { stt, tts } from '../../ai/agent/speech'
import { useTasks } from '../../ai/agent/tools'
import { L } from '../../i18n'
import { useStore } from '../../store'
import { useAgentDock } from './layout'

const MODEL_URL = '/assets/hubtrace/character/hubtrace-logistics-assistant.glb'
const LOD1_URL = '/assets/hubtrace/character/lod1/hubtrace-logistics-assistant.glb'
export const AVATAR_URL = '/assets/hubtrace/character/avatar.webp'

/** 성능이 낮은 기기는 가벼운 모델 */
const lowEnd = () => {
  const n = navigator as Navigator & { deviceMemory?: number }
  return (n.hardwareConcurrency ?? 8) <= 4 || (n.deviceMemory ?? 8) <= 4 || matchMedia('(max-width: 640px)').matches
}

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

const PHASE_LABEL = () => ({
  idle: L('대기', 'Ready'),
  listening: L('듣는 중', 'Listening'),
  thinking: L('생각 중', 'Thinking'),
  tool: L('조회 중', 'Looking up'),
  speaking: L('말하는 중', 'Speaking'),
})

function Character() {
  const character = useAgent((s) => s.character)
  const actionKey = useAgent((s) => s.actionKey)
  const [look, setLook] = useState<[number, number]>([0, 0])
  const url = useMemo(() => (lowEnd() ? LOD1_URL : MODEL_URL), [])
  const fallback = <div className="flex h-full items-center justify-center"><img src={AVATAR_URL} alt="" className="h-28 w-28 object-contain" /></div>
  return (
    <div
      className="relative h-[clamp(110px,18vh,190px)] shrink-0 overflow-hidden rounded-xl bg-gradient-to-b from-[#EEF3FF] to-[#F8FAFF]"
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        setLook([((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)])
      }}
      onPointerLeave={() => setLook([0, 0])}
    >
      <Boundary fallback={fallback}>
        <Canvas camera={{ position: [0, 0.16, 3.25], fov: 30 }} dpr={[1, 2]} gl={{ antialias: true }}>
          <ambientLight intensity={1.1} />
          <hemisphereLight args={['#eaffff', '#476075', 2.1]} />
          <directionalLight position={[2.5, 4, 3]} intensity={3.4} />
          <Suspense fallback={null}>
            <HubtraceAssistant modelUrl={url} position={[0, -0.78, 0]} state={character} actionKey={actionKey} look={look} onStateChange={(s) => agent.characterSettled(s)} />
          </Suspense>
        </Canvas>
      </Boundary>
    </div>
  )
}

function Judgment({ m }: { m: Msg }) {
  const [open, setOpen] = useState(false)
  const d = m.decision
  if (!d) return null
  const meta = m.meta
  return (
    <div className="mt-1.5">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 text-[11px] font-semibold text-muted hover:text-ink-2" aria-expanded={open}>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {L('판단 보기', 'View judgment')}
      </button>
      {open && (
        <div className="mt-1.5 overflow-hidden rounded-lg border border-line text-[11px]">
          <table className="w-full">
            <thead className="bg-line-2 text-left text-muted">
              <tr>
                <th className="px-2 py-1 font-semibold">Choice</th>
                <th className="whitespace-nowrap px-1 py-1 font-semibold">{L('조건', 'Condition')}</th>
                <th className="whitespace-nowrap px-1 py-1 font-semibold">{L('적합도', 'Fit')}</th>
                <th className="px-2 py-1 font-semibold">{L('근거 요약', 'Reason')}</th>
              </tr>
            </thead>
            <tbody>
              {d.choices.map((c) => (
                <tr key={c.choice} className={`border-t border-line-2 align-top ${c.choice === d.selected_choice ? 'bg-brand-soft/60' : ''}`}>
                  <td className="px-2 py-1 font-mono text-[10.5px]">{c.choice}{c.choice === d.selected_choice ? ' ✓' : ''}</td>
                  <td className="whitespace-nowrap px-1 py-1">{c.true_or_false ? <span className="text-ok">{L('충족', 'Met')}</span> : <span className="text-bad">{L('미충족', 'Not met')}</span>}</td>
                  <td className="px-1 py-1 num" title={`${c.score_breakdown.intent_fit} + ${c.score_breakdown.evidence_sufficiency} + ${c.score_breakdown.context_fit}`}>{c.score}</td>
                  <td className="px-2 py-1 text-ink-2">{c.reason_summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-line-2 bg-[#FAFBFE] px-2 py-1.5 leading-relaxed text-muted">
            {L('적합도는 판단 보조 점수이며 정확도·확률이 아닙니다.', 'Fit is a heuristic score, not an accuracy or probability.')}
            {meta && (
              <div className="mt-0.5 font-mono text-[10px]">
                {meta.model} · {meta.speed ?? 'standard'} · {meta.route} · {meta.ms.total}ms · {L('검증', 'validation')} {meta.validation.ok ? 'ok' : meta.validation.issues.join('; ')} · {meta.prompt_version}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ConfirmCard({ m }: { m: Msg }) {
  const c = m.confirm!
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (c.state !== 'pending') return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [c.state])
  const left = Math.max(0, Math.round((c.expires - now) / 1000))
  const expired = c.state === 'pending' && left === 0
  const plan = (c.plan ?? {}) as Record<string, unknown>
  const isDispatch = c.call.tool === 'commit_dispatch_change'
  return (
    <div className="mt-2 rounded-lg border border-warn/40 bg-warn-soft/50 p-2.5 text-[12px]" role="group" aria-label={L('승인 요청', 'Approval request')}>
      <div className="font-semibold text-ink">{isDispatch ? L('정차지 이관 실행', 'Apply stop transfer') : L('작업 지시 만들기', 'Create work task')}</div>
      {isDispatch ? (
        <div className="mt-1 space-y-0.5 text-ink-2">
          <div>{String(plan.from ?? c.call.args.vehicle_id)} → {String(plan.to ?? '?')}</div>
          {Array.isArray(plan.stops_moved) && <div>{L('넘길 정차지', 'Stops to move')}: {(plan.stops_moved as string[]).join(', ')}</div>}
          {Array.isArray(plan.effect) && <ul className="list-disc pl-4 text-muted">{(plan.effect as string[]).map((e) => <li key={e}>{e}</li>)}</ul>}
          <div className="font-mono text-[10px] text-faint">plan {c.call.args.plan_version}</div>
        </div>
      ) : (
        <div className="mt-1 space-y-0.5 text-ink-2">
          <div>{L('거점', 'Site')}: {c.call.args.site} · {L('우선순위', 'Priority')}: {c.call.args.priority === 'high' ? L('높음', 'High') : L('보통', 'Normal')}</div>
          <div>{c.call.args.title}</div>
          {c.call.args.detail && <div className="text-muted">{c.call.args.detail}</div>}
        </div>
      )}
      {c.state === 'pending' && !expired ? (
        <div className="mt-2 flex items-center gap-1.5">
          <button type="button" onClick={() => agent.approve(m.id)} className="rounded-md bg-brand px-3 py-1 text-[12px] font-semibold text-white">{L('승인', 'Approve')}</button>
          <button type="button" onClick={() => agent.reject(m.id)} className="rounded-md bg-line-2 px-3 py-1 text-[12px] font-semibold text-ink-2">{L('취소', 'Cancel')}</button>
          <span className="ml-auto text-[10.5px] text-muted num">{L(`${left}초 안에`, `${left}s left`)}</span>
        </div>
      ) : (
        <div className="mt-1.5 text-[11px] font-semibold text-muted">
          {c.state === 'approved' ? L('승인함', 'Approved') : c.state === 'rejected' ? L('취소함', 'Cancelled') : L('만료됨 · 다시 요청해 주세요', 'Expired · please ask again')}
        </div>
      )}
    </div>
  )
}

function Bubble({ m }: { m: Msg }) {
  if (m.role === 'user') {
    return <div className="ml-8 self-end rounded-2xl rounded-br-md bg-brand px-3 py-2 text-[13px] text-white">{m.text}</div>
  }
  return (
    <div className="mr-4 flex gap-2 self-start">
      <img src={AVATAR_URL} alt="" className="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-brand-soft object-contain p-0.5" />
      <div className="min-w-0">
        <div className={`rounded-2xl rounded-tl-md px-3 py-2 text-[13px] leading-relaxed ${m.tone === 'error' ? 'bg-warn-soft text-ink' : m.tone === 'ok' ? 'bg-ok-soft text-ink' : 'bg-line-2 text-ink'}`}>{m.text}</div>
        {m.tools && m.tools.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {m.tools.map((t, i) => (
              <span key={i} className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${t.status === 'completed' ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad'}`}>
                {t.tool} · {t.status === 'completed' ? L('완료', 'done') : t.status === 'unknown' ? L('결과 미확인', 'unknown') : L('실패', 'failed')} · {L(`${t.read_at} 기준`, `as of ${t.read_at}`)}
              </span>
            ))}
          </div>
        )}
        {m.confirm && <ConfirmCard m={m} />}
        <Judgment m={m} />
      </div>
    </div>
  )
}

function Metrics() {
  const metrics = useAgent((s) => s.metrics)
  const [open, setOpen] = useState(false)
  if (!metrics.length) return null
  const simple = percentiles(metrics.filter((m) => m.kind === 'simple').map((m) => m.answer))
  const tool = percentiles(metrics.filter((m) => m.kind === 'tool').map((m) => m.answer))
  const ttsP = percentiles(metrics.filter((m) => m.tts !== undefined).map((m) => m.tts!))
  const fmt = (p: ReturnType<typeof percentiles>) => (p ? `P50 ${(p.p50 / 1000).toFixed(1)}s · P95 ${(p.p95 / 1000).toFixed(1)}s (n=${p.n})` : '-')
  return (
    <div className="border-t border-line-2 px-3 py-1 text-[10.5px] text-muted">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 font-semibold">{open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}{L('이 세션 응답 시간', 'Response times this session')}</button>
      {open && (
        <div className="mt-0.5 space-y-0.5 font-mono">
          <div>{L('단순 답변', 'Simple answer')}: {fmt(simple)}</div>
          <div>{L('조회 포함', 'With lookup')}: {fmt(tool)}</div>
          <div>{L('음성 시작', 'TTS start')}: {fmt(ttsP)}</div>
        </div>
      )}
    </div>
  )
}

export function AgentPanel() {
  const open = useAgent((s) => s.open)
  const messages = useAgent((s) => s.messages)
  const phase = useAgent((s) => s.phase)
  const step = useAgent((s) => s.step)
  const draft = useAgent((s) => s.draft)
  const voice = useAgent((s) => s.voice)
  const error = useAgent((s) => s.error)
  const tasks = useTasks((s) => s.tasks)
  const panels = useStore((s) => s.panels)
  const { docked } = useAgentDock()
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, phase])
  if (!open) return null
  const busy = phase === 'thinking' || phase === 'tool'
  const pending = messages.some((m) => m.confirm?.state === 'pending')
  return (
    <section
      className={`panel rise pointer-events-auto fixed inset-x-2 bottom-2 top-16 z-40 flex flex-col overflow-hidden sm:inset-x-auto sm:right-4 sm:top-[72px] sm:w-[412px] ${docked && panels ? 'sm:bottom-[calc(262px+var(--tl,0px))]' : 'sm:bottom-4'}`}
      aria-label={L('hubtrace 물류관리원', 'hubtrace logistics assistant')}
    >
      <header className="flex shrink-0 items-center gap-2 px-3 pt-2.5">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold text-ink">{L('hubtrace 물류관리원', 'hubtrace assistant')}</div>
          <div className="text-[11px] text-muted" aria-live="polite">{phase === 'idle' && pending ? L('승인 대기', 'Waiting for approval') : PHASE_LABEL()[phase]}{step ? ` · ${step}` : ''}</div>
        </div>
        {tts.supported && (
          <button type="button" onClick={() => agent.toggleVoice()} className="rounded-md p-1.5 text-ink-2 hover:bg-line-2" aria-label={voice ? L('음성 끄기', 'Turn voice off') : L('음성 켜기', 'Turn voice on')} title={voice ? L('음성 끄기', 'Turn voice off') : L('음성 켜기', 'Turn voice on')}>
            {voice ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
        )}
        {(phase === 'speaking' || busy) && (
          <button type="button" onClick={() => agent.cancel(true)} className="rounded-md p-1.5 text-ink-2 hover:bg-line-2" aria-label={L('멈추기', 'Stop')} title={L('멈추기', 'Stop')}><Square size={15} /></button>
        )}
        <button type="button" onClick={() => agent.closePanel()} className="rounded-md p-1.5 text-ink-2 hover:bg-line-2" aria-label={L('닫기', 'Close')}><X size={16} /></button>
      </header>
      <div className="shrink-0 px-3 pt-2"><Character /></div>
      {tasks.length > 0 && (
        <div className="mx-3 mt-2 shrink-0 truncate rounded-lg bg-line-2 px-2.5 py-1.5 text-[11px] text-ink-2">
          <span className="font-semibold">{L('작업 지시', 'Work tasks')}</span> · {tasks.slice(0, 3).map((t) => `${t.id} ${t.title}`).join(' · ')}
        </div>
      )}
      <div ref={list} className="scroll-thin flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-3">
        {messages.map((m) => <Bubble key={m.id} m={m} />)}
        {busy && (
          <div className="mr-4 flex items-center gap-2 self-start text-[12px] text-muted">
            <span className="inline-flex gap-1"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand [animation-delay:120ms]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand [animation-delay:240ms]" /></span>
            {step}
          </div>
        )}
      </div>
      {error && <div className="mx-3 mb-1 rounded-md bg-bad-soft px-2 py-1 text-[11.5px] text-bad" role="alert">{error}</div>}
      <form
        className="flex shrink-0 items-end gap-1.5 border-t border-line px-3 py-2.5"
        onSubmit={(e) => {
          e.preventDefault()
          void agent.send()
        }}
      >
        {stt.supported && (
          <button
            type="button"
            onClick={() => (phase === 'listening' ? agent.stopListening() : agent.startListening())}
            className={`shrink-0 rounded-full p-2 ${phase === 'listening' ? 'animate-pulse bg-bad text-white' : 'bg-line-2 text-ink-2 hover:bg-brand-soft'}`}
            aria-label={phase === 'listening' ? L('듣기 멈추기', 'Stop listening') : L('말로 묻기', 'Ask by voice')}
            aria-pressed={phase === 'listening'}
          >
            {phase === 'listening' ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
        )}
        <textarea
          value={draft}
          rows={1}
          onChange={(e) => agent.setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void agent.send()
            }
          }}
          placeholder={phase === 'listening' ? L('말씀하세요… 인식한 문장은 고친 뒤 보낼 수 있어요', 'Speak… you can edit the text before sending') : L('예: DV-4485 지금 어디야? · 생수 재고 알려줘', 'e.g. Where is DV-4485? · Water stock?')}
          className="max-h-24 min-h-[38px] flex-1 resize-none rounded-lg border border-line bg-white px-2.5 py-2 text-[13px] outline-none focus:border-brand"
          aria-label={L('질문 입력', 'Your question')}
        />
        <button type="submit" disabled={!draft.trim()} className="shrink-0 rounded-full bg-brand p-2 text-white disabled:opacity-40" aria-label={L('보내기', 'Send')}><Send size={16} /></button>
      </form>
      <Metrics />
      <div className="px-3 pb-2 text-[10px] text-faint">{L('Claude Opus 5.5 판단 · 서버 검증 · 데이터는 시뮬레이션 기준', 'Judged by Claude Opus 5.5 · server-validated · simulation data')}</div>
    </section>
  )
}

/** 상단바 버튼 */
export function AgentLauncher() {
  const open = useAgent((s) => s.open)
  return (
    <button
      type="button"
      onClick={() => (open ? agent.closePanel() : agent.openPanel())}
      className={`pointer-events-auto flex shrink-0 items-center gap-1.5 rounded-full border p-1 min-[1780px]:pr-2.5 text-[12px] font-semibold transition-colors ${open ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink-2 hover:border-brand'}`}
      aria-pressed={open}
      aria-label={L('hubtrace 물류관리원 열기', 'Open hubtrace assistant')}
    >
      <img src={AVATAR_URL} alt="" className="h-6 w-6 rounded-full bg-brand-soft object-contain" />
      <span className="hidden whitespace-nowrap min-[1780px]:inline">{L('물류관리원', 'Assistant')}</span>
    </button>
  )
}
