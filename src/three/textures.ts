import * as THREE from 'three'
import { CARRIERS, type CarrierKey } from '../sim/data'
import { L, isEn } from '../i18n'

export const FONT = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", system-ui, sans-serif'

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void
const registry: { tex: THREE.CanvasTexture; draw: Draw; canvas: HTMLCanvasElement }[] = []
const cache = new Map<string, THREE.CanvasTexture>()

interface TexOpts {
  repeat?: [number, number]
  linear?: boolean
}

/** Canvas로 그린 텍스처. 폰트가 늦게 로드되면 다시 그린다. */
export function canvasTex(key: string, w: number, h: number, draw: Draw, o: TexOpts = {}) {
  const hit = cache.get(key)
  if (hit) return hit
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  draw(ctx, w, h)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = o.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace
  tex.anisotropy = 8
  if (o.repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(o.repeat[0], o.repeat[1])
  }
  registry.push({ tex, draw, canvas })
  cache.set(key, tex)
  return tex
}

if (typeof document !== 'undefined' && document.fonts) {
  Promise.all([
    document.fonts.load(`800 48px "Pretendard Variable"`),
    document.fonts.load(`600 48px "Pretendard Variable"`),
  ])
    .then(() => document.fonts.ready)
    .then(() => {
      for (const r of registry) {
        const ctx = r.canvas.getContext('2d')!
        ctx.clearRect(0, 0, r.canvas.width, r.canvas.height)
        r.draw(ctx, r.canvas.width, r.canvas.height)
        r.tex.needsUpdate = true
      }
    })
    .catch(() => {})
}

const font = (weight: number, px: number) => `${weight} ${px}px ${FONT}`

/** maxW 안에 들어가는 가장 큰 글자 크기(px에서 2씩 줄인다). ctx.font도 그 크기로 맞춘다 */
function fitSize(ctx: CanvasRenderingContext2D, text: string, maxW: number, weight: number, px: number) {
  let size = px
  ctx.font = font(weight, size)
  while (ctx.measureText(text).width > maxW && size > 10) {
    size -= 2
    ctx.font = font(weight, size)
  }
  return size
}

/** 두 줄로 나누기: 글자에 '\n'이 있으면 거기서, 없으면 두 줄 중 긴 쪽이 가장 짧아지는 띄어쓰기에서 자른다(' · '에서 자르면 점은 뺀다). 한쪽이 두 글자 이하면 나누지 않는다 */
function splitTwo(ctx: CanvasRenderingContext2D, text: string, weight: number, px: number): [string, string] | null {
  const nl = text.indexOf('\n')
  if (nl >= 0) return [text.slice(0, nl), text.slice(nl + 1)]
  const words = text.split(' ')
  ctx.font = font(weight, px)
  let best: [string, string] | null = null
  let bestW = Infinity
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ').replace(/\s*·$/, '')
    const b = words.slice(i).join(' ').replace(/^·\s*/, '')
    if (a.length <= 2 || b.length <= 2) continue
    const m = Math.max(ctx.measureText(a).width, ctx.measureText(b).width)
    if (m < bestW) {
      bestW = m
      best = [a, b]
    }
  }
  return best
}

/**
 * 글자 한 줄을 칸 폭(maxW)에 맞춰 그린다: 넘치면 글자를 줄인다(들어가면 px 그대로).
 * 영어 화면에서 wrapH(칸 높이)를 주면, 한 줄로 많이 줄어들 때 두 줄이 더 크게 보이면 두 줄로 그린다(y가 두 줄의 가운데, textBaseline 'middle' 기준).
 * 글자 속 '\n'은 두 줄일 때 끊을 자리(한 줄이면 띄어쓰기).
 * 정렬(textAlign·textBaseline)과 색은 호출한 쪽에서 정한다
 */
