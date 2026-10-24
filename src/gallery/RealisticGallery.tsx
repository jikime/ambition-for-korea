// 3D 에셋 갤러리(?view=realistic): hubtrace 에셋 팩 GLB를 한 개씩 둘러본다.
//  - 차량·사람·장비 팩 25종(public/assets/models)과 도시·산업 환경 팩 26종(public/assets/env-hd: 상세 LOD0 · 비교용 LOD1)
//  - 환경 모델은 지붕 · 정면 구역을 숨겨 내부를 보고, 셔터 · 게이트 · 차단기(Open_Close)를 여닫는다
//  - 모델에 들어 있는 동작 클립을 그대로 쓴다: 여닫기(문·윙·포크·랜딩기어·미닫이문)는 슬라이더/반복, 바퀴는 굴리기, 사람은 대기·걷기·인사
//  - 사람 걷기는 관제 화면과 같이 발이 미끄러지지 않게 다듬은 클립(three/gait.ts)
//  - 트럭 brand 재질은 운송사 색으로 칠해 볼 수 있다(인쇄된 hubtrace 글자는 그대로)
//  - 조명은 장면 안에서 만든 반사광(Lightformer)만 쓴다(외부 HDR·폰트 요청 없음). 고른 모델은 주소(?asset=)에 남는다
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bounds, Environment, Html, Lightformer, OrbitControls, useAnimations, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { fixGait } from '../three/gait'
import { CARRIERS } from '../sim/data'
import { LogoMark } from '../ui/icons'
import { L } from '../i18n'

type Cat = 'road' | 'rail' | 'sea' | 'people' | 'equip' | 'props' | 'e-logi' | 'e-industry' | 'e-urban' | 'e-infra' | 'e-scene'
interface Asset {
  id: string
  ko: string
  en: string
  cat: Cat
  /** 관제 화면에서 쓰는 곳 */
  use?: [string, string]
  /** 환경 팩: 한 줄 설명(한국어, 영어) */
  note?: [string, string]
}
const isEnv = (a: Asset) => a.cat.startsWith('e-')

const CATS: { id: Cat; ko: string; en: string }[] = [
  { id: 'road', ko: '도로 차량', en: 'Road vehicles' },
  { id: 'rail', ko: '철도', en: 'Rail' },
  { id: 'sea', ko: '해운', en: 'Marine' },
  { id: 'people', ko: '사람', en: 'People' },
  { id: 'equip', ko: '장비', en: 'Equipment' },
  { id: 'props', ko: '현장 소품', en: 'Site props' },
  { id: 'e-logi', ko: '물류 창고 · 거점', en: 'Warehouses & hubs' },
  { id: 'e-industry', ko: '산업 시설', en: 'Industrial' },
  { id: 'e-urban', ko: '도시 건물', en: 'Urban buildings' },
  { id: 'e-infra', ko: '도시 기반시설', en: 'Urban infrastructure' },
  { id: 'e-scene', ko: '조립 장면', en: 'Assembled scenes' },
]

