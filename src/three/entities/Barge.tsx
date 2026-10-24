// 강 내륙 화물선(hubtrace 에셋 팩 GLB)과 대전 강변 부두(정박지 물 · 안벽 · 야적장 · 리치스태커).
// 배의 위치·방향·단계는 sim.barge(sim/barge.ts), 부두 자리는 sim/river.ts WHARF.
//  - 배는 물에 1.5m 잠기게 내리고(수면 아래는 땅에 가려진다), 움직일 때 뒤로 물보라를 끈다
//  - 접안 중에는 리치스태커가 안벽과 야적장 사이를 오가며 컨테이너 6개를 내리고 6개를 싣는다(sim.barge.work)
import { Suspense, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { sim } from '../../sim/sim'
import { BARGE } from '../../sim/barge'
import { WHARF } from '../../sim/river'
import { B, Cyl, Flat, mat, unitBox, unitPlane } from '../kit'
import { canvasTex, labelTex } from '../textures'
import { Merge } from '../merge'
import { Decal, ShippingContainer, StreetLight } from '../models/structures'
import { ReachStacker } from '../models/sites'
import { webMaterial } from '../glb'
import { Prop } from '../props'
import { pickHandlers } from './Vehicles'
import { L } from '../../i18n'

const URL = '/assets/models/inland-container-barge.glb'
/** 물에 잠기는 깊이 */
const DRAFT = 1.5

/** 뒤로 퍼지는 물보라(V자) */
function wakeTex() {
  return canvasTex('barge-wake', 128, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    for (const side of [-1, 1]) {
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, 'rgba(255,255,255,0.95)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.strokeStyle = g
      ctx.lineWidth = 9
      ctx.filter = 'blur(3px)'
      ctx.beginPath()
      ctx.moveTo(w / 2 + side * 10, 4)
      ctx.lineTo(w / 2 + side * (w / 2 - 6), h)
      ctx.stroke()
    }
    const c = ctx.createRadialGradient(w / 2, 10, 2, w / 2, 40, 60)
    c.addColorStop(0, 'rgba(255,255,255,0.9)')
    c.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.filter = 'blur(2px)'
    ctx.fillStyle = c
    ctx.fillRect(0, 0, w, 110)
  })
}

function BargeModel() {
  const { scene } = useGLTF(URL)
  const object = useMemo(() => {
    const o = clone(scene)
    const mats = new Map<THREE.Material, THREE.Material>()
    o.traverse((n) => {
      const m = n as THREE.Mesh
      n.userData.noMerge = true
      if (!m.isMesh || Array.isArray(m.material)) return
      let w = mats.get(m.material)
      if (!w) mats.set(m.material, (w = webMaterial(m.material)))
      m.material = w
      m.castShadow = true
      m.receiveShadow = true
    })
    o.userData.skip = true
    return o
  }, [scene])
  return <primitive object={object} dispose={null} />
}

export function BargeEntity() {
  const g = useRef<THREE.Group>(null)
  const wake = useRef<THREE.Mesh>(null)
  const handlers = useMemo(() => pickHandlers({ kind: 'barge', id: sim.barge.id }), [])
  const wakeMat = useMemo(() => new THREE.MeshBasicMaterial({ map: wakeTex(), transparent: true, depthWrite: false, opacity: 0 }), [])
  useFrame(() => {
    const b = sim.barge
    const o = g.current
    if (!o) return
    o.visible = b.visible
    if (!o.visible) return
    o.position.set(b.x, 0, b.z)
    o.rotation.y = b.heading
    const k = Math.min(1, b.v / BARGE.vmax)
    wakeMat.opacity = 0.75 * k
    if (wake.current) {
      wake.current.visible = k > 0.03
      wake.current.scale.set(14 + 10 * k, 1, 22 + 40 * k)
      wake.current.position.z = -BARGE.len / 2 - (11 + 20 * k) + 6
    }
  })
  return (
    <group ref={g} {...handlers}>
      <group position={[0, -DRAFT, 0]}>
        <Suspense fallback={null}>
          <BargeModel />
        </Suspense>
      </group>
      {/* 물보라는 수면 바로 위, 배 뒤쪽(배 기준 −z)으로 */}
      <mesh ref={wake} geometry={unitPlane} material={wakeMat} position={[0, 0.03, -BARGE.len / 2]} rotation={[0, Math.PI, 0]} userData={{ noMerge: true }} renderOrder={2} />
    </group>
  )
}

/** 리치스태커: 접안 중이면 안벽(배 쪽)과 야적장 사이를 오가며 컨테이너를 나른다 */
function WharfStacker() {
  const g = useRef<THREE.Group>(null)
  const box = useRef<THREE.Mesh>(null)
  const W = WHARF
  const front = W.quayX - 7.4
  const back = W.quayX - 17
  useFrame(() => {
    const b = sim.barge
    const o = g.current
    if (!o) return
    let x = back
    let carry = false
    if (b.state === 'moored') {
      const n = BARGE.boxes * 2
      const f = Math.min(n - 1e-6, b.work * n)
      const i = Math.floor(f)
      const u = f - i
      const unload = i < BARGE.boxes
      // 집기(0~0.15) → 싣고 이동(0.15~0.5) → 내려놓기(0.5~0.65) → 빈 채로 돌아오기(0.65~1)
      const from = unload ? front : back
      const to = unload ? back : front
      const ease = (a: number, b2: number) => { const t = Math.min(1, Math.max(0, (u - a) / (b2 - a))); return t * t * (3 - 2 * t) }
      x = u < 0.5 ? from + (to - from) * ease(0.15, 0.5) : to + (from - to) * ease(0.65, 1)
      carry = u > 0.08 && u < 0.58
    }
    o.position.x = x
    if (box.current) box.current.visible = carry
  })
  return (
    <group ref={g} position={[back, 0, W.z + 3]} rotation={[0, Math.PI / 2, 0]}>
      <Merge><ReachStacker /></Merge>
      <mesh ref={box} geometry={unitBox} position={[0, 4.5, 6.2]} scale={[2.44, 2.6, 12.2]} material={mat('#2F7D6D', { rough: 0.6 })} castShadow visible={false} userData={{ noMerge: true }} />
    </group>
  )
}

