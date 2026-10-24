import { useMemo, useRef } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { CUT_U } from '../env/state'
import { useStore } from '../../store'
import * as THREE from 'three'
import { sim } from '../../sim/sim'
import { IcSorterView } from './IcSort'
import { GATES } from '../../sim/world'
import { BS, IC, IN, TW, inFeeder } from '../../sim/sites'
import { BAY_CAP, PORT, SHIP_CAP } from '../../sim/port'
import { containerSideTex, podTex } from '../textures'
import * as L from '../../sim/layout'
import { L as tr } from '../../i18n'
import { B, mat, rboxGeo, unitBox, refreshBounds } from '../kit'
import { GateHouseAt } from '../models/structures'
import { AgvModel, ArmgModel, FeederConveyor, QuayCrane, StretchWrapper, TrafficLight, Tugboat } from '../models/sites'
import { PalletModel, Person, PinModel } from '../models/equipment'
import { Merge } from '../merge'
import { IcheonStatic } from '../world/Network'
import { pickHandlers } from './Vehicles'

// ───────────────────────── 정문 4곳

export function Gates() {
  const arms = useRef<Record<string, { i: THREE.Object3D | null; o: THREE.Object3D | null }>>({})
  useFrame(() => {
    for (const key of ['GJ', 'IN', 'IC', 'BS', 'DJ'] as const) {
      const a = arms.current[key]
      if (!a) continue
      const g = sim.gates[key]
      const side = GATES[key].side
      if (a.i) a.i.rotation.z = (side === 'N' ? -1 : 1) * 1.4 * g.inOpen
      if (a.o) a.o.rotation.z = (side === 'N' ? 1 : -1) * 1.4 * g.outOpen
    }
  })
  const labels: Record<string, string> = {
    GJ: tr('GJ-01 곤지암 메가허브', 'GJ-01 Gonjiam Hub'),
    IN: tr('IN-05 인천 서브터미널', 'IN-05 Incheon'),
    IC: tr('IC-03 이천 풀필먼트', 'IC-03 Icheon FC'),
    BS: tr('BS-04 부산신항', 'BS-04 Busan New Port'),
    DJ: tr('DJ-07 대전 중부허브', 'DJ-07 Daejeon Hub'),
  }
  return (
    <group>
      {(['GJ', 'IN', 'IC', 'BS', 'DJ'] as const).map((key) => (
        <Merge key={key}>
          <GateHouseAt
            gate={GATES[key]}
            label={labels[key]}
            inRef={(o) => { arms.current[key] = { ...(arms.current[key] ?? { i: null, o: null }), i: o } }}
            outRef={(o) => { arms.current[key] = { ...(arms.current[key] ?? { i: null, o: null }), o } }}
          />
        </Merge>
      ))}
    </group>
  )
}

// ───────────────────────── 이천: 출고 라인 파렛트 · 랩핑기 · AMR

function LinePallets() {
  const n = 9
  const refs = useRef<(THREE.Group | null)[]>([])
  const raw = useRef<(THREE.Group | null)[]>([])
  const wrapped = useRef<(THREE.Group | null)[]>([])
  const ids = useRef<string[]>([])
  useFrame(() => {
    const list = sim.icLines.flatMap((ln) => ln.pallets)
    ids.current = list
    for (let i = 0; i < n; i++) {
      const g = refs.current[i]
      if (!g) continue
      const p = list[i] ? sim.pallets.get(list[i]) : null
      g.visible = !!p
      if (!p) continue
      g.position.set(p.x, IC.rollerY + 0.02, p.z)
      if (raw.current[i]) raw.current[i]!.visible = !p.wrapped
      if (wrapped.current[i]) wrapped.current[i]!.visible = !!p.wrapped
    }
  })
  const pick = (i: number) => ({
    onClick: (e: ThreeEvent<MouseEvent>) => {
      const id = ids.current[i]
      if (!id || e.delta > 4) return
      e.stopPropagation()
      useStore.getState().select({ kind: 'pallet', id })
    },
  })
  return (
    <group>
      {Array.from({ length: n }, (_, i) => (
        <group key={i} ref={(o) => { refs.current[i] = o }} {...pick(i)}>
          <group ref={(o) => { raw.current[i] = o }}>
            <PalletModel look="boxes" height={1.1} />
          </group>
          <group ref={(o) => { wrapped.current[i] = o }} visible={false}>
            <PalletModel look="stretch" height={1.1} />
          </group>
        </group>
      ))}
    </group>
  )
}

