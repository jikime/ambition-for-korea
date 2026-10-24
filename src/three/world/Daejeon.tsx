// 대전 중부허브(DJ-07): 크로스도크 + 고층 랙 보관동. 남쪽 면 도크 3개, 정문 진입로, 도크 앞 통로, 야드 대기 칸, 사무동.
// 지붕은 카메라가 다가가면 녹아 사라져(컷어웨이) 안의 공정이 보인다: 입고 레인 → 검수 → 지게차 → P&D → 리치트럭 → 고층 랙.
// 지붕에는 태양광 패널이 있고, 녹을 때 함께 사라진다.
import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { CameraControlsImpl } from '@react-three/drei'
import * as THREE from 'three'
import { B, COLORS, Flat, mat, refreshBounds, unitBox } from '../kit'
import { labelTex, paintTex } from '../textures'
import { Merge } from '../merge'
import { Decal, GroundPaint } from '../models/structures'
import { SmallOffice } from '../models/sites'
import { ForkliftModel, RollCage } from '../models/equipment'
import { CarModel } from '../models/vehicles'
import { Fence } from './Vegetation'
import { DJ } from '../../sim/daejeon'
import { RACK, WH, aisleX, bayZ, levelY, locX } from '../../sim/djwh'
import { GATES } from '../../sim/world'
import { sim } from '../../sim/sim'
import * as L from '../../sim/layout'
import { L as tr } from '../../i18n'
import { CUT_U, cutawayMaterial } from '../env/state'
import { solarTex } from '../models/sites'
import { useStore } from '../../store'
import { pickHandlers } from '../entities/Vehicles'

const roadMat = () => {
  const m = mat(COLORS.road, { rough: 0.95 })
  m.userData.snow = 0.35
  return m
}

const B0 = DJ.building
const CX = (B0.x0 + B0.x1) / 2
const CZ = (B0.z0 + B0.z1) / 2
const W = B0.x1 - B0.x0
const D = B0.z1 - B0.z0
/** 남쪽 벽 아랫부분 높이(도크 문 + 처마 위까지) */
const WALL_LOW = 5.6

/** 지붕 태양광 패널 배치(탄소 탭의 발전량 계산에도 쓴다): [x, z, 폭, 깊이] */
export const DJ_SOLAR: [number, number, number, number][] = Array.from({ length: 3 }, (_, r) => Array.from({ length: 6 }, (_, c) => [B0.x0 + 8 + c * 14.5, B0.z0 + 6 + r * 10, 12, 7] as [number, number, number, number])).flat()

