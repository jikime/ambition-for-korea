// 다온마을·인천 서브터미널 주변을 생활 장면으로 채운다(정적): 근린상가 거리, 우편센터, 분리수거장, 보도·연석·횡단보도,
// 과속방지턱·맨홀, 가로 소품(벤치·볼라드·소화전·자전거·킥보드), 학교와 스쿨존, 공사장(타워크레인은 천천히 돈다),
// 인천 서브터미널 기사 주차장·롤테이너 대기·반품 수거·전기차 충전기.
// 모두 Merge 안에 넣고 간판은 텍스처 아틀라스만 쓴다(그리기 명령이 거의 늘지 않음).
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { B, Cyl, Flat, mat, cylGeo, unitBox } from '../kit'
import { Merge } from '../merge'
import { CarModel } from '../models/vehicles'
import { RollCage } from '../models/equipment'
import { Bicycle } from '../models/sites'
import { hazardMat } from '../models/structures'
import { AtlasSign, signId } from '../townAtlas'
import { Bench, Bollard, ConstructionSite, Hydrant, Kickboard, Mailbox, MicroVanModel, MiniTruckModel, PickupShelf, PostCenter, RecycleStation, SchoolBuilding, ScooterModel, ShopBuilding } from '../models/town'
import { RECYCLE_SPOTS } from '../../sim/town'
import { TW } from '../../sim/sites'
import { mulberry32 } from '../../sim/data'
import { useStore } from '../../store'

const PAVER = '#D9D4CB'
const CURB = '#BFC4CE'
const CAR_COLORS = ['#F4F6FA', '#2D3445', '#B8C2D6', '#5D79E8', '#E45B4B', '#F4F6FA', '#7E889B']

/** 근린상가 줄: 간선 북쪽, 단지 남쪽 (정면 = 간선 쪽 −z) */
export const SHOP_ROW = { z: 74.5, front: 69, xs: [-440, -478, -516], post: -545 }
/** 학교·공사장 자리 */
export const SCHOOL = { x: -447, z: 236 }
export const SITE_WORK = { x: -345, z: 185 }

function Stripes({ x, z, along, n, len }: { x: number; z: number; along: 'x' | 'z'; n: number; len: number }) {
  const m = mat('#FFFFFF', { rough: 0.9 })
  return (
    <group>
      {Array.from({ length: n }, (_, i) => {
        const o = (i - (n - 1) / 2) * 1.4
        return along === 'x'
          ? <Flat key={i} s={[0.7, len]} p={[x + o, z]} m={m} y={0.034} />
          : <Flat key={i} s={[len, 0.7]} p={[x, z + o]} m={m} y={0.034} />
      })}
    </group>
  )
}

/** 상가 앞 주차 칸과 세워 둔 차 */
function ShopParking() {
  const cars = useMemo(() => {
    const r = mulberry32(77)
    const out: { x: number; c: string; k: 'sedan' | 'suv' }[] = []
    for (let x = -553; x < -424; x += 2.7) {
      // 건물 사이 골목 앞은 비운다
      if (SHOP_ROW.xs.some((bx) => Math.abs(x - (bx - 19)) < 3)) continue
      if (r() < 0.55) out.push({ x, c: CAR_COLORS[Math.floor(r() * CAR_COLORS.length)], k: r() < 0.35 ? 'suv' : 'sedan' })
    }
    return out
  }, [])
  return (
    <group>
      <Flat s={[132, 5.4]} p={[-489, 63.6]} c="#C7CDD9" y={0.015} />
      {Array.from({ length: 50 }, (_, i) => -555 + i * 2.7).map((x) => (
        <Flat key={x} s={[0.1, 4.6]} p={[x, 63.6]} c="#FFFFFF" y={0.03} />
      ))}
      {cars.map((c, i) => (
        <group key={i} position={[c.x + 1.35, 0, 63.6]} rotation={[0, Math.PI / 2 + (i % 2 ? Math.PI : 0), 0]}>
          <CarModel color={c.c} kind={c.k} />
        </group>
      ))}
    </group>
  )
}