function Wrappers() {
  const arms = useRef<(THREE.Object3D | null)[]>([])
  const rolls = useRef<(THREE.Object3D | null)[]>([])
  useFrame(({ clock }, dt) => {
    sim.icLines.forEach((ln, i) => {
      const a = arms.current[i]
      const r = rolls.current[i]
      if (a && ln.wrapping) a.rotation.y += dt * 3.2
      if (r) r.position.y = ln.wrapping ? -1.6 + Math.sin(clock.elapsedTime * 1.4) * 0.6 : -1.3
    })
  })
  return (
    <group>
      {IC.lines.map((x, i) => (
        <group key={x} position={[x, 0, IC.wrapZ]}>
          <Merge>
            <StretchWrapper armRef={(o) => { arms.current[i] = o }} rollRef={(o) => { rolls.current[i] = o }} />
          </Merge>
        </group>
      ))}
    </group>
  )
}

const POD_COLORS = ['#4D6FFF', '#F2B92B', '#9AA4B8']

function Amr() {
  const { pods, robots, totes } = useMemo(() => {
    const podMat = new THREE.MeshStandardMaterial({ map: podTex(), roughness: 0.7 })
    podMat.userData.noSnow = true
    const pods = new THREE.InstancedMesh(unitBox, podMat, sim.pods.length)
    const robots = new THREE.InstancedMesh(rboxGeo(1.0, 0.32, 1.0, 0.08, 2), mat('#FF8A1F', { rough: 0.5 }), sim.robots.length)
    const totes = new THREE.InstancedMesh(unitBox, mat('#3E63FF', { rough: 0.6 }), 24)
    const c = new THREE.Color()
    sim.pods.forEach((p, i) => pods.setColorAt(i, c.set(POD_COLORS[p.color])))
    pods.castShadow = robots.castShadow = true
    return { pods, robots, totes }
  }, [])
  // 라이트 커튼 막대(스테이션마다 3개)를 인스턴스 하나로: 색만 바꾼다(빛나는 느낌이라 조명 무시 재질)
  const { bars, lightOn } = useMemo(() => {
    const bars = new THREE.InstancedMesh(unitBox, new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), IC.stations.length * 3)
    const o = new THREE.Object3D()
    const amber = new THREE.Color('#F2B92B')
    IC.stations.forEach((x, k) => {
      const z = IC.stationZ - 3
      const parts: [number, number, number, number, number, number][] = [[0, 3.12, 0, 2.2, 0.08, 0.12], [-1.35, 1.5, 0.08, 0.04, 2.4, 0.04], [1.35, 1.5, 0.08, 0.04, 2.4, 0.04]]
      parts.forEach(([dx, y, dz, sx, sy, sz], j) => {
        o.position.set(x + dx, y, z + dz)
        o.scale.set(sx, sy, sz)
        o.updateMatrix()
        bars.setMatrixAt(k * 3 + j, o.matrix)
        bars.setColorAt(k * 3 + j, amber)
      })
    })
    return { bars, lightOn: IC.stations.map(() => false) }
  }, [])
  const green = useMemo(() => new THREE.Color('#35D07F'), [])
  const amber = useMemo(() => new THREE.Color('#F2B92B'), [])
  const o = useMemo(() => new THREE.Object3D(), [])
  useFrame(({ clock }) => {
    sim.pods.forEach((p, i) => {
      o.position.set(p.x, p.carried && (p.x !== p.hx || p.z !== p.hz) ? 1.3 : 1.15, p.z)
      o.rotation.set(0, 0, 0)
      o.scale.set(1.0, 2.0, 1.0)
      o.updateMatrix()
      pods.setMatrixAt(i, o.matrix)
    })
    pods.instanceMatrix.needsUpdate = true
    refreshBounds(pods)
    sim.robots.forEach((r, i) => {
      o.position.set(r.x, 0.2, r.z)
      o.rotation.set(0, r.heading, 0)
      o.scale.set(1, 1, 1)
      o.updateMatrix()
      robots.setMatrixAt(i, o.matrix)
    })
    robots.instanceMatrix.needsUpdate = true
    refreshBounds(robots)
    IC.stations.forEach((_, k) => {
      const on = sim.robots.some((r) => r.state === 'atStation' && r.station === k)
      if (on === lightOn[k]) return
      lightOn[k] = on
      for (let j = 0; j < 3; j++) bars.setColorAt(k * 3 + j, on ? green : amber)
      if (bars.instanceColor) bars.instanceColor.needsUpdate = true
    })
    const t = clock.elapsedTime
    for (let i = 0; i < 24; i++) {
      const s = ((t * 1.6 + i * 2.5) % 60)
      o.position.set(452 - s, 1.05, -24)
      o.rotation.set(0, 0, 0)
      o.scale.set(0.55, 0.3, 0.42)
      o.updateMatrix()
      totes.setMatrixAt(i, o.matrix)
    }
    totes.instanceMatrix.needsUpdate = true
    refreshBounds(totes)
  })
  const robotPick = useMemo(() => ({
    onClick: (e: ThreeEvent<MouseEvent>) => {
      const r = e.instanceId !== undefined ? sim.robots[e.instanceId] : null
      if (!r || e.delta > 4) return
      e.stopPropagation()
      useStore.getState().select({ kind: 'robot', id: r.id }, 'IC')
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      const r = e.instanceId !== undefined ? sim.robots[e.instanceId] : null
      if (!r) return
      e.stopPropagation()
      useStore.getState().hover({ kind: 'robot', id: r.id })
    },
    onPointerOut: () => useStore.getState().hover(null),
  }), [])
  return (
    <group>
      <primitive object={pods} />
      <primitive object={robots} {...robotPick} />
      <primitive object={totes} />
      {/* 피킹 스테이션 라이트 커튼 프레임: 포드가 오면 초록 */}
      <Merge>
        {IC.stations.map((x) => (
          <group key={x} position={[x, 0, IC.stationZ - 3]}>
            <B s={[0.12, 3.0, 0.12]} p={[-1.35, 1.5, 0]} c="#3B4252" />
            <B s={[0.12, 3.0, 0.12]} p={[1.35, 1.5, 0]} c="#3B4252" />
            <B s={[2.82, 0.16, 0.16]} p={[0, 3.0, 0]} c="#3B4252" />
          </group>
        ))}
      </Merge>
      <primitive object={bars} />
    </group>
  )
}

