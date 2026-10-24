// 경로 최적화 탭: 지금 노선과 최적 노선을 다온마을 지도에 겹쳐 보고, 적용하면 다음 출발부터 배송차가 새 노선을 탄다
import { sim } from '../../sim/sim'
import { ORIGINAL, routeLen, routePoints } from '../../sim/zones'
import { STOPS, TW } from '../../sim/sites'
import { useStore } from '../../store'
import { num } from '../format'
import { openApproval } from '../ApproveDialog'
import { CONTROLLER } from '../../sim/approvals'
import { L, plural } from '../../i18n'
import { Stat } from './OpsCenter'

const COLORS: Record<string, string> = { apt: '#2F55E6', mix: '#FF8A3D', villa: '#16A34A', west: '#7A5CFF' }
const NAMES: Record<string, string> = { apt: L('1노선', 'Route 1'), mix: L('2노선', 'Route 2'), villa: L('3노선', 'Route 3'), west: L('4노선', 'Route 4') }
// 짧은 이름: 표시 문구(정차지 이름)를 글자로 잘라 내지 않고 정차지 id로 정한다(아파트 A101 → 101동). 빌라는 이름 그대로
const short = (id: string) => (/^A\d+$/.test(id) ? L(`${id.slice(1)}동`, `Bldg ${id.slice(1)}`) : id === 'LOCK' ? L('택배함', 'Locker') : id === 'STORE' ? L('편의점', 'Store') : STOPS[id].label)

