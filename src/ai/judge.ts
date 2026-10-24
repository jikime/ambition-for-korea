// 브라우저 쪽 AI(Claude) 연동. 실제 호출은 /api/ai/* (서버)로만 보낸다.
// 켜져 있지 않거나 호출이 실패하면 모든 판단이 기본 규칙(문 앞 배송·수동 확인·일반 블록 등)으로 바로 처리된다.
// 키는 서버의 ANTHROPIC_API_KEY(.env)에만 있고 브라우저는 키를 모른다. 서버에 키가 있으면 기본으로 켜지고, 상단 AI 스위치로 끌 수 있다.
import { sim, type FieldReport, type MemoPlan, type ReportTriage, type Story, type Vehicle } from '../sim/sim'
import { ai } from '../sim/ai'
import type { Box, ManifestFlags } from '../sim/port'
import type { AddressFlags, HubParcel } from '../sim/hub'
import type { AirShipment } from '../sim/airport'
import { LINK_LABEL, type Incident, type IncidentAnswer } from '../sim/incidents'
import type { Inquiry, InquiryAnswer, ReturnAnswer, ReturnReq } from '../sim/cs'
import { COLD_SPEC, type ColdAnswer, type ColdMessage } from '../sim/cold'
import type { Declaration, HsAnswer } from '../sim/customs'
import { STOP_HINT, type AddrAnswer, type AddrCase } from '../sim/addrfix'
import { ruleNotice, type NoticeAnswer } from '../sim/scenario'
import type { QcAnswer, WhPallet } from '../sim/djwh'
import type { DriverAnswer, DriverMessage } from '../sim/driver'
import type { VesselAnswer, VesselNotice } from '../sim/vessel'
import { useStore } from '../store'
import { L, LANG } from '../i18n'

export const aiStats = {
  calls: 0,
  failures: 0,
  lastMs: 0,
  avgMs: 0,
  lastError: '',
  tokens: 0,
}

// ───────────────────────── 켜기·끄기

/** 이 브라우저에서 끈 적이 있으면 '0'. 없으면 기본으로 켠다 */
const LS_ON = 'hubtrace.ai.on'
/** 예전 판에서 쓰던 값(TypeSafe Jev 키, 브라우저에 넣던 내 키). 이제 쓰지 않으므로 지운다 */
const LS_OLD = ['nuritrack.jev.on', 'nuritrack.jev.key', 'nuritrack.jev.src', 'hubtrace.ai.key']

function lsGet(k: string) {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}

function lsSet(k: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(k)
    else localStorage.setItem(k, v)
  } catch {
    // 저장할 수 없는 환경(사생활 보호 모드 등)이면 이번 화면에서만 쓴다
  }
}

/** AI 연결 상태(화면 표시용) */
export const aiConfig = {
  /** 서버 미들웨어(/api/ai)가 있는가. null이면 아직 확인 중 */
  server: null as boolean | null,
  /** 서버에 Claude API 키(ANTHROPIC_API_KEY)가 설정돼 있는가 */
  configured: false,
  /** 서버가 쓰는 Claude 모델 */
  model: '',
}

/** 서버에 /api/ai가 있는지, 키가 설정됐는지 */
async function fetchStatus() {
  try {
    const ctl = new AbortController()
    const id = setTimeout(() => ctl.abort(), 4000)
    const res = await fetch('/api/ai/status', { signal: ctl.signal, cache: 'no-store' })
    clearTimeout(id)
    const data = res.ok ? await res.json() : null
    aiConfig.server = data?.ok === true
    aiConfig.configured = data?.configured === true
    aiConfig.model = typeof data?.model === 'string' ? data.model : ''
  } catch {
    // 정적 배포처럼 서버 미들웨어가 없으면 AI를 켤 수 없다
    aiConfig.server = false
    aiConfig.configured = false
  }
}

function setOn(on: boolean) {
  ai.on = on
  if (on) connectAi()
  else attachRules()
  useStore.getState().bump()
}

/** 앱 시작: 기본 규칙으로 연결한 뒤, 서버에 키가 있으면 기본으로 켠다(이 브라우저에서 끈 적이 있으면 꺼 둔다) */
export async function initAi() {
  attachRules()
  for (const k of LS_OLD) lsSet(k, null)
  await fetchStatus()
  if (aiConfig.configured && lsGet(LS_ON) !== '0') setOn(true)
  useStore.getState().bump()
}

