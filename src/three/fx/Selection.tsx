import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { sim } from '../../sim/sim'
import * as L from '../../sim/layout'
import { useStore, type Selection as Sel } from '../../store'
import { basic, unitBox, unitPlane } from '../kit'
import { glowTex } from '../textures'
import { entityLabel } from '../../ui/format'

const BLUE = '#3D63FF'

/** 선택 대상의 외곽 크기 [폭, 높이, 길이] */
function dims(sel: Sel): [number, number, number] {
  if (sel.kind === 'vehicle') {
    const v = sim.vehicle(sel.id)
    if (v?.kind === 'van') return [2.5, 3.1, 5.6]
    if (v?.kind === 'box') return [3.2, 4.5, 11.8]
    if (v?.kind === 'reefer') return [3.1, 4.3, 9.8]
    if (v?.kind === 'trailer') return [3.2, 4.6, 19]
    return [3.2, 4.4, 11]
  }
  if (sel.kind === 'forklift') return [1.7, 2.7, 3.7]
  if (sel.kind === 'pallet') return [1.5, 1.6, 1.5]
  if (sel.kind === 'charger') return [1.5, 2.0, 1.2]
  if (sel.kind === 'dock') return [4.4, 4.6, 4.4]
  if (sel.kind === 'sorter') return sel.id === 'X1' ? [34, 3.2, 12] : [41, 3.2, 4.2]
  if (sel.kind === 'crane') return sel.id.startsWith('agv') ? [3.4, 4.4, 13.6] : sel.id.startsWith('armg') ? [20, 23, 14] : [18, 40, 17]
  if (sel.kind === 'story') return [1.6, 1.6, 1.6]
  if (sel.kind === 'aircraft') return [58, 20, 60]
  if (sel.kind === 'barge') return [10.2, 9, 47]
  if (sel.kind === 'mover') {
    const m = sim.life.movers.find((x) => x.id === sel.id)
    return m?.kind === 'drone' ? [1.6, 0.8, 1.6] : m?.kind === 'moto' ? [1.0, 1.9, 2.2] : m?.kind === 'robot' ? [0.9, 1.1, 1.2] : [0.9, 1.9, 0.9]
  }
  if (sel.kind === 'robot') return [1.3, 2.4, 1.3]
  if (sel.kind === 'equip') return [1.6, 3.4, 3.2]
  return [76, 13, 38]
}

function heading(sel: Sel) {
  if (sel.kind === 'vehicle') return sim.vehicle(sel.id)?.heading ?? 0
  if (sel.kind === 'forklift') return sim.forklift(sel.id)?.heading ?? 0
  if (sel.kind === 'aircraft') return sim.airport.aircraft.find((a) => a.id === sel.id)?.heading ?? 0
  if (sel.kind === 'barge') return sim.barge.heading
  if (sel.kind === 'mover') return sim.life.movers.find((m) => m.id === sel.id)?.heading ?? 0
  if (sel.kind === 'robot') return sim.robots.find((r) => r.id === sel.id)?.heading ?? 0
  if (sel.kind === 'equip') return sim.djwh.equipById(sel.id)?.heading ?? 0
  if (sel.kind === 'pallet') {
    const p = sim.pallets.get(sel.id)
    if (p?.state === 'onTruck' && p.vehicleId) return sim.vehicle(p.vehicleId)?.heading ?? 0
    if (p?.state === 'onFork' && p.forkliftId) return sim.forklift(p.forkliftId)?.heading ?? 0
  }
  return 0
}

/** 파렛트는 실린 차량·지게차 위 실제 위치를 따른다 */
function palletPos(id: string) {
  const p = sim.pallets.get(id)
  if (!p) return null
  if (p.state === 'staged') return { x: p.x, y: 0, z: p.z }
  if (p.state === 'onTruck' && p.vehicleId) {
    const v = sim.vehicle(p.vehicleId)
    const i = v?.cargo.indexOf(id) ?? -1
    if (!v || i < 0) return null
    const s = L.WING_SLOTS[i]
    const w = L.toWorld(v.x, v.z, v.heading, s.lx, s.lz)
    return { x: w.x, y: L.WING.bedY, z: w.z }
  }
  if (p.state === 'onFork' && p.forkliftId) {
    const f = sim.forklift(p.forkliftId)
    if (!f) return null
    const w = L.toWorld(f.x, f.z, f.heading, 0, 1.55)
    return { x: w.x, y: f.fork, z: w.z }
  }
  return null
}

