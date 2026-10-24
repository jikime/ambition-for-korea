// 가까이 보는 사람만 실제 인체 모델로(LOD): 형광 조끼 작업자 → 물류센터 작업자, 다온마을 배송기사 → 택배 배송기사
// (hubtrace 에셋 팩 GLB, 골격 · 피부 · 의상 · 동작 포함). 주민·어린이는 맞는 모델이 없어 군중 그림(Life.tsx)을 그대로 쓴다.
// 위치·방향은 시뮬레이션이 정하고, 모델은 제자리 걷기/대기 동작만 바꿔 튼다. 누구를 바꿀지는 DetailDirector(detail.tsx)가 고른다.
// 걷기 동작은 디딤발이 미끄러지지 않게 다듬고(gait.ts), 실제로 움직이는 속도에 맞춰 재생 배속을 정한다(배속 · 충돌 회피 감속 포함).
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useAnimations, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { webMaterial } from './glb'
import { fixGait } from './gait'

export type HumanAsset = 'warehouse-worker' | 'delivery-courier'
const url = (a: HumanAsset) => `/assets/models/${a}.glb`
const WALK: Record<HumanAsset, string> = { 'warehouse-worker': 'hubtrace_walk_in_place', 'delivery-courier': 'hubtrace_carry_walk_in_place' }
const IDLE = 'hubtrace_natural_idle'

export function preloadHumans() {
  for (const a of ['warehouse-worker', 'delivery-courier'] as const) useGLTF.preload(url(a))
}

const webMats = new Map<THREE.Material, THREE.Material>()

/** 걷기로 바꾸는 속도·대기로 돌아가는 속도(m/s) */
const WALK_ON = 0.3
const WALK_OFF = 0.12

/** 사람 한 명: 골격째 복제하고, 실제 이동 속도로 걷기·대기 동작과 걸음 빠르기를 정한다 */
export function HumanModel({ asset }: { asset: HumanAsset }) {
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
  const gait = useMemo(() => {
    const src = animations.find((a) => a.name === WALK[asset])
    return src ? fixGait(scene, src) : null
  }, [scene, animations, asset])
  const clips = useMemo(() => animations.map((a) => (gait && a.name === gait.clip.name ? gait.clip : a)), [animations, gait])
  const { actions } = useAnimations(clips, root)
  const st = useMemo(() => ({ cur: '', prev: new THREE.Vector3(), p: new THREE.Vector3(), has: false, v: 0, walking: false }), [])
  useEffect(() => () => { for (const a of Object.values(actions)) a?.stop() }, [actions])
  useFrame((_, dt) => {
    const g = root.current
    if (!g || dt <= 0) return
    // 실제 이동 속도(순간이동처럼 크게 뛰면 무시), 살짝 부드럽게
    g.getWorldPosition(st.p)
    const d = st.has ? st.p.distanceTo(st.prev) : 0
    st.prev.copy(st.p)
    st.has = true
    const inst = d > 4 ? st.v : d / dt
    st.v += (inst - st.v) * Math.min(1, dt * 10)
    st.walking = st.walking ? st.v > WALK_OFF : st.v > WALK_ON
    const want = st.walking ? WALK[asset] : IDLE
    const walk = actions[WALK[asset]]
    // 디딤발이 땅 위에서 멈춰 있도록: 재생 배속 = 이동 속도 ÷ 동작의 걷는 속도
    if (walk && gait) walk.timeScale = Math.min(60, Math.max(0.5, st.v / gait.speed))
    if (want === st.cur) return
    const next = actions[want]
    if (!next) return
    const prev = st.cur ? actions[st.cur] : null
    next.reset().fadeIn(0.2).play()
    prev?.fadeOut(0.2)
    st.cur = want
  })
  return (
    <group ref={root}>
      <primitive object={object} dispose={null} />
    </group>
  )
}
