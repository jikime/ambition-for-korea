import * as THREE from 'three'
import { lampMaterial } from '../env/state'
import { useMemo } from 'react'
import { B, COLORS, RB, cylGeo, mat, unitBox } from '../kit'
import { containerTex, liveryTex, rearDoorTex, reeferLivery } from '../textures'
import { CARRIERS, type CarrierKey } from '../../sim/data'

/** 애니메이션 대상 부품. 엔티티가 매 프레임 직접 회전·이동시킨다. */
export interface Parts {
  wheels: Set<THREE.Object3D>
  wingL?: THREE.Object3D
  wingR?: THREE.Object3D
  doorL?: THREE.Object3D
  doorR?: THREE.Object3D
  roll?: THREE.Object3D
}
export const makeParts = (): Parts => ({ wheels: new Set() })

const glass = () => mat(COLORS.glass, { rough: 0.25, metal: 0.2 })
const trim = () => mat('#2F3542', { rough: 0.6 })
const steel = () => mat('#C3CAD8', { rough: 0.45, metal: 0.25 })

function Wheel({ p, r, w, parts }: { p: [number, number, number]; r: number; w: number; parts?: Parts }) {
  return (
    <group position={p} userData={{ dynamic: true }} ref={(o) => { if (o && parts) parts.wheels.add(o) }}>
      <mesh geometry={cylGeo(r, r, w, 20)} rotation={[0, 0, Math.PI / 2]} material={mat(COLORS.tire, { rough: 0.95 })} castShadow />
      <mesh geometry={cylGeo(r * 0.56, r * 0.56, w + 0.02, 16)} rotation={[0, 0, Math.PI / 2]} material={mat(COLORS.hub, { rough: 0.4, metal: 0.4 })} />
      <B s={[w + 0.04, r * 0.16, r * 0.9]} c="#8F98AA" cast={false} />
    </group>
  )
}

function Cab({ w, h, len, front, y0, accent, deflector }: { w: number; h: number; len: number; front: number; y0: number; accent: string; deflector?: boolean }) {
  const z = front - len / 2
  return (
    <group>
      <RB s={[w, h, len]} rad={0.16} p={[0, y0 + h / 2, z]} c="#F8F9FC" />
      <B s={[w * 0.88, h * 0.36, 0.05]} p={[0, y0 + h * 0.71, front + 0.004]} m={glass()} cast={false} />
      {[1, -1].map((s) => (
        <group key={s}>
          <B s={[0.05, h * 0.3, len * 0.44]} p={[s * (w / 2 + 0.004), y0 + h * 0.72, front - len * 0.3]} m={glass()} cast={false} />
          <B s={[0.05, h * 0.09, len * 0.86]} p={[s * (w / 2 + 0.006), y0 + h * 0.45, z + 0.04]} c={accent} cast={false} />
          <B s={[0.08, h * 0.2, 0.12]} p={[s * (w / 2 + 0.24), y0 + h * 0.66, front - 0.22]} m={trim()} />
          <B s={[0.24, 0.04, 0.04]} p={[s * (w / 2 + 0.12), y0 + h * 0.76, front - 0.22]} m={trim()} cast={false} />
          <B s={[w * 0.17, h * 0.075, 0.05]} p={[s * w * 0.35, y0 + h * 0.29, front + 0.01]} m={lampMaterial(mat('#F8FAFF', { emissive: '#FFFFFF', emissiveIntensity: 0.35 }))} cast={false} />
        </group>
      ))}
      <B s={[w * 0.5, h * 0.13, 0.05]} p={[0, y0 + h * 0.31, front + 0.008]} m={trim()} cast={false} />
      <B s={[w + 0.06, 0.26, 0.3]} p={[0, y0 + 0.05, front - 0.08]} m={trim()} />
      {deflector && <B s={[w * 0.94, 0.62, len * 0.62]} p={[0, y0 + h + 0.22, z - len * 0.08]} r={[-0.26, 0, 0]} c={accent} />}
    </group>
  )
}