export function basePos(sel: Sel) {
  if (sel.kind === 'pallet') return palletPos(sel.id)
  if (sel.kind === 'site') return { x: -22, y: 0, z: -27 }
  const p = sim.locate(sel.kind, sel.id)
  return p ? { x: p.x, y: 0, z: p.z } : null
}

/** 모서리 브래킷(L자 3방향) */
function Brackets({ size }: { size: [number, number, number] }) {
  const [w, h, d] = size
  const t = 0.07
  const len = Math.min(1.2, Math.min(w, d) * 0.3)
  const m = basic(BLUE, 0.95)
  const items: { p: [number, number, number]; s: [number, number, number] }[] = []
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const sy of [0, 1]) {
    const x = (sx * w) / 2
    const z = (sz * d) / 2
    const y = sy * h
    items.push({ p: [x - (sx * len) / 2, y, z], s: [len, t, t] })
    items.push({ p: [x, y, z - (sz * len) / 2], s: [t, t, len] })
    items.push({ p: [x, y + (sy ? -len / 2 : len / 2), z], s: [t, len, t] })
  }
  return (
    <group>
      {items.map((it, i) => (
        <mesh key={i} geometry={unitBox} position={it.p} scale={it.s} material={m} renderOrder={5} />
      ))}
    </group>
  )
}

export function SelectionFx() {
  const selected = useStore((s) => s.selected)
  const hovered = useStore((s) => s.hovered)
  const group = useRef<THREE.Group>(null)
  const glow = useRef<THREE.Mesh>(null)
  const hoverGroup = useRef<THREE.Group>(null)
  const glowMat = useMemo(() => {
    const m = basic('#ffffff', 1, glowTex()).clone()
    m.blending = THREE.AdditiveBlending
    return m
  }, [])

  useFrame(() => {
    const g = group.current
    if (g) {
      const p = selected && selected.kind !== 'site' ? basePos(selected) : null
      g.visible = !!p
      if (p && selected) {
        g.position.set(p.x, p.y, p.z)
        g.rotation.y = heading(selected)
      }
    }
    const hg = hoverGroup.current
    if (hg) {
      const same = hovered && selected && hovered.id === selected.id && hovered.kind === selected.kind
      const p = hovered && !same && hovered.kind !== 'site' && hovered.kind !== 'sorter' ? basePos(hovered) : null
      hg.visible = !!p
      if (p && hovered) {
        hg.position.set(p.x, p.y, p.z)
        hg.rotation.y = heading(hovered)
      }
    }
  })

  const size = selected ? dims(selected) : ([1, 1, 1] as [number, number, number])
  const hsize = hovered ? dims(hovered) : ([1, 1, 1] as [number, number, number])
  return (
    <>
      <group ref={group} visible={false}>
        {selected && selected.kind !== 'site' && (
          <>
            <Brackets size={size} />
            <mesh ref={glow} geometry={unitPlane} position={[0, 0.06, 0]} scale={[1, 1, 1]} renderOrder={2}>
              <primitive object={glowMat} attach="material" />
            </mesh>
            <GlowScale size={size} target={glow} />
          </>
        )}
      </group>
      <group ref={hoverGroup} visible={false}>
        {hovered && <Brackets size={hsize} />}
      </group>
    </>
  )
}

/** 글로우 크기를 대상에 맞춘다 */
function GlowScale({ size, target }: { size: [number, number, number]; target: React.RefObject<THREE.Mesh | null> }) {
  useFrame(({ clock }) => {
    const m = target.current
    if (!m) return
    const s = 1 + Math.sin(clock.elapsedTime * 3) * 0.05
    m.scale.set(size[0] * 1.9 * s, 1, size[2] * 1.5 * s)
  })
  return null
}

/** 선택 대상 위에 떠 있는 이름표 */
export function FloatingLabel() {
  const selected = useStore((s) => s.selected)
  const labels = useStore((s) => s.labels)
  useStore((s) => s.tick)
  const group = useRef<THREE.Group>(null)
  const [visible, setVisible] = useState(true)
  useFrame(() => {
    if (!selected || !group.current) return
    const p = basePos(selected)
    const d = dims(selected)
    if (p) group.current.position.set(p.x, p.y + d[1] + 0.9, p.z)
    const vis = !!p
    if (vis !== visible) setVisible(vis)
  })
  if (!labels || !selected || selected.kind === 'site' || selected.kind === 'story') return null
  const { title, status, tone } = entityLabel(selected)
  return (
    <group ref={group}>
      {visible && (
        <Html center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className="pill-label">
            <span>{title}</span>
            {status && <span className={`pill-status tone-${tone}`}>{status}</span>}
          </div>
        </Html>
      )}
    </group>
  )
}
