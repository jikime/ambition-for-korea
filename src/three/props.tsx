// 가벼운 소품(hubtrace 에셋 팩 GLB): 안전 콘 · 이동식 안전 펜스 · 롤테이너 · 보안 카메라 · 충전 스테이션.
// 장면 곳곳에 <Prop id=… />로 자리만 표시하면 PropLayer가 종류마다 재질별 InstancedMesh 하나로 모두 그린다
// (개수와 무관하게 그리기 명령 = 재질 수). 자리는 처음 놓일 때의 월드 위치로 고정되므로 움직이는 것 안에는 쓰지 않는다.
// Merge 안에 두어도 된다(빈 그룹, userData.skip). GLB를 불러오기 전에는 아무것도 그리지 않는다.
import { Suspense, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF, type CameraControlsImpl } from '@react-three/drei'
import * as THREE from 'three'
import { GlbInstances, glbParts } from './glb'

export type PropId = 'traffic-cone' | 'safety-barrier' | 'roll-cage' | 'security-camera' | 'charging-station'
const IDS: PropId[] = ['traffic-cone', 'safety-barrier', 'roll-cage', 'security-camera', 'charging-station']
const url = (id: PropId) => `/assets/models/${id}.glb`
/** 색을 바꿀 수 있는 재질(롤테이너 바닥판 도장) */
const TINT: Partial<Record<PropId, RegExp>> = { 'roll-cage': /^powdercoat/ }
/** 종류마다 최대 개수 */
const CAP = 256
/** 카메라가 이보다 멀면(보는 곳까지 거리) 소품은 그리지 않는다 */
const FAR = 600

interface Slot { m: THREE.Matrix4; color: THREE.Color }
const slots = Object.fromEntries(IDS.map((id) => [id, new Map<number, Slot>()])) as Record<PropId, Map<number, Slot>>
let version = 0
let seq = 0

/** 소품 자리 하나. color: 색을 바꿀 수 있는 재질의 색(없으면 원래 색) */
export function Prop({ id, color = '#6C7974' }: { id: PropId; color?: string }) {
  const ref = useRef<THREE.Group>(null)
  useLayoutEffect(() => {
    const g = ref.current
    if (!g) return
    g.updateWorldMatrix(true, false)
    const key = ++seq
    slots[id].set(key, { m: g.matrixWorld.clone(), color: new THREE.Color(color) })
    version++
    return () => {
      slots[id].delete(key)
      version++
    }
  }, [id, color])
  return <group ref={ref} userData={{ skip: true }} />
}

function PropKind({ id }: { id: PropId }) {
  const { scene } = useGLTF(url(id))
  const set = useMemo(() => {
    const parts = glbParts(scene, TINT[id])
    // 장면에 비칠 환경 맵이 없어 금속면(아연도금 철망·기둥)이 검게 보이므로 금속도를 낮춘다
    for (const p of parts) {
      const m = p.material as THREE.MeshStandardMaterial
      if (m.isMeshStandardMaterial && m.metalness > 0.5) m.metalness = 0.3
    }
    return new GlbInstances(parts, CAP)
  }, [scene, id])
  const seen = useRef(-1)
  useFrame(() => {
    if (seen.current === version) return
    seen.current = version
    set.begin()
    for (const s of slots[id].values()) set.add(s.m, s.color)
    set.end()
  })
  return <primitive object={set.group} />
}

export function PropLayer() {
  const controls = useThree((s) => s.controls) as unknown as CameraControlsImpl | null
  const g = useRef<THREE.Group>(null)
  useFrame(() => {
    if (g.current) g.current.visible = (controls?.distance ?? 0) < FAR
  })
  return (
    <group ref={g}>
      {IDS.map((id) => (
        <Suspense key={id} fallback={null}>
          <PropKind id={id} />
        </Suspense>
      ))}
    </group>
  )
}