function useBoxMats(carrier: CarrierKey, variant: 'van' | 'truck', rearInterior = true) {
  return useMemo(() => {
    const side = new THREE.MeshStandardMaterial({ map: liveryTex(carrier, variant), roughness: 0.6 })
    const white = mat('#F6F8FB', { rough: 0.6 })
    const under = mat('#5A6274')
    const rear = rearInterior ? mat('#252B38') : new THREE.MeshStandardMaterial({ map: rearDoorTex(), roughness: 0.6 })
    return [side, side, white, under, white, rear] as THREE.Material[]
  }, [carrier, variant, rearInterior])
}

/** 1톤 택배 탑차 */
export function VanModel({ carrier = 'daon', parts, open = 0 }: { carrier?: CarrierKey; parts?: Parts; open?: number }) {
  const c = CARRIERS[carrier]
  const boxMats = useBoxMats(carrier, 'van')
  return (
    <group>
      <B s={[1.0, 0.22, 4.3]} p={[0, 0.5, 0]} m={trim()} />
      <Cab w={1.74} h={1.5} len={1.6} front={2.45} y0={0.6} accent={c.color} />
      <B s={[1.9, 0.12, 3.24]} p={[0, 0.86, -0.84]} m={steel()} />
      <mesh geometry={unitBox} position={[0, 1.84, -0.84]} scale={[1.9, 1.86, 3.2]} material={boxMats} castShadow receiveShadow />
      <group position={[-0.95, 1.84, -2.46]} rotation={[0, 1.9 * open, 0]} userData={{ dynamic: true }} ref={(o) => { if (o && parts) parts.doorL = o }}>
        <B s={[0.94, 1.84, 0.05]} p={[0.47, 0, 0]} c="#F2F4F8" />
        <B s={[0.05, 0.5, 0.04]} p={[0.86, 0, -0.04]} c="#8A93A6" cast={false} />
      </group>
      <group position={[0.95, 1.84, -2.46]} rotation={[0, -1.9 * open, 0]} userData={{ dynamic: true }} ref={(o) => { if (o && parts) parts.doorR = o }}>
        <B s={[0.94, 1.84, 0.05]} p={[-0.47, 0, 0]} c="#F2F4F8" />
        <B s={[0.05, 0.5, 0.04]} p={[-0.86, 0, -0.04]} c="#8A93A6" cast={false} />
      </group>
      <B s={[1.86, 0.14, 0.16]} p={[0, 0.62, -2.5]} m={trim()} />
      {[1, -1].map((s) => (
        <B key={s} s={[0.22, 0.12, 0.04]} p={[s * 0.78, 0.72, -2.6]} m={lampMaterial(mat('#E2463C', { emissive: '#E2463C', emissiveIntensity: 0.3 }))} cast={false} />
      ))}
      <Wheel p={[0.77, 0.34, 1.7]} r={0.34} w={0.24} parts={parts} />
      <Wheel p={[-0.77, 0.34, 1.7]} r={0.34} w={0.24} parts={parts} />
      <Wheel p={[0.79, 0.34, -1.3]} r={0.34} w={0.3} parts={parts} />
      <Wheel p={[-0.79, 0.34, -1.3]} r={0.34} w={0.3} parts={parts} />
    </group>
  )
}

