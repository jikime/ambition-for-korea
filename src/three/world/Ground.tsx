import { useMemo } from 'react'
import * as THREE from 'three'
import { B, COLORS, Flat, mat, unitPlane } from '../kit'
import { GroundPaint, hazardMat } from '../models/structures'
import { paintTex } from '../textures'
import * as L from '../../sim/layout'
import { L as tr } from '../../i18n'

const roadMat = () => {
  const m = mat(COLORS.road, { rough: 0.95 })
  m.userData.snow = 0.35
  return m
}
const lineMat = () => mat('#FFFFFF', { rough: 0.9 })
const yellowMat = () => mat(COLORS.yellow, { rough: 0.9 })

/** 점선을 인스턴스로 그린다 */
function Dashes({ from, to, z, x, len = 3, gap = 3, w = 0.18, color = 'white' }: { from: number; to: number; z?: number; x?: number; len?: number; gap?: number; w?: number; color?: 'white' | 'yellow' }) {
  const mesh = useMemo(() => {
    const n = Math.max(1, Math.floor((to - from) / (len + gap)))
    const m = new THREE.InstancedMesh(unitPlane, color === 'white' ? lineMat() : yellowMat(), n)
    const o = new THREE.Object3D()
    for (let i = 0; i < n; i++) {
      const c = from + i * (len + gap) + len / 2
      if (z !== undefined) {
        o.position.set(c, 0.03, z)
        o.scale.set(len, 1, w)
      } else {
        o.position.set(x!, 0.03, c)
        o.scale.set(w, 1, len)
      }
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    }
    m.receiveShadow = true
    return m
  }, [from, to, z, x, len, gap, w, color])
  return <primitive object={mesh} />
}

/** 직사각형 테두리 선 */
function Outline({ x0, x1, z0, z1, w = 0.16, color = COLORS.yellow, dashed = false }: { x0: number; x1: number; z0: number; z1: number; w?: number; color?: string; dashed?: boolean }) {
  if (dashed) {
    const c = color === COLORS.yellow ? 'yellow' : 'white'
    return (
      <group>
        <Dashes from={x0} to={x1} z={z0} len={1.2} gap={0.8} w={w} color={c} />
        <Dashes from={x0} to={x1} z={z1} len={1.2} gap={0.8} w={w} color={c} />
        <Dashes from={z0} to={z1} x={x0} len={1.2} gap={0.8} w={w} color={c} />
        <Dashes from={z0} to={z1} x={x1} len={1.2} gap={0.8} w={w} color={c} />
      </group>
    )
  }
  const m = mat(color, { rough: 0.9 })
  return (
    <group>
      <Flat s={[x1 - x0, w]} p={[(x0 + x1) / 2, z0]} m={m} y={0.03} />
      <Flat s={[x1 - x0, w]} p={[(x0 + x1) / 2, z1]} m={m} y={0.03} />
      <Flat s={[w, z1 - z0]} p={[x0, (z0 + z1) / 2]} m={m} y={0.03} />
      <Flat s={[w, z1 - z0]} p={[x1, (z0 + z1) / 2]} m={m} y={0.03} />
    </group>
  )
}

