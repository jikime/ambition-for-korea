// 도시·산업 환경 팩(hubtrace-environments, public/assets/env) GLB를 배경 건물로 여러 채 그린다.
//  - 밖에서 보이지 않는 내부(노드 extras section 'interior')와 작은 표지 글자(도크 번호 · 비상구 등)는 뺀다
//  - 남은 메시는 재질별로 하나로 합치고, 종류마다 재질별 InstancedMesh로 그린다(그리기 명령 = 재질 수, 채 수와 무관)
//  - 팩 건물 간판은 모두 "hubtrace"라, 그 자리에 칸마다 회사 간판(아틀라스)을 붙인다
// 모델 좌표: 미터, +Y 위, 정면 +Z, 원점은 지면. 자리는 처음 그릴 때 고정된다(움직이지 않는 배경용).
import { Suspense, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { GlbInstances, bake, webMaterial, type GlbPart } from './glb'
import { Merge } from './merge'
import { AtlasSign, signId } from './townAtlas'

export type EnvId =
  | 'factory-production-hall' | 'factory-utility-building' | 'silo-farm' | 'process-pipe-rack' | 'industrial-chimney'
  | 'distribution-warehouse' | 'cold-storage-warehouse' | 'surface-parking-lot'
  | 'urban-microhub' | 'office-tower' | 'office-midrise' | 'mixed-use-corner' | 'landscaped-planter' | 'streetlight-led'
const url = (id: EnvId) => `/assets/env/${id}.glb`
/** 그림자를 끄는 납작한 것 */
const FLAT = new Set<EnvId>(['surface-parking-lot'])

/** 뺄 작은 표지 글자 재질 */
const DROP_INK = /(door-number|dock-number|exit-sign|accessible-sign|facility-type-sign|fire-extinguisher)/
/** 회사 간판으로 바꿀 팩 간판(hubtrace 글자) 재질 */
const BRAND_INK = /(brand-sign|building-sign|brand-ink|site-sign|base-brand)/

/** 팩의 짙은 녹회색 지붕 · 청록 외장 띠를 이 장면 산업단지 색으로(종류마다 하나, 팔레트 텍스처의 그 색 칸만 바꾼다) */
const ROOF_SRC = [0x65, 0x76, 0x75]
const TEAL_SRC = [0x31, 0x5e, 0x5c]
const RECOLOR: Partial<Record<EnvId, { roof: string; band: string }>> = {
  'distribution-warehouse': { roof: '#B9C6E6', band: '#2F55E6' },
  'cold-storage-warehouse': { roof: '#C4CEE6', band: '#13A39A' },
  'factory-production-hall': { roof: '#D9C7B0', band: '#5B6B90' },
  'factory-utility-building': { roof: '#C9D3C2', band: '#3E8E5A' },
  'urban-microhub': { roof: '#C4CEE6', band: '#2F55E6' },
}

function recolorMap(tex: THREE.Texture, roof: string, band: string) {
  const img = tex.image as CanvasImageSource & { width: number; height: number }
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0)
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const px = data.data
  const to = (hex: string) => { const c = new THREE.Color(hex); return [c.r * 255, c.g * 255, c.b * 255].map(Math.round) }
  const [r1, b1] = [to(roof), to(band)]
  // 팔레트 텍스처는 손실 압축하지 않아 원래 색 그대로다(반올림 차이만 허용)
  const near = (i: number, c: number[]) => Math.abs(px[i] - c[0]) + Math.abs(px[i + 1] - c[1]) + Math.abs(px[i + 2] - c[2]) < 6
  for (let i = 0; i < px.length; i += 4) {
    const t = near(i, ROOF_SRC) ? r1 : near(i, TEAL_SRC) ? b1 : null
    if (t) [px[i], px[i + 1], px[i + 2]] = t
  }
  ctx.putImageData(data, 0, 0)
  const out = new THREE.CanvasTexture(canvas)
  out.colorSpace = tex.colorSpace
  out.flipY = tex.flipY
  out.wrapS = tex.wrapS
  out.wrapT = tex.wrapT
  out.magFilter = tex.magFilter
  out.minFilter = tex.minFilter
  out.generateMipmaps = tex.generateMipmaps
  out.channel = tex.channel
  return out
}

interface SignSpot { center: THREE.Vector3; w: number; h: number; rotY: number }
interface EnvTemplate { parts: GlbPart[]; sign: SignSpot | null }

const templates = new WeakMap<THREE.Object3D, EnvTemplate>()

