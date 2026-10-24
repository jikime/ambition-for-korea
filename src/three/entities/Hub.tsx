// 곤지암 허브 분류동의 움직이는 것들: 크로스벨트 캐리어, 상자, 롤테이너 적재량, 리젝트 데스크 표시등
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { sim } from '../../sim/sim'
import { CAGE_CAP, CAGE_Z, CHUTE_X, DESK, HUB, SPACING, loopPos } from '../../sim/hub'
import { mat, rboxGeo, sphereGeo, unitBox, refreshBounds } from '../kit'
import { loadTex } from '../textures'
import { Merge } from '../merge'
import { HubSortHall } from '../models/hub'
import { pickHandlers } from './Vehicles'

const TINTS = ['#D7A86E', '#C99A60', '#E2BC88', '#F1F3F8', '#B9CBF2']
const REJECT = '#F2A33A'
const AI_TINT = '#8E6BFF'
const MAX = 280
/** 실내용 복제 재질(눈·젖음 제외) */
function indoor(m: THREE.MeshStandardMaterial) {
  const c = m.clone()
  c.userData.noSnow = true
  return c
}
const DESK_COLOR = { idle: '#7E889B', ai: '#8E6BFF', ok: '#22B07D', manual: '#F2A33A', irregular: '#F2A33A' }

function Carriers() {
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(rboxGeo(0.98, 0.1, 1.06, 0.03, 1), indoor(mat('#ffffff', { rough: 0.5 })), HUB.carriers)
    m.receiveShadow = true
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    const c = new THREE.Color()
    for (let i = 0; i < HUB.carriers; i++) m.setColorAt(i, c.set(i % 2 ? '#DCE2EE' : '#5F7BE8'))
    return m
  }, [])
  const o = useMemo(() => new THREE.Object3D(), [])
  useFrame(() => {
    const off = sim.hub.offset
    for (let i = 0; i < HUB.carriers; i++) {
      const p = loopPos(off + i * SPACING)
      o.position.set(p.x, HUB.y + 0.1, p.z)
      o.rotation.set(0, -p.h, 0)
      o.updateMatrix()
      mesh.setMatrixAt(i, o.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    refreshBounds(mesh)
  })
  return <primitive object={mesh} />
}

function HubParcels() {
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(rboxGeo(0.5, 0.34, 0.42, 0.04, 1), indoor(mat('#ffffff', { rough: 0.8 })), MAX)
    m.castShadow = true
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    for (let i = 0; i < MAX; i++) m.setColorAt(i, new THREE.Color(TINTS[i % TINTS.length]))
    return m
  }, [])
  const o = useMemo(() => new THREE.Object3D(), [])
  const c = useMemo(() => new THREE.Color(), [])
  useFrame(() => {
    const list = sim.hub.parcels
    const n = Math.min(list.length, MAX)
    for (let i = 0; i < n; i++) {
      const p = list[i]
      o.position.set(p.x, p.y, p.z)
      o.rotation.set(0, p.spin, 0)
      o.scale.setScalar(p.size)
      o.updateMatrix()
      mesh.setMatrixAt(i, o.matrix)
      // 못 읽은 상자는 주황, AI 판독으로 행선지를 찾은 상자는 보라
      const tint = p.reject ? (p.known ? AI_TINT : p.scanned ? REJECT : TINTS[Math.floor(p.tint * TINTS.length)]) : TINTS[Math.floor(p.tint * TINTS.length)]
      mesh.setColorAt(i, c.set(tint))
    }
    mesh.count = n
    mesh.instanceMatrix.needsUpdate = true
    refreshBounds(mesh)
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })
  return <primitive object={mesh} />
}

function CageFills() {
  const refs = useRef<(THREE.Mesh | null)[]>([])
  const load = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ map: loadTex('parcel'), roughness: 0.8 })
    m.userData.noSnow = true
    return [m, m, indoor(mat('#D9AE76')), m, m, m] as THREE.Material[]
  }, [])
  useFrame(() => {
    sim.hub.cages.forEach((g, i) => {
      const m = refs.current[i]
      if (!m) return
      const f = g.swap > 0 ? 0 : g.count / CAGE_CAP
      m.visible = f > 0.02
      m.scale.y = Math.max(0.01, 1.7 * f)
      m.position.y = 0.2 + (1.7 * f) / 2
    })
  })
  return (
    <>
      {sim.hub.cages.map((g, i) => (
        <mesh key={g.dest} ref={(m) => { refs.current[i] = m }} geometry={unitBox} position={[CHUTE_X[g.dest], 0.5, CAGE_Z]} scale={[0.74, 1, 0.64]} material={load} castShadow />
      ))}
    </>
  )
}

function DeskLamp() {
  const lamp = useRef<THREE.Mesh>(null)
  const mats = useMemo(() => Object.fromEntries(Object.entries(DESK_COLOR).map(([k, c]) => [k, mat(c, { emissive: c, emissiveIntensity: 1.4 })])), [])
  useFrame(({ clock }) => {
    const m = lamp.current
    if (!m) return
    const mode = sim.hub.desk.mode
    m.material = mats[mode]
    m.scale.setScalar(mode === 'ai' ? 1 + 0.25 * Math.sin(clock.elapsedTime * 8) : 1)
  })
  return <mesh ref={lamp} geometry={sphereGeo(0.12)} position={[DESK.x - 0.7, 1.32, DESK.z - 0.3]} material={mats.idle} />
}

export function HubHall() {
  const pick = useMemo(() => pickHandlers({ kind: 'sorter', id: 'X1' }), [])
  return (
    <group {...pick}>
      <Merge noSnow>
        <HubSortHall />
      </Merge>
      <Carriers />
      <HubParcels />
      <CageFills />
      <DeskLamp />
    </group>
  )
}