export function DaejeonStatic() {
  const S = DJ.site
  const g = GATES.DJ
  const road = useMemo(roadMat, [])
  const line = useMemo(() => mat('#FFFFFF', { rough: 0.9 }), [])
  const yellow = useMemo(() => mat(COLORS.yellow, { rough: 0.9 }), [])
  const green = useMemo(() => mat('#7CCB93', { rough: 0.9 }), [])
  const wall = useMemo(() => mat('#EEF1F7', { rough: 0.85 }), [])
  const t = 0.4
  return (
    <group>
      <Merge>
        <Flat s={[S.x1 - S.x0, S.z1 - S.z0]} p={[(S.x0 + S.x1) / 2, (S.z0 + S.z1) / 2]} c={COLORS.pad} y={0.008} />
        <Flat s={[S.x1 - S.x0, 2.4]} p={[(S.x0 + S.x1) / 2, S.z1 + 1.3]} c={COLORS.lawn} y={0.012} />
        {/* 정문 진입로(들어가는 차로 · 나가는 차로) */}
        <Flat s={[8, L.MAIN.z0 - DJ.landIn + 3]} p={[g.x, (L.MAIN.z0 + DJ.landIn - 3) / 2]} m={road} y={0.016} />
        <Flat s={[0.14, L.MAIN.z0 - DJ.landOut - 4]} p={[g.x, (L.MAIN.z0 + DJ.landOut) / 2]} m={line} y={0.03} />
        {/* 야드 대기 칸 Y1·Y2 */}
        <Flat s={[13, 46]} p={[710.5, 7]} m={road} y={0.015} />
        {DJ.yard.map((x, i) => (
          <group key={x}>
            <Flat s={[0.14, 12]} p={[x - 1.8, DJ.yardZ + 0.5]} m={line} y={0.03} />
            <Flat s={[0.14, 12]} p={[x + 1.8, DJ.yardZ + 0.5]} m={line} y={0.03} />
            <GroundPaint tex={paintTex(`Y${i + 1}`, '#FFFFFF')} w={2.4} h={1.2} p={[x, DJ.yardZ - 7.2]} opacity={0.9} />
          </group>
        ))}
        <GroundPaint tex={paintTex(tr('야드 대기', 'Queue'), '#F2C233')} w={6} h={1.6} p={[710, 14.5]} opacity={0.9} />
        {/* 도크 앞 통로 */}
        <Flat s={[g.x + 4 - (B0.x0 - 4), 13]} p={[(g.x + 4 + B0.x0 - 4) / 2, (DJ.landIn + DJ.landOut) / 2]} m={road} y={0.016} />
        <Flat s={[g.x - B0.x0 - 6, 0.14]} p={[(g.x + B0.x0) / 2, (DJ.landIn + DJ.landOut) / 2]} m={line} y={0.03} />
        {/* 도크 앞 마당(후진 구역) */}
        <Flat s={[W, B0.z1 - DJ.landIn + 5]} p={[CX, (B0.z1 + DJ.landIn - 5) / 2]} c="#E8ECF4" y={0.013} />
        {DJ.docks.map((dx, i) => (
          <group key={dx}>
            <Flat s={[0.16, 12]} p={[dx - 1.7, B0.z1 + 6]} m={yellow} y={0.03} />
            <Flat s={[0.16, 12]} p={[dx + 1.7, B0.z1 + 6]} m={yellow} y={0.03} />
            <GroundPaint tex={paintTex(`D${i + 1}`, '#FFFFFF')} w={3.6} h={1.8} p={[dx, B0.z1 + 13]} opacity={0.9} />
            {/* 도크 가장자리 노랑·검정 안전 사선 */}
            {Array.from({ length: 6 }, (_, k) => (
              <Flat key={k} s={[0.5, 0.9]} p={[dx - 1.5 + k * 0.6, B0.z1 + 0.5]} m={k % 2 ? mat('#22262F') : yellow} y={0.032} />
            ))}
          </group>
        ))}
        {/* 벽(지붕은 따로: 녹아 사라진다) */}
        <B s={[W, B0.h, t]} p={[CX, B0.h / 2, B0.z0]} m={wall} />
        <B s={[t, B0.h, D]} p={[B0.x0, B0.h / 2, CZ]} m={wall} />
        <B s={[t, B0.h, D]} p={[B0.x1, B0.h / 2, CZ]} m={wall} />
        {/* 남쪽 벽: 도크 문 사이 벽 + 문 위 벽 */}
        {[[B0.x0, DJ.docks[0] - 2], [DJ.docks[0] + 2, DJ.docks[1] - 2], [DJ.docks[1] + 2, DJ.docks[2] - 2], [DJ.docks[2] + 2, B0.x1]].map(([a, b2]) => (
          <B key={a} s={[b2 - a, WALL_LOW, t]} p={[(a + b2) / 2, WALL_LOW / 2, B0.z1]} m={wall} />
        ))}
        {DJ.docks.map((dx) => <B key={dx} s={[4, WALL_LOW - 4.4, t]} p={[dx, 4.4 + (WALL_LOW - 4.4) / 2, B0.z1]} m={wall} />)}
        {/* 윗부분 벽 · 띠 · 간판은 SouthWallUpper(가까이 보면 녹아 사라진다) */}
        {/* 처마(도크 위 캐노피) */}
        <B s={[W - 10, 0.35, 6]} p={[CX, 5.4, B0.z1 + 3]} c="#DDE3EE" />
        {DJ.docks.map((dx) => (
          <group key={dx}>
            {/* 도크 셸터(검은 테두리) · 레벨러 · 범퍼 */}
            <B s={[4.2, 0.35, 0.6]} p={[dx, 4.6, B0.z1 + 0.35]} c="#22262F" />
            <B s={[0.35, 4.2, 0.6]} p={[dx - 2.0, 2.4, B0.z1 + 0.35]} c="#22262F" />
            <B s={[0.35, 4.2, 0.6]} p={[dx + 2.0, 2.4, B0.z1 + 0.35]} c="#22262F" />
            <B s={[0.35, 1.0, 0.4]} p={[dx - 1.6, 1.2, B0.z1 + 0.45]} c="#2A2E39" />
            <B s={[0.35, 1.0, 0.4]} p={[dx + 1.6, 1.2, B0.z1 + 0.45]} c="#2A2E39" />
            <B s={[3.0, 0.18, 1.2]} p={[dx, 1.2, B0.z1 + 0.6]} c="#9AA4B8" />
          </group>
        ))}
        {/* ── 안: 바닥과 표시 */}
        <Flat s={[W - 0.8, D - 0.8]} p={[CX, CZ]} c="#E9EDF4" y={0.02} />
        {/* 보행 통로(검수원 동선) */}
        <Flat s={[W - 2, 0.9]} p={[CX, WH.qcZ]} m={green} y={0.028} />
        {/* 지게차 줄 · 리치트럭 줄 */}
        <Flat s={[W - 4, 0.12]} p={[CX, WH.flZ - 1.2]} m={yellow} y={0.03} />
        <Flat s={[W - 4, 0.12]} p={[CX, WH.flZ + 1.2]} m={yellow} y={0.03} />
        <Flat s={[W - 4, 0.12]} p={[CX, RACK.frontZ + 0.2]} m={yellow} y={0.03} />
        {/* 입고·출고 레인 칸 */}
        {DJ.docks.flatMap((dx) => [dx - 0.85, dx + 0.85].flatMap((x) => WH.laneZ.map((z) => (
          <group key={`${x}-${z}`}>
            <Flat s={[1.3, 0.06]} p={[x, z - 0.62]} m={x < dx ? yellow : line} y={0.03} />
            <Flat s={[1.3, 0.06]} p={[x, z + 0.62]} m={x < dx ? yellow : line} y={0.03} />
            <Flat s={[0.06, 1.24]} p={[x - 0.65, z]} m={x < dx ? yellow : line} y={0.03} />
            <Flat s={[0.06, 1.24]} p={[x + 0.65, z]} m={x < dx ? yellow : line} y={0.03} />
          </group>
        ))))}
        {DJ.docks.map((dx) => (
          <group key={dx}>
            <GroundPaint tex={paintTex(tr('입고', 'IN'), '#E0A100')} w={1.6} h={0.8} p={[dx - 0.85, WH.laneZ[0] - 1.25]} opacity={0.9} />
            <GroundPaint tex={paintTex(tr('출고', 'OUT'), '#5A6B8C')} w={1.6} h={0.8} p={[dx + 0.85, WH.laneZ[0] - 1.25]} opacity={0.9} />
          </group>
        ))}
        {/* P&D 칸과 통로 번호 */}
        {Array.from({ length: RACK.aisles }, (_, k) => (
          <group key={k}>
            <Flat s={[1.3, 1.1]} p={[aisleX(k) - 1.25, WH.pdZ]} c="#F7E7B2" y={0.025} />
            <Flat s={[1.3, 1.1]} p={[aisleX(k) + 1.25, WH.pdZ]} c="#DCE3F0" y={0.025} />
            <GroundPaint tex={paintTex(`A${String(k + 1).padStart(2, '0')}`, '#3A4152')} w={1.8} h={0.9} p={[aisleX(k), RACK.frontZ - 1.2]} opacity={0.8} />
          </group>
        ))}
        {/* 롤테이너 대기 구역(건물 동쪽) */}
        <Flat s={[10, 22]} p={[691, -48]} c="#E3E8F2" y={0.014} />
        {Array.from({ length: 2 }, (_, col) =>
          Array.from({ length: 9 }, (_, row) => (
            <group key={`${row}-${col}`} position={[689 + col * 2.4, 0, -57 + row * 2.1]} rotation={[0, Math.PI / 2, 0]}>
              <RollCage fill={row % 3 === 0 ? 0.4 : 0.85} color={col ? '#E0A100' : COLORS.brand} />
            </group>
          )),
        )}
        {/* 사무동 · 주차장 */}
        <group position={[612, 0, 16]}>
          <SmallOffice w={18} d={8} label="대전 중부허브" />
        </group>
        <Flat s={[34, 10]} p={[650, 16]} m={road} y={0.016} />
        {Array.from({ length: 12 }, (_, k) => <Flat key={k} s={[0.12, 5]} p={[634 + k * 3, 18.5]} m={line} y={0.03} />)}
        <Fence x0={S.x0} x1={S.x1} z0={S.z0} z1={S.z1} gaps={[{ side: 'S', from: g.x - 4.2, to: g.x + 4.2 }]} />
      </Merge>
      {[0, 2, 3, 5, 7, 9].map((k, i) => (
        <group key={k} position={[635.5 + k * 3, 0, 18.5]} rotation={[0, i % 2 ? 0 : Math.PI, 0]}>
          <Merge><CarModel color={['#F4F6FA', '#2D3445', '#B8C2D6', '#E45B4B', '#5D79E8', '#F4F6FA'][i]} kind={i % 3 ? 'sedan' : 'suv'} /></Merge>
        </group>
      ))}
      <Racks />
      <Roof />
      <SouthWallUpper />
    </group>
  )
}

