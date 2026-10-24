// 돌발 상황 지점 표시: 라바콘·차단 표지·경고등, 멀리서 보면 크기를 키우고 이름표를 붙인다
import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import type { CameraControlsImpl } from '@react-three/drei'
import * as THREE from 'three'
import { sim } from '../../sim/sim'
import { LINK_IDS, LINK_LABEL, LINK_POS, type LinkId } from '../../sim/incidents'
import { useStore } from '../../store'
import { B, coneGeo, mat, sphereGeo } from '../kit'
import { stripeTex } from '../textures'
import { L } from '../../i18n'

function Marker({ link }: { link: LinkId }) {
  const group = useRef<THREE.Group>(null)
  const lamp = useRef<THREE.Mesh>(null)
  const controls = useThree((s) => s.controls) as unknown as CameraControlsImpl | null
  const stripe = useMemo(() => new THREE.MeshStandardMaterial({ map: stripeTex('#E8453C', '#FFFFFF'), roughness: 0.6 }), [])
  const on = useMemo(() => mat('#FFB020', { emissive: '#FF9A00', emissiveIntensity: 2.2 }), [])
  const off = useMemo(() => mat('#7A5A20'), [])
  useFrame(({ clock }) => {
    const g = group.current
    if (!g) return
    const d = controls?.distance ?? 150
    g.scale.setScalar(Math.max(1, d / 110))
    if (lamp.current) lamp.current.material = Math.sin(clock.elapsedTime * 7) > 0 ? on : off
  })
  const [x, z] = LINK_POS[link]
  return (
    <group ref={group} position={[x, 0, z]}>
      {[-1.6, 0, 1.6].map((dx) => (
        <group key={dx} position={[dx, 0, 2.2]}>
          <mesh geometry={coneGeo(0.32, 0.9, 16)} position={[0, 0.45, 0]} material={mat('#FF6A1F')} castShadow />
          <B s={[0.7, 0.06, 0.7]} p={[0, 0.03, 0]} c="#22262F" />
        </group>
      ))}
      <mesh position={[0, 1.1, 0]} material={stripe} castShadow>
        <boxGeometry args={[3.6, 0.6, 0.12]} />
      </mesh>
      {[-1.5, 1.5].map((dx) => <B key={dx} s={[0.1, 1.4, 0.1]} p={[dx, 0.7, 0]} c="#E9EDF5" />)}
      <mesh ref={lamp} geometry={sphereGeo(0.26)} position={[0, 1.65, 0]} material={on} />
    </group>
  )
}

function IncidentLabel({ link, text }: { link: LinkId; text: string }) {
  const [x, z] = LINK_POS[link]
  return (
    <group position={[x, 14, z]}>
      <Html center zIndexRange={[16, 0]} style={{ pointerEvents: 'none' }}>
        <div className="incident-tag">⚠ {LINK_LABEL[link]} · {text}</div>
      </Html>
    </group>
  )
}

export function IncidentMarkers() {
  useStore((s) => s.tick)
  const live = new Map<LinkId, string>()
  for (const i of sim.incidents) {
    const link = i.applied?.link ?? (i.state === 'confirm' && i.ai && (LINK_IDS as string[]).includes(i.ai.link) ? (i.ai.link as LinkId) : null)
    if (!link || live.has(link)) continue
    if (i.state === 'active') live.set(link, link === 'port_crane' ? L(`크레인 속도 ${Math.round(sim.port.windFactor * 100)}%`, `Crane speed ${Math.round(sim.port.windFactor * 100)}%`) : L(`속도 ${Math.round(sim.linkFactor[link] * 100)}%`, `Speed ${Math.round(sim.linkFactor[link] * 100)}%`))
    else if (i.state === 'confirm') live.set(link, L('확인 필요', 'Needs review'))
  }
  return (
    <group>
      {[...live.entries()].map(([link, text]) => (
        <group key={link}>
          <Marker link={link} />
          <IncidentLabel link={link} text={text} />
        </group>
      ))}
    </group>
  )
}
