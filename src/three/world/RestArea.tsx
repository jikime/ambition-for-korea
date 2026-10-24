// 고속도로 휴게소(다온휴게소) 두 곳: 방향마다 하나씩 간선 양쪽에 있다.
// 감속 차로 → 진입로 → 화물차 전용 칸(앞으로 들어가 앞으로 나가는 통과식) → 뒤 통로 → 합류.
// 칸 뒤쪽에 휴게소 건물(푸드코트·편의점)·화장실·승용차 주차장이 있고, 간선에 "다온휴게소 1km" 표지가 선다.
// 쉬는 화물차 기사는 건물까지 걸어갔다가 휴게가 끝날 즈음 돌아와 다시 출발한다.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { B, COLORS, Cyl, Flat, mat, unitPlane } from '../kit'
import { canvasTex, labelTex, paintTex } from '../textures'
import { Merge } from '../merge'
import { Decal, GroundPaint } from '../models/structures'
import { CarModel } from '../models/vehicles'
import { Person } from '../models/equipment'
import { MAIN } from '../../sim/layout'
import { REST_AREAS, restSigns, type RestArea } from '../../sim/rest'
import { sim, SPEEDUP } from '../../sim/sim'
import { useStore } from '../../store'
import { lampMaterial } from '../env/state'
import { L, isEn } from '../../i18n'

const roadMat = () => {
  const m = mat(COLORS.road, { rough: 0.95 })
  m.userData.snow = 0.35
  return m
}
const plazaMat = () => {
  const m = mat('#E9E2D6', { rough: 0.9 })
  m.userData.snow = 0.5
  return m
}

/** 두 점을 잇는 도로 띠 */
function Strip({ a, b, w, m, y = 0.017 }: { a: [number, number]; b: [number, number]; w: number; m: THREE.Material; y?: number }) {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const len = Math.hypot(dx, dz)
  return <mesh geometry={unitPlane} scale={[len + w * 0.5, 1, w]} position={[(a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2]} rotation={[0, -Math.atan2(dz, dx), 0]} material={m} receiveShadow />
}

/** 글자가 maxW보다 넓으면 글꼴을 줄인다(영어 문구가 한국어보다 길다) */
function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: number, px: number, maxW: number) {
  let size = px
  ctx.font = `${weight} ${size}px Pretendard, sans-serif`
  while (ctx.measureText(text).width > maxW && size > 12) {
    size -= 2
    ctx.font = `${weight} ${size}px Pretendard, sans-serif`
  }
}

/** 고속도로 휴게소 안내 표지(초록 바탕) */
const signTex = (title: string, sub: string) =>
  canvasTex(`rest-sign-${title}-${sub}`, 512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#17734A'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth = 8
    ctx.strokeRect(10, 10, w - 20, h - 20)
    ctx.fillStyle = '#FFFFFF'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    fitFont(ctx, title, 900, 70, w - 48)
    ctx.fillText(title, w / 2, 92)
    fitFont(ctx, sub, 700, 40, w - 48)
    ctx.fillText(sub, w / 2, 182)
  })

/** 휴게소 건물 간판 */
const roofSign = () =>
  canvasTex('rest-roof-sign', 640, 128, (ctx, w, h) => {
    ctx.fillStyle = '#1F2A44'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#FFFFFF'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const title = L('다온휴게소', 'Daon Rest Area')
    const sub = L('푸드코트 · 편의점', 'Food · Store')
    fitFont(ctx, title, 900, 76, isEn ? 400 : w)
    ctx.fillText(title, isEn ? 215 : w / 2 - 70, h / 2 + 4)
    ctx.fillStyle = '#FFB020'
    fitFont(ctx, sub, 800, 40, isEn ? 200 : w)
    ctx.fillText(sub, isEn ? 528 : w / 2 + 200, h / 2 + 4)
  })

function RoadSign({ p, face, title, sub }: { p: [number, number]; face: number; title: string; sub: string }) {
  const tex = useMemo(() => signTex(title, sub), [title, sub])
  return (
    <group position={[p[0], 0, p[1]]} rotation={[0, face, 0]}>
      <B s={[0.3, 6.6, 0.3]} p={[-2.2, 3.3, -0.2]} c="#9AA4B8" />
      <B s={[0.3, 6.6, 0.3]} p={[2.2, 3.3, -0.2]} c="#9AA4B8" />
      <B s={[6.2, 3.2, 0.14]} p={[0, 5.6, -0.05]} c="#17734A" />
      <Decal tex={tex} w={6} h={3} p={[0, 5.6, 0.03]} />
    </group>
  )
}

