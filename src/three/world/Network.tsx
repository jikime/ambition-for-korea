// 이천 FC · 인천 서브터미널 · 다온마을 · 부산신항 · 간선도로 소품(정적 장면)
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { ContainerShip } from '../models/ship'
import { GlowPools } from './Roadside'
import { B, COLORS, Flat, cylGeo, mat, unitPlane } from '../kit'
import { GroundPaint, GroundPaints, hazardMat, walkMat } from '../models/structures'
import { canvasTex, paintTex } from '../textures'
import { Fence } from './Vegetation'
import { CarModel, ChassisModel, Container40, TractorModel } from '../models/vehicles'
import { ParcelLocker, AptBlock, BusStop, Canopy, ControlTower, FulfillmentCenter, GuardHouse, LightTower, OcrPortal, PickStation, Playground, ReachStacker, ReeferRack, RollerLine, Sea, ShopRow, SignGantry, SmallOffice, SortLine, Villa, XrayPortal } from '../models/sites'
import { Merge } from '../merge'
import { BS, IC, IN, IN_SLOTS, TW } from '../../sim/sites'
import * as L from '../../sim/layout'
import { L as tr } from '../../i18n'
import { mulberry32 } from '../../sim/data'
import { useStore } from '../../store'
import { sim } from '../../sim/sim'
import { PORT, VESSELS } from '../../sim/port'
import { RAIL } from '../../sim/rail'
import { RailTrack } from '../models/rail'

const roadMat = () => {
  const m = mat(COLORS.road, { rough: 0.95 })
  m.userData.snow = 0.35
  return m
}
const line = () => mat('#FFFFFF', { rough: 0.9 })
const yellow = () => mat(COLORS.yellow, { rough: 0.9 })

function Road({ x0, x1, z0, z1, center }: { x0: number; x1: number; z0: number; z1: number; center?: 'x' | 'z' }) {
  return (
    <group>
      <Flat s={[x1 - x0, z1 - z0]} p={[(x0 + x1) / 2, (z0 + z1) / 2]} m={roadMat()} y={0.016} />
      {center === 'x' && <Flat s={[x1 - x0 - 4, 0.14]} p={[(x0 + x1) / 2, (z0 + z1) / 2]} m={line()} y={0.03} />}
      {center === 'z' && <Flat s={[0.14, z1 - z0 - 4]} p={[(x0 + x1) / 2, (z0 + z1) / 2]} m={line()} y={0.03} />}
    </group>
  )
}

function Zebra({ x, z, along, n = 8, len = 3.6 }: { x: number; z: number; along: 'x' | 'z'; n?: number; len?: number }) {
  return (
    <group>
      {Array.from({ length: n }, (_, i) => {
        const o = (i - (n - 1) / 2) * 1.4
        return along === 'x'
          ? <Flat key={i} s={[0.7, len]} p={[x + o, z]} m={line()} y={0.034} />
          : <Flat key={i} s={[len, 0.7]} p={[x, z + o]} m={line()} y={0.034} />
      })}
    </group>
  )
}

function Outline({ x0, x1, z0, z1, color = COLORS.yellow, w = 0.16 }: { x0: number; x1: number; z0: number; z1: number; color?: string; w?: number }) {
  const m = mat(color, { rough: 0.9 })
  return (
    <group>
      <Flat s={[x1 - x0, w]} p={[(x0 + x1) / 2, z0]} m={m} y={0.03} />
      <Flat s={[x1 - x0, w]} p={[(x0 + x1) / 2, z1]} m={m} y={0.03} />
      <Flat s={[w, z1 - z0]} p={[x0, (z0 + z1) / 2]} m={m} y={0.03} />
      <Flat s={[w, z1 - z0]} p={[x1, (z0 + z1) / 2]} m={m} y={0.03} />
    </group>
  )
}

// ───────────────────────── 이천 풀필먼트센터

/** 로봇 구역 바닥 QR 표식(3m 격자): 인스턴스 하나 */
function QrDots() {
  const mesh = useMemo(() => {
    const xs = Array.from({ length: Math.round((IC.amr.x1 - IC.amr.x0) / IC.amr.step) + 1 }, (_, i) => IC.amr.x0 + i * IC.amr.step + 1.5)
    const zs = Array.from({ length: Math.round((IC.amr.z1 - IC.amr.z0) / IC.amr.step) + 2 }, (_, j) => IC.amr.z0 - 1.5 + j * IC.amr.step)
    const m = new THREE.InstancedMesh(unitPlane, mat('#2B3142', { rough: 0.9 }), xs.length * zs.length)
    const o = new THREE.Object3D()
    let k = 0
    for (const x of xs)
      for (const z of zs) {
        o.position.set(x, 0.065, z)
        o.scale.set(0.32, 1, 0.32)
        o.updateMatrix()
        m.setMatrixAt(k++, o.matrix)
      }
    m.receiveShadow = true
    return m
  }, [])
  return <primitive object={mesh} />
}

