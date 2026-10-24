// 다온마을 생활 물류 흔적(시뮬레이션 상태를 따라 바뀜): 문 앞·경비실 택배 더미, 무인택배함 칸 표시등,
// 편의점 접수 상자, 분리수거장 골판지 더미. 상태는 src/sim/town.ts.
import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { sim } from '../../sim/sim'
import { LOCKER_CELLS, LOCKER_IDS, RECYCLE_IDS, RECYCLE_SPOTS } from '../../sim/town'
import { STOPS, TW } from '../../sim/sites'
import { mat, rboxGeo, unitBox } from '../kit'
import { useStore } from '../../store'


const TINTS = ['#D7A86E', '#C99A60', '#F1F3F8', '#E2BC88', '#B9C7DC']
const MAX_BOX = 220

/** 더미 자리: [x, 바닥 높이, z] */
function pileAnchor(id: string, kind: 'door' | 'guard'): [number, number, number] | null {
  const s = STOPS[id]
  if (!s) return null
  if (id.startsWith('A')) {
    const north = s.door.z < TW.apt.roadZ
    const x = s.door.x
    if (kind === 'door') return north ? [x - 1.3, 0.16, TW.northZ + 7.75] : [x + 1.3, 0.16, TW.southZ - 7.75]
    return north ? [x + 8.9, 0, TW.northZ + 9.2] : [x + 8.9, 0, TW.southZ - 9.2]
  }
  if (id.startsWith('V')) return kind === 'door' ? [TW.villaX - 5.0, 0, s.door.z + 2.2] : null
  if (id === 'STORE') return kind === 'door' ? [-378.3, 0, TW.store.z + 3.2] : null
  return null
}

/** 무인택배함 배치(정적 장면과 같은 값): 위치 · 회전 · 크기 */
function lockerXf(id: string): { x: number; z: number; rot: number; s: number } {
  if (id === 'LOCK') return { x: TW.locker.x, z: TW.locker.z, rot: 0, s: 1 }
  const north = ['A101', 'A102', 'A103'].includes(id)
  const x = STOPS[id].door.x - 7
  return north ? { x, z: TW.northZ + 6.2, rot: Math.PI, s: 0.7 } : { x, z: TW.southZ - 6.2, rot: 0, s: 0.7 }
}

/** 택배함 칸 표시등 자리(텍스처 칸의 손잡이 위치, 함 기준 좌표) */
const CELLS: [number, number][] = []
for (let c = 0; c < 6; c++) {
  for (let r = 0; r < 5; r++) {
    if (c === 2 && r < 3) continue
    CELLS.push([1.6 - ((14 + c * 82 + 65) / 512) * 3.2, 2.2 - ((54 + r * 56 + 26) / 340) * 2.2])
  }
}
/** 칸이 차는 순서(흩어져 보이게 고정된 뒤섞기) */
const ORDER = CELLS.map((_, i) => i).sort((a, b) => ((a * 37) % 29) - ((b * 37) % 29))

function ParcelPiles() {
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(rboxGeo(0.5, 0.36, 0.42, 0.04, 1), mat('#ffffff', { rough: 0.8 }), MAX_BOX)
    m.castShadow = true
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    const c = new THREE.Color()
    for (let i = 0; i < MAX_BOX; i++) m.setColorAt(i, c.set(TINTS[(i * 7) % TINTS.length]))
    m.count = 0
    return m
  }, [])
  const o = useMemo(() => new THREE.Object3D(), [])
  useFrame(() => {
    const T = sim.town
    let k = 0
    const put = (a: [number, number, number], n: number, rot: number) => {
      for (let i = 0; i < n && k < MAX_BOX; i++) {
        const col = i % 2
        const row = Math.floor(i / 2) % 2
        const layer = Math.floor(i / 4)
        o.position.set(a[0] + (col - 0.5) * 0.54, a[1] + 0.18 + layer * 0.37, a[2] + (row - 0.5) * 0.46)
        o.rotation.set(0, rot + ((i * 13) % 7) * 0.04, 0)
        o.updateMatrix()
        mesh.setMatrixAt(k++, o.matrix)
      }
    }
    for (const id of Object.keys(T.piles)) {
      const p = T.piles[id]
      const d = pileAnchor(id, 'door')
      if (d && p.door) put(d, p.door, 0)
      const g = pileAnchor(id, 'guard')
      if (g && p.guard) put(g, p.guard, Math.PI / 2)
    }
    const st = pileAnchor('STORE', 'door')
    if (st) put(st, T.storeDrop, 0)
    if (k !== mesh.count) mesh.count = k
    mesh.instanceMatrix.needsUpdate = true
  })
  return <primitive object={mesh} />
}

function LockerLeds() {
  const n = LOCKER_IDS.length * LOCKER_CELLS
  const { mesh, last } = useMemo(() => {
    const m = new THREE.InstancedMesh(unitBox, new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), n)
    const o = new THREE.Object3D()
    const green = new THREE.Color('#35D07F')
    LOCKER_IDS.forEach((id, li) => {
      const t = lockerXf(id)
      const cos = Math.cos(t.rot)
      CELLS.forEach(([lx, ly], ci) => {
        // 함 앞면(−z, 회전하면 +z) 바로 앞
        const ax = lx * t.s
        const az = -0.37 * t.s
        o.position.set(t.x + ax * cos + az * Math.sin(t.rot), ly * t.s, t.z - ax * Math.sin(t.rot) + az * cos)
        o.rotation.set(0, t.rot, 0)
        o.scale.set(0.09 * t.s, 0.11 * t.s, 0.02)
        o.updateMatrix()
        m.setMatrixAt(li * LOCKER_CELLS + ci, o.matrix)
        m.setColorAt(li * LOCKER_CELLS + ci, green)
      })
    })
    return { mesh: m, last: LOCKER_IDS.map(() => -1) }
  }, [n])
  const red = useMemo(() => new THREE.Color('#E8453C'), [])
  const green = useMemo(() => new THREE.Color('#35D07F'), [])
  useFrame(() => {
    let dirty = false
    LOCKER_IDS.forEach((id, li) => {
      const filled = sim.town.lockers[id] ?? 0
      if (filled === last[li]) return
      last[li] = filled
      dirty = true
      ORDER.forEach((ci, rank) => mesh.setColorAt(li * LOCKER_CELLS + ci, rank < filled ? red : green))
    })
    if (dirty && mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })
  return <primitive object={mesh} />
}

/** 분리수거장 골판지 더미(높이가 시뮬레이션 값을 따름) */
function CardboardHeaps() {
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(rboxGeo(1, 1, 1, 0.08, 1), mat('#C99A60', { rough: 0.95 }), RECYCLE_IDS.length)
    m.castShadow = true
    return m
  }, [])
  const o = useMemo(() => new THREE.Object3D(), [])
  useFrame(() => {
    RECYCLE_IDS.forEach((id, i) => {
      const [x, z] = RECYCLE_SPOTS[id]
      const h = 0.15 + sim.town.recycle[id] * 1.5
      o.position.set(x - 1.6, h / 2, z)
      o.rotation.set(0, 0.08 * i, 0)
      o.scale.set(1.5, h, 1.6)
      o.updateMatrix()
      mesh.setMatrixAt(i, o.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  })
  return <primitive object={mesh} />
}

/** 거점 보기에서 다온마을 근처일 때만 그린다(전국 보기에서는 안 보일 만큼 작다) */
export function TownLife() {
  const view = useStore((s) => s.view)
  if (view === 'network') return null
  return (
    <group>
      <ParcelPiles />
      <LockerLeds />
      <CardboardHeaps />
    </group>
  )
}
