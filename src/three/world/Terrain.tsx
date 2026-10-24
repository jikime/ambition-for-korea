// 지형(주변 환경 보강 1순위): 지도 가장자리를 두르는 저폴리 산(계절 색), 북쪽 골짜기에서 내려와 바다로 드는 강,
// 강을 건너는 간선 다리·철교 두 곳(부산 본선 · 중부 철송선), 강변(둔치 잔디·자전거길·버드나무), 간선·철로가 지도 밖으로 나가는 터널 입구.
// 산은 높이 함수 하나로 만든 격자 메시(면마다 색, 땅 아래로 묻힌 면은 버림)이고 그림자를 쓰지 않는다.
import { useLayoutEffect, useMemo } from 'react'
import * as THREE from 'three'
import { B, mat } from '../kit'
import { Merge } from '../merge'
import { useEnvView } from '../env/state'
import type { Season } from '../../sim/env'
import * as L from '../../sim/layout'
import { GJ_RAIL, RAIL } from '../../sim/rail'
import { AtlasSign, signId } from '../townAtlas'
import { Trees } from './Vegetation'
import { RIVER, RIVER_W } from './plan'

/** 산이 시작하는 안쪽 사각형(이 안은 평지) */
const C = { x0: -1190, x1: 1190, z0: -470, z1: 450 }
/** 터널 입구 x(간선 차가 지도 밖으로 사라지는 곳) */
export const PORTAL_X = 1150

function hash(ix: number, iz: number) {
  let h = (ix * 374761393 + iz * 668265263) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
function vnoise(x: number, z: number) {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = x - ix
  const fz = z - iz
  const sx = fx * fx * (3 - 2 * fx)
  const sz = fz * fz * (3 - 2 * fz)
  const a = hash(ix, iz)
  const b = hash(ix + 1, iz)
  const c = hash(ix, iz + 1)
  const d = hash(ix + 1, iz + 1)
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz
}
const fbm = (x: number, z: number) => 0.55 * vnoise(x / 330, z / 330) + 0.3 * vnoise(x / 140 + 17, z / 140 + 5) + 0.15 * vnoise(x / 60 + 3, z / 60 + 11)
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** 강 중심선을 촘촘하게(캣멀-롬) */
const RIVER_PTS: THREE.Vector3[] = new THREE.CatmullRomCurve3(RIVER.map(([x, z]) => new THREE.Vector3(x, 0, z))).getSpacedPoints(260)
function riverDist(x: number, z: number) {
  let best = Infinity
  for (let i = 0; i < RIVER_PTS.length - 1; i += 2) {
    const p = RIVER_PTS[i]
    const d = (p.x - x) ** 2 + (p.z - z) ** 2
    if (d < best) best = d
  }
  return Math.sqrt(best)
}
/** 강 폭: 평지(간선 근처) 넓게, 산골짜기에서는 좁게 */
const riverWidth = (z: number) => (z > C.z0 ? RIVER_W : 22)

/** 땅 높이(산). 평지·바다는 땅 아래(음수) */
export function terrainHeight(x: number, z: number) {
  if (x > 90 && z > 296) return -6
  const dx = Math.max(C.x0 - x, 0, x - C.x1)
  const dz = Math.max(C.z0 - z, 0, z - C.z1)
  let d = Math.hypot(dx, dz)
  // 터널: 간선(z≈48)·철로(z≈291) 양 끝은 입구 바로 뒤에서 가파르게 솟는다
  const ax = Math.abs(x)
  if (ax > PORTAL_X) {
    const w = Math.max(1 - smooth(22, 60, Math.abs(z - L.MAIN.z)), x > 0 ? 1 - smooth(10, 36, Math.abs(z - RAIL.z)) : 0)
    // 산 격자(40m) 꼭짓점 1160에서 오르기 시작해야 입구(1150) 앞은 평지로 남는다
    d = Math.max(d * (1 - w), w * Math.max(0, ax - PORTAL_X - 10) * 7)
  }
  const r = smooth(0, 260, d)
  if (r <= 0) return -0.6
  let h = (30 + 190 * fbm(x, z)) * r
  // 강 골짜기
  h *= smooth(riverWidth(z) / 2 + 6, 190, riverDist(x, z))
  return h - 0.6
}

const SEASON: Record<Season, { low: string[]; mid: string; high: string }> = {
  spring: { low: ['#8DBB6A', '#9CC57A', '#E9B7C9', '#86B565'], mid: '#6F9E58', high: '#9C9488' },
  summer: { low: ['#5E9A52', '#4E8C48', '#6AA65B'], mid: '#4A7F45', high: '#8E8A7E' },
  autumn: { low: ['#B7813F', '#8E9B4E', '#C2672F', '#A88A44', '#D19A45'], mid: '#7E7448', high: '#9C9488' },
  winter: { low: ['#A7AFA4', '#B9C0B6', '#97A196'], mid: '#C9D0CF', high: '#F2F4F6' },
}

/** 산 격자(땅 위로 올라온 삼각형만) */
function mountainGeo() {
  const STEP = 40
  const N = 110
  const x0 = -2200
  const z0 = -2200
  const hs: number[] = []
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) hs.push(terrainHeight(x0 + i * STEP, z0 + j * STEP))
  const pos: number[] = []
  const vtx = (i: number, j: number) => [x0 + i * STEP, hs[j * (N + 1) + i], z0 + j * STEP]
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = vtx(i, j)
      const b = vtx(i + 1, j)
      const c = vtx(i, j + 1)
      const d = vtx(i + 1, j + 1)
      // 대각선 방향을 번갈아 각진 느낌을 고르게
      const tris = (i + j) % 2 ? [[a, c, b], [b, c, d]] : [[a, c, d], [a, d, b]]
      for (const t of tris) {
        if (Math.max(t[0][1], t[1][1], t[2][1]) <= 0.3) continue
        for (const v of t) pos.push(v[0], v[1], v[2])
      }
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3))
  return g
}

