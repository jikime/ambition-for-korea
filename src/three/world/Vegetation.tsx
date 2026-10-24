import { useEffect, useMemo } from 'react'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import * as THREE from 'three'
import { COLORS, cylGeo, mat, repeatTex, unitBox } from '../kit'
import { meshTex } from '../textures'
import { mulberry32 } from '../../sim/data'
import * as L from '../../sim/layout'
import type { Season } from '../../sim/env'
import { restClear } from '../../sim/rest'
import { useEnvView } from '../env/state'

/** [x, z, 크기, 가로수 여부(1=가로수)] */
type TreeSpec = [number, number, number, number?]

export { NO_TREE, blocked, rectBlocked } from './zones'
import { blocked } from './zones'
import { Prop } from '../props'
import { roadRects } from './plan'

/** 나무 배치(결정론적) */
export function treeSpots(): TreeSpec[] {
  const r = mulberry32(42)
  const out: TreeSpec[] = []
  const S = L.SITE
  const j = () => (r() - 0.5) * 1.2
  const entries = [62, -392, 372, 180, -60, -700, 700]
  const nearEntry = (x: number) => entries.some((e) => Math.abs(x - e) < 11)
  // 간선도로 가로수
  for (let x = -760; x < 760; x += 12) {
    // 난수 순서를 지키려고 먼저 뽑고 휴게소 진입·진출로 자리는 건너뛴다
    if (!nearEntry(x)) {
      const a = [x + j(), 59.6, 0.95 + r() * 0.3, 1] as TreeSpec
      if (!restClear(x, 'S')) out.push(a)
    }
    if (!nearEntry(x + 6)) {
      const b = [x + 6 + j(), 36.8, 0.85 + r() * 0.3, 1] as TreeSpec
      if (!restClear(x + 6, 'N')) out.push(b)
    }
  }
  // 곤지암 외곽
  for (let z = S.z0; z < S.z1; z += 7) out.push([S.x0 - 3.5 + j() * 0.6, z + j(), 0.9 + r() * 0.4])
  for (let x = S.x0 - 4; x < S.x1 + 6; x += 8) out.push([x + j(), S.z0 - 3, 0.9 + r() * 0.4])
  for (let z = S.z0; z < S.z1 - 4; z += 8) out.push([S.x1 + 3 + j() * 0.6, z + j(), 0.9 + r() * 0.3])
  for (const [x, z] of [[37, 15.6], [41, 15.6], [47, 15.6], [51, 15.6], [32, 6], [32, 12]]) out.push([x, z, 0.8 + r() * 0.2])
  // 인천 · 이천 외곽
  for (let x = -536; x < -366; x += 8) out.push([x + j(), -78, 0.9 + r() * 0.4])
  for (let z = -74; z < 30; z += 8) out.push([-536 + j() * 0.6, z + j(), 0.9 + r() * 0.4])
  for (let x = 356; x < 536; x += 8) out.push([x + j(), -84, 0.9 + r() * 0.4])
  for (let z = -80; z < 30; z += 8) out.push([534 + j() * 0.6, z + j(), 0.9 + r() * 0.4])
  // 다온마을 가로수 · 단지 조경
  for (let z = 64; z < 262; z += 11) {
    out.push([-398.5 + j() * 0.3, z + j(), 0.85 + r() * 0.25, 1])
    if (z > 96) out.push([-385.6 + j() * 0.3, z + 5 + j(), 0.8 + r() * 0.25, 1])
  }
  for (const x of [-461, -500, -541, -420]) for (const z of [143.5, 156.5]) out.push([x + j(), z, 0.75 + r() * 0.25])
  for (let x = -556; x < -404; x += 9) {
    out.push([x + j(), 84, 0.9 + r() * 0.3])
    out.push([x + j(), 222, 0.9 + r() * 0.3])
  }
  for (const [x, z] of [[-470, 188], [-505, 186], [-545, 186], [-430, 112], [-545, 112], [-500, 113]]) out.push([x, z, 1 + r() * 0.3])
  // 단지 안 동 사이 조경(분리수거장·놀이터 자리는 비움)
  const nearYard = (x: number, z: number) => [[-460, 116], [-512, 186], [-423, 186], [-470, 187]].some(([a, b]) => Math.abs(x - a) < 6 && Math.abs(z - b) < 5)
  for (let x = -550; x < -408; x += 8.5) {
    for (const z of [110, 121, 178, 194]) if (!nearYard(x, z)) out.push([x + ((x * 7) % 3) * 0.3, z + ((x * 3) % 2) * 0.8, 0.7 + ((x * 13) % 5) * 0.06])
  }
  // 항만 주변
  for (let z = 70; z < 296; z += 10) out.push([116 + j() * 0.5, z + j(), 0.9 + r() * 0.3])
  // 임의 분포
  for (let i = 0; i < 420; i++) {
    const x = -800 + r() * 1600
    const z = -380 + r() * 760
    if (!blocked(x, z)) out.push([x, z, 0.9 + r() * 0.6])
  }
  // 이면도로·간선 연결로 위에는 심지 않는다
  const roads = roadRects()
  return out.filter(([x, z]) => !roads.some(([x0, x1, z0, z1]) => x > x0 && x < x1 && z > z0 && z < z1))
}