function ShopStreet() {
  const [b1, b2, b3] = SHOP_ROW.xs
  return (
    <group>
      {/* 상가 앞 보행로 */}
      <Flat s={[134, 2.7]} p={[-489, 67.6]} c={PAVER} y={0.02} />
      <group position={[b1, 0, SHOP_ROW.z]} rotation={[0, Math.PI, 0]}>
        <ShopBuilding shops={['다온치킨', '카페 하루', '온가족약국']} upper={['다온 수학학원', '하늘 영어']} floors={3} color="#EDE6DC" />
      </group>
      <group position={[b2, 0, SHOP_ROW.z]} rotation={[0, Math.PI, 0]}>
        <ShopBuilding shops={['분식 꼬마김밥', '엄마손 반찬', '다온마트']} upper={['바른 치과', '튼튼 소아과']} floors={4} color="#E6E9F2" />
      </group>
      <group position={[b3, 0, SHOP_ROW.z]} rotation={[0, Math.PI, 0]}>
        <ShopBuilding shops={['행복 부동산', '다온 꽃집', '동네 정육점']} upper={['태권도 다온관', '피아노 교습소']} floors={3} color="#F0E7DA" />
      </group>
      <group position={[SHOP_ROW.post, 0, SHOP_ROW.z]} rotation={[0, Math.PI, 0]}>
        <PostCenter />
      </group>
      {/* 치킨집 앞 배달 픽업 선반과 배달 오토바이 */}
      <group position={[b1 + 10, 0, SHOP_ROW.front - 0.8]} rotation={[0, Math.PI, 0]}>
        <PickupShelf />
      </group>
      {[0, 1, 2].map((i) => (
        <group key={i} position={[b1 + 6.4 - i * 1.1, 0, SHOP_ROW.front - 1.6]} rotation={[0, Math.PI + 0.15, 0]}>
          <ScooterModel box={['#E2453C', '#2F55E6', '#13A39A'][i]} />
        </group>
      ))}
      {/* 마트 납품 1톤 화물차(뒤를 가게 쪽으로), 우편센터 경상용 밴 */}
      <group position={[b2 - 9, 0, 63.4]} rotation={[0, Math.PI, 0]}>
        <MiniTruckModel color="#F4F6FA" ev load={5} />
      </group>
      <group position={[SHOP_ROW.post - 2, 0, 63.4]} rotation={[0, Math.PI, 0]}>
        <MicroVanModel color="#F4F6FA" stripe="#D9531E" />
      </group>
      {/* 볼라드(주차 칸과 보행로 사이) */}
      {Array.from({ length: 42 }, (_, i) => -554 + i * 3.2).map((x) => (
        <group key={x} position={[x, 0, 66.4]}><Bollard /></group>
      ))}
      {/* 벤치 · 킥보드 */}
      {[b1 - 14, b2 + 14, b3 - 14].map((x) => (
        <group key={x} position={[x, 0, SHOP_ROW.front - 0.6]} rotation={[0, Math.PI, 0]}><Bench /></group>
      ))}
      {[b2 + 15.5, b2 + 16.2, b3 + 15.6].map((x, i) => (
        <group key={x} position={[x, 0, 67.4]} rotation={[0, 0.3 * i, 0]}><Kickboard color={i % 2 ? '#F2B92B' : '#35D07F'} /></group>
      ))}
    </group>
  )
}

