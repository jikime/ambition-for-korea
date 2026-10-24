import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { ThreeElements } from '@react-three/fiber'

type V3 = [number, number, number]

interface MatOpts {
  rough?: number
  metal?: number
  emissive?: string
  emissiveIntensity?: number
  opacity?: number
  map?: THREE.Texture | null
  side?: THREE.Side
  alphaTest?: number
  flat?: boolean
}

const mats = new Map<string, THREE.MeshStandardMaterial>()

/** 같은 설정의 재질을 공유해 드로우콜·메모리를 아낀다. */
export function mat(color: string, o: MatOpts = {}) {
  const key = `${color}|${o.rough ?? ''}|${o.metal ?? ''}|${o.emissive ?? ''}|${o.emissiveIntensity ?? ''}|${o.opacity ?? ''}|${o.map?.uuid ?? ''}|${o.side ?? ''}|${o.alphaTest ?? ''}|${o.flat ?? ''}`
  let m = mats.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: o.rough ?? 0.78,
      metalness: o.metal ?? 0,
      ...(o.emissive ? { emissive: new THREE.Color(o.emissive) } : {}),
      emissiveIntensity: o.emissiveIntensity ?? 1,
      transparent: o.opacity !== undefined,
      opacity: o.opacity ?? 1,
      depthWrite: o.opacity === undefined || o.opacity > 0.6,
      map: o.map ?? null,
      side: o.side ?? THREE.FrontSide,
      alphaTest: o.alphaTest ?? 0,
      flatShading: o.flat ?? false,
    })
    mats.set(key, m)
  }
  return m
}

export const basic = (() => {
  const cache = new Map<string, THREE.MeshBasicMaterial>()
  return (color: string, opacity?: number, map?: THREE.Texture) => {
    const key = `${color}|${opacity ?? ''}|${map?.uuid ?? ''}`
    let m = cache.get(key)
    if (!m) {
      m = new THREE.MeshBasicMaterial({
        color, map: map ?? null, transparent: opacity !== undefined || !!map,
        opacity: opacity ?? 1, depthWrite: false, toneMapped: false,
      })
      cache.set(key, m)
    }
    return m
  }
})()

export const unitBox = new THREE.BoxGeometry(1, 1, 1)
export const unitPlane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)

const geos = new Map<string, THREE.BufferGeometry>()
function cached<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geos.get(key) as T | undefined
  if (!g) {
    g = make()
    geos.set(key, g)
  }
  return g
}

export const rboxGeo = (w: number, h: number, d: number, r = 0.08, seg = 3) =>
  cached(`rb${w}|${h}|${d}|${r}|${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2)))
export const cylGeo = (rt: number, rb: number, h: number, seg = 20) =>
  cached(`cy${rt}|${rb}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg))
export const sphereGeo = (r: number, w = 20, h = 14) => cached(`sp${r}|${w}|${h}`, () => new THREE.SphereGeometry(r, w, h))
export const icoGeo = (r: number, detail = 1) => cached(`ico${r}|${detail}`, () => new THREE.IcosahedronGeometry(r, detail))
export const coneGeo = (r: number, h: number, seg = 20) => cached(`co${r}|${h}|${seg}`, () => new THREE.ConeGeometry(r, h, seg))
export const torusGeo = (r: number, t: number, arc = Math.PI * 2) =>
  cached(`to${r}|${t}|${arc}`, () => new THREE.TorusGeometry(r, t, 8, 24, arc))

type MeshProps = Omit<ThreeElements['mesh'], 'scale' | 'position' | 'rotation'>

interface BoxProps extends MeshProps {
  s?: V3
  p?: V3
  r?: V3
  c?: string
  m?: THREE.Material | THREE.Material[]
  cast?: boolean
  receive?: boolean
}

/** 단위 박스를 크기만 바꿔 쓰는 기본 블록 */
export function B({ s = [1, 1, 1], p, r, c = '#ffffff', m, cast = true, receive = true, ...rest }: BoxProps) {
  return <mesh geometry={unitBox} scale={s} position={p} rotation={r} material={m ?? mat(c)} castShadow={cast} receiveShadow={receive} {...rest} />
}

/** 모서리가 둥근 박스 */
export function RB({ s, rad = 0.08, p, r, c = '#ffffff', m, cast = true, receive = true, ...rest }: BoxProps & { s: V3; rad?: number }) {
  return <mesh geometry={rboxGeo(s[0], s[1], s[2], rad)} position={p} rotation={r} material={m ?? mat(c)} castShadow={cast} receiveShadow={receive} {...rest} />
}

