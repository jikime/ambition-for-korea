// 부산신항 철송장: 셔틀 열차 · RMG · 화차와 장치 줄의 컨테이너를 sim.rail에서 매 프레임 반영한다.
// 컨테이너는 인스턴스 하나(색만 다름), 열차·RMG는 Merge로 묶어 그룹째 옮긴다.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { sim } from '../../sim/sim'
import { RAIL, wagonX } from '../../sim/rail'
import { Merge } from '../merge'
import { unitBox } from '../kit'
import { corrugatedMat } from '../sharedMats'
import { FlatWagon, Locomotive, RmgFrame, RmgTrolley, Spreader } from '../models/rail'
import { pickHandlers } from './Vehicles'

const MAXBOX = RAIL.wagons + RAIL.wagons * 2 * 3 + 1
const H = 16
const MID = (RAIL.rmgZ0 + RAIL.rmgZ1) / 2
/** 지도 끝: 열차 앞이 이보다 동쪽이면 숨긴다 */
const EDGE = 1150

export function RailYard() {
  const train = useRef<THREE.Group>(null)
  const rmg = useRef<THREE.Group>(null)
  const trolley = useRef<THREE.Group>(null)
  const spreader = useRef<THREE.Group>(null)
  const cable = useRef<THREE.Mesh>(null)
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
  const cableMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2E3442', roughness: 0.6 }), [])
  const o = useMemo(() => new THREE.Object3D(), [])
  const c = useMemo(() => new THREE.Color(), [])
  useFrame(() => {
    const R = sim.rail
    if (train.current) {
      train.current.position.x = R.x
      train.current.visible = R.x < EDGE
    }
    if (rmg.current) rmg.current.position.x = R.rmg.x
    if (trolley.current) trolley.current.position.z = R.rmg.tz - MID
    if (spreader.current) spreader.current.position.set(0, R.rmg.hy, R.rmg.tz - MID)
    if (cable.current) {
      const top = H + 0.8
      const bot = R.rmg.hy + 0.8
      cable.current.scale.y = Math.max(0.1, top - bot)
      cable.current.position.set(0, (top + bot) / 2, R.rmg.tz - MID)
    }
    let n = 0
    const put = (x: number, y: number, z: number, col: string) => {
      o.position.set(x, y, z)
      o.scale.set(12.2, 2.6, 2.44)
      o.updateMatrix()
      boxes.setMatrixAt(n, o.matrix)
      boxes.setColorAt(n, c.set(col))
      n++
    }
    if (R.x < EDGE) R.wagons.forEach((col, i) => { if (col) put(wagonX(R.x, i), RAIL.deck + 1.3, RAIL.z, col) })
    R.stack.forEach((row, r) => row.forEach((pile, b) => pile.forEach((col, k) => {
      if (n < MAXBOX - 1) put(wagonX(RAIL.stopX, b), k * 2.6 + 1.3, RAIL.stackZ[r], col)
    })))
    if (R.rmg.box) put(R.rmg.x, R.rmg.hy - 1.35, R.rmg.tz, R.rmg.box)
    boxes.count = n
    boxes.instanceMatrix.needsUpdate = true
    if (boxes.instanceColor) boxes.instanceColor.needsUpdate = true
  })
  const L = RAIL.locoLen
  return (
    <group {...handlers}>
      <primitive object={boxes} />
      {/* 열차: 앞(서쪽) 기관차 · 화차 9량 · 뒤 기관차(밀고 끄는 셔틀) */}
      <group ref={train} position={[RAIL.stopX, 0, RAIL.z]}>
        <Merge>
          <group position={[L / 2, 0, 0]}><Locomotive /></group>
          {Array.from({ length: RAIL.wagons }, (_, i) => (
            <group key={i} position={[L + RAIL.wagonLen * (i + 0.5), 0, 0]}><FlatWagon /></group>
          ))}
          <group position={[L * 1.5 + RAIL.wagonLen * RAIL.wagons, 0, 0]} rotation={[0, Math.PI, 0]}><Locomotive /></group>
        </Merge>
      </group>
      {/* RMG */}
      <group ref={rmg} position={[wagonX(RAIL.stopX, 0), 0, MID]}>
        <Merge><RmgFrame span={RAIL.rmgZ1 - RAIL.rmgZ0} h={H} /></Merge>
        <group ref={trolley}><Merge><RmgTrolley h={H} /></Merge></group>
        <group ref={spreader}><Merge><Spreader /></Merge></group>
        <mesh ref={cable} geometry={unitBox} scale={[0.12, 1, 1.6]} material={cableMat} />
      </group>
    </group>
  )
}