export function Icheon() {
  const shutters = useRef<(THREE.Object3D | null)[]>([])
  const controls = useThree((s) => s.controls) as unknown as { camera?: THREE.Camera } | null
  const tmp = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    // 가까이 보면 유리동 앞벽을 녹여 피킹 스테이션·분류기가 보이게 한다
    const { view, site } = useStore.getState()
    let want = 0
    const cam = controls?.camera
    if (cam && view !== 'network' && site === 'IC') {
      cam.getWorldPosition(tmp)
      const d = Math.hypot(tmp.x - 420, tmp.y, tmp.z + 20)
      want = THREE.MathUtils.clamp((175 - d) / 60, 0, 0.92)
    }
    const u = CUT_U.IC
    u.value += (want - u.value) * 0.08
    if (Math.abs(want - u.value) < 0.002) u.value = want
    sim.icReefers.forEach((d, i) => {
      const o = shutters.current[i]
      if (o) o.scale.y = 1 - 0.92 * d.open
    })
  })
  return (
    <group>
      <IcheonStatic refs={{ reefers: shutters.current, docks: [] }} />
      <LinePallets />
      <Wrappers />
      <Amr />
      <IcSorterView />
    </group>
  )
}

// ───────────────────────── 인천: 컨베이어 상자 · 신축 컨베이어 · 슈트 작업자

