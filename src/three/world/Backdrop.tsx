import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { CameraControlsImpl } from '@react-three/drei'
import * as THREE from 'three'
import { Apartment, Industrial, ShippingContainer, StreetLight } from '../models/structures'
import { CarModel, BoxTruckModel } from '../models/vehicles'
import { PalletStack, RollCage } from '../models/equipment'
import { Prop } from '../props'
import * as L from '../../sim/layout'
import { sim } from '../../sim/sim'
import { LANES } from '../../sim/traffic'
import { mergeStatic } from '../merge'

/** 배경 도시: 아파트 단지와 주변 물류창고 */
export function Backdrop() {
  return (
    <group>
      {[
        [-150, -132, 52, '101'], [-112, -128, 58, '102'], [-74, -134, 48, '103'],
        [-30, -130, 56, '104'], [10, -136, 50, '105'], [52, -128, 60, '106'], [92, -134, 46, '107'],
        [-128, -176, 62, '108'], [-82, -180, 58, '109'], [-36, -178, 64, '110'], [8, -182, 56, '111'], [56, -176, 62, '112'],
      ].map(([x, z, h, label]) => (
        <Apartment key={label as string} p={[x as number, z as number]} h={h as number} label={label as string} />
      ))}
      <Industrial p={[160, -20]} w={48} d={40} h={12} roof="#AFC0EA" />
      <Industrial p={[150, 18]} w={30} d={20} h={7} roof="#C4CEE6" />
      <Industrial p={[24, 88]} w={52} d={28} h={9} roof="#C4CEE6" />
      <Industrial p={[260, -40]} w={56} d={40} h={11} roof="#B9C6E6" />
      {/* 다온휴게소(x -262 ~ -78) 자리를 비워 두고 바깥으로 */}
      <Industrial p={[-282, -44]} w={50} d={36} h={10} roof="#C4CEE6" />
      <Industrial p={[-300, 112]} w={44} d={30} h={9} />
      {[-30, -2, 26].map((x) => (
        <StreetLight key={`y${x}`} p={[x, L.YARD.z + 4.6]} rot={Math.PI} />
      ))}
    </group>
  )
}

/** 정적 야적물: 컨테이너, 롤테이너, 빈 파렛트 */
export function YardProps() {
  return (
    <group>
      {[
        [24, 29.8, 0, 'HANMAR', '#1F9C9A'], [27, 29.8, 0, 'SEOHAE', '#E07A35'], [30, 29.8, 0, 'DAON', '#2F55E6'],
        [27, 29.8, 2.6, 'HANMAR', '#1F9C9A'], [36.5, 29.8, 0, 'KORI', '#8A94A8'], [39.5, 29.8, 0, 'DAON', '#2F55E6'],
      ].map(([x, z, y, n, c], i) => (
        <group key={i} position={[x as number, y as number, z as number]}>
          <ShippingContainer name={n as string} color={c as string} />
        </group>
      ))}
      {Array.from({ length: 3 }, (_, row) =>
        Array.from({ length: 10 }, (_, col) => (
          <group key={`${row}-${col}`} position={[-15.5 + col * 1.0, 0, 28 + row * 1.6]}>
            <RollCage fill={row === 2 && col % 3 === 0 ? 0.5 : 0} color={col % 4 === 0 ? '#22377F' : '#2F55E6'} />
          </group>
        )),
      )}
      {[[0, 28.2, 7], [1.5, 28.2, 5], [3, 28.2, 8], [0, 30.2, 6], [1.5, 30.2, 9], [5, 30.6, 4], [7.5, 28.6, 6]].map(([x, z, n], i) => (
        <group key={i} position={[x, 0, z]}>
          <PalletStack n={n} />
        </group>
      ))}
      {[[57.2, 31], [57.2, 29.6], [66.8, 30.8]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <Prop id="traffic-cone" />
        </group>
      ))}
      {/* 지게차 충전 구역(바닥 표시) 앞 모서리 안전 콘 */}
      {[-28.5, -20.5].map((x) => (
        <group key={x} position={[x, 0, -4.6]}>
          <Prop id="traffic-cone" />
        </group>
      ))}
      {/* 관리동 주차장 */}
      {[[-2, '#F4F6FA', 'sedan'], [1, '#2D3445', 'suv'], [4, '#B8C2D6', 'sedan'], [10, '#F4F6FA', 'suv'], [13, '#5D79E8', 'sedan']].map(([dx, c, k], i) => (
        <group key={i} position={[36 + (dx as number), 0, 2.2]} rotation={[0, Math.PI, 0]}>
          <CarModel color={c as string} kind={k as 'sedan' | 'suv'} />
        </group>
      ))}
    </group>
  )
}

