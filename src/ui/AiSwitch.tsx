// 상단 AI 스위치. 서버에 Claude API 키(.env의 ANTHROPIC_API_KEY)가 있으면 기본으로 켜져 있고, 여기서 끄고 켤 수 있다.
// 끄면 모든 판단을 기본 규칙으로 처리한다. 키는 서버에만 있고 화면에서는 다루지 않는다.
import { useEffect, useRef, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { ai } from '../sim/ai'
import { disableAi, enableAi, aiConfig, aiStats } from '../ai/judge'
import { useStore } from '../store'
import { L } from '../i18n'

function Toggle({ on, busy, onClick }: { on: boolean; busy?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={L('AI 사용', 'Use AI')}
      onClick={onClick}
      disabled={busy}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-brand' : 'bg-line'} ${busy ? 'opacity-60' : ''}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  )
}

export function AiSwitch() {
  useStore((s) => s.tick)
  const open = useStore((s) => s.aiOpen)
  const setOpen = useStore((s) => s.setAiOpen)
  const ref = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open, setOpen])

  useEffect(() => {
    if (!open) setError('')
  }, [open])

  const on = ai.on
  const noServer = aiConfig.server === false
  const noKey = aiConfig.server === true && !aiConfig.configured
  const unavailable = noServer || noKey

  const toggle = async () => {
    setError('')
    if (on) {
      disableAi()
      return
    }
    setBusy(true)
    const r = await enableAi()
    setBusy(false)
    if (!r.ok) setError(r.error)
  }

  const err = on && aiStats.lastError
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={L('AI 설정', 'AI settings')}
        aria-expanded={open}
        className={`num flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[11.5px] font-semibold ${!on ? 'bg-line-2 text-muted' : err ? 'bg-warn-soft text-warn' : 'bg-brand-soft text-brand'}`}
        title={!on ? L('AI 꺼짐 · 모든 판단을 기본 규칙으로 처리합니다', 'AI off · all decisions use the default rules') : err ? L(`AI 오류: ${aiStats.lastError}`, `AI error: ${aiStats.lastError}`) : L(`AI 호출 ${aiStats.calls}회 · 평균 ${Math.round(aiStats.avgMs)}ms`, `AI calls ${aiStats.calls} · avg ${Math.round(aiStats.avgMs)}ms`)}
      >
        <Sparkles size={12} />
        AI
        <span className={`relative h-3.5 w-6 rounded-full ${on ? (err ? 'bg-warn' : 'bg-brand') : 'bg-faint/50'}`}>
          <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white ${on ? 'left-3' : 'left-0.5'}`} />
        </span>
        <span className="hidden min-[1440px]:inline">{!on ? L('꺼짐', 'Off') : aiStats.calls ? `${Math.round(aiStats.avgMs)}ms` : L('켜짐', 'On')}</span>
      </button>
      {open && (
        <div className="panel rise absolute right-0 top-11 z-50 w-[340px] space-y-3 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-[13px] font-semibold text-ink"><Sparkles size={13} className="text-brand" />{L('AI 판독 · Claude', 'AI reading · Claude')}</div>
              <div className="mt-0.5 text-[11px] text-muted">{on ? L('켜짐 · AI가 판독합니다', 'On · AI reads the text') : L('꺼짐 · 기본 규칙으로 처리합니다', 'Off · default rules handle everything')}</div>
            </div>
            {busy ? <Loader2 size={16} className="animate-spin text-brand" /> : <Toggle on={on} busy={unavailable} onClick={() => void toggle()} />}
          </div>
          <p className="text-[11px] leading-snug text-muted">
            {L('켜면 배송 메모, 현장 보고, 리젝트 송장, 적하목록, 항공 위험물, 돌발 상황과 말로 하는 관제 명령을 AI가 판독합니다. 끄면 문 앞 배송·수동 확인·일반 블록 같은 기본 규칙으로 바로 처리합니다.', 'When on, AI reads delivery notes, field reports, rejected labels, manifests, air dangerous goods, incidents and spoken control commands. When off, default rules such as doorstep delivery, manual check and general block apply right away.')}
          </p>
          <div className="rounded-lg bg-line-2 px-2.5 py-2 text-[11.5px]">
            <div className="flex items-center justify-between">
              <span className="text-muted">{L('모델', 'Model')}</span>
              <span className="num font-semibold text-ink-2">{aiConfig.model || '—'}</span>
            </div>
            {on && (
              <div className="num mt-1 flex items-center justify-between text-muted">
                <span>{L(`호출 ${aiStats.calls}회 · 평균 ${Math.round(aiStats.avgMs)}ms`, `${aiStats.calls} calls · avg ${Math.round(aiStats.avgMs)}ms`)}</span>
                {aiStats.failures > 0 && <span className="text-warn">{L(`실패 ${aiStats.failures}`, `${aiStats.failures} failed`)}</span>}
              </div>
            )}
            {noServer && <div className="mt-1 leading-snug text-muted">{L('이 배포에는 /api/ai 서버가 없어 AI를 켤 수 없습니다. 개발 서버(npm run dev)나 미리보기(npm run preview)에서 사용할 수 있습니다.', 'This deployment has no /api/ai server, so AI cannot be turned on. Use the dev server (npm run dev) or preview (npm run preview).')}</div>}
            {noKey && <div className="mt-1 leading-snug text-muted">{L('프로젝트 루트의 .env에 ANTHROPIC_API_KEY를 넣고 서버를 다시 시작하면 켜집니다.', 'Set ANTHROPIC_API_KEY in the .env file at the project root and restart the server to turn AI on.')}</div>}
          </div>
          <p className="text-[10.5px] leading-snug text-muted">
            {L('AI를 켜 두면 문장이 들어올 때마다 Claude API를 호출해 서버 키의 사용량(비용)이 쌓입니다.', 'While AI is on, every incoming text calls the Claude API and adds usage (cost) to the server key.')}
          </p>
          {(error || err) && <div className="rounded-lg bg-warn-soft px-2.5 py-1.5 text-[11.5px] leading-snug text-warn">{error || L(`최근 오류: ${aiStats.lastError}`, `Last error: ${aiStats.lastError}`)}</div>}
        </div>
      )}
    </div>
  )
}
