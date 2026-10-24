// 주소 정정 탭: 인천 서브 주소 정정 데스크. 코드가 후보를 좁히고 AI가 고른다. 애매하면 고객에게 확인한다
import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { sim } from '../../sim/sim'
import { type AddrCase } from '../../sim/addrfix'
import { STOPS } from '../../sim/sites'
import { useStore } from '../../store'
import { hhmm, num } from '../format'
import { By, Stat } from './OpsCenter'
import { L } from '../../i18n'

const OUT: Record<AddrCase['outcome'], { label: string; cls: string }> = {
  fixed: { label: L('자동 정정', 'Auto-fixed'), cls: 'bg-ok-soft text-ok' },
  contact: { label: L('고객 확인', 'Ask customer'), cls: 'bg-brand-soft text-brand' },
  manual: { label: L('사람 확인', 'Manual check'), cls: 'bg-warn-soft text-warn' },
}

/** 정차지 이름에서 단지 이름을 뗀다(sites.ts의 한국어·영어 이름 모두) */
const APT_PREFIX = /^(다온마을 아파트|Daon Village Apt\.?|Daon Village Apartments?)\s+/

function Row({ c }: { c: AddrCase }) {
  const short = (id: string) => STOPS[id]?.label.replace(APT_PREFIX, '') ?? id
  return (
    <div className="rounded-lg border border-line bg-white px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-[11px]">
        <span className="num text-faint">{hhmm(c.time)}</span>
        <span className="rounded bg-line-2 px-1 text-[10px] font-semibold text-muted">{c.kind}</span>
        <span className="ml-auto flex items-center gap-1">
          {c.status === 'pending' ? (
            <span className="flex items-center gap-1 text-muted"><Loader2 size={10} className="animate-spin" />{L('판독 중', 'Reading')}</span>
          ) : (
            <>
              <span className={`rounded px-1.5 py-[2px] text-[10px] font-semibold ${OUT[c.outcome].cls}`}>{OUT[c.outcome].label}</span>
              <By by={c.by} conf={c.ai?.confidence} />
            </>
          )}
        </span>
      </div>
      <div className="mt-0.5 text-[13px] font-semibold text-ink">“{c.label}”</div>
      <div className="mt-1 flex flex-wrap items-center gap-1 text-[10.5px]">
        <span className="text-muted">{L('후보', 'Candidates')}</span>
        {c.candidates.map((x) => (
          <span key={x.id} className={`num rounded px-1.5 py-[2px] ${c.ai?.stop === x.id || (!c.ai && c.stop === x.id) ? 'bg-brand text-white' : 'bg-line-2 text-ink-2'}`}>
            {short(x.id)} <span className="opacity-70">{x.score.toFixed(2)}</span>
          </span>
        ))}
        <span className={`rounded px-1.5 py-[2px] ${c.ai?.stop === 'none' ? 'bg-brand text-white' : 'bg-line-2 text-muted'}`}>{L('해당 없음', 'None of these')}</span>
        {c.ai && <span className="num text-faint">{L(`호수 누락 ${c.ai.unitMissing.toFixed(2)}`, `Unit missing ${c.ai.unitMissing.toFixed(2)}`)}</span>}
      </div>
      {c.status === 'ready' && (
        <div className="mt-1 text-[11px]">
          <span className={c.outcome === 'fixed' ? 'text-ok' : 'text-ink-2'}>→ {c.note}</span>
          {c.resolved && c.truth && (
            <span className={`ml-1.5 font-semibold ${c.stop === c.truth ? 'text-ok' : 'text-bad'}`}>
              {c.stop === c.truth ? L('· 배송 후 맞음 확인', '· Confirmed after delivery') : L(`· 실제 ${short(c.truth)}`, `· Actually ${short(c.truth)}`)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export function AddressTab() {
  useStore((s) => s.tick)
  const [text, setText] = useState('')
  const st = sim.addr.stats
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        <Stat label={L('주소 오류 상자', 'Bad-address boxes')} value={num(st.cases)} sub={L('인천 서브 정정 데스크', 'Incheon Sub-terminal fix desk')} />
        <Stat label={L('자동 정정', 'Auto-fixed')} value={num(st.fixed)} sub={L('그 동 배송차에 바로 상차', 'Loaded straight onto that building’s van')} tone="ok" />
        <Stat label={L('고객 확인 · 사람 확인', 'Ask customer · Manual')} value={`${st.contact} · ${st.manual}`} sub={L('알림톡 · 정정 데스크', 'Text alert · Fix desk')} tone="brand" />
        <Stat label={L('정정이 틀린 상자', 'Wrongly fixed')} value={num(st.wrong)} sub={L(`맞음 ${st.correct} · 배송 후 확인`, `Correct ${st.correct} · Checked after delivery`)} tone={st.wrong ? 'bad' : 'ok'} />
      </div>
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          if (!text.trim()) return
          sim.addr.add(text.trim())
          setText('')
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={L('흐트러진 주소를 넣어 보세요 (예: 다온APT 105-702, 초록빌리 3층)', 'Try a messy address (e.g. Daon APT 105-702, Chorok Vila 3F)')} aria-label={L('주소 입력', 'Address')} className="h-8 min-w-0 flex-1 rounded-lg border border-line px-2.5 text-[12px] outline-none focus:border-brand" />
        <button type="submit" className="h-8 rounded-lg bg-brand px-3 text-[12px] font-semibold text-white">{L('판독', 'Read')}</button>
      </form>
      <div className="grid grid-cols-2 gap-1.5">
        {sim.addr.list.slice(0, 14).map((c) => <Row key={c.id} c={c} />)}
      </div>
      <p className="text-[10.5px] leading-snug text-faint">
        {L('후보는 코드가 글자 짝 유사도로 좁힙니다(정식 이름·옛 이름 비교). AI는 후보 중에서만 고르므로 엉뚱한 주소를 만들어 내지 않습니다. 확신이 0.7보다 낮거나 "해당 없음"이면 코드가 고객에게 확인합니다.', 'Code narrows candidates by character-pair similarity (comparing official and old names). AI only picks among the candidates, so it never invents an address. If confidence is below 0.7 or the answer is "None of these", code asks the customer.')}
      </p>
    </div>
  )
}