/** 5톤 윙바디 (측면 날개가 열린다) */
export function WingTruckModel({ carrier, parts, open = 0 }: { carrier: CarrierKey; parts?: Parts; open?: number }) {
  const c = CARRIERS[carrier]
  const panel = useMemo(() => {
    const live = new THREE.MeshStandardMaterial({ map: liveryTex(carrier, 'wing'), roughness: 0.55 })
    const inner = mat('#D9DEE8')
    return { right: [live, inner, inner, inner, inner, inner], left: [inner, live, inner, inner, inner, inner] } as Record<string, THREE.Material[]>
  }, [carrier])
  const rear = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ map: rearDoorTex('#EEF1F6'), roughness: 0.6 })
    const plain = mat('#E9EDF4')
    return [plain, plain, plain, plain, plain, m]
  }, [])
  const top = 1.3 + 2.55
  return (
    <group>
      <B s={[1.2, 0.3, 9.6]} p={[0, 0.82, -0.1]} m={trim()} />
      <Cab w={2.36} h={2.2} len={2.3} front={5.1} y0={0.95} accent={c.color} deflector />
      <B s={[2.5, 0.22, 7.4]} p={[0, 1.19, -1.25]} c="#8D96A8" />
      <B s={[2.5, 2.55, 0.1]} p={[0, 2.575, 2.4]} c="#E9EDF4" />
      <mesh geometry={unitBox} position={[0, 2.575, -4.9]} scale={[2.5, 2.55, 0.1]} material={rear} castShadow receiveShadow />
      {[1, -1].map((s) => (
        <group key={s}>
          <B s={[0.06, 0.45, 7.4]} p={[s * 1.22, 1.525, -1.25]} m={steel()} />
          <B s={[0.1, 2.55, 0.1]} p={[s * 1.2, 2.575, 2.4]} m={steel()} />
          <B s={[0.1, 2.55, 0.1]} p={[s * 1.2, 2.575, -4.9]} m={steel()} />
          <B s={[0.05, 0.26, 3.2]} p={[s * 1.16, 0.78, 0.4]} m={steel()} cast={false} />
          <B s={[0.62, 0.08, 2.7]} p={[s * 0.92, 1.06, -3.2]} m={trim()} />
        </group>
      ))}
      <B s={[0.22, 0.12, 7.45]} p={[0, top + 0.02, -1.25]} m={steel()} />
      <group position={[0, top, -1.25]} rotation={[0, 0, 1.25 * open]} userData={{ dynamic: true }} ref={(o) => { if (o && parts) parts.wingR = o }}>
        <B s={[1.25, 0.06, 7.4]} p={[0.625, 0, 0]} c="#EEF1F6" />
        <mesh geometry={unitBox} position={[1.25, -1.05, 0]} scale={[0.06, 2.1, 7.4]} material={panel.right} castShadow receiveShadow />
      </group>
      <group position={[0, top, -1.25]} rotation={[0, 0, -1.25 * open]} userData={{ dynamic: true }} ref={(o) => { if (o && parts) parts.wingL = o }}>
        <B s={[1.25, 0.06, 7.4]} p={[-0.625, 0, 0]} c="#EEF1F6" />
        <mesh geometry={unitBox} position={[-1.25, -1.05, 0]} scale={[0.06, 2.1, 7.4]} material={panel.left} castShadow receiveShadow />
      </group>
      <mesh geometry={cylGeo(0.26, 0.26, 1.1, 16)} rotation={[Math.PI / 2, 0, 0]} position={[0.95, 0.78, 1.7]} material={steel()} castShadow />
      {[1, -1].map((s) => (
        <B key={s} s={[0.28, 0.14, 0.04]} p={[s * 1.0, 1.0, -5.0]} m={lampMaterial(mat('#E2463C', { emissive: '#E2463C', emissiveIntensity: 0.3 }))} cast={false} />
      ))}
      {[3.9, -2.6, -3.75].flatMap((z) => [1, -1].map((s) => (
        <Wheel key={`${z}${s}`} p={[s * (z > 0 ? 1.02 : 0.9), 0.5, z]} r={0.5} w={z > 0 ? 0.32 : 0.52} parts={parts} />
      )))}
    </group>
  )
}

