// 통관 HS 탭: 부산신항 수입 컨테이너 신고서. 상세 설명과 신고 품명의 HS 류를 비교하고, 예시 세율·목록통관 여부를 보여 준다
import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { sim } from '../../sim/sim'
import { HS, USD_KRW, type Declaration } from '../../sim/customs'
import { useStore } from '../../store'
import { hhmm, num } from '../format'
import { L } from '../../i18n'
import { By, Stat } from './OpsCenter'

const won = (n: number) =>
  n >= 1e8
    ? L(`${(n / 1e8).toFixed(1)}억 원`, `₩${num(n / 1e6)}M`)
    : n >= 1e4
      ? L(`${Math.round(n / 1e4).toLocaleString('ko-KR')}만 원`, n >= 1e6 ? `₩${(n / 1e6).toFixed(1)}M` : `₩${Math.round(n / 1e3)}K`)
      : L(`${num(n)}원`, `₩${num(n)}`)

function Detail({ d }: { d: Declaration }) {
  const hs = HS[d.chapter]
  return (
    <div className="rounded-xl border border-line bg-[#FAFBFE] p-3 text-[11.5px]">
      <div className="num text-[13px] font-bold text-ink">{L('신고', 'Declaration')} {d.no}</div>
      <div className="text-[11px] text-muted">{d.shipper} · {L(`원산지 ${d.origin} · 접수 ${hhmm(d.time)}`, `Origin ${d.origin} · filed ${hhmm(d.time)}`)}</div>
      <div className="mt-2 space-y-1.5">
        <div className="rounded-lg bg-white px-2.5 py-1.5">
          <div className="text-[10.5px] text-muted">{L('신고 품명(수입자)', 'Declared goods (importer)')}</div>
          <div className="font-semibold text-ink">{d.declared}</div>
          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-2">→ {HS[d.declaredChapter].label} {d.status === 'ready' && <By by={d.by} conf={d.ai?.declaredConfidence} />}</div>
        </div>
        <div className="rounded-lg bg-white px-2.5 py-1.5">
          <div className="text-[10.5px] text-muted">{L('상세 설명(적하목록)', 'Description (manifest)')}</div>
          <div className="font-semibold text-ink">{d.description}</div>
          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-2">→ {hs.label} {d.status === 'ready' && <By by={d.by} conf={d.ai?.chapterConfidence} />}</div>
        </div>
      </div>
      {d.status === 'ready' && (
        <>
          <div className={`mt-2 rounded-lg px-2.5 py-1.5 font-semibold ${d.mismatch ? 'bg-bad-soft text-bad' : d.clearance === 'list' ? 'bg-ok-soft text-ok' : 'bg-brand-soft text-brand'}`}>{d.action}</div>
          <table className="mt-2 w-full">
            <tbody className="divide-y divide-line-2">
              <tr><td className="py-1 text-muted">{L('과세 가격', 'Customs value')}</td><td className="num text-right text-ink">US$ {num(d.value)} ({won(d.value * USD_KRW)})</td></tr>
              {d.parcels > 0 && <tr><td className="py-1 text-muted">{L('상자 수 · 상자당', 'Boxes · per box')}</td><td className="num text-right text-ink">{L(`${num(d.parcels)}개`, num(d.parcels))} · US$ {(d.value / d.parcels).toFixed(0)}</td></tr>}
              <tr><td className="py-1 text-muted">{L('예시 관세율', 'Sample duty rate')}</td><td className="num text-right text-ink">{d.clearance === 'list' ? L('면세(목록통관)', 'Duty-free (list clearance)') : `${hs.rate}%`}</td></tr>
              <tr><td className="py-1 text-muted">{L('관세 · 부가세(예시)', 'Duty · VAT (sample)')}</td><td className="num text-right text-ink">{won(d.duty)} · {won(d.vat)}</td></tr>
              <tr><td className="py-1 text-muted">{L('개인 직구 묶음', 'Personal direct-buy bundle')}</td><td className="num text-right text-ink">{d.personal ? L('예', 'Yes') : L('아니오', 'No')}{d.ai ? ` (${d.ai.personal.toFixed(2)})` : ''}</td></tr>
            </tbody>
          </table>
        </>
      )}
      <p className="mt-2 text-[10px] leading-snug text-faint">
        {L(
          '세율은 설명용 예시입니다. 실제는 10단위 세번(HSK)·관세율표 해석 통칙·FTA 원산지증명·감면에 따라 달라집니다. 목록통관도 예시 규칙(개인 자가사용·상자당 US$150 이하·식품·의약품 제외)으로 계산했습니다.',
          'Rates are illustrative samples. Real rates depend on the 10-digit tariff code (HSK), the General Interpretive Rules, FTA certificates of origin and reliefs. List clearance also uses a sample rule (personal use, US$150 or less per box, no food or medicine).',
        )}
      </p>
    </div>
  )
}