/** 마을 도로 보도·연석, 횡단보도, 과속방지턱, 맨홀 */
function Streets() {
  const R = TW.road
  const seg = (z0: number, z1: number, x0: number, x1: number, curbX: number) => (
    <group key={`${x0}${z0}`}>
      <B s={[x1 - x0, 0.15, z1 - z0]} p={[(x0 + x1) / 2, 0.075, (z0 + z1) / 2]} c={PAVER} cast={false} />
      <B s={[0.18, 0.18, z1 - z0]} p={[curbX, 0.09, (z0 + z1) / 2]} c={CURB} cast={false} />
    </group>
  )
  return (
    <group>
      {/* 서쪽 보도(단지 쪽): 단지 진입로에서 끊김 */}
      {seg(61, 146, -398.9, -395.7, -395.8)}
      {seg(154, 262, -398.9, -395.7, -395.8)}
      {/* 동쪽 보도(빌라·상가 쪽) */}
      {seg(61, 262, -388.3, -385.1, -388.2)}
      {/* 횡단보도 */}
      <Stripes x={R.x} z={82} along="x" n={5} len={3} />
      <Stripes x={-404} z={TW.apt.roadZ} along="z" n={4} len={2.6} />
      <Stripes x={R.x} z={226} along="x" n={5} len={3} />
      {/* 과속방지턱 */}
      {[120, 196].map((z) => (
        <mesh key={z} geometry={unitBox} position={[R.x, 0.05, z]} scale={[7, 0.1, 0.7]} material={hazardMat()} />
      ))}
      {/* 맨홀 · 빗물받이 */}
      {[90, 112, 134, 172, 194, 216, 238].map((z) => (
        <mesh key={z} geometry={cylGeo(0.38, 0.38, 0.02, 16)} position={[R.x - 1.4, 0.03, z]} material={mat('#5B6274', { rough: 0.8 })} />
      ))}
      {[-430, -466, -502, -538].map((x) => (
        <mesh key={x} geometry={cylGeo(0.38, 0.38, 0.02, 16)} position={[x, 0.03, TW.apt.roadZ + 1.2]} material={mat('#5B6274', { rough: 0.8 })} />
      ))}
      {[100, 140, 180, 220, 250].map((z) => <B key={z} s={[0.35, 0.03, 0.9]} p={[R.x - 3.3, 0.03, z]} c="#3B4252" cast={false} />)}
      {/* 소화전 */}
      {[[-397.2, 96], [-397.2, 190], [-386.6, 130], [-386.6, 236], [-430, 66.8], [-520, 66.8]].map(([x, z], i) => (
        <group key={i} position={[x, 0.15, z]}><Hydrant /></group>
      ))}
      {/* 버스정류장 옆 우체통·자전거 */}
      <group position={[-413.5, 0, 58.6]}><Mailbox /></group>
      {[-427, -428.1, -429.2].map((x, i) => (
        <group key={x} position={[x, 0, 58.2]} rotation={[0, Math.PI / 2, 0]}><Bicycle color={['#5D79E8', '#E2453C', '#3E8E5A'][i]} /></group>
      ))}
      {/* 편의점 택배 접수 입간판 */}
      <group position={[-378.6, 0, TW.store.z + 5.4]}>
        <B s={[0.08, 1.3, 0.08]} p={[0, 0.65, 0]} c="#7E889B" />
        <AtlasSign cell={signId('택배 접수·보관')} w={1.8} h={0.45} p={[0, 1.2, 0]} r={[0, -Math.PI / 2, 0]} lit />
      </group>
    </group>
  )
}

/** 동 사이 빈터: 분리수거장, 벤치 */
function Courtyards() {
  return (
    <group>
      {Object.entries(RECYCLE_SPOTS).map(([id, [x, z]]) => (
        <group key={id} position={[x, 0, z]} rotation={[0, z > 150 ? Math.PI : 0, 0]}><RecycleStation /></group>
      ))}
      {[[-462, 183], [-478, 183], [-500, 118], [-430, 118]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]} rotation={[0, i < 2 ? 0 : Math.PI, 0]}><Bench /></group>
      ))}
    </group>
  )
}

/** 학교와 스쿨존(마을 도로 북쪽 끝) */
function School() {
  return (
    <group>
      <group position={[SCHOOL.x, 0, SCHOOL.z]}><SchoolBuilding /></group>
      {/* 학교 앞 승하차 구역과 노란 학원차 */}
      <Flat s={[5, 24]} p={[-403.5, 238]} c="#C7CDD9" y={0.016} />
      <group position={[-403.5, 0, 236]}><MicroVanModel color="#F2C233" stripe="#22262F" /></group>
      {/* 스쿨존: 빨간 포장 + 바닥 글자 */}
      <Flat s={[7, 34]} p={[TW.road.x, 240]} c="#C8483F" y={0.02} />
      <AtlasSign cell="road-school" w={5} h={2.5} p={[TW.road.x, 0.04, 246]} r={[-Math.PI / 2, 0, Math.PI]} />
      <group position={[-397.2, 0.15, 222]}>
        <Cyl rt={0.06} h={2.6} p={[0, 1.3, 0]} c="#9AA4B8" />
        <mesh geometry={cylGeo(0.38, 0.38, 0.05, 20)} rotation={[Math.PI / 2, 0, 0]} position={[0, 2.5, 0]} material={mat('#E2453C')} />
        <mesh geometry={cylGeo(0.3, 0.3, 0.06, 20)} rotation={[Math.PI / 2, 0, 0]} position={[0, 2.5, 0]} material={mat('#FFFFFF')} />
      </group>
    </group>
  )
}

