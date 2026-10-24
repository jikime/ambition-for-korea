// 인천공항 움직이는 것들: 화물기, ULD(항공 컨테이너·팔레트), 메인덱 로더, 견인차·돌리 열차, 유도원
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { sim } from '../../sim/sim'
import { AC_GROUND_Y, AP, DOOR, type Aircraft } from '../../sim/airport'
import { B, RB, cylGeo, mat, rboxGeo, unitBox, refreshBounds } from '../kit'
import { loadTex } from '../textures'
import { Merge } from '../merge'
import { AircraftModel } from '../models/aircraft'
import { Person } from '../models/equipment'
import { pickHandlers } from './Vehicles'
import { lampMaterial } from '../env/state'

function AircraftEntity({ i }: { i: number }) {
  const a: Aircraft = sim.airport.aircraft[i]
  const group = useRef<THREE.Group>(null)
  const gear = useRef<THREE.Group>(null)
  const door = useRef<THREE.Group>(null)
  const beacon = useRef<THREE.Mesh>(null)
  const pick = useMemo(() => pickHandlers({ kind: 'aircraft', id: a.id }), [a.id])
  useFrame(({ clock }) => {
    const g = group.current
    if (!g) return
    g.visible = a.phase !== 'away'
    if (!g.visible) return
    g.position.set(a.x, a.y + AC_GROUND_Y, a.z)
    g.rotation.set(-a.pitch, a.heading, 0, 'YXZ')
    if (gear.current) {
      gear.current.scale.y = Math.max(0.05, a.gear)
      gear.current.visible = a.gear > 0.05
    }
    if (door.current) door.current.rotation.z = a.door * 1.45
    if (beacon.current) beacon.current.visible = Math.sin(clock.elapsedTime * 6 + i) > 0.3
  })
  return (
    <group ref={group} {...pick}>
      <AircraftModel airline={a.airline} refs={{ gear, door, beacon }} />
    </group>
  )
}

const ULD_MAX = 48

/** ULD: AKE(알루미늄 컨테이너) · PMC(망을 씌운 팔레트) · RKN(냉장 컨테이너) */
function Ulds() {
  const meshes = useMemo(() => {
    const ake = new THREE.InstancedMesh(rboxGeo(1.56, 1.6, 1.5, 0.06, 1), mat('#C9CED8', { rough: 0.45, metal: 0.4 }), ULD_MAX)
    const net = new THREE.MeshStandardMaterial({ map: loadTex('mixed'), roughness: 0.8 })
    const pmc = new THREE.InstancedMesh(unitBox, [net, net, mat('#D9AE76'), mat('#9AA4B8'), net, net] as THREE.Material[], ULD_MAX)
    const rkn = new THREE.InstancedMesh(rboxGeo(1.56, 1.6, 1.5, 0.06, 1), mat('#F4F6FB', { rough: 0.4 }), ULD_MAX)
    for (const m of [ake, pmc, rkn]) {
      m.castShadow = true
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    }
    return { ake, pmc, rkn }
  }, [])
  const o = useMemo(() => new THREE.Object3D(), [])
  useFrame(() => {
    const n = { AKE: 0, PMC: 0, RKN: 0 }
    for (const u of sim.airport.ulds) {
      if (!u.vis) continue
      const m = u.kind === 'AKE' ? meshes.ake : u.kind === 'PMC' ? meshes.pmc : meshes.rkn
      const k = n[u.kind]
      if (k >= ULD_MAX) continue
      o.position.set(u.x, u.kind === 'PMC' ? u.y - 0.05 : u.y, u.z)
      o.rotation.set(0, u.heading, 0)
      if (u.kind === 'PMC') o.scale.set(2.4, 1.5, 3.0)
      else o.scale.set(1, 1, 1)
      o.updateMatrix()
      m.setMatrixAt(k, o.matrix)
      n[u.kind]++
    }
    meshes.ake.count = n.AKE
    meshes.pmc.count = n.PMC
    meshes.rkn.count = n.RKN
    for (const m of [meshes.ake, meshes.pmc, meshes.rkn]) {
      m.instanceMatrix.needsUpdate = true
      refreshBounds(m)
    }
  })
  return (
    <group>
      <primitive object={meshes.ake} />
      <primitive object={meshes.pmc} />
      <primitive object={meshes.rkn} />
    </group>
  )
}

