import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { CameraControls, CameraControlsImpl, PerformanceMonitor } from '@react-three/drei'
import * as THREE from 'three'
import { sim } from '../sim/sim'
import { advanceReplay } from '../ui/replay'
import { useStore, type SelKind } from '../store'
import { NETWORK_VIEW, SITE_META, type SiteId } from '../sim/world'
import { Ground } from './world/Ground'
import { Fence, Trees, treeSpots } from './world/Vegetation'
import { Backdrop, Traffic, YardProps } from './world/Backdrop'
import { Office, SortingCanopy } from './models/structures'
import { Vehicles } from './entities/Vehicles'
import { Chargers, Forklifts, Parcels, SiteDynamics, StagedPallets, Workers } from './entities/Equipment'
import { FloatingLabel, SelectionFx, basePos } from './fx/Selection'
import { ReverseCues, RoutePath } from './fx/RoutePath'
import { StatusChips } from './fx/StatusChips'
import { YardLabels } from './fx/YardLabels'
import { FlowLines, OverviewLabels, StoryMarker, VehicleBeacons } from './fx/Overview'
import { SoundBridge } from '../audio/SoundBridge'
import { DetailDirector, useDetail } from './detail'
import { sound } from '../audio/sound'
import { Merge } from './merge'
import * as L from '../sim/layout'
import { L as tr } from '../i18n'
import { GonjiamExtras, HighwayProps, IncheonStatic, PortStatic, RailYardStatic, TownStatic } from './world/Network'
import { RailYard } from './entities/Rail'
import { FacilityLabels } from './fx/FacilityLabels'
import { TankFarm, TollPlazas } from './world/Outskirts'
import { GonjiamRailStatic, RailLineStatic } from './world/RailLine'
import { Terrain } from './world/Terrain'
import { Gates, GonjiamCY, Icheon, Incheon, Port, TownSignals } from './entities/Network'
import { HubHall } from './entities/Hub'
import { IncidentMarkers } from './fx/Incidents'
import { AirportStatic } from './world/Airport'
import { Airport } from './entities/Airport'
import { Life } from './entities/Life'
import { TownLife } from './entities/TownLife'
import { TownDetail } from './world/Town'
import { Infill } from './world/Infill'
import { LocalRoads, LocalTraffic } from './world/Roads'
import { Environment } from './env/Environment'
import { Billboards, GasStation, GateSignals, RoadFurniture, StreetLamps, LAMP_SPOTS } from './world/Roadside'
import { RestAreas } from './world/RestArea'
import { DaejeonLive, DaejeonStatic } from './world/Daejeon'
import { look } from './env/state'

const AZ = 0.62
const POL = 0.9
const FOCUS_DIST: Record<SelKind, number> = { site: 170, vehicle: 62, forklift: 44, pallet: 38, charger: 36, dock: 56, sorter: 78, crane: 120, story: 58, aircraft: 150, mover: 34, robot: 30, equip: 40 }

function siteView(id: SiteId) {
  const m = SITE_META[id] ?? SITE_META.GJ
  return { t: new THREE.Vector3(m.center[0], 0, m.center[1]), d: m.dist, az: m.azimuth ?? AZ }
}

function spherical(t: THREE.Vector3, d: number, az: number, pol: number) {
  return new THREE.Vector3(t.x + d * Math.sin(pol) * Math.sin(az), t.y + d * Math.cos(pol), t.z + d * Math.sin(pol) * Math.cos(az))
}

/** 개발용: 콘솔에서 렌더 통계를 볼 수 있게 노출 */
function DevHandle() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const controls = useThree((s) => s.controls)
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { __gl: gl, __scene: scene, __store: useStore, __sim: sim, __controls: controls, __sound: sound, __detail: useDetail })
  }, [gl, scene, controls])
  return null
}