function TownMap({ plan, title, total }: { plan: Record<string, string[]>; title: string; total: number }) {
  const keys = Object.keys(plan)
  return (
    <div className="min-w-0 flex-1 rounded-xl border border-line bg-white p-2.5">
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="font-semibold text-ink">{title}</span>
        <span className="num text-muted">{L(`배송차 12대 합계 ${num(total)} m`, `12 vans total ${num(total)} m`)}</span>
      </div>
      <svg viewBox="-568 48 210 226" className="mt-1 h-[230px] w-full rounded-lg bg-[#F1F5EE]" role="img" aria-label={L(`${title} 노선 지도`, `${title} map`)}>
        <path d={`M ${TW.road.x} 50 L ${TW.road.x} 266`} stroke="#fff" strokeWidth={10} strokeLinecap="round" />
        <path d={`M ${TW.road.x} ${TW.apt.roadZ} L ${TW.apt.x1} ${TW.apt.roadZ}`} stroke="#fff" strokeWidth={10} strokeLinecap="round" />
        {[...TW.northRow.map((x) => [x, TW.northZ]), ...TW.southRow.map((x) => [x, TW.southZ])].map(([x, z]) => <rect key={`${x}-${z}`} x={x - 14} y={z - 7} width={28} height={14} rx={2} fill="#DCE2EE" />)}
        {TW.villas.map((z) => <rect key={z} x={TW.villaX - 4} y={z - 8} width={14} height={16} rx={2} fill="#E9E1D3" />)}
        {keys.map((k, i) => {
          const off = (i - 1.5) * 1.8
          const pts = routePoints(plan[k]).map((p) => `${(p.x + off).toFixed(1)},${(p.z + off).toFixed(1)}`).join(' ')
          return <polyline key={k} points={pts} fill="none" stroke={COLORS[k]} strokeWidth={1.8} strokeLinejoin="round" opacity={0.9} />
        })}
        {Object.values(STOPS).map((s) => <circle key={s.id} cx={s.van.x} cy={s.van.z} r={2.6} fill="#121933" />)}
      </svg>
      <div className="mt-1.5 space-y-1">
        {keys.map((k) => (
          <div key={k} className="flex items-center gap-1.5 text-[10.5px]">
            <span className="h-2 w-3 shrink-0 rounded-sm" style={{ background: COLORS[k] }} />
            <span className="min-w-9 shrink-0 font-semibold text-ink-2">{NAMES[k]}</span>
            <span className="min-w-0 flex-1 truncate text-muted">{plan[k].map(short).join(' · ')}</span>
            <span className="num shrink-0 text-ink-2">{num(routeLen(plan[k]))} m</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function RoutesTab() {
  useStore((s) => s.tick)
  const z = sim.zones
  const r = z.result()
  const saved = 1 - r.total / r.base
  const trips = (opt: boolean) => z.trips.filter((t) => t.optimized === opt)
  const avg = (xs: { dist: number }[]) => (xs.length ? xs.reduce((s, t) => s + t.dist, 0) / xs.length : 0)
  const before = trips(false)
  const after = trips(true)
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        <Stat label={L('지금 노선 합계', 'Current routes total')} value={`${num(r.base)} m`} sub={L('12대가 한 바퀴씩 돌 때', 'One loop by each of 12 vans')} />
        <Stat label={L('최적 노선 합계', 'Optimized routes total')} value={`${num(r.total)} m`} sub={L(`${Math.round(saved * 100)}% 짧음 · 정차 횟수 같음`, `${Math.round(saved * 100)}% shorter · same stops`)} tone="ok" />
        <Stat label={L('실측 한 바퀴(지금 노선)', 'Measured loop (current)')} value={before.length ? `${num(avg(before))} m` : '-'} sub={L(`${before.length}회 운행 · 터미널 출발~복귀`, `${before.length} ${plural(before.length, 'trip')} · terminal out & back`)} />
        <Stat label={L('실측 한 바퀴(최적 노선)', 'Measured loop (optimized)')} value={after.length ? `${num(avg(after))} m` : '-'} sub={after.length ? L(`${after.length}회 운행`, `${after.length} ${plural(after.length, 'trip')}`) : L('적용 뒤 운행부터', 'Trips after applying')} tone={after.length ? 'ok' : undefined} />
      </div>
      <div className="flex items-center gap-2 rounded-xl bg-[#FAFBFE] px-3 py-2 ring-1 ring-line">
        <div className="min-w-0 flex-1 text-[11.5px] text-ink-2">
          {z.applied
            ? L('최적 노선을 쓰는 중입니다. 다음에 출발하는 배송차부터 새 노선을 탑니다(이미 나간 차는 원래 노선으로 돌아옵니다).', 'Optimized routes in use. Vans take the new routes from their next departure (vans already out finish on the original routes).')
            : L('단지 안 동을 도는 노선과 빌라 골목을 도는 노선을 나누면, 한 차가 단지 순환로와 빌라 골목을 모두 도는 일이 줄어듭니다.', 'Splitting routes that loop the apartment buildings from routes that run the villa lanes means fewer vans cover both the complex loop and the villa lanes.')}
        </div>
        <button
          type="button"
          onClick={() => {
            if (z.applied) {
              // 되돌리기는 영향이 작아 바로 실행하고 기록만 남긴다
              z.apply(false)
              sim.approvals.log(CONTROLLER, L('되돌림', 'Reverted'), L('다온마을 배송 노선 → 원래 노선', 'Daon Village delivery routes → original routes'))
              useStore.getState().notify(L('다온마을 배송 노선을 원래대로 되돌렸습니다', 'Daon Village delivery routes reverted to the original'))
              return
            }
            // 노선 변경은 승인 후 실행(제안 → 승인 → 기록)
            const prev = sim.approvals.list.find((p) => p.kind === 'zones' && p.state === 'pending')
            if (prev) return openApproval(prev.id)
            const p = sim.approvals.propose({
              kind: 'zones', target: 'TW', impact: 'high',
              title: L('다온마을 배송 노선 최적화', 'Daon Village delivery route optimization'),
              why: L('단지 안 동을 도는 노선과 빌라 골목을 도는 노선을 나누면 한 차가 두 곳을 모두 도는 일이 줄어듭니다.', 'Splitting routes that loop the apartment buildings from routes that run the villa lanes means fewer vans have to cover both.'),
              cur: { title: L(`지금 노선 합계 ${num(r.base)} m`, `Current routes total ${num(r.base)} m`), lines: Object.entries(ORIGINAL).map(([k, ids]) => `${k}: ${ids.join(' · ')}`) },
              next: { title: L(`최적 노선 합계 ${num(r.total)} m`, `Optimized routes total ${num(r.total)} m`), lines: Object.entries(r.plan).map(([k, ids]) => `${k}: ${ids.join(' · ')}`) },
              effect: [
                L(`노선 합계 ${Math.round(saved * 100)}% 짧음(정차 횟수 같음)`, `Routes ${Math.round(saved * 100)}% shorter in total (same number of stops)`),
                L(`1톤 탑차 배출 약 ${Math.round(((r.base - r.total) / 1000) * 0.24 * 1000)} g 줄어듦(한 바퀴씩 기준)`, `About ${Math.round(((r.base - r.total) / 1000) * 0.24 * 1000)} g less 1-ton van emissions (one loop each)`),
                L('다음에 출발하는 배송차부터 적용', 'Applies from the next van to depart'),
              ],
              apply: () => {
                z.apply(true)
                return L('최적 노선 적용(다음 출발부터)', 'Optimized routes applied (from next departure)')
              },
            })
            openApproval(p.id)
          }}
          className={`h-8 shrink-0 rounded-lg px-3 text-[12px] font-semibold ${z.applied ? 'bg-line-2 text-ink-2' : 'bg-brand text-white'}`}
        >
          {z.applied ? L('원래 노선으로', 'Revert to original') : L('최적 노선 적용', 'Apply optimized routes')}
        </button>
      </div>
      <div className="flex gap-2">
        <TownMap plan={ORIGINAL} title={L('지금 노선', 'Current routes')} total={r.base} />
        <TownMap plan={r.plan} title={L('최적 노선', 'Optimized routes')} total={r.total} />
      </div>
      <p className="text-[10.5px] leading-snug text-faint">
        {L(
          '거리는 시뮬레이션 도로 경로 길이(m)입니다. 정차 순서는 일방통행 길이 정하므로 노선마다 맡을 동만 바꿉니다. 탐색: 동 옮기기·맞바꾸기 담금질(시드 고정), 제약은 노선당 정차 2~5곳·같은 동 한 번·노선별 상자 수 평균의 55~145%.',
          'Distances are simulated road path lengths (m). One-way streets fix the stop order, so only the buildings each route covers change. Search: simulated annealing with move and swap (fixed seed); constraints are 2–5 stops per route, each building once, and 55–145% of the average box count per route.',
        )}
      </p>
    </div>
  )
}
