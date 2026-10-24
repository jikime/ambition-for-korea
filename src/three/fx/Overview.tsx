import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import type { CameraControlsImpl } from '@react-three/drei'
import * as THREE from 'three'
import { sim } from '../../sim/sim'
import { RETURN_STEPS } from '../../sim/cs'
import { FLOWS, SITE_META, SITE_ORDER, type SiteId } from '../../sim/world'
import { useStore } from '../../store'
import { PinModel } from '../models/equipment'
import type { LinkId } from '../../sim/incidents'
import { siteSummary, storyStageLabel } from '../../ui/format'
import { L } from '../../i18n'

/** 멀리서 볼 때 거점 이름표(클릭하면 그 거점으로 이동) */
export function OverviewLabels() {
  const controls = useThree((s) => s.controls) as unknown as CameraControlsImpl | null
  const [show, setShow] = useState(false)
  useStore((s) => s.tick)
  useFrame(() => {
    const far = (controls?.distance ?? 0) > 330
    if (far !== show) setShow(far)
  })
  if (!show) return null
  return (
    <group>
      {SITE_ORDER.map((id) => {
        const m = SITE_META[id]
        return (
          <group key={id} position={[m.center[0], 18, m.center[1]]}>
            <Html center zIndexRange={[15, 0]}>
              <button type="button" className="site-chip" onClick={() => useStore.getState().setSite(id as SiteId)}>
                <span className="site-chip-code">{m.code}</span>
                <span className="site-chip-name">{m.name}</span>
                <span className="site-chip-sub">{siteSummary(id as SiteId)}</span>
              </button>
            </Html>
          </group>
        )
      })}
    </group>
  )
}

/** 여정 위치 표시(멀리서도 보이게 크기 보정). 육로 택배는 늘 보이고, 배·비행기 여정은 그 탭을 열었거나 따라갈 때 보인다 */
function JourneyMarker({ id, color }: { id: 'story' | 'sea' | 'air' | 'ret'; color: string }) {
  const group = useRef<THREE.Group>(null)
  const pin = useRef<THREE.Group>(null)
  const controls = useThree((s) => s.controls) as unknown as CameraControlsImpl | null
  const tick = useStore((s) => s.tick)
  const selected = useStore((s) => s.selected)
  const mode = useStore((s) => s.trackMode)
  // 첫 마운트 직후에는 drei Html 내용이 비는 경우가 있어 한 박자 늦게 붙인다
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setReady(true), 400)
    return () => clearTimeout(id)
  }, [])
  useFrame(({ clock }) => {
    const p = sim.journeyPos(id)
    const g = group.current
    if (!g) return
    const d = controls?.distance ?? 150
    const k = Math.max(1, d / 90)
    g.position.set(p.x, p.y + 1.2 * k + Math.sin(clock.elapsedTime * 3) * 0.2 * k, p.z)
    if (pin.current) pin.current.scale.setScalar(0.7 * k)
  })
  void tick
  const active = selected?.kind === 'story' && selected.id === id
  if (id !== 'story' && !active && mode !== id) return null
  let text: string
  if (id === 'story') text = L(`택배 ${sim.story.no.slice(-4)} · ${storyStageLabel(sim.story.stage)}`, `Parcel ${sim.story.no.slice(-4)} · ${storyStageLabel(sim.story.stage)}`)
  else if (id === 'ret') {
    const r = sim.cs.focus
    if (!r) return null
    text = L(`반품 ${r.no} · ${RETURN_STEPS[r.stage].label}`, `Return ${r.no} · ${RETURN_STEPS[r.stage].label}`)
  } else {
    const j = id === 'sea' ? sim.sea : sim.air
    const label = j.status === 'held' ? L('탑재 보류', 'Loading held') : j.steps[Math.max(0, j.stage)].label
    text = `${id === 'sea' ? L('컨테이너', 'Container') : L('항공', 'Air')} ${j.no ? j.no.slice(-4) : `#${j.n}`} · ${label}`
  }
  return (
    <group ref={group}>
      <group ref={pin}>
        <PinModel color={color} />
      </group>
      {ready && (
        <Html center zIndexRange={[18, 0]} style={{ pointerEvents: 'none' }}>
          <div className={`story-tag ${active ? 'is-active' : ''}`} style={{ transform: 'translateY(-40px)' }}>
            <span className="story-dot" style={{ background: color }} />
            {text}
          </div>
        </Html>
      )}
    </group>
  )
}

/** 육로 택배·해상·항공 여정 표시 */
export function StoryMarker() {
  return (
    <>
      <JourneyMarker id="story" color="#FF6B3D" />
      <JourneyMarker id="sea" color="#2563EB" />
      <JourneyMarker id="air" color="#5B5BD6" />
      <JourneyMarker id="ret" color="#D97706" />
    </>
  )
}