export function Ground() {
  const S = L.SITE
  const M = L.MAIN
  const E = L.ENTRY
  const Y = L.YARD
  return (
    <group>
      <mesh geometry={unitPlane} scale={[4400, 1, 4400]} position={[0, 0, 0]} material={mat(COLORS.ground, { rough: 1 })} receiveShadow />
      <Flat s={[S.x1 - S.x0, S.z1 - S.z0]} p={[(S.x0 + S.x1) / 2, (S.z0 + S.z1) / 2]} c={COLORS.pad} y={0.008} />
      <Flat s={[76, 28.5]} p={[-24, 4.25]} c="#E8ECF4" y={0.012} />

      {/* 잔디 띠 */}
      <Flat s={[S.x1 - S.x0, 2.4]} p={[(S.x0 + S.x1) / 2, S.z1 + 1.3]} c={COLORS.lawn} y={0.012} />
      <Flat s={[6, S.z1 - S.z0 + 6]} p={[S.x0 - 3.5, (S.z0 + S.z1) / 2]} c={COLORS.lawn} y={0.012} />
      <Flat s={[S.x1 - S.x0 + 12, 5]} p={[(S.x0 + S.x1) / 2, S.z0 - 3]} c={COLORS.lawn} y={0.012} />
      <Flat s={[18, 3.2]} p={[44, 15.6]} c={COLORS.lawn} y={0.014} />

      {/* 간선 도로(왕복 4차로) */}
      <Flat s={[2400, M.z1 - M.z0]} p={[0, M.z]} m={roadMat()} y={0.015} />
      <Flat s={[2400, 0.14]} p={[0, M.z - 0.17]} m={yellowMat()} y={0.03} />
      <Flat s={[2400, 0.14]} p={[0, M.z + 0.17]} m={yellowMat()} y={0.03} />
      <Dashes from={-1200} to={1200} z={(M.wbOut + M.wbIn) / 2} len={3} gap={5} />
      <Dashes from={-1200} to={1200} z={(M.ebOut + M.ebIn) / 2} len={3} gap={5} />
      <Flat s={[2400, 0.16]} p={[0, M.z0 + 0.35]} m={lineMat()} y={0.03} />
      <Flat s={[2400, 0.16]} p={[0, M.z1 - 0.35]} m={lineMat()} y={0.03} />
      {Array.from({ length: 8 }, (_, i) => (
        <Flat key={i} s={[0.7, 3.6]} p={[42 + i * 1.4 - 4.9, M.z0 + 2.2]} m={lineMat()} y={0.032} />
      ))}
      {Array.from({ length: 8 }, (_, i) => (
        <Flat key={`b${i}`} s={[0.7, 3.6]} p={[42 + i * 1.4 - 4.9, M.z1 - 2.2]} m={lineMat()} y={0.032} />
      ))}
      {/* 보도 */}
      <B s={[1200 - 0, 0.14, 3.4]} p={[E.x - 3.5 - 600, 0.07, M.z0 - 1.7]} c="#E9ECF4" cast={false} />
      <B s={[1200, 0.14, 3.4]} p={[E.x + 3.5 + 600, 0.07, M.z0 - 1.7]} c="#E9ECF4" cast={false} />
      <B s={[2400, 0.14, 3.4]} p={[0, 0.07, M.z1 + 1.7]} c="#E9ECF4" cast={false} />

      {/* 진입로 · 구내 도로 */}
      <Flat s={[7, M.z0 - E.z0]} p={[E.x, (M.z0 + E.z0) / 2]} m={roadMat()} y={0.016} />
      <Dashes from={E.z0 + 2} to={M.z0 - 1} x={E.x} len={2} gap={2} />
      <Flat s={[Y.x1 - Y.x0, 7]} p={[(Y.x0 + Y.x1) / 2, Y.z]} m={roadMat()} y={0.016} />
      <Dashes from={Y.x0 + 1} to={Y.x1 - 4} z={Y.z} len={2} gap={2} />
      <Flat s={[E.x - 3.5 - L.CANOPY.x0 + 0.1, 5]} p={[(E.x - 3.5 + L.CANOPY.x0) / 2, L.LANE_N.z]} m={roadMat()} y={0.016} />
      <Flat s={[E.x - 3.5 - L.CANOPY.x0 + 0.1, 5]} p={[(E.x - 3.5 + L.CANOPY.x0) / 2, L.LANE_S.z]} m={roadMat()} y={0.016} />
      <Flat s={[7, 0.5]} p={[E.x, L.GATE_STOP_Z + 0.2]} m={lineMat()} y={0.034} />

      {/* 윙바디 하차장 */}
      {L.BAYS.map((bx, i) => (
        <group key={bx}>
          <Outline x0={bx - 1.8} x1={bx + 1.8} z0={L.BAY_Z - 5.4} z1={L.BAY_Z + 5.6} />
          <GroundPaint tex={paintTex(tr(`하차 ${i + 1}`, `Bay ${i + 1}`), '#F2C233')} w={3.2} h={1.6} p={[bx, L.BAY_Z + 7.2]} />
        </group>
      ))}
      {/* 지게차 통로 */}
      <Dashes from={-58} to={-28} z={-0.7} len={1.4} gap={1} w={0.14} color="yellow" />
      <Dashes from={-58} to={-28} z={2.4} len={1.4} gap={1} w={0.14} color="yellow" />
      <GroundPaint tex={paintTex(tr('지게차 통로', 'Forklift lane'), '#F2C233', 384, 96)} w={4.6} h={1.15} p={[-36.5, 0.85]} opacity={0.75} />

      {/* 출고 도크 유도선 */}
      {L.OUT_DOCKS.map((dx, i) => (
        <group key={dx}>
          <Flat s={[0.16, 12]} p={[dx - 1.7, L.BUILDING.z1 + 6]} m={yellowMat()} y={0.03} />
          <Flat s={[0.16, 12]} p={[dx + 1.7, L.BUILDING.z1 + 6]} m={yellowMat()} y={0.03} />
          <GroundPaint tex={paintTex(tr(`출고 ${i + 1}`, `Out ${i + 1}`), '#FFFFFF')} w={3} h={1.5} p={[dx, L.BUILDING.z1 + 13.6]} opacity={0.85} />
        </group>
      ))}

      {/* 도크·입고문 앞 빗금(안전 구역) */}
      {L.OUT_DOCKS.map((dx) => <Flat key={`h${dx}`} s={[3.4, 0.5]} p={[dx, L.BUILDING.z1 + 0.75]} m={hazardMat()} y={0.034} />)}
      {L.IN_DOORS.map((x) => <Flat key={`h${x}`} s={[3.6, 0.5]} p={[x, L.BUILDING.z1 + 0.75]} m={hazardMat()} y={0.034} />)}
      <GroundPaint tex={paintTex(tr('입고', 'IN'), '#FFFFFF')} w={2.2} h={1.1} p={[-41, -7.6]} opacity={0.8} />
      <GroundPaint tex={paintTex(tr('출고', 'OUT'), '#FFFFFF')} w={2.2} h={1.1} p={[-1, -7.6]} opacity={0.8} />

      {/* 충전 구역 */}
      <Flat s={[7.4, 5]} p={[-24.5, -7.4]} c="#D5F0DF" y={0.02} />
      <Outline x0={-28.2} x1={-20.8} z0={-9.9} z1={-4.9} color="#35B56A" w={0.12} />
      <GroundPaint tex={paintTex(tr('충전 구역', 'Charging'), '#2FA862', 320, 96)} w={3.6} h={1.08} p={[-24.5, -4.2]} />

      {/* 분류장 차량 슬롯 */}
      {L.VAN_SLOTS.map((s, i) => {
        const z0 = s.side === 'N' ? L.VAN_N_REAR - 5.6 : L.VAN_S_REAR
        const z1 = s.side === 'N' ? L.VAN_N_REAR : L.VAN_S_REAR + 5.6
        return (
          <group key={i}>
            <Flat s={[0.14, 5.6]} p={[s.x - 2.5, (z0 + z1) / 2]} m={lineMat()} y={0.03} />
            <Flat s={[0.14, 5.6]} p={[s.x + 2.5, (z0 + z1) / 2]} m={lineMat()} y={0.03} />
            <GroundPaint tex={paintTex(`${s.side === 'N' ? 'A' : 'B'}-${(i % 6) + 1}`, '#FFFFFF')} w={2} h={1} p={[s.x, s.side === 'N' ? z0 - 0.8 : z1 + 0.8]} opacity={0.85} />
          </group>
        )
      })}

      {/* 적치장 */}
      <Outline x0={-54} x1={-21.5} z0={26.8} z1={32.6} dashed />
      <GroundPaint tex={paintTex(tr('입고 적치장', 'Staging area'), '#F2C233', 384, 96)} w={4.6} h={1.15} p={[-37.5, 33.4]} opacity={0.85} />
      <Outline x0={-17} x1={12} z0={26.8} z1={32.6} dashed />
      <GroundPaint tex={paintTex(tr('롤테이너 보관', 'Roll cages'), '#F2C233', 384, 96)} w={4.6} h={1.15} p={[-2.5, 33.4]} opacity={0.85} />
    </group>
  )
}
