// 철송 모델(항만 관제 영상 분석 3순위): 자갈·침목 선로, 컨테이너 셔틀 기관차, 평판 화차, 레일 위 갠트리 크레인(RMG).
// 모두 긴 축이 x(선로 방향)다. 기관차는 운전실이 −x 쪽.
import { useMemo } from 'react'
import * as THREE from 'three'
import { B, COLORS, cylGeo, mat, planeUV, repeatTex } from '../kit'
import { canvasTex } from '../textures'

/** 침목 한 칸(자갈 위 나무 침목): u가 선로 방향 */
function sleeperTex() {
  return canvasTex('rail-sleeper', 64, 64, (ctx) => {
    ctx.fillStyle = '#8E897F'
    ctx.fillRect(0, 0, 64, 64)
    for (let i = 0; i < 140; i++) {
      ctx.fillStyle = i % 3 === 0 ? '#76716A' : i % 3 === 1 ? '#A39D92' : '#88837A'
      ctx.fillRect((i * 37) % 64, (i * 53) % 64, 2, 2)
    }
    ctx.fillStyle = '#5B4B3D'
    ctx.fillRect(22, 6, 22, 52)
  })
}

const SLEEPER = 0.65
const steel = () => mat('#9AA3B2', { rough: 0.35, metal: 0.6 })

/** 선로 한 줄(자갈 바닥 + 침목 무늬 + 레일 두 줄) */
export function RailTrack({ x0, x1, z }: { x0: number; x1: number; z: number }) {
  const L = x1 - x0
  const geo = useMemo(() => planeUV([0, 0, L / SLEEPER, 1]), [L])
  const m = useMemo(() => new THREE.MeshStandardMaterial({ map: repeatTex(sleeperTex()), roughness: 0.95 }), [])
  return (
    <group>
      <mesh geometry={geo} material={m} rotation={[-Math.PI / 2, 0, 0]} position={[(x0 + x1) / 2, 0.03, z]} scale={[L, 3.2, 1]} receiveShadow />
      {[-0.72, 0.72].map((o) => (
        <B key={o} s={[L, 0.16, 0.08]} p={[(x0 + x1) / 2, 0.12, z + o]} m={steel()} cast={false} />
      ))}
    </group>
  )
}

/** 아무 방향 선로 한 토막(a → b, 높이 포함): 곡선·경사 구간을 짧은 토막으로 잇는다 */
export function RailTrackSeg({ a, b }: { a: [number, number, number]; b: [number, number, number] }) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const dz = b[2] - a[2]
  const flat = Math.hypot(dx, dz)
  const L = Math.hypot(flat, dy)
  const geo = useMemo(() => planeUV([0, 0, L / SLEEPER, 1]), [L])
  const m = useMemo(() => new THREE.MeshStandardMaterial({ map: repeatTex(sleeperTex()), roughness: 0.95 }), [])
  return (
    <group position={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]} rotation={[0, Math.atan2(-dz, dx), Math.atan2(dy, flat), 'YZX']}>
      <mesh geometry={geo} material={m} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} scale={[L + 0.05, 3.2, 1]} receiveShadow />
      {[-0.72, 0.72].map((o) => (
        <B key={o} s={[L + 0.05, 0.16, 0.08]} p={[0, 0.12, o]} m={steel()} cast={false} />
      ))}
    </group>
  )
}

function Wheelset({ x }: { x: number }) {
  return (
    <group position={[x, 0.45, 0]}>
      {[-0.72, 0.72].map((o) => (
        <mesh key={o} geometry={cylGeo(0.45, 0.45, 0.14, 14)} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, o]} material={mat('#2E3442')} />
      ))}
    </group>
  )
}

function Bogie({ x }: { x: number }) {
  return (
    <group position={[x, 0, 0]}>
      <B s={[3, 0.5, 2.3]} p={[0, 0.75, 0]} c="#2E3442" />
      <Wheelset x={-0.95} />
      <Wheelset x={0.95} />
    </group>
  )
}

