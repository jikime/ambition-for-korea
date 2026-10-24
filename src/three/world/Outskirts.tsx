// 지도 동쪽 외곽(x 870 너머, 빈 땅 채우기 격자 밖): 간선을 넘는 고가도로(위로 일반 차가 오감)와 해안 탱크팜.
// 항만 관제 영상 분석 3순위(고가 구간 · 탱크팜·배관 랙·줄무늬 굴뚝). 모두 가상 시설이다.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { B, Cyl, Flat, cylGeo, mat } from '../kit'
import { Merge } from '../merge'
import { CarModel } from '../models/vehicles'
import { SmallOffice } from '../models/sites'
import { GroundPaints } from '../models/structures'
import { paintTex } from '../textures'
import { AtlasSign, signId } from '../townAtlas'
import * as L from '../../sim/layout'
import { L as tr } from '../../i18n'

/** 고가도로: 남북으로 간선(z 41~55)을 넘는다. 북쪽 경사로 → 높이 8m 평평한 구간 → 남쪽 경사로 */
export const OVERPASS = { x: 1000, w: 12, h: 8, n0: -330, n1: -150, s0: 140, s1: 210 }

/** 고가도로 위 경로의 높이(z → y) */
function deckY(z: number) {
  const O = OVERPASS
  if (z <= O.n0 || z >= O.s1) return 0
  if (z < O.n1) return ((z - O.n0) / (O.n1 - O.n0)) * O.h
  if (z > O.s0) return ((O.s1 - z) / (O.s1 - O.s0)) * O.h
  return O.h
}

/** 기울어진 상판 한 구간: 상판·난간 두 줄·가운데 선 */
function DeckSpan({ z0, z1, y0, y1 }: { z0: number; z1: number; y0: number; y1: number }) {
  const O = OVERPASS
  const len = Math.hypot(z1 - z0, y1 - y0)
  const pitch = -Math.atan2(y1 - y0, z1 - z0)
  return (
    <group position={[O.x, (y0 + y1) / 2, (z0 + z1) / 2]} rotation={[pitch, 0, 0]}>
      <B s={[O.w, 0.9, len + 0.2]} p={[0, -0.45, 0]} c="#C3C9D6" />
      <B s={[O.w - 1, 0.04, len]} p={[0, 0.02, 0]} c="#5B6274" cast={false} />
      <B s={[0.16, 0.05, len - 2]} p={[0, 0.05, 0]} c="#F2C233" cast={false} />
      {[-O.w / 2 + 0.25, O.w / 2 - 0.25].map((x) => <B key={x} s={[0.4, 1.1, len]} p={[x, 0.55, 0]} c="#E3E7EF" />)}
    </group>
  )
}

export function Overpass() {
  const O = OVERPASS
  const piers: number[] = []
  for (let z = O.n1 - 150; z <= O.s0 + 50; z += 30) if ((z < L.MAIN.z0 - 4 || z > L.MAIN.z1 + 4) && deckY(z) > 2.5) piers.push(z)
  return (
    <group>
      <Merge>
        <DeckSpan z0={O.n0} z1={O.n1} y0={0} y1={O.h} />
        <DeckSpan z0={O.n1} z1={O.s0} y0={O.h} y1={O.h} />
        <DeckSpan z0={O.s0} z1={O.s1} y0={O.h} y1={0} />
        {piers.map((z) => {
          const y = deckY(z) - 0.9
          return (
            <group key={z} position={[O.x, 0, z]}>
              <B s={[1.8, y, 1.6]} p={[0, y / 2, 0]} c="#B7BECC" />
              <B s={[O.w - 1, 0.9, 2]} p={[0, y - 0.45, 0]} c="#AEB6C5" />
            </group>
          )
        })}
        {/* 경사로 끝에서 이어지는 땅 위 도로: 북쪽은 지도 끝까지, 남쪽은 해안 탱크팜으로 */}
        <Flat s={[O.w, 120]} p={[O.x, O.n0 - 60]} c="#5B6274" y={0.016} />
        <Flat s={[O.w, 30]} p={[O.x, O.s1 + 15]} c="#5B6274" y={0.016} />
        <Flat s={[110, 9]} p={[O.x + 55 + O.w / 2, O.s1 + 22]} c="#5B6274" y={0.016} />
        {/* 간선 위 표지 "다온대로 위 고가" */}
        <B s={[O.w + 0.3, 1.4, 0.3]} p={[O.x, O.h + 0.6, L.MAIN.z0 - 1]} c="#1E7A4C" />
        <B s={[O.w + 0.3, 1.4, 0.3]} p={[O.x, O.h + 0.6, L.MAIN.z1 + 1]} c="#1E7A4C" />
      </Merge>
      <OverpassTraffic />
    </group>
  )
}

