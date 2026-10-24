// 거점 사이 빈 땅 채우기(영상 3 분석 추천): 60m 격자 칸마다 공장·창고·주차장·밭(비닐하우스)·숲·빈터를 결정론적으로 고른다.
// 칸이 거점·도로(나무 금지 구역)와 겹치면 비운다. 공장·창고·주차장 건물은 hubtrace 환경 팩 GLB(three/env.tsx, 종류마다 인스턴스),
// 앞마당 · 차량 · 밭 · 논은 Merge 하나에 넣어 그리기 명령은 몇 개뿐이고, 숲은 그림자를 끈다.
import { useMemo } from 'react'
import { B, Flat, mat } from '../kit'
import { Merge } from '../merge'
import { EnvBuildings, type EnvPlacement } from '../env'
import { BoxTruckModel } from '../models/vehicles'
import { ParkedCar } from '../models/town'
import { mulberry32 } from '../../sim/data'
import { Trees } from './Vegetation'
import { infillPlan, type Cell } from './plan'
import { useEnvView } from '../env/state'
import type { Season } from '../../sim/env'

const SIGNS = ['한빛 물산', '대성 정밀', '다온 식품', '동해 냉동', '서해 포장', '미래 부품', '하나 제지', '새벽 물류']
const CAR = ['#F4F6FA', '#2D3445', '#B8C2D6', '#5D79E8', '#E45B4B', '#7E889B']

/** 숲 칸의 나무 자리 */
function groveTrees(cells: Cell[]): [number, number, number][] {
  const out: [number, number, number][] = []
  for (const c of cells) {
    if (c.kind !== 'grove' && c.kind !== 'field') continue
    const r = mulberry32(c.seed)
    // 밭 칸은 가장자리에 방풍림 한 줄
    if (c.kind === 'field') {
      for (let x = -22; x <= 22; x += 5.5) out.push([c.x + x + (r() - 0.5), c.z - 23 + (r() - 0.5), 0.8 + r() * 0.3])
      continue
    }
    const n = 20 + Math.floor(r() * 18)
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2
      const d = Math.sqrt(r()) * 25
      out.push([c.x + Math.cos(a) * d, c.z + Math.sin(a) * d, 0.75 + r() * 0.6])
    }
  }
  return out
}

/**
 * 공장·창고·주차장 칸의 건물(정면 +z, 모델 원점 기준 자리). 칸은 60m, 건물은 칸 가운데 약 52m 안에 들어간다.
 *  - 공장: 생산 공장(+ 굴뚝 · 사일로) 또는 유틸리티동 + 배관 랙 + 사일로(+ 굴뚝)
 *  - 창고: 물류창고(도크 6) 또는 냉동창고(도크 3)
 *  - 주차장: 24면 지상 주차장 두 면
 */
function buildingPlan(cells: Cell[]): EnvPlacement[] {
  const out: EnvPlacement[] = []
  for (const c of cells) {
    const r = mulberry32(c.seed ^ 0x5bd1)
    const sign = SIGNS[Math.floor(r() * SIGNS.length)]
    const at = (id: EnvPlacement['id'], dx: number, dz: number, withSign = false) => out.push({ id, x: c.x + dx, z: c.z + dz, sign: withSign ? sign : undefined })
    if (c.kind === 'factory') {
      if (r() < 0.6) {
        at('factory-production-hall', 0, -6, true)
        if (r() < 0.4) at('industrial-chimney', 25, -20)
        if (r() < 0.3) at('silo-farm', -8, -25.6)
      } else {
        at('factory-utility-building', -12, -8, true)
        at('process-pipe-rack', 14, -11)
        at('silo-farm', 14, -23)
        if (r() < 0.3) at('industrial-chimney', -22, -24)
      }
    } else if (c.kind === 'warehouse') {
      at(warehouseKind(c), 0, warehouseKind(c) === 'distribution-warehouse' ? -8 : -6, true)
    } else if (c.kind === 'parking') {
      at('surface-parking-lot', 0, -12.5)
      at('surface-parking-lot', 0, 12.5)
    }
  }
  return out
}

const warehouseKind = (c: Cell) => (mulberry32(c.seed ^ 0x77)() < 0.35 ? 'cold-storage-warehouse' : 'distribution-warehouse')
/** 도크 앵커 x(모델 기준)와 도크 앞 z: 물류창고 6개 · 냉동창고 3개 */
const DOCKS = {
  'distribution-warehouse': { xs: [-18, -10.8, -3.6, 3.6, 10.8, 18], z: -8 + 18.82 },
  'cold-storage-warehouse': { xs: [-8, 0, 8], z: -6 + 12.82 },
} as const

/** 공장 칸 앞마당 · 진입로 · 직원 차 */
function Factory({ c }: { c: Cell }) {
  const r = mulberry32(c.seed)
  const cars = 2 + Math.floor(r() * 5)
  return (
    <group>
      <Flat s={[40, 10]} p={[c.x, c.z + 20]} c="#C7CDD9" y={0.012} />
      <Flat s={[7, 6]} p={[c.x + 12, c.z + 27.5]} c="#C7CDD9" y={0.012} />
      {Array.from({ length: cars }, (_, i) => (
        <group key={i} position={[c.x - 16 + i * 3, 0, c.z + 21]} rotation={[0, Math.PI / 2, 0]}>
          <ParkedCar color={CAR[(c.seed + i) % CAR.length]} kind={i % 3 ? 'sedan' : 'suv'} />
        </group>
      ))}
    </group>
  )
}

