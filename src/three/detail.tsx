// 가까운 차량·지게차·사람만 상세 모델로(LOD): 카메라가 거점 가까이 있을 때, 보는 곳 근처 몇 대와 선택한 개체만
// hubtrace 에셋 팩 GLB(1톤 탑차 · 5톤 윙바디 · 냉동탑차 · 전동 지게차, public/assets/models)로 바꾸고 나머지는 지금 모델을 쓴다.
// 사람(형광 조끼 작업자 · 다온마을 배송기사)은 humans.tsx가 그린다.
//  - 템플릿: 움직이지 않는 메시는 재질별로 하나로 합치고, 움직이는 부품(문·윙·바퀴·포크 받침)만 따로 남긴다 → 대마다 복제
//  - 부품은 엔티티의 Parts에 등록해, 지금의 바퀴·문·윙 회전과 포크 높이 코드가 그대로 움직인다
//  - brand 재질은 운송사 색으로 칠한다(인쇄된 hubtrace 글자는 그대로)
import { useEffect, useLayoutEffect, useMemo, type ReactNode } from 'react'
import { createPortal, useFrame, useThree } from '@react-three/fiber'
import { useGLTF, type CameraControlsImpl } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { create } from 'zustand'
import { sim } from '../sim/sim'
import { useStore } from '../store'
import type { Mover } from '../sim/life'
import type { Parts } from './models/vehicles'
import { bake, webMaterial } from './glb'
import { preloadHumans } from './humans'
import { boot } from '../boot'

export type DetailAsset = 'delivery-truck' | 'wing-truck' | 'reefer-truck' | 'forklift'
const url = (a: DetailAsset) => `/assets/models/${a}.glb`

/** 움직이는 부품 노드 이름 */
const PART = /^(doorL|doorR|wingL|wingR|wheel_.*|carriage)$/
const WHEEL = /^wheel_/

/** 상세 모델로 그릴 개체: 차량·지게차 id, 작업자(mover id), 걸어서 배송 중인 배송기사(차량 id) */
interface DetailSets { vehicles: Set<string>; forklifts: Set<string>; people: Set<string>; couriers: Set<string> }
export const useDetail = create<DetailSets>(() => ({ vehicles: new Set(), forklifts: new Set(), people: new Set(), couriers: new Set() }))

/** 실제 인체 모델로 바꿀 수 있는 사람: 형광 조끼 작업자(어린이 제외) */
export const isWorker = (m: Mover) => m.kind === 'person' && !!m.look.vest && !m.look.kid

// ───────────────────────── 템플릿(에셋마다 한 번)

const templates = new Map<THREE.Object3D, THREE.Group>()

function template(scene: THREE.Object3D): THREE.Group {
  const hit = templates.get(scene)
  if (hit) return hit
  scene.updateMatrixWorld(true)
  const inv = scene.matrixWorld.clone().invert()
  const root = new THREE.Group()
  const mats = new Map<THREE.Material, THREE.Material>()
  const web = (m: THREE.Material) => {
    let w = mats.get(m)
    if (!w) mats.set(m, (w = webMaterial(m)))
    return w
  }
  const statics = new Map<THREE.Material, THREE.BufferGeometry[]>()
  const visit = (o: THREE.Object3D) => {
    if (o !== scene && PART.test(o.name)) {
      // 부품: 모델 루트 기준 자리에 복제해 두고, 안의 재질만 웹용으로
      const part = o.clone(true)
      new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld).decompose(part.position, part.quaternion, part.scale)
      part.traverse((n) => {
        const mesh = n as THREE.Mesh
        if (mesh.isMesh && !Array.isArray(mesh.material)) {
          mesh.material = web(mesh.material)
          mesh.castShadow = true
          mesh.receiveShadow = true
        }
      })
      root.add(part)
      return
    }
    const mesh = o as THREE.Mesh
    if (mesh.isMesh && !Array.isArray(mesh.material)) {
      const list = statics.get(mesh.material) ?? []
      list.push(bake(mesh.geometry, inv.clone().multiply(mesh.matrixWorld)))
      statics.set(mesh.material, list)
    }
    for (const c of o.children) visit(c)
  }
  visit(scene)
  for (const [m, geos] of statics) {
    const geo = geos.length === 1 ? geos[0] : mergeGeometries(geos)
    if (!geo) continue
    const mesh = new THREE.Mesh(geo, web(m))
    mesh.castShadow = !(mesh.material as THREE.MeshStandardMaterial).transparent
    mesh.receiveShadow = true
    root.add(mesh)
  }
  root.traverse((n) => { n.userData.noMerge = true })
  root.userData.skip = true
  templates.set(scene, root)
  return root
}

/** 운송사 색으로 칠한 brand 재질(색마다 하나) */
const painted = new Map<string, THREE.Material>()
function paintMat(src: THREE.Material, color: string) {
  const key = `${src.uuid}:${color}`
  let m = painted.get(key)
  if (!m) {
    m = src.clone()
    ;(m as THREE.MeshStandardMaterial).color.set(color)
    painted.set(key, m)
  }
  return m
}

// ───────────────────────── 상세 모델 한 대

