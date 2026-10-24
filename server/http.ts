// /api/ai/* 엔드포인트. Vite 개발·미리보기 서버에 미들웨어로 붙는다.
// 키: 서버 환경 변수 ANTHROPIC_API_KEY(로컬은 프로젝트 루트 .env)만 쓴다. 브라우저에는 키를 보내지 않는다.
import type { IncomingMessage, ServerResponse } from 'node:http'
import Anthropic from '@anthropic-ai/sdk'
import { classifyHs, fixAddresses, readDriverMessages, readVesselNotices, interpretCommand, readNotice, readQcNotes, interpretMemos, readColdMessages, readIncident, readInquiries, readReturns, resortParcels, reviewManifests, triageReports, aiConfigured } from './ai.js'
import { MODEL, serverApiKey } from './claude.js'

/** 오류 문구 언어: 요청 헤더 x-lang(en|ko, 기본 en). 서버라 src/i18n.ts의 화면 언어를 쓰지 않는다 */
export function reqLang(req: IncomingMessage): 'en' | 'ko' {
  const v = req.headers['x-lang']
  return (Array.isArray(v) ? v[0] : v)?.trim().toLowerCase() === 'ko' ? 'ko' : 'en'
}

/** 요청 언어에 맞는 문구(한국어, 영어) */
const say = (req: IncomingMessage, ko: string, en: string) => (reqLang(req) === 'ko' ? ko : en)

function readJson(req: IncomingMessage, limit = 32_000): Promise<any> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > limit) {
        reject(new Error(say(req, '요청이 너무 큽니다', 'Request too large')))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch {
        reject(new Error(say(req, 'JSON 형식 오류', 'Invalid JSON')))
      }
    })
    req.on('error', reject)
  })
}

/** 요청 헤더의 사용자 키(형식만 확인). 없거나 이상하면 null */
/** 오류 문구에 키가 섞여 나가지 않게 가린다 */
function scrub(msg: string) {
  const key = serverApiKey()
  return key ? msg.split(key).join('***') : msg
}

const strings = (v: unknown, max: number, len: number) =>
  Array.isArray(v) ? v.slice(0, max).map((x) => String(x ?? '').slice(0, len)) : []

export async function aiMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const url = req.url ?? ''
  if (!url.startsWith('/api/ai/')) return next()
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  // AI 서버가 있는지와 키가 설정됐는지만 알려 준다(키 값은 보내지 않는다)
  if (url.startsWith('/api/ai/status')) {
    res.end(JSON.stringify({ ok: true, configured: aiConfigured(), model: MODEL }))
    return
  }
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end(JSON.stringify({ error: say(req, 'POST만 지원합니다', 'Only POST is supported') }))
    return
  }
  if (!aiConfigured()) {
    res.statusCode = 503
    res.end(JSON.stringify({ error: say(req, '서버에 Claude API 키가 없습니다. .env(또는 배포 환경 변수)에 ANTHROPIC_API_KEY를 넣고 서버를 다시 시작하세요', 'No Claude API key on the server. Set ANTHROPIC_API_KEY in .env (or the deployment environment) and restart the server'), code: 'no-key' }))
    return
  }
  const t0 = Date.now()
  try {
    const body = await readJson(req)
    const data = await handle(url, body)
    if (data === null) {
      res.statusCode = 404
      res.end(JSON.stringify({ error: say(req, '알 수 없는 경로', 'Unknown path') }))
      return
    }
    res.end(JSON.stringify({ ...(data as object), ms: Date.now() - t0 }))
  } catch (e) {
    const msg = scrub(e instanceof Error ? e.message : String(e))
    // 인증 실패는 키 문제로, 크레딧 부족은 키는 맞지만 충전이 필요하다고, 요청 한도 초과는 잠시 뒤 다시 하라고 알려 준다
    const auth = e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError
    const credit = e instanceof Anthropic.BadRequestError && /credit balance/i.test(msg)
    const limited = e instanceof Anthropic.RateLimitError
    res.statusCode = auth ? 401 : credit ? 402 : limited ? 429 : 502
    res.end(JSON.stringify({
      error: auth
        ? say(req, '서버의 API 키(ANTHROPIC_API_KEY)가 올바르지 않습니다(인증 실패)', 'The server API key (ANTHROPIC_API_KEY) is invalid (authentication failed)')
        : credit
          ? say(req, '키는 맞지만 이 키의 조직에 남은 크레딧이 없습니다. Claude Console(Settings → Billing)에서 충전한 뒤 다시 시도하세요', 'The key is valid, but its organization has no credits left. Top up in the Claude Console (Settings → Billing) and try again')
          : limited
            ? say(req, '요청 한도를 넘었습니다. 잠시 뒤 다시 시도하세요', 'Rate limit reached. Please try again shortly')
            : msg,
      code: auth ? 'bad-key' : credit ? 'no-credit' : limited ? 'rate-limit' : undefined,
    }))
  }
}