/** 계절별 잎 색. 가로수(벚나무·은행나무)와 일반 나무를 나눈다 */
const PALETTE: Record<Season, { street: string[]; other: string[] }> = {
  spring: { street: ['#F6B9CC', '#F9CDDB', '#F3A9C0', '#FBE0E8'], other: ['#9AD98F', '#B4E39F', '#86CF86', '#F4C2D2'] },
  summer: { street: ['#4FAF6A', '#45A061', '#5BBB72'], other: ['#3E9A5A', '#4FAF6A', '#5DBE72', '#3A8E55'] },
  autumn: { street: ['#F2C14E', '#EBB43A', '#F5CD62'], other: ['#E0612F', '#C9472B', '#E88A3A', '#B9763E', '#D9A441', '#8DB86B'] },
  winter: { street: ['#3F7F5A'], other: ['#3F7F5A', '#4A8A63'] },
}

/** 잎 진 겨울나무의 가지(줄기 연장 + 가지 4개) */
function branchGeo() {
  const parts: THREE.BufferGeometry[] = []
  const trunk = new THREE.CylinderGeometry(0.08, 0.14, 2.2, 6)
  trunk.translate(0, 2.1, 0)
  parts.push(trunk)
  for (let i = 0; i < 5; i++) {
    const b = new THREE.CylinderGeometry(0.03, 0.07, 1.6, 5)
    b.translate(0, 0.8, 0)
    b.rotateZ(0.75 + (i % 2) * 0.25)
    b.rotateY((i / 5) * Math.PI * 2)
    b.translate(0, 1.5 + (i % 3) * 0.45, 0)
    parts.push(b)
  }
  const g = mergeGeometries(parts.map((p) => p.toNonIndexed()), false)!
  parts.forEach((p) => p.dispose())
  return g
}

/** 잎 덩어리: 면이 보이는 저폴리 덩이 3개(큰 것 + 옆 두 개). 법선을 면 단위로 다시 계산해 각진 그늘이 생긴다 */
function leafCluster(detail = 1) {
  const parts = [
    new THREE.IcosahedronGeometry(1, detail),
    new THREE.IcosahedronGeometry(0.72, detail).translate(0.6, -0.28, 0.18),
    new THREE.IcosahedronGeometry(0.66, detail).translate(-0.5, -0.32, -0.24),
  ].map((g) => (g.index ? g.toNonIndexed() : g))
  const g = mergeGeometries(parts, false)!
  parts.forEach((p) => p.dispose())
  g.deleteAttribute('normal')
  g.computeVertexNormals()
  return g
}