export function IcheonStatic({ refs }: { refs?: { reefers: (THREE.Object3D | null)[]; docks: number[] } }) {
  const S = IC.site
  return (
    <group>
      <QrDots />
      <Merge>
        <Flat s={[S.x1 - S.x0, S.z1 - S.z0]} p={[(S.x0 + S.x1) / 2, (S.z0 + S.z1) / 2]} c={COLORS.pad} y={0.008} />
        <Flat s={[S.x1 - S.x0, 2.4]} p={[(S.x0 + S.x1) / 2, S.z1 + 1.3]} c={COLORS.lawn} y={0.012} />
        <Road x0={IC.entry.x - 3.5} x1={IC.entry.x + 3.5} z0={16} z1={L.MAIN.z0} center="z" />
        <Road x0={IC.yard.x0} x1={IC.yard.x1} z0={IC.yard.z - 3.5} z1={IC.yard.z + 3.5} center="x" />
        <Flat s={[136, 31]} p={[452.5, 0.5]} c="#E8ECF4" y={0.012} />
        {IC.bays.map((bx, i) => (
          <group key={bx}>
            <Outline x0={bx - 1.8} x1={bx + 1.8} z0={IC.bayZ - 5.4} z1={IC.bayZ + 5.6} />
            <GroundPaint tex={paintTex(tr(`상차 ${i + 1}`, `Load ${i + 1}`), '#F2C233')} w={3.2} h={1.6} p={[bx, IC.bayZ + 7.4]} />
          </group>
        ))}
        {IC.reeferDocks.map((dx) => (
          <group key={dx}>
            <Flat s={[0.16, 11]} p={[dx - 1.7, -9.5]} m={yellow()} y={0.03} />
            <Flat s={[0.16, 11]} p={[dx + 1.7, -9.5]} m={yellow()} y={0.03} />
          </group>
        ))}
        <Flat s={[60, 0.14]} p={[440, IC.corridorZ - 1.4]} m={yellow()} y={0.03} />
        <Flat s={[60, 0.14]} p={[440, IC.corridorZ + 1.4]} m={yellow()} y={0.03} />
        <Flat s={[3.4, 4]} p={[IC.charger.x, -12.6]} c="#D5F0DF" y={0.02} />
        <FulfillmentCenter b={IC.building} glassX1={IC.glassX1} refs={refs} />
        {IC.lines.map((x) => <RollerLine key={x} x={x} z0={IC.wallZ - 1} z1={-0.4} y={IC.rollerY} />)}
        {/* AMR 구역 바닥 격자 */}
        {Array.from({ length: 10 }, (_, i) => IC.amr.z0 - 1.5 + i * IC.amr.step * 4 / 1.33).filter((z) => z < IC.amr.z1 + 2).map((z) => (
          <Flat key={z} s={[IC.amr.x1 - IC.amr.x0 + 4, 0.08]} p={[(IC.amr.x0 + IC.amr.x1) / 2, z]} c="#C9D2E6" y={0.06} />
        ))}
        {IC.stations.map((x) => (
          <group key={x} position={[x, 0, IC.stationZ]}>
            <PickStation />
          </group>
        ))}
        <B s={[60, 0.7, 1.0]} p={[422, 0.5, -24]} c="#C3CAD8" />
        <B s={[60, 0.06, 0.8]} p={[422, 0.88, -24]} c="#3B4252" />
        {/* 로봇 전용 구역: 빨간 경계선 · QR 바닥 표식 */}
        <Outline x0={IC.amr.x0 - 3.2} x1={IC.amr.x1 + 3.2} z0={IC.amr.z0 - 3.2} z1={IC.stationZ - 1.9} color="#E8453C" w={0.22} />
        <GroundPaint tex={paintTex(tr('로봇 구역 · 출입 금지', 'Robots · No entry'), '#E8453C', 512, 96)} w={7.2} h={1.35} p={[IC.amr.x1 - 1, IC.stationZ - 3.2]} />
        <group position={[400, 0, 28.5]}>
          <SmallOffice w={14} d={6} label="이천 FC 사무동" />
        </group>
        {/* 사무동 ↔ 센터 보행로(초록) + 야드 횡단보도 */}
        <Flat s={[1.6, 25.3 - 23.6]} p={[390.5, (25.3 + 23.6) / 2]} m={walkMat()} y={0.022} />
        <Flat s={[1.6, 16.4 - -14.6]} p={[390.5, (16.4 + -14.6) / 2]} m={walkMat()} y={0.022} />
        <Zebra x={390.5} z={IC.yard.z} along="z" n={5} len={2.4} />
        <GroundPaint tex={paintTex(tr('보행로', 'Walk'), '#FFFFFF')} w={1.4} h={0.7} p={[390.5, 8]} rot={Math.PI / 2} opacity={0.9} />
        <Fence x0={S.x0} x1={S.x1} z0={S.z0} z1={S.z1} gaps={[{ side: 'S', from: IC.entry.x - 3.6, to: IC.entry.x + 3.6 }]} />
      </Merge>
    </group>
  )
}