export function Cyl({ rt, rb, h, seg, p, r, c = '#ffffff', m, cast = true, ...rest }: Omit<BoxProps, 's'> & { rt: number; rb?: number; h: number; seg?: number }) {
  return <mesh geometry={cylGeo(rt, rb ?? rt, h, seg)} position={p} rotation={r} material={m ?? mat(c)} castShadow={cast} receiveShadow {...rest} />
}

/** 지면 위 얇은 평면(차선·표시선) */
export function Flat({ s, p, c = '#ffffff', m, y = 0.02, ...rest }: Omit<MeshProps, 'position'> & { s: [number, number]; p: [number, number]; c?: string; m?: THREE.Material; y?: number }) {
  return <mesh geometry={unitPlane} scale={[s[0], 1, s[1]]} position={[p[0], y, p[1]]} material={m ?? mat(c)} receiveShadow {...rest} />
}

export const COLORS = {
  brand: '#2F55E6',
  brandDeep: '#1E3BB3',
  brandSoft: '#6E8BFF',
  roof: '#3A60EE',
  wall: '#EEF1F8',
  wallShade: '#DCE2EF',
  ground: '#E6EAF4',
  pad: '#EEF1F8',
  road: '#D3DAEA',
  roadDark: '#C6CEE2',
  lane: '#FFFFFF',
  yellow: '#F2C233',
  glass: '#2B3654',
  tire: '#2A2E39',
  hub: '#C9CFDB',
  dark: '#3A4152',
  steel: '#AEB6C6',
  wood: '#C99D6B',
  kraft: '#D6A76C',
  forklift: '#F3B414',
  tree: '#6FCB8F',
  treeDark: '#58B97B',
  trunk: '#A07E62',
  lawn: '#D3EEDC',
}

const boundsTick = new WeakMap<THREE.InstancedMesh, number>()
/**
 * 움직이는 InstancedMesh: three는 인스턴스 경계 구를 처음 한 번만 계산한다(화면 밖 판정·클릭 판정에 씀).
 * 인스턴스가 처음 자리를 벗어나면 안 보이거나 클릭이 안 되므로, 몇십 프레임마다 비워서 다시 계산하게 한다.
 */
export function refreshBounds(m: THREE.InstancedMesh, every = 30) {
  const n = (boundsTick.get(m) ?? 0) + 1
  boundsTick.set(m, n)
  if (n % every === 0) m.boundingSphere = null
}

/**
 * 면마다 UV를 구운 단위 상자. faces 순서는 BoxGeometry와 같다(+x, −x, +y, −y, +z, −z).
 * - [rx, ry]: 그 면에 텍스처를 rx×ry번 반복(텍스처는 RepeatWrapping 공유본, `repeatTex`)
 * - [u0, v0, u1, v1]: 아틀라스 칸 하나를 그 면에 붙임
 * - null: 0~1 그대로
 * 반복 배율을 텍스처(repeat)가 아니라 지오메트리에 구우면 같은 텍스처를 여러 건물이 같이 써서 Merge가 한 번에 그린다.
 */
export function boxUV(faces: (readonly number[] | null)[]) {
  return cached(`buv${JSON.stringify(faces)}`, () => {
    const g = new THREE.BoxGeometry(1, 1, 1)
    const uv = g.attributes.uv as THREE.BufferAttribute
    for (let f = 0; f < 6; f++) {
      const spec = faces[f]
      if (!spec) continue
      for (let k = 0; k < 4; k++) {
        const i = f * 4 + k
        const u = uv.getX(i)
        const v = uv.getY(i)
        if (spec.length === 2) uv.setXY(i, u * spec[0], v * spec[1])
        else uv.setXY(i, spec[0] + u * (spec[2] - spec[0]), spec[1] + v * (spec[3] - spec[1]))
      }
    }
    uv.needsUpdate = true
    return g
  })
}

/** 세로로 선 단위 평면(+z를 봄)에 아틀라스 칸 하나를 붙인 것 */
export function planeUV(rect: readonly number[]) {
  return cached(`puv${rect.join(',')}`, () => {
    const g = new THREE.PlaneGeometry(1, 1)
    const uv = g.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setXY(i, rect[0] + uv.getX(i) * (rect[2] - rect[0]), rect[1] + uv.getY(i) * (rect[3] - rect[1]))
    uv.needsUpdate = true
    return g
  })
}

const repeats = new Map<string, THREE.Texture>()
/** 반복용 공유 텍스처(원본 하나당 하나). 반복 배율은 boxUV로 지오메트리에 굽는다 */
export function repeatTex(tex: THREE.Texture) {
  let t = repeats.get(tex.uuid)
  if (!t) {
    t = tex.clone()
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(1, 1)
    t.needsUpdate = true
    repeats.set(tex.uuid, t)
  }
  return t
}
