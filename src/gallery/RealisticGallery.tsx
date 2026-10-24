// 3D 에셋 갤러리(?view=realistic): hubtrace 에셋 팩 GLB 25종(웹용으로 줄인 public/assets/models)을 한 개씩 둘러본다.
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

type Cat = 'road' | 'rail' | 'sea' | 'people' | 'equip' | 'props'
interface Asset { id: string; ko: string; en: string; cat: Cat; /** 관제 화면에서 쓰는 곳 */ use?: [string, string] }

const CATS: { id: Cat; ko: string; en: string }[] = [
  { id: 'road', ko: '도로 차량', en: 'Road vehicles' },
  { id: 'rail', ko: '철도', en: 'Rail' },
  { id: 'sea', ko: '해운', en: 'Marine' },
  { id: 'people', ko: '사람', en: 'People' },
  { id: 'equip', ko: '장비', en: 'Equipment' },
  { id: 'props', ko: '현장 소품', en: 'Site props' },
]

const NEAR: [string, string] = ['가까이 볼 때 상세 모델', 'Detail model up close']
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
]
const url = (id: string) => `/assets/models/${id}.glb`

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
}
const freshCtrl = (): Ctrl => ({ open: {}, cycle: {}, roll: false, person: 'hubtrace_natural_idle', paint: null })

interface Stats { tris: number; meshes: number; size: THREE.Vector3; clips: THREE.AnimationClip[]; brand: boolean }

function countStats(o: THREE.Object3D, clips: THREE.AnimationClip[]): Stats {
  let tris = 0
  let meshes = 0
  let brand = false
  o.traverse((n) => {
    const m = n as THREE.Mesh
    if (!m.isMesh) return
    meshes++
    const g = m.geometry
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3
    const mats = Array.isArray(m.material) ? m.material : [m.material]
    if (mats.some((x) => x.name === 'brand')) brand = true
  })
  const size = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3())
  return { tris: Math.round(tris), meshes, size, clips, brand }
}

// ───────────────────────── 모델 한 개

function Viewer({ id, ctrl, onStats }: { id: string; ctrl: Ctrl; onStats: (s: Stats) => void }) {
  const { scene, animations } = useGLTF(url(id))
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
  // 처음 보는 방향: 보통은 앞쪽 3/4, 열차·화물선처럼 아주 긴 모델은 옆에 가깝게(Bounds가 이 방향 그대로 거리만 맞춘다)
  const camera = useThree((s) => s.camera)
  useLayoutEffect(() => {
    const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3())
    const long = size.z / Math.max(size.x, size.y, 0.01) > 4
    camera.position.copy(long ? new THREE.Vector3(1, 0.45, 0.5) : new THREE.Vector3(0.85, 0.55, 1)).normalize().multiplyScalar(10)
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
  const asset = ASSETS.find((a) => a.id === id)!

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
    fetch(url(id), { method: 'HEAD' })
      .then((r) => Number(r.headers.get('content-length')) || null)
      .then((n) => { if (live && n) setBytes(n) })
      .catch(() => {})
    return () => { live = false }
  }, [id])
  // 배포 서버는 HEAD에 크기를 주지 않을 수 있어, 모델을 받은 뒤 브라우저가 기록한 실제 크기로 채운다
  useEffect(() => {
    if (!stats) return
    const e = performance.getEntriesByType('resource').reverse().find((r) => r.name.endsWith(url(id))) as PerformanceResourceTiming | undefined
    const n = e ? e.decodedBodySize || e.encodedBodySize : 0
    if (n) setBytes((b) => b ?? n)
  }, [stats, id])

  const pick = (next: string) => {
    if (next === id) return
    setId(next)
    setStats(null)
    setCtrl(freshCtrl())
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
            <div className="text-[11px] text-muted">{L('hubtrace 에셋 팩 · 25종', 'hubtrace asset pack · 25 models')}</div>
          </div>
        </div>
        <div className="flex gap-1.5 text-[11px] font-semibold">
          <a href="/" className="rounded-md bg-brand px-2 py-1 text-white">{L('관제 화면', 'Control view')}</a>
          <a href="/?view=assets" className="rounded-md bg-line-2 px-2 py-1 text-ink-2">{L('코드 모델 갤러리', 'Code-model gallery')}</a>
        </div>
        <nav className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 md:flex-col md:overflow-visible">
          {CATS.map((c) => (
            <div key={c.id} className="shrink-0">
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
              <Bounds key={id} fit clip observe margin={1.25}>
                <Viewer id={id} ctrl={ctrl} onStats={setStats} />
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
            <div className="mt-0.5 font-mono text-[11px] text-faint">{asset.id}.glb</div>
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
