// 도로변: 가로등(밤엔 바닥에 빛), 교차로 신호등, 대형 광고판(일부는 LED로 광고가 바뀜),
// 중앙분리대, 횡단보도, 전봇대, 주유소. 실제 국도변 풍경을 참고했다.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { B, COLORS, Cyl, Flat, RB, cylGeo, mat, unitBox, unitPlane } from '../kit'
import { canvasTex, labelTex } from '../textures'
import { AD_KEYS, adTex } from '../ads'
import { Merge } from '../merge'
import { Decal } from '../models/structures'
import { TrafficLight } from '../models/sites'
import { CarModel } from '../models/vehicles'
import { Person } from '../models/equipment'
import * as L from '../../sim/layout'
import { L as tr } from '../../i18n'
import { GATES } from '../../sim/world'
import { restClear } from '../../sim/rest'
import { TW } from '../../sim/sites'
import { sim } from '../../sim/sim'
import { lampMaterial, look } from '../env/state'

/** [x, z, 팔 방향(라디안, 0이면 +z쪽으로 뻗음)] */
export type LampSpec = [number, number, number]

const GATE_XS = [GATES.GJ.x, GATES.IN.x, GATES.IC.x, GATES.BS.x, GATES.S.x, GATES.AP.x, GATES.DJ.x]
const nearGate = (x: number, r = 12) => GATE_XS.some((g) => Math.abs(x - g) < r)

export function lampSpots(extra: LampSpec[] = []): LampSpec[] {
  const out: LampSpec[] = []
  for (let x = -1100; x <= 1100; x += 36) {
    if (!nearGate(x, 6) && !restClear(x, 'N')) out.push([x, L.MAIN.z0 - 2.6, 0])
    if (!nearGate(x + 18, 6) && !restClear(x + 18, 'S')) out.push([x + 18, L.MAIN.z1 + 2.6, Math.PI])
  }
  // 다온마을 도로 양쪽
  for (let z = 70; z < 260; z += 30) {
    out.push([TW.road.x - 5.2, z, Math.PI / 2])
    out.push([TW.road.x + 5.2, z + 15, -Math.PI / 2])
  }
  // 단지 안 도로
  for (let x = -420; x > -552; x -= 30) out.push([x, TW.apt.roadZ - 4.6, 0])
  // 광주 시내 지방도
  for (let z = 72; z < 290; z += 32) out.push([GATES.S.x - 5.2, z, Math.PI / 2])
  return [...out, ...extra]
}

/** 기본 가로등 위치(모듈 로드 때 한 번 계산) */
export const LAMP_SPOTS = lampSpots()