/** 둥근 저폴리 나무(인스턴스). 계절에 따라 잎 색과 겨울 가지가 바뀐다 */
export function Trees({ spots, shadows = true, seed = 7, lowPoly = false }: { spots: TreeSpec[]; shadows?: boolean; seed?: number; /** 먼 숲: 잎 덩이를 더 각지게(삼각형 1/4) */ lowPoly?: boolean }) {
  const season = useEnvView((s) => s.env.season)
  const { leaves, trunks, branches } = useMemo(() => {
    const leaf = new THREE.InstancedMesh(leafCluster(lowPoly ? 0 : 1), mat('#ffffff', { rough: 0.85 }), spots.length)
    const trunk = new THREE.InstancedMesh(cylGeo(0.16, 0.22, 1, 8), mat(COLORS.trunk), spots.length)
    const branch = new THREE.InstancedMesh(branchGeo(), mat('#8A6A52'), spots.length)
    const o = new THREE.Object3D()
    spots.forEach(([x, z, s], i) => {
      o.position.set(x, 1.0 * s, z)
      o.scale.set(s, 2.0 * s, s)
      o.rotation.set(0, 0, 0)
      o.updateMatrix()
      trunk.setMatrixAt(i, o.matrix)
    })
    // 먼 숲(군락)은 그림자를 그리지 않는다(그림자 패스 비용)
    leaf.castShadow = trunk.castShadow = branch.castShadow = shadows
    leaf.receiveShadow = true
    leaf.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    return { leaves: leaf, trunks: trunk, branches: branch }
  }, [spots, shadows, lowPoly])
  useEffect(() => {
    const o = new THREE.Object3D()
    const c = new THREE.Color()
    const r = mulberry32(seed)
    const pal = PALETTE[season]
    let bare = 0
    spots.forEach(([x, z, s, street], i) => {
      const pick = r()
      const list = street ? pal.street : pal.other
      // 겨울: 가로수와 일반 나무 대부분은 잎이 지고, 소나무 같은 상록수만 남는다
      const evergreen = season !== 'winter' || (!street && pick < 0.3)
      o.rotation.set(0, pick * 6.28, 0)
      if (evergreen) {
        o.position.set(x, 2.55 * s, z)
        o.scale.set(1.2 * s, 1.45 * s, 1.2 * s)
      } else {
        o.position.set(x, 2.55 * s, z)
        o.scale.setScalar(0.0001)
        const b = new THREE.Object3D()
        b.position.set(x, 0, z)
        b.rotation.set(0, pick * 6.28, 0)
        b.scale.setScalar(s)
        b.updateMatrix()
        branches.setMatrixAt(bare++, b.matrix)
      }
      o.updateMatrix()
      leaves.setMatrixAt(i, o.matrix)
      leaves.setColorAt(i, c.set(list[Math.floor(pick * list.length) % list.length]))
    })
    branches.count = bare
    branches.visible = bare > 0
    branches.instanceMatrix.needsUpdate = true
    leaves.instanceMatrix.needsUpdate = true
    if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true
  }, [season, spots, leaves, branches, seed])
  return (
    <group>
      <primitive object={leaves} />
      <primitive object={trunks} />
      <primitive object={branches} />
    </group>
  )
}

let fence: THREE.MeshStandardMaterial | null = null
/** 철망(모든 펜스 공유) */
function fenceMat() {
  fence ??= new THREE.MeshStandardMaterial({ map: repeatTex(meshTex('#A7B1C4', 12)), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.6 })
  return fence
}

