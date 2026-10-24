import { Suspense, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { sim, type Forklift } from '../../sim/sim'
import * as L from '../../sim/layout'
import { useStore } from '../../store'
import { ChargerModel, ForkliftModel, PalletModel, Person, PinModel } from '../models/equipment'
import { HubBuilding, type DoorRefs } from '../models/structures'
import { beltTex } from '../textures'
import { mat, rboxGeo, refreshBounds } from '../kit'
import { pickHandlers } from './Vehicles'
import { Merge } from '../merge'
import { DetailModel, useDetail } from '../detail'

function ForkliftEntity({ f }: { f: Forklift }) {
  const group = useRef<THREE.Group>(null)
  const carriage = useRef<THREE.Object3D | null>(null)
  const load = useRef<THREE.Group>(null)
  const beacon = useRef<THREE.Mesh | null>(null)
  const carrying = useStore(() => f.carrying)
  const look = carrying ? sim.pallets.get(carrying)?.look ?? 'boxes' : 'boxes'
  const handlers = useMemo(() => pickHandlers({ kind: 'forklift', id: f.id }), [f.id])
  // 가까이 보는 몇 대만 상세 모델(GLB). 불러오는 동안은 지금 모델
  const detail = useDetail((s) => s.forklifts.has(f.id))
  useFrame(({ clock }) => {
    const g = group.current
    if (!g) return
    g.position.set(f.x, 0, f.z)
    g.rotation.y = f.heading
    if (carriage.current) carriage.current.position.y = f.fork
    if (load.current) load.current.visible = !!f.carrying
    if (beacon.current) beacon.current.visible = !f.moving || Math.sin(clock.elapsedTime * 10) > -0.2
  })
  const cargo = (
    <group ref={load} position={[0, 0.03, 1.55]} userData={{ skip: true }}>
      <PalletModel look={look} height={1.0} />
    </group>
  )
  const simple = (
    <Merge>
      <ForkliftModel carriageRef={(o) => { carriage.current = o }} beaconRef={(o) => { beacon.current = o }}>
        {cargo}
      </ForkliftModel>
    </Merge>
  )
  return (
    <group ref={group} {...handlers}>
      {detail
        ? <Suspense fallback={simple}><DetailModel asset="forklift" carriageRef={(o) => { carriage.current = o }}>{cargo}</DetailModel></Suspense>
        : simple}
    </group>
  )
}

export function Forklifts() {
  return (
    <group>
      {sim.forklifts.map((f) => (
        <ForkliftEntity key={f.id} f={f} />
      ))}
    </group>
  )
}

export function Chargers() {
  useStore((s) => s.tick)
  return (
    <group>
      {sim.chargers.map((c) => (
        <group key={c.id} position={[c.x, 0, c.z]} {...pickHandlers({ kind: 'charger', id: c.id })}>
          <Merge>
            <ChargerModel active={!!c.forklift && sim.forklift(c.forklift)?.status === 'charging'} />
          </Merge>
        </group>
      ))}
    </group>
  )
}

/** 적치장 파렛트와 위치 핀 */
export function StagedPallets() {
  const staged = useMemo(() => [...sim.pallets.values()].filter((p) => p.state === 'staged'), [])
  const pins = useRef<(THREE.Group | null)[]>([])
  useFrame(({ clock }) => {
    pins.current.forEach((g, i) => {
      if (g) g.position.y = 1.55 + Math.sin(clock.elapsedTime * 2 + i) * 0.12
    })
  })
  return (
    <Merge>
      {staged.map((p, i) => (
        <group key={p.id} position={[p.x, 0, p.z]} rotation={[0, p.heading, 0]} {...pickHandlers({ kind: 'pallet', id: p.id })}>
          <PalletModel look={p.look} height={i % 3 === 0 ? 1.25 : 1.05} />
          {p.pinned && (
            <group ref={(o) => { pins.current[i] = o }} position={[0, 1.55, 0]} userData={{ dynamic: true }}>
              <PinModel scale={0.85} />
            </group>
          )}
        </group>
      ))}
    </Merge>
  )
}

/** 분류장 슬롯 작업자(상차 중일 때만 보인다) */
export function Workers() {
  const refs = useRef<(THREE.Group | null)[]>([])
  useFrame(({ clock }) => {
    sim.slots.forEach((s, i) => {
      const g = refs.current[i]
      if (!g) return
      const v = s.vehicle ? sim.vehicle(s.vehicle) : null
      g.visible = !!v && (v.phase === 'loading' || v.phase === 'closing')
      g.rotation.y = (s.side === 'N' ? Math.PI : 0) + Math.sin(clock.elapsedTime * 1.6 + i) * 0.5
    })
  })
  return (
    <Merge>
      {sim.slots.map((s, i) => (
        <group
          key={s.id}
          userData={{ dynamic: true }}
          ref={(o) => { refs.current[i] = o }}
          position={[s.x + 1.05, 0, s.side === 'N' ? L.VAN_N_REAR + 0.5 : L.VAN_S_REAR - 0.5]}
        >
          <Person vest={i % 3 === 0 ? '#2F55E6' : '#FF8A1F'} />
        </group>
      ))}
    </Merge>
  )
}

const TINTS = ['#D7A86E', '#C99A60', '#E2BC88', '#F1F3F8', '#B9CBF2']

/** 컨베이어 위 택배 상자(인스턴스) */
export function Parcels() {
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(rboxGeo(0.5, 0.34, 0.42, 0.04, 1), mat('#ffffff', { rough: 0.8 }), 320)
    m.castShadow = true
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    for (let i = 0; i < 320; i++) m.setColorAt(i, new THREE.Color(TINTS[i % TINTS.length]))
    return m
  }, [])
  const o = useMemo(() => new THREE.Object3D(), [])
  const c = useMemo(() => new THREE.Color(), [])
  useFrame(() => {
    const list = sim.parcels
    const n = Math.min(list.length, 320)
    for (let i = 0; i < n; i++) {
      const p = list[i]
      o.position.set(p.x, p.y, p.z)
      o.rotation.set(0, p.spin, 0)
      o.scale.setScalar(p.size)
      o.updateMatrix()
      mesh.setMatrixAt(i, o.matrix)
      mesh.setColorAt(i, c.set(TINTS[Math.floor(p.tint * TINTS.length)]))
    }
    mesh.count = n
    mesh.instanceMatrix.needsUpdate = true
    refreshBounds(mesh)
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })
  return <primitive object={mesh} {...pickHandlers({ kind: 'sorter', id: 'S1' })} />
}

/** 본동 셔터·벨트·차단기 등 사이트 설비 애니메이션 */
export function SiteDynamics() {
  const refs = useMemo<DoorRefs>(() => ({ inDoors: [], docks: [] }), [])
  const belt = useMemo(() => beltTex(), [])
  useFrame(() => {
    sim.doors.forEach((d, i) => {
      const o = refs.inDoors[i]
      if (o) o.scale.y = 1 - 0.92 * d.open
    })
    sim.docks.forEach((d, i) => {
      const o = refs.docks[i]
      if (o) o.scale.y = 1 - 0.92 * d.open
    })
    const tile = (L.CONVEYOR.x1 - L.CONVEYOR.x0) / 40
    belt.offset.x = -((sim.belt / tile) % 1)
  })
  return (
    <group>
      <Merge {...pickHandlers({ kind: 'site', id: 'GJ' })}>
        <HubBuilding refs={refs} />
      </Merge>
    </group>
  )
}