export function fillFit(ctx: CanvasRenderingContext2D, raw: string, x: number, y: number, maxW: number, weight: number, px: number, wrapH = 0) {
  const text = raw.replace(/\n/g, ' ')
  const one = fitSize(ctx, text, maxW, weight, px)
  if (isEn && wrapH > 0 && one < px * 0.8) {
    const two = splitTwo(ctx, raw, weight, px)
    if (two) {
      const cap = Math.min(px, Math.floor(wrapH / 2.3))
      const s2 = Math.min(fitSize(ctx, two[0], maxW, weight, cap), fitSize(ctx, two[1], maxW, weight, cap))
      if (s2 > one * 1.1) {
        ctx.font = font(weight, s2)
        const d = s2 * 0.56
        ctx.fillText(two[0], x, y - d)
        ctx.fillText(two[1], x, y + d)
        return
      }
    }
  }
  ctx.font = font(weight, one)
  ctx.fillText(text, x, y)
}

/** 여러 줄을 같은 크기로 맞춘다(가장 긴 줄이 maxW에 들어가는 크기). 광고 문구처럼 줄마다 크기가 달라지면 어색한 곳에 쓴다 */
export function fitLines(ctx: CanvasRenderingContext2D, lines: string[], maxW: number, weight: number, px: number) {
  const size = Math.min(...lines.map((t) => fitSize(ctx, t, maxW, weight, px)))
  ctx.font = font(weight, size)
  return size
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** 회사별 심볼 */
export function drawMark(ctx: CanvasRenderingContext2D, key: CarrierKey, cx: number, cy: number, s: number, color?: string) {
  const c = CARRIERS[key]
  const col = color ?? c.color
  ctx.save()
  ctx.translate(cx, cy)
  if (key === 'daon') {
    // 육각 큐브
    const r = s / 2
    const pt = (a: number) => [Math.cos(a) * r, Math.sin(a) * r] as const
    const top = [pt(-Math.PI / 2), pt(-Math.PI / 6), [0, 0] as const, pt((-5 * Math.PI) / 6)]
    const left = [pt((-5 * Math.PI) / 6), [0, 0] as const, pt(Math.PI / 2), pt((5 * Math.PI) / 6)]
    const right = [[0, 0] as const, pt(-Math.PI / 6), pt(Math.PI / 6), pt(Math.PI / 2)]
    const face = (pts: (readonly [number, number])[], fill: string) => {
      ctx.beginPath()
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
      ctx.closePath()
      ctx.fillStyle = fill
      ctx.fill()
    }
    face(top, color ? col : '#6E8BFF')
    face(left, col)
    face(right, color ? col : c.dark)
    if (color) {
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'
      ctx.lineWidth = s * 0.03
      ;[top, left, right].forEach((pts) => {
        ctx.beginPath()
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
        ctx.closePath()
        ctx.stroke()
      })
    }
  } else if (key === 'baro') {
    ctx.fillStyle = col
    for (let i = 0; i < 2; i++) {
      const o = i * s * 0.32 - s * 0.2
      ctx.beginPath()
      ctx.moveTo(o - s * 0.18, -s * 0.42)
      ctx.lineTo(o + s * 0.22, 0)
      ctx.lineTo(o - s * 0.18, s * 0.42)
      ctx.lineTo(o - s * 0.02, s * 0.42)
      ctx.lineTo(o + s * 0.38, 0)
      ctx.lineTo(o - s * 0.02, -s * 0.42)
      ctx.closePath()
      ctx.fill()
    }
  } else if (key === 'donghae') {
    ctx.fillStyle = col
    ctx.beginPath()
    ctx.arc(0, 0, s * 0.46, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = s * 0.08
    for (let k = 0; k < 2; k++) {
      ctx.beginPath()
      const y = -s * 0.06 + k * s * 0.2
      ctx.moveTo(-s * 0.32, y)
      ctx.bezierCurveTo(-s * 0.14, y - s * 0.16, s * 0.0, y + s * 0.14, s * 0.32, y - s * 0.04)
      ctx.stroke()
    }
  } else {
    ctx.fillStyle = col
    roundRect(ctx, -s * 0.45, -s * 0.45, s * 0.9, s * 0.9, s * 0.16)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.moveTo(-s * 0.06, s * 0.34)
    ctx.lineTo(s * 0.06, s * 0.34)
    ctx.lineTo(s * 0.03, -s * 0.34)
    ctx.lineTo(-s * 0.03, -s * 0.34)
    ctx.closePath()
    ctx.fill()
    ctx.fillRect(-s * 0.3, -s * 0.04, s * 0.6, s * 0.08)
  }
  ctx.restore()
}

/** 랩핑에 쓰는 회사 이름(영어 화면) */
const CARRIER_EN: Record<CarrierKey, string> = {
  daon: 'Daon Logistics',
  baro: 'Baro Express',
  donghae: 'Donghae Transport',
  hangil: 'Hangil Cargo',
  daonair: 'Daon Air Cargo',
}

/** 차량 측면 랩핑(탑·윙 패널) */
export function liveryTex(carrier: CarrierKey, variant: 'van' | 'truck' | 'wing') {
  const w = 1024
  const h = variant === 'van' ? 600 : variant === 'wing' ? 300 : 340
  return canvasTex(`livery-${carrier}-${variant}`, w, h, (ctx) => {
    const c = CARRIERS[carrier]
    ctx.fillStyle = variant === 'wing' ? '#F4F6FA' : '#FBFCFE'
    ctx.fillRect(0, 0, w, h)
    if (variant === 'wing') {
      ctx.strokeStyle = 'rgba(120,130,150,0.18)'
      ctx.lineWidth = 2
      for (let x = 0; x < w; x += 64) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
        ctx.stroke()
      }
    }
    // 아래쪽 곡선 띠
    ctx.fillStyle = c.color
    ctx.beginPath()
    ctx.moveTo(0, h)
    ctx.lineTo(0, h * 0.78)
    ctx.bezierCurveTo(w * 0.35, h * 0.66, w * 0.65, h * 0.95, w, h * 0.7)
    ctx.lineTo(w, h)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = c.dark
    ctx.beginPath()
    ctx.moveTo(0, h)
    ctx.lineTo(0, h * 0.9)
    ctx.bezierCurveTo(w * 0.4, h * 0.82, w * 0.7, h * 1.02, w, h * 0.86)
    ctx.lineTo(w, h)
    ctx.closePath()
    ctx.fill()

    const markS = variant === 'van' ? 150 : 120
    const left = variant === 'van' ? 70 : 90
    const midY = variant === 'van' ? h * 0.36 : h * 0.4
    drawMark(ctx, carrier, left + markS / 2, midY, markS)
    ctx.fillStyle = '#141A2E'
    ctx.textBaseline = 'middle'
    const name = variant === 'van' && carrier === 'daon' ? L('다온택배', 'Daon Parcel') : L(c.name, CARRIER_EN[carrier])
    const nameX = left + markS + 34
    fillFit(ctx, name, nameX, midY - (variant === 'van' ? 22 : 12), w - nameX - 24, 800, variant === 'van' ? 118 : 96)
    ctx.fillStyle = c.dark
    const sub = variant === 'van' ? L('오늘 주문, 내일 도착 · 고객센터 1600-0000', 'Order today, here tomorrow · 1600-0000') : L(`${c.en} · 간선 운송`, 'Nationwide linehaul freight')
    fillFit(ctx, sub, left + markS + 38, midY + (variant === 'van' ? 74 : 62), w - (left + markS + 38) - 24, 600, variant === 'van' ? 40 : 34)
  })
}

/** 트럭 후면 문 */
export function rearDoorTex(color = '#F4F6FA') {
  return canvasTex(`rear-${color}`, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = color
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(70,80,100,0.35)'
    ctx.lineWidth = 4
    ctx.strokeRect(6, 6, w - 12, h - 12)
    ctx.beginPath()
    ctx.moveTo(w / 2, 6)
    ctx.lineTo(w / 2, h - 6)
    ctx.stroke()
    ctx.fillStyle = '#8A93A6'
    for (const x of [w / 2 - 40, w / 2 + 28]) ctx.fillRect(x, 20, 12, h - 40)
    ctx.fillStyle = '#E2463C'
    ctx.fillRect(14, h - 30, 36, 16)
    ctx.fillRect(w - 50, h - 30, 36, 16)
  })
}