// ───────────────────────── 인천 서브터미널

export function IncheonStatic() {
  const S = IN.site
  const C = IN.conv
  return (
    <Merge>
      <Flat s={[S.x1 - S.x0, S.z1 - S.z0]} p={[(S.x0 + S.x1) / 2, (S.z0 + S.z1) / 2]} c={COLORS.pad} y={0.008} />
      <Flat s={[S.x1 - S.x0, 2.4]} p={[(S.x0 + S.x1) / 2, S.z1 + 1.3]} c={COLORS.lawn} y={0.012} />
      <Road x0={IN.entry.x - 3.5} x1={IN.entry.x + 3.5} z0={-48} z1={L.MAIN.z0} center="z" />
      <Road x0={-514} x1={IN.entry.x - 3.5} z0={-40} z1={-35} />
      <Road x0={-514} x1={IN.entry.x - 3.5} z0={-17} z1={-12} />
      <Flat s={[25, 22]} p={[-407, -26]} c="#E8ECF4" y={0.013} />
      {IN.docks.map((dz, i) => (
        <group key={dz}>
          <Flat s={[12, 0.16]} p={[-412, dz - 1.7]} m={yellow()} y={0.03} />
          <Flat s={[12, 0.16]} p={[-412, dz + 1.7]} m={yellow()} y={0.03} />
          <GroundPaint tex={paintTex(tr(`간선 ${i + 1}`, `Bay ${i + 1}`), '#FFFFFF')} w={3} h={1.5} p={[-403, dz]} rot={Math.PI / 2} opacity={0.85} />
          <Flat s={[0.5, 3.4]} p={[IN.dockRearX + 0.45, dz]} m={hazardMat()} y={0.034} />
        </group>
      ))}
      {IN_SLOTS.map((s, i) => {
        const z0 = s.side === 'N' ? IN.vanNRear - 5.4 : IN.vanSRear
        const z1 = s.side === 'N' ? IN.vanNRear : IN.vanSRear + 5.4
        return (
          <group key={i}>
            <Flat s={[0.14, 5.4]} p={[s.x - 2.9, (z0 + z1) / 2]} m={line()} y={0.03} />
            <Flat s={[0.14, 5.4]} p={[s.x + 2.9, (z0 + z1) / 2]} m={line()} y={0.03} />
          </group>
        )
      })}
      <Canopy x0={IN.canopy.x0} x1={IN.canopy.x1} z0={IN.canopy.z0} z1={IN.canopy.z1} label={tr('인천 서브터미널 · IN-05', 'Incheon Sub-terminal · IN-05')} />
      <SortLine x0={C.x0} x1={C.x1} z={C.z} y={C.y} chutes={IN.vanXs} sorterX0={IN.sorterX0} sorterX1={IN.sorterX1} scannerX={IN.scannerX} />
      <group position={[-470, 0, 14]}>
        <SmallOffice w={16} d={7} label="인천 서브터미널" />
      </group>
      <group position={[-505, 0, 14]}>
        <SmallOffice w={10} d={7} floors={1} label="기사 휴게실" />
      </group>
      {/* 기사 휴게실 ↔ 분류장 보행로(초록) + 횡단보도 */}
      <Flat s={[1.6, 10.6 - -12]} p={[-509.5, (10.6 + -12) / 2]} m={walkMat()} y={0.022} />
      <Flat s={[1.6, -17 - -24.5]} p={[-509.5, (-17 + -24.5) / 2]} m={walkMat()} y={0.022} />
      <Zebra x={-509.5} z={-14.5} along="z" n={4} len={2.4} />
      <GroundPaint tex={paintTex(tr('보행로', 'Walk'), '#FFFFFF')} w={1.4} h={0.7} p={[-509.5, 4]} rot={Math.PI / 2} opacity={0.9} />
      <Fence x0={S.x0} x1={S.x1} z0={S.z0} z1={S.z1} gaps={[{ side: 'S', from: IN.entry.x - 3.6, to: IN.entry.x + 3.6 }]} />
    </Merge>
  )
}

// ───────────────────────── 다온마을(배송 구역)