function envTemplate(scene: THREE.Object3D, id: EnvId): EnvTemplate {
  const hit = templates.get(scene)
  if (hit) return hit
  scene.updateMatrixWorld(true)
  const inv = scene.matrixWorld.clone().invert()
  const groups = new Map<THREE.Material, THREE.BufferGeometry[]>()
  let sign: SignSpot | null = null
  const visit = (o: THREE.Object3D) => {
    if (o.userData.section === 'interior') return
    const mesh = o as THREE.Mesh
    if (mesh.isMesh && !Array.isArray(mesh.material)) {
      const name = mesh.material.name
      const geo = bake(mesh.geometry, inv.clone().multiply(mesh.matrixWorld))
      if (BRAND_INK.test(name)) {
        // 가장 큰 간판 하나만: 얇은 축이 바라보는 면
        geo.computeBoundingBox()
        const b = geo.boundingBox!
        const s = b.getSize(new THREE.Vector3())
        const c = b.getCenter(new THREE.Vector3())
        const facesZ = s.z <= s.x
        const w = facesZ ? s.x : s.z
        if (!sign || w * s.y > sign.w * sign.h) {
          const rotY = facesZ ? (c.z >= 0 ? 0 : Math.PI) : c.x >= 0 ? Math.PI / 2 : -Math.PI / 2
          const out = facesZ ? new THREE.Vector3(0, 0, Math.sign(c.z || 1) * (s.z / 2 + 0.05)) : new THREE.Vector3(Math.sign(c.x || 1) * (s.x / 2 + 0.05), 0, 0)
          sign = { center: c.add(out), w, h: s.y, rotY }
        }
        geo.dispose()
      } else if (!DROP_INK.test(name)) {
        const list = groups.get(mesh.material) ?? []
        list.push(geo)
        groups.set(mesh.material, list)
      } else geo.dispose()
    }
    for (const c of o.children) visit(c)
  }
  visit(scene)
  const parts: GlbPart[] = []
  for (const [src, geos] of groups) {
    const geometry = geos.length === 1 ? geos[0] : mergeGeometries(geos)
    if (!geometry) continue
    geometry.computeBoundingSphere()
    // 원본 재질은 갤러리에서도 쓰므로 복제해서 고친다
    let material = webMaterial(src) as THREE.MeshStandardMaterial
    if (material === src) material = material.clone()
    // 장면에 비칠 환경 맵이 없어 금속면(사일로 · 배관 · 강재)이 검게 보이므로 금속도를 낮춘다
    if (material.isMeshStandardMaterial && material.metalness > 0.5) material.metalness = 0.3
    const rc = RECOLOR[id]
    if (rc && material.map && /^PaletteMaterial/.test(material.name)) material.map = recolorMap(material.map, rc.roof, rc.band)
    parts.push({ geometry, material, local: new THREE.Matrix4(), tint: false })
  }
  const out = { parts, sign }
  templates.set(scene, out)
  return out
}

export interface EnvPlacement {
  id: EnvId
  x: number
  z: number
  rot?: number
  /** 회사 간판(townAtlas SIGNS의 이름) */
  sign?: string
}

const m4 = new THREE.Matrix4()
const q = new THREE.Quaternion()
const up = new THREE.Vector3(0, 1, 0)
const one = new THREE.Vector3(1, 1, 1)

function EnvKind({ id, items }: { id: EnvId; items: EnvPlacement[] }) {
  const { scene } = useGLTF(url(id))
  const tpl = useMemo(() => envTemplate(scene, id), [scene, id])
  const set = useMemo(() => {
    const s = new GlbInstances(tpl.parts, items.length)
    s.begin()
    for (const it of items) s.add(m4.compose(new THREE.Vector3(it.x, 0, it.z), q.setFromAxisAngle(up, it.rot ?? 0), one))
    s.end()
    s.group.userData.env = id
    // 납작한 주차장은 그림자를 그리지 않는다(그림자 패스 삼각형 절약)
    if (FLAT.has(id)) s.group.traverse((o) => { o.castShadow = false })
    return s
  }, [tpl, items, id])
  const sp = tpl.sign
  return (
    <>
      <primitive object={set.group} />
      {sp && (
        <Merge>
          {items.filter((it) => it.sign).map((it, i) => {
            // 아틀라스 간판은 4:1: 원래 간판 높이에 맞추고 폭은 넘치지 않게
            const h = Math.min(sp.h, sp.w / 4)
            const c = sp.center.clone().applyAxisAngle(up, it.rot ?? 0)
            return <AtlasSign key={i} cell={signId(it.sign!)} w={h * 4} h={h} p={[it.x + c.x, c.y, it.z + c.z]} r={[0, sp.rotY + (it.rot ?? 0), 0]} lit />
          })}
        </Merge>
      )}
    </>
  )
}

/** 환경 모델 배치(종류마다 한 묶음). 불러오는 동안은 그 종류만 비어 있다 */
export function EnvBuildings({ items }: { items: EnvPlacement[] }) {
  const byId = useMemo(() => {
    const map = new Map<EnvId, EnvPlacement[]>()
    for (const it of items) map.set(it.id, [...(map.get(it.id) ?? []), it])
    return [...map]
  }, [items])
  return (
    <>
      {byId.map(([id, list]) => (
        <Suspense key={id} fallback={null}>
          <EnvKind id={id} items={list} />
        </Suspense>
      ))}
    </>
  )
}