function paint(g: THREE.BufferGeometry, season: Season) {
  const P = SEASON[season]
  const pos = g.attributes.position as THREE.BufferAttribute
  const nor = g.attributes.normal as THREE.BufferAttribute
  const col = g.attributes.color as THREE.BufferAttribute
  const c = new THREE.Color()
  for (let f = 0; f < pos.count; f += 3) {
    const y = (pos.getY(f) + pos.getY(f + 1) + pos.getY(f + 2)) / 3
    const x = pos.getX(f)
    const z = pos.getZ(f)
    const steep = 1 - nor.getY(f)
    const rnd = hash(Math.floor(x / 37), Math.floor(z / 41))
    if (y > (season === 'winter' ? 95 : 150)) c.set(P.high)
    else if (y > 90 || steep > 0.55) c.set(P.mid)
    else c.set(P.low[Math.floor(rnd * P.low.length)])
    // 같은 색 안에서도 면마다 조금씩 밝기 차이
    c.multiplyScalar(0.92 + hash(f, 7) * 0.14)
    for (let k = 0; k < 3; k++) col.setXYZ(f + k, c.r, c.g, c.b)
  }
  col.needsUpdate = true
}

export function Mountains() {
  const season = useEnvView((s) => s.env.season)
  const geo = useMemo(() => mountainGeo(), [])
  const m = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }), [])
  useLayoutEffect(() => paint(geo, season), [geo, season])
  return <mesh geometry={geo} material={m} />
}