/** 부지 외곽 펜스. gaps: 남(S)/북(N)쪽 변에서 비워 둘 x 구간 */
export function Fence({ x0, x1, z0, z1, gaps = [], open = [] }: {
  x0: number; x1: number; z0: number; z1: number
  gaps?: { side: 'N' | 'S'; from: number; to: number }[]
  open?: ('N' | 'S' | 'W' | 'E')[]
}) {
  const H = 1.9
  const segs = useMemo(() => {
    const out: { x0: number; z0: number; x1: number; z1: number }[] = []
    const horiz = (side: 'N' | 'S', z: number) => {
      if (open.includes(side)) return
      const g = gaps.filter((g) => g.side === side).sort((a, b) => a.from - b.from)
      let cur = x0
      for (const gp of g) {
        out.push({ x0: cur, z0: z, x1: gp.from, z1: z })
        cur = gp.to
      }
      out.push({ x0: cur, z0: z, x1, z1: z })
    }
    horiz('S', z1)
    horiz('N', z0)
    if (!open.includes('W')) out.push({ x0, z0, x1: x0, z1 })
    if (!open.includes('E')) out.push({ x0: x1, z0, x1, z1 })
    return out.filter((s) => Math.hypot(s.x1 - s.x0, s.z1 - s.z0) > 0.5)
  }, [x0, x1, z0, z1, gaps, open])
  const posts = useMemo(() => {
    const list: [number, number][] = []
    for (const s of segs) {
      const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0)
      const n = Math.max(1, Math.round(len / 3))
      for (let i = 0; i <= n; i++) list.push([s.x0 + ((s.x1 - s.x0) * i) / n, s.z0 + ((s.z1 - s.z0) * i) / n])
    }
    const m = new THREE.InstancedMesh(unitBox, mat('#9AA4B8'), list.length)
    const o = new THREE.Object3D()
    list.forEach(([x, z], i) => {
      o.position.set(x, H / 2, z)
      o.scale.set(0.09, H, 0.09)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    })
    m.castShadow = true
    return m
  }, [segs])
  // 철망 판은 펜스 하나당 지오메트리 하나로 합치고 텍스처는 모든 펜스가 같이 쓴다(반복 배율은 UV에 굽는다)
  const panelGeo = useMemo(() => {
    const parts = segs.map((s) => {
      const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0)
      const g = new THREE.PlaneGeometry(len, H)
      const uv = g.attributes.uv as THREE.BufferAttribute
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (len / 2.2))
      g.rotateY(s.z0 === s.z1 ? 0 : Math.PI / 2)
      g.translate((s.x0 + s.x1) / 2, H / 2, (s.z0 + s.z1) / 2)
      return g
    })
    const g = mergeGeometries(parts, false)!
    parts.forEach((p) => p.dispose())
    return g
  }, [segs])
  // 보안 카메라: 막힌 모서리 안쪽에서 부지 가운데를 본다(출입구는 게이트 OCR 카메라가 있다)
  const cams = useMemo(() => {
    const cx = (x0 + x1) / 2
    const cz = (z0 + z1) / 2
    const out: { x: number; z: number; yaw: number }[] = []
    const look = (x: number, z: number, tx: number, tz: number) => out.push({ x, z, yaw: Math.atan2(tx - x, tz - z) })
    const has = (s: 'N' | 'S' | 'W' | 'E') => !open.includes(s)
    for (const [x, z, a, b] of [[x0, z0, 'W', 'N'], [x1, z0, 'E', 'N'], [x0, z1, 'W', 'S'], [x1, z1, 'E', 'S']] as const) {
      if (!has(a) && !has(b)) continue
      const ix = x + Math.sign(cx - x) * 0.7
      const iz = z + Math.sign(cz - z) * 0.7
      look(ix, iz, cx, cz)
    }
    return out
  }, [x0, x1, z0, z1, open])
  return (
    <group>
      {cams.map((c, i) => (
        <group key={i} position={[c.x, 0, c.z]} rotation={[0, c.yaw, 0]}>
          <Prop id="security-camera" />
        </group>
      ))}
      <primitive object={posts} />
      <mesh geometry={panelGeo} material={fenceMat()} castShadow userData={{ noMerge: true }} />
      {segs.map((s, i) => (
        <mesh key={i} geometry={unitBox} position={[(s.x0 + s.x1) / 2, H, (s.z0 + s.z1) / 2]} rotation={[0, s.z0 === s.z1 ? 0 : Math.PI / 2, 0]} scale={[Math.hypot(s.x1 - s.x0, s.z1 - s.z0), 0.06, 0.06]} material={mat('#9AA4B8')} />
      ))}
    </group>
  )
}