/** 고가도로 위 일반 차(장식용, 다른 흐름과 무관): 양방향 4대씩 */
function OverpassTraffic() {
  const cars = useMemo(() => {
    const colors = ['#F4F6FA', '#2D3445', '#B8C2D6', '#E45B4B', '#5D79E8', '#8A94A8', '#F4F6FA', '#1F2633']
    return colors.map((color, i) => ({ color, dir: i % 2 ? 1 : -1, s: (i / colors.length) * 1.0, speed: 15 + (i % 3) * 2, kind: i % 3 === 0 ? 'suv' : 'sedan' as 'suv' | 'sedan' }))
  }, [])
  const refs = useRef<(THREE.Group | null)[]>([])
  const O = OVERPASS
  const z0 = O.n0 - 110
  const z1 = O.s1 + 20
  const span = z1 - z0
  useFrame((_, dt) => {
    cars.forEach((c, i) => {
      c.s = (c.s + (Math.min(dt, 0.05) * c.speed) / span) % 1
      const g = refs.current[i]
      if (!g) return
      const z = c.dir > 0 ? z0 + c.s * span : z1 - c.s * span
      const x = O.x + c.dir * 2.6
      const y = deckY(z)
      const ahead = deckY(z + c.dir * 2)
      g.position.set(x, y, z)
      g.rotation.set(-Math.atan2(ahead - y, 2) * c.dir, c.dir > 0 ? 0 : Math.PI, 0)
    })
  })
  return (
    <>
      {cars.map((c, i) => (
        <group key={i} ref={(o) => { refs.current[i] = o }}>
          <Merge><CarModel color={c.color} kind={c.kind} /></Merge>
        </group>
      ))}
    </>
  )
}

/** 해안 탱크팜(가상 "다온 에너지 저장소"): 탱크 6기·배관 랙·줄무늬 굴뚝·사무동 */
export function TankFarm() {
  const tanks: [number, number, number, number, string][] = [
    [1060, 252, 8, 11, '#2F55E6'], [1082, 252, 8, 11, '#2F55E6'], [1104, 252, 8, 11, '#13A39A'],
    [1060, 274, 7, 10, '#E2463C'], [1082, 274, 7, 10, '#F2C233'], [1104, 274, 7, 10, '#13A39A'],
  ]
  const steel = mat('#9AA3B2', { rough: 0.4, metal: 0.5 })
  return (
    <Merge>
      <Flat s={[90, 50]} p={[1085, 262]} c="#D6DAE2" y={0.012} />
      {tanks.map(([x, z, r, h, band], i) => (
        <group key={i} position={[x, 0, z]}>
          {/* 방유제(낮은 둑) · 탱크 · 색 띠 · 지붕 */}
          <Cyl rt={r + 1.6} h={0.8} p={[0, 0.4, 0]} c="#C9CED8" />
          <Cyl rt={r} h={h} p={[0, h / 2 + 0.8, 0]} c="#F2F4F8" seg={28} />
          <Cyl rt={r + 0.04} h={0.9} p={[0, h * 0.72 + 0.8, 0]} c={band} seg={28} cast={false} />
          <Cyl rt={r * 0.98} rb={r} h={0.9} p={[0, h + 1.25, 0]} c="#E3E7EF" seg={28} />
          {/* 계단 */}
          <B s={[0.9, h, 0.3]} p={[r + 0.3, h / 2 + 0.8, 0]} r={[0, 0, 0.12]} m={steel} />
        </group>
      ))}
      {/* 배관 랙: 탱크 줄 사이를 동서로 */}
      {[1050, 1066, 1082, 1098, 1114].map((x) => (
        <group key={x} position={[x, 0, 263]}>
          {[-1.2, 1.2].map((z) => <B key={z} s={[0.3, 4, 0.3]} p={[0, 2, z]} m={steel} />)}
          <B s={[0.3, 0.3, 2.8]} p={[0, 4, 0]} m={steel} />
        </group>
      ))}
      {[[-0.6, '#B8C2D6'], [0, '#F2C233'], [0.6, '#B8C2D6']].map(([z, c]) => (
        <mesh key={z as number} geometry={cylGeo(0.22, 0.22, 66, 10)} rotation={[0, 0, Math.PI / 2]} position={[1082, 4.4, 263 + (z as number)]} material={mat(c as string, { rough: 0.4, metal: 0.4 })} castShadow />
      ))}
      {/* 줄무늬 굴뚝 */}
      {Array.from({ length: 8 }, (_, i) => (
        <Cyl key={i} rt={1.3 - i * 0.06} rb={1.36 - i * 0.06} h={4} p={[1128, 2 + i * 4, 246]} c={i % 2 ? '#F4F6FA' : '#E2463C'} seg={18} />
      ))}
      <group position={[1130, 0, 272]} rotation={[0, -Math.PI / 2, 0]}>
        <SmallOffice w={12} d={6} floors={2} label="다온 에너지 저장소" />
      </group>
    </Merge>
  )
}