/** 골판 외벽 */
export function corrugatedTex(base = '#EEF1F8', line = '#D5DBE8') {
  return canvasTex(`corr-${base}-${line}`, 256, 64, (ctx, w, h) => {
    ctx.fillStyle = base
    ctx.fillRect(0, 0, w, h)
    for (let x = 0; x < w; x += 16) {
      ctx.fillStyle = line
      ctx.fillRect(x, 0, 3, h)
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.fillRect(x + 4, 0, 2, h)
    }
  }, { repeat: [1, 1] })
}

/** 지붕 이음매 + 채광창 */
export function roofTex(color = '#3A60EE') {
  return canvasTex(`roof-${color}`, 512, 512, (ctx, w, h) => {
    ctx.fillStyle = color
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(255,255,255,0.10)'
    for (let x = 0; x < w; x += 24) ctx.fillRect(x, 0, 3, h)
    ctx.fillStyle = 'rgba(0,0,0,0.06)'
    for (let x = 12; x < w; x += 24) ctx.fillRect(x, 0, 2, h)
  }, { repeat: [1, 1] })
}

export function shutterTex(color = '#DDE3EE') {
  return canvasTex(`shutter-${color}`, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = color
    ctx.fillRect(0, 0, w, h)
    for (let y = 0; y < h; y += 10) {
      ctx.fillStyle = 'rgba(80,90,110,0.22)'
      ctx.fillRect(0, y, w, 2)
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.fillRect(0, y + 3, w, 1)
    }
  })
}