export type AiSwitchResult = { ok: true } | { ok: false; error: string }

/** 켜기. 서버에 AI가 없거나 키가 설정되지 않았으면 켜지 않는다 */
export async function enableAi(): Promise<AiSwitchResult> {
  if (aiConfig.server === null || !aiConfig.configured) await fetchStatus()
  if (!aiConfig.server) return { ok: false, error: L('이 배포에는 AI 서버(/api/ai)가 없어 켤 수 없습니다. 개발 서버(npm run dev)나 미리보기(npm run preview)에서 쓸 수 있습니다', 'This deployment has no AI server (/api/ai), so AI cannot be turned on. Use the dev server (npm run dev) or preview (npm run preview)') }
  if (!aiConfig.configured) return { ok: false, error: L('서버에 Claude API 키가 없습니다. .env에 ANTHROPIC_API_KEY를 넣고 서버를 다시 시작하세요', 'No Claude API key on the server. Set ANTHROPIC_API_KEY in .env and restart the server') }
  lsSet(LS_ON, '1')
  setOn(true)
  return { ok: true }
}

export function disableAi() {
  lsSet(LS_ON, '0')
  setOn(false)
}

async function post<T>(path: string, body: unknown, timeoutMs = 30000): Promise<T | null> {
  // 꺼져 있으면 부르지 않는다(호출한 쪽이 기본 규칙으로 처리)
  if (!ai.on) return null
  const ctl = new AbortController()
  const id = setTimeout(() => ctl.abort(), timeoutMs)
  const t0 = performance.now()
  try {
    // 서버 오류 문구도 화면 언어로 받는다
    const headers: Record<string, string> = { 'content-type': 'application/json', 'x-lang': LANG }
    const res = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body), signal: ctl.signal })
    const data = await res.json()
    if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
    const ms = performance.now() - t0
    aiStats.calls++
    aiStats.lastMs = ms
    aiStats.avgMs = aiStats.avgMs ? aiStats.avgMs * 0.8 + ms * 0.2 : ms
    if (typeof data?.tokens === 'number') aiStats.tokens += data.tokens
    aiStats.lastError = ''
    return data as T
  } catch (e) {
    aiStats.failures++
    aiStats.lastError = e instanceof Error ? e.message : String(e)
    return null
  } finally {
    clearTimeout(id)
  }
}

// ───────────────────────── 배송 메모

const memoCache = new Map<string, MemoPlan>()

async function interpretMemos(texts: string[]): Promise<(MemoPlan | null)[]> {
  const todo = [...new Set(texts.filter((t) => t && !memoCache.has(t)))]
  if (todo.length) {
    const res = await post<{ answers: MemoPlan[] }>('/api/ai/memos', { memos: todo })
    res?.answers.forEach((a, i) => memoCache.set(todo[i], a))
  }
  return texts.map((t) => (t ? memoCache.get(t) ?? null : null))
}

async function fillVan(v: Vehicle) {
  const entries = Object.entries(v.memos).filter(([, m]) => m.status === 'pending')
  if (!entries.length) return
  const plans = await interpretMemos(entries.map(([, m]) => m.text))
  entries.forEach(([, m], i) => {
    m.plan = plans[i]
    m.status = plans[i] ? 'ready' : 'error'
  })
}

async function fillStory(s: Story) {
  if (!s.memo) {
    s.memoStatus = 'none'
    return
  }
  const [plan] = await interpretMemos([s.memo])
  if (sim.story !== s) return
  s.memoPlan = plan
  s.memoStatus = plan ? 'ready' : 'error'
}

// ───────────────────────── 현장 보고