/** 고층 랙: 기둥(파랑)·빔(주황)을 인스턴스로 */
function Racks() {
  const { uprights, beams } = useMemo(() => {
    const rows: { x: number }[] = []
    for (let k = 0; k < RACK.aisles; k++) for (let side = 0; side < 2; side++) rows.push({ x: locX(k, side) })
    const nU = rows.length * (RACK.bays + 1) * 2
    const nB = rows.length * RACK.bays * RACK.levels * 2
    const uprights = new THREE.InstancedMesh(unitBox, mat('#2F55E6', { rough: 0.5 }), nU)
    const beams = new THREE.InstancedMesh(unitBox, mat('#F08A24', { rough: 0.5 }), nB)
    const o = new THREE.Object3D()
    const H = levelY(RACK.levels - 1) + 1.9
    let iu = 0
    let ib = 0
    for (const r of rows) {
      for (let j = 0; j <= RACK.bays; j++) {
        const z = RACK.bayZ0 + RACK.bayPitch / 2 - RACK.bayPitch * j
        for (const dx of [-0.55, 0.55]) {
          o.position.set(r.x + dx, H / 2, z)
          o.scale.set(0.09, H, 0.09)
          o.updateMatrix()
          uprights.setMatrixAt(iu++, o.matrix)
        }
      }
      for (let j = 0; j < RACK.bays; j++) {
        for (let l = 0; l < RACK.levels; l++) {
          for (const dx of [-0.55, 0.55]) {
            o.position.set(r.x + dx, levelY(l) - 0.06, bayZ(j))
            o.scale.set(0.08, 0.12, RACK.bayPitch - 0.1)
            o.updateMatrix()
            beams.setMatrixAt(ib++, o.matrix)
          }
        }
      }
    }
    uprights.castShadow = beams.castShadow = true
    uprights.receiveShadow = beams.receiveShadow = true
    return { uprights, beams }
  }, [])
  return (
    <group>
      <primitive object={uprights} />
      <primitive object={beams} />
    </group>
  )
}