/** 강 리본(중심선을 따라 폭만큼) + 둔치 잔디·자전거길 */
function ribbon(off0: number, off1: number, zMin: number, zMax: number, widthOf: (z: number) => number) {
  const pos: number[] = []
  const pts = RIVER_PTS.filter((p) => p.z >= zMin && p.z <= zMax)
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const tx = b.x - a.x
    const tz = b.z - a.z
    const l = Math.hypot(tx, tz) || 1
    const nx = -tz / l
    const nz = tx / l
    const wa = widthOf(a.z) / 2
    const wb = widthOf(b.z) / 2
    const p = (q: THREE.Vector3, w: number, o: number) => [q.x + nx * w * o, q.z + nz * w * o]
    const a0 = p(a, wa, off0)
    const a1 = p(a, wa, off1)
    const b0 = p(b, wb, off0)
    const b1 = p(b, wb, off1)
    pos.push(a0[0], 0, a0[1], b0[0], 0, b0[1], a1[0], 0, a1[1], a1[0], 0, a1[1], b0[0], 0, b0[1], b1[0], 0, b1[1])
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  // 면 방향이 아래를 보면 위로 뒤집는다
  const n = g.attributes.normal as THREE.BufferAttribute
  if (n.count && n.getY(0) < 0) {
    for (let i = 0; i < pos.length; i += 9) {
      ;[pos[i + 3], pos[i + 6]] = [pos[i + 6], pos[i + 3]]
      ;[pos[i + 4], pos[i + 7]] = [pos[i + 7], pos[i + 4]]
      ;[pos[i + 5], pos[i + 8]] = [pos[i + 8], pos[i + 5]]
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.computeVertexNormals()
  }
  return g
}

export function River() {
  const water = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: '#7FA2DC', roughness: 0.28, metalness: 0.05 })
    m.userData.noSnow = true
    return m
  }, [])
  const geos = useMemo(() => {
    const w = (z: number) => riverWidth(z)
    return {
      water: ribbon(-1, 1, -2200, 312, w),
      grassL: ribbon(-1.65, -1, C.z0, 300, w),
      grassR: ribbon(1, 1.75, C.z0, 300, w),
      bike: ribbon(1.75, 1.92, C.z0, 300, w),
    }
  }, [])
  const grass = mat('#B9D7A8', { rough: 1 })
  const bike = mat('#C77A5E', { rough: 0.95 })
  // 강변 버드나무(평지 구간 양쪽)
  const willows = useMemo(() => {
    const out: [number, number, number][] = []
    for (let i = 0; i < RIVER_PTS.length; i += 5) {
      const p = RIVER_PTS[i]
      if (p.z < C.z0 || p.z > 285 || Math.abs(p.z - L.MAIN.z) < 22) continue
      const q = RIVER_PTS[Math.min(RIVER_PTS.length - 1, i + 1)]
      const l = Math.hypot(q.x - p.x, q.z - p.z) || 1
      const nx = -(q.z - p.z) / l
      const nz = (q.x - p.x) / l
      for (const s of [-1, 1]) {
        const o = RIVER_W / 2 + 9 + (hash(i, s) - 0.5) * 4
        out.push([p.x + nx * o * s, p.z + nz * o * s, 0.9 + hash(s, i) * 0.4])
      }
    }
    return out
  }, [])
  return (
    <group>
      <mesh geometry={geos.water} material={water} position={[0, 0.012, 0]} receiveShadow />
      <mesh geometry={geos.grassL} material={grass} position={[0, 0.011, 0]} receiveShadow />
      <mesh geometry={geos.grassR} material={grass} position={[0, 0.011, 0]} receiveShadow />
      <mesh geometry={geos.bike} material={bike} position={[0, 0.013, 0]} receiveShadow />
      <Trees spots={willows} shadows={false} seed={23} lowPoly />
      <Bridges />
    </group>
  )
}