/** 대전 강변 부두: 정박지 물 · 안벽(방충재 · 계선주) · 야적장 · 사무소 · 조명 */
export function RiverWharf() {
  const W = WHARF
  const { basin, apron, quayX } = W
  const len = basin.z1 - basin.z0
  const water = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: '#7FA2DC', roughness: 0.28, metalness: 0.05 })
    m.userData.noSnow = true
    return m
  }, [])
  const cz = (basin.z0 + basin.z1) / 2
  const handlers = useMemo(() => pickHandlers({ kind: 'barge', id: sim.barge.id }), [])
  return (
    <group>
      <mesh geometry={unitPlane} material={water} scale={[basin.x1 - basin.x0, 1, len]} position={[(basin.x0 + basin.x1) / 2, 0.014, cz]} receiveShadow userData={{ noMerge: true }} />
      <Merge>
        {/* 야적장 바닥 · 안벽 마루(노란 안전선) */}
        <Flat s={[apron.x1 - apron.x0, apron.z1 - apron.z0]} p={[(apron.x0 + apron.x1) / 2, (apron.z0 + apron.z1) / 2]} c="#CDD2DB" y={0.02} />
        <B s={[1.4, 0.45, len]} p={[quayX - 0.7, 0.22, cz]} c="#B9BFCA" />
        <B s={[0.25, 0.02, len]} p={[quayX - 1.8, 0.03, cz]} c="#F2C233" cast={false} />
        {Array.from({ length: Math.floor(len / 9) }, (_, i) => {
          const z = basin.z0 + 6 + i * 9
          return (
            <group key={z}>
              <B s={[0.45, 1.1, 1.6]} p={[quayX + 0.22, 0.15, z]} c="#22262F" />
              <Cyl rt={0.18} h={0.5} p={[quayX - 0.75, 0.45, z + 4.5]} c="#3A4152" />
            </group>
          )
        })}
        {/* 사무소 + 이름 */}
        <B s={[5, 3.4, 9]} p={[apron.x0 + 4, 1.7, apron.z1 - 8]} c="#F4F6FB" />
        <B s={[5.2, 0.35, 9.2]} p={[apron.x0 + 4, 3.55, apron.z1 - 8]} c="#2F55E6" />
        <B s={[0.05, 1.1, 5]} p={[apron.x0 + 6.53, 1.6, apron.z1 - 8]} c="#9FB6E8" cast={false} />
        <Decal tex={labelTex(L('대전 강변 부두', 'Daejeon River Wharf'), '#2F55E6', '#FFFFFF', 420, 96)} w={7.4} h={1.7} p={[apron.x0 + 6.55, 2.75, apron.z1 - 8]} r={[0, Math.PI / 2, 0]} />
        {/* 야적장 컨테이너(20ft) */}
        {[0, 1, 2].flatMap((r) => [0, 1, 2, 3].map((c) => ({ r, c }))).map(({ r, c }) => (
          <group key={`${r}${c}`} position={[apron.x0 + 3 + r * 2.8, (r + c) % 3 === 0 ? 2.6 : 0, apron.z0 + 10 + c * 6.6]}>
            <ShippingContainer name={['DAON', 'HANMAR', 'KORI', 'SEOHAE'][(r + c) % 4]} color={['#2F55E6', '#1F9C9A', '#8A94A8', '#E07A35'][(r + c) % 4]} />
          </group>
        ))}
        {[0, 1, 2].flatMap((r) => [0, 1, 2, 3].map((c) => ({ r, c }))).filter(({ r, c }) => (r + c) % 3 === 0).map(({ r, c }) => (
          <group key={`b${r}${c}`} position={[apron.x0 + 3 + r * 2.8, 0, apron.z0 + 10 + c * 6.6]}>
            <ShippingContainer name="DAON" color="#5FAFAA" />
          </group>
        ))}
      </Merge>
      <StreetLight p={[quayX - 3, basin.z0 + 8]} rot={Math.PI / 2} />
      <StreetLight p={[quayX - 3, basin.z1 - 8]} rot={Math.PI / 2} />
      {[[apron.x0 + 0.8, apron.z0 + 0.8], [apron.x0 + 0.8, apron.z1 - 0.8]].map(([x, z]) => (
        <group key={z} position={[x, 0, z]} rotation={[0, Math.atan2(quayX - x, cz - z), 0]}><Prop id="security-camera" /></group>
      ))}
      <group {...handlers}>
        <WharfStacker />
      </group>
    </group>
  )
}