/** 휴게소 한 곳의 정적 모델 */
function RestAreaStatic({ a }: { a: RestArea }) {
  const d = a.dir
  // 간선에서 멀어지는 쪽(+1 남쪽, -1 북쪽)
  const s = a.slipZ > MAIN.z ? 1 : -1
  const edge = s > 0 ? MAIN.z1 : MAIN.z0
  const bayXs = a.bays.map((b) => b.x)
  const xs = [a.outX, a.inX + d * 22, ...bayXs]
  const lx0 = Math.min(...xs) - 3.5
  const lx1 = Math.max(...xs) + 3.5
  const lz0 = Math.min(a.aisleZ, a.outZ) - 3.5
  const lz1 = Math.max(a.aisleZ, a.outZ) + 3.5
  const road = useMemo(roadMat, [])
  const plaza = useMemo(plazaMat, [])
  const line = useMemo(() => mat('#FFFFFF', { rough: 0.9 }), [])
  const yellow = useMemo(() => mat(COLORS.yellow, { rough: 0.9 }), [])
  const bayPaint = useMemo(() => paintTex(L('화물', 'Truck'), '#FFFFFF'), [])
  const roof = useMemo(roofSign, [])
  const glow = useMemo(() => lampMaterial(new THREE.MeshStandardMaterial({ map: roof, emissive: '#FFFFFF', emissiveMap: roof, emissiveIntensity: 0.4 })), [roof])
  // 건물 쪽(칸 뒤 통로 너머)
  const bz = a.door.z + s * 8
  const bx = a.door.x
  const carLotX = a.id === 'N' ? lx1 - 20 : lx0 + 22
  const wc = a.id === 'N' ? bx - 42 : bx + 40
  const half = Math.abs(a.bays[1].x - a.bays[0].x) / 2
  const dividers = [...new Set(bayXs.flatMap((x) => [x - half, x + half]))]
  // 구내 포장 중 간선에 가까운 쪽 끝
  const near = s > 0 ? lz0 : lz1
  return (
    <group>
      <Merge>
        {/* 구내 포장 · 진입로 · 진출로 */}
        <Flat s={[lx1 - lx0, lz1 - lz0]} p={[(lx0 + lx1) / 2, (lz0 + lz1) / 2]} m={road} y={0.016} />
        <Strip a={[a.inX - d * 30, edge + s * 1.6]} b={[a.inX, a.slipZ]} w={5.5} m={road} />
        <Strip a={[a.inX, a.slipZ]} b={[a.inX + d * 14, a.slipZ]} w={6.5} m={road} />
        <Strip a={[a.inX + d * 14, a.slipZ]} b={[a.inX + d * 22, a.aisleZ]} w={6.5} m={road} />
        <Strip a={[a.outX, a.outZ]} b={[a.outX, edge - s * 0.5]} w={7} m={road} />
        <Strip a={[a.outX, edge + s * 1.6]} b={[a.outX + d * 26, edge + s * 1.6]} w={3.6} m={road} />
        {/* 간선과 구내 사이 녹지 */}
        <Flat s={[Math.abs(a.inX - a.outX), Math.abs(edge - near)]} p={[(a.inX + a.outX) / 2, (edge + near) / 2]} c={COLORS.lawn} y={0.012} />
        {/* 화물차 칸: 칸 사이 흰 선(앞으로 들어가 앞으로 나가는 통과식) */}
        {dividers.map((x) => <Flat key={x} s={[0.18, 20]} p={[x, a.bays[0].stopZ - s * 4]} m={line} y={0.03} />)}
        {/* 통로 진행 방향 노란 점선 */}
        <Flat s={[lx1 - lx0 - 10, 0.16]} p={[(lx0 + lx1) / 2, a.aisleZ + s * 3.2]} m={yellow} y={0.03} />
        <Flat s={[lx1 - lx0 - 10, 0.16]} p={[(lx0 + lx1) / 2, a.outZ - s * 3.2]} m={yellow} y={0.03} />
        {/* 보행 광장 · 건물 */}
        <Flat s={[lx1 - lx0, 6]} p={[(lx0 + lx1) / 2, a.outZ + s * 6.5]} m={plaza} y={0.018} />
        <Flat s={[64, 20]} p={[bx, bz + s * 1]} m={plaza} y={0.017} />
        <B s={[46, 6, 14]} p={[bx, 3, bz + s * 2]} c="#F2EEE6" />
        <B s={[47, 0.7, 15]} p={[bx, 6.3, bz + s * 2]} c="#2B3654" />
        {/* 유리 전면 */}
        <B s={[38, 3.6, 0.08]} p={[bx, 2.1, bz + s * 2 - s * 7.02]} c="#7FA3E8" cast={false} />
        {/* 처마 */}
        <B s={[44, 0.35, 4]} p={[bx, 4.6, bz + s * 2 - s * 8.5]} c="#E1DAD0" />
        {[-20, -10, 0, 10, 20].map((x) => <Cyl key={x} rt={0.16} h={4.5} p={[bx + x, 2.25, bz + s * 2 - s * 10.2]} c="#B9B2A6" />)}
        {/* 지붕 간판 받침 */}
        <B s={[0.3, 2.2, 0.3]} p={[bx - 8, 7.6, bz + s * 2]} c="#7A8296" />
        <B s={[0.3, 2.2, 0.3]} p={[bx + 8, 7.6, bz + s * 2]} c="#7A8296" />
        {/* 화장실 동 */}
        <B s={[14, 4.2, 10]} p={[wc, 2.1, bz + s * 2]} c="#E8ECF3" />
        <B s={[14.6, 0.5, 10.6]} p={[wc, 4.45, bz + s * 2]} c="#5A6B8C" />
        <Decal tex={labelTex(L('화장실', 'Restroom'), '#5A6B8C', '#FFFFFF', 256, 96)} w={3} h={1.1} p={[wc, 3.2, bz + s * 2 - s * 5.03]} r={[0, s > 0 ? Math.PI : 0, 0]} />
        {/* 벤치 · 파라솔 */}
        {[-14, -4, 6, 16].map((x) => (
          <group key={x} position={[bx + x, 0, a.outZ + s * 6.5]}>
            <B s={[2.2, 0.45, 0.7]} p={[0, 0.45, 0]} c={COLORS.wood} />
            <Cyl rt={0.06} h={2.6} p={[0, 1.3, 0]} c="#C9CED8" />
            <mesh position={[0, 2.6, 0]} material={mat(x % 20 === 6 ? '#FF8A3D' : '#2F55E6')} castShadow>
              <coneGeometry args={[1.5, 0.6, 12]} />
            </mesh>
          </group>
        ))}
        {/* 승용차 주차장 */}
        <Flat s={[34, 16]} p={[carLotX, bz + s * 1]} m={road} y={0.016} />
        {[-2.5, 3.5].flatMap((dz) => Array.from({ length: 11 }, (_, k) => <Flat key={`${dz}-${k}`} s={[0.12, 5]} p={[carLotX - 15 + k * 3, bz + s * (1 + dz)]} m={line} y={0.03} />))}
        {/* 조경(승용차 주차장 반대쪽) */}
        <Flat s={[8, 14]} p={[a.id === 'N' ? lx0 + 6 : lx1 - 6, bz + s * 2]} c={COLORS.lawn} y={0.014} />
      </Merge>
      {a.bays.map((b, i) => (
        <GroundPaint key={i} tex={bayPaint} w={3.2} h={1.6} p={[b.x, b.stopZ - s * 11]} rot={s > 0 ? Math.PI : 0} />
      ))}
      {/* 지붕 간판(밤에 빛남) */}
      <mesh position={[bx, 8.7, bz + s * 2]} rotation={[0, s > 0 ? Math.PI : 0, 0]} material={glow} userData={{ noMerge: true }}>
        <planeGeometry args={[18, 3.6]} />
      </mesh>
      <mesh position={[bx, 8.7, bz + s * 2 + s * 0.02]} rotation={[0, s > 0 ? 0 : Math.PI, 0]} material={glow} userData={{ noMerge: true }}>
        <planeGeometry args={[18, 3.6]} />
      </mesh>
      {/* 승용차 몇 대 */}
      {[0, 2, 3, 6, 8, 9].map((k, i) => (
        <group key={k} position={[carLotX - 13.5 + k * 3, 0, bz + s * (i % 2 ? 4.5 : -1.5)]} rotation={[0, i % 2 ? 0 : Math.PI, 0]}>
          <Merge><CarModel color={['#F4F6FA', '#22262F', '#9AA4B8', '#E45B4B', '#2F55E6', '#F4F6FA'][i]} kind={i % 3 === 0 ? 'suv' : 'sedan'} /></Merge>
        </group>
      ))}
      {/* 간선 표지: 500m 전, 입구 */}
      {restSigns(a).map(([x, z], k) => (
        <RoadSign key={k} p={[x, z]} face={d > 0 ? -Math.PI / 2 : Math.PI / 2} title={k ? L('다온휴게소 ↗', 'Daon Rest Area ↗') : L('다온휴게소', 'Daon Rest Area')} sub={k ? L('입구 · 화물차 전용 칸', 'Entrance · Truck bays') : L('500m · 화물차 휴게', '500m · Truck rest stop')} />
      ))}
    </group>
  )
}