/** 출입문·도크 번호판 등 작은 표지 */
export function labelTex(text: string, bg = '#2F55E6', fg = '#FFFFFF', w = 256, h = 96) {
  return canvasTex(`label-${text}-${bg}-${fg}-${w}x${h}`, w, h, (ctx) => {
    ctx.fillStyle = bg
    roundRect(ctx, 0, 0, w, h, 14)
    ctx.fill()
    ctx.fillStyle = fg
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    fillFit(ctx, text, w / 2, h / 2 + 3, w - 20, 800, h * 0.52, h)
  })
}

/** 바닥 도색 문자(투명 배경) */
export function paintTex(text: string, color = '#FFFFFF', w = 256, h = 128) {
  return canvasTex(`paint-${text}-${color}`, w, h, (ctx) => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    fillFit(ctx, text, w / 2, h / 2 + 4, w - 12, 800, h * 0.62, h)
  })
}

/** 건물 간판 */
export function signTex(main: string, sub: string) {
  return canvasTex(`sign-${main}-${sub}`, 1024, 256, (ctx, w, h) => {
    ctx.fillStyle = '#FFFFFF'
    roundRect(ctx, 0, 0, w, h, 26)
    ctx.fill()
    drawMark(ctx, 'daon', 130, h / 2, 170)
    ctx.fillStyle = '#121933'
    ctx.textBaseline = 'middle'
    fillFit(ctx, main, 250, h / 2 - 28, w - 250 - 30, 800, 104)
    ctx.fillStyle = '#2F55E6'
    fillFit(ctx, sub, 254, h / 2 + 66, w - 254 - 30, 700, 54)
  })
}

/** 지붕 로고 */
export function roofLogoTex() {
  return canvasTex('roof-logo', 512, 512, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.beginPath()
    ctx.arc(w / 2, h / 2, w * 0.46, 0, Math.PI * 2)
    ctx.fill()
    drawMark(ctx, 'daon', w / 2, h / 2, w * 0.56)
  })
}