/** 창고 칸 앞 야드 · 진입로 · 도크에 붙은 화물차 */
function Warehouse({ c }: { c: Cell }) {
  const r = mulberry32(c.seed)
  const kind = warehouseKind(c)
  const dk = DOCKS[kind]
  const trucks = 1 + Math.floor(r() * Math.min(3, dk.xs.length))
  const first = Math.floor(r() * (dk.xs.length - trucks + 1))
  return (
    <group>
      <Flat s={[54, 18]} p={[c.x, c.z + dk.z + 8]} c="#C7CDD9" y={0.012} />
      <Flat s={[10, 9]} p={[c.x - 14, c.z + 26]} c="#C7CDD9" y={0.012} />
      {Array.from({ length: trucks }, (_, i) => (
        // 뒤를 도크에 대고 선다(정면 +z)
        <group key={i} position={[c.x + dk.xs[first + i], 0, c.z + dk.z + 5.9]}>
          <BoxTruckModel carrier={(['donghae', 'hangil', 'baro'] as const)[(c.seed + i) % 3]} />
        </group>
      ))}
    </group>
  )
}

/** 주차장 칸: 주차장 두 면(긴 변 양쪽 12칸)에 직원 차 */
function Parking({ c }: { c: Cell }) {
  const r = mulberry32(c.seed)
  const cars: [number, number, number][] = []
  for (const lot of [-12.5, 12.5]) {
    for (const side of [-1, 1]) {
      for (let i = 0; i < 12; i++) if (r() < 0.6) cars.push([c.x + (i - 5.5) * 2.55, c.z + lot + side * 9.3, side])
    }
  }
  return (
    <group>
      {cars.map(([x, z, side], i) => (
        <group key={i} position={[x, 0.01, z]} rotation={[0, side > 0 ? Math.PI : 0, 0]}>
          <ParkedCar color={CAR[(c.seed + i * 3) % CAR.length]} kind={i % 4 ? 'sedan' : 'suv'} />
        </group>
      ))}
    </group>
  )
}

/** 밭(골 무늬)과 비닐하우스 */
function Field({ c }: { c: Cell }) {
  const r = mulberry32(c.seed)
  const crop = ['#B9C98A', '#C9B97A', '#A9C48A', '#D0C08F'][Math.floor(r() * 4)]
  const houses = r() < 0.6 ? 3 + Math.floor(r() * 3) : 0
  return (
    <group>
      <Flat s={[54, 48]} p={[c.x, c.z + 3]} c={crop} y={0.011} />
      {Array.from({ length: 12 }, (_, i) => <Flat key={i} s={[52, 0.5]} p={[c.x, c.z - 18 + i * 4]} c="#9DAE73" y={0.014} />)}
      {Array.from({ length: houses }, (_, i) => (
        <group key={`h${i}`} position={[c.x - 20 + i * 8, 0, c.z + 4]}>
          <B s={[6, 2.6, 22]} p={[0, 1.3, 0]} m={mat('#EEF3F8', { opacity: 0.85, rough: 0.3 })} />
          <B s={[6.2, 0.2, 22.2]} p={[0, 2.6, 0]} c="#DDE6EE" cast={false} />
        </group>
      ))}
    </group>
  )
}

/** 논: 논두렁으로 나눈 논배미 6개. 계절 색(봄 물 댄 논, 여름 초록, 가을 황금, 겨울 그루터기) */
const PADDY: Record<Season, [string, string]> = {
  spring: ['#9DBBE0', '#B9CFA0'], summer: ['#6FA65A', '#7DB266'], autumn: ['#D8BC5A', '#CFAE4E'], winter: ['#BFAF90', '#B5A587'],
}
function Paddy({ c, season }: { c: Cell; season: Season }) {
  const [a, b] = PADDY[season]
  return (
    <group>
      <Flat s={[54, 50]} p={[c.x, c.z]} c="#B8A27A" y={0.011} />
      {[0, 1, 2].flatMap((i) => [0, 1].map((j) => (
        <Flat key={`${i}${j}`} s={[16.6, 23.2]} p={[c.x - 17.7 + i * 17.7, c.z - 12.2 + j * 24.4]} c={(i + j) % 2 ? a : b} y={0.014} />
      )))}
    </group>
  )
}

export function Infill() {
  const cells = useMemo(() => infillPlan(), [])
  const trees = useMemo(() => groveTrees(cells), [cells])
  const buildings = useMemo(() => buildingPlan(cells), [cells])
  const season = useEnvView((st) => st.env.season)
  return (
    <group name="infill">
      <EnvBuildings items={buildings} />
      <Merge flat>
        {cells.map((c, i) =>
          c.kind === 'factory' ? <Factory key={i} c={c} />
            : c.kind === 'warehouse' ? <Warehouse key={i} c={c} />
              : c.kind === 'parking' ? <Parking key={i} c={c} />
                : c.kind === 'field' ? <Field key={i} c={c} />
                  : null,
        )}
      </Merge>
      <Merge flat key={season}>
        {cells.filter((c) => c.kind === 'paddy').map((c, i) => <Paddy key={i} c={c} season={season} />)}
      </Merge>
      <Trees spots={trees} shadows={false} seed={11} lowPoly />
    </group>
  )
}