/** 쉬는 기사: 트럭에서 건물까지 걸어갔다가(실내에서 쉬고) 돌아온다 */
function Drivers({ a }: { a: RestArea }) {
  const refs = useRef<(THREE.Group | null)[]>([])
  const s = a.slipZ > MAIN.z ? 1 : -1
  const plazaZ = a.outZ + s * 6.5
  useFrame(() => {
    a.bays.forEach((bay, i) => {
      const g = refs.current[i]
      if (!g) return
      const v = bay.vehicle ? sim.vehicle(bay.vehicle) : null
      const r = v?.rest
      if (!v || !r || !r.parked || r.area !== a.id) {
        g.visible = false
        return
      }
      // 운전석 문(진행 방향 왼쪽) → 광장 → 건물 입구
      const sx = bay.x + (s > 0 ? 1.6 : -1.6)
      const pts: [number, number][] = [[sx, bay.stopZ], [sx, plazaZ], [a.door.x, plazaZ], [a.door.x, a.door.z]]
      const segs = pts.slice(1).map((p, k) => Math.hypot(p[0] - pts[k][0], p[1] - pts[k][1]))
      const total = segs.reduce((x, y) => x + y, 0)
      const walk = Math.min(total / 2.2, Math.max(2, (r.dur - 6) / 2))
      let f: number
      let back = false
      if (r.t < walk) f = r.t / walk
      else if (r.t > r.dur - walk) {
        f = (r.dur - r.t) / walk
        back = true
      } else {
        g.visible = false
        return
      }
      let dist = Math.max(0, Math.min(1, f)) * total
      let k = 0
      while (k < segs.length - 1 && dist > segs[k]) dist -= segs[k++]
      const [x0, z0] = pts[k]
      const [x1, z1] = pts[k + 1]
      const u = segs[k] ? Math.min(1, dist / segs[k]) : 0
      g.visible = true
      g.position.set(x0 + (x1 - x0) * u, 0, z0 + (z1 - z0) * u)
      const ang = Math.atan2(x1 - x0, z1 - z0)
      g.rotation.y = back ? ang + Math.PI : ang
    })
  })
  return (
    <Merge>
      {a.bays.map((_, i) => (
        <group key={i} userData={{ dynamic: true }} visible={false} ref={(o) => { refs.current[i] = o }}>
          <Person vest={['#3B4458', '#5B6478', '#2F55E6', '#7A5CFF'][i % 4]} helmet="#2E3442" cap />
        </group>
      ))}
    </Merge>
  )
}