const TINTS = ['#D7A86E', '#C99A60', '#E2BC88', '#F1F3F8', '#B9CBF2']

function InParcels() {
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(rboxGeo(0.5, 0.34, 0.42, 0.04, 1), mat('#ffffff', { rough: 0.8 }), 420)
    m.castShadow = true
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    for (let i = 0; i < 420; i++) m.setColorAt(i, new THREE.Color(TINTS[i % TINTS.length]))
    return m
  }, [])
  const pin = useRef<THREE.Group>(null)
  const o = useMemo(() => new THREE.Object3D(), [])
  const c = useMemo(() => new THREE.Color(), [])
  useFrame(({ clock }) => {
    const list = sim.inParcels
    const n = Math.min(list.length, 420)
    let story: (typeof list)[number] | null = null
    for (let i = 0; i < n; i++) {
      const p = list[i]
      o.position.set(p.x, p.y, p.z)
      o.rotation.set(0, p.spin, 0)
      o.scale.setScalar(p.story ? 1.25 : p.size)
      o.updateMatrix()
      mesh.setMatrixAt(i, o.matrix)
      mesh.setColorAt(i, p.story ? c.set('#FF6B3D') : c.set(TINTS[Math.floor(p.tint * TINTS.length)]))
      if (p.story) story = p
    }
    mesh.count = n
    mesh.instanceMatrix.needsUpdate = true
    refreshBounds(mesh)
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    if (pin.current) {
      pin.current.visible = !!story
      if (story) pin.current.position.set(story.x, story.y + 1.0 + Math.sin(clock.elapsedTime * 3) * 0.15, story.z)
    }
  })
  return (
    <group>
      <primitive object={mesh} {...pickHandlers({ kind: 'sorter', id: 'S2' })} />
      <group ref={pin} visible={false}>
        <PinModel color="#FF6B3D" scale={0.7} />
      </group>
    </group>
  )
}

function Feeders() {
  const booms = useRef<(THREE.Object3D | null)[]>([])
  useFrame(() => {
    sim.inDocks.forEach((d, i) => {
      const b = booms.current[i]
      if (b) b.scale.z = 0.25 + 0.75 * d.open
    })
  })
  return (
    <group>
      {IN.docks.map((_, i) => {
        const pts = inFeeder(i).slice(0, 3).map((p) => [p.x, p.z] as [number, number])
        return (
          <Merge key={i}>
            <FeederConveyor pts={pts} y={IN.conv.y} boomRef={(o) => { booms.current[i] = o }} />
          </Merge>
        )
      })}
    </group>
  )
}

function InWorkers() {
  const refs = useRef<(THREE.Group | null)[]>([])
  useFrame(({ clock }) => {
    sim.inSlots.forEach((s, i) => {
      const g = refs.current[i]
      if (!g) return
      const v = s.vehicle ? sim.vehicle(s.vehicle) : null
      g.visible = !!v && v.site === 'IN' && (v.phase === 'loading' || v.phase === 'closing')
      g.rotation.y = (s.side === 'N' ? Math.PI : 0) + Math.sin(clock.elapsedTime * 1.7 + i) * 0.5
    })
  })
  return (
    <Merge>
      {sim.inSlots.map((s, i) => (
        <group key={s.id} userData={{ dynamic: true }} ref={(o) => { refs.current[i] = o }} position={[s.x + 1.15, 0, s.side === 'N' ? IN.vanNRear + 0.5 : IN.vanSRear - 0.5]}>
          <Person vest="#2F55E6" cap />
        </group>
      ))}
    </Merge>
  )
}

