// 거리의 사람들(인스턴스로 한 번에 그린다)과 오토바이·배송 로봇·드론
import { useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { sim } from '../../sim/sim'
import type { Mover } from '../../sim/life'
import { B, Cyl, RB, coneGeo, cylGeo, mat, rboxGeo, sphereGeo, unitBox, refreshBounds } from '../kit'
import { labelTex } from '../textures'
import { Merge } from '../merge'
import { Decal } from '../models/structures'
import { lampMaterial, useEnvView } from '../env/state'
import { useStore } from '../../store'
import { pickHandlers } from './Vehicles'
import { L } from '../../i18n'

const M4 = THREE.Matrix4
const tmp = new M4()
const base = new M4()
const q = new THREE.Quaternion()
const up = new THREE.Vector3(0, 1, 0)
const vs = new THREE.Vector3()
const vp = new THREE.Vector3()
const col = new THREE.Color()
const vx = new THREE.Vector3(1, 0, 0)

/** 사람: 다리 2 · 몸통 · 머리 · 머리카락/모자 · 형광 띠 · 든 물건 */
function Crowd() {
  const people = useMemo(() => sim.life.movers.filter((m) => m.kind === 'person'), [])
  const n = people.length
  const meshes = useMemo(() => {
    const mk = (g: THREE.BufferGeometry, m: THREE.Material, cast = true, count = n) => {
      const x = new THREE.InstancedMesh(g, m, count)
      x.castShadow = cast
      x.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      x.frustumCulled = false
      return x
    }
    return {
      leg: mk(unitBox, mat('#ffffff'), true, n * 2),
      body: mk(rboxGeo(0.5, 0.62, 0.3, 0.12, 2), mat('#ffffff')),
      head: mk(sphereGeo(0.15, 12, 10), mat('#F1C8A5')),
      hair: mk(sphereGeo(0.165, 12, 8), mat('#ffffff')),
      vest: mk(unitBox, mat('#E7F05A', { emissive: '#E7F05A', emissiveIntensity: 0.15 }), false),
      box: mk(rboxGeo(0.42, 0.3, 0.34, 0.03, 1), mat('#D6A76C')),
      bag: mk(unitBox, mat('#F4F6FB')),
      // 소품: 유모차(몸체·덮개), 강아지(몸·머리)와 목줄, 장바구니 카트, 비 오는 날 우산
      stroller: mk(rboxGeo(0.5, 0.42, 0.75, 0.08, 1), mat('#3B4252'), true, 8),
      hood: mk(sphereGeo(0.3, 10, 6), mat('#5D79E8'), false, 8),
      dog: mk(rboxGeo(0.22, 0.24, 0.55, 0.08, 1), mat('#C99A60'), true, 8),
      dogHead: mk(sphereGeo(0.13, 8, 6), mat('#B9884F'), false, 8),
      leash: mk(unitBox, mat('#E2453C'), false, 8),
      cart: mk(unitBox, mat('#7A5CFF'), true, 8),
      umbrella: mk(coneGeo(0.62, 0.32, 10), mat('#ffffff', { rough: 0.5 }), false, n),
    }
  }, [n])
  // 옷 색은 한 번만
  useMemo(() => {
    people.forEach((p, i) => {
      meshes.body.setColorAt(i, col.set(p.look.vest ? '#FF8A1F' : p.look.top))
      meshes.leg.setColorAt(i * 2, col.set(p.look.bottom))
      meshes.leg.setColorAt(i * 2 + 1, col.set(p.look.bottom))
      meshes.hair.setColorAt(i, col.set(p.look.helmet ?? p.look.hair))
    })
    const UMB = ['#2F55E6', '#E45B4B', '#F2B92B', '#3E9A5A', '#2D3445', '#F4F6FA', '#7A4CC2']
    people.forEach((_, i) => meshes.umbrella.setColorAt(i, col.set(UMB[(i * 5) % UMB.length])))
    for (const m of [meshes.body, meshes.leg, meshes.hair, meshes.umbrella]) if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [people, meshes])
  const put = (mesh: THREE.InstancedMesh, i: number, local: THREE.Matrix4) => {
    tmp.multiplyMatrices(base, local)
    mesh.setMatrixAt(i, tmp)
  }
  const local = useMemo(() => new M4(), [])
  const world = useMemo(() => new M4(), [])
  // 사람을 누르면 그 사람을 고른다(다리는 두 개씩 그려 번호를 반으로)
  const pick = useMemo(() => {
    const who = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
      const i = e.instanceId
      if (i === undefined) return null
      const idx = (e.object as THREE.InstancedMesh) === meshes.leg ? Math.floor(i / 2) : i
      return people[idx] ?? null
    }
    return {
      onClick: (e: ThreeEvent<MouseEvent>) => {
        const p = who(e)
        if (!p || e.delta > 4) return
        e.stopPropagation()
        useStore.getState().select({ kind: 'mover', id: p.id })
      },
      onPointerOver: (e: ThreeEvent<PointerEvent>) => {
        const p = who(e)
        if (!p) return
        e.stopPropagation()
        useStore.getState().hover({ kind: 'mover', id: p.id })
      },
      onPointerOut: () => useStore.getState().hover(null),
    }
  }, [people, meshes])
  useFrame(() => {
    let legCount = 0
    let boxN = 0
    let bagN = 0
    let vestN = 0
    let strollerN = 0
    let dogN = 0
    let cartN = 0
    let umbN = 0
    const rain = useEnvView.getState().env.weather === 'rain'
    people.forEach((p, i) => {
      const s = p.look.kid ? 0.66 : 1
      q.setFromAxisAngle(up, p.heading)
      base.compose(vp.set(p.x, 0, p.z), q, vs.set(s, s, s))
      const swing = p.moving ? Math.sin(p.walkPhase) * 0.55 : 0
      for (const side of [-1, 1]) {
        // 엉덩이(0.8m)를 축으로 다리를 흔든다
        local.makeTranslation(side * 0.11, 0.8, 0)
        local.multiply(tmp.makeRotationX(side * swing))
        local.multiply(tmp.makeTranslation(0, -0.4, 0))
        local.multiply(tmp.makeScale(0.16, 0.8, 0.2))
        world.multiplyMatrices(base, local)
        meshes.leg.setMatrixAt(legCount++, world)
      }
      local.makeTranslation(0, 1.1, 0)
      put(meshes.body, i, local)
      local.makeTranslation(0, 1.56, 0)
      put(meshes.head, i, local)
      local.compose(vp.set(0, 1.64, 0), q.identity(), vs.set(1, p.look.helmet ? 0.75 : 0.6, 1))
      put(meshes.hair, i, local)
      if (p.look.vest) {
        local.compose(vp.set(0, 1.0, 0), q.identity(), vs.set(0.52, 0.06, 0.32))
        put(meshes.vest, vestN++, local)
      }
      const acc = p.look.acc
      if (acc === 'stroller') {
        local.makeTranslation(0, 0.55, 0.85)
        put(meshes.stroller, strollerN, local)
        local.compose(vp.set(0, 0.8, 0.7), q.identity(), vs.set(1, 0.8, 1))
        put(meshes.hood, strollerN++, local)
      } else if (acc === 'dog') {
        // 강아지는 앞에서 종종걸음(살짝 위아래로)
        const hop = p.moving ? Math.abs(Math.sin(p.walkPhase * 1.6)) * 0.05 : 0
        local.makeTranslation(0.45, 0.24 + hop, 1.25)
        put(meshes.dog, dogN, local)
        local.makeTranslation(0.45, 0.4 + hop, 1.58)
        put(meshes.dogHead, dogN, local)
        local.compose(vp.set(0.38, 0.62, 0.78), q.setFromAxisAngle(vx, 0.9), vs.set(0.02, 0.9, 0.02))
        put(meshes.leash, dogN++, local)
      } else if (acc === 'cart') {
        local.compose(vp.set(0, 0.45, 0.62), q.identity(), vs.set(0.4, 0.55, 0.4))
        put(meshes.cart, cartN++, local)
      }
      if (rain && !p.look.vest && !p.look.kid && !acc) {
        local.makeTranslation(0.15, 2.05, 0.05)
        put(meshes.umbrella, umbN++, local)
      }
      if (p.carry === 'box') {
        local.makeTranslation(0, 1.05, 0.3)
        put(meshes.box, boxN++, local)
      } else if (p.carry === 'bag') {
        local.compose(vp.set(0.32, 0.7, 0), q.identity(), vs.set(0.28, 0.36, 0.14))
        put(meshes.bag, bagN++, local)
      }
    })
    meshes.leg.count = legCount
    meshes.vest.count = vestN
    meshes.box.count = boxN
    meshes.bag.count = bagN
    meshes.stroller.count = meshes.hood.count = strollerN
    meshes.dog.count = meshes.dogHead.count = meshes.leash.count = dogN
    meshes.cart.count = cartN
    meshes.umbrella.count = umbN
    for (const m of Object.values(meshes)) {
      m.instanceMatrix.needsUpdate = true
      refreshBounds(m)
    }
  })
  return (
    <group>
      {Object.entries(meshes).map(([k, m]) => <primitive key={k} object={m} {...(k === 'body' || k === 'head' || k === 'leg' ? pick : {})} />)}
    </group>
  )
}

/** 배달 오토바이(뒤에 배달통) + 헬멧 쓴 운전자 */
function Moto({ m }: { m: Mover }) {
  const g = useRef<THREE.Group>(null)
  useFrame(() => {
    const o = g.current
    if (!o) return
    o.position.set(m.x, 0, m.z)
    o.rotation.y = m.heading
  })
  const post = m.id === 'm-post'
  const boxColor = post ? '#E2463C' : m.id === 'm-food' ? '#FF6B3D' : '#2D3445'
  return (
    <group ref={g} {...pickHandlers({ kind: 'mover', id: m.id })}>
      <Merge>
        {[0.62, -0.62].map((z) => <mesh key={z} geometry={cylGeo(0.3, 0.3, 0.14, 14)} rotation={[0, 0, Math.PI / 2]} position={[0, 0.3, z]} material={mat('#23262E')} />)}
        <RB s={[0.32, 0.36, 1.1]} rad={0.08} p={[0, 0.62, 0]} c={post ? '#E2463C' : '#F4F6FB'} />
        <B s={[0.5, 0.06, 0.3]} p={[0, 1.02, 0.55]} c="#5A6274" />
        <B s={[0.05, 0.6, 0.05]} p={[0, 0.75, 0.6]} c="#5A6274" />
        <RB s={[0.5, 0.42, 0.46]} rad={0.05} p={[0, 0.95, -0.55]} c={boxColor} />
        {/* 운전자 */}
        <B s={[0.15, 0.5, 0.18]} p={[0.15, 0.62, 0.05]} c="#2D3445" />
        <B s={[0.15, 0.5, 0.18]} p={[-0.15, 0.62, 0.05]} c="#2D3445" />
        <RB s={[0.46, 0.58, 0.3]} rad={0.1} p={[0, 1.18, -0.05]} c={m.look.top} />
        <mesh geometry={sphereGeo(0.19, 12, 10)} position={[0, 1.6, 0]} material={mat(m.look.helmet ?? '#2D3445')} castShadow />
      </Merge>
      <mesh geometry={unitBox} position={[0, 0.7, 0.7]} scale={[0.12, 0.08, 0.04]} material={lampMaterial(mat('#FFF6D8', { emissive: '#FFF2C2', emissiveIntensity: 0.6 }))} />
    </group>
  )
}

/** 실외 배송 로봇(6바퀴, 뚜껑 달린 적재함) */
function Robot({ m }: { m: Mover }) {
  const g = useRef<THREE.Group>(null)
  const lid = useRef<THREE.Group>(null)
  useFrame(() => {
    const o = g.current
    if (!o) return
    o.position.set(m.x, 0, m.z)
    o.rotation.y = m.heading
    // 102동 앞에서 멈추면 뚜껑이 열린다
    if (lid.current) lid.current.rotation.x = !m.moving && m.i === 6 ? -1.2 : 0
  })
  return (
    <group ref={g} {...pickHandlers({ kind: 'mover', id: m.id })}>
      <Merge>
        <RB s={[0.62, 0.55, 0.8]} rad={0.12} p={[0, 0.5, 0]} c="#F4F6FB" />
        <B s={[0.64, 0.1, 0.82]} p={[0, 0.42, 0]} c="#2F55E6" />
        {[-0.3, 0, 0.3].flatMap((z) => [-0.33, 0.33].map((x) => <mesh key={`${x}${z}`} geometry={cylGeo(0.11, 0.11, 0.08, 10)} rotation={[0, 0, Math.PI / 2]} position={[x, 0.12, z]} material={mat('#23262E')} />))}
        <Cyl rt={0.012} h={0.9} p={[-0.22, 1.1, -0.3]} c="#9AA4B8" />
        <B s={[0.16, 0.1, 0.01]} p={[-0.14, 1.5, -0.3]} c="#FF6B3D" />
        <B s={[0.4, 0.12, 0.02]} p={[0, 0.6, 0.41]} c="#1A1F2B" />
      </Merge>
      <group ref={lid} position={[0, 0.78, -0.38]}>
        <B s={[0.6, 0.06, 0.78]} p={[0, 0, 0.39]} c="#E3E7F0" />
      </group>
    </group>
  )
}

/** 배송 드론(쿼드콥터) + 매단 상자 + 줄 */
function Drone({ m }: { m: Mover }) {
  const g = useRef<THREE.Group>(null)
  const rotors = useRef<(THREE.Object3D | null)[]>([])
  const pkg = useRef<THREE.Group>(null)
  const line = useRef<THREE.Mesh>(null)
  useFrame((_, dt) => {
    const o = g.current
    if (!o) return
    o.position.set(m.x, m.y, m.z)
    o.rotation.y = m.heading
    o.rotation.x = m.moving ? 0.12 : 0
    rotors.current.forEach((r) => { if (r) r.rotation.y += dt * 40 })
    // 드롭 지점에서 줄을 내려 상자를 내려놓고, 돌아올 때는 빈 채로
    const drop = m.winch * Math.max(0, m.y - 1.2)
    const delivered = m.i >= 3 && m.i < 5 && !(m.i === 3 && m.pause > 3.5)
    if (pkg.current) {
      pkg.current.position.y = -0.55 - drop
      pkg.current.visible = !delivered || m.winch > 0.05
    }
    if (line.current) {
      line.current.visible = m.winch > 0.02
      line.current.scale.y = Math.max(0.01, drop)
      line.current.position.y = -0.3 - drop / 2
    }
  })
  return (
    <group ref={g} {...pickHandlers({ kind: 'mover', id: m.id })}>
      <Merge>
        <RB s={[0.7, 0.24, 0.7]} rad={0.1} p={[0, 0, 0]} c="#F4F6FB" />
        <B s={[0.72, 0.05, 0.1]} p={[0, 0.05, 0]} c="#2F55E6" />
        {[45, 135, 225, 315].map((d) => {
          const a = (d * Math.PI) / 180
          return <B key={d} s={[0.08, 0.06, 1.0]} p={[Math.sin(a) * 0.5, 0.05, Math.cos(a) * 0.5]} r={[0, a, 0]} c="#5A6274" />
        })}
        <B s={[0.05, 0.3, 0.05]} p={[0.2, -0.25, 0]} c="#5A6274" />
        <B s={[0.05, 0.3, 0.05]} p={[-0.2, -0.25, 0]} c="#5A6274" />
      </Merge>
      {[45, 135, 225, 315].map((d, i) => {
        const a = (d * Math.PI) / 180
        return (
          <group key={d} position={[Math.sin(a) * 0.95, 0.14, Math.cos(a) * 0.95]} ref={(o) => { rotors.current[i] = o }}>
            <mesh geometry={unitBox} scale={[0.7, 0.02, 0.07]} material={mat('#2D3445')} />
          </group>
        )
      })}
      <mesh geometry={sphereGeo(0.06, 6, 4)} position={[0, -0.1, 0.36]} material={lampMaterial(mat('#35D07F', { emissive: '#35D07F', emissiveIntensity: 1.2 }))} />
      <mesh ref={line} geometry={unitBox} scale={[0.02, 1, 0.02]} material={mat('#2D3445')} />
      <group ref={pkg}>
        <mesh geometry={rboxGeo(0.4, 0.3, 0.4, 0.03, 1)} material={mat('#D6A76C')} castShadow />
      </group>
    </group>
  )
}

/** 드론 배송 거점(마을 서쪽 끝) */
function DroneStation() {
  return (
    <group position={[-548, 0, 205]}>
      <Merge>
        <B s={[8, 3.2, 6]} p={[-6, 1.6, 0]} c="#F4F6FB" />
        <B s={[8.2, 0.3, 6.2]} p={[-6, 3.3, 0]} c="#2F55E6" />
        <B s={[6, 0.1, 6]} p={[0, 0.06, 0]} c="#2D3445" />
        <B s={[0.5, 0.02, 3.2]} p={[-1, 0.12, 0]} c="#FFFFFF" cast={false} />
        <B s={[0.5, 0.02, 3.2]} p={[1, 0.12, 0]} c="#FFFFFF" cast={false} />
        <B s={[2, 0.02, 0.5]} p={[0, 0.12, 0]} c="#FFFFFF" cast={false} />
        <Decal tex={labelTex(L('드론 배송 거점', 'Drone hub'), '#2F55E6', '#FFFFFF', 360, 96)} w={4.6} h={1.23} p={[-6, 2.4, 3.02]} />
      </Merge>
    </group>
  )
}

export function Life() {
  const movers = sim.life.movers
  return (
    <group>
      <Crowd />
      {movers.filter((m) => m.kind === 'moto').map((m) => <Moto key={m.id} m={m} />)}
      {movers.filter((m) => m.kind === 'robot').map((m) => <Robot key={m.id} m={m} />)}
      {movers.filter((m) => m.kind === 'drone').map((m) => <Drone key={m.id} m={m} />)}
      <DroneStation />
    </group>
  )
}
