// 랜드마크(hubtrace 도시·산업 환경 팩 GLB, three/env.tsx): 지금은 보는 용도이고 시뮬레이션과 잇지 않았다.
//  - 다온 콜드체인 센터: 이천 풀필먼트센터 북쪽, 철송선 너머 빈 띠. 저온·냉동 창고, 도크는 북쪽 산업단지 도로를 본다
//  - 다온마을 택배 거점: 상가 줄 서쪽 끝(우편센터 옆, x −600 이면도로 동쪽) 도심형 마이크로 물류거점, 셔터는 마을 안쪽을 본다
//  - 간선도로변 업무지구: 곤지암 메가허브 동쪽, 다온로지스 본사(커튼월 타워) · 중층 업무 빌딩 · 코너 상가와 앞 광장
// 자리는 world/zones.ts NO_TREE에도 넣어 나무 · 빈 땅 채우기와 겹치지 않는다.
import { B, Flat } from '../kit'
import { Merge } from '../merge'
import { EnvBuildings, type EnvPlacement } from '../env'
import { ReeferModel } from '../models/vehicles'
import { MicroVanModel } from '../models/town'

/** 콜드체인 센터(모델 원점, 정면이 북쪽 −z가 되도록 반 바퀴) */
export const COLD = { x: 446, z: -136 }
/** 다온마을 택배 거점 */
export const MICROHUB = { x: -582, z: 74 }
/** 업무지구 */
export const BIZ = { x: 160, z: -14 }

const LANDMARKS: EnvPlacement[] = [
  { id: 'cold-storage-warehouse', x: COLD.x, z: COLD.z, rot: Math.PI, sign: '다온 콜드체인' },
  { id: 'urban-microhub', x: MICROHUB.x, z: MICROHUB.z, sign: '다온마을 택배' },
  { id: 'office-tower', x: BIZ.x, z: BIZ.z, sign: '다온로지스 본사' },
  { id: 'office-midrise', x: 146, z: 18 },
  { id: 'mixed-use-corner', x: 175, z: 20 },
  ...[140, 160, 180].map((x): EnvPlacement => ({ id: 'landscaped-planter', x, z: 5 })),
  ...[138, 160, 182].map((x): EnvPlacement => ({ id: 'streetlight-led', x, z: 31.5 })),
]

/** 콜드체인 센터 도크(모델 기준 x) */
const COLD_DOCKS = [-8, 0, 8]
/** 마이크로허브 밴 하역 셔터(모델 기준 x, 셔터 앞 z) */
const VAN_BAYS = [-5.7, -0.5]

export function Landmarks() {
  return (
    <group>
      <EnvBuildings items={LANDMARKS} />
      <Merge>
        {/* 콜드체인 센터 북쪽 하역 마당 · 도크에 붙은 냉동탑차(뒤를 도크에) */}
        <Flat s={[44, 11]} p={[COLD.x, COLD.z - 18.4]} c="#C7CDD9" y={0.012} />
        {COLD_DOCKS.slice(0, 2).map((dx) => (
          <group key={dx} position={[COLD.x - dx, 0, COLD.z - 12.82 - 5.0]} rotation={[0, Math.PI, 0]}>
            <ReeferModel />
          </group>
        ))}
        {/* 택배 거점 앞마당 · 셔터 앞 배송 밴 */}
        <Flat s={[24, 9]} p={[MICROHUB.x, MICROHUB.z + 13.5]} c="#D9DEE8" y={0.012} />
        {VAN_BAYS.map((dx, i) => (
          <group key={dx} position={[MICROHUB.x + dx, 0, MICROHUB.z + 9.4 + 2.4]}>
            <MicroVanModel color={i ? '#F4F6FA' : '#F2C233'} stripe={i ? '#2F55E6' : '#22262F'} />
          </group>
        ))}
        {/* 업무지구 앞 광장 · 보도 */}
        <Flat s={[54, 12]} p={[BIZ.x, 5]} c="#DCD6CC" y={0.014} />
        <Flat s={[54, 4]} p={[BIZ.x, 31.5]} c="#D9DEE8" y={0.014} />
        <B s={[54, 0.18, 0.3]} p={[BIZ.x, 0.09, 33.6]} c="#B9BFCA" cast={false} />
      </Merge>
    </group>
  )
}
