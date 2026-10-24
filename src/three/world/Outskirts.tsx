// 지도 동쪽 외곽(x 870 너머, 빈 땅 채우기 격자 밖): 해안 탱크팜과 간선 양 끝 톨게이트.
// 옛 고가도로 자리(x 1000)는 다온 중부 철송선 철도교가 쓴다(world/RailLine.tsx). 모두 가상 시설이다.
import * as THREE from 'three'
import { B, Cyl, Flat, cylGeo, mat } from '../kit'
import { Merge } from '../merge'
import { SmallOffice } from '../models/sites'
import { GroundPaints } from '../models/structures'
import { paintTex } from '../textures'
import { AtlasSign, signId } from '../townAtlas'
import * as L from '../../sim/layout'
import { L as tr } from '../../i18n'

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