/** 남쪽 벽 윗부분(도크 위): 카메라가 가까이 오면 녹아 창고 안(랙·검수)이 보인다. 아랫부분(도크)은 그대로 */
function SouthWallUpper() {
  const controls = useThree((s) => s.controls) as unknown as CameraControlsImpl | null
  const sign = useRef<THREE.Group>(null)
  const m = useMemo(() => cutawayMaterial(new THREE.MeshStandardMaterial({ color: '#EEF1F7', roughness: 0.85 }), 'DJW'), [])
  const tmp = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    const view = useStore.getState().view
    const cam = controls?.camera
    let want = 0
    if (cam && view !== 'network') {
      cam.getWorldPosition(tmp)
      const d = Math.hypot(tmp.x - CX, tmp.y, tmp.z - CZ)
      want = THREE.MathUtils.clamp((150 - d) / 50, 0, 0.95)
    }
    const u = CUT_U.DJW
    u.value += (want - u.value) * 0.08
    if (Math.abs(want - u.value) < 0.002) u.value = want
    if (sign.current) sign.current.visible = u.value < 0.35
  })
  const h = B0.h - WALL_LOW
  return (
    <group>
      {/* 그림자 계산은 녹는 효과를 모르므로 그림자를 드리우지 않는다 */}
      <mesh geometry={unitBox} position={[CX, WALL_LOW + h / 2, B0.z1]} scale={[W, h, 0.4]} material={m} receiveShadow />
      <group ref={sign}>
        <B s={[W + 0.1, 1.1, 0.12]} p={[CX, B0.h - 1.2, B0.z1 + 0.25]} c={COLORS.brand} />
        <Decal tex={labelTex(tr('다온로지스 대전 중부허브 · DJ-07', 'Daejeon Central Hub · DJ-07'), '#2F55E6', '#FFFFFF', 900, 96)} w={22} h={2.35} p={[CX, B0.h - 2.6, B0.z1 + 0.32]} />
      </group>
    </group>
  )
}

