import * as THREE from 'three'
import { useMemo } from 'react'
import { B, COLORS, Cyl, RB, coneGeo, cylGeo, mat, sphereGeo, torusGeo, unitBox } from '../kit'
import { chargerScreenTex, loadTex, meshTex, palletSideTex } from '../textures'
import type { PalletLook } from '../../sim/data'

const dark = () => mat('#2E3442', { rough: 0.6 })

/** 작업자(안전조끼·안전모) */
export function Person({ vest = '#FF8A1F', helmet = '#FFFFFF', sitting = false, cap = false }: { vest?: string; helmet?: string; sitting?: boolean; cap?: boolean }) {
  return (
    <group>
      {!sitting && (
        <>
          <B s={[0.16, 0.8, 0.2]} p={[0.11, 0.4, 0]} c="#3B4458" />
          <B s={[0.16, 0.8, 0.2]} p={[-0.11, 0.4, 0]} c="#3B4458" />
        </>
      )}
      <RB s={[0.5, 0.62, 0.3]} rad={0.12} p={[0, sitting ? 0.32 : 1.1, 0]} c={vest} />
      <B s={[0.52, 0.06, 0.32]} p={[0, sitting ? 0.22 : 1.0, 0]} c="#E7F05A" cast={false} />
      <mesh geometry={sphereGeo(0.15)} position={[0, sitting ? 0.78 : 1.56, 0]} material={mat('#F1C8A5')} castShadow />
      {cap ? (
        <>
          <mesh geometry={sphereGeo(0.16, 16, 8)} scale={[1, 0.6, 1]} position={[0, 1.64, 0]} material={mat(vest)} castShadow />
          <B s={[0.2, 0.03, 0.14]} p={[0, 1.6, 0.16]} c={vest} cast={false} />
        </>
      ) : (
        <mesh geometry={sphereGeo(0.17, 16, 8)} scale={[1, 0.75, 1]} position={[0, sitting ? 0.85 : 1.63, 0]} material={mat(helmet)} castShadow />
      )}
    </group>
  )
}

/** 파렛트 + 적재물 */
export function PalletModel({ look = 'boxes', height = 1.15, empty = false }: { look?: PalletLook | 'parcel' | 'stretch'; height?: number; empty?: boolean }) {
  const base = useMemo(() => {
    const side = new THREE.MeshStandardMaterial({ map: palletSideTex(), roughness: 0.85 })
    const top = mat(COLORS.wood, { rough: 0.85 })
    return [side, side, top, top, side, side] as THREE.Material[]
  }, [])
  const load = useMemo(() => {
    const t = loadTex(look)
    const side = new THREE.MeshStandardMaterial({ map: t, roughness: look === 'water' || look === 'stretch' ? 0.3 : 0.8 })
    const top = look === 'water' ? mat('#8DB2F4', { rough: 0.35 }) : look === 'wrapped' ? mat('#F7F8FC') : look === 'stretch' ? mat('#E3D2BC', { rough: 0.3 }) : mat('#D9AB70')
    return [side, side, top, top, side, side] as THREE.Material[]
  }, [look])
  return (
    <group>
      <mesh geometry={unitBox} position={[0, 0.07, 0]} scale={[1.1, 0.14, 1.1]} material={base} castShadow receiveShadow />
      {!empty && look !== 'mixed' && (
        <mesh geometry={unitBox} position={[0, 0.14 + height / 2, 0]} scale={[1.04, height, 1.04]} material={load} castShadow receiveShadow />
      )}
      {!empty && look === 'mixed' && (
        <>
          <mesh geometry={unitBox} position={[0, 0.14 + 0.32, 0]} scale={[1.04, 0.64, 1.04]} material={load} castShadow receiveShadow />
          <mesh geometry={unitBox} position={[0.18, 0.78 + 0.22, -0.12]} scale={[0.62, 0.44, 0.7]} material={load} castShadow receiveShadow />
          <mesh geometry={unitBox} position={[-0.3, 0.78 + 0.16, 0.2]} scale={[0.4, 0.32, 0.5]} material={load} castShadow receiveShadow />
        </>
      )}
    </group>
  )
}

/** 빈 파렛트 더미 */
export function PalletStack({ n = 6 }: { n?: number }) {
  const base = useMemo(() => {
    const t = palletSideTex().clone()
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(1, n)
    t.needsUpdate = true
    const side = new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 })
    const top = mat(COLORS.wood, { rough: 0.85 })
    return [side, side, top, top, side, side] as THREE.Material[]
  }, [n])
  return <mesh geometry={unitBox} position={[0, 0.07 * n, 0]} scale={[1.1, 0.14 * n, 1.1]} material={base} castShadow receiveShadow />
}

