// 이천 FC 슬라이딩 슈 분류기와 롤러 슈트(정적 틀 + 움직이는 상자). 시뮬레이션은 sim/icsort.ts
import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { sim } from '../../sim/sim'
import { ICS } from '../../sim/icsort'
import { IC } from '../../sim/sites'
import { B, Cyl, mat, rboxGeo, unitBox, refreshBounds } from '../kit'
import { canvasTex } from '../textures'
import { Merge } from '../merge'
import { CaseSealer } from '../models/sites'

const TINTS = ['#D7A86E', '#C99A60', '#E2BC88', '#F1F3F8']
const MAX = 64

/** 슬랫 + 파란 슈가 박힌 분류기 상판 */
function shoeTex() {
  return canvasTex('shoe-sorter', 128, 32, (ctx, w, h) => {
    ctx.fillStyle = '#AEB6C6'
    ctx.fillRect(0, 0, w, h)
    for (let x = 0; x < w; x += 8) {
      ctx.fillStyle = '#C9D0DC'
      ctx.fillRect(x, 0, 6, h)
      ctx.fillStyle = '#2F55E6'
      ctx.fillRect(x + 1, h * 0.12, 4, 4)
    }
  }, { repeat: [(ICS.x1 - ICS.x0) / 4, 1] })
}

function rollerTopTex(n: number) {
  return canvasTex(`chute-rollers-${n}`, 32, 64, (ctx, w, h) => {
    ctx.fillStyle = '#7C8597'
    ctx.fillRect(0, 0, w, h)
    for (let y = 0; y < h; y += 8) {
      ctx.fillStyle = '#C3CAD7'
      ctx.fillRect(0, y, w, 5)
    }
  }, { repeat: [1, n] })
}

function SorterFrame() {
  const len = ICS.x1 - ICS.x0
  const cx = (ICS.x0 + ICS.x1) / 2
  const top = useMemo(() => {
    const t = new THREE.MeshStandardMaterial({ map: shoeTex(), roughness: 0.45, metalness: 0.25 })
    t.userData.noSnow = true
    const side = mat('#5F6B82')
    return [side, side, t, side, side, side] as THREE.Material[]
  }, [])
  const chuteLen = ICS.chuteZ1 - ICS.z + 0.3
  const chute = useMemo(() => {
    const t = new THREE.MeshStandardMaterial({ map: rollerTopTex(6), roughness: 0.4, metalness: 0.3 })
    const side = mat('#9AA4B8')
    return [side, side, t, side, side, side] as THREE.Material[]
  }, [])
  const inLen = ICS.z - ICS.inZ0 + 0.6
  const slope = Math.atan2(ICS.y - ICS.chuteY1, chuteLen)
  return (
    <Merge>
      {/* 분류기 본체 */}
      <mesh geometry={unitBox} position={[cx, ICS.y - 0.12, ICS.z]} scale={[len, 0.14, 0.95]} material={top} receiveShadow castShadow />
      {[-0.52, 0.52].map((dz) => <B key={dz} s={[len, 0.16, 0.06]} p={[cx, ICS.y - 0.02, ICS.z + dz]} c="#3B4252" />)}
      {Array.from({ length: Math.floor(len / 3) + 1 }, (_, i) => ICS.x0 + 0.3 + i * 3).map((x) => (
        <group key={x}>
          <B s={[0.08, ICS.y - 0.2, 0.08]} p={[x, (ICS.y - 0.2) / 2, ICS.z - 0.4]} c="#8A94A8" />
          <B s={[0.08, ICS.y - 0.2, 0.08]} p={[x, (ICS.y - 0.2) / 2, ICS.z + 0.4]} c="#8A94A8" />
        </group>
      ))}
      {/* 투입 벨트 + 봉함기 */}
      <mesh geometry={unitBox} position={[ICS.inX, ICS.y - 0.12, (ICS.inZ0 + ICS.z) / 2 - 0.3]} scale={[0.95, 0.14, inLen]} material={top} />
      {[-0.52, 0.52].map((dx) => <B key={dx} s={[0.06, 0.16, inLen]} p={[ICS.inX + dx, ICS.y - 0.02, (ICS.inZ0 + ICS.z) / 2 - 0.3]} c="#3B4252" />)}
      <group position={[ICS.inX, 0.15, -21.8]} rotation={[0, Math.PI / 2, 0]}>
        <CaseSealer />
      </group>
      {/* 스캐너 아치 */}
      <B s={[0.12, 1.3, 0.12]} p={[ICS.x0 + 4, ICS.y + 0.55, ICS.z - 0.62]} c="#3B4252" />
      <B s={[0.12, 1.3, 0.12]} p={[ICS.x0 + 4, ICS.y + 0.55, ICS.z + 0.62]} c="#3B4252" />
      <B s={[0.5, 0.22, 1.36]} p={[ICS.x0 + 4, ICS.y + 1.25, ICS.z]} c="#2F55E6" />
      {/* 롤러 슈트(라인마다) */}
      {IC.lines.map((x) => (
        <group key={x}>
          <mesh geometry={unitBox} position={[x, (ICS.y + ICS.chuteY1) / 2 - 0.12, (ICS.z + ICS.chuteZ1) / 2 + 0.15]} rotation={[-slope, 0, 0]} scale={[1.05, 0.1, chuteLen]} material={chute} castShadow receiveShadow />
          {[-0.56, 0.56].map((dx) => (
            <B key={dx} s={[0.05, 0.22, chuteLen]} p={[x + dx, (ICS.y + ICS.chuteY1) / 2 - 0.02, (ICS.z + ICS.chuteZ1) / 2 + 0.15]} r={[-slope, 0, 0]} c="#F2B92B" />
          ))}
          <Cyl rt={0.04} h={ICS.chuteY1} p={[x - 0.5, ICS.chuteY1 / 2, ICS.chuteZ1]} c="#8A94A8" />
          <Cyl rt={0.04} h={ICS.chuteY1} p={[x + 0.5, ICS.chuteY1 / 2, ICS.chuteZ1]} c="#8A94A8" />
          {/* 분기 표시등 */}
          <B s={[0.3, 0.3, 0.06]} p={[x, ICS.y + 0.55, ICS.z - 0.62]} c="#22B07D" />
          <Cyl rt={0.03} h={0.6} p={[x, ICS.y + 0.25, ICS.z - 0.62]} c="#3B4252" />
        </group>
      ))}
    </Merge>
  )
}