/** 지붕 + 태양광: 카메라가 다가가면 녹아 사라진다 */
function Roof() {
  const controls = useThree((s) => s.controls) as unknown as CameraControlsImpl | null
  const group = useRef<THREE.Group>(null)
  const { roof, panel, edge } = useMemo(() => {
    const roof = cutawayMaterial(new THREE.MeshStandardMaterial({ color: '#C4CDE0', roughness: 0.8 }), 'DJ')
    const panel = cutawayMaterial(new THREE.MeshStandardMaterial({ map: solarTex(), roughness: 0.25, metalness: 0.3 }), 'DJ')
    const edge = cutawayMaterial(new THREE.MeshStandardMaterial({ color: '#9AA4B8', roughness: 0.6 }), 'DJ')
    return { roof, panel, edge }
  }, [])
  const tmp = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    const view = useStore.getState().view
    const cam = controls?.camera
    let want = 0
    if (cam && view !== 'network') {
      cam.getWorldPosition(tmp)
      const d = Math.hypot(tmp.x - CX, tmp.y, tmp.z - CZ)
      want = THREE.MathUtils.clamp((420 - d) / 160, 0, 1)
    }
    const u = CUT_U.DJ
    u.value += (want - u.value) * 0.08
    if (Math.abs(want - u.value) < 0.002) u.value = want
    if (group.current) group.current.visible = u.value < 0.995
  })
  return (
    <group ref={group}>
      {/* 합쳐도 재질 복제에 컷어웨이 키(userData.cut)가 따라가 녹는 효과가 유지된다 */}
      <Merge>
        <mesh geometry={unitBox} position={[CX, B0.h + 0.15, CZ]} scale={[W + 0.6, 0.3, D + 0.6]} material={roof} receiveShadow />
        {DJ_SOLAR.map(([x, z, w, d], i) => (
          <mesh key={i} geometry={unitBox} position={[x + w / 2, B0.h + 0.75, z + d / 2]} rotation={[-0.22, 0, 0]} scale={[w, 0.1, d]} material={panel} />
        ))}
        {[[CX, B0.z0], [CX, B0.z1]].map(([x, z], i) => <mesh key={i} geometry={unitBox} position={[x, B0.h + 0.5, z]} scale={[W + 0.6, 0.8, 0.3]} material={edge} />)}
        {[[B0.x0, CZ], [B0.x1, CZ]].map(([x, z], i) => <mesh key={`s${i}`} geometry={unitBox} position={[x, B0.h + 0.5, z]} scale={[0.3, 0.8, D + 0.6]} material={edge} />)}
      </Merge>
    </group>
  )
}