/** 강 위 간선 다리(난간·가로등·교대)와 철교(트러스) */
function Bridges() {
  const at = (z: number) => {
    let best = RIVER_PTS[0]
    for (const p of RIVER_PTS) if (Math.abs(p.z - z) < Math.abs(best.z - z)) best = p
    return best.x
  }
  const rx = at(L.MAIN.z)
  const span = RIVER_W + 18
  const steel = mat('#7E8796', { rough: 0.5, metal: 0.4 })
  return (
    <Merge>
      {/* 간선 다리 */}
      {[L.MAIN.z0 - 0.5, L.MAIN.z1 + 0.5].map((z) => (
        <group key={z}>
          <B s={[span, 1.0, 0.45]} p={[rx, 0.5, z]} c="#D9DEE8" />
          <B s={[span, 0.12, 0.5]} p={[rx, 1.06, z]} c="#9AA3B2" cast={false} />
          {[-span / 2, span / 2].map((dx) => <B key={dx} s={[2.4, 1.4, 1.2]} p={[rx + dx, 0.7, z]} c="#C9CFDB" />)}
        </group>
      ))}
      {/* 철교 두 곳(부산 본선 · 중부 철송선): 양옆 트러스(아래 · 위 현재 + 수직재) */}
      {[RAIL.z, GJ_RAIL.z].map((rz) => {
        const tx = at(rz)
        return (
          <group key={rz}>
            {[rz - 2.2, rz + 2.2].map((z) => (
              <group key={z}>
                <B s={[span, 0.7, 0.35]} p={[tx, 0.45, z]} m={steel} />
                <B s={[span, 0.4, 0.3]} p={[tx, 4.4, z]} m={steel} />
                {Array.from({ length: Math.floor(span / 5) + 1 }, (_, i) => (
                  <B key={i} s={[0.3, 4, 0.3]} p={[tx - span / 2 + i * 5, 2.4, z]} m={steel} />
                ))}
              </group>
            ))}
            {Array.from({ length: Math.floor(span / 5) + 1 }, (_, i) => (
              <B key={`t${i}`} s={[0.25, 0.25, 4.4]} p={[tx - span / 2 + i * 5, 4.55, rz]} m={steel} cast={false} />
            ))}
          </group>
        )
      })}
    </Merge>
  )
}

/** 터널 입구: 간선 양 끝, 철로 동쪽 끝(콘크리트 문틀 + 어두운 안) */
export function TunnelPortals() {
  const road: [number, number, number, number][] = [
    // x, 가운데 z, 열린 폭, 바깥 방향(+1 동쪽)
    [-PORTAL_X, L.MAIN.z, 17, -1], [PORTAL_X, L.MAIN.z, 17, 1], [PORTAL_X, RAIL.z, 7, 1],
  ]
  const dark = mat('#1C2130', { rough: 1 })
  return (
    <Merge>
      {road.map(([x, z, w, dir], i) => {
        const h = w > 10 ? 8 : 7
        // 입구에서 산 속으로 들어가는 콘크리트 통(앞부분은 비탈 위로 드러남)
        const len = 70
        return (
          <group key={i} position={[x, 0, z]}>
            <B s={[1.6, h + 3, 3]} p={[0, (h + 3) / 2, -w / 2 - 1.5]} c="#C9CED8" />
            <B s={[1.6, h + 3, 3]} p={[0, (h + 3) / 2, w / 2 + 1.5]} c="#C9CED8" />
            <B s={[1.6, 3, w + 6]} p={[0, h + 1.5, 0]} c="#C9CED8" />
            <B s={[len, h + 2.4, w + 4]} p={[dir * (len / 2 + 0.8), (h + 2.4) / 2, 0]} c="#B9BFCB" />
            <B s={[len, h, w]} p={[dir * (len / 2 + 0.6), h / 2, 0]} m={dark} cast={false} />
            {w > 10 && <AtlasSign cell={signId('다온터널')} w={6} h={1.3} p={[-dir * 0.85, h + 1.6, 0]} r={[0, -dir * Math.PI / 2, 0]} lit />}
          </group>
        )
      })}
    </Merge>
  )
}

/** 지형 한데 모으기 */
export function Terrain() {
  return (
    <group name="terrain">
      <Mountains />
      <River />
      <TunnelPortals />
    </group>
  )
}