const NEAR: [string, string] = ['가까이 볼 때 상세 모델', 'Detail model up close']
const PARK: [string, string] = ['산업단지 배경 건물', 'Industrial park buildings']
const ASSETS: Asset[] = [
  { id: 'delivery-truck', ko: '1톤 택배 탑차', en: '1-ton delivery van', cat: 'road', use: NEAR },
  { id: 'wing-truck', ko: '5톤 윙바디', en: '5-ton wing-body truck', cat: 'road', use: NEAR },
  { id: 'reefer-truck', ko: '냉동 탑차', en: 'Reefer truck', cat: 'road', use: NEAR },
  { id: 'sedan', ko: '업무용 승용차', en: 'Company sedan', cat: 'road' },
  { id: 'semi-tractor', ko: '컨테이너 트랙터', en: 'Container tractor', cat: 'road' },
  { id: 'container-semitrailer', ko: '40ft 컨테이너 트레일러', en: '40ft container semitrailer', cat: 'road' },
  { id: 'rail-locomotive', ko: '6축 화물 디젤 기관차', en: '6-axle freight locomotive', cat: 'rail', use: ['부산신항↔곤지암 철송 열차', 'Busan–Gonjiam rail shuttle'] },
  { id: 'container-flatcar', ko: '40ft 컨테이너 평판화차', en: '40ft container flatcar', cat: 'rail', use: ['철송 열차 화차', 'Rail shuttle wagons'] },
  { id: 'freight-boxcar', ko: '유개 화물차', en: 'Freight boxcar', cat: 'rail' },
  { id: 'tank-wagon', ko: '액체 화물 탱크 화차', en: 'Tank wagon', cat: 'rail' },
  { id: 'railway-track', ko: '표준궤 12m 레일 구간', en: 'Standard-gauge track, 12 m', cat: 'rail' },
  { id: 'inland-container-barge', ko: '내륙 컨테이너 화물선', en: 'Inland container barge', cat: 'sea' },
  { id: 'shipping-container', ko: '40ft 해상 컨테이너', en: '40ft shipping container', cat: 'sea', use: ['철송 화차 · 철송장 장치 줄', 'Rail wagons · rail terminal stacks'] },
  { id: 'warehouse-worker', ko: '물류센터 작업자', en: 'Warehouse worker', cat: 'people', use: ['가까이 볼 때 조끼 작업자', 'Vest workers up close'] },
  { id: 'delivery-courier', ko: '택배 배송기사', en: 'Parcel courier', cat: 'people', use: ['다온마을 걸어서 배송', 'Daon Village walking delivery'] },
  { id: 'forklift', ko: '전동 지게차', en: 'Electric forklift', cat: 'equip', use: NEAR },
  { id: 'pallet-jack', ko: '핸드 파렛트 트럭', en: 'Pallet jack', cat: 'equip' },
  { id: 'roller-conveyor', ko: '롤러 컨베이어', en: 'Roller conveyor', cat: 'equip' },
  { id: 'pallet-rack', ko: '3단 파렛트 랙', en: '3-level pallet rack', cat: 'equip' },
  { id: 'pallet-cargo', ko: '화물 파렛트', en: 'Loaded pallet', cat: 'equip' },
  { id: 'charging-station', ko: '장비 충전 스테이션', en: 'Charging station', cat: 'equip', use: ['지게차 충전 구역', 'Forklift charging bays'] },
  { id: 'traffic-cone', ko: '반사 안전 콘', en: 'Traffic cone', cat: 'props', use: ['게이트 · 충전 구역 · 공사장', 'Gate · charging bay · work zone'] },
  { id: 'safety-barrier', ko: '이동식 안전 펜스', en: 'Safety barrier', cat: 'props', use: ['공사장', 'Construction site'] },
  { id: 'roll-cage', ko: '운반 롤테이너', en: 'Roll cage', cat: 'props', use: ['야드 · 분류장 · 대전 센터 · 택배실', 'Yard · sorter · Daejeon · parcel room'] },
  { id: 'security-camera', ko: '옥외 보안 카메라', en: 'Security camera', cat: 'props', use: ['거점 펜스 모서리', 'Site fence corners'] },
  // ───── 도시·산업 환경 팩
  { id: 'distribution-warehouse', ko: '대형 물류창고', en: 'Distribution warehouse', cat: 'e-logi', use: PARK, note: ['도크 6개(3.2×3.6m) · 실내 바닥 1.30m · 랙 · 사무실 내부', '6 docks (3.2 × 3.6 m) · floor at 1.30 m · racks and office inside'] },
  { id: 'cross-dock-terminal', ko: '크로스도킹 터미널', en: 'Cross-dock terminal', cat: 'e-logi', note: ['앞뒤 도크 10개씩 · 측면 지게차 램프 · 비워 둔 이송 홀', '10 docks on each long side · side forklift ramp · open transfer hall'] },
  { id: 'cold-storage-warehouse', ko: '저온 · 냉동 물류창고', en: 'Cold-storage warehouse', cat: 'e-logi', use: PARK, note: ['외부 도크 3개 · 전실 · 냉장(+2°C) · 냉동(−18°C)실', '3 docks · vestibule · chilled (+2 °C) and frozen (−18 °C) rooms'] },
  { id: 'urban-microhub', ko: '도심형 마이크로 물류거점', en: 'Urban micro-hub', cat: 'e-logi', note: ['밴 하역 셔터 2개 · 고객 창구 · 분류 작업대 · 옥상 태양광', '2 van shutters · customer counter · sorting benches · rooftop solar'] },
  { id: 'loading-dock-module', ko: '독립형 하역 도크', en: 'Loading dock module', cat: 'e-logi', note: ['셔터 · 도크 씰 · 레벨러 · 범퍼 · 신호등', 'Shutter · dock seal · leveller · bumpers · signal light'] },
  { id: 'factory-production-hall', ko: '생산 공장 · 내부 설비', en: 'Production hall', cat: 'e-industry', use: PARK, note: ['CNC 셀 · 로봇 셀 · 롤러 이송 · 메자닌', 'CNC cells · robot cell · roller transfer · mezzanine'] },
  { id: 'factory-utility-building', ko: '공장 유틸리티동', en: 'Factory utility building', cat: 'e-industry', use: PARK, note: ['펌프 · 배관 · 전기 캐비닛 · 서비스 셔터', 'Pumps · piping · electrical cabinets · service shutter'] },
  { id: 'silo-farm', ko: '3기 사일로 저장시설', en: 'Silo farm', cat: 'e-industry', use: PARK, note: ['원통 저장조 3기 · 호퍼 · 작업 통로 · 충전 배관', 'Three vessels · hoppers · catwalks · fill piping'] },
  { id: 'process-pipe-rack', ko: '공정 배관 랙', en: 'Process pipe rack', cat: 'e-industry', use: PARK, note: ['2단 프레임 · 배관 · 밸브 · 케이블 트레이', 'Two-tier frame · pipes · valves · cable trays'] },
  { id: 'industrial-chimney', ko: '산업용 굴뚝', en: 'Industrial chimney', cat: 'e-industry', use: PARK, note: ['테이퍼 몸체 · 사다리 · 정비 발판(높이 22.8m)', 'Tapered stack · ladder · maintenance platform (22.8 m)'] },
  { id: 'office-midrise', ko: '중층 업무 빌딩', en: 'Mid-rise office', cat: 'e-urban', note: ['로비 · 리셉션 · 승강기 코어(위층은 외관)', 'Lobby · reception · lift core (upper floors exterior only)'] },
  { id: 'apartment-block', ko: '발코니형 공동주택', en: 'Apartment block', cat: 'e-urban', note: ['8층 · 들어간 발코니 · 왕복 계단', '8 storeys · recessed balconies · switchback stairs'] },
  { id: 'mixed-use-corner', ko: '코너 상가 · 주거 건물', en: 'Mixed-use corner', cat: 'e-urban', note: ['1층 점포(카운터 · 진열대) · 위층 주거 외관', 'Ground-floor shops · residential floors above'] },
  { id: 'office-tower', ko: '커튼월 업무 타워', en: 'Office tower', cat: 'e-urban', note: ['14개 층 · 2층 높이 로비 · 높이 60m', '14 floors · double-height lobby · 60 m tall'] },
  { id: 'parking-structure', ko: '램프형 입체 주차장', en: 'Parking structure', cat: 'e-urban', note: ['3개 데크 · 차량 램프 2개(약 7.9°)', '3 decks · two vehicle ramps (about 7.9°)'] },
  { id: 'gatehouse-checkpoint', ko: '경비실 · 차량 검문소', en: 'Gatehouse checkpoint', cat: 'e-urban', note: ['경비실 · 캐노피 · 차단기(유효 폭 6.4m)', 'Guard booth · canopy · barrier (6.4 m clear width)'] },
  { id: 'road-straight', ko: '4차로 직선 도로', en: '4-lane road', cat: 'e-infra', note: ['24m · 3.5m 차로 4개 · 양쪽 보도', '24 m · four 3.5 m lanes · sidewalks'] },
  { id: 'road-intersection', ko: '횡단보도 사거리', en: 'Intersection', cat: 'e-infra', note: ['24 × 24m · 횡단보도 · 정지선', '24 × 24 m · crosswalks · stop lines'] },
  { id: 'sidewalk-segment', ko: '보도 · 턱낮춤', en: 'Sidewalk segment', cat: 'e-infra', note: ['3 × 12m · 턱낮춤 · 점자블록', '3 × 12 m · kerb ramp · tactile paving'] },
  { id: 'streetlight-led', ko: '8m LED 가로등', en: 'LED streetlight', cat: 'e-infra', note: ['높이 8.2m · 등기구 방향 앵커', '8.2 m · luminaire anchor'] },
  { id: 'landscaped-planter', ko: '수목 · 벤치 플랜터', en: 'Landscaped planter', cat: 'e-infra', note: ['5.4m 화단 · 나무 · 벤치', '5.4 m bed · tree · benches'] },
  { id: 'security-fence-gate', ko: '슬라이딩 게이트 · 보안 펜스', en: 'Sliding gate fence', cat: 'e-infra', note: ['18.4m 펜스 · 슬라이딩 게이트', '18.4 m fence · sliding gate'] },
  { id: 'surface-parking-lot', ko: '24면 지상 주차장', en: 'Surface parking lot', cat: 'e-infra', use: PARK, note: ['32 × 24m · 24면 · 가로등 · 나무', '32 × 24 m · 24 bays · lights · trees'] },
  { id: 'logistics-yard', ko: '화물차 대기 · 하역 야드', en: 'Logistics yard', cat: 'e-infra', note: ['64 × 48m · 대기 칸 · 하역 동선 표시', '64 × 48 m · waiting bays · lane markings'] },
  { id: 'urban-district', ko: '도심 복합 블록', en: 'Urban district', cat: 'e-scene', note: ['168 × 168m · 빌딩 · 주택 · 상가 · 도로를 조립한 장면', '168 × 168 m · towers, housing, shops and roads assembled'] },
  { id: 'logistics-campus', ko: '물류 · 제조 캠퍼스', en: 'Logistics campus', cat: 'e-scene', note: ['200 × 144m · 창고 · 공장 · 업무동 · 도로를 조립한 장면', '200 × 144 m · warehouse, factory, office and roads assembled'] },
]
/** 조립 장면은 원본 LOD0가 너무 커서 LOD1만 있다 */
const LOD1_ONLY = new Set(['urban-district', 'logistics-campus'])
const url = (a: Asset, lod: 0 | 1) => (isEnv(a) ? `/assets/env-hd/${lod === 1 && !LOD1_ONLY.has(a.id) ? 'lod1/' : ''}${a.id}.glb` : `/assets/models/${a.id}.glb`)