export function TownStatic() {
  const R = TW.road
  const cars = useMemo(() => {
    const r = mulberry32(5)
    const colors = ['#F4F6FA', '#2D3445', '#B8C2D6', '#5D79E8', '#E45B4B', '#F4F6FA']
    const out: { x: number; z: number; rot: number; c: string; k: 'sedan' | 'suv' }[] = []
    for (const x of [-430, -452, -467, -490, -508, -530]) {
      out.push({ x, z: 141.5, rot: 0, c: colors[Math.floor(r() * colors.length)], k: r() < 0.4 ? 'suv' : 'sedan' })
      if (r() < 0.7) out.push({ x: x + 4, z: 158.5, rot: Math.PI, c: colors[Math.floor(r() * colors.length)], k: r() < 0.4 ? 'suv' : 'sedan' })
    }
    return out
  }, [])
  return (
    <Merge>
      {/* 도로 */}
      <Road x0={R.x - 3.5} x1={R.x + 3.5} z0={L.MAIN.z1} z1={R.z1} center="z" />
      <Flat s={[20, 18]} p={[R.x, 258]} m={roadMat()} y={0.017} />
      <Road x0={TW.apt.x1 + 4} x1={R.x - 3.5} z0={TW.apt.roadZ - 3} z1={TW.apt.roadZ + 3} center="x" />
      <mesh geometry={cylGeo(9, 9, 0.02, 32)} position={[-546, 0.018, TW.apt.roadZ]} material={roadMat()} receiveShadow />
      <Zebra x={R.x} z={L.MAIN.z1 + 4} along="x" n={5} len={3} />
      {[R.x - 10, R.x + 10].map((x) => (
        <group key={x}>
          {Array.from({ length: 9 }, (_, i) => (
            <Flat key={i} s={[3, 0.7]} p={[x, L.MAIN.z0 + 1.2 + i * 1.5]} m={line()} y={0.034} />
          ))}
        </group>
      ))}
      <Flat s={[0.4, 7]} p={[R.x - 3, L.MAIN.z1 + 1]} m={line()} y={0.034} />
      {/* 아파트 단지 */}
      <Flat s={[158, 142]} p={[-481, 152]} c="#E9EEE6" y={0.01} />
      <Flat s={[150, 3]} p={[-478, 140.5]} c="#DDE3EF" y={0.014} />
      <Flat s={[150, 3]} p={[-478, 159.5]} c="#DDE3EF" y={0.014} />
      {TW.northRow.map((x, i) => (
        <group key={`n${x}`} position={[x, 0, TW.northZ]}>
          <AptBlock h={24 + i * 3} label={`${101 + i}동`} />
        </group>
      ))}
      {TW.southRow.map((x, i) => (
        <group key={`s${x}`} position={[x, 0, TW.southZ]} rotation={[0, Math.PI, 0]}>
          <AptBlock h={27 - i * 2} label={`${104 + i}동`} />
        </group>
      ))}
      {/* 동마다 경비실·무인택배함(배송 메모에 따라 기사가 찾아간다) */}
      {TW.northRow.flatMap((x) => [
        <group key={`ng${x}`} position={[x + 7, 0, TW.northZ + 9]} scale={0.7}><GuardHouse /></group>,
        <group key={`nl${x}`} position={[x - 7, 0, TW.northZ + 6.2]} rotation={[0, Math.PI, 0]} scale={0.7}><ParcelLocker /></group>,
      ])}
      {TW.southRow.flatMap((x) => [
        <group key={`sg${x}`} position={[x + 7, 0, TW.southZ - 9]} scale={0.7}><GuardHouse /></group>,
        <group key={`sl${x}`} position={[x - 7, 0, TW.southZ - 6.2]} scale={0.7}><ParcelLocker /></group>,
      ])}
      {TW.northRow.map((x, i) => (
        <group key={`b${x}`} position={[x, 0, 204]} rotation={[0, Math.PI, 0]}>
          <AptBlock h={22 + i * 2} label={`${107 + i}동`} />
        </group>
      ))}
      {TW.northRow.map((x, i) => (
        <group key={`f${x}`} position={[x, 0, 100]}>
          <AptBlock h={20 + i * 2} label={`${110 + i}동`} />
        </group>
      ))}
      <group position={[TW.guard.x - 2, 0, TW.guard.z - 1]}>
        <GuardHouse />
      </group>
      <group position={[TW.locker.x, 0, TW.locker.z]}>
        <ParcelLocker />
      </group>
      <group position={[TW.locker.x - 1, 0, TW.locker.z + 6]} rotation={[0, Math.PI, 0]}>
        <SmallOffice w={10} d={6} floors={1} label="관리사무소" />
      </group>
      <group position={[-470, 0, 187]}>
        <Playground />
      </group>
      {cars.map((c, i) => (
        <group key={i} position={[c.x, 0, c.z]} rotation={[0, c.rot + Math.PI / 2, 0]}>
          <CarModel color={c.c} kind={c.k} />
        </group>
      ))}
      {/* 빌라 · 상가 */}
      {TW.villas.map((z, i) => (
        <group key={z} position={[TW.villaX, 0, z]}>
          <Villa name={['다솜하우스', '해밀빌', '다온캐슬', '초록빌라'][i]} color={['#EDE6DC', '#E6E9F2', '#F0E7DA', '#E4EDE6'][i]} />
          <group position={[1, 0, 2]} rotation={[0, Math.PI / 2, 0]}>
            <CarModel color={['#5D79E8', '#F4F6FA', '#2D3445', '#B8C2D6'][i]} />
          </group>
        </group>
      ))}
      <group position={[-372, 0, TW.store.z]}>
        <ShopRow />
      </group>
      <group position={[-420, 0, L.MAIN.z1 + 2.2]}>
        <BusStop name="다온마을 입구" />
      </group>
    </Merge>
  )
}