/** 인천 서브터미널 주변: 기사 주차장 · 전기차 충전기 · 롤테이너 대기 · 반품 수거 */
function IncheonYard() {
  const cars = useMemo(() => {
    const r = mulberry32(31)
    return Array.from({ length: 12 }, (_, i) => ({ x: -453 + i * 2.6, c: CAR_COLORS[Math.floor(r() * CAR_COLORS.length)], on: r() < 0.75, k: (r() < 0.3 ? 'suv' : 'sedan') as 'sedan' | 'suv' }))
  }, [])
  return (
    <group>
      <Flat s={[32, 8]} p={[-438, 25]} c="#C7CDD9" y={0.015} />
      {cars.map((c) => <Flat key={c.x} s={[0.1, 5]} p={[c.x - 1.3, 25]} c="#FFFFFF" y={0.03} />)}
      {cars.filter((c) => c.on).map((c) => (
        <group key={c.x} position={[c.x, 0, 25]} rotation={[0, Math.PI / 2, 0]}><CarModel color={c.c} kind={c.k} /></group>
      ))}
      <AtlasSign cell={signId('기사 주차장')} w={3} h={0.75} p={[-455.5, 1.6, 29.2]} />
      <B s={[0.1, 1.2, 0.1]} p={[-455.5, 0.6, 29.2]} c="#7E889B" />
      {/* 전기차 충전기 4기(1톤 전기 화물차용) */}
      {[0, 1, 2, 3].map((i) => (
        <group key={i} position={[-424 + i * 2.6, 0, 21.2]}>
          <B s={[0.5, 1.5, 0.35]} p={[0, 0.75, 0]} c="#F4F6FB" />
          <B s={[0.36, 0.3, 0.02]} p={[0, 1.15, 0.19]} c="#13A39A" cast={false} />
        </group>
      ))}
      <AtlasSign cell={signId('전기차 충전')} w={2.6} h={0.65} p={[-420.1, 1.9, 21.2]} />
      {/* 롤테이너 대기열 */}
      {Array.from({ length: 8 }, (_, i) => (
        <group key={i} position={[-519 + (i % 4) * 1.6, 0, -56 + Math.floor(i / 4) * 2.2]}><RollCage fill={0.25 + ((i * 3) % 7) / 10} /></group>
      ))}
      {/* 반품 수거 롤테이너 */}
      <group position={[-428, 0, -48]}><RollCage fill={0.55} color="#E2453C" /></group>
      <group position={[-426.4, 0, -48]}><RollCage fill={0.3} color="#E2453C" /></group>
      <AtlasSign cell={signId('반품 수거')} w={2.2} h={0.55} p={[-427.2, 2.3, -47.2]} />
    </group>
  )
}

/** 공사장 타워크레인 위쪽(천천히 돈다) */
function CraneTop() {
  const ref = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.06
  })
  return (
    <group ref={ref} position={[SITE_WORK.x + 9, 34, SITE_WORK.z - 10]}>
      <Merge>
        <B s={[1.4, 1.6, 1.4]} p={[0, 0.8, 0]} c="#F2B92B" />
        <B s={[0.8, 0.8, 26]} p={[0, 1.4, 12]} c="#F2B92B" />
        <B s={[0.8, 0.8, 8]} p={[0, 1.4, -4.5]} c="#F2B92B" />
        <B s={[1.6, 1.4, 2]} p={[0, 1.0, -8]} c="#8A94A8" />
        <B s={[0.15, 4, 0.15]} p={[0, 3.2, 0]} c="#F2B92B" />
        <B s={[0.6, 0.4, 0.8]} p={[0, 0.8, 16]} c="#3B4252" />
        <B s={[0.03, 12, 0.03]} p={[0, -5.4, 16]} c="#3B4252" cast={false} />
        <B s={[1.2, 0.6, 1.2]} p={[0, -11.6, 16]} c="#8A94A8" />
        <mesh geometry={cylGeo(0.15, 0.15, 0.1, 8)} position={[0, 5.3, 0]} material={mat('#E2453C', { emissive: '#E2453C', emissiveIntensity: 1 })} />
      </Merge>
    </group>
  )
}

export function TownDetail() {
  const view = useStore((s) => s.view)
  return (
    <group>
      <Merge flat>
        <ShopParking />
        <ShopStreet />
        <Streets />
        <Courtyards />
        <School />
        <IncheonYard />
        <group position={[SITE_WORK.x, 0, SITE_WORK.z]}><ConstructionSite /></group>
      </Merge>
      {view !== 'network' && <CraneTop />}
    </group>
  )
}
