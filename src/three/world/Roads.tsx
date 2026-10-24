// 거점 밖 이면도로(주변 환경 보강 1순위): 빈 땅 채우기 칸 경계의 왕복 2차로(가운데 노란 선)와 간선 연결로,
// 그 위를 도는 장식용 차(승용·SUV·1톤 택배차·탑차). 배치는 world/plan.ts, 차는 시뮬레이션과 무관하다.
import { useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import type { CameraControlsImpl } from '@react-three/drei'
import * as THREE from 'three'
import { COLORS, Flat, mat } from '../kit'
import { Merge } from '../merge'
import { Fleet } from '../fleet'
import { BoxTruckModel, CarModel, VanModel } from '../models/vehicles'
import { mulberry32 } from '../../sim/data'
import { CELL, ROAD_HALF, infillPlan, roadPlan } from './plan'

const roadMat = () => {
  // 간선보다 한 톤 어둡게(빈 땅과 구분)
  const m = mat('#C3CBDD', { rough: 0.95 })
  m.userData.snow = 0.35
  return m
}

export function LocalRoads() {
  const segs = useMemo(() => roadPlan(), [])
  const asphalt = roadMat()
  const yellow = mat(COLORS.yellow, { rough: 0.9 })
  const w = ROAD_HALF * 2
  return (
    <Merge name="local-roads">
      {segs.map((s, i) => {
        const hz = s.z0 === s.z1
        const len = hz ? s.x1 - s.x0 : s.z1 - s.z0
        const cx = (s.x0 + s.x1) / 2
        const cz = (s.z0 + s.z1) / 2
        // 교차점 네모를 메우려고 양 끝을 반폭만큼 늘린다(연결로는 간선 쪽으로 늘리지 않음)
        const ext = s.link ? 0 : w
        return (
          <group key={i}>
            <Flat s={hz ? [len + ext, w] : [w, len + ext]} p={[cx, cz]} m={asphalt} y={0.015} />
            {len > 14 && <Flat s={hz ? [len - 12, 0.16] : [0.16, len - 12]} p={[cx, cz]} m={yellow} y={0.026} />}
          </group>
        )
      })}
    </Merge>
  )
}

/** 한 칸을 시계 방향(북쪽 변 동쪽으로 → 동쪽 변 남쪽으로…)으로 도는 모서리 둥근 사각형 위치. 오른쪽 차로 = 칸 안쪽 */
function loopPose(cx: number, cz: number, s: number, out: { x: number; z: number; h: number }) {
  const half = CELL / 2 - 1.75
  const r = 5
  const straight = half * 2 - r * 2
  const quarter = (Math.PI * r) / 2
  const side = straight + quarter
  const per = side * 4
  let d = ((s % per) + per) % per
  const k = Math.floor(d / side)
  d -= k * side
  // 변마다 시작 모서리 · 진행 방향(북 → 동 → 남 → 서)
  const dirs: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]]
  const starts: [number, number][] = [[-half + r, -half], [half, -half + r], [half - r, half], [-half, half - r]]
  const [dx, dz] = dirs[k]
  const [sx, sz] = starts[k]
  if (d < straight) {
    out.x = cx + sx + dx * d
    out.z = cz + sz + dz * d
    out.h = Math.atan2(dx, dz)
    return
  }
  // 모서리 1/4 원
  const a = (d - straight) / r
  const [nx, nz] = dirs[(k + 1) % 4]
  const ex = sx + dx * straight
  const ez = sz + dz * straight
  // 원의 가운데 = 모서리 끝에서 다음 방향 쪽으로 r
  const ccx = ex + nx * r
  const ccz = ez + nz * r
  const ang0 = Math.atan2(-nz, -nx)
  const ang = ang0 + a * (dx * nz - dz * nx > 0 ? 1 : -1)
  out.x = cx + ccx + Math.cos(ang) * r
  out.z = cz + ccz + Math.sin(ang) * r
  const hx = dx * Math.cos(a) + nx * Math.sin(a)
  const hz = dz * Math.cos(a) + nz * Math.sin(a)
  out.h = Math.atan2(hx, hz)
}

/** 이면도로를 도는 장식 차: 네 변이 모두 도로인 칸 가운데 30곳에 한 대씩 */
export function LocalTraffic() {
  const controls = useThree((s) => s.controls) as unknown as CameraControlsImpl | null
  const plan = useMemo(() => {
    const segs = roadPlan()
    const key = new Set(segs.map((s) => `${s.x0},${s.z0},${s.x1},${s.z1}`))
    const h = CELL / 2
    const ok = infillPlan().filter((c) =>
      key.has(`${c.x - h},${c.z - h},${c.x + h},${c.z - h}`) && key.has(`${c.x - h},${c.z + h},${c.x + h},${c.z + h}`)
      && key.has(`${c.x - h},${c.z - h},${c.x - h},${c.z + h}`) && key.has(`${c.x + h},${c.z - h},${c.x + h},${c.z + h}`))
    const r = mulberry32(77)
    const pick = ok.map((c) => ({ c, o: r() })).sort((a, b) => a.o - b.o).slice(0, 30).map((x) => x.c)
    const cars = pick.map((c, i) => {
      const roll = r()
      const kind = roll < 0.5 ? 0 : roll < 0.7 ? 1 : roll < 0.87 ? 2 : 3
      return { cx: c.x, cz: c.z, kind, s: r() * 400, speed: kind === 3 ? 7 + r() * 2 : 8.5 + r() * 3, i }
    })
    const counts = [0, 0, 0, 0]
    const slot = cars.map((c) => counts[c.kind]++)
    const palette = ['#F4F6FA', '#2D3445', '#B8C2D6', '#E45B4B', '#5D79E8', '#8A94A8', '#1F2633', '#C9D3E6']
    const colors: (string[] | null)[] = [
      cars.filter((c) => c.kind === 0).map((c) => palette[c.i % palette.length]),
      cars.filter((c) => c.kind === 1).map((c) => palette[(c.i * 3) % palette.length]),
      null,
      null,
    ]
    return { cars, counts, slot, colors }
  }, [])
  const kinds = useMemo(() => [
    <CarModel key="s" color="#FFFFFF" kind="sedan" />,
    <CarModel key="u" color="#FFFFFF" kind="suv" />,
    <VanModel key="v" carrier="daon" />,
    <BoxTruckModel key="b" carrier="hangil" />,
  ], [])
  const m4 = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const p = useMemo(() => new THREE.Vector3(), [])
  const one = useMemo(() => new THREE.Vector3(1, 1, 1), [])
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const pose = useMemo(() => ({ x: 0, z: 0, h: 0 }), [])
  const last = useRef(performance.now())
  return (
    <Fleet
      kinds={kinds}
      counts={plan.counts}
      colors={plan.colors}
      shadows={false}
      visible={() => (controls?.distance ?? 0) < 1600}
      update={(put) => {
        const now = performance.now()
        const dt = Math.min(0.05, (now - last.current) / 1000)
        last.current = now
        plan.cars.forEach((c, n) => {
          c.s += c.speed * dt
          loopPose(c.cx, c.cz, c.s, pose)
          p.set(pose.x, 0, pose.z)
          q.setFromAxisAngle(up, pose.h)
          m4.compose(p, q, one)
          put(c.kind, plan.slot[n], m4)
        })
      }}
    />
  )
}