// ───────────────────────── 동작 클립

/** 여닫는 클립(닫힘 → 가운데 시점에 열림 → 닫힘): 슬라이더 0~1 = 클립 앞쪽 절반 */
const OPEN = /Open|Lift|Retract|Slide/
const ROLL = /Roll/
const PEOPLE: Record<string, [string, string]> = {
  hubtrace_natural_idle: ['대기', 'Idle'],
  hubtrace_walk_in_place: ['걷기', 'Walk'],
  hubtrace_carry_walk_in_place: ['상자 들고 걷기', 'Carry walk'],
  hubtrace_worker_greeting: ['인사', 'Greeting'],
}
const CLIP_LABEL: Record<string, [string, string]> = {
  Doors_Open_Close: ['뒷문', 'Rear doors'],
  Wings_Open_Close: ['윙 날개', 'Wings'],
  Fork_Lift: ['포크 높이', 'Fork height'],
  Landing_Gear_Retract: ['랜딩기어', 'Landing gear'],
  Cargo_Doors_Slide: ['미닫이 화물문', 'Sliding doors'],
  Open_Close: ['셔터 · 게이트 · 차단기', 'Shutters · gates · barriers'],
}
const label = (pair: [string, string] | undefined, fallback: string) => (pair ? L(pair[0], pair[1]) : fallback)

