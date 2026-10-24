// 가까이 보는 사람만 실제 인체 모델로(LOD): 형광 조끼 작업자 → 물류센터 작업자, 다온마을 배송기사 → 택배 배송기사
// (hubtrace 에셋 팩 GLB, 골격 · 피부 · 의상 · 동작 포함). 주민·어린이는 맞는 모델이 없어 군중 그림(Life.tsx)을 그대로 쓴다.
// 위치·방향은 시뮬레이션이 정하고, 모델은 제자리 걷기/대기 동작만 바꿔 튼다. 누구를 바꿀지는 DetailDirector(detail.tsx)가 고른다.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useAnimations, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { webMaterial } from './glb'

export type HumanAsset = 'warehouse-worker' | 'delivery-courier'
const url = (a: HumanAsset) => `/assets/models/${a}.glb`
const WALK: Record<HumanAsset, string> = { 'warehouse-worker': 'hubtrace_walk_in_place', 'delivery-courier': 'hubtrace_carry_walk_in_place' }
const IDLE = 'hubtrace_natural_idle'

export function preloadHumans() {
  for (const a of ['warehouse-worker', 'delivery-courier'] as const) useGLTF.preload(url(a))
}

const webMats = new Map<THREE.Material, THREE.Material>()

/** 사람 한 명: 골격째 복제하고, moving()이 바뀌면 걷기·대기 동작을 부드럽게 바꾼다 */
export function HumanModel({ asset, moving, pace = 1 }: { asset: HumanAsset; moving: () => boolean; pace?: number }) {
  const { scene, animations } = useGLTF(url(asset))
  const root = useRef<THREE.Group>(null)
  const object = useMemo(() => {
    const o = clone(scene)
    o.traverse((n) => {
      const mesh = n as THREE.Mesh
      n.userData.noMerge = true
      if (!mesh.isMesh || Array.isArray(mesh.material)) return
      let m = webMats.get(mesh.material)
      if (!m) webMats.set(mesh.material, (m = webMaterial(mesh.material)))
      mesh.material = m
      mesh.castShadow = true
      mesh.receiveShadow = true
      // 스킨 메시는 움직이면 경계 상자가 맞지 않아 잘려 보일 수 있다
      mesh.frustumCulled = false
    })
    o.userData.skip = true
    return o
  }, [scene])
  const { actions } = useAnimations(animations, root)
  const cur = useRef<string>('')
  useEffect(() => () => { for (const a of Object.values(actions)) a?.stop() }, [actions])
  useFrame(() => {
    const want = moving() ? WALK[asset] : IDLE
    if (want === cur.current) return
    const next = actions[want]
    if (!next) return
    const prev = cur.current ? actions[cur.current] : null
    next.reset().setEffectiveTimeScale(want === IDLE ? 1 : pace).fadeIn(0.25).play()
    prev?.fadeOut(0.25)
    cur.current = want
  })
  return (
    <group ref={root}>
      <primitive object={object} dispose={null} />
    </group>
  )
}