/** 11톤 간선 탑차 (후면 셔터식 문) */
export function BoxTruckModel({ carrier, parts, open = 0 }: { carrier: CarrierKey; parts?: Parts; open?: number }) {
  const c = CARRIERS[carrier]
  const boxMats = useBoxMats(carrier, 'truck')
  const h = 2.7
  return (
    <group>
      <B s={[1.2, 0.3, 10.6]} p={[0, 0.84, -0.1]} m={trim()} />
      <Cab w={2.4} h={2.3} len={2.4} front={5.5} y0={1.0} accent={c.color} deflector />
      <mesh geometry={unitBox} position={[0, 1.32 + h / 2, -1.3]} scale={[2.5, h, 8.3]} material={boxMats} castShadow receiveShadow />
      <B s={[2.56, 0.16, 8.3]} p={[0, 1.24, -1.3]} m={steel()} />
      <B s={[2.56, 0.14, 0.12]} p={[0, 1.32 + h, -5.46]} m={steel()} />
      {[1, -1].map((s) => (
        <group key={s}>
          <B s={[0.12, h, 0.12]} p={[s * 1.22, 1.32 + h / 2, -5.46]} m={steel()} />
          <B s={[0.05, 0.26, 3.6]} p={[s * 1.16, 0.8, 0.6]} m={steel()} cast={false} />
          <B s={[0.62, 0.08, 2.7]} p={[s * 0.92, 1.1, -3.5]} m={trim()} />
          <B s={[0.28, 0.14, 0.04]} p={[s * 1.0, 1.02, -5.55]} m={lampMaterial(mat('#E2463C', { emissive: '#E2463C', emissiveIntensity: 0.3 }))} cast={false} />
        </group>
      ))}
      <group position={[0, 1.32 + h, -5.49]} userData={{ dynamic: true }} ref={(o) => { if (o && parts) parts.roll = o }} scale={[1, 1 - 0.9 * open, 1]}>
        <mesh geometry={unitBox} position={[0, -h / 2, 0]} scale={[2.32, h, 0.05]} material={mat('#E3E8F1')} castShadow />
      </group>
      {[4.3, -2.9, -4.1].flatMap((z) => [1, -1].map((s) => (
        <Wheel key={`${z}${s}`} p={[s * (z > 0 ? 1.04 : 0.9), 0.52, z]} r={0.52} w={z > 0 ? 0.34 : 0.54} parts={parts} />
      )))}
    </group>
  )
}

/** 일반 승용차(도로 교통용) */
export function CarModel({ color = '#F4F6FA', kind = 'sedan' }: { color?: string; kind?: 'sedan' | 'suv' }) {
  const h = kind === 'suv' ? 1.05 : 0.8
  return (
    <group>
      <RB s={[1.85, 0.62, 4.5]} rad={0.2} p={[0, 0.62, 0]} c={color} />
      <RB s={[1.62, h * 0.72, kind === 'suv' ? 3.0 : 2.4]} rad={0.22} p={[0, 0.9 + h * 0.36, kind === 'suv' ? -0.3 : -0.2]} c={color} />
      <B s={[1.5, h * 0.5, 0.05]} p={[0, 0.98 + h * 0.36, kind === 'suv' ? 1.18 : 0.98]} r={[-0.5, 0, 0]} m={glass()} cast={false} />
      {[1, -1].map((s) => (
        <group key={s}>
          <B s={[0.04, h * 0.42, kind === 'suv' ? 2.6 : 2.0]} p={[s * 0.82, 0.96 + h * 0.36, kind === 'suv' ? -0.3 : -0.2]} m={glass()} cast={false} />
          <mesh geometry={cylGeo(0.34, 0.34, 0.24, 16)} rotation={[0, 0, Math.PI / 2]} position={[s * 0.82, 0.34, 1.45]} material={mat(COLORS.tire)} castShadow />
          <mesh geometry={cylGeo(0.34, 0.34, 0.24, 16)} rotation={[0, 0, Math.PI / 2]} position={[s * 0.82, 0.34, -1.45]} material={mat(COLORS.tire)} castShadow />
        </group>
      ))}
    </group>
  )
}

