// 다온마을·상가·학교 등 생활 장면의 글자 그림(간판·동 번호·표지판)을 텍스처 한 장에 모은다.
// 모든 간판이 같은 재질 2개(낮용·밤에 빛나는 것)를 쓰므로 간판을 늘려도 그리기 명령이 2개로 유지된다.
import * as THREE from 'three'
import type { ThreeElements } from '@react-three/fiber'
import { buildAtlas, fitText, type Atlas, type AtlasCell } from './atlas'
import { fillFit } from './textures'
import { L } from '../i18n'
import { lampMaterial } from './env/state'
import { planeUV } from './kit'

export const APT_NUMS = Array.from({ length: 12 }, (_, i) => 101 + i)

/** 간판 글자(칸 이름) → [바탕 색, 글자 색, 영어 화면 글자('\n'은 두 줄일 때 끊을 자리)]. 브랜드·상호는 모두 가상.
 *  다른 파일은 한국어 글자로 signId('…')를 부르고, 칸에 그리는 글자만 화면 언어를 따른다 */
export const SIGNS: Record<string, [string, string, string]> = {
  // 원래 있던 것
  '카페 온담': ['#8A5A3B', '#FFFFFF', 'Cafe Ondam'],
  '편의점 다온25': ['#1FA35B', '#FFFFFF', 'Daon25 Store'],
  '다온 세탁': ['#2F55E6', '#FFFFFF', 'Daon Laundry'],
  다솜하우스: ['#5B6B90', '#FFFFFF', 'Dasom House'],
  해밀빌: ['#5B6B90', '#FFFFFF', 'Haemil Ville'],
  다온캐슬: ['#5B6B90', '#FFFFFF', 'Daon Castle'],
  초록빌라: ['#5B6B90', '#FFFFFF', 'Chorok Villa'],
  '다온마을 입구': ['#1E3BB3', '#FFFFFF', 'Daon Village Entrance'],
  // 사무동 간판(흰 바탕)
  '기사 휴게실': ['#FFFFFF', '#2F55E6', 'Driver Lounge'],
  '대전 중부허브': ['#FFFFFF', '#2F55E6', 'Daejeon Central Hub'],
  '인천 서브터미널': ['#FFFFFF', '#2F55E6', 'Incheon Sub-terminal'],
  '이천 FC 사무동': ['#FFFFFF', '#2F55E6', 'Icheon FC Office'],
  관리사무소: ['#FFFFFF', '#2F55E6', 'Management Office'],
  '부산신항 운영동': ['#FFFFFF', '#2F55E6', 'Busan New Port\nOperations'],
  '세관 검사동': ['#FFFFFF', '#1E3BB3', 'Customs Inspection'],
  '부산신항 철송장': ['#FFFFFF', '#2F55E6', 'Busan New Port Rail Terminal'],
  '곤지암 철송장': ['#FFFFFF', '#2F55E6', 'Gonjiam Rail Terminal'],
  '다온 에너지 저장소': ['#FFFFFF', '#E2463C', 'Daon Energy Storage'],
  다온터널: ['#1E7A4C', '#FFFFFF', 'Daon Tunnel'],
  '다온 톨게이트': ['#1E3BB3', '#FFFFFF', 'Daon Toll Plaza'],
  '트럭 대기장': ['#FFFFFF', '#2F55E6', 'Truck Waiting Area'],
  // 근린상가 1층
  다온치킨: ['#E2453C', '#FFFFFF', 'Daon Chicken'],
  '카페 하루': ['#6B4A36', '#FFF4E2', 'Cafe Haru'],
  온가족약국: ['#13A39A', '#FFFFFF', 'Ongajok Pharmacy'],
  '분식 꼬마김밥': ['#F2A33A', '#3A2A12', 'Kkoma Gimbap'],
  '엄마손 반찬': ['#7FA35B', '#FFFFFF', "Mom's Side Dishes"],
  다온마트: ['#2F55E6', '#FFFFFF', 'Daon Mart'],
  '행복 부동산': ['#5B6B90', '#FFFFFF', 'Happy Realty'],
  '다온 꽃집': ['#D96C9A', '#FFFFFF', 'Daon Florist'],
  '동네 정육점': ['#B8423A', '#FFFFFF', 'Local Butcher'],
  // 2층
  '다온 수학학원': ['#4D6FFF', '#FFFFFF', 'Daon Math Academy'],
  '하늘 영어': ['#13A39A', '#FFFFFF', 'Haneul English'],
  '바른 치과': ['#F4F6FB', '#2F55E6', 'Bareun Dental'],
  '튼튼 소아과': ['#F4F6FB', '#E2453C', 'Teunteun Pediatrics'],
  '태권도 다온관': ['#1E3BB3', '#FFD27A', 'Daon Taekwondo'],
  '피아노 교습소': ['#F4F6FB', '#5B6B90', 'Piano Lessons'],
  // 배경 공장·창고(가상 회사)
  '한빛 물산': ['#2F55E6', '#FFFFFF', 'Hanbit Trading'],
  '대성 정밀': ['#3B4252', '#FFFFFF', 'Daesung Precision'],
  '다온 식품': ['#3E8E5A', '#FFFFFF', 'Daon Foods'],
  '동해 냉동': ['#13A39A', '#FFFFFF', 'Donghae Cold Storage'],
  '서해 포장': ['#D9531E', '#FFFFFF', 'Seohae Packaging'],
  '미래 부품': ['#7A5CFF', '#FFFFFF', 'Mirae Parts'],
  '하나 제지': ['#5B6B90', '#FFFFFF', 'Hana Paper'],
  '새벽 물류': ['#1E3BB3', '#FFFFFF', 'Saebyeok Logistics'],
  // 생활 물류
  '다온 우편센터': ['#D9531E', '#FFFFFF', 'Daon Post Office'],
  '택배 접수·보관': ['#1FA35B', '#FFFFFF', 'Parcel Drop-off & Pickup'],
  '택배 보관실': ['#2F55E6', '#FFFFFF', 'Parcel Room'],
  '분리수거장': ['#3E8E5A', '#FFFFFF', 'Recycling Area'],
  '다온초등학교': ['#1E3BB3', '#FFFFFF', 'Daon Elementary School'],
  '공사 중 · 안전 제일': ['#F2B92B', '#22262F', 'Work Zone · Safety First'],
  '다온 리버뷰 신축 공사': ['#22262F', '#FFFFFF', 'Daon Riverview Construction'],
  '기사 주차장': ['#2F55E6', '#FFFFFF', 'Driver Parking'],
  '반품 수거': ['#E2453C', '#FFFFFF', 'Return Pickup'],
  '전기차 충전': ['#13A39A', '#FFFFFF', 'EV Charging'],
}