// ───────────────────────── 부산신항(자동화 터미널)

/** 묘박지 자리(다음 차례 배 2척) */
const ANCHOR_SPOTS = [
  { x: 300, z: 520, rot: 0.25, len: 150, colors: ['#1F9C9A', '#E07A35', '#2F55E6', '#8A94A8'] },
  { x: 520, z: 610, rot: -0.15, len: 136, colors: ['#E07A35', '#D9C7B0', '#5D79E8', '#C9472B'] },
]

/** 선석의 배: 출항·입항 때 바다 쪽(+z)으로 움직인다. 배가 바뀌면 선명·선체 색이 바뀐다 */
function BerthShip() {
  useStore((s) => s.tick)
  const ref = useRef<THREE.Group>(null)
  const vessel = sim.port.berth.vessel
  useFrame(() => {
    if (ref.current) ref.current.position.z = BS.ship.z + sim.port.berth.offset
  })
  const V = VESSELS[vessel]
  return (
    <group ref={ref} position={[(BS.ship.x0 + BS.ship.x1) / 2, 0, BS.ship.z]}>
      <Merge key={vessel} flat>
        <ContainerShip len={BS.ship.x1 - BS.ship.x0} deckY={PORT.deckY} bays={PORT.bays.map((x) => x - (BS.ship.x0 + BS.ship.x1) / 2)} name={V.name} hull={V.hull} />
      </Merge>
    </group>
  )
}

/** 묘박지: 다음 두 차례 배(선석 배가 바뀌면 차례도 바뀐다) */
function Anchored() {
  useStore((s) => s.tick)
  const vessel = sim.port.berth.vessel
  const next = [VESSELS[(vessel + 1) % VESSELS.length], VESSELS[(vessel + 2) % VESSELS.length]]
  return (
    <Merge key={vessel} flat>
      {ANCHOR_SPOTS.map((a, i) => (
        <group key={i} position={[a.x, 0, a.z]} rotation={[0, a.rot, 0]}>
          <ContainerShip len={a.len} deckY={PORT.deckY} name={next[i].name} hull={next[i].hull} />
          {Array.from({ length: Math.floor(a.len / 14) - 2 }, (_, j) => (
            <group key={j} position={[-a.len / 2 + 22 + j * 13, PORT.deckY + 0.4, 0]}>
              {[0, 1, 2].map((t) => (
                <B key={t} s={[12, 2.6, 24]} p={[0, 1.3 + t * 2.6, 0]} c={a.colors[(j + t) % a.colors.length]} />
              ))}
            </group>
          ))}
        </group>
      ))}
    </Merge>
  )
}