/** 롤테이너(롤 컨테이너) */
export function RollCage({ fill = 0.6, color = '#2F55E6' }: { fill?: number; color?: string }) {
  const grid = useMemo(() => new THREE.MeshStandardMaterial({
    map: meshTex('#9AA4B8', 14), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.3,
  }), [])
  const load = useMemo(() => {
    const t = loadTex('parcel')
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 })
    return [m, m, mat('#D9AE76'), m, m, m] as THREE.Material[]
  }, [])
  const H = 1.7
  return (
    <group>
      <B s={[0.82, 0.08, 0.72]} p={[0, 0.16, 0]} c={color} />
      {[[0.34, 0.29], [-0.34, 0.29], [0.34, -0.29], [-0.34, -0.29]].map(([x, z], i) => (
        <mesh key={i} geometry={cylGeo(0.06, 0.06, 0.05, 10)} rotation={[0, 0, Math.PI / 2]} position={[x, 0.06, z]} material={dark()} />
      ))}
      <mesh geometry={unitBox} position={[0, 0.2 + H / 2, -0.35]} scale={[0.8, H, 0.01]} material={grid} castShadow />
      <mesh geometry={unitBox} position={[0.4, 0.2 + H / 2, 0]} scale={[0.01, H, 0.7]} material={grid} castShadow />
      <mesh geometry={unitBox} position={[-0.4, 0.2 + H / 2, 0]} scale={[0.01, H, 0.7]} material={grid} castShadow />
      {[[0.4, -0.35], [-0.4, -0.35], [0.4, 0.35], [-0.4, 0.35]].map(([x, z], i) => (
        <B key={i} s={[0.035, H, 0.035]} p={[x, 0.2 + H / 2, z]} c="#8C96AA" />
      ))}
      {fill > 0 && <mesh geometry={unitBox} position={[0, 0.2 + (H * fill) / 2, 0]} scale={[0.74, H * fill, 0.64]} material={load} castShadow />}
    </group>
  )
}

/** 지게차 (포크 방향 +z). carriage 그룹이 포크 높이를 따라 움직인다. */
export function ForkliftModel({ carriageRef, fork = 0.3, children, beaconRef }: {
  carriageRef?: (o: THREE.Object3D | null) => void
  beaconRef?: (o: THREE.Mesh | null) => void
  fork?: number
  children?: React.ReactNode
}) {
  const y = mat(COLORS.forklift, { rough: 0.55 })
  return (
    <group>
      <RB s={[1.12, 0.62, 1.7]} rad={0.12} p={[0, 0.62, -0.15]} m={y} />
      <RB s={[1.14, 0.78, 0.56]} rad={0.16} p={[0, 0.78, -1.0]} c="#3D4454" />
      <B s={[1.0, 0.1, 0.9]} p={[0, 0.97, -0.25]} c="#E2A50D" />
      <B s={[0.52, 0.12, 0.44]} p={[0, 1.08, -0.42]} c="#262B36" />
      <B s={[0.52, 0.5, 0.1]} p={[0, 1.33, -0.66]} c="#262B36" />
      <group position={[0, 0.85, -0.32]}>
        <Person sitting />
      </group>
      <Cyl rt={0.03} h={0.5} p={[0, 1.2, 0.12]} r={[0.6, 0, 0]} c="#262B36" />
      <mesh geometry={cylGeo(0.16, 0.16, 0.03, 16)} position={[0, 1.42, 0.24]} rotation={[0.6 + Math.PI / 2, 0, 0]} material={dark()} />
      {[[0.5, 0.36], [-0.5, 0.36], [0.5, -0.78], [-0.5, -0.78]].map(([x, z], i) => (
        <B key={i} s={[0.07, 1.3, 0.07]} p={[x, 1.6, z]} c="#262B36" />
      ))}
      <B s={[1.1, 0.06, 1.24]} p={[0, 2.25, -0.21]} c="#262B36" />
      {[-0.3, -0.1, 0.1, 0.3].map((x) => (
        <B key={x} s={[0.04, 0.03, 1.2]} p={[x, 2.26, -0.21]} c="#3D4454" cast={false} />
      ))}
      <mesh ref={beaconRef} userData={{ noMerge: true }} geometry={cylGeo(0.08, 0.09, 0.14, 12)} position={[0.38, 2.36, -0.7]} material={mat('#FF9A1F', { emissive: '#FF8A00', emissiveIntensity: 0.8 })} />
      {[0.42, -0.42].map((x) => (
        <B key={x} s={[0.1, 2.3, 0.14]} p={[x, 1.25, 0.78]} c="#353B48" />
      ))}
      <B s={[0.94, 0.1, 0.12]} p={[0, 2.35, 0.78]} c="#353B48" />
      <group ref={carriageRef} position={[0, fork, 0]} userData={{ dynamic: true }}>
        <B s={[0.96, 0.62, 0.06]} p={[0, 0.34, 0.9]} c="#4A5162" />
        {[0.32, -0.32].map((x) => (
          <B key={x} s={[0.13, 0.05, 1.18]} p={[x, 0.0, 1.52]} c="#4A5162" />
        ))}
        {children}
      </group>
      {[[0.5, 0.42, 0.3], [-0.5, 0.42, 0.3], [0.48, -0.86, 0.24], [-0.48, -0.86, 0.24]].map(([x, z, r], i) => (
        <group key={i} position={[x, r, z]}>
          <mesh geometry={cylGeo(r, r, 0.24, 16)} rotation={[0, 0, Math.PI / 2]} material={mat(COLORS.tire, { rough: 0.95 })} castShadow />
          <mesh geometry={cylGeo(r * 0.5, r * 0.5, 0.26, 12)} rotation={[0, 0, Math.PI / 2]} material={mat('#F1C232')} />
        </group>
      ))}
      <B s={[0.16, 0.08, 0.04]} p={[0.36, 0.95, 0.72]} m={mat('#F8FAFF', { emissive: '#FFFFFF', emissiveIntensity: 0.4 })} cast={false} />
      <B s={[0.16, 0.08, 0.04]} p={[-0.36, 0.95, 0.72]} m={mat('#F8FAFF', { emissive: '#FFFFFF', emissiveIntensity: 0.4 })} cast={false} />
    </group>
  )
}

