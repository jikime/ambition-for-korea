// 다온 중부 철송선(정적): 부산 철송장 동쪽 분기 → 남북 철도교(간선 위, 옛 고가도로 자리) → 곤지암 철송장까지의 선로·교각,
// 곤지암 철송장 포장 · RMG 레일 · 사무동 · 조명탑 · 차막이 · CY 연결로. 노선 모양은 sim/rail.ts(linePoint · lineY)를 그대로 쓴다.
import { useMemo } from 'react'
import { B, Flat, mat } from '../kit'
import { Merge } from '../merge'
import { RailTrackSeg } from '../models/rail'
import { LightTower, SmallOffice } from '../models/sites'
import { GroundPaint } from '../models/structures'
import { paintTex } from '../textures'
import { GJ_RAIL, LINE_LEN, PIECE_S, RAMP, linePoint } from '../../sim/rail'
import * as L from '../../sim/layout'
import { L as tr } from '../../i18n'

/** 노선 토막 나누기: 곡선 · 오르내리막은 5m씩, 곧고 평평한 곳은 한 토막 */
function lineSegments(from: number) {
  const breaks = [from, PIECE_S[2], RAMP.up0, RAMP.up1, RAMP.dn0, PIECE_S[3], PIECE_S[4], RAMP.dn1, LINE_LEN].filter((s) => s >= from).sort((a, b) => a - b)
  const fine = (a: number, b: number) => {
    const mid = (a + b) / 2
    const arc = (mid > PIECE_S[1] && mid < PIECE_S[2]) || (mid > PIECE_S[3] && mid < PIECE_S[4])
    const ramp = (mid > RAMP.up0 && mid < RAMP.up1) || (mid > RAMP.dn0 && mid < RAMP.dn1)
    return arc || ramp
  }
  const out: [number, number][] = []
  for (let i = 0; i < breaks.length - 1; i++) {
    const a = breaks[i]
    const b = breaks[i + 1]
    if (b - a < 0.01) continue
    if (!fine(a, b)) {
      out.push([a, b])
      continue
    }
    const n = Math.max(1, Math.ceil((b - a) / 5))
    for (let k = 0; k < n; k++) out.push([a + ((b - a) * k) / n, a + ((b - a) * (k + 1)) / n])
  }
  return out
}

const pt = (s: number): [number, number, number] => {
  const p = linePoint(s)
  return [p.x, p.y, p.z]
}

/** 철도교 상판 한 토막(레일 면 아래, 양옆 난간) */
function DeckSeg({ a, b }: { a: [number, number, number]; b: [number, number, number] }) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const dz = b[2] - a[2]
  const flat = Math.hypot(dx, dz)
  const len = Math.hypot(flat, dy) + 0.1
  return (
    <group position={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]} rotation={[0, Math.atan2(-dz, dx), Math.atan2(dy, flat), 'YZX']}>
      <B s={[len, 1.4, 6.4]} p={[0, -0.72, 0]} c="#C3C9D6" />
      {[-3.0, 3.0].map((z) => <B key={z} s={[len, 0.8, 0.35]} p={[0, 0.4, z]} c="#E3E7EF" />)}
    </group>
  )
}

/** 남북 구간에서 간선 도로 띠 위인가(교각을 세우지 않는다) */
const overHighway = (x: number, z: number) => Math.abs(x - 1000) < 1 && z > L.MAIN.z0 - 8 && z < L.MAIN.z1 + 10