export function CustomsTab() {
  useStore((s) => s.tick)
  const [sel, setSel] = useState<string | null>(null)
  const list = sim.customs.list
  const d = list.find((x) => x.id === sel) ?? list[0]
  const st = sim.customs.stats
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        <Stat label={L('오늘 수입 신고', 'Import declarations today')} value={num(st.declared)} sub={L('부산신항 양하 컨테이너', 'Containers discharged at Busan New Port')} />
        <Stat label={L('세번 불일치 · 정밀 심사', 'HS mismatch · close review')} value={num(st.mismatch)} sub={L('신고 품명 ↔ 실제 내용', 'Declared goods ↔ actual contents')} tone={st.mismatch ? 'bad' : 'ok'} />
        <Stat label={L('목록통관 · 일반 신고', 'List clearance · general')} value={`${st.list} · ${st.general}`} sub={L('개인 직구 묶음은 목록통관', 'Personal bundles clear by list')} />
        <Stat label={L('예상 관세 + 부가세', 'Est. duty + VAT')} value={won(st.duty + st.vat)} sub={L('예시 세율 기준', 'At sample rates')} tone="brand" />
      </div>
      <div className="flex gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          {list.slice(0, 18).map((x) => (
            <button key={x.id} type="button" onClick={() => setSel(x.id)} className={`block w-full rounded-lg border px-2.5 py-1.5 text-left ${d?.id === x.id ? 'border-brand bg-brand-soft/40' : 'border-line bg-white hover:border-brand/40'}`}>
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="num text-faint">{hhmm(x.time)}</span>
                <span className="font-semibold text-ink-2">{x.declared}</span>
                <span className="truncate text-muted">{x.shipper}</span>
                <span className="ml-auto shrink-0">
                  {x.status === 'pending' ? (
                    <span className="flex items-center gap-1 text-muted"><Loader2 size={10} className="animate-spin" />{L('분류 중', 'Classifying…')}</span>
                  ) : x.mismatch ? (
                    <span className="rounded bg-bad-soft px-1.5 py-[2px] text-[10px] font-semibold text-bad">{L('정밀 심사', 'Close review')}</span>
                  ) : x.clearance === 'list' ? (
                    <span className="rounded bg-ok-soft px-1.5 py-[2px] text-[10px] font-semibold text-ok">{L('목록통관', 'List clearance')}</span>
                  ) : (
                    <span className="rounded bg-brand-soft px-1.5 py-[2px] text-[10px] font-semibold text-brand">{L('일반 신고', 'General entry')}</span>
                  )}
                </span>
              </div>
              <div className="mt-0.5 truncate text-[11.5px] text-ink">{x.description}</div>
              {x.status === 'ready' && (
                <div className="mt-0.5 flex items-center gap-1 text-[10.5px] text-muted">
                  <span>{L('신고', 'Declared')} {HS[x.declaredChapter].label}</span>
                  <span className={x.mismatch ? 'font-bold text-bad' : 'text-faint'}>{x.mismatch ? '≠' : '='}</span>
                  <span>{L('내용', 'Contents')} {HS[x.chapter].label}</span>
                  <By by={x.by} conf={x.ai?.chapterConfidence} />
                </div>
              )}
            </button>
          ))}
          {!list.length && <div className="py-8 text-center text-[12px] text-muted">{L('안벽 크레인이 수입 컨테이너를 내리면 신고서가 들어옵니다', 'Declarations arrive once the quay crane unloads import containers')}</div>}
        </div>
        <div className="w-[340px] shrink-0">{d && <Detail d={d} />}</div>
      </div>
    </div>
  )
}