interface Ctrl {
  /** 여닫는 클립: 0~1 */
  open: Record<string, number>
  /** 여닫는 클립: 계속 반복 */
  cycle: Record<string, boolean>
  roll: boolean
  person: string
  paint: string | null
  /** 환경 모델: 지붕 · 정면 구역 보이기 */
  roof: boolean
  front: boolean
}
const freshCtrl = (): Ctrl => ({ open: {}, cycle: {}, roll: false, person: 'hubtrace_natural_idle', paint: null, roof: true, front: true })

interface Stats { tris: number; meshes: number; size: THREE.Vector3; clips: THREE.AnimationClip[]; brand: boolean; sections: { roof: boolean; front: boolean } }

function countStats(o: THREE.Object3D, clips: THREE.AnimationClip[]): Stats {
  let tris = 0
  let meshes = 0
  let brand = false
  const sections = { roof: false, front: false }
  o.traverse((n) => {
    if (n.userData.section === 'roof') sections.roof = true
    if (n.userData.section === 'front') sections.front = true
    const m = n as THREE.Mesh
    if (!m.isMesh) return
    meshes++
    const g = m.geometry
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3
    const mats = Array.isArray(m.material) ? m.material : [m.material]
    if (mats.some((x) => x.name === 'brand')) brand = true
  })
  const size = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3())
  return { tris: Math.round(tris), meshes, size, clips, brand, sections }
}

// ───────────────────────── 모델 한 개