const POOL = canvasTex('lamp-pool', 128, 128, (ctx, w, h) => {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
  g.addColorStop(0, 'rgba(255,214,150,0.95)')
  g.addColorStop(0.45, 'rgba(255,200,130,0.45)')
  g.addColorStop(1, 'rgba(255,190,120,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
})

/** 가로등(인스턴스) + 밤에만 보이는 바닥 불빛 */
export function StreetLamps({ spots }: { spots: LampSpec[] }) {
  const { meshes, pools, poolMat } = useMemo(() => {
    const n = spots.length
    const pole = new THREE.InstancedMesh(cylGeo(0.09, 0.13, 8, 8), mat('#9AA4B8'), n)
    const arm = new THREE.InstancedMesh(unitBox, mat('#9AA4B8'), n)
    const head = new THREE.InstancedMesh(unitBox, lampMaterial(mat('#FFF8E6', { emissive: '#FFE9B8', emissiveIntensity: 0.45 })), n)
    const pm = new THREE.MeshBasicMaterial({ map: POOL, color: '#FFD9A0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 })
    const pool = new THREE.InstancedMesh(unitPlane, pm, n)
    const o = new THREE.Object3D()
    const local = new THREE.Vector3()
    spots.forEach(([x, z, rot], i) => {
      const dir = (dz: number) => local.set(Math.sin(rot) * dz, 0, Math.cos(rot) * dz)
      o.rotation.set(0, rot, 0)
      o.position.set(x, 4, z)
      o.scale.set(1, 1, 1)
      o.updateMatrix()
      pole.setMatrixAt(i, o.matrix)
      dir(0.9)
      o.position.set(x + local.x, 7.9, z + local.z)
      o.scale.set(0.12, 0.12, 1.8)
      o.updateMatrix()
      arm.setMatrixAt(i, o.matrix)
      dir(1.75)
      o.position.set(x + local.x, 7.82, z + local.z)
      o.scale.set(0.38, 0.14, 0.75)
      o.updateMatrix()
      head.setMatrixAt(i, o.matrix)
      dir(2.6)
      o.rotation.set(0, 0, 0)
      o.position.set(x + local.x, 0.07, z + local.z)
      o.scale.set(11, 1, 11)
      o.updateMatrix()
      pool.setMatrixAt(i, o.matrix)
    })
    pole.castShadow = true
    pool.renderOrder = 2
    return { meshes: [pole, arm, head], pools: pool, poolMat: pm }
  }, [spots])
  useFrame(() => {
    poolMat.opacity = Math.max(0, look.night - 0.25) * 0.75
    pools.visible = poolMat.opacity > 0.01
  })
  return (
    <group>
      {meshes.map((m, i) => <primitive key={i} object={m} />)}
      <primitive object={pools} />
    </group>
  )
}

/** 투광등 아래 바닥 불빛(밤에만): [x, z, 지름] */
export function GlowPools({ spots, color = '#FFE2B0' }: { spots: [number, number, number][]; color?: string }) {
  const { mesh, m } = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ map: POOL, color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 })
    const mesh = new THREE.InstancedMesh(unitPlane, m, spots.length)
    const o = new THREE.Object3D()
    spots.forEach(([x, z, d], i) => {
      o.position.set(x, 0.08, z)
      o.scale.set(d, 1, d)
      o.updateMatrix()
      mesh.setMatrixAt(i, o.matrix)
    })
    mesh.renderOrder = 2
    return { mesh, m }
  }, [spots, color])
  useFrame(() => {
    m.opacity = Math.max(0, look.night - 0.25) * 0.6
    mesh.visible = m.opacity > 0.01
  })
  return <primitive object={mesh} />
}

// ───────────────────────── 대형 광고판

function adMaterial(key: string) {
  const t = adTex(key)
  return lampMaterial(new THREE.MeshStandardMaterial({ map: t, emissive: '#FFFFFF', emissiveMap: t, emissiveIntensity: 0.3, roughness: 0.55 }))
}

/** 기둥 하나짜리 대형 광고판(12m×5m, 양면). ads가 여러 개면 LED처럼 8초마다 바뀐다 */
export function Billboard({ ads, p, rot = 0 }: { ads: string[]; p: [number, number]; rot?: number }) {
  const front = useMemo(() => adMaterial(ads[0]), [ads])
  const back = useMemo(() => adMaterial(ads[1 % ads.length]), [ads])
  const idx = useRef(0)
  const acc = useRef(0)
  useFrame((_, dt) => {
    if (ads.length < 3) return
    acc.current += dt
    if (acc.current < 8) return
    acc.current = 0
    idx.current = (idx.current + 1) % ads.length
    const t = adTex(ads[idx.current])
    front.map = front.emissiveMap = t
    const t2 = adTex(ads[(idx.current + 2) % ads.length])
    back.map = back.emissiveMap = t2
  })
  const W = 12
  const H = 5
  const Y = 11
  return (
    <group position={[p[0], 0, p[1]]} rotation={[0, rot, 0]}>
      <Merge>
        <Cyl rt={0.42} rb={0.55} h={Y} p={[0, Y / 2, 0]} c="#8C96AA" />
        <B s={[1.6, 0.5, 1.6]} p={[0, 0.25, 0]} c="#B4BDCD" />
        <B s={[W + 0.5, H + 0.5, 0.55]} p={[0, Y + H / 2, 0]} c="#2E3442" />
        <B s={[W, 0.1, 1.1]} p={[0, Y - 0.15, 0.6]} c="#9AA4B8" />
        <B s={[W, 0.06, 0.06]} p={[0, Y + 0.7, 1.15]} c="#9AA4B8" />
        {[-4.5, -1.5, 1.5, 4.5].map((x) => (
          <group key={x}>
            <B s={[0.08, 0.08, 1.4]} p={[x, Y - 0.2, 0.9]} c="#5A6274" />
            <B s={[0.5, 0.18, 0.3]} p={[x, Y - 0.25, 1.6]} r={[0.5, 0, 0]} m={lampMaterial(mat('#FFF6D8', { emissive: '#FFE7A0', emissiveIntensity: 0.4 }))} />
          </group>
        ))}
      </Merge>
      <mesh position={[0, Y + H / 2, 0.29]} material={front} userData={{ noMerge: true }}>
        <planeGeometry args={[W, H]} />
      </mesh>
      <mesh position={[0, Y + H / 2, -0.29]} rotation={[0, Math.PI, 0]} material={back} userData={{ noMerge: true }}>
        <planeGeometry args={[W, H]} />
      </mesh>
    </group>
  )
}