/** 경로별 판단. 알 수 없는 경로면 null */
async function handle(url: string, body: any): Promise<unknown> {
  if (url.startsWith('/api/ai/command')) return interpretCommand(String(body.text ?? ''))
  if (url.startsWith('/api/ai/memos')) return { answers: await interpretMemos(strings(body.memos, 12, 300)) }
  if (url.startsWith('/api/ai/reports')) return { answers: await triageReports(strings(body.reports, 8, 400)) }
  if (url.startsWith('/api/ai/address')) {
    const items = Array.isArray(body.items) ? body.items.slice(0, 8).map((x: any) => ({ label: String(x?.label ?? '').slice(0, 200), item: String(x?.item ?? '').slice(0, 120) })) : []
    return { answers: await resortParcels(items) }
  }
  if (url.startsWith('/api/ai/manifest')) {
    const items = Array.isArray(body.items) ? body.items.slice(0, 8).map((x: any) => ({ declared: String(x?.declared ?? '').slice(0, 120), description: String(x?.description ?? '').slice(0, 200) })) : []
    return { answers: await reviewManifests(items) }
  }
  if (url.startsWith('/api/ai/incident')) return { answer: await readIncident(String(body.text ?? '')) }
  if (url.startsWith('/api/ai/inquiry')) return { answers: await readInquiries(strings(body.messages, 8, 200)) }
  if (url.startsWith('/api/ai/return')) return { answers: await readReturns(strings(body.texts, 8, 200)) }
  if (url.startsWith('/api/ai/qc')) return { answers: await readQcNotes(strings(body.notes, 8, 200)) }
  if (url.startsWith('/api/ai/driver')) return { answers: await readDriverMessages(strings(body.messages, 6, 240)) }
  if (url.startsWith('/api/ai/vessel')) return { answers: await readVesselNotices(strings(body.notices, 4, 300)) }
  if (url.startsWith('/api/ai/notice')) return { answer: await readNotice(String(body.text ?? '')) }
  if (url.startsWith('/api/ai/addrfix')) {
    const items = Array.isArray(body.items)
      ? body.items.slice(0, 8).map((x: any) => ({
          label: String(x?.label ?? '').slice(0, 120),
          candidates: (Array.isArray(x?.candidates) ? x.candidates : [])
            .slice(0, 5)
            .map((c: any) => ({ id: String(c?.id ?? ''), desc: String(c?.desc ?? '').slice(0, 120) }))
            .filter((c: { id: string }) => /^[A-Z0-9]{2,6}$/.test(c.id) && c.id !== 'none'),
        }))
      : []
    return { answers: await fixAddresses(items) }
  }
  if (url.startsWith('/api/ai/hs')) {
    const items = Array.isArray(body.items) ? body.items.slice(0, 8).map((x: any) => ({ declared: String(x?.declared ?? '').slice(0, 120), description: String(x?.description ?? '').slice(0, 200) })) : []
    return { answers: await classifyHs(items) }
  }
  if (url.startsWith('/api/ai/cold')) {
    const items = Array.isArray(body.items)
      ? body.items.slice(0, 6).map((x: any) => ({ message: String(x?.message ?? '').slice(0, 200), mode: x?.mode === 'frozen' ? 'frozen' : 'chilled', setpoint: Number(x?.setpoint) || 0, current: Number(x?.current) || 0, limit: Number(x?.limit) || 0 }))
      : []
    return { answers: await readColdMessages(items) }
  }
  return null
}