function Viewer({ asset, lod, ctrl, onStats }: { asset: Asset; lod: 0 | 1; ctrl: Ctrl; onStats: (s: Stats) => void }) {
  const { scene, animations } = useGLTF(url(asset, lod))
  const root = useRef<THREE.Group>(null)
  const object = useMemo(() => {
    const o = clone(scene)
    o.traverse((n) => {
      const m = n as THREE.Mesh
      if (!m.isMesh) return
      m.castShadow = true
      m.receiveShadow = true
      m.frustumCulled = !(m as THREE.SkinnedMesh).isSkinnedMesh
    })
    return o
  }, [scene])
  // 사람 걷기는 발이 미끄러지지 않게 다듬은 클립으로, 원래 빠르기(배속 1에서 약 1.25m/s로 걷는 박자)
  const gaits = useMemo(() => {
    const out = new Map<string, number>()
    const clips = animations.map((a) => {
      if (!/walk_in_place/.test(a.name)) return a
      const g = fixGait(scene, a)
      out.set(a.name, 1.25 / g.speed)
      return g.clip
    })
    return { clips, speed: out }
  }, [scene, animations])
  const { actions, mixer } = useAnimations(gaits.clips, root)
  useEffect(() => onStats(countStats(object, animations)), [object, animations, onStats])
  // 처음 보는 방향: 보통은 앞쪽 3/4, 열차·화물선처럼 아주 긴 모델은 옆에 가깝게,
  // 조립 장면 · 주차장 · 도로처럼 넓고 납작한 모델은 위에서 내려다보게(Bounds가 이 방향 그대로 거리만 맞춘다)
  const camera = useThree((s) => s.camera)
  useLayoutEffect(() => {
    const box = new THREE.Box3().setFromObject(object)
    const size = box.getSize(new THREE.Vector3())
    const long = size.z / Math.max(size.x, size.y, 0.01) > 4
    const flat = size.y < 0.25 * Math.max(size.x, size.z)
    const dir = long ? new THREE.Vector3(1, 0.45, 0.5) : flat ? new THREE.Vector3(0.7, 1.1, 0.9) : new THREE.Vector3(0.85, 0.55, 1)
    // 모델 가운데에서 이 방향으로(Bounds는 가운데 → 카메라 방향을 쓴다)
    camera.position.copy(box.getCenter(new THREE.Vector3())).addScaledVector(dir.normalize(), Math.max(10, size.length()))
  }, [object, camera])

  // 운송사 색: brand 재질만 복제해 칠한다
  useEffect(() => {
    const swaps: [THREE.Mesh, THREE.Material][] = []
    if (ctrl.paint) {
      object.traverse((n) => {
        const m = n as THREE.Mesh
        if (!m.isMesh || Array.isArray(m.material) || m.material.name !== 'brand') return
        const c = m.material.clone() as THREE.MeshStandardMaterial
        c.color.set(ctrl.paint!)
        swaps.push([m, m.material])
        m.material = c
      })
    }
    return () => {
      for (const [m, orig] of swaps) {
        ;(m.material as THREE.Material).dispose()
        m.material = orig
      }
    }
  }, [object, ctrl.paint])

  // 사람: 고른 동작만 반복
  useEffect(() => {
    if (!PEOPLE[ctrl.person]) return
    const a = actions[ctrl.person]
    if (!a) return
    a.reset().setEffectiveTimeScale(gaits.speed.get(ctrl.person) ?? 1).fadeIn(0.2).play()
    return () => { a.fadeOut(0.2) }
  }, [actions, ctrl.person, gaits])

  // 바퀴 굴리기
  useEffect(() => {
    const list = Object.entries(actions).filter(([n]) => ROLL.test(n)).map(([, a]) => a!)
    for (const a of list) {
      if (ctrl.roll) a.reset().play()
      else a.stop()
    }
  }, [actions, ctrl.roll])

  // 여닫는 클립: 반복이면 그대로 재생, 아니면 멈춰 두고 슬라이더 시점에 둔다
  useEffect(() => {
    for (const [name, a] of Object.entries(actions)) {
      if (!a || !OPEN.test(name)) continue
      a.play()
      a.paused = !ctrl.cycle[name]
      if (a.paused) a.time = (ctrl.open[name] ?? 0) * (a.getClip().duration / 2)
    }
    mixer.update(0)
  }, [actions, mixer, ctrl.open, ctrl.cycle])

  // 환경 모델: 지붕 · 정면 구역을 숨기면 안(랙 · 사무실 · 설비)이 보인다
  useEffect(() => {
    object.traverse((n) => {
      if (n.userData.section === 'roof') n.visible = ctrl.roof
      else if (n.userData.section === 'front') n.visible = ctrl.front
    })
  }, [object, ctrl.roof, ctrl.front])

  return (
    <group ref={root}>
      <primitive object={object} />
    </group>
  )
}

// ───────────────────────── 화면

/** 주광 + 그림자: 그림자 범위를 고른 모델 크기에 맞춘다(작은 콘부터 46m 화물선까지) */
function KeyLight({ size }: { size: THREE.Vector3 | null }) {
  const light = useRef<THREE.DirectionalLight>(null)
  useEffect(() => {
    const l = light.current
    if (!l) return
    const r = Math.max(1, size ? Math.max(size.x, size.y, size.z) : 6) * 0.75
    l.position.set(-0.6 * r * 2, 1.1 * r * 2, 0.7 * r * 2)
    const cam = l.shadow.camera
    cam.left = cam.bottom = -r
    cam.right = cam.top = r
    cam.near = 0.1
    cam.far = r * 6
    cam.updateProjectionMatrix()
    l.shadow.bias = -0.0004
    l.shadow.normalBias = 0.02 * (r / 6)
  }, [size])
  return <directionalLight ref={light} intensity={1.9} castShadow shadow-mapSize={[2048, 2048]} />
}

function AutoRotate({ on }: { on: boolean }) {
  useFrame((state) => {
    const c = state.controls as unknown as { autoRotate: boolean; update?: () => void } | null
    if (c) c.autoRotate = on
  })
  return null
}

const fmt = (n: number) => n.toLocaleString()
const meters = (v: THREE.Vector3) => `${v.x.toFixed(2)} × ${v.y.toFixed(2)} × ${v.z.toFixed(2)} m`