/** 5톤 냉동탑차(앞쪽 냉동기 + 양문형 후문) */
export function ReeferModel({ parts, open = 0 }: { parts?: Parts; open?: number }) {
  const boxMats = useMemo(() => {
    const side = new THREE.MeshStandardMaterial({ map: reeferLivery(), roughness: 0.5 })
    const white = mat('#F7F9FC', { rough: 0.5 })
    return [side, side, white, mat('#5A6274'), white, mat('#1E2A3C')] as THREE.Material[]
  }, [])
  const h = 2.5
  return (
    <group>
      <B s={[1.1, 0.28, 8.6]} p={[0, 0.78, -0.1]} m={trim()} />
      <Cab w={2.3} h={2.15} len={2.2} front={4.6} y0={0.95} accent="#13A39A" />
      <mesh geometry={unitBox} position={[0, 1.3 + h / 2, -1.05]} scale={[2.45, h, 6.9]} material={boxMats} castShadow receiveShadow />
      <RB s={[1.7, 0.75, 0.55]} rad={0.08} p={[0, 3.2, 2.62]} c="#E9EDF4" />
      <B s={[1.2, 0.36, 0.04]} p={[0, 3.2, 2.9]} c="#5A6274" cast={false} />
      <B s={[2.5, 0.14, 6.9]} p={[0, 1.24, -1.05]} m={steel()} />
      <group position={[-1.22, 1.3 + h / 2, -4.52]} userData={{ dynamic: true }} ref={(o) => { if (o && parts) parts.doorL = o }} rotation={[0, 1.9 * open, 0]}>
        <B s={[1.22, h - 0.06, 0.06]} p={[0.61, 0, 0]} c="#F2F4F8" />
        <B s={[0.05, 1.2, 0.04]} p={[1.1, 0, -0.05]} c="#8A93A6" cast={false} />
      </group>
      <group position={[1.22, 1.3 + h / 2, -4.52]} userData={{ dynamic: true }} ref={(o) => { if (o && parts) parts.doorR = o }} rotation={[0, -1.9 * open, 0]}>
        <B s={[1.22, h - 0.06, 0.06]} p={[-0.61, 0, 0]} c="#F2F4F8" />
        <B s={[0.05, 1.2, 0.04]} p={[-1.1, 0, -0.05]} c="#8A93A6" cast={false} />
      </group>
      {[1, -1].map((s) => (
        <B key={s} s={[0.26, 0.14, 0.04]} p={[s * 0.98, 1.0, -4.6]} c="#E2463C" cast={false} />
      ))}
      {[3.5, -2.6, -3.6].flatMap((z) => [1, -1].map((s) => (
        <Wheel key={`${z}${s}`} p={[s * (z > 0 ? 1.0 : 0.88), 0.48, z]} r={0.48} w={z > 0 ? 0.3 : 0.5} parts={parts} />
      )))}
    </group>
  )
}

/** 컨테이너 트랙터(캡오버) */
export function TractorModel({ carrier, parts }: { carrier: CarrierKey; parts?: Parts }) {
  const c = CARRIERS[carrier]
  return (
    <group>
      <B s={[1.1, 0.3, 5.8]} p={[0, 0.85, -0.3]} m={trim()} />
      <Cab w={2.4} h={2.35} len={2.3} front={2.9} y0={1.0} accent={c.color} deflector />
      <RB s={[2.45, 1.3, 0.12]} rad={0.04} p={[0, 2.4, 0.55]} c={c.color} />
      <B s={[1.5, 0.12, 1.4]} p={[0, 1.18, -2.0]} c="#2E3442" />
      <mesh geometry={cylGeo(0.28, 0.28, 1.0, 14)} rotation={[Math.PI / 2, 0, 0]} position={[1.0, 0.85, -0.3]} material={steel()} castShadow />
      <B s={[0.1, 1.6, 0.1]} p={[-0.95, 2.4, 0.35]} c="#C3CAD8" />
      {[2.0, -1.4, -2.6].flatMap((z) => [1, -1].map((s) => (
        <Wheel key={`${z}${s}`} p={[s * (z > 0 ? 1.04 : 0.9), 0.52, z]} r={0.52} w={z > 0 ? 0.32 : 0.52} parts={parts} />
      )))}
    </group>
  )
}