/** 톨게이트(간선 양 끝, 가상 "다온 톨게이트"): 차로 사이 섬 위 요금소, 지붕, 하이패스 표지·노면 글자. 차는 멈추지 않고 지나간다(하이패스) */
export function TollPlazas() {
  return (
    <group name="toll">
      <TollPlaza x={-1080} />
      <TollPlaza x={1080} />
    </group>
  )
}

function TollPlaza({ x }: { x: number }) {
  const M = L.MAIN
  // 차로 경계(바깥 차로 | 안쪽 차로 | 가운데 | 안쪽 | 바깥)
  const islands = [(M.wbOut + M.wbIn) / 2, M.z, (M.ebIn + M.ebOut) / 2]
  const glass = mat('#9DB2E8', { rough: 0.2, metal: 0.1 })
  const lamp = mat('#7CF0A0', { emissive: '#7CF0A0', emissiveIntensity: 0.8 })
  const hipass = paintTex(tr('하이패스', 'Hi-pass'), '#2F55E6', 384, 96)
  return (
    <group>
      <Merge>
        {islands.map((z) => (
          <group key={z} position={[x, 0, z]}>
            <B s={[18, 0.25, 0.9]} p={[0, 0.125, 0]} c="#D6DBE5" />
            {[-9, 9].map((dx) => <B key={dx} s={[0.6, 0.6, 0.9]} p={[dx, 0.3, 0]} m={hazardStripe()} />)}
            <B s={[2.6, 2.3, 0.8]} p={[0, 1.4, 0]} c="#F4F6FA" />
            <B s={[2.62, 0.9, 0.82]} p={[0, 1.9, 0]} m={glass} cast={false} />
            <B s={[2.9, 0.18, 1.0]} p={[0, 2.62, 0]} c="#1E3BB3" />
            {[-1.6, 1.6].map((dx) => <B key={dx} s={[0.18, 0.18, 0.18]} p={[dx, 1.2, 0]} m={lamp} cast={false} />)}
            {[-6, 6].map((dx) => <B key={dx} s={[0.5, 6.3, 0.5]} p={[dx, 3.4, 0]} c="#C9CED8" />)}
          </group>
        ))}
        {[M.z0 - 1.5, M.z1 + 1.5].map((z) => [-6, 6].map((dx) => <B key={`${z}${dx}`} s={[0.6, 6.3, 0.6]} p={[x + dx, 3.15, z]} c="#C9CED8" />))}
        {/* 지붕과 앞뒤 띠(차가 오는 ±x 쪽) */}
        <B s={[16, 0.9, M.z1 - M.z0 + 6]} p={[x, 6.75, M.z]} c="#EEF1F6" />
        {[-1, 1].map((d) => (
          <group key={d}>
            <B s={[0.35, 1.5, M.z1 - M.z0 + 6.2]} p={[x + d * 8.1, 6.75, M.z]} c="#1E3BB3" />
            <AtlasSign cell={signId('다온 톨게이트')} w={7} h={1.1} p={[x + d * 8.3, 6.75, M.z]} r={[0, d * Math.PI / 2, 0]} lit />
            {/* 안쪽 두 차로 하이패스(파란 표지) */}
            {[M.wbIn, M.ebIn].map((z) => <B key={z} s={[0.1, 0.7, 2.4]} p={[x + d * 8.32, 5.6, z]} c="#2F55E6" cast={false} />)}
          </group>
        ))}
      </Merge>
      <GroundPaints
        tex={hipass} w={7} h={1.6} opacity={0.8}
        spots={[[x - 34, M.ebIn, 0], [x + 34, M.wbIn, Math.PI]]}
      />
    </group>
  )
}

let hazardM: THREE.MeshStandardMaterial | null = null
const hazardStripe = () => (hazardM ??= mat('#F2C233'))