function SortBoxes() {
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(rboxGeo(0.5, 0.34, 0.42, 0.04, 1), mat('#ffffff', { rough: 0.8 }), MAX)
    m.castShadow = true
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    const c = new THREE.Color()
    for (let i = 0; i < MAX; i++) m.setColorAt(i, c.set(TINTS[0]))
    return m
  }, [])
  const o = useMemo(() => new THREE.Object3D(), [])
  const c = useMemo(() => new THREE.Color(), [])
  useFrame(() => {
    const list = sim.icSort.boxes
    const n = Math.min(MAX, list.length)
    for (let i = 0; i < n; i++) {
      const b = list[i]
      o.position.set(b.x, b.y + 0.17, b.z)
      o.rotation.set(0, b.stage === 0 ? Math.PI / 2 : b.push * 0.5, 0)
      o.updateMatrix()
      mesh.setMatrixAt(i, o.matrix)
      mesh.setColorAt(i, c.set(TINTS[b.tint]))
    }
    mesh.count = n
    mesh.instanceMatrix.needsUpdate = true
    refreshBounds(mesh)
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })
  return <primitive object={mesh} />
}

/** 슈트 끝 적재 자리: 빈 파렛트 위에 상자가 2×2 두 단으로 쌓이고(8개 = 파렛트 1개), 넘치는 상자는 슈트 끝에 줄 선다 */
function BuildStacks() {
  const n = IC.lines.length
  const { cartons, queue, bases } = useMemo(() => {
    const cartons = new THREE.InstancedMesh(rboxGeo(0.5, 0.54, 0.5, 0.03, 1), mat('#D7A86E', { rough: 0.8 }), n * ICS.PER)
    const queue = new THREE.InstancedMesh(rboxGeo(0.5, 0.34, 0.42, 0.04, 1), mat('#ffffff', { rough: 0.8 }), n * ICS.QMAX)
    const bases = new THREE.InstancedMesh(unitBox, mat('#B98A55', { rough: 0.85 }), n)
    cartons.castShadow = queue.castShadow = true
    bases.receiveShadow = true
    const c = new THREE.Color()
    for (let i = 0; i < n * ICS.PER; i++) cartons.setColorAt(i, c.set(TINTS[(i * 7) % 3]))
    for (let i = 0; i < n * ICS.QMAX; i++) queue.setColorAt(i, c.set(TINTS[(i * 5) % 4]))
    for (const m of [cartons, queue, bases]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      m.frustumCulled = false
    }
    return { cartons, queue, bases }
  }, [n])
  const o = useMemo(() => new THREE.Object3D(), [])
  const slope = Math.atan2(ICS.y - ICS.chuteY1, ICS.chuteZ1 - ICS.z + 0.3)
  useFrame(() => {
    const S = sim.icSort
    let kc = 0
    let kq = 0
    let kb = 0
    const y0 = IC.rollerY + 0.02
    IC.lines.forEach((x, k) => {
      if (S.headClear[k]) {
        o.position.set(x, y0 + 0.07, ICS.headZ)
        o.rotation.set(0, 0, 0)
        o.scale.set(1.1, 0.14, 1.1)
        o.updateMatrix()
        bases.setMatrixAt(kb++, o.matrix)
        const st = S.stackOf(k)
        o.scale.set(1, 1, 1)
        for (let j = 0; j < st; j++) {
          const layer = Math.floor(j / 4)
          const q = j % 4
          o.position.set(x + (q % 2 ? 0.26 : -0.26), y0 + 0.14 + 0.27 + layer * 0.54, ICS.headZ + (q < 2 ? -0.26 : 0.26))
          o.updateMatrix()
          cartons.setMatrixAt(kc++, o.matrix)
        }
      }
      const qn = S.queueOf(k)
      for (let j = 0; j < qn; j++) {
        const z = ICS.chuteZ1 - 0.25 - j * ICS.QSTEP
        const t = Math.min(1, (z - ICS.z) / (ICS.chuteZ1 - ICS.z))
        o.position.set(x, ICS.y + (ICS.chuteY1 - ICS.y) * t + 0.17, z)
        o.rotation.set(-slope, 0, 0)
        o.scale.set(1, 1, 1)
        o.updateMatrix()
        queue.setMatrixAt(kq++, o.matrix)
      }
    })
    cartons.count = kc
    queue.count = kq
    bases.count = kb
    for (const m of [cartons, queue, bases]) m.instanceMatrix.needsUpdate = true
  })
  return (
    <group>
      <primitive object={bases} />
      <primitive object={cartons} />
      <primitive object={queue} />
    </group>
  )
}

export function IcSorterView() {
  return (
    <group>
      <SorterFrame />
      <SortBoxes />
      <BuildStacks />
    </group>
  )
}