const BEACON: Record<string, string> = { wing: '#3D63FF', box: '#7A5CFF', van: '#16B3A8', reefer: '#2EC4E8', trailer: '#FF8A3D' }

/** 멀리서 차량 위치를 점으로 보여 준다 */
export function VehicleBeacons() {
  const controls = useThree((s) => s.controls) as unknown as CameraControlsImpl | null
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), sim.vehicles.length)
    const c = new THREE.Color()
    sim.vehicles.forEach((v, i) => m.setColorAt(i, c.set(BEACON[v.kind])))
    m.frustumCulled = false
    return m
  }, [])
  const o = useMemo(() => new THREE.Object3D(), [])
  const acc = useRef(0)
  const c = useMemo(() => new THREE.Color(), [])
  useFrame((_, dt) => {
    const d = controls?.distance ?? 0
    const show = d > 330
    mesh.visible = show
    if (!show) return
    // 색: 차종 또는 도착 약속 상태(0.5초마다)
    acc.current += dt
    if (acc.current > 0.5) {
      acc.current = 0
      const mode = useStore.getState().beaconMode
      sim.vehicles.forEach((v, i) => {
        if (mode === 'kind') mesh.setColorAt(i, c.set(BEACON[v.kind]))
        else {
          const st = sim.promises.status(v)
          mesh.setColorAt(i, c.set(!st || st.state.startsWith('done') ? '#A3ABBF' : st.state === 'late' ? '#E8453C' : st.state === 'risk' ? '#F2A33A' : '#22B07D'))
        }
      })
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
    const k = d / 190
    sim.vehicles.forEach((v, i) => {
      o.position.set(v.kind === 'trailer' ? (v.x + v.trailer.x) / 2 : v.x, 4 + k * 1.2, v.kind === 'trailer' ? (v.z + v.trailer.z) / 2 : v.z)
      o.scale.setScalar(v.visible ? k * 0.55 : 0.0001)
      o.updateMatrix()
      mesh.setMatrixAt(i, o.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  })
  return <primitive object={mesh} />
}


function flowTex() {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 16
  const ctx = c.getContext('2d')!
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.fillRect(0, 0, 64, 16)
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.moveTo(18, 2)
  ctx.lineTo(40, 8)
  ctx.lineTo(18, 14)
  ctx.closePath()
  ctx.fill()
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

/** 네트워크 보기: 간선 흐름 띠(화살표가 흐른다) */
const FLOW_LINK: Record<string, LinkId> = { icgj: 'hw_ic_gj', gjin: 'hw_gj_in', bsgj: 'hw_gj_bs', intw: 'town_gate', gjap: 'hw_gj_ap', gjdj: 'hw_gj_dj' }
const ALERT = new THREE.Color('#E8453C')

export function FlowLines() {
  const controls = useThree((s) => s.controls) as unknown as CameraControlsImpl | null
  const group = useRef<THREE.Group>(null)
  const items = useMemo(() => FLOWS.map((f) => {
    const segs = f.pts.slice(0, -1).map((p, i) => {
      const q = f.pts[i + 1]
      const len = Math.hypot(q[0] - p[0], q[1] - p[1])
      const tex = flowTex()
      tex.repeat.set(len / 14, 1)
      const m = new THREE.MeshBasicMaterial({ map: tex, color: f.color, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false })
      return { p, q, len, m, rot: Math.atan2(q[0] - p[0], q[1] - p[1]) }
    })
    return { f, segs, base: new THREE.Color(f.color), link: FLOW_LINK[f.key] }
  }), [])
  useFrame((_, dt) => {
    const d = controls?.distance ?? 0
    if (group.current) group.current.visible = d > 480
    for (const it of items) {
      // 돌발 상황으로 느려진 구간은 빨갛게, 흐름도 느리게
      const k = it.link ? sim.linkFactor[it.link] : 1
      for (const s of it.segs) {
        s.m.color.copy(it.base).lerp(ALERT, k < 0.99 ? 0.85 : 0)
        if (s.m.map) s.m.map.offset.x -= dt * 0.8 * k
      }
    }
  })
  return (
    <group ref={group} visible={false}>
      {items.map(({ f, segs }) => segs.map((s, i) => (
        <mesh key={`${f.key}${i}`} position={[(s.p[0] + s.q[0]) / 2, 0.6, (s.p[1] + s.q[1]) / 2]} rotation={[-Math.PI / 2, 0, s.rot - Math.PI / 2]} material={s.m} renderOrder={6}>
          <planeGeometry args={[s.len + 3, 5]} />
        </mesh>
      )))}
    </group>
  )
}