const LOAD_COLORS = ['#D9A86C', '#5D79E8', '#EEF1F7', '#6CC08B']

/** 창고 안 움직이는 것: 파렛트(인스턴스), 리치트럭, 도크 지게차 */
export function DaejeonLive() {
  const max = 1100
  const { base, load } = useMemo(() => {
    const base = new THREE.InstancedMesh(unitBox, mat('#B88A58', { rough: 0.85 }), max)
    const load = new THREE.InstancedMesh(unitBox, mat('#ffffff', { rough: 0.7 }), max)
    base.castShadow = load.castShadow = true
    load.receiveShadow = true
    base.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    load.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    const c = new THREE.Color()
    for (let i = 0; i < max; i++) load.setColorAt(i, c.set(LOAD_COLORS[i % 4]))
    return { base, load }
  }, [])
  const o = useMemo(() => new THREE.Object3D(), [])
  // 색은 미리 만들어 둔다(매 프레임 문자열 파싱 방지). 0~3 짐 색 · 4 검수 보류 · 5 검수 대기
  const colors = useMemo(() => [...LOAD_COLORS, '#E8705F', '#F2D27A'].map((h) => new THREE.Color(h)), [])
  const lastColor = useMemo(() => new Uint8Array(max).fill(255), [])
  const frame = useRef(0)
  const rts = useRef<(THREE.Group | null)[]>([])
  const rtMast = useRef<(THREE.Object3D | null)[]>([])
  const rtCarriage = useRef<(THREE.Object3D | null)[]>([])
  const fls = useRef<(THREE.Group | null)[]>([])
  const flCarriage = useRef<(THREE.Object3D | null)[]>([])
  const reach = sim.djwh.equip.filter((e) => e.kind === 'reach')
  const fl = sim.djwh.equip.filter((e) => e.kind === 'fl')
  useFrame(() => {
    // 대전을 보고 있지 않으면 30프레임에 한 번만(멀리서 보이는 정도면 충분)
    const st = useStore.getState()
    const focused = st.view === 'site' && st.site === 'DJ'
    if (!focused && frame.current++ % 30 !== 0) return
    let i = 0
    let colorDirty = false
    for (const p of sim.djwh.pallets.values()) {
      if (i >= max) break
      o.rotation.set(0, 0, 0)
      o.position.set(p.x, p.y + 0.08, p.z)
      o.scale.set(1.1, 0.15, 1.2)
      o.updateMatrix()
      base.setMatrixAt(i, o.matrix)
      o.position.set(p.x, p.y + 0.7, p.z)
      o.scale.set(1.0, 1.05, 1.1)
      o.updateMatrix()
      load.setMatrixAt(i, o.matrix)
      // 검수 보류는 붉게, 검수 대기는 노랗게 보인다
      const ci = p.state === 'lane-in' && p.qc === 'hold' ? 4 : p.state === 'lane-in' && p.qc !== 'ok' ? 5 : p.color
      if (lastColor[i] !== ci) {
        lastColor[i] = ci
        load.setColorAt(i, colors[ci])
        colorDirty = true
      }
      i++
    }
    base.count = load.count = i
    base.instanceMatrix.needsUpdate = load.instanceMatrix.needsUpdate = true
    if (colorDirty && load.instanceColor) load.instanceColor.needsUpdate = true
    refreshBounds(base)
    refreshBounds(load)
    reach.forEach((e, k) => {
      const g = rts.current[k]
      if (!g) return
      g.position.set(e.x, 0, e.z)
      g.rotation.y = e.heading
      const mast = rtMast.current[k]
      if (mast) mast.position.y = Math.max(0, e.fork - 1.2) * 0.9
      const car = rtCarriage.current[k]
      if (car) car.position.set(0, e.fork, 0.35 + e.reach * 1.1)
    })
    fl.forEach((e, k) => {
      const g = fls.current[k]
      if (!g) return
      g.position.set(e.x, 0, e.z)
      g.rotation.y = e.heading
      const car = flCarriage.current[k]
      if (car) car.position.y = e.fork
    })
  })
  return (
    <group>
      <primitive object={base} />
      <primitive object={load} />
      {reach.map((e, k) => (
        <group key={e.id} ref={(g) => { rts.current[k] = g }} {...pickHandlers({ kind: 'equip', id: e.id })}>
          <Merge>
            <ReachTruckModel mastRef={(m) => { rtMast.current[k] = m }} carriageRef={(m) => { rtCarriage.current[k] = m }} />
          </Merge>
        </group>
      ))}
      {fl.map((e, k) => (
        <group key={e.id} ref={(g) => { fls.current[k] = g }} {...pickHandlers({ kind: 'equip', id: e.id })}>
          <Merge>
            <ForkliftModel carriageRef={(m) => { flCarriage.current[k] = m }} />
          </Merge>
        </group>
      ))}
    </group>
  )
}

