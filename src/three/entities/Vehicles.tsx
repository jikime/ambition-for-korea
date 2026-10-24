import { memo, useMemo, useRef } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import type { CameraControlsImpl } from '@react-three/drei'
import * as THREE from 'three'
import { sim, type Vehicle } from '../../sim/sim'
import * as L from '../../sim/layout'
import { useStore, type Selection } from '../../store'
import { BoxTruckModel, ChassisModel, Container40, HandCart, ReeferModel, TractorModel, VanModel, WingTruckModel, makeParts } from '../models/vehicles'
import { PalletModel, Person, RollCage } from '../models/equipment'
import { loadTex } from '../textures'
import { unitBox } from '../kit'
import { Merge } from '../merge'

export function pickHandlers(sel: Selection) {
  return {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      if (e.delta > 4) return
      e.stopPropagation()
      useStore.getState().select(sel)
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      useStore.getState().hover(sel)
    },
    onPointerOut: () => useStore.getState().hover(null),
  }
}

/** 트럭 위 파렛트: 아직 실려 있을 때만 파렛트 선택, 아니면 차량 선택으로 넘긴다 */
function cargoHandlers(v: Vehicle, i: number) {
  const live = () => {
    const id = v.cargo[i]
    return id && sim.pallets.get(id)?.state === 'onTruck' ? id : null
  }
  return {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      const id = live()
      if (!id || e.delta > 4) return
      e.stopPropagation()
      useStore.getState().select({ kind: 'pallet', id })
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      const id = live()
      if (!id) return
      e.stopPropagation()
      useStore.getState().hover({ kind: 'pallet', id })
    },
  }
}

const MemoWing = memo(WingTruckModel)
const MemoBox = memo(BoxTruckModel)
const MemoVan = memo(VanModel)
const MemoReefer = memo(ReeferModel)
const MemoTractor = memo(TractorModel)
const MemoChassis = memo(ChassisModel)

