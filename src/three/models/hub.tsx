// 곤지암 메가허브 분류동 내부 설비(정적). 움직이는 캐리어·상자·롤테이너 적재량은 entities/Hub.tsx가 그린다.
import * as THREE from 'three'
import { useMemo } from 'react'
import { B, COLORS, Cyl, RB, cylGeo, mat, torusGeo, unitBox, unitPlane } from '../kit'
import { labelTex } from '../textures'
import { L, isEn } from '../../i18n'
import { Decal } from './structures'
import { Person, RollCage } from './equipment'
import { CAGE_Z, CHUTE_END_Z, CHUTE_X, DESK, DEST_LABEL, DESTS, FEED_PATHS, GJ_OUT, HUB, INDUCT_X, IRREG, REJECT_END_Z, REJECT_X, SCAN_X } from '../../sim/hub'

const HALL = { x0: -28, x1: 14, z0: -44, z1: -10 }
const FRAME = '#C3CAD8'
const RAIL = '#97A1B5'

function beltMat() {
  return mat('#3B4252', { rough: 0.7 })
}

/** 한 구간짜리 평벨트(프레임 + 벨트 + 다리) */
function Belt({ a, b, y, w = 0.9 }: { a: [number, number]; b: [number, number]; y: number; w?: number }) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const ang = Math.atan2(-(b[1] - a[1]), b[0] - a[0])
  const cx = (a[0] + b[0]) / 2
  const cz = (a[1] + b[1]) / 2
  return (
    <group position={[cx, 0, cz]} rotation={[0, ang, 0]}>
      <B s={[len + w * 0.2, 0.2, w + 0.2]} p={[0, y - 0.1, 0]} c={FRAME} />
      <mesh geometry={unitBox} position={[0, y + 0.02, 0]} scale={[len + w * 0.2, 0.05, w]} material={beltMat()} receiveShadow />
      {[0.5, -0.5].map((s) => <B key={s} s={[len + w * 0.2, 0.12, 0.05]} p={[0, y + 0.07, s * (w + 0.1)]} c={RAIL} />)}
      {Array.from({ length: Math.max(2, Math.floor(len / 2.5) + 1) }, (_, i) => -len / 2 + (len * i) / Math.max(1, Math.floor(len / 2.5))).map((x) => (
        <B key={x} s={[0.09, y - 0.2, w]} p={[x, (y - 0.2) / 2, 0]} c="#8C96AA" />
      ))}
    </group>
  )
}

function Polyline({ pts, y, w }: { pts: [number, number][]; y: number; w?: number }) {
  return <>{pts.slice(1).map((p, i) => <Belt key={i} a={pts[i]} b={p} y={y} w={w} />)}</>
}

/** 루프 끝 반원(평평한 반원 고리 + 바깥 스커트) */
function LoopEnd({ x, z, dir }: { x: number; z: number; dir: 1 | -1 }) {
  const geo = useMemo(() => {
    const g = new THREE.RingGeometry(HUB.r - 0.65, HUB.r + 0.65, 28, 1, -Math.PI / 2, Math.PI)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])
  const skirt = useMemo(() => new THREE.CylinderGeometry(HUB.r + 0.68, HUB.r + 0.68, 0.32, 28, 1, true, 0, Math.PI), [])
  return (
    <group position={[x, 0, z]} rotation={[0, dir === 1 ? 0 : Math.PI, 0]}>
      <mesh geometry={geo} position={[0, HUB.y + 0.03, 0]} material={beltMat()} receiveShadow />
      <mesh geometry={skirt} position={[0, HUB.y - 0.1, 0]} material={mat(FRAME, { side: THREE.DoubleSide })} castShadow />
      {[-60, -20, 20, 60].map((deg) => {
        const a = (deg * Math.PI) / 180
        return <B key={deg} s={[0.12, HUB.y - 0.2, 0.12]} p={[HUB.r * Math.cos(a), (HUB.y - 0.2) / 2, -HUB.r * Math.sin(a)]} c="#8C96AA" />
      })}
    </group>
  )
}

/** 천장에 매단 안내판(양면) */
function Sign({ text, sub, p, bg = '#1E3BB3', w = 2.4 }: { text: string; sub?: string; p: [number, number, number]; bg?: string; w?: number }) {
  const label = sub ? `${text} · ${sub}` : text
  // 글자 수로 칸 폭을 잡는다(영어 글자는 한글보다 좁다)
  const px = Math.max(260, label.length * (isEn ? 28 : 46) + 70)
  const tex = labelTex(label, bg, '#FFFFFF', px, 96)
  const h = (w * 96) / px
  const rod = 10.6 - p[1]
  return (
    <group position={p}>
      {[-1, 1].map((s) => <B key={s} s={[0.04, rod, 0.04]} p={[s * (w / 2 - 0.15), h / 2 + rod / 2, 0]} c="#B4BDCD" cast={false} />)}
      <Decal tex={tex} w={w} h={h} p={[0, 0, 0.02]} />
      <Decal tex={tex} w={w} h={h} p={[0, 0, -0.02]} r={[0, Math.PI, 0]} />
    </group>
  )
}

