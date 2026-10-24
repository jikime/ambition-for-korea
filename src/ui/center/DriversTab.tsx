// 운전 시간 탭: 화물차 연속 운전(2시간 한도)과 휴게소·기사 교대 현황
import { Coffee } from 'lucide-react'
import { sim, SPEEDUP } from '../../sim/sim'
import { DRIVE_LIMIT, DRIVE_TIRED, REST_AREAS } from '../../sim/rest'
import { useStore } from '../../store'
import { Bar } from '../primitives'
import { vehicleKindLabel, vehicleStatus } from '../format'
import { Stat } from './OpsCenter'
import { L } from '../../i18n'

const hm = (simSec: number) => {
  const m = Math.round((simSec * SPEEDUP) / 60)
  return m >= 60 ? L(`${Math.floor(m / 60)}시간 ${m % 60}분`, `${Math.floor(m / 60)} h ${m % 60} min`) : L(`${m}분`, `${m} min`)
}

export function DriversTab() {
  useStore((s) => s.tick)
  const trucks = sim.vehicles.filter((v) => v.kind !== 'van').sort((a, b) => b.driveT - a.driveT)
  const st = sim.restStats
  const over = trucks.filter((v) => v.driveT > DRIVE_LIMIT && !v.rest).length
  const resting = trucks.filter((v) => v.rest?.parked)
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        <Stat label={L('휴게소 휴식', 'Rest-area stops')} value={L(`${st.stops}회`, `${st.stops}`)} sub={L(`의무 ${st.stops - st.voluntary} · 피곤해서 ${st.voluntary}`, `Mandatory ${st.stops - st.voluntary} · Tired ${st.voluntary}`)} tone="ok" />
        <Stat label={L('기사 교대', 'Driver swaps')} value={L(`${st.swaps}회`, `${st.swaps}`)} sub={L('휴게소 없는 셔틀 경로', 'Shuttle routes without a rest area')} />
        <Stat label={L('지금 쉬는 차', 'Resting now')} value={L(`${resting.length}대`, `${resting.length}`)} sub={resting.map((v) => v.id).join(' · ') || L('없음', 'None')} tone="brand" />
        <Stat label={L('2시간 넘게 운전 중', 'Driving over 2 h')} value={L(`${over}대`, `${over}`)} sub={over ? L('다음 휴게소에서 쉼', 'Resting at the next area') : L('모두 한도 안', 'All within limit')} tone={over ? 'warn' : 'ok'} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {sim.restAreas.map((a) => {
          const meta = REST_AREAS.find((x) => x.id === a.id)!
          const used = a.bays.filter((b) => b.vehicle)
          return (
            <div key={a.id} className="rounded-xl border border-line bg-white p-2.5">
              <div className="flex items-center justify-between text-[12px]">
                <span className="flex items-center gap-1.5 font-semibold text-ink"><Coffee size={13} className="text-[#17734A]" />{meta.name}</span>
                <span className="num text-muted">{L(`화물차 칸 ${used.length}/${a.bays.length}`, `Truck bays ${used.length}/${a.bays.length}`)}</span>
              </div>
              <div className="mt-2 flex gap-[3px]">
                {a.bays.map((b, i) => (
                  <span key={i} title={b.vehicle ?? L('빈 칸', 'Empty bay')} className={`h-5 flex-1 rounded-sm ${b.vehicle ? 'bg-[#17734A]' : 'bg-line-2'}`} />
                ))}
              </div>
              <div className="mt-1 truncate text-[10.5px] text-muted">{used.length ? used.map((b) => b.vehicle).join(' · ') : L('쉬는 차 없음', 'No trucks resting')}</div>
            </div>
          )
        })}
      </div>
      <table className="w-full text-[11.5px]">
        <thead>
          <tr className="border-b border-line text-left text-[10.5px] text-muted">
            <th className="py-1.5 font-semibold">{L('차량', 'Vehicle')}</th>
            <th className="font-semibold">{L('상태', 'Status')}</th>
            <th className="w-[38%] font-semibold">{L('연속 운전(한도 2시간)', 'Continuous driving (2 h limit)')}</th>
            <th className="text-right font-semibold">{L('휴게 · 교대', 'Rests · Swaps')}</th>
          </tr>
        </thead>
        <tbody>
          {trucks.map((v) => {
            const s = vehicleStatus(v)
            const tone = v.driveT > DRIVE_LIMIT ? 'red' : v.driveT > DRIVE_TIRED ? 'amber' : 'green'
            return (
              <tr key={v.id} className="cursor-pointer border-b border-line-2 hover:bg-line-2/60" onClick={() => useStore.getState().select({ kind: 'vehicle', id: v.id })}>
                <td className="py-1.5">
                  <div className="font-semibold text-ink">{v.id}</div>
                  <div className="text-[10px] text-muted">{vehicleKindLabel(v)}</div>
                </td>
                <td className="text-ink-2">{v.rest?.parked ? (v.rest.area ? L('☕ 휴게 중', '☕ Resting') : L('기사 교대', 'Driver swap')) : s.label}</td>
                <td>
                  <Bar value={v.driveT / DRIVE_LIMIT} tone={tone} />
                  <div className="num mt-0.5 text-[10px] text-muted">{hm(v.driveT)}</div>
                </td>
                <td className="num text-right text-ink-2">{L(`${v.rests}회 · ${v.swaps}회`, `${v.rests} · ${v.swaps}`)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="text-[10.5px] leading-snug text-faint">
        {L(
          '기준: 화물자동차 운수사업법 시행규칙(2시간 연속 운전 후 15분 이상 휴게). 시뮬레이션은 시계를 12배로 돌려 2시간 = 600초입니다. 출발 전에 이번 운행으로 한도를 넘길지 보고 경로 위 휴게소에 들르게 하므로, 막히는 길에서는 몇 분 넘길 수 있습니다.',
          'Basis: Enforcement Rules of the Trucking Transport Business Act (rest at least 15 min after 2 hours of continuous driving). The simulation runs the clock 12× faster, so 2 hours = 600 s. Before departure it checks whether the run would exceed the limit and routes the truck via a rest area on the way, so on congested roads it may go a few minutes over.',
        )}
      </p>
    </div>
  )
}
