// 사람·로봇 목록과 상세(화면용). 시뮬레이션의 사람(거리의 사람들·대전 창고·이천 피킹 작업자)과 로봇(이천 AMR·대전 장비·
// 부산 AGV·다온마을 배송 로봇·드론)을 한 모양으로 정리한다. 이름·근무 시간은 가상이다.
import { sim } from '../sim/sim'
import type { Mover } from '../sim/life'
import { IC, IN, BS } from '../sim/sites'
import * as LY from '../sim/layout'
import { AP } from '../sim/airport'
import { DJ } from '../sim/daejeon'
import type { SiteId } from '../sim/world'
import type { Selection } from '../store'
import type { Tone } from './format'
import { SPEEDUP } from '../sim/clock'
import { L, LL } from '../i18n'

const NAMES = LL(
  ['김도윤', '이서연', '박지호', '최하은', '정민준', '강예린', '조현우', '윤소율', '장시우', '임다은', '한준서', '오채원', '서건우', '신유나', '권도현', '황수아', '송태민', '안지유', '홍재원', '유하린', '전민호', '고은서', '문지훈', '배서윤', '백승현', '허지아', '남궁현', '노예준', '하윤아', '곽도영', '성민지', '차우진'],
  ['Kim Do-yun', 'Lee Seo-yeon', 'Park Ji-ho', 'Choi Ha-eun', 'Jung Min-jun', 'Kang Ye-rin', 'Cho Hyeon-u', 'Yoon So-yul', 'Jang Si-u', 'Lim Da-eun', 'Han Jun-seo', 'Oh Chae-won', 'Seo Geon-u', 'Shin Yu-na', 'Kwon Do-hyeon', 'Hwang Su-a', 'Song Tae-min', 'Ahn Ji-yu', 'Hong Jae-won', 'Yoo Ha-rin', 'Jeon Min-ho', 'Ko Eun-seo', 'Moon Ji-hun', 'Bae Seo-yun', 'Baek Seung-hyeon', 'Heo Ji-a', 'Namgung Hyeon', 'Noh Ye-jun', 'Ha Yun-a', 'Kwak Do-yeong', 'Sung Min-ji', 'Cha U-jin'],
)

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** 위치로 거점 판정(지도 위 사각형). 어디에도 안 들면 null(간선도로 등) */
export function siteAt(x: number, z: number): SiteId | null {
  const inR = (r: { x0: number; x1: number; z0: number; z1: number }, pad = 4) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad
  if (inR(DJ.site, 2)) return 'DJ'
  if (inR(IC.site)) return 'IC'
  if (inR(LY.SITE)) return 'GJ'
  if (inR(IN.site)) return 'IN'
  if (x > -575 && x < -360 && z > 52 && z < 275) return 'TW'
  if (inR(BS.site, 20)) return 'BS'
  if (inR(AP.site, 20)) return 'AP'
  return null
}

// 역할 이름(sim/life·djwh가 정한 표시 문구)으로 근무자인지 가린다. 영어 역할 이름도 읽는다
const WORKER = /작업자|조업원|검수|보안|경비|래싱|피킹|도크|승무원|직원|집배원|배달|퀵|기사|\b(worker|inspector|security|guard|lashing|picker|dock|crew|clerk|staff|postal|mail|courier|rider|quick|driver|handler|agent|operator|sorter)\b/i

/** 대전 장비 작업(djwh가 정한 표시 문구)이 '대기'인지. 영어 문구(Idle·Waiting)도 읽는다 */
export const idleTask = (t?: string) => t === '대기' || /^(idle|waiting|wait)$/i.test(t ?? '')

export interface PersonInfo {
  sel: Selection
  id: string
  name: string
  role: string
  site: SiteId | null
  doing: string
  shift: string
  zone: string
  rate: string
  tone: Tone
  kind: Mover['kind']
}

export function personInfo(m: Mover): PersonInfo {
  const site = siteAt(m.x, m.z)
  const h = hash(m.id)
  const worker = WORKER.test(m.role)
  let name = NAMES[h % NAMES.length]
  let doing = m.moving ? m.label || L('이동 중', 'Moving') : m.pause > 0 ? L('잠시 멈춤', 'Paused') : worker ? L('작업 중', 'Working') : L('쉬는 중', 'Resting')
  let shift = worker ? (h % 3 === 0 ? '14:00 ~ 22:30' : '06:00 ~ 14:30') : '-'
  let zone = site ? zoneName(site, m) : L('간선도로', 'Highway')
  let rate = '-'
  // 대전 창고 사람(검수원·도크 작업자)
  const w = sim.djwh.people.find((p) => p.id === m.id)
  if (w) {
    name = w.name
    doing = w.doing
    shift = w.shift
    zone = w.zone
    const r = sim.djwh.rate(w.done)
    rate = r ? L(`${r} 파렛트/시`, `${r} pallets/h`) : '-'
  }
  // 이천 피킹 작업자: 로봇이 포드를 갖다 놓으면 피킹한다
  if (m.id.startsWith('pk-')) {
    const k = Number(m.id.slice(3)) - 1
    const rb = sim.robots.find((r) => r.state === 'atStation' && r.station === k)
    doing = rb ? L(`피킹 중 · ${podName(rb.pod)}`, `Picking · ${podName(rb.pod)}`) : L('다음 포드 기다림', 'Waiting for next pod')
    shift = k % 2 ? '14:00 ~ 22:30' : '06:00 ~ 14:30'
    zone = L(`피킹 스테이션 ${k + 1}`, `Picking station ${k + 1}`)
    const h2 = (sim.elapsed * SPEEDUP) / 3600 + 4
    rate = L(`${Math.round(sim.stationPicks[k] / h2)} 개/시`, `${Math.round(sim.stationPicks[k] / h2)} items/h`)
  }
  const tone: Tone = /멈춤|쉬는|기다림|대기|paused|resting|waiting|idle|\bwait\b/i.test(doing) ? 'gray' : m.kind === 'person' ? 'green' : 'blue'
  return { sel: { kind: 'mover', id: m.id }, id: m.id, name, role: m.role, site, doing, shift, zone, rate, tone, kind: m.kind }
}