export function HubSortHall() {
  const { cx, cz, half, r, y } = HUB
  const floor = useMemo(() => mat('#E6EAF2', { rough: 0.9 }), [])
  return (
    <group>
      {/* 바닥 · 통로 */}
      <mesh geometry={unitPlane} position={[(HALL.x0 + HALL.x1) / 2, 0.05, (HALL.z0 + HALL.z1) / 2]} scale={[HALL.x1 - HALL.x0 - 0.8, 1, HALL.z1 - HALL.z0 - 0.8]} material={floor} receiveShadow />
      <B s={[HALL.x1 - HALL.x0 - 2, 0.02, 0.14]} p={[(HALL.x0 + HALL.x1) / 2, 0.07, -14]} c={COLORS.yellow} cast={false} />
      <B s={[HALL.x1 - HALL.x0 - 2, 0.02, 0.14]} p={[(HALL.x0 + HALL.x1) / 2, 0.07, -41.5]} c={COLORS.yellow} cast={false} />
      <B s={[0.14, 0.02, 26]} p={[-26, 0.07, -27.5]} c={COLORS.yellow} cast={false} />

      {/* 크로스벨트 루프 소터 */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <B s={[2 * half, 0.3, 1.36]} p={[cx, y - 0.13, cz + s * r]} c={FRAME} />
          <mesh geometry={unitBox} position={[cx, y + 0.03, cz + s * r]} scale={[2 * half, 0.05, 1.18]} material={beltMat()} receiveShadow />
          {[0.68, -0.68].map((dz) => <B key={dz} s={[2 * half, 0.16, 0.05]} p={[cx, y + 0.1, cz + s * r + dz]} c={RAIL} />)}
          {Array.from({ length: 9 }, (_, i) => cx - half + 1 + i * ((2 * half - 2) / 8)).map((x) => (
            <B key={x} s={[0.12, y - 0.2, 1.1]} p={[x, (y - 0.2) / 2, cz + s * r]} c="#8C96AA" />
          ))}
        </group>
      ))}
      <LoopEnd x={cx + half} z={cz} dir={1} />
      <LoopEnd x={cx - half} z={cz} dir={-1} />
      {/* 제어반 */}
      <group position={[cx - half - r - 2.2, 0, cz]}>
        <RB s={[0.8, 1.9, 2.4]} rad={0.05} p={[0, 0.95, 0]} c="#E9EDF5" />
        <B s={[0.03, 0.5, 0.9]} p={[0.41, 1.4, 0.3]} m={mat('#1B2A4A', { emissive: '#2C5BFF', emissiveIntensity: 0.6 })} cast={false} />
        <Cyl rt={0.06} h={0.04} p={[0.42, 1.0, -0.6]} r={[0, 0, Math.PI / 2]} c="#E8453C" />
      </group>

      {/* 투입 라인 · 스퍼 · 투입 작업자 */}
      <Polyline pts={[[HUB.feedX0 - 0.6, HUB.feedZ], [INDUCT_X[INDUCT_X.length - 1] + 0.5, HUB.feedZ]]} y={y} />
      {INDUCT_X.map((x) => (
        <group key={x}>
          <Belt a={[x, HUB.feedZ + 0.5]} b={[x, cz - r - 0.7]} y={y} w={0.8} />
          <B s={[1.2, 0.18, 1.0]} p={[x + 1.05, 0.09, HUB.spurZ - 0.6]} c="#F2B92B" />
          <group position={[x + 1.05, 0.18, HUB.spurZ - 0.6]} rotation={[0, -Math.PI / 2, 0]}><Person vest="#2F55E6" /></group>
          <Decal tex={labelTex(L(`투입 ${INDUCT_X.indexOf(x) + 1}`, `Induct ${INDUCT_X.indexOf(x) + 1}`), '#2F55E6', '#FFFFFF', 200, 80)} w={0.9} h={0.36} p={[x + 1.05, 0.08, HUB.spurZ - 1.5]} r={[-Math.PI / 2, 0, 0]} />
        </group>
      ))}
      <B s={[1.2, 1.6, 0.4]} p={[HUB.feedX0 - 0.1, 0.8, HUB.feedZ]} c="#11151F" cast={false} />
      <Polyline pts={FEED_PATHS[FEED_PATHS.length - 1]} y={y} w={0.8} />

      {/* ITS 6면 스캐너 */}
      <group position={[SCAN_X, 0, cz - r]}>
        {[0.95, -0.95].map((dz) => <B key={dz} s={[0.28, 2.7, 0.28]} p={[0, 1.35, dz]} c="#F4F6FB" />)}
        <RB s={[1.2, 0.7, 2.2]} rad={0.1} p={[0, 2.8, 0]} c="#F4F6FB" />
        <B s={[1.22, 0.14, 2.22]} p={[0, 2.5, 0]} m={mat('#5B7CFF', { emissive: '#3E63FF', emissiveIntensity: 1.2 })} cast={false} />
        <B s={[1.0, 0.5, 0.06]} p={[0, 1.55, 0.88]} m={mat('#1B2A4A', { emissive: '#4C7DFF', emissiveIntensity: 0.4 })} cast={false} />
        <B s={[1.0, 0.5, 0.06]} p={[0, 1.55, -0.88]} m={mat('#1B2A4A', { emissive: '#4C7DFF', emissiveIntensity: 0.4 })} cast={false} />
      </group>
      <Sign text={L('ITS 6면 스캐너', 'ITS 6-Side Scanner')} p={[SCAN_X, 4.0, cz - r]} w={2.8} />

      {/* 행선지 슈트 + 롤테이너 */}
      {DESTS.map((d) => {
        const x = CHUTE_X[d]
        const z0 = cz + r + 0.68
        const len = CHUTE_END_Z - z0 + 0.3
        const tilt = Math.atan2(0.4, len)
        return (
          <group key={d}>
            <group position={[x, y - 0.2, z0 + len / 2]} rotation={[tilt, 0, 0]}>
              <B s={[1.2, 0.05, len]} c="#B7C0D1" />
              <B s={[0.05, 0.3, len]} p={[0.6, 0.12, 0]} c={RAIL} />
              <B s={[0.05, 0.3, len]} p={[-0.6, 0.12, 0]} c={RAIL} />
            </group>
            {d !== 'GJ' && (
              <group position={[x, 0, CAGE_Z]} rotation={[0, Math.PI, 0]}>
                <RollCage fill={0} color={d === 'IN' ? '#2F55E6' : '#5B6478'} />
              </group>
            )}
            <Sign text={d} sub={DEST_LABEL[d]} p={[x, 3.4, cz + r + 1.6]} bg={d === 'GJ' ? '#13A39A' : '#1E3BB3'} w={d === 'GJ' ? 3.0 : 2.2} />
          </group>
        )
      })}
      {/* 롤테이너 교체 작업자 · 대기 롤테이너 */}
      {[CHUTE_X.IN + 1.1, CHUTE_X.BS + 1.1, CHUTE_X.WJ + 1.1].map((x, i) => (
        <group key={x} position={[x, 0, CAGE_Z + 0.4]} rotation={[0, i % 2 ? Math.PI * 0.85 : -Math.PI * 0.8, 0]}><Person vest={i === 1 ? '#13A39A' : '#FF8A1F'} /></group>
      ))}
      {[-22, -21, -20].map((x) => (
        <group key={x} position={[x, 0, -12.6]}><RollCage fill={0} color="#5B6478" /></group>
      ))}
      {[-17.2, -16, -7.2, -6].map((x, i) => (
        <group key={x} position={[x, 0, -12.4]}><RollCage fill={0.55 + (i % 2) * 0.35} color={i < 2 ? '#2F55E6' : '#5B6478'} /></group>
      ))}

      {/* 곤지암 지역 반출 컨베이어(캐노피 배송장으로) */}
      <Polyline pts={GJ_OUT} y={0.82} w={0.8} />
      <B s={[0.5, 1.6, 1.4]} p={[HALL.x1 - 0.1, 0.8, -30]} c="#11151F" cast={false} />

      {/* 리젝트 슈트 · 데스크 */}
      <group position={[REJECT_X, y - 0.18, (cz - r - 0.68 + REJECT_END_Z) / 2]} rotation={[-Math.atan2(0.4, cz - r - 0.68 - REJECT_END_Z), 0, 0]}>
        <B s={[1.3, 0.05, cz - r - 0.68 - REJECT_END_Z + 0.3]} c="#F2B92B" />
        <B s={[0.05, 0.3, cz - r - 0.68 - REJECT_END_Z]} p={[0.65, 0.12, 0]} c="#E8453C" />
        <B s={[0.05, 0.3, cz - r - 0.68 - REJECT_END_Z]} p={[-0.65, 0.12, 0]} c="#E8453C" />
      </group>
      <B s={[2.2, 0.75, 1.3]} p={[REJECT_X, 0.4, REJECT_END_Z - 0.45]} c="#F4C24A" />
      <group position={[DESK.x, 0, DESK.z]}>
        <B s={[2.0, 0.08, 1.1]} p={[0, 0.94, 0]} c="#E9EDF5" />
        {[[0.9, 0.45], [-0.9, 0.45], [0.9, -0.45], [-0.9, -0.45]].map(([x, z], i) => <B key={i} s={[0.06, 0.9, 0.06]} p={[x, 0.45, z]} c="#8C96AA" />)}
        <B s={[0.7, 0.45, 0.04]} p={[0.55, 1.28, -0.3]} m={mat('#1B2A4A', { emissive: '#3E63FF', emissiveIntensity: 0.5 })} cast={false} />
        <B s={[0.08, 0.3, 0.08]} p={[0.55, 1.08, -0.34]} c="#5A6274" />
        <B s={[0.4, 0.03, 0.15]} p={[0.55, 0.99, -0.05]} c="#2E3442" cast={false} />
        <Cyl rt={0.08} h={0.2} p={[-0.7, 1.08, -0.3]} c="#2E3442" />
        <group position={[0, 0, -0.95]}><Person vest="#E8453C" /></group>
      </group>
      <Sign text={L('AI 리젝트 데스크', 'AI Reject Desk')} p={[DESK.x, 3.6, DESK.z - 1.6]} bg="#6C3BD1" w={3.4} />
      {/* 주소 불명 보류 카트 */}
      <group position={[DESK.x + 1.6, 0, DESK.z - 0.6]}>
        <B s={[0.9, 0.06, 0.6]} p={[0, 0.5, 0]} c="#E8453C" />
        <B s={[0.04, 0.5, 0.6]} p={[-0.45, 0.75, 0]} c="#8C96AA" />
        {[[0.35, 0.25], [-0.35, 0.25], [0.35, -0.25], [-0.35, -0.25]].map(([x, z], i) => <B key={i} s={[0.04, 0.45, 0.04]} p={[x, 0.25, z]} c="#8C96AA" />)}
      </group>

      {/* 이형물 구역 */}
      <group position={[IRREG.x, 0, IRREG.z]}>
        {[[0, -1.9, 5.4, 0.14], [0, 1.9, 5.4, 0.14]].map(([x, z, w, d], i) => <B key={i} s={[w, 0.02, d]} p={[x, 0.07, z]} c={COLORS.yellow} cast={false} />)}
        {[-2.7, 2.7].map((x) => <B key={x} s={[0.14, 0.02, 3.8]} p={[x, 0.07, 0]} c={COLORS.yellow} cast={false} />)}
        {/* 자전거 */}
        <group position={[-1.4, 0, -0.6]}>
          {[-0.5, 0.5].map((x) => <mesh key={x} geometry={torusGeo(0.34, 0.04)} position={[x, 0.38, 0]} material={mat('#2E3442')} castShadow />)}
          <B s={[1.0, 0.05, 0.05]} p={[0, 0.62, 0]} r={[0, 0, 0.1]} c="#E8453C" />
          <B s={[0.05, 0.5, 0.05]} p={[-0.15, 0.55, 0]} r={[0, 0, -0.35]} c="#E8453C" />
        </group>
        {/* 골프백 · 타이어 · 장척물 */}
        <Cyl rt={0.18} h={1.1} p={[0.2, 0.55, -0.9]} r={[0.25, 0, 0]} c="#1F3A68" />
        {[0, 1, 2].map((k) => <mesh key={k} geometry={torusGeo(0.32, 0.12)} rotation={[Math.PI / 2, 0, 0]} position={[1.6, 0.12 + k * 0.24, 0.6]} material={mat('#23262E')} castShadow />)}
        <mesh geometry={cylGeo(0.08, 0.08, 3.0, 10)} rotation={[0, 0, Math.PI / 2]} position={[-0.6, 0.12, 1.1]} material={mat('#C9A26B')} castShadow />
        <group position={[2.0, 0, -1.0]} rotation={[0, -0.6, 0]}><Person vest="#FF8A1F" /></group>
        <Decal tex={labelTex(L('이형물 라인', 'Irregulars Line'), '#F2B92B', '#1A1F2B', 300, 80)} w={1.8} h={0.48} p={[0, 0.08, 1.45]} r={[-Math.PI / 2, 0, 0]} />
      </group>
    </group>
  )
}

export { HALL as HUB_HALL }