/** 차종 틀: 0 승용 · 1 SUV · 2~4 화물차(운송사별). 승용·SUV는 흰 차체에 차마다 색을 곱한다 */
const CAR_KINDS = ['sedan', 'suv', 'donghae', 'hangil', 'baro'] as const
const kindIndex = (c: { kind: string; color: string }) => (c.kind === 'truck' ? CAR_KINDS.indexOf(c.color as 'donghae') : c.kind === 'suv' ? 1 : 0)

interface FleetPart { k: number; geo: THREE.BufferGeometry; mat: THREE.Material; tint: boolean; cast: boolean }

/**
 * 간선도로 일반 차량: 위치는 시뮬레이션(sim.traffic)이 정한다(앞차·트럭·보행자 앞에서 줄을 선다).
 * 차종마다 모델을 한 번 합쳐(Merge와 같은 방식) 인스턴스로 그리므로, 차가 늘어도 그리기 명령은 차종 × 재질 수만큼이다.
 */
export function Traffic() {
  const tpl = useRef<THREE.Group>(null)
  const all = useRef<THREE.Group>(null)
  const meshes = useRef<(THREE.InstancedMesh | null)[]>([])
  const [parts, setParts] = useState<FleetPart[]>([])
  const controls = useThree((s) => s.controls) as unknown as CameraControlsImpl | null
  const cars = sim.traffic.cars
  const count = useMemo(() => CAR_KINDS.map((_, k) => cars.filter((c) => kindIndex(c) === k).length), [cars])
  useLayoutEffect(() => {
    const root = tpl.current
    if (!root) return
    const out: FleetPart[] = []
    root.children.forEach((g, k) => {
      for (const m of mergeStatic(g, true)) {
        m.removeFromParent()
        const mt = m.material as THREE.MeshStandardMaterial
        out.push({ k, geo: m.geometry, mat: mt, tint: k < 2 && mt.metalness < 0.1 && !mt.transparent, cast: m.castShadow })
      }
    })
    setParts(out)
    return () => {
      for (const p of out) {
        p.geo.dispose()
        p.mat.dispose()
      }
    }
  }, [])
  // 승용·SUV 차체 색
  useLayoutEffect(() => {
    const col = new THREE.Color()
    parts.forEach((p, i) => {
      const m = meshes.current[i]
      if (!m || !p.tint) return
      let j = 0
      for (const c of cars) {
        if (kindIndex(c) !== p.k) continue
        m.setColorAt(j++, col.set(c.color))
      }
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    })
  }, [parts, cars])
  const m4 = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const pos = useMemo(() => new THREE.Vector3(), [])
  const one = useMemo(() => new THREE.Vector3(1, 1, 1), [])
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  useFrame(() => {
    // 전국 보기처럼 아주 멀면 그리지 않는다
    const show = (controls?.distance ?? 0) < 700
    if (all.current) all.current.visible = show
    if (!show) return
    const slot = CAR_KINDS.map(() => 0)
    for (const c of cars) {
      const k = kindIndex(c)
      const lane = LANES[c.lane]
      pos.set(c.x, 0, lane.z + c.zOff)
      q.setFromAxisAngle(up, lane.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
      m4.compose(pos, q, one)
      const j = slot[k]++
      parts.forEach((p, i) => {
        if (p.k === k) meshes.current[i]?.setMatrixAt(j, m4)
      })
    }
    for (const m of meshes.current) if (m) m.instanceMatrix.needsUpdate = true
  })
  return (
    <>
      <group ref={tpl} visible={false}>
        <group><CarModel color="#FFFFFF" kind="sedan" /></group>
        <group><CarModel color="#FFFFFF" kind="suv" /></group>
        <group><BoxTruckModel carrier="donghae" /></group>
        <group><BoxTruckModel carrier="hangil" /></group>
        <group><BoxTruckModel carrier="baro" /></group>
      </group>
      <group ref={all}>
        {parts.map((p, i) => (
          <instancedMesh
            key={i}
            ref={(o) => { meshes.current[i] = o }}
            args={[p.geo, p.mat, Math.max(1, count[p.k])]}
            count={count[p.k]}
            castShadow={p.cast}
            receiveShadow
            frustumCulled={false}
          />
        ))}
      </group>
    </>
  )
}
