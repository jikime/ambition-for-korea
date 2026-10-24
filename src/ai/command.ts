// 자연어 관제 명령: AI는 동작과 닫힌 집합 인자만 고르고, 필터·정렬·실행은 코드가 한다.
import { sim, type Vehicle } from '../sim/sim'
import { SITE_META, type SiteId } from '../sim/world'
import { useStore, type Selection } from '../store'
import { vehicleEta } from '../ui/format'
import { aiPost } from './judge'
import { ai } from '../sim/ai'
import { exitReplay, seekReplay } from '../ui/replay'
import { L, plural } from '../i18n'

type Ans = { choice: string; confidence: number }
type Answers = Record<'action' | 'site' | 'vehicle_kind' | 'vehicle_status' | 'rank' | 'speed' | 'forklift' | 'minutes_ago' | 'event', Ans>

export interface CommandResult {
  text: string
  ok: boolean
  action: string
  confidence: number
  chips: { label: string; confidence: number }[]
  summary: string
  matches: { sel: Selection; site: SiteId; title: string; sub: string }[]
  ms: number
}

const ACTION_LABEL: Record<string, string> = {
  show_site: L('거점 이동', 'Go to site'), network: L('전국 네트워크', 'National network'), follow_story: L('택배 여정 따라가기', 'Follow parcel journey'), find_vehicle: L('차량 찾기', 'Find vehicle'),
  find_forklift: L('지게차 찾기', 'Find forklift'), set_speed: L('속도 변경', 'Change speed'), rewind: L('되감기', 'Rewind'), live: L('LIVE로', 'Back to LIVE'), none: L('관제와 무관', 'Not a control command'),
}
const MINUTES: Record<string, number> = { m5: 5, m10: 10, m15: 15, m20: 20, m30: 30, m45: 45, m60: 60 }
const EVENT_LABEL: Record<string, string> = { incident: L('돌발 상황', 'Incident'), gate: L('정문 혼잡', 'Gate congestion'), report: L('현장 보고', 'Field report'), vessel: L('선사 통보', 'Shipping line notice'), driver: L('기사 메시지', 'Driver message') }
const KIND_LABEL: Record<string, string> = { wing: L('5톤 윙바디', '5-ton wing-body'), box: L('11톤 간선', '11-ton linehaul'), van: L('1톤 배송', '1-ton delivery'), reefer: L('냉동탑차', 'Reefer truck'), trailer: L('트레일러', 'Trailer') }
const STATUS_LABEL: Record<string, string> = { highway: L('간선 주행 중', 'On the highway'), loading: L('상차 중', 'Loading'), unloading: L('하차 중', 'Unloading'), waiting: L('도크 대기', 'Waiting for dock'), delivering: L('배송 중', 'Delivering') }
const RANK_LABEL: Record<string, string> = { latest: L('제일 늦는 순', 'Latest first'), most_cargo: L('많이 실은 순', 'Most cargo first') }
const FORK_LABEL: Record<string, string> = { low_battery: L('배터리 부족', 'Low battery'), working: L('작업 중', 'Working'), idle: L('대기 중', 'Idle') }
const SPEED: Record<string, number> = { x1: 1, x2: 2, x4: 4, x8: 8 }

/** 신뢰도가 낮은 인자는 쓰지 않는다(조건 없음으로 취급) */
const MIN_ARG = 0.5
const MIN_ACTION = 0.45

function cargoAmount(v: Vehicle) {
  if (v.kind === 'wing') return v.cargo.filter(Boolean).length * 100
  if (v.kind === 'box') return v.site === 'IN' ? v.cargoTotal - v.cargoDone : v.cargoDone
  if (v.kind === 'trailer') return v.container ? 1000 : 0
  return v.cargoDone
}

function statusMatch(v: Vehicle, s: string) {
  if (s === 'delivering') return v.phase === 'delivering' || (v.kind === 'van' && v.site === 'TW')
  return v.phase === s
}