/** 쉬는 차 위의 이름표: ☕ 휴게 · 남은 시간(시계 기준) */
function RestTags() {
  useStore((s) => s.tick)
  const tags: { id: string; x: number; z: number; text: string }[] = []
  for (const v of sim.vehicles) {
    const r = v.rest
    if (!r || !r.parked || !v.visible) continue
    const left = Math.max(1, Math.round(((r.dur - r.t) * SPEEDUP) / 60))
    tags.push({ id: v.id, x: v.x, z: v.z, text: r.area ? L(`☕ 휴게 · ${left}분 남음`, `☕ Rest · ${left} min left`) : L('기사 교대', 'Driver swap') })
  }
  return (
    <group>
      {tags.map((t) => (
        <group key={t.id} position={[t.x, 6.2, t.z]}>
          <Html center zIndexRange={[14, 0]} style={{ pointerEvents: 'none' }}>
            <div className="rest-tag">{t.text}</div>
          </Html>
        </group>
      ))}
    </group>
  )
}

export function RestAreas() {
  return (
    <group>
      {REST_AREAS.map((a) => (
        <group key={a.id}>
          <RestAreaStatic a={a} />
          <Drivers a={sim.restAreas.find((x) => x.id === a.id) ?? a} />
        </group>
      ))}
      <RestTags />
    </group>
  )
}