/** 지게차 충전기 */
export function ChargerModel({ active = false }: { active?: boolean }) {
  const screen = useMemo(() => new THREE.MeshBasicMaterial({ map: chargerScreenTex(), toneMapped: false }), [])
  return (
    <group>
      <RB s={[0.9, 1.5, 0.5]} rad={0.08} p={[0, 0.75, 0]} c="#F6F8FC" />
      <B s={[0.92, 0.16, 0.52]} p={[0, 1.52, 0]} c={COLORS.brand} />
      <mesh geometry={unitBox} position={[0, 1.1, 0.256]} scale={[0.5, 0.36, 0.01]} material={screen} />
      <mesh userData={{ noMerge: true }} geometry={sphereGeo(0.045, 10, 8)} position={[0.32, 1.32, 0.26]} material={mat(active ? '#35D07F' : '#9AA3B5', { emissive: active ? '#35D07F' : '#000000', emissiveIntensity: active ? 1.2 : 0 })} />
      <mesh geometry={torusGeo(0.28, 0.035, Math.PI * 1.2)} position={[-0.52, 0.8, 0.05]} rotation={[0, Math.PI / 2, 0.4]} material={dark()} />
      <B s={[0.1, 0.24, 0.12]} p={[-0.52, 1.06, 0.18]} c="#2E3442" />
    </group>
  )
}

/** 위치 핀 */
export function PinModel({ color = COLORS.brand, scale = 1 }: { color?: string; scale?: number }) {
  return (
    <group scale={scale}>
      <mesh geometry={sphereGeo(0.62, 24, 16)} position={[0, 1.15, 0]} material={mat(color, { rough: 0.35 })} castShadow />
      <mesh geometry={coneGeo(0.5, 0.95, 24)} position={[0, 0.48, 0]} rotation={[Math.PI, 0, 0]} material={mat(color, { rough: 0.35 })} castShadow />
      <mesh geometry={sphereGeo(0.25, 16, 12)} position={[0, 1.15, 0.45]} material={mat('#FFFFFF', { emissive: '#FFFFFF', emissiveIntensity: 0.2 })} />
    </group>
  )
}

/** 교통 콘 */
export function Cone() {
  return (
    <group>
      <B s={[0.42, 0.04, 0.42]} p={[0, 0.02, 0]} c="#E8562E" />
      <mesh geometry={coneGeo(0.16, 0.6, 14)} position={[0, 0.32, 0]} material={mat('#F06A30')} castShadow />
      <mesh geometry={cylGeo(0.105, 0.125, 0.1, 14)} position={[0, 0.3, 0]} material={mat('#FFFFFF')} />
    </group>
  )
}