export function PortStatic() {
  const S = BS.site
  const P = PORT
  return (
    <group>
      <Merge>
        <Flat s={[S.x1 - S.x0, S.z1 - S.z0]} p={[(S.x0 + S.x1) / 2, (S.z0 + S.z1) / 2]} c="#E3E6EE" y={0.008} />
        {/* 반출입 차로 · 게이트 */}
        <Road x0={BS.entry.x - 3.5} x1={BS.entry.x + 3.5} z0={L.MAIN.z1} z1={BS.truckLane + 3.5} center="z" />
        <Road x0={BS.entry.x - 3.5} x1={BS.loopX + 3.5} z0={BS.truckLane - 3.5} z1={BS.truckLane + 3.5} center="x" />
        <Road x0={BS.entry.x - 3.5} x1={BS.loopX + 3.5} z0={BS.exitLane - 3.5} z1={BS.exitLane + 3.5} center="x" />
        <Road x0={BS.loopX - 3.5} x1={BS.loopX + 3.5} z0={BS.exitLane - 3.5} z1={BS.truckLane + 3.5} />
        {/* AGV 작업 구역(무인 구역) */}
        <Flat s={[200, 46]} p={[255, 277]} c="#DCE3F3" y={0.011} />
        <Flat s={[190, 0.25]} p={[255, P.laneIn]} c="#9DB0E8" y={0.03} />
        <Flat s={[190, 0.25]} p={[255, P.laneOut]} c="#9DB0E8" y={0.03} />
        <GroundPaint tex={paintTex(tr('AGV 전용 · 무인 구역', 'AGV-only zone'), '#5B7CFF', 512, 96)} w={14} h={2.6} p={[160, 266]} rot={Math.PI} opacity={0.8} />
        {/* 안벽 · 크레인 레일 */}
        <B s={[S.x1 - S.x0 + 60, 1.2, 6]} p={[(S.x0 + S.x1) / 2 + 30, 0, BS.quayZ + 3]} c="#C9CFDC" />
        <Flat s={[S.x1 - S.x0 + 60, 0.4]} p={[(S.x0 + S.x1) / 2 + 30, BS.quayZ + 5.6]} m={yellow()} y={0.62} />
        <Flat s={[220, 0.3]} p={[255, 286]} c="#8C96AA" y={0.03} />
        <Flat s={[220, 0.3]} p={[255, 300]} c="#8C96AA" y={0.03} />
        {/* 야드 블록(안벽과 직각) · ARMG 레일 */}
        {P.blocks.map((bx, b) => (
          <group key={bx}>
            <Outline x0={bx - 7} x1={bx + 7} z0={P.blockBays[0] - 7} z1={P.blockBays[P.blockBays.length - 1] + 7} color="#FFFFFF" w={0.18} />
            <Flat s={[0.35, 172]} p={[bx - 9, 180]} c="#8C96AA" y={0.03} />
            <Flat s={[0.35, 172]} p={[bx + 9, 180]} c="#8C96AA" y={0.03} />
            {b === 3 && <Flat s={[14, 132]} p={[bx, 184]} c="#FBE3D6" y={0.02} />}
            <GroundPaint tex={paintTex([tr('A 냉동', 'A Reefer'), tr('B 일반', 'B General'), tr('C 일반', 'C General'), tr('D 위험물', 'D Hazmat')][b], b === 3 ? '#E2463C' : b === 0 ? '#13A39A' : '#5B6B90', 384, 96)} w={7} h={1.75} p={[bx, 108]} rot={Math.PI} opacity={0.9} />
          </group>
        ))}
        <group position={[P.blocks[0] - 8.2, 0, 184]}>
          <ReeferRack length={130} />
        </group>
        {[176, 192, 208].map((z) => (
          <group key={z} position={[P.blocks[3] + 8.4, 0, z]} rotation={[0, -Math.PI / 2, 0]}>
            <B s={[1.6, 1.6, 0.08]} p={[0, 2.2, 0]} r={[0, 0, Math.PI / 4]} c="#E2463C" />
            <B s={[0.1, 2.2, 0.1]} p={[0, 1.1, 0]} c="#9AA4B8" />
          </group>
        ))}
        <group position={[BS.xrayX, 0, BS.exitLane]} rotation={[0, Math.PI / 2, 0]}>
          <XrayPortal />
        </group>
        <group position={[BS.entry.x, 0, 72]}>
          <OcrPortal width={10} />
        </group>
        <group position={[146, 0, 82]}>
          <SmallOffice w={16} d={8} floors={3} label="부산신항 운영동" />
        </group>
        <BsLandside />
        <group position={[140, 0, 268]}>
          <ControlTower />
        </group>
        {[[140, 140], [140, 220], [362, 140], [362, 230], [190, 288], [320, 288]].map(([x, z], i) => (
          <group key={i} position={[x, 0, z]}>
            <LightTower />
          </group>
        ))}
        <group position={[338, 0, 118]} rotation={[0, -0.4, 0]}>
          <ReachStacker />
        </group>
        <Fence x0={S.x0} x1={S.x1} z0={S.z0} z1={BS.quayZ - 1} gaps={[{ side: 'N', from: BS.entry.x - 3.6, to: BS.entry.x + 3.6 }]} open={['S']} />
      </Merge>
      {/* 선석의 배(출항·입항 때 바다 쪽으로 움직임)와 묘박지에서 다음 차례를 기다리는 배 2척 */}
      <BerthShip />
      <Anchored />
      <GlowPools spots={[[140, 140, 50], [140, 220, 50], [362, 140, 50], [362, 230, 50], [190, 280, 50], [320, 280, 50]]} />
      <Sea x0={100} x1={1300} z0={BS.quayZ + 4} z1={1400} />
    </group>
  )
}

