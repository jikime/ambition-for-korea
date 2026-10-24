// 철송: 셔틀 열차(노선을 따라 칸마다 자세를 계산) · 부산·곤지암 철송장 RMG · 화차와 장치 줄의 컨테이너를 sim.rail에서 매 프레임 반영한다.
// 열차와 컨테이너는 hubtrace 에셋 팩 GLB(기관차 · 40ft 평판화차 · 40ft 컨테이너, public/assets/models)를 종류마다 InstancedMesh로 그린다.
// GLB를 불러오는 동안에는 코드로 만든 모델(models/rail.tsx)과 상자 인스턴스로 그린다.
import { Suspense, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { sim } from '../../sim/sim'
import { CARS, RAIL, TERMINALS, bayX, carPose, type CarPose, type RailTerminal, type TermId } from '../../sim/rail'
import { Merge } from '../merge'
import { unitBox } from '../kit'
import { corrugatedMat } from '../sharedMats'
import { GlbInstances, glbParts } from '../glb'
import { FlatWagon, Locomotive, RmgFrame, RmgTrolley, Spreader } from '../models/rail'
import { pickHandlers } from './Vehicles'

const MAXBOX = RAIL.wagons + 2 * (RAIL.wagons * 2 * 4) + 2
const H = 16
const URL = {
  loco: '/assets/models/rail-locomotive.glb',
  flat: '/assets/models/container-flatcar.glb',
  box: '/assets/models/shipping-container.glb',
}

const term = (id: TermId): RailTerminal => (id === 'BS' ? sim.rail.bs : sim.rail.gj)

/** 철송장 RMG 한 기: 다리는 rmgZ0 · rmgZ1 레일 위, 거더를 따라 트롤리(z), 그 아래 스프레더(y) */
function RmgRig({ id }: { id: TermId }) {
  const T = TERMINALS[id]
  const mid = (T.rmgZ0 + T.rmgZ1) / 2
  const rmg = useRef<THREE.Group>(null)
  const trolley = useRef<THREE.Group>(null)
  const spreader = useRef<THREE.Group>(null)
  const cable = useRef<THREE.Mesh>(null)
  const handlers = useMemo(() => pickHandlers({ kind: 'site', id }), [id])
  const cableMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2E3442', roughness: 0.6 }), [])
  useFrame(() => {
    const R = term(id).rmg
    if (rmg.current) rmg.current.position.x = R.x
    if (trolley.current) trolley.current.position.z = R.tz - mid
    if (spreader.current) spreader.current.position.set(0, R.hy, R.tz - mid)
    if (cable.current) {
      const top = H + 0.8
      const bot = R.hy + 0.8
      cable.current.scale.y = Math.max(0.1, top - bot)
      cable.current.position.set(0, (top + bot) / 2, R.tz - mid)
    }
  })
  return (
    <group {...handlers}>
      <group ref={rmg} position={[bayX(id, 0), 0, mid]}>
        <Merge><RmgFrame span={T.rmgZ1 - T.rmgZ0} h={H} /></Merge>
        <group ref={trolley}><Merge><RmgTrolley h={H} /></Merge></group>
        <group ref={spreader}><Merge><Spreader /></Merge></group>
        <mesh ref={cable} geometry={unitBox} scale={[0.12, 1, 1.6]} material={cableMat} />
      </group>
    </group>
  )
}

/** 컨테이너가 놓이는 자리를 모두 훑는다: 화차 위(칸 자세·기울기) · 두 철송장 장치 줄 · RMG가 든 것. 자리는 밑면 가운데 */
function eachBox(visit: (pose: CarPose | null, x: number, y: number, z: number, color: string) => void) {
  const R = sim.rail
  R.wagons.forEach((b, i) => {
    if (!b) return
    const car = CARS[i + 1]
    visit(carPose(R.s + car.u, car.len), 0, RAIL.deck, 0, b.color)
  })
  for (const id of ['BS', 'GJ'] as const) {
    const T = term(id)
    T.stack.forEach((row, r) => row.forEach((pile, bay) => pile.forEach((b, k) => visit(null, bayX(id, bay), k * 2.6, T.spec.stackZ[r], b.color))))
    if (T.rmg.box) visit(null, T.rmg.x, T.rmg.hy - 2.65, T.rmg.tz, T.rmg.box.color)
  }
}

/** GLB 열차·컨테이너 */
function GlbRail() {
  const loco = useGLTF(URL.loco)
  const flat = useGLTF(URL.flat)
  const box = useGLTF(URL.box)
  const sets = useMemo(() => ({
    loco: new GlbInstances(glbParts(loco.scene), 2),
    flat: new GlbInstances(glbParts(flat.scene), RAIL.wagons),
    box: new GlbInstances(glbParts(box.scene, /^container_(cobalt|door)/), MAXBOX),
  }), [loco.scene, flat.scene, box.scene])
  const handlers = useMemo(() => pickHandlers({ kind: 'site', id: 'BS' }), [])
  const tmp = useMemo(() => ({ o: new THREE.Object3D(), c: new THREE.Color(), turn: new THREE.Matrix4().makeRotationY(Math.PI / 2) }), [])
  useFrame(() => {
    const { o, c, turn } = tmp
    const R = sim.rail
    /** 칸 자세 → 모델 루트 행렬(모델은 +Z 앞 → 진행 방향 +X로 돌리고, 차륜을 레일 윗면에) */
    const place = (p: CarPose, flip: boolean, lift: number) => {
      o.position.set(p.x, p.y, p.z)
      o.rotation.set(0, p.yaw + (flip ? Math.PI : 0), flip ? -p.pitch : p.pitch, 'YZX')
      o.scale.set(1, 1, 1)
      o.translateY(lift)
      o.updateMatrix()
      return o.matrix.multiply(turn)
    }
    sets.loco.begin()
    sets.flat.begin()
    CARS.forEach((car) => {
      const m = place(carPose(R.s + car.u, car.len), car.flip, RAIL.railTop)
      if (car.kind === 'loco') sets.loco.add(m)
      else sets.flat.add(m)
    })
    sets.loco.end()
    sets.flat.end()
    sets.box.begin()
    eachBox((pose, x, y, z, color) => {
      if (pose) place(pose, false, y)
      else {
        o.position.set(x, y, z)
        o.rotation.set(0, 0, 0)
        o.scale.set(1, 1, 1)
        o.updateMatrix()
        o.matrix.multiply(turn)
      }
      sets.box.add(o.matrix, c.set(color))
    })
    sets.box.end()
  })
  return (
    <group {...handlers}>
      <primitive object={sets.loco.group} />
      <primitive object={sets.flat.group} />
      <primitive object={sets.box.group} />
    </group>
  )
}

/** GLB를 불러오는 동안: 코드로 만든 열차와 상자 인스턴스 */
function LegacyRail() {
  const refs = useRef<(THREE.Group | null)[]>([])
  const handlers = useMemo(() => pickHandlers({ kind: 'site', id: 'BS' }), [])
  const boxes = useMemo(() => {
    const m = new THREE.InstancedMesh(unitBox, corrugatedMat(), MAXBOX)
    m.castShadow = true
    m.receiveShadow = true
    m.frustumCulled = false
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    for (let i = 0; i < MAXBOX; i++) m.setColorAt(i, new THREE.Color('#ffffff'))
    return m
  }, [])
  const o = useMemo(() => new THREE.Object3D(), [])
  const c = useMemo(() => new THREE.Color(), [])
  useFrame(() => {
    const s = sim.rail.s
    CARS.forEach((car, i) => {
      const g = refs.current[i]
      if (!g) return
      const p = carPose(s + car.u, car.len)
      g.position.set(p.x, p.y, p.z)
      g.rotation.set(0, p.yaw + (car.flip ? Math.PI : 0), car.flip ? -p.pitch : p.pitch, 'YZX')
    })
    let n = 0
    eachBox((pose, x, y, z, color) => {
      if (n >= MAXBOX) return
      if (pose) {
        o.position.set(pose.x, pose.y, pose.z)
        o.rotation.set(0, pose.yaw, pose.pitch, 'YZX')
        o.translateY(y + 1.3)
      } else {
        o.position.set(x, y + 1.3, z)
        o.rotation.set(0, 0, 0)
      }
      o.scale.set(12.2, 2.6, 2.44)
      o.updateMatrix()
      boxes.setMatrixAt(n, o.matrix)
      boxes.setColorAt(n, c.set(color))
      n++
    })
    boxes.count = n
    boxes.instanceMatrix.needsUpdate = true
    if (boxes.instanceColor) boxes.instanceColor.needsUpdate = true
  })
  return (
    <group {...handlers}>
      <primitive object={boxes} />
      {CARS.map((car, i) => (
        <group key={i} ref={(g) => { refs.current[i] = g }}>
          <Merge>{car.kind === 'loco' ? <Locomotive /> : <FlatWagon />}</Merge>
        </group>
      ))}
    </group>
  )
}

export function RailYard() {
  return (
    <group>
      <Suspense fallback={<LegacyRail />}>
        <GlbRail />
      </Suspense>
      <RmgRig id="BS" />
      <RmgRig id="GJ" />
    </group>
  )
}