const queue: FieldReport[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

export function isCritical(t: ReportTriage | null) {
  return !!t && (t.stopWork > 0.6 || t.severity >= 2.5)
}

/** 우선순위는 코드가 정한다: 심각도 + 작업중지 가중 + 최근일수록 약간 가산 */
export function reportPriority(r: FieldReport) {
  if (!r.triage) return r.status === 'pending' ? 1.5 : 0
  const age = Math.max(0, sim.clock - r.time) / 3600
  return r.triage.severity + (r.triage.stopWork > 0.6 ? 2 : 0) - age * 0.5
}

function queueReport(r: FieldReport) {
  queue.push(r)
  if (!flushTimer) flushTimer = setTimeout(flush, 350)
}

async function flush() {
  flushTimer = null
  const batch = queue.splice(0, 8)
  if (!batch.length) return
  const res = await post<{ answers: ReportTriage[] }>('/api/ai/reports', { reports: batch.map((r) => r.text) })
  batch.forEach((r, i) => {
    const t = res?.answers[i] ?? null
    r.triage = t
    r.status = t ? 'ready' : 'error'
    if (t && isCritical(t)) useStore.getState().notify(L(`⚠ ${r.site} 현장 보고 · 즉시 조치 필요: ${r.text}`, `⚠ ${r.site} field report · Act now: ${r.text}`))
  })
  if (queue.length) flushTimer = setTimeout(flush, 200)
}

// ───────────────────────── 적하목록(부산신항)

const manifestQueue: Box[] = []
let manifestTimer: ReturnType<typeof setTimeout> | null = null
const manifestCache = new Map<string, ManifestFlags>()

function queueManifest(b: Box) {
  const m = b.manifest
  if (!m) return
  const key = `${m.declared}|${m.description}`
  const hit = manifestCache.get(key)
  if (hit) {
    m.flags = hit
    m.status = 'ready'
    return
  }
  manifestQueue.push(b)
  if (!manifestTimer) manifestTimer = setTimeout(flushManifests, 120)
}

async function flushManifests() {
  manifestTimer = null
  const batch = manifestQueue.splice(0, 8)
  if (!batch.length) return
  const res = await post<{ answers: ManifestFlags[] }>('/api/ai/manifest', { items: batch.map((b) => ({ declared: b.manifest!.declared, description: b.manifest!.description })) })
  batch.forEach((b, i) => {
    const f = res?.answers[i] ?? null
    const m = b.manifest!
    m.flags = f
    m.status = f ? 'ready' : 'error'
    if (f) manifestCache.set(`${m.declared}|${m.description}`, f)
  })
  if (manifestQueue.length) manifestTimer = setTimeout(flushManifests, 80)
}

// ───────────────────────── 허브 리젝트 송장(곤지암)

const addressQueue: HubParcel[] = []
let addressTimer: ReturnType<typeof setTimeout> | null = null
const addressCache = new Map<string, AddressFlags>()

function queueAddress(p: HubParcel) {
  const r = p.reject
  if (!r) return
  const hit = addressCache.get(`${r.label}|${r.item}`)
  if (hit) {
    p.ai = hit
    p.aiStatus = 'ready'
    return
  }
  addressQueue.push(p)
  if (!addressTimer) addressTimer = setTimeout(flushAddresses, 120)
}

async function flushAddresses() {
  addressTimer = null
  const batch = addressQueue.splice(0, 8)
  if (!batch.length) return
  const res = await post<{ answers: AddressFlags[] }>('/api/ai/address', { items: batch.map((p) => ({ label: p.reject!.label, item: p.reject!.item })) })
  batch.forEach((p, i) => {
    const a = res?.answers[i] ?? null
    p.ai = a
    p.aiStatus = a ? 'ready' : 'error'
    if (a) addressCache.set(`${p.reject!.label}|${p.reject!.item}`, a)
  })
  if (addressQueue.length) addressTimer = setTimeout(flushAddresses, 80)
}

// ───────────────────────── 항공 수출 화물 위험물 사전 검사(적하목록과 같은 질문을 쓴다)

const airQueue: AirShipment[] = []
let airTimer: ReturnType<typeof setTimeout> | null = null

function queueAir(sh: AirShipment) {
  const hit = manifestCache.get(`${sh.declared}|${sh.description}`)
  if (hit) {
    sim.airport.resolve(sh, hit)
    return
  }
  airQueue.push(sh)
  if (!airTimer) airTimer = setTimeout(flushAir, 150)
}

async function flushAir() {
  airTimer = null
  const batch = airQueue.splice(0, 8)
  if (!batch.length) return
  const res = await post<{ answers: ManifestFlags[] }>('/api/ai/manifest', { items: batch.map((b) => ({ declared: b.declared, description: b.description })) })
  batch.forEach((b, i) => {
    const f = res?.answers[i] ?? null
    if (f) manifestCache.set(`${b.declared}|${b.description}`, f)
    sim.airport.resolve(b, f)
  })
  if (airQueue.length) airTimer = setTimeout(flushAir, 100)
}

// ───────────────────────── 돌발 상황(교통·기상·현장 공지)

async function readIncident(i: Incident) {
  const res = await post<{ answer: IncidentAnswer }>('/api/ai/incident', { text: i.text })
  sim.resolveIncident(i, res?.answer ?? null)
  if (i.state === 'active' && i.applied && i.applied.impact >= 1.5) useStore.getState().notify(`⚠ ${LINK_LABEL[i.applied.link]} · ${i.decision}`)
  if (i.state === 'confirm') useStore.getState().notify(L(`돌발 상황 확인 필요: ${i.text}`, `Incident needs review: ${i.text}`))
}

// ───────────────────────── 고객 문의 · 반품 사유

const inquiryQueue: Inquiry[] = []
let inquiryTimer: ReturnType<typeof setTimeout> | null = null

function queueInquiry(q: Inquiry) {
  inquiryQueue.push(q)
  if (!inquiryTimer) inquiryTimer = setTimeout(flushInquiries, 80)
}

async function flushInquiries() {
  inquiryTimer = null
  const batch = inquiryQueue.splice(0, 8)
  if (!batch.length) return
  const res = await post<{ answers: InquiryAnswer[] }>('/api/ai/inquiry', { messages: batch.map((q) => q.text) })
  batch.forEach((q, i) => {
    sim.cs.resolveInquiry(q, res?.answers[i] ?? null)
    if (q.human && q.intent === 'complaint') useStore.getState().notify(L(`☎ 고객 민원 · 상담원 연결: “${q.text}”`, `☎ Customer complaint · Handed to an agent: “${q.text}”`))
  })
  if (inquiryQueue.length) inquiryTimer = setTimeout(flushInquiries, 60)
}

const returnQueue: ReturnReq[] = []
let returnTimer: ReturnType<typeof setTimeout> | null = null

function queueReturn(r: ReturnReq) {
  returnQueue.push(r)
  if (!returnTimer) returnTimer = setTimeout(flushReturns, 100)
}

async function flushReturns() {
  returnTimer = null
  const batch = returnQueue.splice(0, 8)
  if (!batch.length) return
  const res = await post<{ answers: ReturnAnswer[] }>('/api/ai/return', { texts: batch.map((r) => r.text) })
  batch.forEach((r, i) => sim.cs.resolveReturn(r, res?.answers[i] ?? null))
  if (returnQueue.length) returnTimer = setTimeout(flushReturns, 80)
}

// ───────────────────────── 냉동탑차 메시지

async function readCold(m: ColdMessage) {
  const st = sim.cold.reefers.get(m.vehicle)
  const spec = COLD_SPEC[st?.mode ?? 'frozen']
  const res = await post<{ answers: ColdAnswer[] }>('/api/ai/cold', { items: [{ message: m.text, mode: st?.mode ?? 'frozen', setpoint: spec.set, current: st?.temp ?? m.temp, limit: spec.critical }] })
  sim.cold.resolve(m, res?.answers[0] ?? null)
  if (m.action === 'recool') useStore.getState().notify(L(`❄ ${m.vehicle} 냉동기 이상 · ${m.note} → 도착 즉시 재냉각·검수`, `❄ ${m.vehicle} refrigeration fault · ${m.note} → Re-cool and inspect on arrival`))
}

// ───────────────────────── 수입 신고 HS 분류

const hsQueue: Declaration[] = []
let hsTimer: ReturnType<typeof setTimeout> | null = null
const hsCache = new Map<string, HsAnswer>()

function queueHs(d: Declaration) {
  const hit = hsCache.get(`${d.declared}|${d.description}`)
  if (hit) {
    sim.customs.resolve(d, hit)
    return
  }
  hsQueue.push(d)
  if (!hsTimer) hsTimer = setTimeout(flushHs, 120)
}

async function flushHs() {
  hsTimer = null
  const batch = hsQueue.splice(0, 8)
  if (!batch.length) return
  const res = await post<{ answers: HsAnswer[] }>('/api/ai/hs', { items: batch.map((d) => ({ declared: d.declared, description: d.description })) })
  batch.forEach((d, i) => {
    const a = res?.answers[i] ?? null
    if (a) hsCache.set(`${d.declared}|${d.description}`, a)
    sim.customs.resolve(d, a)
  })
  if (hsQueue.length) hsTimer = setTimeout(flushHs, 80)
}

// ───────────────────────── 주소 정정

const addrQueue: AddrCase[] = []
let addrTimer: ReturnType<typeof setTimeout> | null = null

function queueAddrFix(c: AddrCase) {
  addrQueue.push(c)
  if (!addrTimer) addrTimer = setTimeout(flushAddrFix, 100)
}

async function flushAddrFix() {
  addrTimer = null
  const batch = addrQueue.splice(0, 8)
  if (!batch.length) return
  const res = await post<{ answers: AddrAnswer[] }>('/api/ai/addrfix', { items: batch.map((c) => ({ label: c.label, candidates: c.candidates.map((x) => ({ id: x.id, desc: STOP_HINT[x.id] })) })) })
  batch.forEach((c, i) => sim.addr.resolve(c, res?.answers[i] ?? null))
  if (addrQueue.length) addrTimer = setTimeout(flushAddrFix, 80)
}

// ───────────────────────── 물량 공지(명절 시나리오)

/** 공지 판독: AI가 켜져 있으면 AI, 아니면(또는 실패하면) 낱말 규칙 */
export async function readNotice(text: string): Promise<{ answer: NoticeAnswer; by: 'ai' | 'rule'; ms: number }> {
  const t0 = performance.now()
  const res = await post<{ answer: NoticeAnswer }>('/api/ai/notice', { text })
  return res ? { answer: res.answer, by: 'ai', ms: performance.now() - t0 } : { answer: ruleNotice(text), by: 'rule', ms: 0 }
}

// ───────────────────────── 대전 입고 검수 메모

const qcQueue: WhPallet[] = []
let qcTimer: ReturnType<typeof setTimeout> | null = null

function queueQc(p: WhPallet) {
  qcQueue.push(p)
  if (!qcTimer) qcTimer = setTimeout(flushQc, 60)
}

async function flushQc() {
  qcTimer = null
  const batch = qcQueue.splice(0, 8)
  if (!batch.length) return
  const res = await post<{ answers: QcAnswer[] }>('/api/ai/qc', { notes: batch.map((p) => p.note) })
  batch.forEach((p, i) => sim.djwh.resolveQc(p, res?.answers[i] ?? null))
  if (qcQueue.length) qcTimer = setTimeout(flushQc, 60)
}

// ───────────────────────── ⑮ 기사 메시지

const driverQueue: DriverMessage[] = []
let driverTimer: ReturnType<typeof setTimeout> | null = null

function queueDriver(m: DriverMessage) {
  driverQueue.push(m)
  if (!driverTimer) driverTimer = setTimeout(flushDriver, 60)
}

async function flushDriver() {
  driverTimer = null
  const batch = driverQueue.splice(0, 6)
  if (!batch.length) return
  const res = await post<{ answers: DriverAnswer[] }>('/api/ai/driver', { messages: batch.map((m) => m.text) })
  batch.forEach((m, i) => sim.driver.resolve(m, res?.answers[i] ?? null))
  if (driverQueue.length) driverTimer = setTimeout(flushDriver, 60)
}

// ───────────────────────── ⑯ 선사 지연 통보

async function readVessel(n: VesselNotice) {
  const res = await post<{ answers: VesselAnswer[] }>('/api/ai/vessel', { notices: [n.text] })
  sim.vessel.resolve(n, res?.answers[0] ?? null)
}

/** AI를 끈 상태: 판단을 기다리지 않고 기본 규칙으로 바로 처리한다. 이미 기다리던 항목도 정리한다 */
function attachRules() {
  const memosOff = (v: Vehicle) => {
    for (const m of Object.values(v.memos)) if (m.status === 'pending') m.status = 'error'
  }
  sim.port.onManifest = (b) => {
    if (b.manifest) b.manifest.status = 'error'
  }
  sim.hub.onReject = null
  sim.airport.onScreen = (sh) => sim.airport.resolve(sh, null)
  sim.onIncident = null
  sim.onVanDepart = memosOff
  sim.onStory = (s) => {
    if (s.memoStatus === 'pending') s.memoStatus = 'error'
  }
  sim.onReport = (r) => {
    if (r.status === 'pending') r.status = 'error'
  }
  sim.cs.onInquiry = null
  sim.cs.onReturn = null
  sim.cold.onMessage = null
  sim.customs.onDeclare = null
  sim.addr.onCase = null
  sim.djwh.onQc = null
  for (const p of sim.djwh.pallets.values()) if (p.qc === 'reading') sim.djwh.resolveQc(p, null)
  sim.driver.onMessage = null
  sim.vessel.onNotice = null
  for (const n of sim.vessel.notices) if (n.status === 'reading') sim.vessel.resolve(n, null)
  for (const m of sim.driver.messages) if (m.status === 'reading') sim.driver.resolve(m, null)
  for (const c of sim.addr.list) if (c.status === 'pending') sim.addr.resolve(c, null)
  for (const d of sim.customs.list) if (d.status === 'pending') sim.customs.resolve(d, null)
  for (const m of sim.cold.messages) if (m.status === 'pending') sim.cold.resolve(m, null)
  for (const q of sim.cs.inquiries) if (q.status === 'pending') sim.cs.resolveInquiry(q, null)
  for (const r of sim.cs.returns) if (r.status === 'pending') sim.cs.resolveReturn(r, null)
  for (const v of sim.vehicles) memosOff(v)
  if (sim.story.memoStatus === 'pending') sim.story.memoStatus = 'error'
  for (const r of sim.reports) if (r.status === 'pending') r.status = 'error'
  for (const b of [...sim.port.ship.flat(), ...sim.port.agvs.map((a) => a.box)]) if (b?.manifest) sim.port.screen(b)
  for (const sh of sim.airport.shipments) if (sh.status === 'pending' && !sh.sent) sim.airport.screen(sh)
}

/** 시뮬레이션 훅에 AI를 연결하고, 연결 전에 쌓인 항목도 채운다 */
function connectAi() {
  sim.port.onManifest = (b) => queueManifest(b)
  for (const b of [...sim.port.ship.flat(), ...sim.port.agvs.map((a) => a.box)]) if (b?.manifest) sim.port.screen(b)
  sim.hub.onReject = (p) => queueAddress(p)
  sim.airport.onScreen = (sh) => queueAir(sh)
  for (const sh of sim.airport.shipments) if (sh.status === 'pending' && !sh.sent) sim.airport.screen(sh)
  sim.onIncident = (i) => void readIncident(i)
  sim.incidents.filter((i) => i.state === 'confirm' && i.status === 'error' && !i.ai).forEach((i) => { i.state = 'reading'; i.status = 'pending'; void readIncident(i) })
  for (const p of sim.hub.parcels) if (p.scanned && p.reject) sim.hub.screen(p)
  sim.onVanDepart = (v) => void fillVan(v)
  sim.onStory = (s) => void fillStory(s)
  sim.onReport = (r) => queueReport(r)
  sim.cs.onInquiry = (q) => queueInquiry(q)
  sim.cs.onReturn = (r) => queueReturn(r)
  sim.cold.onMessage = (m) => void readCold(m)
  sim.customs.onDeclare = (d) => queueHs(d)
  sim.addr.onCase = (c) => queueAddrFix(c)
  sim.djwh.onQc = (p) => queueQc(p)
  sim.driver.onMessage = (m) => queueDriver(m)
  sim.vessel.onNotice = (n) => void readVessel(n)
  for (const v of sim.vehicles) if (v.home === 'IN') void fillVan(v)
  if (sim.story.memoStatus === 'pending') void fillStory(sim.story)
  sim.reports.filter((r) => r.status === 'pending').forEach(queueReport)
}

export { post as aiPost }
