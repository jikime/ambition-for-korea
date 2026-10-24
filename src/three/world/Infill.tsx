// 거점 사이 빈 땅 채우기(영상 3 분석 추천): 60m 격자 칸마다 공장·창고·주차장·밭(비닐하우스)·숲·빈터를 결정론적으로 고른다.
// 칸이 거점·도로(나무 금지 구역)와 겹치면 비운다. 모두 Merge 하나에 넣어 그리기 명령은 몇 개뿐이고, 숲은 그림자를 끈다.
import { useMemo } from 'react'
import { B, Flat, mat } from '../kit'
import { Merge } from '../merge'
import { Industrial } from '../models/structures'
import { BoxTruckModel } from '../models/vehicles'
import { ParkedCar } from '../models/town'
import { mulberry32 } from '../../sim/data'
import { Trees } from './Vegetation'
import { infillPlan, type Cell } from './plan'
import { useEnvView } from '../env/state'
import type { Season } from '../../sim/env'

const SIGNS = ['한빛 물산', '대성 정밀', '다온 식품', '동해 냉동', '서해 포장', '미래 부품', '하나 제지', '새벽 물류']
const ROOFS = ['#B9C6E6', '#C4CEE6', '#AFC0EA', '#D9C7B0', '#C9D3C2', '#E2C9B8']
const STRIPES = ['#2F55E6', '#3E8E5A', '#D9531E', '#13A39A', '#7A5CFF', '#5B6B90']
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

function Factory({ c }: { c: Cell }) {
  const r = mulberry32(c.seed)
  const w = 30 + Math.floor(r() * 16)
  const d = 20 + Math.floor(r() * 12)
  const h = 8 + Math.floor(r() * 5)
  const rot = r() < 0.5 ? 0 : Math.PI / 2
  const sign = SIGNS[Math.floor(r() * SIGNS.length)]
  const cars = 2 + Math.floor(r() * 5)
  return (
    <group>
      <Industrial p={[c.x, c.z - 4]} w={w} d={d} h={h} rot={rot} roof={ROOFS[Math.floor(r() * ROOFS.length)]} sign={sign} stripe={STRIPES[Math.floor(r() * STRIPES.length)]} chimney={r() < 0.35} silos={r() < 0.25 ? 2 : 0} vents={2 + Math.floor(r() * 3)} docks={2} />
      {/* 앞마당 포장 + 진입로 + 직원 차 */}
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

function Warehouse({ c }: { c: Cell }) {
  const r = mulberry32(c.seed)
  const trucks = 1 + Math.floor(r() * 3)
  return (
    <group>
      <Industrial p={[c.x, c.z - 8]} w={48} d={24} h={9} roof={ROOFS[Math.floor(r() * ROOFS.length)]} sign={SIGNS[Math.floor(r() * SIGNS.length)]} stripe={STRIPES[Math.floor(r() * STRIPES.length)]} vents={3} docks={5} />
      <Flat s={[50, 16]} p={[c.x, c.z + 13]} c="#C7CDD9" y={0.012} />
      <Flat s={[10, 9]} p={[c.x - 14, c.z + 25.5]} c="#C7CDD9" y={0.012} />
      {Array.from({ length: trucks }, (_, i) => (
        <group key={i} position={[c.x + 19 - i * 5, 0, c.z + 11]} rotation={[0, Math.PI, 0]}>
          <BoxTruckModel carrier={(['donghae', 'hangil', 'baro'] as const)[(c.seed + i) % 3]} />
        </group>
      ))}
    </group>
  )
}

function Parking({ c }: { c: Cell }) {
  const r = mulberry32(c.seed)
  const spots: [number, number][] = []
  for (let row = 0; row < 3; row++) for (let i = 0; i < 14; i++) if (r() < 0.6) spots.push([c.x - 20 + i * 3, c.z - 14 + row * 12])
  return (
    <group>
      <Flat s={[48, 40]} p={[c.x, c.z]} c="#C7CDD9" y={0.012} />
      <Flat s={[8, 8]} p={[c.x + 16, c.z + 24]} c="#C7CDD9" y={0.012} />
      {spots.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]} rotation={[0, Math.PI / 2 + (i % 2) * Math.PI, 0]}>
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
  const season = useEnvView((st) => st.env.season)
  return (
    <group name="infill">
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