/** 커튼월·아파트 창문 */
export function windowsTex(kind: 'office' | 'apt', label?: string) {
  return canvasTex(`win-${kind}-${label ?? ''}`, 512, 512, (ctx, w, h) => {
    if (kind === 'office') {
      ctx.fillStyle = '#9DB2E8'
      ctx.fillRect(0, 0, w, h)
      const g = ctx.createLinearGradient(0, 0, w, h)
      g.addColorStop(0, 'rgba(255,255,255,0.35)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#F4F6FB'
      for (let x = 0; x < w; x += 64) ctx.fillRect(x, 0, 6, h)
      for (let y = 0; y < h; y += 170) ctx.fillRect(0, y, w, 22)
    } else {
      ctx.fillStyle = '#F6F7FB'
      ctx.fillRect(0, 0, w, h)
      // 세대 사이 벽 기둥(3칸마다)
      ctx.fillStyle = '#E9ECF3'
      for (let x = 4; x < w; x += 120) ctx.fillRect(x, 0, 5, h)
      for (let y = 10; y < h; y += 26) {
        // 층 슬래브 띠
        ctx.fillStyle = '#ECEFF5'
        ctx.fillRect(0, y + 19, w, 3)
        for (let x = 12; x < w; x += 40) {
          ctx.fillStyle = (x * 7 + y * 3) % 11 === 0 ? '#BFD0F5' : '#A9BBE4'
          ctx.fillRect(x, y, 26, 14)
          // 창틀 가운데 살
          ctx.fillStyle = '#DDE3EE'
          ctx.fillRect(x + 12, y, 2, 14)
          // 발코니 난간
          ctx.fillStyle = '#E3E7F0'
          ctx.fillRect(x, y + 15, 26, 4)
          // 실외기(일부 세대)
          if ((x * 13 + y * 5) % 7 === 0) {
            ctx.fillStyle = '#C9CED8'
            ctx.fillRect(x + 27, y + 9, 9, 7)
            ctx.fillStyle = '#9AA2B2'
            ctx.fillRect(x + 29, y + 11, 5, 3)
          }
        }
      }
      if (label) {
        ctx.fillStyle = 'rgba(246,247,251,0.92)'
        ctx.fillRect(w - 150, 18, 132, 70)
        ctx.fillStyle = '#4A5878'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        fillFit(ctx, label, w - 84, 56, 124, 800, 58)
      }
    }
  })
}

export function glowTex() {
  return canvasTex('glow', 256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
    g.addColorStop(0, 'rgba(70,110,255,0.55)')
    g.addColorStop(0.55, 'rgba(70,110,255,0.22)')
    g.addColorStop(1, 'rgba(70,110,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  })
}

export function beltTex() {
  return canvasTex('belt', 128, 32, (ctx, w, h) => {
    ctx.fillStyle = '#3B4252'
    ctx.fillRect(0, 0, w, h)
    for (let x = 0; x < w; x += 16) {
      ctx.fillStyle = '#525A6D'
      ctx.fillRect(x, 0, 5, h)
    }
  }, { repeat: [40, 1] })
}

/** 파렛트 적재물 표면 */
export function loadTex(look: 'boxes' | 'water' | 'wrapped' | 'mixed' | 'parcel' | 'stretch') {
  return canvasTex(`load-${look}`, 256, 256, (ctx, w, h) => {
    if (look === 'water') {
      ctx.fillStyle = '#7FA8F2'
      ctx.fillRect(0, 0, w, h)
      for (let x = 0; x < w; x += 32) {
        for (let y = 0; y < h; y += 64) {
          ctx.fillStyle = '#5E8BE6'
          ctx.fillRect(x + 4, y + 6, 24, 54)
          ctx.fillStyle = 'rgba(255,255,255,0.55)'
          ctx.fillRect(x + 8, y + 10, 5, 46)
        }
      }
      ctx.fillStyle = '#F4F7FF'
      for (let y = 26; y < h; y += 64) ctx.fillRect(0, y, w, 12)
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      ctx.fillRect(0, 0, w, h)
    } else if (look === 'stretch') {
      // 랩핑된 카톤: 크래프트 + 반투명 필름 광택
      ctx.fillStyle = '#D2A266'
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = 'rgba(110,70,30,0.3)'
      ctx.lineWidth = 4
      for (const x of [w / 2]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke() }
      for (const y of [h / 3, (h * 2) / 3]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }
      ctx.fillStyle = 'rgba(235,242,255,0.55)'
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'
      ctx.lineWidth = 3
      for (let y = -w; y < h; y += 26) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y + w * 0.35); ctx.stroke() }
    } else if (look === 'wrapped') {
      ctx.fillStyle = '#F7F8FC'
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#C9D6F5'
      for (let y = 0; y < h; y += 64) ctx.fillRect(0, y + 44, w, 8)
      ctx.fillStyle = '#2F55E6'
      ctx.font = font(800, 30)
      ctx.textAlign = 'center'
      for (let y = 30; y < h; y += 64) ctx.fillText('SOFT 30', w / 2, y)
    } else {
      const base = look === 'parcel' ? '#D9AE76' : '#D2A266'
      ctx.fillStyle = base
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = 'rgba(110,70,30,0.35)'
      ctx.lineWidth = 4
      const cols = 2
      const rows = look === 'mixed' ? 2 : 3
      for (let i = 1; i < cols; i++) {
        ctx.beginPath()
        ctx.moveTo((w / cols) * i, 0)
        ctx.lineTo((w / cols) * i, h)
        ctx.stroke()
      }
      for (let j = 1; j < rows; j++) {
        ctx.beginPath()
        ctx.moveTo(0, (h / rows) * j)
        ctx.lineTo(w, (h / rows) * j)
        ctx.stroke()
      }
      ctx.fillStyle = 'rgba(160,110,60,0.55)'
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) ctx.fillRect((w / cols) * i + w / cols / 2 - 6, (h / rows) * j + 4, 12, h / rows - 8)
      ctx.fillStyle = 'rgba(255,255,255,0.8)'
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) ctx.fillRect((w / cols) * i + 14, (h / rows) * j + h / rows - 30, 34, 18)
    }
  })
}