export function Billboards() {
  return (
    <group>
      <Billboard ads={['dawn', 'app']} p={[-330, 28]} />
      <Billboard ads={['air', 'travel']} p={[96, 70]} rot={Math.PI} />
      <Billboard ads={AD_KEYS} p={[300, 28]} />
      <Billboard ads={['milk', 'tv']} p={[-560, 28]} />
      <Billboard ads={['sale', 'dawn', 'tv', 'app']} p={[560, 70]} rot={Math.PI} />
      <Billboard ads={['travel', 'air']} p={[-880, 70]} rot={Math.PI} />
    </group>
  )
}

// ───────────────────────── 교차로 신호등 · 횡단보도 · 중앙분리대

type GateKey = 'GJ' | 'IN' | 'IC' | 'BS' | 'AP' | 'DJ'

/** 거점 출입 교차로 신호. 거점 차량이 드나들면 간선 신호가 빨간불로 바뀐다 */
export function GateSignals() {
  const lamps = useRef<{ g: GateKey | null; side: number; o: THREE.Object3D }[]>([])
  const state = useRef<Record<string, { s: number; t: number }>>({})
  useFrame(({ clock }, dt) => {
    for (const k of ['GJ', 'IN', 'IC', 'BS', 'AP', 'DJ', 'S'] as const) {
      const st = (state.current[k] ??= { s: 2, t: 0 })
      const g = k === 'S' ? null : sim.gates[k]
      const busy = g ? g.inOpen > 0.25 || g.outOpen > 0.25 : clock.elapsedTime % 24 > 18
      st.t += dt
      // 2=녹색, 1=황색, 0=적색
      if (busy && st.s === 2) { st.s = 1; st.t = 0 }
      else if (st.s === 1 && st.t > 1.6) { st.s = 0; st.t = 0 }
      else if (st.s === 0 && !busy && st.t > 3) { st.s = 2; st.t = 0 }
    }
    for (const l of lamps.current) {
      const s = state.current[l.g ?? 'S']?.s ?? 2
      l.o.children.forEach((m, i) => {
        const mm = (m as THREE.Mesh).material as THREE.MeshStandardMaterial
        mm.emissiveIntensity = i === s ? 1.8 : 0.06
      })
    }
  })
  const signals: { g: GateKey | null; x: number; north: boolean }[] = []
  for (const [k, gate] of [['GJ', GATES.GJ], ['IN', GATES.IN], ['IC', GATES.IC], ['BS', GATES.BS], ['AP', GATES.AP], ['DJ', GATES.DJ], [null, GATES.S]] as const) {
    signals.push({ g: k, x: gate.x - 10, north: true })
    signals.push({ g: k, x: gate.x + 10, north: false })
  }
  return (
    <group>
      {signals.map((s, i) => (
        <group key={i} position={[s.x, 0, s.north ? L.MAIN.z0 - 1.6 : L.MAIN.z1 + 1.6]} rotation={[0, s.north ? 0 : Math.PI, 0]}>
          <TrafficLight arm={6} lampRef={(o) => {
            if (!o) return
            if (!lamps.current.some((l) => l.o === o)) {
              o.children.forEach((m) => { const mesh = m as THREE.Mesh; mesh.material = (mesh.material as THREE.Material).clone() })
              lamps.current.push({ g: s.g, side: s.north ? 0 : 1, o })
            }
          }} />
        </group>
      ))}
    </group>
  )
}

