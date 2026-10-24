// 도로변 대형 광고판 이미지(가상 브랜드). 1024×427(12m×5m 비율) 캔버스로 그린다.
import { canvasTex, fillFit, fitLines } from './textures'
import { L, LL } from '../i18n'

/** 큰 문구 여러 줄: 같은 크기로(넘치면 함께 줄인다) */
function big(ctx: CanvasRenderingContext2D, lines: string[], x: number, ys: number[], maxW: number, weight: number, px: number) {
  fitLines(ctx, lines, maxW, weight, px)
  lines.forEach((t, i) => ctx.fillText(t, x, ys[i]))
}

type Ad = (ctx: CanvasRenderingContext2D, w: number, h: number) => void

function plane(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(-60, 0)
  ctx.quadraticCurveTo(-50, -10, 40, -8)
  ctx.quadraticCurveTo(64, -4, 66, 0)
  ctx.quadraticCurveTo(64, 4, 40, 8)
  ctx.quadraticCurveTo(-50, 10, -60, 0)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(4, -6); ctx.lineTo(-22, -46); ctx.lineTo(-10, -46); ctx.lineTo(26, -6); ctx.fill()
  ctx.beginPath()
  ctx.moveTo(4, 6); ctx.lineTo(-22, 46); ctx.lineTo(-10, 46); ctx.lineTo(26, 6); ctx.fill()
  ctx.beginPath()
  ctx.moveTo(-50, -2); ctx.lineTo(-62, -22); ctx.lineTo(-54, -22); ctx.lineTo(-40, -2); ctx.fill()
  ctx.restore()
}

