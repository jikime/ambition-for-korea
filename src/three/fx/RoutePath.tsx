import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { sim } from '../../sim/sim'
import { useStore } from '../../store'
import { basic, torusGeo, refreshBounds } from '../kit'
import type { V2 } from '../../sim/path'

/** 점 목록을 지면 위 띠 모양으로 */
function writeRibbon(geo: THREE.BufferGeometry, pts: V2[], width: number) {
  const n = pts.length
  const pos = new Float32Array(Math.max(n, 2) * 2 * 3)
  const idx: number[] = []
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)]
    const b = pts[Math.min(n - 1, i + 1)]
    let dx = b.x - a.x
    let dz = b.z - a.z
    const l = Math.hypot(dx, dz) || 1
    dx /= l
    dz /= l
    const nx = -dz * width * 0.5
    const nz = dx * width * 0.5
    pos.set([pts[i].x + nx, 0.07, pts[i].z + nz, pts[i].x - nx, 0.07, pts[i].z - nz], i * 6)
    if (i < n - 1) {
      const k = i * 2
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeBoundingSphere()
}

/** 선택한 차량의 남은 경로와 도착 지점 */
export function RoutePath() {
  const selected = useStore((s) => s.selected)
  const controls = useThree((s) => s.controls) as unknown as { distance?: number } | null
  const geo = useMemo(() => new THREE.BufferGeometry(), [])
  const mesh = useRef<THREE.Mesh>(null)
  const ring = useRef<THREE.Mesh>(null)
  const dots = useRef<THREE.InstancedMesh>(null)
  const acc = useRef(0)
  const dotGeo = useMemo(() => new THREE.CircleGeometry(0.32, 16).rotateX(-Math.PI / 2), [])
  const ribbonMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#3D63FF', transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }), [])

  useFrame(({ clock }, dt) => {
    const v = selected?.kind === 'vehicle' ? sim.vehicle(selected.id) : null
    const route = v?.visible && v.route && !v.route.done ? v.route : null
    // 멀리서 볼 때(전국 보기 거리)는 간선(highway) 구간까지 경로 전체를 굵게 그린다
    const network = useStore.getState().view === 'network' || (controls?.distance ?? 0) > 330
    const show = !!route && (v!.phase === 'enroute' || v!.phase === 'inbound' || v!.phase === 'docking' || v!.phase === 'departing' || (network && v!.phase === 'highway'))
    if (mesh.current) mesh.current.visible = show
    if (ring.current) ring.current.visible = show
    if (dots.current) dots.current.visible = show
    if (!show || !route) return
    acc.current += dt
    if (acc.current > 0.2) {
      acc.current = 0
      // 차 가까이(화면에 보이는 범위)의 경로만: 간선도로까지 그리면 너무 길다
      const all = route.remainingPoints()
      const pts: V2[] = []
      for (const p of all) {
        if (!network && Math.hypot(p.x - v!.x, p.z - v!.z) > 320) break
        pts.push(p)
      }
      // 남은 경로가 돌발 구간을 지나면 띠를 빨갛게
      const slow = route.legs.slice(route.i).some((l) => sim.legFactor(v!, l) < 0.999)
      ribbonMat.color.set(slow ? '#E8453C' : '#3D63FF')
      if (pts.length >= 2) {
        writeRibbon(geo, pts, network ? 6 : 0.85)
        const end = pts[pts.length - 1]
        ring.current?.position.set(end.x, 0.09, end.z)
        const dm = dots.current
        if (dm) {
          const o = new THREE.Object3D()
          let k = 0
          let carry = 0
          for (let i = 1; i < pts.length && k < dm.instanceMatrix.count; i++) {
            const a = pts[i - 1]
            const b = pts[i]
            const seg = Math.hypot(b.x - a.x, b.z - a.z)
            let t = carry
            while (t < seg && k < dm.instanceMatrix.count) {
              o.position.set(a.x + ((b.x - a.x) * t) / seg, 0.1, a.z + ((b.z - a.z) * t) / seg)
              o.updateMatrix()
              dm.setMatrixAt(k++, o.matrix)
              t += 2.6
            }
            carry = t - seg
          }
          dm.count = k
          dm.instanceMatrix.needsUpdate = true
          refreshBounds(dm)
        }
      }
    }
    if (ring.current) {
      const s = 1 + ((clock.elapsedTime * 0.8) % 1) * 0.6
      ring.current.scale.set(s, s, s)
    }
  })

  return (
    <group>
      <mesh ref={mesh} geometry={geo} material={ribbonMat} renderOrder={3} visible={false} />
      <instancedMesh ref={dots} args={[dotGeo, basic('#FFFFFF', 0.95), 220]} renderOrder={4} visible={false} />
      <mesh ref={ring} geometry={torusGeo(1.4, 0.12)} rotation={[-Math.PI / 2, 0, 0]} material={basic('#3D63FF', 0.9)} visible={false} />
    </group>
  )
}

/** 후진 중인 트럭 뒤 바닥에 주황 꺾쇠(›)를 흘려 보낸다: 도크 접안·출차 후진 */
export function ReverseCues() {
  const view = useStore((s) => s.view)
  const geo = useMemo(() => {
    const sh = new THREE.Shape()
    sh.moveTo(-0.6, -0.25)
    sh.lineTo(0, 0.35)
    sh.lineTo(0.6, -0.25)
    sh.lineTo(0.6, 0.08)
    sh.lineTo(0, 0.68)
    sh.lineTo(-0.6, 0.08)
    sh.closePath()
    return new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2)
  }, [])
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: '#FF8A1F', transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }), 240)
    m.renderOrder = 4
    m.frustumCulled = false
    m.count = 0
    return m
  }, [geo])
  const o = useMemo(() => new THREE.Object3D(), [])
  useFrame(({ clock }) => {
    if (view !== 'site') {
      mesh.count = 0
      return
    }
    const STEP = 1.7
    const phase = (clock.elapsedTime * 2.2) % STEP
    let k = 0
    for (const v of sim.vehicles) {
      const r = v.route
      if (!v.visible || !r || r.done || !r.leg.reverse) continue
      const pts = r.runPoints()
      // 차 몸통 뒤쪽부터(차 길이의 절반쯤 비운다)
      let skip = v.kind === 'van' ? 2.4 : v.kind === 'trailer' ? 8.5 : 5.2
      let t = phase
      for (let i = 1; i < pts.length && k < 240; i++) {
        const a = pts[i - 1]
        const b = pts[i]
        const seg = Math.hypot(b.x - a.x, b.z - a.z)
        if (seg < 1e-4) continue
        const h = Math.atan2(b.x - a.x, b.z - a.z)
        while (t < seg && k < 240) {
          if (skip <= 0) {
            o.position.set(a.x + ((b.x - a.x) * t) / seg, 0.09, a.z + ((b.z - a.z) * t) / seg)
            o.rotation.set(0, h + Math.PI, 0)
            o.updateMatrix()
            mesh.setMatrixAt(k++, o.matrix)
          }
          t += STEP
          skip -= STEP
        }
        t -= seg
      }
    }
    mesh.count = k
    mesh.instanceMatrix.needsUpdate = true
  })
  return <primitive object={mesh} />
}