function VehicleEntity({ v }: { v: Vehicle }) {
  const group = useRef<THREE.Group>(null)
  const parts = useMemo(makeParts, [])
  const palletRefs = useRef<(THREE.Group | null)[]>([])
  const inner = useRef<THREE.Object3D>(null)
  const trailer = useRef<THREE.Group>(null)
  const box = useRef<THREE.Group>(null)
  const walker = useRef<THREE.Group>(null)
  const receiver = useRef<THREE.Group>(null)
  const guardRx = useRef<THREE.Group>(null)
  const container = useStore(() => v.container)
  const trip = useStore(() => v.trip)
  const looks = useMemo(() => v.cargo.map((id) => (id ? sim.pallets.get(id)?.look ?? 'boxes' : 'boxes')), [trip, v])
  const handlers = useMemo(() => pickHandlers({ kind: 'vehicle', id: v.id }), [v.id])
  const controls = useThree((s) => s.controls) as unknown as CameraControlsImpl | null

  useFrame(() => {
    const g = group.current
    if (!g) return
    // 전국 보기처럼 아주 멀면 모델 대신 비콘만 보인다(선택한 차량은 예외)
    const far = (controls?.distance ?? 0) > 700 && useStore.getState().selected?.id !== v.id
    g.visible = v.visible && !far
    if (trailer.current) trailer.current.visible = g.visible
    if (!g.visible) return
    g.position.set(v.x, 0, v.z)
    g.rotation.y = v.heading
    for (const w of parts.wheels) w.rotation.x = v.wheel
    if (parts.wingR) parts.wingR.rotation.z = 1.25 * v.wing
    if (parts.wingL) parts.wingL.rotation.z = -1.25 * v.wing
    if (parts.doorL) parts.doorL.rotation.y = 1.9 * v.door
    if (parts.doorR) parts.doorR.rotation.y = -1.9 * v.door
    if (parts.roll) parts.roll.scale.y = 1 - 0.9 * v.door
    palletRefs.current.forEach((p, i) => { if (p) p.visible = !!v.cargo[i] })
    if (trailer.current) {
      trailer.current.position.set(v.trailer.x, 0, v.trailer.z)
      trailer.current.rotation.y = v.trailer.heading
    }
    if (box.current) box.current.visible = !!v.container
    if (walker.current) {
      const w = v.walk
      walker.current.visible = w.on
      if (w.on) {
        const x = w.from.x + (w.to.x - w.from.x) * w.t
        const z = w.from.z + (w.to.z - w.from.z) * w.t
        walker.current.position.set(x, 0, z)
        const dir = w.stage === 'back' ? -1 : 1
        walker.current.rotation.y = Math.atan2((w.to.x - w.from.x) * dir, (w.to.z - w.from.z) * dir)
      }
      // 직접 전달이면 주민이, 경비실이면 경비원이 문 앞에서 받는다
      const meet = w.on && w.stage === 'door'
      for (const [ref, mode] of [[receiver, 'handover'], [guardRx, 'guard']] as const) {
        const g = ref.current
        if (!g) continue
        g.visible = meet && w.mode === mode
        if (!g.visible) continue
        const dx = w.to.x - w.from.x
        const dz = w.to.z - w.from.z
        const l = Math.hypot(dx, dz) || 1
        g.position.set(w.to.x + (dx / l) * 0.95, 0, w.to.z + (dz / l) * 0.95)
        g.rotation.y = Math.atan2(-dx, -dz)
      }
    }
    if (inner.current) {
      const f = v.cargoTotal ? v.cargoDone / v.cargoTotal : 0
      inner.current.visible = v.door > 0.05 && f > 0.02
      inner.current.scale.y = Math.max(0.05, f) * 1.6
      inner.current.position.y = 0.95 + inner.current.scale.y / 2
    }
  })

  return (
    <>
    <group ref={group} {...handlers}>
      {v.kind === 'reefer' && <Merge><MemoReefer parts={parts} /></Merge>}
      {v.kind === 'trailer' && <Merge><MemoTractor carrier={v.carrier} parts={parts} /></Merge>}
      {v.kind === 'wing' && (
        <>
          <Merge><MemoWing carrier={v.carrier} parts={parts} /></Merge>
          {L.WING_SLOTS.map((s, i) => (
            <group
              key={`${trip}-${i}`}
              position={[s.lx, L.WING.bedY, s.lz]}
              ref={(o) => { palletRefs.current[i] = o }}
              {...cargoHandlers(v, i)}
            >
              <PalletModel look={looks[i]} height={1.05} />
            </group>
          ))}
        </>
      )}
      {v.kind === 'box' && (
        <>
          <Merge><MemoBox carrier={v.carrier} parts={parts} /></Merge>
          <Merge>
            {[-4.7, -3.8].flatMap((z) => [-0.6, 0.3].map((x) => (
              <group key={`${x}${z}`} position={[x, 1.3, z]}>
                <RollCage fill={0.7} />
              </group>
            )))}
          </Merge>
        </>
      )}
      {v.kind === 'van' && (
        <>
          <Merge><MemoVan carrier={v.carrier} parts={parts} /></Merge>
          <mesh ref={inner} geometry={unitBox} position={[0, 1.4, -1.6]} scale={[1.7, 1, 1.4]}>
            <meshStandardMaterial map={loadTex('parcel')} roughness={0.8} />
          </mesh>
        </>
      )}
    </group>
    {v.kind === 'trailer' && (
      <group ref={trailer} {...handlers}>
        <Merge><MemoChassis /></Merge>
        <group ref={box} position={[0, 1.28, 0]}>
          <Merge key={container ?? 'none'}><Container40 color={container ?? '#2F55E6'} name={container ? 'DAON' : ''} /></Merge>
        </group>
      </group>
    )}
    {v.kind === 'van' && v.home === 'IN' && (
      <group ref={walker} visible={false}>
        <Merge>
          <Person vest="#2F55E6" cap />
          <group position={[0, 0, 0.75]}>
            <HandCart boxes={3} />
          </group>
        </Merge>
      </group>
    )}
    {v.kind === 'van' && v.home === 'IN' && (
      <>
        <group ref={receiver} visible={false}>
          <Merge><Person vest="#E88A3A" helmet="#2B211B" cap /></Merge>
        </group>
        <group ref={guardRx} visible={false}>
          <Merge><Person vest="#3B4A6B" helmet="#2D3445" cap /></Merge>
        </group>
      </>
    )}
    </>
  )
}

export function Vehicles() {
  return (
    <group>
      {sim.vehicles.map((v) => (
        <VehicleEntity key={v.id} v={v} />
      ))}
    </group>
  )
}
