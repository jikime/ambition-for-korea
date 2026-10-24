// 텍스처 아틀라스: 간판·동 번호·표지판처럼 글자가 다른 작은 그림을 캔버스 한 장에 모은다.
// 재질 하나(텍스처 하나)를 같이 쓰면 Merge가 한 번에 그리므로, 간판이 늘어나도 그리기 명령이 늘지 않는다.
import * as THREE from 'three'
import { FONT } from './textures'

export type UvRect = [number, number, number, number]
type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void
export interface AtlasCell {
  id: string
  w: number
  h: number
  draw: Draw
}

export interface Atlas {
  tex: THREE.CanvasTexture
  uv: (id: string) => UvRect
}

/** 선반 방식으로 칸을 채운다(위→아래). 칸 사이 2px 여백 */
export function buildAtlas(cells: AtlasCell[], size = 2048): Atlas {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const rects = new Map<string, UvRect>()
  let x = 0
  let y = 0
  let rowH = 0
  for (const c of cells) {
    if (x + c.w > size) {
      x = 0
      y += rowH + 2
      rowH = 0
    }
    if (y + c.h > size) throw new Error(`atlas full at ${c.id}`)
    ctx.save()
    ctx.translate(x, y)
    ctx.beginPath()
    ctx.rect(0, 0, c.w, c.h)
    ctx.clip()
    c.draw(ctx, c.w, c.h)
    ctx.restore()
    // 캔버스 텍스처는 위아래가 뒤집혀 올라간다(flipY): v는 아래가 0
    rects.set(c.id, [x / size, 1 - (y + c.h) / size, (x + c.w) / size, 1 - y / size])
    x += c.w + 2
    rowH = Math.max(rowH, c.h)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return {
    tex,
    uv: (id) => {
      const r = rects.get(id)
      if (!r) throw new Error(`atlas: no cell ${id}`)
      return r
    },
  }
}

export const atlasFont = (w: number, px: number) => `${w} ${px}px ${FONT}`

/** 가운데 정렬 글자 한 줄(넘치면 줄임) */
export function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, weight: number, px: number) {
  let size = px
  ctx.font = atlasFont(weight, size)
  while (ctx.measureText(text).width > maxW && size > 10) {
    size -= 2
    ctx.font = atlasFont(weight, size)
  }
  ctx.fillText(text, x, y)
}