export function palletSideTex() {
  return canvasTex('pallet-side', 128, 32, (ctx, w, h) => {
    ctx.fillStyle = '#C59A69'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#5E4630'
    ctx.fillRect(16, 6, 38, h - 6)
    ctx.fillRect(74, 6, 38, h - 6)
  })
}

export function stripeTex(a = '#E8453C', b = '#FFFFFF') {
  return canvasTex(`stripe-${a}-${b}`, 256, 32, (ctx, w, h) => {
    for (let x = 0; x < w; x += 32) {
      ctx.fillStyle = (x / 32) % 2 ? a : b
      ctx.fillRect(x, 0, 32, h)
    }
  })
}

export function containerTex(name: string, color: string) {
  return canvasTex(`cont-${name}-${color}`, 512, 256, (ctx, w, h) => {
    ctx.fillStyle = color
    ctx.fillRect(0, 0, w, h)
    for (let x = 0; x < w; x += 28) {
      const g = ctx.createLinearGradient(x, 0, x + 28, 0)
      g.addColorStop(0, 'rgba(0,0,0,0)')
      g.addColorStop(0.5, 'rgba(0,0,0,0.12)')
      g.addColorStop(1, 'rgba(255,255,255,0.06)')
      ctx.fillStyle = g
      ctx.fillRect(x, 0, 28, h)
    }
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.textBaseline = 'middle'
    fillFit(ctx, name, 30, h / 2, w - 60, 800, 54)
  })
}

/** 롤테이너·펜스 철망(알파) */
export function meshTex(color = '#9EA8BB', cell = 16) {
  return canvasTex(`mesh-${color}-${cell}`, 128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    ctx.strokeStyle = color
    ctx.lineWidth = 3
    for (let x = 0; x <= w; x += cell) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
    }
    for (let y = 0; y <= h; y += cell * 2) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
    }
  }, { repeat: [1, 1] })
}