function zoneName(site: SiteId, m: Mover) {
  if (site === 'TW') return m.z < 120 ? L('다온마을 입구·상가', 'Daon Village entrance · shops') : m.x < -470 ? L('다온마을 단지 서쪽', 'Daon Village west blocks') : L('다온마을 단지', 'Daon Village complex')
  if (site === 'GJ') return m.z > 15 ? L('곤지암 야드', 'Gonjiam yard') : L('곤지암 허브', 'Gonjiam hub')
  if (site === 'IN') return L('인천 분류장', 'Incheon sort area')
  if (site === 'BS') return m.z > 290 ? L('부산 안벽', 'Busan quay') : L('부산 게이트', 'Busan gate')
  if (site === 'AP') return L('인천공항 램프', 'Incheon Airport ramp')
  if (site === 'IC') return L('이천 피킹', 'Icheon picking')
  return L('대전 허브', 'Daejeon hub')
}

export function peopleAt(site: SiteId | null, all = false) {
  return sim.life.movers
    .filter((m) => m.kind === 'person' || m.kind === 'moto')
    .map(personInfo)
    .filter((p) => all || p.site === site)
}

export const podName = (i: number) => (i >= 0 ? `POD-${String(i + 1).padStart(3, '0')}` : '-')

/** AMR 포드 자리 격자 칸 이름(행 A~ · 열 1~) */
export function podCell(i: number) {
  const p = sim.pods[i]
  if (!p) return '-'
  const A = IC.amr
  const row = Math.round((p.hz - A.z0) / A.step)
  const col = Math.round((p.hx - A.x0) / A.step) + 1
  return `${String.fromCharCode(65 + Math.max(0, Math.min(25, row)))}${col}`
}

export const AMR_STATE: Record<string, string> = {
  toPod: L('포드 가지러 가는 중', 'Going to pod'),
  toStation: L('피킹대로 포드 운반', 'Carrying pod to station'),
  atStation: L('피킹대에 포드 제시', 'Presenting pod at station'),
  return: L('포드 제자리 반납', 'Returning pod'),
  idle: L('대기', 'Idle'),
}

export interface RobotRow {
  sel: Selection
  id: string
  title: string
  sub: string
  status: string
  tone: Tone
  battery: number | null
  site: SiteId | null
}

export function robotsAt(site: SiteId | null, all = false): RobotRow[] {
  const out: RobotRow[] = []
  for (const r of sim.robots) {
    out.push({ sel: { kind: 'robot', id: r.id }, id: r.id, title: r.id, sub: L('상품→작업자 구동 로봇', 'Goods-to-person robot'), status: AMR_STATE[r.state] ?? r.state, tone: r.state === 'idle' ? 'gray' : 'blue', battery: r.battery, site: 'IC' })
  }
  for (const e of sim.djwh.equip) {
    out.push({ sel: { kind: 'equip', id: e.id }, id: e.id, title: e.id, sub: e.kind === 'reach' ? L('리치트럭 · 10.5m', 'Reach truck · 10.5m') : L('카운터밸런스 2.5t', 'Counterbalance 2.5t'), status: e.task, tone: idleTask(e.task) ? 'gray' : 'green', battery: e.battery, site: 'DJ' })
  }
  sim.port.agvs.forEach((a, i) => {
    out.push({ sel: { kind: 'crane', id: `agv-${i}` }, id: a.id, title: a.id, sub: L('부산신항 무인 운반차', 'Busan New Port AGV'), status: a.box ? L('컨테이너 운반', 'Carrying container') : L('대기', 'Idle'), tone: a.box ? 'blue' : 'gray', battery: null, site: 'BS' })
  })
  for (const m of sim.life.movers) {
    if (m.kind !== 'robot' && m.kind !== 'drone') continue
    const site = siteAt(m.x, m.z) ?? 'TW'
    out.push({ sel: { kind: 'mover', id: m.id }, id: m.id, title: m.kind === 'drone' ? L(`드론 ${m.id.slice(2)}`, `Drone ${m.id.slice(2)}`) : L('배송 로봇', 'Delivery robot'), sub: m.role, status: m.moving ? m.label || L('이동 중', 'Moving') : L('정차', 'Stopped'), tone: m.moving ? 'blue' : 'gray', battery: null, site })
  }
  return out.filter((r) => all || r.site === site)
}
