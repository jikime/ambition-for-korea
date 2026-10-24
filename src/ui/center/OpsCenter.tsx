// 운영 센터: 고객 응대·반품·콜드체인·통관·주소 정정·명절 시나리오·경로 최적화·탄소·운전 시간을 한 창에서 본다.
// 상단 막대의 "운영 센터" 버튼으로 연다. 각 탭은 시뮬레이션 상태를 그대로 읽고, 판단이 필요한 곳은 AI(끄면 기본 규칙)를 쓴다.
import type { ReactNode } from 'react'
import { CalendarClock, Coffee, Radar, FileSearch, Leaf, MapPinned, MessageCircle, Route, Snowflake, Sparkles, Undo2, X } from 'lucide-react'
import { useStore, type CenterTab } from '../../store'
import { ai } from '../../sim/ai'
import { InquiryTab } from './InquiryTab'
import { ReturnsTab } from './ReturnsTab'
import { DriversTab } from './DriversTab'
import { ColdTab } from './ColdTab'
import { CustomsTab } from './CustomsTab'
import { AddressTab } from './AddressTab'
import { ScenarioTab } from './ScenarioTab'
import { RoutesTab } from './RoutesTab'
import { CarbonTab } from './CarbonTab'
import { BriefTab } from './BriefTab'
import { L } from '../../i18n'