export function chargerScreenTex() {
  return canvasTex('charger-screen', 128, 96, (ctx, w, h) => {
    ctx.fillStyle = '#16203A'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#35D07F'
    ctx.font = font(800, 30)
    ctx.textAlign = 'center'
    ctx.fillText('⚡ 48V', w / 2, 40)
    ctx.fillRect(18, 60, w - 36, 12)
  })
}

/** 냉동탑차(새벽배송) 랩핑 */
export function reeferLivery() {
  return canvasTex('livery-reefer', 1024, 360, (ctx, w, h) => {
    ctx.fillStyle = '#FBFCFE'
    ctx.fillRect(0, 0, w, h)
    const g = ctx.createLinearGradient(0, 0, w, 0)
    g.addColorStop(0, '#13A39A')
    g.addColorStop(1, '#2F55E6')
    ctx.fillStyle = g
    ctx.fillRect(0, h * 0.74, w, h * 0.26)
    ctx.fillStyle = '#13A39A'
    ctx.beginPath()
    ctx.arc(150, h * 0.4, 70, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    ctx.font = font(800, 70)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('❄', 150, h * 0.4 + 4)
    ctx.textAlign = 'left'
    ctx.fillStyle = '#121933'
    fillFit(ctx, L('새벽팜 콜드체인', 'Dawn Farm Cold Chain'), 250, h * 0.36, w - 250 - 30, 800, 92)
    ctx.fillStyle = '#0C7A73'
    fillFit(ctx, L('냉동 -18℃ · 냉장 0~5℃ 새벽배송', 'Frozen -18℃ · Chilled 0–5℃ · Dawn delivery'), 254, h * 0.36 + 72, w - 254 - 30, 600, 36)
  })
}

/** 컨테이너 골판 측면(색은 인스턴스 색으로 곱한다) */
export function containerSideTex() {
  return canvasTex('cont-side-white2', 512, 128, (ctx, w, h) => {
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, w, h)
    // 골판: 16줄, 경계를 부드럽게 그라데이션으로(멀리서 물결무늬가 덜 생긴다)
    const rib = w / 16
    for (let x = 0; x < w; x += rib) {
      const g = ctx.createLinearGradient(x, 0, x + rib, 0)
      g.addColorStop(0, 'rgba(0,0,0,0.0)')
      g.addColorStop(0.5, 'rgba(0,0,0,0.09)')
      g.addColorStop(1, 'rgba(0,0,0,0.0)')
      ctx.fillStyle = g
      ctx.fillRect(x, 0, rib, h)
    }
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.fillRect(0, 0, w, 5)
    ctx.fillRect(0, h - 5, w, 5)
  })
}

/** AMR 포드(선반) 옆면: 칸막이 + 천 수납함. 회색조라 인스턴스 색이 곱해진다 */
export function podTex() {
  return canvasTex('amr-pod', 64, 128, (ctx, w, h) => {
    ctx.fillStyle = '#5E6472'
    ctx.fillRect(0, 0, w, h)
    const rows = 6
    const cols = 3
    const cw = w / cols
    const rh = h / rows
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = (r + c) % 3 === 0 ? '#F4F6FA' : (r + c) % 3 === 1 ? '#DDE2EA' : '#E9EDF3'
        ctx.fillRect(c * cw + 2, r * rh + 3, cw - 4, rh - 5)
        ctx.fillStyle = '#B5BDCB'
        ctx.fillRect(c * cw + 2, r * rh + rh - 6, cw - 4, 2)
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(c * cw + cw / 2 - 5, r * rh + 6, 10, 4)
      }
    }
  })
}

/** 태양광 패널 셀 */
export function solarTex() {
  return canvasTex('solar', 256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#1D2B57'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(140,170,255,0.35)'
    ctx.lineWidth = 2
    for (let x = 0; x <= w; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke() }
    for (let y = 0; y <= h; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }
  }, { repeat: [1, 1] })
}