function SimDriver() {
  useFrame((_, dt) => {
    // 재생 막대로 되감는 중이면 시뮬레이션을 멈추고 기록을 보여 준다
    if (useStore.getState().replay.on) {
      advanceReplay(dt)
      return
    }
    const speed = useStore.getState().speed
    const n = Math.max(1, Math.ceil(speed))
    const d = (Math.min(dt, 0.05) * speed) / n
    for (let i = 0; i < n; i++) sim.step(d)
  }, -1)
  useEffect(() => {
    let lastStage = sim.story.stage
    let lastN = sim.story.n
    const lastJ = { sea: `${sim.sea.n}:${sim.sea.status}`, air: `${sim.air.n}:${sim.air.status}` }
    const id = setInterval(() => {
      const st = useStore.getState()
      st.bump()
      const s = sim.story
      const sel = st.selected
      // 따라가는 여정(육로·해상·항공)이 다른 거점으로 넘어가면 화면 거점도 바꾼다
      const followId = sel?.kind === 'story' ? sel.id : null
      if (followId) {
        const site = sim.journeyPos(followId).site
        if (site !== st.site) useStore.setState({ site })
      }
      if (s.n === lastN && s.stage !== lastStage && s.stage === 7) {
        st.notify(tr(`택배 #${s.no} 배송 완료 · ${s.customer} 고객 문 앞에 도착했습니다`, `Parcel #${s.no} delivered · Arrived at ${s.customer}'s door`))
        if (followId === 'story') st.setSpeed(1)
      }
      // 배·비행기 여정이 끝나면 알리고, 따라가던 중이면 속도를 되돌린다
      for (const k of ['sea', 'air'] as const) {
        const j = sim[k]
        const key = `${j.n}:${j.status}`
        if (key !== lastJ[k] && j.status !== 'running') {
          if (k === 'sea') st.notify(tr(`해상 여정 #${j.n} · 컨테이너 ${j.no}가 곤지암 CY에 도착해 적출을 마쳤습니다`, `Sea journey #${j.n} · Container ${j.no} reached Gonjiam CY and was devanned`))
          else st.notify(j.status === 'held'
            ? tr(`항공 여정 #${j.n} · ${j.no} 위험물 의심으로 탑재 보류 · 해상 운송 전환`, `Air journey #${j.n} · ${j.no} held from loading (suspected dangerous goods) · Switched to sea freight`)
            : tr(`항공 여정 #${j.n} · ${j.no} 화물기가 ${sim.air.dest}(으)로 이륙했습니다`, `Air journey #${j.n} · ${j.no} freighter took off for ${sim.air.dest}`))
          if (followId === k) st.setSpeed(1)
        }
        lastJ[k] = key
      }
      lastStage = s.stage
      lastN = s.n
    }, 250)
    return () => clearInterval(id)
  }, [])
  return null
}