/** 컨테이너 셔틀 기관차(가상 "다온레일"): 길이 19m, 운전실 −x */
export function Locomotive({ color = COLORS.brandDeep }: { color?: string }) {
  return (
    <group>
      <B s={[18.6, 0.5, 2.9]} p={[0, 1.35, 0]} c="#2B303B" />
      <B s={[15.4, 2.7, 2.8]} p={[0.9, 2.95, 0]} c={color} />
      <B s={[15.42, 0.26, 2.82]} p={[0.9, 2.2, 0]} c="#F2C233" cast={false} />
      {/* 운전실: 앞이 조금 낮고 창이 넓다 */}
      <B s={[2.9, 2.9, 2.9]} p={[-7.9, 3.05, 0]} c="#F4F6FA" />
      <B s={[0.06, 0.95, 2.4]} p={[-9.37, 3.75, 0]} c="#22324F" cast={false} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <B s={[1.6, 0.8, 0.05]} p={[-7.9, 3.75, s * 1.46]} c="#22324F" cast={false} />
          {/* 옆 환기창 */}
          {[-2, 1, 4, 7].map((x) => <B key={x} s={[1.8, 0.7, 0.04]} p={[x, 3.4, s * 1.41]} c="#2A3550" cast={false} />)}
        </group>
      ))}
      <B s={[0.3, 0.22, 0.04]} p={[-9.4, 2.0, 0.9]} m={mat('#FFF4C8', { emissive: '#FFF4C8', emissiveIntensity: 0.5 })} cast={false} />
      <B s={[0.3, 0.22, 0.04]} p={[-9.4, 2.0, -0.9]} m={mat('#FFF4C8', { emissive: '#FFF4C8', emissiveIntensity: 0.5 })} cast={false} />
      {/* 지붕 냉각 팬 */}
      {[1.5, 4.5].map((x) => <mesh key={x} geometry={cylGeo(0.8, 0.8, 0.25, 16)} position={[x, 4.4, 0]} material={mat('#3A4152')} />)}
      <B s={[2.4, 0.4, 1.6]} p={[-3, 4.45, 0]} c="#3A4152" />
      <Bogie x={-5.6} />
      <Bogie x={5.6} />
    </group>
  )
}

/** 40ft 컨테이너 평판 화차(길이 15.2m). 컨테이너는 따로 얹는다 */
export function FlatWagon() {
  return (
    <group>
      <B s={[14.8, 0.32, 2.5]} p={[0, 1.08, 0]} c="#3A4152" />
      <B s={[14.8, 0.18, 0.16]} p={[0, 1.0, 1.2]} c="#2B303B" cast={false} />
      <B s={[14.8, 0.18, 0.16]} p={[0, 1.0, -1.2]} c="#2B303B" cast={false} />
      {[-6.6, 6.6].map((x) => <B key={x} s={[0.3, 0.2, 2.5]} p={[x, 1.3, 0]} c="#F2C233" cast={false} />)}
      <Bogie x={-5.4} />
      <Bogie x={5.4} />
    </group>
  )
}

/** 레일 위 갠트리 크레인: 다리가 z0·z1 레일에, 위 거더를 따라 트롤리(z)가, 트롤리 아래 스프레더(y)가 움직인다 */
export function RmgFrame({ span, h = 16 }: { span: number; h?: number }) {
  const half = span / 2
  return (
    <group>
      {[-half, half].map((z) => (
        <group key={z}>
          {[-4, 4].map((x) => <B key={x} s={[0.9, h, 0.9]} p={[x, h / 2, z]} c={COLORS.brand} />)}
          <B s={[10, 0.9, 1.3]} p={[0, 0.75, z]} c={COLORS.brandDeep} />
          <B s={[9, 0.8, 0.8]} p={[0, h * 0.55, z]} c={COLORS.brand} />
          {/* 다리 바퀴 */}
          {[-4.2, -3, 3, 4.2].map((x) => <mesh key={x} geometry={cylGeo(0.35, 0.35, 0.4, 12)} rotation={[Math.PI / 2, 0, 0]} position={[x, 0.35, z]} material={mat('#2E3442')} />)}
        </group>
      ))}
      {/* 위 거더 두 줄 + 가로보 */}
      {[-2.4, 2.4].map((x) => <B key={x} s={[1, 1.7, span + 6]} p={[x, h + 0.6, 0]} c="#EEF1F6" />)}
      {[-half, half].map((z) => <B key={z} s={[9.4, 1.2, 1.2]} p={[0, h + 0.4, z]} c="#EEF1F6" />)}
      {/* 운전실 */}
      <B s={[2, 2, 2.2]} p={[3.8, h - 1.6, -half + 3]} c="#F4F6FA" />
      <B s={[0.04, 0.9, 1.8]} p={[4.82, h - 1.4, -half + 3]} c="#22324F" cast={false} />
    </group>
  )
}

/** 트롤리(거더 위를 z로 움직이는 몸체) */
export function RmgTrolley({ h = 16 }: { h?: number }) {
  return (
    <group>
      <B s={[5.6, 1.6, 4]} p={[0, h + 1.9, 0]} c="#F2C233" />
      <B s={[5, 0.4, 3.4]} p={[0, h + 0.9, 0]} c="#3A4152" />
    </group>
  )
}

/** 스프레더(40ft 컨테이너를 집는 틀) */
export function Spreader() {
  return (
    <group>
      <B s={[12.2, 0.35, 2.3]} p={[0, 0.18, 0]} c="#F2C233" />
      <B s={[2.6, 0.5, 1.6]} p={[0, 0.55, 0]} c="#3A4152" />
    </group>
  )
}
