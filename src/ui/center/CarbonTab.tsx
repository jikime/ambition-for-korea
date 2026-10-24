// 탄소 배출 탭: 오늘 운행에서 생긴 배출(육로·해상·항공), 상자 한 개의 여정별 배출, 같은 상자를 배·비행기로 보낼 때 비교
import { Plane, Ship, Sun, Truck } from 'lucide-react'
import { sim } from '../../sim/sim'
import { AIR_KG_TKM, GRID_KG_KWH, ROUTE_KM, SEA_KG_TKM, SOLAR_KWP, TRUCK_KG_KM, TRUCK_LABEL, journeyFootprint } from '../../sim/carbon'
import { useStore } from '../../store'
import { hhmm, num } from '../format'
import { L, plural } from '../../i18n'
import { Stat } from './OpsCenter'

const kgText = (kg: number) => (kg >= 1000 ? `${(kg / 1000).toFixed(1)} t` : kg >= 1 ? `${kg.toFixed(kg < 10 ? 1 : 0)} kg` : `${Math.round(kg * 1000)} g`)
const MODE_ICON = { road: <Truck size={12} />, sea: <Ship size={12} />, air: <Plane size={12} /> }

function Journey({ title, parts, color, max }: { title: string; parts: [string, number][]; color: string; max: number }) {
  const total = parts.reduce((s, [, kg]) => s + kg, 0)
  return (
    <div className="rounded-xl border border-line bg-white p-2.5">
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="font-semibold text-ink">{title}</span>
        <span className="num font-bold" style={{ color }}>{kgText(total)}</span>
      </div>
      <div className="mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-line-2" style={{ width: `${Math.max(4, (total / max) * 100)}%` }}>
        {parts.map(([n, kg], i) => <div key={n} title={`${n} ${kgText(kg)}`} style={{ width: `${(kg / total) * 100}%`, background: color, opacity: 1 - i * 0.18 }} />)}
      </div>
      <div className="mt-1.5 space-y-0.5">
        {parts.map(([n, kg]) => (
          <div key={n} className="flex justify-between text-[10.5px] text-muted">
            <span className="truncate">{n}</span>
            <span className="num shrink-0 text-ink-2">{kgText(kg)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const WEATHER_TEXT = { clear: L('맑음', 'Clear'), rain: L('비', 'Rain'), snow: L('눈', 'Snow') }

/** 지붕 태양광: 지금 출력 · 오늘 발전량 · 전력망 대비 상쇄량 */
function Solar() {
  const so = sim.solar
  const kw = so.kw
  const max = Math.max(1, ...so.byHour)
  const now = Math.floor(so.hour)
  // 비교 기준: 11톤 탑차가 곤지암 → 인천 75km를 짐 싣고 한 번 가는 배출
  const tripKg = 75 * TRUCK_KG_KM.box[1]
  const sites = Object.keys(SOLAR_KWP).length
  return (
    <div className="rounded-xl border border-line bg-white p-3">
      <div className="flex items-center gap-2 text-[12px]">
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-warn-soft text-warn"><Sun size={14} /></span>
        <span className="font-semibold text-ink">{L('지붕 태양광', 'Rooftop solar')}</span>
        <span className="text-muted">{L(`${sites}개 거점`, `${sites} ${plural(sites, 'site')}`)} · {num(Object.values(SOLAR_KWP).reduce((a, b) => a + b.kwp, 0))} kWp · {WEATHER_TEXT[so.weather]}</span>
        <span className="ml-auto text-[11px] text-muted">{L(`전력망 ${GRID_KG_KWH} kg/kWh 기준`, `Grid at ${GRID_KG_KWH} kg/kWh`)}</span>
      </div>
      <div className="mt-2 grid grid-cols-[1fr_1fr_1fr_1.4fr] gap-3">
        <div><div className="text-[10.5px] text-muted">{L('지금 출력', 'Output now')}</div><div className="num text-[17px] font-bold text-ink">{num(so.totalKw)} <span className="text-[11px] font-semibold text-muted">kW</span></div></div>
        <div><div className="text-[10.5px] text-muted">{L('오늘 발전', 'Generated today')}</div><div className="num text-[17px] font-bold text-ink">{num(so.totalKwh)} <span className="text-[11px] font-semibold text-muted">kWh</span></div></div>
        <div><div className="text-[10.5px] text-muted">{L('오늘 상쇄(추정)', 'Offset today (est.)')}</div><div className="num text-[17px] font-bold text-ok">{kgText(so.offsetKg)}</div><div className="text-[10px] text-faint">{L(`11톤 간선 약 ${num(so.offsetKg / tripKg)}회 운행분`, `≈ ${num(so.offsetKg / tripKg)} 11-ton linehaul ${plural(Math.round(so.offsetKg / tripKg), 'trip')}`)}</div></div>
        <div className="flex h-[52px] items-end gap-[2px]" aria-label={L('시간대별 발전량', 'Generation by hour')}>
          {so.byHour.map((v, h) => (
            <div key={h} title={L(`${h}시 ${num(v)} kWh`, `${h}:00 ${num(v)} kWh`)} className={`flex-1 rounded-t-sm ${h === now ? 'bg-warn' : 'bg-warn/45'}`} style={{ height: `${Math.max(2, (v / max) * 100)}%` }} />
          ))}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {Object.entries(SOLAR_KWP).map(([id, s]) => (
          <div key={id} className="rounded-lg bg-line-2 px-2 py-1.5 text-[10.5px]">
            <div className="truncate font-semibold text-ink-2">{s.name}</div>
            <div className="num text-muted">{num(s.kwp)} kWp · {L(`지금 ${num(kw[id])} kW`, `now ${num(kw[id])} kW`)}</div>
            <div className="num text-ink">{L(`오늘 ${num(so.kwh[id] ?? 0)} kWh`, `Today ${num(so.kwh[id] ?? 0)} kWh`)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function CarbonTab() {
  useStore((s) => s.tick)
  const c = sim.carbon
  const total = c.totals.road + c.totals.sea + c.totals.air
  const j = journeyFootprint()
  const sum = (p: [string, number][]) => p.reduce((s, [, kg]) => s + kg, 0)
  const max1 = Math.max(sum(j.land), sum(j.sea), sum(j.air))
  const max2 = Math.max(sum(j.airLA), sum(j.seaLA))
  const trips = Object.values(c.byKind).reduce((s, k) => s + k.trips, 0)
  const seaImports = num(c.log.filter((t) => t.mode === 'sea').length)
  const railShare = (() => { const road = sim.gateLog.stats.BS.out * 2; const rail = sim.rail.stats.teuIn; return road + rail ? Math.round((rail / (road + rail)) * 100) : 0 })()
  const shuttles = sim.rail.stats.trains + 6
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        <Stat label={L('오늘 운행 배출(추정)', 'Trip emissions today (est.)')} value={kgText(total)} sub={L('CO₂e · 예시 계수', 'CO₂e · sample factors')} />
        <Stat label={L('육로 트럭', 'Road trucks')} value={kgText(c.totals.road)} sub={L(`${trips}회 운행`, `${trips} ${plural(trips, 'trip')}`)} />
        <Stat label={L('해상 컨테이너', 'Sea containers')} value={kgText(c.totals.sea)} sub={L(`수입 ${seaImports}건+ · 상하이→부산`, `${seaImports}+ imports · Shanghai→Busan`)} />
        <Stat label={L('항공 화물기', 'Air freighters')} value={kgText(c.totals.air)} sub={L('인천 → LA · 프랑크푸르트', 'Incheon → LA · Frankfurt')} tone={c.totals.air > c.totals.road ? 'warn' : undefined} />
      </div>
      <Solar />
      {total > 0 && (
        <div>
          <div className="flex h-3 overflow-hidden rounded-full">
            <div className="bg-[#7A5CFF]" style={{ width: `${(c.totals.road / total) * 100}%` }} title={L('육로', 'Road')} />
            <div className="bg-[#2563EB]" style={{ width: `${(c.totals.sea / total) * 100}%` }} title={L('해상', 'Sea')} />
            <div className="bg-[#E8453C]" style={{ width: `${(c.totals.air / total) * 100}%` }} title={L('항공', 'Air')} />
          </div>
          <div className="mt-1 flex gap-3 text-[10.5px] text-muted">
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#7A5CFF]" />{L('육로', 'Road')} {Math.round((c.totals.road / total) * 100)}%</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#2563EB]" />{L('해상', 'Sea')} {Math.round((c.totals.sea / total) * 100)}%</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#E8453C]" />{L('항공', 'Air')} {Math.round((c.totals.air / total) * 100)}%</span>
            <span className="ml-auto">{L('화물기 한 편이 트럭 수백 회 운행만큼 배출합니다', 'One freighter flight emits as much as hundreds of truck trips')}</span>
          </div>
        </div>
      )}
      <div>
        <div className="mb-1.5 text-[11.5px] font-semibold text-ink">{L('상자 한 개(2kg)의 여정별 배출', 'Emissions per box (2 kg) by journey')}</div>
        <div className="grid grid-cols-3 gap-2">
          <Journey title={L('육로 택배 (이천 → 다온마을)', 'Road parcel (Icheon → Daon Village)')} parts={j.land} color="#7A5CFF" max={max1} />
          <Journey title={L('해상 수입 (상하이 → 다온마을)', 'Sea import (Shanghai → Daon Village)')} parts={j.sea} color="#2563EB" max={max1} />
          <Journey title={L('항공 수출 (곤지암 → 도쿄)', 'Air export (Gonjiam → Tokyo)')} parts={j.air} color="#E8453C" max={max1} />
        </div>
      </div>
      <div>
        <div className="mb-1.5 text-[11.5px] font-semibold text-ink">{L('같은 상자를 미국 LA로 보낸다면', 'If the same box goes to Los Angeles')}</div>
        <div className="grid grid-cols-2 gap-2">
          <Journey title={L('항공 (빠름 · 2~3일)', 'Air (fast · 2–3 days)')} parts={j.airLA} color="#E8453C" max={max2} />
          <Journey title={L('해상 (느림 · 2~3주)', 'Sea (slow · 2–3 weeks)')} parts={j.seaLA} color="#2563EB" max={max2} />
        </div>
        <div className="mt-1 text-[11px] text-ink-2">
          {L('항공이 해상보다 약 ', 'Air emits about ')}<span className="font-bold text-bad">{L(`${Math.round(sum(j.airLA) / sum(j.seaLA))}배`, `${Math.round(sum(j.airLA) / sum(j.seaLA))}×`)}</span>{L(' 더 배출합니다. 급하지 않은 역직구 상자는 해상 특송으로 돌리면 배출을 크게 줄일 수 있습니다.', ' as much as sea. Moving non-urgent cross-border export boxes to sea express cuts emissions sharply.')}
        </div>
      </div>
      <div>
        <div className="mb-1.5 text-[11.5px] font-semibold text-ink">{L('부산신항 → 곤지암 내륙 운송: 도로 직송 vs 철송', 'Busan New Port → Gonjiam inland: direct road vs rail')}</div>
        <div className="grid grid-cols-2 gap-2">
          <Journey title={L('트레일러 직송', 'Direct trailer')} parts={j.inlandRoad} color="#7A5CFF" max={Math.max(sum(j.inlandRoad), sum(j.inlandRail))} />
          <Journey title={L('철송 + 짧은 트레일러', 'Rail + short trailer leg')} parts={j.inlandRail} color="#16A34A" max={Math.max(sum(j.inlandRoad), sum(j.inlandRail))} />
        </div>
        <div className="mt-1 text-[11px] text-ink-2">
          {L('철송이 트레일러 직송보다 약 ', 'Rail emits about ')}<span className="font-bold text-ok">{Math.round((1 - sum(j.inlandRail) / sum(j.inlandRoad)) * 100)}%</span>{L(
            ` 적게 배출합니다(예시 계수). 화면을 연 뒤 부산신항 반출 중 철도 몫 ${railShare}%(철송장 셔틀 ${shuttles}회).`,
            ` less than a direct trailer (sample factors). Since this page opened, rail carried ${railShare}% of Busan New Port gate-outs (${shuttles} rail terminal ${plural(shuttles, 'shuttle')}).`,
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1 text-[11.5px] font-semibold text-ink">{L('최근 운행', 'Recent trips')}</div>
          <div className="space-y-0.5">
            {c.log.slice(0, 9).map((t, i) => (
              <div key={`${t.time}-${i}`} className="flex items-center gap-1.5 text-[10.5px]">
                <span className="num text-faint">{hhmm(t.time)}</span>
                <span className="text-muted">{MODE_ICON[t.mode]}</span>
                <span className="min-w-0 flex-1 truncate text-ink-2">{t.label}</span>
                <span className="num shrink-0 font-semibold text-ink">{kgText(t.kg)}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1 text-[11.5px] font-semibold text-ink">{L('예시 배출 계수', 'Sample emission factors')}</div>
          <table className="w-full text-[10.5px]">
            <tbody className="divide-y divide-line-2">
              {Object.entries(TRUCK_KG_KM).map(([k, [e, l]]) => (
                <tr key={k}><td className="py-0.5 text-muted">{TRUCK_LABEL[k]}</td><td className="num text-right text-ink-2">{L(`빈 차 ${e} · 짐 ${l} kg/km`, `Empty ${e} · loaded ${l} kg/km`)}</td></tr>
              ))}
              <tr><td className="py-0.5 text-muted">{L('컨테이너선', 'Container ship')}</td><td className="num text-right text-ink-2">{SEA_KG_TKM * 1000} g/t·km</td></tr>
              <tr><td className="py-0.5 text-muted">{L('화물기', 'Freighter')}</td><td className="num text-right text-ink-2">{AIR_KG_TKM * 1000} g/t·km</td></tr>
              <tr><td className="py-0.5 text-muted">{L('거점 거리(예시)', 'Site distance (sample)')}</td><td className="num text-right text-ink-2">{L(`이천↔곤지암 ${ROUTE_KM['IC>GJ']}km · 곤지암↔인천 ${ROUTE_KM['GJ>IN']}km`, `Icheon↔Gonjiam ${ROUTE_KM['IC>GJ']} km · Gonjiam↔Incheon ${ROUTE_KM['GJ>IN']} km`)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[10.5px] leading-snug text-faint">
        {L(
          '모든 값은 비교를 위한 추정입니다. 지도는 거점 사이를 줄여 놓아 부산신항 트레일러가 실제(편도 380km)보다 훨씬 자주 오가므로, 오늘 합계의 트레일러 몫은 실제보다 큽니다. 트럭은 경유 연비로 만든 km당 예시 값, 배·비행기는 GLEC 프레임워크 기본값 범위를 참고한 t·km 예시 값입니다. 상자 한 개 몫은 트럭 운행 배출을 실은 상자 수로 나누고, 해상은 컨테이너 적재율을 고려해 1.4배로 잡았습니다. 실제 산정(ISO 14083)에는 차량별 연료 사용량과 적재율 자료가 필요합니다.',
          "All values are estimates for comparison. The map shortens distances between sites, so Busan New Port trailers run far more often than in reality (380 km one way), and their share of today's total is larger than real. Trucks use sample per-km values from diesel fuel economy; ships and planes use sample t·km values within GLEC Framework default ranges. A box's share is the trip emissions divided by the boxes on board; sea is set 1.4× higher to allow for container fill rates. Real accounting (ISO 14083) needs per-vehicle fuel use and load factor data.",
        )}
      </p>
    </div>
  )
}