function CameraRig() {
  const ref = useRef<CameraControlsImpl>(null)
  const cam = useStore((s) => s.cam)
  const started = useRef(false)

  useEffect(() => {
    const c = ref.current
    if (!c || started.current) return
    started.current = true
    const home = siteView('GJ')
    const p = spherical(home.t, home.d + 80, AZ - 0.25, POL - 0.1)
    c.setLookAt(p.x, p.y, p.z, home.t.x, home.t.y, home.t.z, false)
    const h = spherical(home.t, home.d, AZ, POL)
    requestAnimationFrame(() => c.setLookAt(h.x, h.y, h.z, home.t.x, home.t.y, home.t.z, true))
    // 사용자가 직접 카메라를 움직이면 따라가기와 투어 재생을 멈춘다
    const stop = () => {
      const s = useStore.getState()
      s.setFollow(false)
      if (s.tour !== null) s.setTour(null)
    }
    c.addEventListener('controlstart', stop)
    return () => c.removeEventListener('controlstart', stop)
  }, [])

  useEffect(() => {
    const c = ref.current
    if (!c || !cam) return
    if (cam.cmd === 'zoomIn') c.dolly(c.distance * 0.3, true)
    else if (cam.cmd === 'zoomOut') c.dolly(-c.distance * 0.45, true)
    else if (cam.cmd === 'rotL') c.rotate(Math.PI / 4, 0, true)
    else if (cam.cmd === 'rotR') c.rotate(-Math.PI / 4, 0, true)
    else if (cam.cmd === 'home' || cam.cmd === 'site') {
      const v = siteView(useStore.getState().site)
      c.moveTo(v.t.x, 0, v.t.z, true)
      c.dollyTo(v.d, true)
      c.rotateTo(v.az, POL, true)
    } else if (cam.cmd === 'zone' && cam.x !== undefined && cam.z !== undefined) {
      c.moveTo(cam.x, 0, cam.z, true)
      c.dollyTo(cam.d ?? 80, true)
      const want = siteView(useStore.getState().site).az
      c.rotateTo(want, POL, true)
    } else if (cam.cmd === 'network') {
      c.moveTo(NETWORK_VIEW.center[0], 0, NETWORK_VIEW.center[1], true)
      c.rotateTo(0.12, 0.72, true)
      c.dollyTo(NETWORK_VIEW.dist, true)
    } else if (cam.cmd === 'focus') {
      const sel = useStore.getState().selected
      if (!sel) return
      if (sel.kind === 'site') {
        const v = siteView(sel.id as SiteId)
        c.moveTo(v.t.x, 0, v.t.z, true)
        c.dollyTo(v.d, true)
        c.rotateTo(v.az, POL, true)
        return
      }
      const p = basePos(sel)
      if (!p) return
      c.moveTo(p.x, 0, p.z, true)
      c.dollyTo(FOCUS_DIST[sel.kind], true)
      // 항만처럼 반대편에서 보던 시점이면 기본 방향으로 되돌린다
      const want = siteView(useStore.getState().site).az
      let diff = Math.abs(((c.azimuthAngle - want) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI)
      if (diff > 1.2) c.rotateTo(want, POL, true)
      diff = 0
    }
  }, [cam])

  useFrame(() => {
    const { follow, selected } = useStore.getState()
    const c = ref.current
    if (!c) return
    c.smoothTime = follow ? 0.22 : 0.45
    // 오른쪽 패널·하단 패널에 가리지 않도록 시야 중심을 왼쪽 위로 옮긴다
    c.setFocalOffset(c.distance * 0.1, -c.distance * 0.04, 0, false)
    if (!follow || !selected) return
    const p = basePos(selected)
    if (p) c.moveTo(p.x, 0, p.z, true)
  })

  return (
    <CameraControls
      ref={ref}
      makeDefault
      smoothTime={0.45}
      minDistance={14}
      maxDistance={2300}
      minPolarAngle={0.25}
      maxPolarAngle={1.25}
      mouseButtons={{ left: CameraControlsImpl.ACTION.TRUCK, middle: CameraControlsImpl.ACTION.DOLLY, right: CameraControlsImpl.ACTION.ROTATE, wheel: CameraControlsImpl.ACTION.DOLLY }}
      touches={{ one: CameraControlsImpl.ACTION.TOUCH_TRUCK, two: CameraControlsImpl.ACTION.TOUCH_DOLLY_ROTATE, three: CameraControlsImpl.ACTION.TOUCH_ROTATE }}
      dollyToCursor
    />
  )
}

/** 멀리 볼수록 안개를 멀리, 그림자 갱신은 멈춰 성능을 아낀다.
 *  근거리 평면을 카메라 거리에 맞춰 옮긴다: near가 1m로 고정이면 멀리 있는 바닥에서 깊이 해상도가
 *  수 cm로 떨어져, 몇 mm~cm 간격으로 겹친 도로·활주로 표시가 프레임마다 번갈아 보이며 반짝인다. */
function DistanceTuning() {
  const controls = useThree((s) => s.controls) as unknown as CameraControlsImpl | null
  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  useFrame(() => {
    if (!controls) return
    const d = controls.distance
    const near = THREE.MathUtils.clamp(d * 0.05, 0.5, 90)
    if (Math.abs(camera.near - near) > near * 0.12) {
      camera.near = near
      camera.far = Math.max(5000, d * 4)
      camera.updateProjectionMatrix()
    }
    const fog = scene.fog as THREE.Fog | null
    if (fog) {
      // 비·눈이 오면 시야가 짧아진다
      fog.near = Math.max(280, d * 1.5) * look.fogMul
      fog.far = Math.max(900, d * 3.2) * (0.4 + 0.6 * look.fogMul)
    }
    const far = d > 520
    gl.shadowMap.autoUpdate = !far
    if (!far) gl.shadowMap.needsUpdate = true
  })
  return null
}

function Deselect() {
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return
    useStore.getState().select(null)
  }
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} onClick={onClick}>
      <planeGeometry args={[3000, 3000]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  )
}