/** 메인덱 로더(K-로더): 차체 + 오르내리는 상판 + 문으로 잇는 브리지 */
function Loader({ k }: { k: number }) {
  const deck = useRef<THREE.Group>(null)
  const arms = useRef<THREE.Group>(null)
  const lp = sim.airport.loaderPos(k)
  useFrame(() => {
    const s = sim.airport.stands[k]
    const a = sim.airport.aircraft[s.ac]
    const vis = !!a && a.phase === 'parked'
    if (deck.current) {
      deck.current.visible = vis
      deck.current.position.y = s.lift
    }
    if (arms.current) {
      arms.current.visible = vis
      arms.current.scale.y = Math.max(0.1, s.lift - 0.6)
    }
  })
  return (
    <group position={[lp.x, 0, lp.z]}>
      <Merge>
        <B s={[3.4, 0.9, 6.2]} p={[0.4, 0.75, 0]} c="#F2B92B" />
        <B s={[1.8, 1.6, 1.6]} p={[0.4, 1.5, 3.6]} c="#F2B92B" />
        <B s={[1.6, 0.8, 0.05]} p={[0.4, 1.9, 4.42]} c="#2B3654" cast={false} />
        {[-2.4, 2.4].flatMap((z) => [-1.2, 2].map((x) => <mesh key={`${x}${z}`} geometry={cylGeo(0.45, 0.45, 0.35, 12)} rotation={[0, 0, Math.PI / 2]} position={[x, 0.45, z]} material={mat('#23262E')} />))}
      </Merge>
      <group ref={arms} position={[0.4, 0.6, 0]}>
        <mesh geometry={unitBox} position={[0, 0.5, 1.2]} rotation={[0.5, 0, 0]} scale={[0.2, 1, 0.2]} material={mat('#7A808C', { metal: 0.4 })} />
        <mesh geometry={unitBox} position={[0, 0.5, -1.2]} rotation={[-0.5, 0, 0]} scale={[0.2, 1, 0.2]} material={mat('#7A808C', { metal: 0.4 })} />
      </group>
      <group ref={deck}>
        <B s={[3.2, 0.3, 3.4]} p={[0, 0, 0]} c="#E3E7F0" />
        {/* 화물문 쪽으로 뻗는 브리지 */}
        <B s={[6.4 - 1.6 - DOOR.x + 0.2, 0.15, 2.8]} p={[-(1.6 + (6.4 - 1.6 - DOOR.x) / 2), 0.05, 0]} c="#C3CAD8" />
        <B s={[3.2, 0.5, 0.06]} p={[0, 0.4, 1.7]} c={'#F2B92B'} />
        <B s={[3.2, 0.5, 0.06]} p={[0, 0.4, -1.7]} c={'#F2B92B'} />
      </group>
    </group>
  )
}

/** 견인차 + 돌리 3대 */
function TugTrain({ k }: { k: number }) {
  const tug = useRef<THREE.Group>(null)
  const dollies = useRef<(THREE.Group | null)[]>([])
  useFrame(() => {
    const A = sim.airport
    const t = tug.current
    if (t) {
      const p = A.trainPose(k, A.stands[k].tugD)
      t.position.set(p.x, 0, p.z)
      t.rotation.y = p.heading
    }
    dollies.current.forEach((g, i) => {
      if (!g) return
      const p = A.dollyPose(k, i)
      g.position.set(p.x, 0, p.z)
      g.rotation.y = p.heading
    })
  })
  return (
    <group>
      <group ref={tug}>
        <Merge>
          <RB s={[1.7, 1.1, 2.6]} rad={0.15} p={[0, 0.85, 0]} c="#2F55E6" />
          <B s={[1.5, 1.0, 1.1]} p={[0, 1.8, -0.5]} c="#E3E7F0" />
          <B s={[1.42, 0.6, 0.05]} p={[0, 1.95, 0.06]} c="#2B3654" cast={false} />
          {[-0.95, 0.95].flatMap((z) => [-0.8, 0.8].map((x) => <mesh key={`${x}${z}`} geometry={cylGeo(0.36, 0.36, 0.3, 12)} rotation={[0, 0, Math.PI / 2]} position={[x, 0.36, z]} material={mat('#23262E')} />))}
        </Merge>
        <mesh geometry={unitBox} position={[0, 2.38, -0.5]} scale={[0.3, 0.12, 0.2]} material={lampMaterial(mat('#FFB020', { emissive: '#FFB020', emissiveIntensity: 0.8 }))} />
      </group>
      {[0, 1, 2].map((i) => (
        <group key={i} ref={(g) => { dollies.current[i] = g }}>
          <Merge>
            <B s={[2.0, 0.12, 2.9]} p={[0, 0.48, 0]} c="#6B7383" />
            <B s={[0.1, 0.1, 1.2]} p={[0, 0.35, 2.0]} c="#4A505C" />
            {[-1.0, 1.0].flatMap((z) => [-0.8, 0.8].map((x) => <mesh key={`${x}${z}`} geometry={cylGeo(0.22, 0.22, 0.2, 10)} rotation={[0, 0, Math.PI / 2]} position={[x, 0.22, z]} material={mat('#23262E')} />))}
          </Merge>
        </group>
      ))}
    </group>
  )
}

/** 유도원: 항공기가 들어올 때 정지선 앞에서 봉을 흔든다 */
function Marshal({ k }: { k: number }) {
  const g = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const s = AP.stands[k]
  useFrame(({ clock }) => {
    const on = sim.airport.stands[k].marshal
    if (g.current) g.current.visible = on
    const t = Math.sin(clock.elapsedTime * 3) * 0.6
    if (armL.current) armL.current.rotation.z = 2.4 + t
    if (armR.current) armR.current.rotation.z = -2.4 - t
  })
  const wand = lampMaterial(mat('#FF7A1F', { emissive: '#FF7A1F', emissiveIntensity: 1 }))
  return (
    <group ref={g} position={[s.x, 0, s.z + 34]} rotation={[0, Math.PI, 0]}>
      <Person vest="#FF8A1F" />
      {[[armL, 0.3], [armR, -0.3]].map(([ref, x], i) => (
        <group key={i} ref={ref as React.RefObject<THREE.Group>} position={[x as number, 1.35, 0]}>
          <mesh geometry={unitBox} position={[0, -0.3, 0]} scale={[0.08, 0.6, 0.08]} material={mat('#FF8A1F')} />
          <mesh geometry={unitBox} position={[0, -0.85, 0]} scale={[0.07, 0.6, 0.07]} material={wand} />
        </group>
      ))}
    </group>
  )
}

export function Airport() {
  return (
    <group>
      {sim.airport.aircraft.map((_, i) => <AircraftEntity key={i} i={i} />)}
      <Ulds />
      {AP.stands.map((_, k) => (
        <group key={k}>
          <Loader k={k} />
          <TugTrain k={k} />
          <Marshal k={k} />
        </group>
      ))}
    </group>
  )
}