export const CENTER_TABS: { id: CenterTab; label: string; icon: ReactNode; title: string; desc: string; ai?: string }[] = [
  { id: 'brief', label: L('관제 브리핑', 'Briefing'), icon: <Radar size={14} />, title: L('관제 브리핑 · 간선 도착 약속', 'Control briefing · Linehaul arrival promise'), desc: L('간선이 출발할 때 도착 거점의 도크 예약 창을 정하고, 달리는 동안 남은 경로·돌발 속도·휴게로 도착 예정을 다시 계산해 위험한 운행과 원인을 먼저 보여 줍니다.', 'When a linehaul truck departs, it books a dock window at the destination. While it drives, the ETA is recalculated from the remaining route, incident speeds and rest stops, so risky runs and their causes show first.') },
  { id: 'inquiry', label: L('고객 문의', 'Inquiries'), icon: <MessageCircle size={14} />, title: L('고객 문의 · 내 택배 어디쯤?', 'Customer inquiries · Where’s my parcel?'), desc: L('고객이 쓴 한 줄을 읽어 조회·장소 변경·배송일 변경·반품·민원으로 나누고, 코드가 배송차 상태로 실제 처리합니다.', 'Reads the customer’s one-line message and sorts it into tracking, change of place, change of date, return or complaint. Code then handles it using the delivery van’s actual status.'), ai: L('의도·맡길 곳·날짜·사유·미개봉·화남', 'intent, drop place, date, reason, unopened, anger') },
  { id: 'returns', label: L('반품·회수', 'Returns'), icon: <Undo2 size={14} />, title: L('반품 · 회수(역물류)', 'Returns · Pickups (reverse logistics)'), desc: L('배송차가 배송하면서 반품을 회수하고, 빈 간선 회송차로 곤지암 반품 검수대까지 옮긴 뒤 처리 방법을 정합니다.', 'Delivery vans pick up returns on their rounds, empty linehaul backhauls carry them to the Gonjiam returns inspection desk, and a disposition is decided there.'), ai: L('반품 사유·미개봉·운송 중 파손', 'return reason, unopened, damaged in transit') },
  { id: 'cold', label: L('새벽·콜드체인', 'Cold chain'), icon: <Snowflake size={14} />, title: L('새벽배송 · 콜드체인 온도 관제', 'Dawn delivery · Cold chain temperature control'), desc: L('냉동탑차 온도를 실시간으로 보고, 기사·센서 메시지를 읽어 냉동기 고장이면 재냉각·검수를 지시합니다. 23시 마감 → 7시 도착 약속을 지켜봅니다.', 'Watches reefer truck temperatures live and reads driver and sensor messages; on a refrigeration failure it orders re-cooling and inspection. Tracks the 23:00 cutoff → 07:00 arrival promise.'), ai: L('냉동기 고장·문 열림·변질 위험', 'refrigeration failure, door open, spoilage risk') },
  { id: 'customs', label: L('통관 HS', 'Customs HS'), icon: <FileSearch size={14} />, title: L('통관 품목 분류(HS 코드)', 'Customs item classification (HS code)'), desc: L('수입 컨테이너의 신고 품명과 상세 설명을 각각 HS 류(類)로 분류해 비교합니다. 예시 세율과 목록통관 여부는 코드 규칙으로 계산합니다.', 'Classifies the declared item name and the detailed description of each import container into HS chapters and compares them. Sample duty rates and list-clearance eligibility come from code rules.'), ai: L('상세 설명 HS 류·신고 품명 HS 류·개인 직구', 'HS chapter of description, HS chapter of declared name, personal import') },
  { id: 'address', label: L('주소 정정', 'Address fix'), icon: <MapPinned size={14} />, title: L('주소 오류 바로잡기', 'Fixing address errors'), desc: L('오타·약칭·빠진 동이 섞인 주소를 코드가 비슷한 후보로 좁히고, AI가 그중 맞는 곳을 고릅니다. 동·호수가 없으면 고객에게 확인합니다.', 'Code narrows addresses with typos, abbreviations or a missing building down to similar candidates, and AI picks the right one. If the building or unit number is missing, the customer is asked.'), ai: L('후보 중 정답·동호수 누락', 'correct candidate, missing building/unit') },
  { id: 'scenario', label: L('명절 시나리오', 'Holiday scenario'), icon: <CalendarClock size={14} />, title: L('명절 물량 폭증 "만약에" 시나리오', 'Holiday volume surge "what if" scenarios'), desc: L('추석·설·직구 대란·장마를 가정해 단계별 처리 능력과 병목, 밀린 물량이 풀리는 시간을 계산합니다. 공지 문장을 넣으면 AI가 시나리오를 고릅니다.', 'Assumes Chuseok, Lunar New Year, a cross-border shopping rush or the monsoon, and computes capacity per stage, bottlenecks and when the backlog clears. Paste a notice and AI picks the scenario.'), ai: L('시나리오·규모·영향 거점', 'scenario, scale, affected sites') },
  { id: 'routes', label: L('경로 최적화', 'Routes'), icon: <Route size={14} />, title: L('배송 구역 · 경로 최적화', 'Delivery zones · Route optimization'), desc: L('다온마을은 일방통행 순환로라 정차 순서는 길이 정합니다. 그래서 어느 차가 어느 동을 맡을지를 다시 묶어 실제 주행 거리를 줄입니다.', 'Daon Village is a one-way loop, so the road sets the stop order. Instead, we regroup which van covers which building to cut the actual driving distance.') },
  { id: 'carbon', label: L('탄소 배출', 'Carbon'), icon: <Leaf size={14} />, title: L('탄소 배출 비교', 'Carbon emissions comparison'), desc: L('육로·해상·항공 운송의 이동 거리와 무게로 배출량을 추정합니다(예시 배출 계수). 같은 상자를 배·비행기로 보낼 때 차이를 비교합니다.', 'Estimates emissions from distance and weight for road, sea and air transport (sample emission factors), and compares sending the same box by ship or by plane.') },
  { id: 'drivers', label: L('운전 시간', 'Drive time'), icon: <Coffee size={14} />, title: L('화물차 운전 시간 · 휴게', 'Truck driving time · Rest stops'), desc: L('2시간 연속 운전하면 15분 이상 쉬어야 합니다. 휴게소에 들르는 차, 기사 교대, 지금 쉬는 차를 봅니다.', 'After 2 hours of continuous driving, drivers must rest at least 15 min. See trucks stopping at rest areas, driver swaps and trucks resting now.') },
]

export function CenterButton() {
  const open = useStore((s) => s.center)
  return (
    <button
      type="button"
      onClick={() => useStore.getState().openCenter(open ? null : 'brief')}
      aria-expanded={!!open}
      className={`flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[12px] font-semibold ${open ? 'bg-ink text-white' : 'bg-line-2 text-ink-2 hover:bg-brand-soft hover:text-brand'}`}
    >
      <MessageCircle size={13} />
      {L('운영 센터', 'Ops center')}
    </button>
  )
}