export function RailLineStatic() {
  const segs = useMemo(() => lineSegments(PIECE_S[1]), [])
  const piers = useMemo(() => {
    const out: { x: number; z: number; y: number; yaw: number }[] = []
    for (let s = RAMP.up0; s <= RAMP.dn1; s += 22) {
      const p = linePoint(s)
      if (p.y < 2.2 || overHighway(p.x, p.z)) continue
      out.push({ x: p.x, z: p.z, y: p.y, yaw: Math.atan2(-p.dz, p.dx) })
    }
    return out
  }, [])
  return (
    <Merge>
      {segs.map(([a, b], i) => {
        const A = pt(a)
        const Bp = pt(b)
        return (
          <group key={i}>
            <RailTrackSeg a={A} b={Bp} />
            {Math.max(A[1], Bp[1]) > 0.15 && <DeckSeg a={A} b={Bp} />}
          </group>
        )
      })}
      {piers.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]} rotation={[0, p.yaw, 0]}>
          <B s={[1.8, p.y - 1.4, 2.2]} p={[0, (p.y - 1.4) / 2, 0]} c="#B7BECC" />
          <B s={[2.6, 0.8, 7]} p={[0, p.y - 1.8, 0]} c="#AEB6C5" />
        </group>
      ))}
      {/* 간선 위 철도교: 도로 양쪽 가장자리의 두꺼운 거더 */}
      {[L.MAIN.z0 - 3, L.MAIN.z1 + 3].map((z) => (
        <B key={z} s={[6.8, 1.0, 2]} p={[1000, linePoint(PIECE_S[2] + (291 - 40 - z)).y - 1.9, z]} c="#9AA3B2" />
      ))}
      {/* 해안 탱크팜 진입로(옛 고가도로 대신 간선에서 바로) */}
      <Flat s={[7, 175]} p={[1040, 150]} c="#5B6274" y={0.016} />
    </Merge>
  )
}

/** 곤지암 철송장: 포장 · RMG 레일 · 트랙터 차로 · 사무동 · 조명탑 · 차막이 · CY 연결로 */
export function GonjiamRailStatic() {
  const G = GJ_RAIL
  const cx = (G.x0 + G.x1) / 2
  const lane = (G.z + G.stackZ[0]) / 2
  return (
    <Merge>
      <Flat s={[G.x1 - G.x0 + 20, G.rmgZ1 - G.rmgZ0 + 10]} p={[cx, (G.rmgZ0 + G.rmgZ1) / 2]} c="#DCE0E8" y={0.012} />
      {[G.rmgZ0, G.rmgZ1].map((z) => <Flat key={z} s={[G.x1 - G.x0 + 10, 0.35]} p={[cx, z]} c="#8C96AA" y={0.03} />)}
      {[lane - 2.6, lane + 2.6].map((z) => <Flat key={z} s={[G.x1 - G.x0, 0.2]} p={[cx, z]} c="#FFFFFF" y={0.03} />)}
      <GroundPaint tex={paintTex(tr('철송장 · 트랙터 차로', 'Rail · Tractor lane'), '#5B6B90', 512, 96)} w={13} h={2.4} p={[G.x0 + 24, lane]} opacity={0.8} />
      {/* 차막이(선로 끝) */}
      <B s={[1.2, 1.4, 3.4]} p={[G.end - 0.6, 0.7, G.z]} c="#E2463C" />
      <B s={[1.25, 0.3, 3.45]} p={[G.end - 0.6, 1.1, G.z]} c="#F2C233" cast={false} />
      {/* CY 연결로: 트랙터 차로 동쪽 끝 → 곤지암 CY 뒤 길(CY.turnX) */}
      <Flat s={[7, L.CY.backZ - G.rmgZ1 + 4]} p={[L.CY.turnX, (L.CY.backZ + G.rmgZ1) / 2]} m={mat('#5B6274', { rough: 0.95 })} y={0.016} />
      <group position={[G.x0 + 14, 0, G.rmgZ1 + 12]} rotation={[0, Math.PI, 0]}>
        <SmallOffice w={14} d={7} floors={2} label="곤지암 철송장" />
      </group>
      {[G.x0 + 50, G.x1 - 20].map((x) => (
        <group key={x} position={[x, 0, G.rmgZ1 + 6]}>
          <LightTower h={22} />
        </group>
      ))}
    </Merge>
  )
}