export async function runCommand(text: string): Promise<CommandResult> {
  const t0 = performance.now()
  if (!ai.on) return { text, ms: 0, chips: [], matches: [], ok: false, action: 'off', confidence: 0, summary: L('AI가 꺼져 있어요. 상단 AI 스위치를 켜면 말로 명령할 수 있어요', 'AI is off. Turn on the AI switch at the top to give commands in plain words') }
  const res = await aiPost<{ answers: Answers }>('/api/ai/command', { text })
  const ms = performance.now() - t0
  const st = useStore.getState()
  const base = { text, ms, chips: [] as CommandResult['chips'], matches: [] as CommandResult['matches'] }
  if (!res) return { ...base, ok: false, action: 'error', confidence: 0, summary: L('AI에 연결하지 못했어요. 잠시 후 다시 시도해 주세요', 'Could not reach AI. Please try again shortly') }
  const a = res.answers
  const arg = (k: keyof Answers, empty: string) => (a[k].confidence >= MIN_ARG ? a[k].choice : empty)
  const action = a.action.choice
  const chips = [{ label: ACTION_LABEL[action] ?? action, confidence: a.action.confidence }]
  const addChip = (k: keyof Answers, labels: Record<string, string>, empty: string) => {
    const v = arg(k, empty)
    if (v !== empty && labels[v]) chips.push({ label: labels[v], confidence: a[k].confidence })
    return v
  }
  const done = (ok: boolean, summary: string, matches: CommandResult['matches'] = []) => ({ ...base, ok, action, confidence: a.action.confidence, chips, summary, matches })

  if (action === 'none' || a.action.confidence < MIN_ACTION) {
    return done(false, L('관제 명령으로 이해하지 못했어요. 예: "부산 항만 보여줘", "배터리 부족한 지게차"', 'Not understood as a control command. E.g. "Show Busan port", "Forklifts with low battery"'))
  }
  const siteNames = Object.fromEntries(Object.entries(SITE_META).map(([k, m]) => [k, m.name]))
  const site = addChip('site', siteNames, 'none') as SiteId | 'none'

  if (action === 'show_site') {
    if (site === 'none') return done(false, L('어느 거점인지 확실하지 않아요. 거점 이름을 함께 말해 주세요', 'Not sure which site. Please include the site name'))
    st.setSite(site)
    return done(true, L(`${SITE_META[site].name}(으)로 이동했어요`, `Moved to ${SITE_META[site].name}`))
  }
  if (action === 'network') {
    st.showNetwork()
    return done(true, L('전국 네트워크를 보여 드려요', 'Showing the national network'))
  }
  if (action === 'follow_story') {
    st.select({ kind: 'story', id: 'story' }, sim.storyPos().site)
    return done(true, L(`택배 ${sim.story.no}의 여정을 따라갑니다`, `Following the journey of parcel ${sim.story.no}`))
  }
  if (action === 'set_speed') {
    const sp = addChip('speed', { x1: '×1', x2: '×2', x4: '×4', x8: '×8' }, 'none')
    if (sp === 'none') return done(false, L('몇 배속인지 확실하지 않아요', 'Not sure which speed'))
    st.setSpeed(SPEED[sp])
    return done(true, L(`시뮬레이션을 ×${SPEED[sp]}로 바꿨어요`, `Simulation set to ×${SPEED[sp]}`))
  }
  if (action === 'live') {
    if (!st.replay.on) return done(true, L('이미 LIVE예요', 'Already LIVE'))
    exitReplay()
    return done(true, L('LIVE로 돌아왔어요', 'Back to LIVE'))
  }
  if (action === 'rewind') {
    const { t0, t1 } = sim.history.range()
    const mins = addChip('minutes_ago', Object.fromEntries(Object.entries(MINUTES).map(([k, m]) => [k, L(`${m}분 전`, `${m} min ago`)])), 'none')
    const ev = addChip('event', EVENT_LABEL, 'none')
    const asked: number | null = mins !== 'none' ? t1 - MINUTES[mins] * 60 : null
    let t = asked
    let what = ''
    // 사건으로 말했으면 그 사건 시각. 분까지 말했으면 그 앞뒤 10분 안의 사건만 본다
    const near = <T extends { t: number }>(list: T[]) => (asked === null ? list : list.filter((e) => Math.abs(e.t - asked) <= 10 * 60))
    if (ev === 'gate') {
      const gate = site !== 'none' && site !== 'TW' ? site : null
      // 정문 앞에서 1분 넘게 멈춰 기다린 진입만 "막힘"으로 본다. 그중 가장 오래 기다린 때
      const rows = near(sim.gateLog.entries.filter((e) => e.dir === 'in' && e.t >= t0 && e.t <= t1 && (!gate || e.gate === gate) && (e.wait ?? 0) >= 60))
      const pick = rows.sort((a, b) => (b.wait ?? 0) - (a.wait ?? 0))[0]
      if (pick) {
        t = pick.t - (pick.wait ?? 0) / 2
        what = L(`${SITE_META[pick.gate].name} 정문에서 ${pick.vehicle}이(가) ${Math.round((pick.wait ?? 0) / 60)}분 기다리던 때`, `when ${pick.vehicle} waited ${Math.round((pick.wait ?? 0) / 60)} min at the ${SITE_META[pick.gate].name} gate`)
      }
    } else if (ev !== 'none') {
      const list = near(sim.history.events(t0, t1).filter((e) => e.kind === ev && (site === 'none' || ev !== 'report' || sim.reports.some((r) => r.time === e.t && r.site === site))))
      const pick = asked === null ? list[list.length - 1] : list.sort((a, b) => Math.abs(a.t - asked) - Math.abs(b.t - asked))[0]
      if (pick) {
        t = pick.t
        what = pick.label
      }
    }
    if (ev !== 'none' && !what) {
      if (asked === null) return done(false, L(`지난 60분 기록에 ${site !== 'none' ? `${SITE_META[site].name} ` : ''}${EVENT_LABEL[ev]}이(가) 없어요`, `No ${EVENT_LABEL[ev].toLowerCase()}${site !== 'none' ? ` at ${SITE_META[site].name}` : ''} in the last 60 min`))
      what = L(`그 무렵 ${EVENT_LABEL[ev]} 기록은 없어 말씀하신 시각으로`, `no ${EVENT_LABEL[ev].toLowerCase()} around then, so to the time you asked`)
    }
    if (t === null) t = t1 - 15 * 60
    st.setTimeline(true)
    seekReplay(Math.max(t0, t), false)
    if (site !== 'none') st.setSite(site)
    const ago = Math.round((t1 - Math.max(t0, t)) / 60)
    return done(true, L(`${ago}분 전으로 되감았어요${what ? ` · ${what}` : ''}. 아래 막대에서 재생하거나 LIVE로 돌아갈 수 있어요`, `Rewound ${ago} min${what ? ` · ${what}` : ''}. Play from the bar below or go back to LIVE`))
  }
  if (action === 'find_forklift') {
    const cond = addChip('forklift', FORK_LABEL, 'any')
    let list = sim.forklifts.filter((f) => site === 'none' || f.site === site)
    if (cond === 'low_battery') list = list.filter((f) => f.battery < 35)
    if (cond === 'working') list = list.filter((f) => ['toJob', 'unloading', 'loading', 'putaway'].includes(f.status))
    if (cond === 'idle') list = list.filter((f) => f.status === 'idle' || f.status === 'parking')
    list.sort((x, y) => x.battery - y.battery)
    const matches = list.map((f) => ({ sel: { kind: 'forklift' as const, id: f.id }, site: f.site as SiteId, title: f.id, sub: L(`${SITE_META[f.site].code} · 배터리 ${Math.round(f.battery)}%`, `${SITE_META[f.site].code} · Battery ${Math.round(f.battery)}%`) }))
    if (!matches.length) return done(true, L('조건에 맞는 지게차가 지금은 없어요', 'No forklifts match right now'))
    st.select(matches[0].sel, matches[0].site)
    return done(true, L(`지게차 ${matches.length}대를 찾았어요`, `Found ${matches.length} ${plural(matches.length, 'forklift')}`), matches)
  }
  if (action === 'find_vehicle') {
    const kind = addChip('vehicle_kind', KIND_LABEL, 'any')
    const status = addChip('vehicle_status', STATUS_LABEL, 'any')
    const rank = addChip('rank', RANK_LABEL, 'none')
    const filter = (useStatus: boolean) =>
      sim.vehicles.filter((v) => v.visible
        && (kind === 'any' || v.kind === kind)
        && (!useStatus || status === 'any' || statusMatch(v, status))
        && (site === 'none' || v.site === site || v.dest === site))
    let list = filter(true)
    let relaxed = false
    if (!list.length && status !== 'any') {
      list = filter(false)
      relaxed = true
    }
    if (rank === 'latest') list.sort((x, y) => (vehicleEta(y)?.min ?? -1) - (vehicleEta(x)?.min ?? -1))
    else if (rank === 'most_cargo') list.sort((x, y) => cargoAmount(y) - cargoAmount(x))
    const matches = list.map((v) => {
      const eta = vehicleEta(v)
      return { sel: { kind: 'vehicle' as const, id: v.id }, site: v.site, title: v.id, sub: `${SITE_META[v.site].code} · ${eta ? L(`${eta.min}분`, `${eta.min} min`) : L('작업 중', 'Working')}` }
    })
    if (!matches.length) return done(true, L('조건에 맞는 차량이 지금은 없어요', 'No vehicles match right now'))
    st.select(matches[0].sel, matches[0].site)
    const head = rank !== 'none'
      ? L(`${matches[0].title}이(가) ${RANK_LABEL[rank].replace(' 순', '')} 차량이에요`, rank === 'latest' ? `${matches[0].title} is the latest vehicle` : `${matches[0].title} carries the most cargo`)
      : L(`차량 ${matches.length}대를 찾았어요`, `Found ${matches.length} ${plural(matches.length, 'vehicle')}`)
    return done(true, relaxed ? L(`${STATUS_LABEL[status]} 차량은 없어서 조건을 넓혔어요. ${head}`, `No vehicles ${STATUS_LABEL[status].toLowerCase()}, so I widened the search. ${head}`) : head, matches)
  }
  return done(false, L('아직 지원하지 않는 명령이에요', 'That command is not supported yet'))
}