export function OpsCenter() {
  useStore((s) => s.tick)
  const tab = useStore((s) => s.center)
  if (!tab) return null
  const meta = CENTER_TABS.find((t) => t.id === tab)!
  const set = useStore.getState().openCenter
  return (
    <section className="panel rise pointer-events-auto absolute bottom-4 left-4 top-[72px] z-30 flex w-[min(1000px,calc(100vw-420px))] overflow-hidden" aria-label={L('운영 센터', 'Operations center')}>
      <nav className="flex w-[148px] shrink-0 flex-col gap-0.5 border-r border-line bg-[#FAFBFE] p-2" aria-label={L('운영 센터 탭', 'Operations center tabs')}>
        <div className="px-2 pb-2 pt-1 text-[12.5px] font-bold text-ink">{L('운영 센터', 'Operations center')}</div>
        {CENTER_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => set(t.id)}
            aria-current={tab === t.id}
            className={`flex items-center gap-2 rounded-lg px-2 py-[7px] text-left text-[12px] font-semibold ${tab === t.id ? 'bg-white text-brand shadow-sm' : 'text-ink-2 hover:bg-white/70'}`}
          >
            <span className={tab === t.id ? 'text-brand' : 'text-muted'}>{t.icon}</span>
            {t.label}
          </button>
        ))}
        <div className="mt-auto rounded-lg bg-line-2 px-2 py-1.5 text-[10.5px] leading-snug text-muted">
          <span className="font-semibold text-ink-2">AI {ai.on ? L('켜짐', 'on') : L('꺼짐', 'off')}</span>
          <br />
          {ai.on ? L('AI가 판단, 코드가 결정', 'AI judges, code decides') : L('기본 규칙으로 처리 중', 'Using default rules')}
        </div>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-start gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
              {meta.title}
            </h2>
            <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{meta.desc}</p>
            {meta.ai && (
              <span className={`mt-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-[3px] text-[10.5px] font-semibold ${ai.on ? 'bg-brand-soft text-brand' : 'bg-line-2 text-muted'}`}>
                <Sparkles size={10} />
                {ai.on ? L(`AI 판단: ${meta.ai}`, `AI reads: ${meta.ai}`) : L(`AI 꺼짐 · 기본 규칙으로 ${meta.ai}`, `AI off · Default rules for ${meta.ai}`)}
              </span>
            )}
          </div>
          <button type="button" aria-label={L('운영 센터 닫기', 'Close operations center')} onClick={() => set(null)} className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-line-2">
            <X size={15} />
          </button>
        </header>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-4">
          {tab === 'inquiry' && <InquiryTab />}
          {tab === 'returns' && <ReturnsTab />}
          {tab === 'cold' && <ColdTab />}
          {tab === 'customs' && <CustomsTab />}
          {tab === 'address' && <AddressTab />}
          {tab === 'scenario' && <ScenarioTab />}
          {tab === 'routes' && <RoutesTab />}
          {tab === 'carbon' && <CarbonTab />}
          {tab === 'brief' && <BriefTab />}
          {tab === 'drivers' && <DriversTab />}
        </div>
      </div>
    </section>
  )
}

/** 탭 공통: 작은 지표 카드 */
export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'ok' | 'warn' | 'bad' | 'brand' }) {
  const c = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : tone === 'brand' ? 'text-brand' : 'text-ink'
  return (
    <div className="min-w-0 rounded-xl border border-line bg-white px-3 py-2">
      <div className="truncate text-[11px] text-muted">{label}</div>
      <div className={`num mt-0.5 truncate text-[18px] font-bold tracking-[-0.02em] ${c}`}>{value}</div>
      {sub && <div className="truncate text-[10.5px] text-faint">{sub}</div>}
    </div>
  )
}

/** AI/규칙 판단 표시 */
export function By({ by, conf }: { by: 'ai' | 'rule'; conf?: number }) {
  return by === 'ai' ? (
    <span className={`num inline-flex items-center gap-0.5 rounded px-1 py-[2px] text-[10px] font-semibold ${conf !== undefined && conf < 0.6 ? 'bg-warn-soft text-warn' : 'bg-brand-soft text-brand'}`}>
      <Sparkles size={9} />
      AI{conf !== undefined ? ` ${conf.toFixed(2)}` : ''}
    </span>
  ) : (
    <span className="rounded bg-line-2 px-1 py-[2px] text-[10px] font-semibold text-muted">{L('규칙', 'Rule')}</span>
  )
}