/** 40ft 컨테이너 섀시(트레일러). 컨테이너는 따로 얹는다 */
export function ChassisModel() {
  return (
    <group>
      <B s={[0.9, 0.24, 12.2]} p={[0, 1.08, 0]} c="#3A4152" />
      <B s={[2.44, 0.12, 0.3]} p={[0, 1.22, 5.95]} c="#3A4152" />
      <B s={[2.44, 0.12, 0.3]} p={[0, 1.22, -5.95]} c="#3A4152" />
      <B s={[2.2, 0.08, 0.2]} p={[0, 1.2, 0]} c="#3A4152" />
      <B s={[0.12, 0.7, 0.12]} p={[0.7, 0.6, 3.6]} c="#5A6274" />
      <B s={[0.12, 0.7, 0.12]} p={[-0.7, 0.6, 3.6]} c="#5A6274" />
      {[-4.0, -5.2].flatMap((z) => [1, -1].map((s) => (
        <group key={`${z}${s}`} position={[s * 0.9, 0.52, z]}>
          <mesh geometry={cylGeo(0.52, 0.52, 0.5, 18)} rotation={[0, 0, Math.PI / 2]} material={mat(COLORS.tire, { rough: 0.95 })} castShadow />
          <mesh geometry={cylGeo(0.28, 0.28, 0.52, 12)} rotation={[0, 0, Math.PI / 2]} material={mat(COLORS.hub)} />
        </group>
      )))}
      {[1, -1].map((s) => (
        <B key={s} s={[0.26, 0.12, 0.04]} p={[s * 1.0, 0.95, -6.12]} c="#E2463C" cast={false} />
      ))}
    </group>
  )
}

/** 40ft 컨테이너 */
export function Container40({ color, name = '' }: { color: string; name?: string }) {
  const m = useMemo(() => {
    const side = new THREE.MeshStandardMaterial({ map: containerTex(name, color), roughness: 0.6 })
    const plain = mat(color, { rough: 0.6 })
    return [side, side, plain, plain, plain, plain] as THREE.Material[]
  }, [color, name])
  return <mesh geometry={unitBox} position={[0, 1.3, 0]} scale={[2.44, 2.6, 12.1]} material={m} castShadow receiveShadow />
}

/** 택배 기사용 핸드카트 + 상자 */
export function HandCart({ boxes = 3 }: { boxes?: number }) {
  return (
    <group>
      <B s={[0.5, 0.05, 0.62]} p={[0, 0.12, 0]} c="#3A4152" />
      <B s={[0.04, 1.0, 0.04]} p={[0.22, 0.6, -0.3]} c="#9AA4B8" />
      <B s={[0.04, 1.0, 0.04]} p={[-0.22, 0.6, -0.3]} c="#9AA4B8" />
      <B s={[0.5, 0.04, 0.04]} p={[0, 1.1, -0.3]} c="#9AA4B8" />
      {[0.2, -0.2].map((x) => (
        <mesh key={x} geometry={cylGeo(0.09, 0.09, 0.05, 12)} rotation={[0, 0, Math.PI / 2]} position={[x, 0.09, 0.22]} material={mat(COLORS.tire)} />
      ))}
      {Array.from({ length: boxes }, (_, i) => (
        <B key={i} s={[0.44 - i * 0.06, 0.26, 0.42 - i * 0.04]} p={[0.02 * (i % 2), 0.28 + i * 0.27, 0.02]} c={i % 2 ? '#D9AE76' : '#C99A60'} />
      ))}
    </group>
  )
}