export function DetailModel({ asset, parts, paint, carriageRef, children }: {
  asset: DetailAsset
  parts?: Parts
  /** brand 재질 색(운송사) */
  paint?: string
  carriageRef?: (o: THREE.Object3D | null) => void
  /** 포크 받침에 붙일 것(지게차 화물) */
  children?: ReactNode
}) {
  const { scene } = useGLTF(url(asset))
  const inst = useMemo(() => {
    const object = template(scene).clone(true)
    if (paint) {
      object.traverse((n) => {
        const mesh = n as THREE.Mesh
        if (mesh.isMesh && !Array.isArray(mesh.material) && mesh.material.name === 'brand') mesh.material = paintMat(mesh.material, paint)
      })
    }
    const wheels: THREE.Object3D[] = []
    object.traverse((n) => { if (WHEEL.test(n.name) && !WHEEL.test(n.parent?.name ?? '')) wheels.push(n) })
    const get = (name: string) => object.getObjectByName(name) ?? undefined
    return { object, wheels, doorL: get('doorL'), doorR: get('doorR'), wingL: get('wingL'), wingR: get('wingR'), carriage: get('carriage') }
  }, [scene, paint])

  useLayoutEffect(() => {
    if (!parts) return
    // 지금 모델이 남긴 바퀴는 버리고 이 모델 것으로
    parts.wheels.clear()
    for (const w of inst.wheels) parts.wheels.add(w)
    const names = ['doorL', 'doorR', 'wingL', 'wingR'] as const
    for (const k of names) if (inst[k]) parts[k] = inst[k]
    return () => {
      for (const w of inst.wheels) parts.wheels.delete(w)
      for (const k of names) if (parts[k] === inst[k]) delete parts[k]
    }
  }, [inst, parts])

  useLayoutEffect(() => {
    carriageRef?.(inst.carriage ?? null)
    return () => carriageRef?.(null)
  }, [inst, carriageRef])

  return (
    <>
      <primitive object={inst.object} dispose={null} />
      {inst.carriage && children && createPortal(children, inst.carriage)}
    </>
  )
}

// ───────────────────────── 어느 개체를 상세 모델로 그릴지

/** 카메라가 이만큼 가까이(보는 곳까지 거리) 있을 때만 */
const NEAR_VIEW = 150
/** 사람은 더 가까이서만 */
const NEAR_PEOPLE = 110
const MAX_VEHICLES = 3
const MAX_FORKLIFTS = 2
const MAX_PEOPLE = 4
const MAX_COURIERS = 2
const DETAIL_KINDS = new Set(['van', 'wing', 'reefer'])

export function preloadDetail() {
  for (const a of ['delivery-truck', 'wing-truck', 'reefer-truck', 'forklift'] as const) useGLTF.preload(url(a))
  preloadHumans()
}

/** 걸어서 배송 중인 배송기사 자리(다온마을 탑차) */
const courierAt = (v: (typeof sim.vehicles)[number]) => ({
  id: v.id,
  x: v.walk.from.x + (v.walk.to.x - v.walk.from.x) * v.walk.t,
  z: v.walk.from.z + (v.walk.to.z - v.walk.from.z) * v.walk.t,
})

/** 0.3초마다: 보는 곳 근처(들어올 때 r, 나갈 때 1.4r) 가까운 순으로 몇 개 + 선택한 개체 */
export function DetailDirector() {
  const controls = useThree((s) => s.controls) as unknown as CameraControlsImpl | null
  const target = useMemo(() => new THREE.Vector3(), [])
  const acc = useMemo(() => ({ t: 1 }), [])
  // 가까이 볼 때만 쓰는 모델이라 첫 화면 로딩이 끝난 뒤에 미리 받는다
  useEffect(() => boot.onDone(preloadDetail), [])
  useFrame((_, dt) => {
    acc.t += dt
    if (acc.t < 0.3) return
    acc.t = 0
    const cur = useDetail.getState()
    const dist = controls?.distance ?? 1e9
    const sel = useStore.getState().selected
    if (controls) controls.getTarget(target)
    const pick = <T extends { id: string; x: number; z: number }>(o: {
      list: T[]; keep: Set<string>; max: number; near: number; r: number; selKind: string; ok?: (o: T) => boolean
    }) => {
      const out = new Set<string>()
      const list = o.ok ? o.list.filter(o.ok) : o.list
      if (dist < o.near) {
        list
          .map((e) => ({ id: e.id, d: Math.hypot(e.x - target.x, e.z - target.z) }))
          .filter((e) => e.d < (o.keep.has(e.id) ? o.r * 1.4 : o.r))
          .sort((a, b) => a.d - b.d)
          .slice(0, o.max)
          .forEach((e) => out.add(e.id))
      }
      if (sel && sel.kind === o.selKind && dist < 320 && list.some((e) => e.id === sel.id)) out.add(sel.id)
      return out
    }
    const vehicles = pick({ list: sim.vehicles, keep: cur.vehicles, max: MAX_VEHICLES, near: NEAR_VIEW, r: 60, selKind: 'vehicle', ok: (v) => v.visible && DETAIL_KINDS.has(v.kind) })
    const forklifts = pick({ list: sim.forklifts, keep: cur.forklifts, max: MAX_FORKLIFTS, near: NEAR_VIEW, r: 60, selKind: 'forklift' })
    const people = pick({ list: sim.life.movers, keep: cur.people, max: MAX_PEOPLE, near: NEAR_PEOPLE, r: 40, selKind: 'mover', ok: isWorker })
    const walking = sim.vehicles.filter((v) => v.kind === 'van' && v.home === 'IN' && v.walk.on).map(courierAt)
    const couriers = pick({ list: walking, keep: cur.couriers, max: MAX_COURIERS, near: NEAR_PEOPLE, r: 45, selKind: 'vehicle' })
    const same = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x))
    if (!same(vehicles, cur.vehicles) || !same(forklifts, cur.forklifts) || !same(people, cur.people) || !same(couriers, cur.couriers)) {
      useDetail.setState({ vehicles, forklifts, people, couriers })
    }
  })
  return null
}