export default function RealisticGallery() {
  const initial = new URLSearchParams(location.search).get('asset')
  const [id, setId] = useState(ASSETS.some((a) => a.id === initial) ? initial! : 'wing-truck')
  const [ctrl, setCtrl] = useState<Ctrl>(freshCtrl)
  const [stats, setStats] = useState<Stats | null>(null)
  const [bytes, setBytes] = useState<number | null>(null)
  const [spin, setSpin] = useState(false)
  const [lod, setLod] = useState<0 | 1>(0)
  const asset = ASSETS.find((a) => a.id === id)!
  const file = url(asset, lod)

  useEffect(() => {
    document.title = L('허브트레이스 · 3D 에셋', 'HubTrace · 3D assets')
  }, [])
  // 고른 모델을 주소에 남기고, 파일 크기를 잰다
  useEffect(() => {
    const q = new URLSearchParams(location.search)
    q.set('asset', id)
    history.replaceState(null, '', `${location.pathname}?${q}`)
    setBytes(null)
    let live = true
    fetch(file, { method: 'HEAD' })
      .then((r) => Number(r.headers.get('content-length')) || null)
      .then((n) => { if (live && n) setBytes(n) })
      .catch(() => {})
    return () => { live = false }
  }, [id, file])
  // 배포 서버는 HEAD에 크기를 주지 않을 수 있어, 모델을 받은 뒤 브라우저가 기록한 실제 크기로 채운다
  useEffect(() => {
    if (!stats) return
    const e = performance.getEntriesByType('resource').reverse().find((r) => r.name.endsWith(file)) as PerformanceResourceTiming | undefined
    const n = e ? e.decodedBodySize || e.encodedBodySize : 0
    if (n) setBytes((b) => b ?? n)
  }, [stats, file])

  const pick = (next: string) => {
    if (next === id) return
    setId(next)
    setStats(null)
    setLod(0)
    setCtrl(freshCtrl())
  }
  const pickLod = (next: 0 | 1) => {
    if (next === lod) return
    setLod(next)
    setStats(null)
  }
  const openClips = stats?.clips.filter((c) => OPEN.test(c.name)) ?? []
  const hasRoll = !!stats?.clips.some((c) => ROLL.test(c.name))
  const people = stats?.clips.filter((c) => PEOPLE[c.name]) ?? []

  return (
    <div className="relative flex h-full w-full flex-col bg-canvas md:flex-row">
      {/* 목록 */}
      <aside className="panel z-10 m-3 mb-0 flex shrink-0 flex-col gap-3 p-3 md:m-4 md:mr-0 md:w-72 md:overflow-y-auto">
        <div className="flex items-center gap-2.5">
          <LogoMark size={30} />
          <div className="min-w-0">
            <div className="text-[15px] font-bold leading-tight text-ink">{L('3D 에셋 갤러리', '3D asset gallery')}</div>
            <div className="text-[11px] text-muted">{L(`hubtrace 에셋 팩 2종 · ${ASSETS.length}종`, `Two hubtrace asset packs · ${ASSETS.length} models`)}</div>
          </div>
        </div>
        <div className="flex gap-1.5 text-[11px] font-semibold">
          <a href="/" className="rounded-md bg-brand px-2 py-1 text-white">{L('관제 화면', 'Control view')}</a>
          <a href="/?view=assets" className="rounded-md bg-line-2 px-2 py-1 text-ink-2">{L('코드 모델 갤러리', 'Code-model gallery')}</a>
        </div>
        <nav className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 md:flex-col md:overflow-visible">
          {CATS.map((c) => (
            <div key={c.id} className="shrink-0">
              {(c.id === 'road' || c.id === 'e-logi') && (
                <div className="mb-2 mt-1 border-b border-line pb-1 px-1 text-[11.5px] font-bold text-ink">
                  {c.id === 'road' ? L('차량 · 사람 · 장비', 'Vehicles, people & equipment') : L('도시 · 산업 환경', 'City & industrial environments')}
                </div>
              )}
              <div className="mb-1 px-1 text-[10.5px] font-bold uppercase tracking-wide text-faint">{L(c.ko, c.en)}</div>
              <div className="flex gap-1 md:flex-col">
                {ASSETS.filter((a) => a.cat === c.id).map((a) => (
                  <button
                    key={a.id}
                    onClick={() => pick(a.id)}
                    className={`flex shrink-0 items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors ${a.id === id ? 'bg-brand-soft font-semibold text-brand' : 'text-ink-2 hover:bg-line-2'}`}
                  >
                    <span className="whitespace-nowrap">{L(a.ko, a.en)}</span>
                    {a.use && <span className="hidden h-1.5 w-1.5 shrink-0 rounded-full bg-ok md:block" title={L('관제 화면에서 사용 중', 'Used in the control view')} />}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* 3D + 정보(넓은 화면은 옆 칸, 좁은 화면은 아래 칸) */}
      <div className="relative flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="relative h-full min-h-0 flex-1">
          <Canvas shadows dpr={[1, 2]} camera={{ position: [12, 7, 14], fov: 34, near: 0.05, far: 2000 }} gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 1.05 }}>
            <color attach="background" args={['#E7EBF6']} />
            <hemisphereLight args={['#EEF3FF', '#8A8F9C', 0.35]} />
            <KeyLight size={stats?.size ?? null} />
            <directionalLight position={[7, 5, -6]} intensity={0.5} color="#D4E4FF" />
            <Environment resolution={256}>
              <Lightformer intensity={3} position={[0, 8, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[10, 10, 1]} />
              <Lightformer intensity={2} position={[6, 4, 2]} rotation={[0, -Math.PI / 2, 0]} scale={[8, 4, 1]} />
              <Lightformer intensity={1.4} position={[-7, 3, -6]} rotation={[0, Math.PI / 2, 0]} scale={[8, 6, 1]} />
              <Lightformer intensity={0.8} color="#BFD2FF" position={[0, 2, 9]} scale={[12, 3, 1]} />
            </Environment>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]}>
              <planeGeometry args={[4000, 4000]} />
              <meshStandardMaterial color="#DDE3EF" roughness={0.9} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} receiveShadow>
              <planeGeometry args={[4000, 4000]} />
              <shadowMaterial opacity={0.22} />
            </mesh>
            <Suspense fallback={<Html center><div className="panel whitespace-nowrap px-3 py-2 text-[12px] text-ink-2">{L('모델 불러오는 중…', 'Loading model…')}</div></Html>}>
              <Bounds key={`${id}-${lod}`} fit clip observe margin={1.25}>
                <Viewer asset={asset} lod={lod} ctrl={ctrl} onStats={setStats} />
              </Bounds>
            </Suspense>
            <OrbitControls makeDefault minDistance={0.3} maxDistance={600} maxPolarAngle={Math.PI / 2 - 0.02} autoRotateSpeed={0.8} />
            <AutoRotate on={spin} />
          </Canvas>
        </div>

        {/* 고른 모델 정보 · 조작 */}
        <section className="panel m-3 mt-0 max-h-[42%] shrink-0 space-y-3 overflow-y-auto p-3.5 md:m-4 md:ml-0 md:max-h-[calc(100%-2rem)] md:w-[300px] md:self-start">
          <div>
            <div className="text-[11px] font-semibold text-muted">{L(CATS.find((c) => c.id === asset.cat)!.ko, CATS.find((c) => c.id === asset.cat)!.en)}</div>
            <h1 className="text-[17px] font-bold leading-snug text-ink">{L(asset.ko, asset.en)}</h1>
            <div className="mt-0.5 font-mono text-[11px] text-faint">{asset.id}.glb{isEnv(asset) ? ` · LOD${LOD1_ONLY.has(asset.id) ? 1 : lod}` : ''}</div>
            {asset.note && <p className="mt-1.5 text-[12px] leading-snug text-ink-2">{L(asset.note[0], asset.note[1])}</p>}
          </div>
          {asset.use && (
            <div className="rounded-lg bg-ok-soft px-2.5 py-1.5 text-[11.5px] text-ok">
              <span className="font-semibold">{L('관제 화면 사용 중', 'In the control view')}</span> · {L(asset.use[0], asset.use[1])}
            </div>
          )}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
            <dt className="text-muted">{L('크기', 'Size')}</dt>
            <dd className="text-right font-medium text-ink">{stats ? meters(stats.size) : '—'}</dd>
            <dt className="text-muted">{L('삼각형', 'Triangles')}</dt>
            <dd className="text-right font-medium text-ink">{stats ? fmt(stats.tris) : '—'}</dd>
            <dt className="text-muted">{L('메시', 'Meshes')}</dt>
            <dd className="text-right font-medium text-ink">{stats ? stats.meshes : '—'}</dd>
            <dt className="text-muted">{L('파일', 'File')}</dt>
            <dd className="text-right font-medium text-ink">{bytes ? `${fmt(Math.round(bytes / 1024))} KB` : '—'}</dd>
          </dl>

          {people.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11.5px] font-semibold text-ink-2">{L('동작', 'Motion')}</div>
              <div className="flex flex-wrap gap-1.5">
                {people.map((c) => (
                  <button key={c.name} onClick={() => setCtrl((s) => ({ ...s, person: c.name }))} className={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${ctrl.person === c.name ? 'bg-brand text-white' : 'bg-line-2 text-ink-2'}`}>
                    {label(PEOPLE[c.name], c.name)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isEnv(asset) && !LOD1_ONLY.has(asset.id) && (
            <div>
              <div className="mb-1.5 text-[11.5px] font-semibold text-ink-2">{L('상세 수준', 'Level of detail')}</div>
              <div className="flex gap-1.5">
                {([0, 1] as const).map((k) => (
                  <button key={k} onClick={() => pickLod(k)} className={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${lod === k ? 'bg-brand text-white' : 'bg-line-2 text-ink-2'}`}>
                    {k === 0 ? L('LOD0 · 상세', 'LOD0 · Detail') : L('LOD1 · 먼 거리', 'LOD1 · Distance')}
                  </button>
                ))}
              </div>
            </div>
          )}

          {stats && (stats.sections.roof || stats.sections.front) && (
            <div>
              <div className="mb-1.5 text-[11.5px] font-semibold text-ink-2">{L('내부 보기', 'Look inside')}</div>
              <div className="flex flex-wrap gap-1.5">
                {stats.sections.roof && (
                  <button onClick={() => setCtrl((c) => ({ ...c, roof: !c.roof }))} className={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${!ctrl.roof ? 'bg-brand text-white' : 'bg-line-2 text-ink-2'}`}>
                    {ctrl.roof ? L('지붕 숨기기', 'Hide roof') : L('지붕 보이기', 'Show roof')}
                  </button>
                )}
                {stats.sections.front && (
                  <button onClick={() => setCtrl((c) => ({ ...c, front: !c.front }))} className={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${!ctrl.front ? 'bg-brand text-white' : 'bg-line-2 text-ink-2'}`}>
                    {ctrl.front ? L('정면 숨기기', 'Hide front') : L('정면 보이기', 'Show front')}
                  </button>
                )}
              </div>
            </div>
          )}

          {openClips.map((c) => (
            <div key={c.name}>
              <div className="mb-1 flex items-center justify-between text-[11.5px] font-semibold text-ink-2">
                <span>{label(CLIP_LABEL[c.name], c.name)}</span>
                <button onClick={() => setCtrl((s) => ({ ...s, cycle: { ...s.cycle, [c.name]: !s.cycle[c.name] } }))} className={`rounded px-1.5 py-0.5 text-[10.5px] ${ctrl.cycle[c.name] ? 'bg-brand text-white' : 'bg-line-2 text-ink-2'}`}>
                  {ctrl.cycle[c.name] ? L('반복 중', 'Looping') : L('반복', 'Loop')}
                </button>
              </div>
              <input
                type="range" min={0} max={1} step={0.01} value={ctrl.open[c.name] ?? 0} disabled={!!ctrl.cycle[c.name]}
                onChange={(e) => { const v = Number(e.target.value); setCtrl((s) => ({ ...s, open: { ...s.open, [c.name]: v } })) }}
                className="w-full accent-[var(--color-brand)] disabled:opacity-40"
                aria-label={label(CLIP_LABEL[c.name], c.name)}
              />
            </div>
          ))}

          {stats?.brand && (
            <div>
              <div className="mb-1.5 text-[11.5px] font-semibold text-ink-2">{L('운송사 도장', 'Carrier paint')}</div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button onClick={() => setCtrl((s) => ({ ...s, paint: null }))} className={`rounded-md px-2 py-1 text-[11px] font-semibold ${ctrl.paint === null ? 'bg-brand text-white' : 'bg-line-2 text-ink-2'}`}>{L('원래 색', 'Original')}</button>
                {(['daon', 'baro', 'donghae', 'hangil'] as const).map((k) => (
                  <button key={k} onClick={() => setCtrl((s) => ({ ...s, paint: CARRIERS[k].color }))} title={CARRIERS[k].name} aria-label={CARRIERS[k].name} className={`h-6 w-6 rounded-full border-2 ${ctrl.paint === CARRIERS[k].color ? 'border-ink' : 'border-white'} shadow`} style={{ background: CARRIERS[k].color }} />
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-1.5 border-t border-line pt-3">
            {hasRoll && (
              <button onClick={() => setCtrl((s) => ({ ...s, roll: !s.roll }))} className={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${ctrl.roll ? 'bg-brand text-white' : 'bg-line-2 text-ink-2'}`}>{L('바퀴 굴리기', 'Roll wheels')}</button>
            )}
            <button onClick={() => setSpin((v) => !v)} className={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${spin ? 'bg-brand text-white' : 'bg-line-2 text-ink-2'}`}>{L('자동 회전', 'Auto-rotate')}</button>
          </div>
          <p className="text-[10.5px] leading-relaxed text-faint">{L('드래그: 회전 · 휠: 확대 · 오른쪽 드래그: 이동', 'Drag: orbit · Wheel: zoom · Right-drag: pan')}</p>
        </section>
      </div>
    </div>
  )
}