/**
 * 부산신항 정문 밖 트럭 대기장(반입 예약 순번을 기다리는 트레일러)과 세관 검사동 · 검색 차로 노면 글자
 * (항만 관제 영상 분석 3순위). 모두 정적이라 PortStatic의 Merge에 함께 들어간다.
 */
function BsLandside() {
  const stalls = [0, 1, 2, 4, 5, 7, 8]
  const boxes: [string, string][] = [['#1F9C9A', 'HANMAR'], ['#E07A35', 'SEOHAE'], ['#2F55E6', 'DAON']]
  const carriers = ['hangil', 'donghae', 'baro'] as const
  return (
    <group>
      {/* 간선에서 대기장으로 들어가는 길과 포장 */}
      <Road x0={70} x1={78} z0={L.MAIN.z1} z1={76} center="z" />
      <Flat s={[48, 50]} p={[90, 97]} c="#D2D7E2" y={0.012} />
      {Array.from({ length: 10 }, (_, i) => (
        <Flat key={i} s={[0.18, 20]} p={[69.6 + i * 4.8, 94]} c="#FFFFFF" y={0.024} />
      ))}
      <Flat s={[43.2, 0.18]} p={[91.2, 84]} c="#FFFFFF" y={0.024} />
      <GroundPaint tex={paintTex(tr('트럭 대기장 · 순번 호출', 'Truck queue'), '#5B6B90', 512, 96)} w={14} h={2.6} p={[82, 79]} rot={Math.PI} opacity={0.85} />
      {stalls.map((k, i) => {
        const x = 72 + k * 4.8
        const [c, n] = boxes[i % boxes.length]
        return (
          <group key={k}>
            <group position={[x, 0, 87]} rotation={[0, Math.PI, 0]}>
              <TractorModel carrier={carriers[i % carriers.length]} />
            </group>
            <group position={[x, 0, 94.3]} rotation={[0, Math.PI, 0]}>
              <ChassisModel />
              <group position={[0, 1.28, 0]}>
                <Container40 color={c} name={n} />
              </group>
            </group>
          </group>
        )
      })}
      <group position={[109, 0, 73]} rotation={[0, Math.PI, 0]}>
        <SmallOffice w={8} d={4.5} floors={1} label="트럭 대기장" />
      </group>
      {/* 세관 검사동 · 검색 차로 */}
      <group position={[326, 0, 71.5]}>
        <SmallOffice w={18} d={7} floors={2} label="세관 검사동" />
      </group>
      <GroundPaint tex={paintTex(tr('검색 차로 · 세관 X-ray', 'Customs X-ray lane'), '#E2463C', 640, 96)} w={13} h={2} p={[322, BS.exitLane]} rot={Math.PI} opacity={0.85} />
      <Outline x0={BS.xrayX - 9} x1={BS.xrayX + 9} z0={BS.exitLane - 3} z1={BS.exitLane + 3} color="#F2C233" w={0.3} />
    </group>
  )
}

/** 부산신항 철송장(정적): 본선(지도 밖 동쪽 내륙 기지 방면)·RMG 레일·포장·트랙터 차로·운영 사무동·조명탑 */
export function RailYardStatic() {
  return (
    <Merge>
      <RailTrack x0={RAIL.x0 - 6} x1={1300} z={RAIL.z} />
      {/* 철송장 포장 · RMG 레일 · 트랙터 차로(장치 줄과 선로 사이) */}
      <Flat s={[RAIL.x1 - RAIL.x0 + 20, RAIL.rmgZ1 - RAIL.rmgZ0 + 10]} p={[(RAIL.x0 + RAIL.x1) / 2, (RAIL.rmgZ0 + RAIL.rmgZ1) / 2]} c="#DCE0E8" y={0.012} />
      {[RAIL.rmgZ0, RAIL.rmgZ1].map((z) => (
        <Flat key={z} s={[RAIL.x1 - RAIL.x0 + 10, 0.35]} p={[(RAIL.x0 + RAIL.x1) / 2, z]} c="#8C96AA" y={0.03} />
      ))}
      <Flat s={[RAIL.x1 - RAIL.x0, 0.2]} p={[(RAIL.x0 + RAIL.x1) / 2, 281]} c="#FFFFFF" y={0.03} />
      <Flat s={[RAIL.x1 - RAIL.x0, 0.2]} p={[(RAIL.x0 + RAIL.x1) / 2, 286.5]} c="#FFFFFF" y={0.03} />
      <GroundPaint tex={paintTex(tr('철송장 · 트랙터 차로', 'Rail · Tractor lane'), '#5B6B90', 512, 96)} w={13} h={2.4} p={[RAIL.x1 - 20, 283.8]} rot={Math.PI} opacity={0.8} />
      <group position={[RAIL.x0 + 20, 0, 255]}>
        <SmallOffice w={14} d={7} floors={2} label="부산신항 철송장" />
      </group>
      {[[RAIL.x0 + 60, 262], [RAIL.x1 - 30, 262]].map(([x, z]) => (
        <group key={x} position={[x, 0, z]}>
          <LightTower h={22} />
        </group>
      ))}
    </Merge>
  )
}