export function World() {
  const spots = useMemo(treeSpots, [])
  return (
    <>
      <Merge>
        <Ground />
      </Merge>
      <Deselect />
      <Merge>
        <Fence x0={L.SITE.x0} x1={L.SITE.x1} z0={L.SITE.z0} z1={L.SITE.z1} gaps={[{ side: 'S', from: L.ENTRY.x - 3.6, to: L.ENTRY.x + 3.6 }]} />
        <GonjiamExtras />
      </Merge>
      <Trees spots={spots} />
      <Infill />
      <LocalRoads />
      <LocalTraffic />
      <Merge>
        <Backdrop />
        <YardProps />
        <SortingCanopy />
        <Office p={[44, 9]} />
      </Merge>
      <Traffic />
      <SiteDynamics />
      <HubHall />
      <AirportStatic />
      <Airport />
      <Life />
      <TownLife />
      <IncidentMarkers />
      <GonjiamCY />
      <Gates />
      <Icheon />
      <IncheonStatic />
      <DaejeonStatic />
      <DaejeonLive />
      <Incheon />
      <TownStatic />
      <TownDetail />
      <TownSignals />
      <PortStatic />
      <Port />
      <RailYardStatic />
      <RailYard />
      <RailLineStatic />
      <GonjiamRailStatic />
      <TankFarm />
      <TollPlazas />
      <Terrain />
      <HighwayProps />
      <StreetLamps spots={LAMP_SPOTS} />
      <Billboards />
      <GateSignals />
      <RoadFurniture />
      <GasStation p={[-310, 72]} />
      <RestAreas />
      <Chargers />
      <StagedPallets />
      <Vehicles />
      <Forklifts />
      <Workers />
      <Parcels />
    </>
  )
}

export function Scene() {
  // 프레임이 떨어지면 해상도를 낮추고, 여유가 생기면 다시 올린다
  const [dpr, setDpr] = useState(() => Math.min(2, window.devicePixelRatio || 1))
  return (
    <Canvas
      shadows={{ type: THREE.PCFSoftShadowMap }}
      dpr={dpr}
      camera={{ fov: 28, near: 1, far: 5000, position: [120, 140, 160] }}
      gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 1.0 }}
    >
      <PerformanceMonitor
        onDecline={() => setDpr((d) => Math.max(0.75, +(d - 0.25).toFixed(2)))}
        onIncline={() => setDpr((d) => Math.min(Math.min(2, window.devicePixelRatio || 1), +(d + 0.25).toFixed(2)))}
        flipflops={4}
        bounds={() => [24, 55]}
      />
      <color attach="background" args={['#E7EBF6']} />
      <fog attach="fog" args={['#E7EBF6', 320, 900]} />
      <SimDriver />
      <DevHandle />
      <DistanceTuning />
      <Environment />
      <CameraRig />
      <World />
      <SelectionFx />
      <FloatingLabel />
      <RoutePath />
      <ReverseCues />
      <StatusChips />
      <YardLabels />
      <FacilityLabels />
      <StoryMarker />
      <OverviewLabels />
      <VehicleBeacons />
      <FlowLines />
      <SoundBridge />
      <DetailDirector />
    </Canvas>
  )
}