/** 중앙분리대(교차로에서는 끊긴다) · 횡단보도 · 전봇대 */
export function RoadFurniture() {
  const median = useMemo(() => {
    const segs: [number, number][] = []
    const cuts = [...GATE_XS].sort((a, b) => a - b)
    let cur = -1180
    for (const c of cuts) {
      segs.push([cur, c - 22])
      cur = c + 22
    }
    segs.push([cur, 1180])
    return segs.filter(([a, b]) => b - a > 4)
  }, [])
  const poles = useMemo(() => {
    const out: [number, number][] = []
    for (let z = 66; z < 290; z += 28) out.push([GATES.S.x + 5.6, z])
    for (let z = 66; z < 262; z += 28) out.push([TW.road.x + 7.4, z + 6])
    return out
  }, [])
  return (
    <group>
      <Merge>
        {median.map(([a, b]) => (
          <group key={a}>
            <B s={[b - a, 0.75, 0.45]} p={[(a + b) / 2, 0.375, L.MAIN.z]} c="#C9CED8" />
            <B s={[b - a, 0.08, 0.47]} p={[(a + b) / 2, 0.62, L.MAIN.z]} c={COLORS.yellow} cast={false} />
          </group>
        ))}
        {/* 횡단보도: 정문 교차로 옆 */}
        {[GATES.GJ.x + 15, GATES.IN.x - 15, GATES.S.x + 14].flatMap((x) =>
          Array.from({ length: 7 }, (_, k) => <Flat key={`${x}-${k}`} s={[3.2, 0.6]} p={[x, L.MAIN.z0 + 1 + k * 2]} c="#FFFFFF" y={0.035} />),
        )}
        {/* 전봇대 + 전선 */}
        {poles.map(([x, z]) => (
          <group key={`${x}-${z}`} position={[x, 0, z]}>
            <Cyl rt={0.14} rb={0.2} h={10} p={[0, 5, 0]} c="#B7B1A6" />
            <B s={[1.8, 0.12, 0.12]} p={[0, 9.2, 0]} c="#6B6F78" />
            <Cyl rt={0.18} h={0.6} p={[0.5, 8.5, 0]} c="#7A7F88" />
          </group>
        ))}
        {poles.slice(0, -1).map(([x, z], i) => {
          const [nx, nz] = poles[i + 1]
          if (Math.abs(nx - x) > 1) return null
          return [-0.7, 0.7].map((dx) => <B key={`${i}${dx}`} s={[0.03, 0.03, nz - z]} p={[x + dx, 9.1, (z + nz) / 2]} c="#2E3442" cast={false} />)
        })}
      </Merge>
    </group>
  )
}

// ───────────────────────── 주유소