// ───────────────────────── 곤지암 CY · 간선도로 소품

export function GonjiamExtras() {
  const C = L.CY
  return (
    <Merge>
      <Flat s={[C.x1 - C.x0, C.z1 - C.z0]} p={[(C.x0 + C.x1) / 2, (C.z0 + C.z1) / 2]} c="#E3E6EE" y={0.011} />
      <Road x0={L.ENTRY.x + 3.5} x1={C.turnX + 3.5} z0={C.laneZ - 3} z1={C.laneZ + 3} />
      <Road x0={C.turnX - 3} x1={C.turnX + 3} z0={C.backZ - 3} z1={C.laneZ + 3} />
      <Road x0={L.ENTRY.x + 3.5} x1={C.turnX + 3} z0={C.backZ - 3} z1={C.backZ + 3} />
      <Outline x0={C.x0 + 3} x1={C.x1 - 8} z0={-21} z1={10} />
      <GroundPaint tex={paintTex(tr('컨테이너 야적장 CY', 'Container yard'), '#F2C233', 512, 96)} w={8} h={1.5} p={[85, 21]} opacity={0.85} />
      <group position={[93.5, 0, -6]} rotation={[0, Math.PI, 0]}>
        <ReachStacker />
      </group>
    </Merge>
  )
}

/** 맨홀 뚜껑(무늬 원판) */
function manholeTex() {
  return canvasTex('manhole', 64, 64, (ctx) => {
    ctx.clearRect(0, 0, 64, 64)
    ctx.fillStyle = '#4A505C'
    ctx.beginPath()
    ctx.arc(32, 32, 30, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#6B7282'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(32, 32, 24, 0, Math.PI * 2)
    ctx.stroke()
    ctx.lineWidth = 2
    for (let k = -16; k <= 16; k += 8) {
      ctx.beginPath()
      ctx.moveTo(32 + k, 12)
      ctx.lineTo(32 + k, 52)
      ctx.stroke()
    }
  })
}

/** 간선도로: 표지판·가로등(인스턴스)·지방도 */
export function HighwayProps() {
  return (
    <group>
      <Merge>
        <group position={[-250, 0, L.MAIN.z - 3.5]}>
          <SignGantry text={tr('← 인천 · 서울', '← Incheon · Seoul')} sub={tr('IN-05 인천 서브터미널 12 km', 'IN-05 Incheon Sub-terminal 12 km')} span={8} />
        </group>
        <group position={[250, 0, L.MAIN.z + 3.5]} rotation={[0, Math.PI, 0]}>
          <SignGantry text={tr('이천 · 대전 →', 'Icheon·Daejeon →')} sub={tr('IC-03 이천 FC 8 km · 부산신항', 'IC-03 Icheon FC 8 km · Busan New Port')} span={8} />
        </group>
        <Road x0={-63.5} x1={-56.5} z0={L.MAIN.z1} z1={290} center="z" />
        <group position={[-52, 0, 70]} rotation={[0, -Math.PI / 2, 0]}>
          <SignGantry text={tr('↓ 광주 시내', '↓ Gwangju city')} sub={tr('곤지암 배송 1톤 출발', 'Gonjiam 1-ton van departures')} span={0.4} />
        </group>
        <Flat s={[2400, 3]} p={[0, L.MAIN.z1 + 1.5]} c="#E9ECF4" y={0.014} />
      </Merge>
      {/* 노면 도로명(바깥 차로, 정문·횡단보도를 피해서) */}
      {/* 맨홀 뚜껑(차로마다 90m 간격, 한 메시) */}
      <GroundPaints
        tex={manholeTex()} w={0.95} h={0.95} opacity={0.95}
        spots={Array.from({ length: 25 }, (_, i): [number, number, number][] => [[-1080 + i * 90, L.MAIN.wbIn, 0], [-1035 + i * 90, L.MAIN.ebIn, 0]]).flat()}
      />
      <GroundPaints
        tex={paintTex(tr('다온대로', 'Daon-daero'), '#FFFFFF', 384, 96)} w={8} h={2} opacity={0.75}
        spots={[-1000, -560, -230, 270, 520, 950].flatMap((x): [number, number, number][] => [[x, L.MAIN.ebOut, 0], [x + 40, L.MAIN.wbOut, Math.PI]])}
      />
    </group>
  )
}