function cells(): AtlasCell[] {
  const out: AtlasCell[] = []
  for (const n of APT_NUMS) {
    // 아파트 옆벽(동 번호 크게)
    out.push({
      id: `end-${n}`, w: 128, h: 256,
      draw: (ctx, w, h) => {
        ctx.fillStyle = '#F2F4F9'
        ctx.fillRect(0, 0, w, h)
        ctx.fillStyle = '#C9D3EA'
        ctx.fillRect(0, 0, w, 20)
        // 층 띠
        ctx.fillStyle = '#E3E7F0'
        for (let y = 40; y < h; y += 18) ctx.fillRect(0, y, w, 3)
        ctx.fillStyle = '#5B6B90'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'alphabetic'
        fitText(ctx, String(n), w / 2, 84, w - 16, 800, 48)
        fitText(ctx, L('다온마을', 'Daon Village'), w / 2, 112, w - 20, 700, 20)
      },
    })
    // 공동현관 동 표지
    out.push({
      id: `lbl-${n}`, w: 192, h: 72,
      draw: (ctx, w, h) => {
        ctx.fillStyle = '#2F55E6'
        ctx.fillRect(0, 0, w, h)
        ctx.fillStyle = '#FFFFFF'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        fitText(ctx, L(`${n}동`, `Bldg ${n}`), w / 2, h / 2 + 2, w - 20, 800, 44)
      },
    })
  }
  for (const [text, [bg, fg, en]] of Object.entries(SIGNS)) {
    out.push({
      id: `sign-${text}`, w: 384, h: 96,
      draw: (ctx, w, h) => {
        ctx.fillStyle = bg
        ctx.fillRect(0, 0, w, h)
        ctx.fillStyle = 'rgba(255,255,255,0.12)'
        ctx.fillRect(0, 0, w, 6)
        ctx.fillStyle = fg
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        // 영어는 길어서 한 줄로 많이 줄어들면 두 줄로 나눈다(fillFit)
        fillFit(ctx, L(text, en), w / 2, h / 2 + 3, w - 30, 800, 50, h)
      },
    })
  }
  // 바닥 글자: 어린이 보호구역(빨간 포장 위 흰 글자)
  out.push({
    id: 'road-school', w: 256, h: 128,
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#C8483F'
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#FFFFFF'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      fitText(ctx, L('어린이', 'SCHOOL'), w / 2, h * 0.32, w - 20, 800, 46)
      fitText(ctx, L('보호구역', 'ZONE'), w / 2, h * 0.72, w - 20, 800, 46)
    },
  })
  // 택배 상자 테이프·송장(상자 더미 윗면)
  out.push({
    id: 'parcel-top', w: 64, h: 64,
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#D7A86E'
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#C08F55'
      ctx.fillRect(w / 2 - 6, 0, 12, h)
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(8, 10, 22, 16)
      ctx.fillStyle = '#3B4461'
      for (let y = 13; y < 24; y += 4) ctx.fillRect(10, y, 16, 1)
    },
  })
  return out
}

let atlas: Atlas | null = null
export function townAtlas() {
  atlas ??= buildAtlas(cells(), 2048)
  return atlas
}
export const townUV = (id: string) => townAtlas().uv(id)

let day: THREE.MeshStandardMaterial | null = null
let lit: THREE.MeshStandardMaterial | null = null
/** 아틀라스 재질(낮). 옆벽·표지판처럼 빛나지 않는 것 */
export function atlasMat() {
  day ??= new THREE.MeshStandardMaterial({ map: townAtlas().tex, roughness: 0.7 })
  return day
}
/** 아틀라스 재질(밤에 빛나는 간판) */
export function atlasLitMat() {
  lit ??= lampMaterial(new THREE.MeshStandardMaterial({ map: townAtlas().tex, emissiveMap: townAtlas().tex, emissive: '#ffffff', emissiveIntensity: 0.3, roughness: 0.5 }))
  return lit
}

/** 아틀라스 칸 하나를 붙인 세로 판(간판·표지) */
export function AtlasSign({ cell, w, h, p, r, lit: glow = false, ...rest }: { cell: string; w: number; h: number; p: [number, number, number]; r?: [number, number, number]; lit?: boolean } & Omit<ThreeElements['mesh'], 'position' | 'rotation' | 'scale'>) {
  return <mesh geometry={planeUV(townUV(cell))} position={p} rotation={r} scale={[w, h, 1]} material={glow ? atlasLitMat() : atlasMat()} {...rest} />
}

/** 간판 글자로 칸 이름 만들기(없는 글자면 오류: SIGNS에 먼저 넣는다) */
export const signId = (text: string) => {
  if (!SIGNS[text]) throw new Error(`townAtlas: SIGNS에 없는 간판 "${text}"`)
  return `sign-${text}`
}