export function GasStation({ p }: { p: [number, number] }) {
  const price = useMemo(() => canvasTex('gas-price', 256, 512, (ctx, w, h) => {
    ctx.fillStyle = '#1A1F2B'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#2F55E6'
    ctx.fillRect(0, 0, w, 120)
    ctx.fillStyle = '#FFFFFF'
    ctx.textAlign = 'center'
    ctx.font = '900 54px Pretendard, sans-serif'
    ctx.fillText(tr('다온오일', 'Daon Oil'), w / 2, 80)
    const rows: [string, string][] = [[tr('휘발유', 'Gasoline'), '1,689'], [tr('경유', 'Diesel'), '1,548'], [tr('고급', 'Premium'), '1,912']]
    rows.forEach(([a, b], i) => {
      ctx.font = '700 34px Pretendard, sans-serif'
      ctx.fillStyle = '#B7BEDA'
      ctx.fillText(a, w / 2, 180 + i * 120)
      ctx.font = '800 56px Pretendard, sans-serif'
      ctx.fillStyle = i === 1 ? '#35D07F' : '#FFB020'
      ctx.fillText(b, w / 2, 236 + i * 120)
    })
  }), [])
  const priceMat = useMemo(() => lampMaterial(new THREE.MeshStandardMaterial({ map: price, emissive: '#FFFFFF', emissiveMap: price, emissiveIntensity: 0.35 })), [price])
  return (
    <group position={[p[0], 0, p[1]]}>
      <Merge>
        <Flat s={[30, 22]} p={[0, 0]} c="#D9DEE8" y={0.02} />
        {/* 캐노피 */}
        <B s={[20, 0.9, 12]} p={[0, 5.6, 0]} c="#F4F6FB" />
        <B s={[20.1, 0.5, 12.1]} p={[0, 5.4, 0]} c="#2F55E6" />
        <B s={[19, 0.05, 11]} p={[0, 5.12, 0]} m={lampMaterial(mat('#FFFFFF', { emissive: '#FFF6E0', emissiveIntensity: 0.25 }))} cast={false} />
        {[[-7, -3.5], [7, -3.5], [-7, 3.5], [7, 3.5]].map(([x, z], i) => <B key={i} s={[0.45, 5.2, 0.45]} p={[x, 2.6, z]} c="#C9CED8" />)}
        {/* 주유기 섬 2개 */}
        {[-4, 4].map((x) => (
          <group key={x} position={[x, 0, 0]}>
            <B s={[1.4, 0.25, 7]} p={[0, 0.12, 0]} c="#B4BDCD" />
            {[-2, 2].map((z) => (
              <group key={z} position={[0, 0.25, z]}>
                <RB s={[0.8, 1.7, 0.6]} rad={0.08} p={[0, 0.85, 0]} c="#F4F6FB" />
                <B s={[0.82, 0.3, 0.62]} p={[0, 1.55, 0]} c="#2F55E6" />
                <B s={[0.4, 0.3, 0.03]} p={[0, 1.15, 0.31]} c="#1A1F2B" cast={false} />
              </group>
            ))}
          </group>
        ))}
        {/* 편의점 겸 사무실 */}
        <B s={[10, 3.6, 6]} p={[0, 1.8, -10]} c="#F4F6FB" />
        <B s={[10.1, 0.6, 6.1]} p={[0, 3.3, -10]} c="#2F55E6" />
        <B s={[6, 2.0, 0.06]} p={[-1.5, 1.4, -6.97]} c="#7FA3E8" cast={false} />
        <Decal tex={labelTex(tr('다온오일 · 셀프', 'Daon Oil · Self'), '#2F55E6', '#FFFFFF', 420, 96)} w={4.2} h={0.96} p={[0, 5.5, 6.08]} />
        {/* 세차기 */}
        <B s={[4, 3.4, 7]} p={[11, 1.7, -8]} c="#E3E7F0" />
        <B s={[3.2, 2.8, 0.05]} p={[11, 1.4, -4.48]} c="#1A1F2B" cast={false} />
        {/* 가격 표시 기둥 */}
        <B s={[0.5, 7, 0.5]} p={[13, 3.5, 9]} c="#9AA4B8" />
      </Merge>
      <mesh position={[13, 7.5, 9.3]} material={priceMat} userData={{ noMerge: true }}>
        <planeGeometry args={[1.6, 3.2]} />
      </mesh>
      {/* 주유 중인 차와 사람 */}
      <group position={[-2.4, 0, -2]} rotation={[0, Math.PI, 0]}><Merge><CarModel color="#E45B4B" /></Merge></group>
      <group position={[5.6, 0, 2]}><Merge><CarModel color="#F4F6FA" kind="suv" /></Merge></group>
      <group position={[-3.2, 0, -0.2]} rotation={[0, -Math.PI / 2, 0]}><Merge><Person vest="#5B6478" helmet="#2E3442" cap /></Merge></group>
    </group>
  )
}
