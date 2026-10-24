// Vercel 서버리스 함수: 정적으로 배포한 화면에서도 /api/ai/*를 쓸 수 있게 한다.
// 개발·미리보기 서버가 쓰는 미들웨어(server/http.ts)를 그대로 쓰고, 키는 Vercel 환경 변수 ANTHROPIC_API_KEY를 쓴다.
// vercel.json이 /api/ai/<경로> 요청을 이 함수로 보내며 원래 경로를 __path로 넘긴다.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { aiMiddleware, reqLang } from '../server/http.js'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const u = new URL(req.url ?? '/', 'http://localhost')
  const p = u.searchParams.get('__path')
  if (p !== null) req.url = `/api/ai/${p}`
  await aiMiddleware(req, res, () => {
    res.statusCode = 404
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: reqLang(req) === 'ko' ? '알 수 없는 경로' : 'Unknown path' }))
  })
}