export function Incheon() {
  return (
    <group>
      <InParcels />
      <Feeders />
      <InWorkers />
    </group>
  )
}

// ───────────────────────── 부산신항: 선박 갑판 · 야드 블록 · STS · AGV · ARMG

const boxMat = () => new THREE.MeshStandardMaterial({ map: containerSideTex(), roughness: 0.6 })

/** 선박 갑판과 야드 블록의 컨테이너(개수가 바뀔 때만 다시 계산) */
function PortStacks() {
  const { ship, yard } = useMemo(() => {
    const ship = new THREE.InstancedMesh(unitBox, boxMat(), PORT.bays.length * SHIP_CAP)
    const yard = new THREE.InstancedMesh(unitBox, boxMat(), PORT.blocks.length * PORT.blockBays.length * BAY_CAP)
    ship.castShadow = yard.castShadow = true
    ship.receiveShadow = yard.receiveShadow = true
    return { ship, yard }
  }, [])
  const ver = useRef(0)
  const o = useMemo(() => new THREE.Object3D(), [])
  const c = useMemo(() => new THREE.Color(), [])
  useFrame(() => {
    const P = sim.port
    if (P.version === ver.current) return
    ver.current = P.version
    let k = 0
    P.ship.forEach((bay, i) => bay.forEach((box, n) => {
      const row = n % PORT.rowsZ.length
      const tier = Math.floor(n / PORT.rowsZ.length)
      o.position.set(PORT.bays[i], PORT.deckY + 1.3 + tier * 2.6, PORT.rowsZ[row])
      o.scale.set(12.1, 2.6, 2.44)
      o.updateMatrix()
      ship.setMatrixAt(k, o.matrix)
      ship.setColorAt(k++, c.set(box.color))
    }))
    ship.count = k
    k = 0
    P.blocks.forEach((blk, b) => blk.forEach((bay, j) => bay.forEach((box, n) => {
      const row = n % PORT.blockRows.length
      const tier = Math.floor(n / PORT.blockRows.length)
      o.position.set(PORT.blocks[b] + PORT.blockRows[row], 1.3 + tier * 2.6, PORT.blockBays[j])
      o.scale.set(2.44, 2.6, 12.1)
      o.updateMatrix()
      yard.setMatrixAt(k, o.matrix)
      yard.setColorAt(k++, c.set(box.color))
    })))
    yard.count = k
    for (const m of [ship, yard]) {
      m.instanceMatrix.needsUpdate = true
      refreshBounds(m)
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
  })
  // 배에 실린 컨테이너는 배와 같이 움직인다(출항·입항)
  const shipGroup = useRef<THREE.Group>(null)
  useFrame(() => {
    if (shipGroup.current) shipGroup.current.position.z = sim.port.berth.offset
  })
  return (
    <group>
      <group ref={shipGroup}>
        <primitive object={ship} {...pickHandlers({ kind: 'site', id: 'BS' })} />
      </group>
      <primitive object={yard} {...pickHandlers({ kind: 'site', id: 'BS' })} />
    </group>
  )
}

/** 들고 있는 컨테이너(색이 바뀌는 단일 메시) */
function useCarried(scale: [number, number, number]) {
  return useMemo(() => {
    const m = new THREE.Mesh(unitBox, boxMat())
    m.scale.set(...scale)
    m.castShadow = true
    return m
  }, [scale[0], scale[1], scale[2]])
}

function StsUnit({ i }: { i: number }) {
  const group = useRef<THREE.Group>(null)
  const parts = useRef<{ trolley: THREE.Object3D | null; spreader: THREE.Object3D | null; cable: THREE.Object3D | null; box: THREE.Object3D | null }>({ trolley: null, spreader: null, cable: null, box: null })
  const carried = useCarried([12.1, 2.6, 2.44])
  const gz = PORT.handZ + 1
  useFrame(() => {
    const s = sim.port.sts[i]
    const p = parts.current
    if (group.current) group.current.position.x = s.x
    if (p.trolley) p.trolley.position.z = s.trolleyZ - gz
    if (p.spreader) p.spreader.position.y = s.spreaderY - 36.6
    if (p.cable) p.cable.scale.y = Math.max(0.1, 36.6 - s.spreaderY)
    if (p.box && carried.parent !== p.box) p.box.add(carried)
    carried.visible = !!s.box
    if (s.box) (carried.material as THREE.MeshStandardMaterial).color.set(s.box.color)
  })
  return (
    <group ref={group} position={[PORT.cranes[i], 0, gz]} {...pickHandlers({ kind: 'crane', id: `sts-${i}` })}>
      <Merge>
        <QuayCrane
          trolleyRef={(o) => { parts.current.trolley = o }}
          spreaderRef={(o) => { parts.current.spreader = o }}
          cableRef={(o) => { parts.current.cable = o }}
          boxRef={(o) => { parts.current.box = o }}
        />
      </Merge>
    </group>
  )
}

function AgvUnit({ i }: { i: number }) {
  const group = useRef<THREE.Group>(null)
  const carried = useCarried([2.44, 2.6, 12.1])
  useFrame(() => {
    const a = sim.port.agvs[i]
    const g = group.current
    if (!g) return
    g.position.set(a.x, 0, a.z)
    g.rotation.y = a.heading
    carried.visible = !!a.box
    if (a.box) (carried.material as THREE.MeshStandardMaterial).color.set(a.box.color)
  })
  return (
    <group ref={group} {...pickHandlers({ kind: 'crane', id: `agv-${i}` })}>
      <Merge>
        <AgvModel />
      </Merge>
      <group position={[0, 1.08 + 1.3, 0]}>
        <primitive object={carried} />
      </group>
    </group>
  )
}

function ArmgUnit({ k }: { k: number }) {
  const group = useRef<THREE.Group>(null)
  const parts = useRef<{ trolley: THREE.Object3D | null; spreader: THREE.Object3D | null; cable: THREE.Object3D | null; box: THREE.Object3D | null }>({ trolley: null, spreader: null, cable: null, box: null })
  const carried = useCarried([2.44, 2.6, 12.1])
  useFrame(() => {
    const arm = sim.port.armgs[k]
    const p = parts.current
    if (group.current) group.current.position.z = arm.z
    if (p.trolley) p.trolley.position.x = arm.trolley
    if (p.spreader) p.spreader.position.y = arm.spreaderY - 20.9
    if (p.cable) p.cable.scale.y = Math.max(0.1, 20.9 - arm.spreaderY)
    if (p.box && carried.parent !== p.box) p.box.add(carried)
    carried.visible = !!arm.box
    if (arm.box) (carried.material as THREE.MeshStandardMaterial).color.set(arm.box.color)
  })
  return (
    <group ref={group} position={[PORT.blocks[k >> 1], 0, 200]} {...pickHandlers({ kind: 'crane', id: `armg-${k}` })}>
      <Merge>
        <ArmgModel
          trolleyRef={(o) => { parts.current.trolley = o }}
          spreaderRef={(o) => { parts.current.spreader = o }}
          cableRef={(o) => { parts.current.cable = o }}
          boxRef={(o) => { parts.current.box = o }}
        />
      </Merge>
    </group>
  )
}

function XrayBeam() {
  const beam = useRef<THREE.Object3D | null>(null)
  useFrame(({ clock }) => {
    const on = sim.vehicles.some((v) => v.kind === 'trailer' && v.phase === 'inspecting')
    const b = beam.current
    if (!b) return
    b.visible = on
    if (on) b.position.z = Math.sin(clock.elapsedTime * 1.4) * 6
  })
  return (
    <group position={[BS.xrayX, 0, BS.exitLane]} rotation={[0, Math.PI / 2, 0]}>
      <group ref={beam} visible={false}>
        <mesh position={[0, 3.6, 0]}>
          <boxGeometry args={[7.6, 6.6, 0.15]} />
          <meshBasicMaterial color="#FF5A4E" transparent opacity={0.45} toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

function Tugboats() {
  const refs = useRef<(THREE.Group | null)[]>([])
  useFrame(({ clock }) => {
    refs.current.forEach((g, i) => {
      if (!g) return
      const t = clock.elapsedTime * 0.5 + i * 2
      g.position.y = Math.sin(t * 2) * 0.15 - 0.3
      g.rotation.z = Math.sin(t * 1.7) * 0.03
      g.position.x = (i ? 352 : 160) + Math.sin(t * 0.3) * 3
    })
  })
  return (
    <group>
      {[0, 1].map((i) => (
        <group key={i} ref={(o) => { refs.current[i] = o }} position={[i ? 352 : 160, 0, i ? 330 : 312]} rotation={[0, i ? -0.5 : 0.6, 0]}>
          <Merge>
            <Tugboat color={i ? '#2F55E6' : '#C44A4A'} />
          </Merge>
        </group>
      ))}
    </group>
  )
}

export function Port() {
  return (
    <group>
      <PortStacks />
      {PORT.cranes.map((_, i) => <StsUnit key={i} i={i} />)}
      {sim.port.agvs.map((_, i) => <AgvUnit key={i} i={i} />)}
      {sim.port.armgs.map((_, k) => <ArmgUnit key={k} k={k} />)}
      <XrayBeam />
      <Tugboats />
    </group>
  )
}

function CyContainers() {
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(unitBox, mat('#ffffff', { rough: 0.6 }), 24)
    const c = new THREE.Color()
    for (let i = 0; i < 24; i++) m.setColorAt(i, c.set(['#5FAFAA', '#E59B6B', '#6585E8', '#A3ACBE', '#D47A74', '#76B08A'][(i * 5) % 6]))
    const o = new THREE.Object3D()
    for (let i = 0; i < 24; i++) {
      const row = i % 12
      const tier = Math.floor(i / 12)
      o.position.set(83, 1.3 + tier * 2.6, -19 + row * 2.6)
      o.scale.set(12.1, 2.6, 2.44)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    }
    m.castShadow = true
    m.receiveShadow = true
    return m
  }, [])
  useFrame(() => {
    mesh.count = sim.cy.count
  })
  return <primitive object={mesh} />
}

export function GonjiamCY() {
  return <CyContainers />
}

// ───────────────────────── 다온마을 신호등

export function TownSignals() {
  const lamps = useRef<(THREE.Object3D | null)[]>([])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime % 20
    const state = t < 9 ? 2 : t < 11 ? 1 : 0
    lamps.current.forEach((g, k) => {
      if (!g) return
      const s = k % 2 === 0 ? state : state === 2 ? 0 : state === 0 ? 2 : 1
      g.children.forEach((m, i) => {
        const mm = (m as THREE.Mesh).material as THREE.MeshStandardMaterial
        mm.emissiveIntensity = i === s ? 1.6 : 0.08
      })
    })
  })
  return (
    <group>
      {[
        { p: [TW.road.x - 6, 0, L.MAIN.z0 - 2] as [number, number, number], r: Math.PI / 2 },
        { p: [TW.road.x + 6, 0, L.MAIN.z1 + 2] as [number, number, number], r: -Math.PI / 2 },
      ].map((s, k) => (
        <group key={k} position={s.p} rotation={[0, s.r, 0]}>
          <TrafficLight arm={5} lampRef={(o) => {
            if (o && !lamps.current[k]) {
              // 신호등마다 독립 재질
              o.children.forEach((m) => { const mesh = m as THREE.Mesh; mesh.material = (mesh.material as THREE.Material).clone() })
            }
            lamps.current[k] = o
          }} />
        </group>
      ))}
    </group>
  )
}