const ADS: Record<string, Ad> = {
  dawn: (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h)
    g.addColorStop(0, '#2F55E6')
    g.addColorStop(1, '#1E3BB3')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.beginPath(); ctx.arc(w * 0.82, h * 0.5, 170, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#FFD25E'
    ctx.beginPath(); ctx.arc(w * 0.82, h * 0.5, 92, Math.PI, 0); ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    fillFit(ctx, L('다온마켓 새벽배송', 'Daon Market Dawn Delivery'), 60, 120, 600, 800, 52)
    big(ctx, LL(['밤 11시 주문,', '아침 7시 문 앞'], ['Order by 11 pm,', 'doorstep by 7 am']), 60, [236, 340], 600, 900, 92)
  },
  air: (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#7CC3EA')
    g.addColorStop(1, '#D9EEF9')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    plane(ctx, w * 0.74, h * 0.42, 2.6, '#FFFFFF')
    ctx.fillStyle = '#0B4F8A'
    fillFit(ctx, L('다온항공 카고', 'Daon Air Cargo'), 56, 110, 600, 800, 46)
    fillFit(ctx, L('인천에서 세계로', 'To the world'), 56, 222, 600, 900, 84)
    fillFit(ctx, L('해외 특송 48시간', 'Overseas express 48 h'), 56, 320, 600, 700, 54)
    ctx.fillStyle = '#E2463C'
    ctx.fillRect(56, 356, 120, 10)
  },
  tv: (ctx, w, h) => {
    ctx.fillStyle = '#0D1020'
    ctx.fillRect(0, 0, w, h)
    const g = ctx.createLinearGradient(w * 0.5, 0, w, h)
    g.addColorStop(0, '#7A3CFF')
    g.addColorStop(1, '#FF5E8A')
    ctx.fillStyle = g
    ctx.fillRect(w * 0.55, 70, w * 0.38, h - 140)
    ctx.fillStyle = '#FFFFFF'
    fillFit(ctx, L('한빛전자', 'Hanbit Electronics'), 60, 110, 480, 700, 40)
    big(ctx, LL(['더 얇게,', '더 선명하게'], ['Thinner,', 'sharper']), 60, [230, 332], 480, 900, 88)
    ctx.fillStyle = '#B7BEDA'
    fillFit(ctx, L('OLED evo 시리즈', 'OLED evo series'), 64, 386, 480, 600, 30)
  },
  milk: (ctx, w, h) => {
    ctx.fillStyle = '#E9F6E4'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#2E8B57'
    ctx.beginPath()
    ctx.moveTo(0, h * 0.78)
    for (let x = 0; x <= w; x += 32) ctx.lineTo(x, h * 0.78 - Math.sin(x / 130) * 26)
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    ctx.strokeStyle = '#2E8B57'
    ctx.lineWidth = 6
    ctx.beginPath(); ctx.roundRect(w * 0.74, 60, 150, 250, 18); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#2E8B57'
    // 우유갑 글자: 영어는 길어서 갑 가운데에 맞춘다
    ctx.textAlign = LL<CanvasTextAlign>('start', 'center')
    fillFit(ctx, L('우유', 'MILK'), LL(w * 0.74 + 34, w * 0.74 + 75), 200, 130, 900, 40)
    ctx.textAlign = 'start'
    fillFit(ctx, L('초록목장', 'Chorok Farm'), 60, 110, 680, 800, 46)
    big(ctx, LL(['아침을 깨우는', '1등급 원유'], ['Wake up to', 'Grade A milk']), 60, [220, 318], 680, 900, 86)
  },
  app: (ctx, w, h) => {
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#FF6B3D'
    ctx.fillRect(0, 0, 18, h)
    ctx.fillStyle = '#1A1F2B'
    fillFit(ctx, L('다온택배 앱', 'Daon Parcel app'), 60, 104, 740, 800, 44)
    fillFit(ctx, L('내 택배 지금 어디?', "Where's my parcel?"), 60, 214, 740, 900, 84)
    ctx.fillStyle = '#2F55E6'
    fillFit(ctx, L('실시간 위치 · 도착 알림', 'Live location · Arrival alerts'), 60, 310, 740, 700, 48)
    ctx.fillStyle = '#1A1F2B'
    ctx.beginPath(); ctx.roundRect(w * 0.8, 50, 150, 310, 22); ctx.fill()
    ctx.fillStyle = '#EEF1F8'
    ctx.beginPath(); ctx.roundRect(w * 0.8 + 12, 72, 126, 266, 12); ctx.fill()
    ctx.fillStyle = '#FF6B3D'
    ctx.beginPath(); ctx.arc(w * 0.8 + 75, 190, 18, 0, Math.PI * 2); ctx.fill()
  },
  travel: (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#FFB27E')
    g.addColorStop(1, '#F06A4A')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#7B2E2A'
    ctx.beginPath()
    ctx.moveTo(w * 0.5, h)
    ctx.lineTo(w * 0.68, h * 0.35); ctx.lineTo(w * 0.78, h * 0.55); ctx.lineTo(w * 0.88, h * 0.25); ctx.lineTo(w, h * 0.6); ctx.lineTo(w, h)
    ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    fillFit(ctx, L('강원 사계절 여행', 'Gangwon, all four seasons'), 60, 110, 760, 800, 46)
    big(ctx, LL(['주말엔,', '강원도'], ['Weekends,', 'in Gangwon']), 60, [228, 336], 500, 900, 92)
  },
  sale: (ctx, w, h) => {
    ctx.fillStyle = '#FFD84D'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#1A1F2B'
    fillFit(ctx, L('다온마켓 빅세일', 'Daon Market Big Sale'), 60, 112, 900, 800, 48)
    fillFit(ctx, L('최대 70%', 'Up to 70%'), 52, 290, 900, 900, 150)
    fillFit(ctx, L('오늘 주문 · 내일 도착', 'Order today · Arrives tomorrow'), 62, 372, 900, 700, 40)
  },
}

export const AD_KEYS = Object.keys(ADS)

export function adTex(key: string) {
  return canvasTex(`ad-${key}`, 1024, 427, (ctx, w, h) => {
    ctx.textBaseline = 'alphabetic'
    ADS[key](ctx, w, h)
  })
}