/** 리치트럭(10.5m 마스트): 운전석 뒤, 앞으로 뻗은 다리(아웃리거), 2단 마스트, 앞으로 나가는 포크 */
function ReachTruckModel({ mastRef, carriageRef }: { mastRef: (o: THREE.Object3D | null) => void; carriageRef: (o: THREE.Object3D | null) => void }) {
  const white = mat('#F4F6FA', { rough: 0.5 })
  const dark = mat('#22262F', { rough: 0.6 })
  return (
    <group>
      <mesh geometry={unitBox} position={[0, 0.7, -0.75]} scale={[1.15, 1.2, 1.3]} material={white} castShadow />
      <mesh geometry={unitBox} position={[0, 1.55, -0.9]} scale={[1.1, 0.5, 0.9]} material={dark} castShadow />
      <mesh geometry={unitBox} position={[0, 2.25, -0.75]} scale={[1.15, 0.08, 1.3]} material={dark} castShadow />
      {[0.5, -0.5].map((x) => (
        <mesh key={x} geometry={unitBox} position={[x, 1.6, -0.15]} scale={[0.06, 1.3, 0.06]} material={dark} />
      ))}
      {/* 아웃리거 */}
      {[0.45, -0.45].map((x) => (
        <mesh key={`o${x}`} geometry={unitBox} position={[x, 0.18, 0.55]} scale={[0.16, 0.22, 1.5]} material={white} castShadow />
      ))}
      <mesh geometry={unitBox} position={[0, 0.06, -1.42]} scale={[0.95, 0.12, 0.08]} material={mat('#E2453C')} />
      {/* 바깥 마스트 */}
      {[0.38, -0.38].map((x) => (
        <mesh key={`m${x}`} geometry={unitBox} position={[x, 1.6, 0.2]} scale={[0.1, 3.2, 0.12]} material={dark} castShadow />
      ))}
      {/* 안쪽 마스트(포크가 높이 올라가면 같이 올라간다) */}
      <group ref={mastRef} userData={{ dynamic: true }}>
        {[0.3, -0.3].map((x) => (
          <mesh key={`i${x}`} geometry={unitBox} position={[x, 1.9, 0.28]} scale={[0.08, 3.4, 0.1]} material={mat('#3A4152')} castShadow />
        ))}
        <mesh geometry={unitBox} position={[0, 3.6, 0.28]} scale={[0.7, 0.1, 0.1]} material={mat('#3A4152')} />
      </group>
      <group ref={carriageRef} userData={{ dynamic: true }}>
        <mesh geometry={unitBox} position={[0, 0.35, -0.02]} scale={[0.9, 0.7, 0.06]} material={mat('#4A5162')} castShadow />
        {[0.28, -0.28].map((x) => (
          <mesh key={`f${x}`} geometry={unitBox} position={[x, 0.02, 0.6]} scale={[0.12, 0.05, 1.15]} material={mat('#4A5162')} castShadow />
        ))}
      </group>
    </group>
  )
}
