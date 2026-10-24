// 철송: 셔틀 열차(노선을 따라 칸마다 자세를 계산) · 부산·곤지암 철송장 RMG · 화차와 장치 줄의 컨테이너를 sim.rail에서 매 프레임 반영한다.
// 컨테이너는 인스턴스 하나(색만 다름), 차량 한 칸과 RMG는 Merge로 묶어 그룹째 옮긴다.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { sim } from '../../sim/sim'
import { CARS, RAIL, TERMINALS, bayX, carPose, type RailTerminal, type TermId } from '../../sim/rail'
import { Merge } from '../merge'
import { unitBox } from '../kit'
import { corrugatedMat } from '../sharedMats'
import { FlatWagon, Locomotive, RmgFrame, RmgTrolley, Spreader } from '../models/rail'
import { pickHandlers } from './Vehicles'

const MAXBOX = RAIL.wagons + 2 * (RAIL.wagons * 2 * 4) + 2
const H = 16

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

/** 셔틀 열차: 앞 기관차 · 화차 9량 · 뒤 기관차(밀고 끄는 셔틀). 칸마다 노선 위 자세를 따로 잡는다 */
function Train() {
  const refs = useRef<(THREE.Group | null)[]>([])
  const handlers = useMemo(() => pickHandlers({ kind: 'site', id: 'BS' }), [])
  useFrame(() => {
    const s = sim.rail.s
    CARS.forEach((c, i) => {
      const g = refs.current[i]
      if (!g) return
      const p = carPose(s + c.u, c.len)
      g.position.set(p.x, p.y, p.z)
      g.rotation.set(0, p.yaw + (c.flip ? Math.PI : 0), c.flip ? -p.pitch : p.pitch, 'YZX')
    })
  })
  return (
    <group {...handlers}>
      {CARS.map((c, i) => (
        <group key={i} ref={(o) => { refs.current[i] = o }}>
          <Merge>{c.kind === 'loco' ? <Locomotive /> : <FlatWagon />}</Merge>
        </group>
      ))}
    </group>
  )
}

export function RailYard() {
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
    const R = sim.rail
    let n = 0
    const commit = (col: string) => {
      o.scale.set(12.2, 2.6, 2.44)
      o.updateMatrix()
      boxes.setMatrixAt(n, o.matrix)
      boxes.setColorAt(n, c.set(col))
      n++
    }
    // 화차 위: 칸의 자세(기울기 포함)를 그대로 따른다
    R.wagons.forEach((b, i) => {
      if (!b || n >= MAXBOX) return
      const car = CARS[i + 1]
      const p = carPose(R.s + car.u, car.len)
      o.position.set(p.x, p.y, p.z)
      o.rotation.set(0, p.yaw, p.pitch, 'YZX')
      o.translateY(RAIL.deck + 1.3)
      commit(b.color)
    })
    o.rotation.set(0, 0, 0)
    for (const id of ['BS', 'GJ'] as const) {
      const T = term(id)
      T.stack.forEach((row, r) => row.forEach((pile, bay) => pile.forEach((b, k) => {
        if (n >= MAXBOX - 2) return
        o.position.set(bayX(id, bay), k * 2.6 + 1.3, T.spec.stackZ[r])
        commit(b.color)
      })))
      if (T.rmg.box && n < MAXBOX) {
        o.position.set(T.rmg.x, T.rmg.hy - 1.35, T.rmg.tz)
        commit(T.rmg.box.color)
      }
    }
    boxes.count = n
    boxes.instanceMatrix.needsUpdate = true
    if (boxes.instanceColor) boxes.instanceColor.needsUpdate = true
  })
  return (
    <group>
      <primitive object={boxes} />
      <Train />
      <RmgRig id="BS" />
      <RmgRig id="GJ" />
    </group>
  )
}
