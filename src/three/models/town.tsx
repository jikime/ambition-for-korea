// 생활 장면 모델: 근린상가·우편센터·분리수거장·소형 화물차·다마스형 밴·배달 오토바이·가로 소품·공사장·학교.
// 모두 단색 재질 + 텍스처 아틀라스(간판)만 써서 Merge로 합치면 그리기 명령이 거의 늘지 않는다.
import { B, Cyl, Flat, RB, boxUV, cylGeo, mat, sphereGeo, torusGeo } from '../kit'
import { AtlasSign, signId } from '../townAtlas'
import { officeFaceMat } from '../sharedMats'
import { Prop } from '../props'

const glass = () => mat('#9DB2E8', { rough: 0.2, metal: 0.1 })

/** 근린상가 건물(정면 = +z). 1층 가게 3칸(유리·간판·차양), 위층 사무실 창과 2층 간판, 옥상 실외기 */
export function ShopBuilding({ shops, upper = [], floors = 3, color = '#EDE6DC', w = 30, d = 11 }: {
  shops: string[]
  upper?: string[]
  floors?: number
  color?: string
  w?: number
  d?: number
}) {
  const g1 = 3.8
  const uh = (floors - 1) * 3.2
  const cell = w / shops.length
  const upGeo = boxUV([[d / 6, (floors - 1) / 2.4], [d / 6, (floors - 1) / 2.4], null, null, [w / 6, (floors - 1) / 2.4], [w / 6, (floors - 1) / 2.4]])
  const wall = mat(color)
  return (
    <group>
      {/* 1층 */}
      <B s={[w, g1, d]} p={[0, g1 / 2, 0]} m={wall} />
      {/* 위층(사무실 창) */}
      {floors > 1 && <mesh geometry={upGeo} position={[0, g1 + uh / 2, 0]} scale={[w - 0.4, uh, d - 0.4]} material={[officeFaceMat(), officeFaceMat(), wall, wall, officeFaceMat(), officeFaceMat()]} castShadow receiveShadow />}
      <B s={[w + 0.3, 0.3, d + 0.3]} p={[0, g1, 0]} c="#CFC7BB" />
      <B s={[w + 0.3, 0.7, d + 0.3]} p={[0, g1 + uh + 0.35, 0]} c="#B9AFA2" />
      {shops.map((name, i) => {
        const x = -w / 2 + cell * (i + 0.5)
        return (
          <group key={name} position={[x, 0, d / 2]}>
            <B s={[cell - 1.4, 2.7, 0.08]} p={[0, 1.45, 0.05]} m={glass()} cast={false} />
            <B s={[1.2, 2.3, 0.1]} p={[cell / 2 - 1.6, 1.15, 0.08]} c="#3B4252" cast={false} />
            <AtlasSign cell={signId(name)} w={cell - 2} h={0.95} p={[0, 3.2, 0.12]} lit />
            <B s={[cell - 1.2, 0.08, 1.5]} p={[0, 2.88, 0.75]} r={[0.18, 0, 0]} c="#E9ECF4" />
          </group>
        )
      })}
      {upper.map((name, i) => (
        <AtlasSign key={name} cell={signId(name)} w={5.5} h={0.85} p={[-w / 2 + 4 + i * 8.5, g1 + 1.3, d / 2 + 0.08]} lit />
      ))}
      {/* 옥상 실외기·물탱크 */}
      {[-w / 2 + 3, -w / 2 + 6, w / 2 - 5].map((x) => (
        <RB key={x} s={[1.6, 0.9, 1.1]} rad={0.06} p={[x, g1 + uh + 1.15, -d / 4]} c="#F1F3F8" />
      ))}
      <Cyl rt={0.9} h={1.4} p={[w / 2 - 2.5, g1 + uh + 1.4, d / 4]} c="#D9DFEB" />
    </group>
  )
}

/** 배달 픽업 선반(치킨집 앞): 포장 봉투가 놓인 선반 */
export function PickupShelf() {
  return (
    <group>
      <B s={[1.6, 1.2, 0.5]} p={[0, 0.6, 0]} c="#9AA4B8" />
      {[0.35, 0.8].map((y) => <B key={y} s={[1.5, 0.04, 0.45]} p={[0, y, 0.02]} c="#C9D0DE" cast={false} />)}
      {[-0.5, -0.1, 0.35].map((x, i) => <B key={x} s={[0.3, 0.32, 0.26]} p={[x, 0.55 + (i % 2) * 0.45, 0.02]} c={i % 2 ? '#F4F6FB' : '#E9DCC8'} />)}
    </group>
  )
}

/** 우편센터(가상): 빨간 띠, 우체통, 접수창구 */
export function PostCenter() {
  return (
    <group>
      <B s={[12, 4.6, 11]} p={[0, 2.3, 0]} c="#F4F6FB" />
      <B s={[12.2, 0.9, 11.2]} p={[0, 4.4, 0]} c="#D9531E" />
      <B s={[8, 2.6, 0.08]} p={[0, 1.45, 5.55]} m={glass()} cast={false} />
      <AtlasSign cell={signId('다온 우편센터')} w={7} h={1.2} p={[0, 3.3, 5.6]} lit />
      <group position={[4.8, 0, 6.8]}>
        <Mailbox />
      </group>
    </group>
  )
}

/** 우체통(가상, 빨간 둥근 통) */
export function Mailbox() {
  return (
    <group>
      <B s={[0.12, 0.6, 0.12]} p={[0, 0.3, 0]} c="#5B6274" />
      <RB s={[0.55, 0.85, 0.5]} rad={0.2} p={[0, 1.0, 0]} c="#D9381E" />
      <B s={[0.3, 0.04, 0.02]} p={[0, 1.2, 0.26]} c="#2E3442" cast={false} />
    </group>
  )
}

/** 분리수거장: 지붕 있는 칸 + 수거함 4색 + 표지. 골판지 더미는 TownLife가 그린다(왼쪽 칸) */
export function RecycleStation() {
  const bins: [string, number][] = [['#2F55E6', 0.2], ['#F2B92B', 1.1], ['#7E889B', 2.0], ['#3E8E5A', 2.9]]
  return (
    <group>
      <Flat s={[6.6, 3.2]} p={[0, 0]} c="#C9CFDA" y={0.03} />
      {[[-3.1, -1.4], [3.1, -1.4], [-3.1, 1.4], [3.1, 1.4]].map(([x, z], i) => <B key={i} s={[0.12, 2.4, 0.12]} p={[x, 1.2, z]} c="#7E889B" />)}
      <B s={[6.8, 0.12, 3.4]} p={[0, 2.45, 0]} c="#3E8E5A" />
      <B s={[6.4, 1.1, 0.06]} p={[0, 0.55, -1.5]} c="#C9CFDA" />
      {bins.map(([c, x]) => (
        <group key={c} position={[x, 0, -0.6]}>
          <RB s={[0.75, 1.05, 0.8]} rad={0.06} p={[0, 0.53, 0]} c={c} />
          <B s={[0.78, 0.06, 0.84]} p={[0, 1.08, 0]} c="#2E3442" cast={false} />
        </group>
      ))}
      <AtlasSign cell={signId('분리수거장')} w={2.4} h={0.6} p={[1.2, 1.9, -1.45]} />
    </group>
  )
}

/** 1톤 소형 화물차(가상, 앞 = +z): 캡 + 적재함(상자 몇 개) */
export function MiniTruckModel({ color = '#F4F6FA', ev = false, load = 3 }: { color?: string; ev?: boolean; load?: number }) {
  return (
    <group>
      {[[-0.75, 1.35], [0.75, 1.35], [-0.75, -1.25], [0.75, -1.25]].map(([x, z], i) => (
        <mesh key={i} geometry={cylGeo(0.33, 0.33, 0.24, 14)} rotation={[0, 0, Math.PI / 2]} position={[x, 0.33, z]} material={mat('#22262F', { rough: 0.9 })} castShadow />
      ))}
      <RB s={[1.75, 1.45, 1.5]} rad={0.14} p={[0, 1.25, 1.55]} c={color} />
      <B s={[1.62, 0.6, 0.05]} p={[0, 1.5, 2.31]} m={glass()} cast={false} />
      <B s={[1.8, 0.18, 2.9]} p={[0, 0.72, -0.6]} c="#5B6274" />
      {[-0.88, 0.88].map((x) => <B key={x} s={[0.05, 0.42, 2.9]} p={[x, 1.0, -0.6]} c={color} />)}
      <B s={[1.8, 0.42, 0.05]} p={[0, 1.0, -2.04]} c={color} />
      {Array.from({ length: load }, (_, i) => (
        <B key={i} s={[0.55, 0.45, 0.5]} p={[-0.45 + (i % 3) * 0.45, 1.05 + Math.floor(i / 3) * 0.45, -0.1 - (i % 2) * 0.7]} c={i % 2 ? '#D7A86E' : '#E2BC88'} />
      ))}
      {/* 번호판: 전기차는 하늘색 */}
      <B s={[0.52, 0.12, 0.02]} p={[0, 0.55, 2.31]} c={ev ? '#8FD0F5' : '#F4F6FB'} cast={false} />
      <B s={[0.52, 0.12, 0.02]} p={[0, 0.85, -2.06]} c={ev ? '#8FD0F5' : '#F4F6FB'} cast={false} />
    </group>
  )
}

/** 다마스형 경상용 밴(가상, 앞 = +z) */
export function MicroVanModel({ color = '#F4F6FA', stripe = '#2F55E6' }: { color?: string; stripe?: string }) {
  return (
    <group>
      {[[-0.6, 1.0], [0.6, 1.0], [-0.6, -0.95], [0.6, -0.95]].map(([x, z], i) => (
        <mesh key={i} geometry={cylGeo(0.26, 0.26, 0.2, 12)} rotation={[0, 0, Math.PI / 2]} position={[x, 0.26, z]} material={mat('#22262F', { rough: 0.9 })} castShadow />
      ))}
      <RB s={[1.4, 1.6, 3.4]} rad={0.2} p={[0, 1.15, 0]} c={color} />
      <B s={[1.3, 0.55, 0.05]} p={[0, 1.45, 1.71]} m={glass()} cast={false} />
      <B s={[1.42, 0.18, 3.0]} p={[0, 0.95, -0.15]} c={stripe} cast={false} />
    </group>
  )
}

/** 배달 오토바이(정적, 앞 = +z): 뒤 배달통 */
export function ScooterModel({ box = '#E2453C' }: { box?: string }) {
  return (
    <group>
      {[0.55, -0.55].map((z) => (
        <mesh key={z} geometry={torusGeo(0.25, 0.08)} rotation={[0, Math.PI / 2, 0]} position={[0, 0.3, z]} material={mat('#22262F', { rough: 0.9 })} castShadow />
      ))}
      <B s={[0.32, 0.35, 1.0]} p={[0, 0.5, 0]} c="#E9ECF4" />
      <B s={[0.28, 0.12, 0.55]} p={[0, 0.74, -0.15]} c="#22262F" />
      <B s={[0.06, 0.6, 0.06]} p={[0, 0.85, 0.5]} r={[-0.3, 0, 0]} c="#7E889B" />
      <B s={[0.6, 0.05, 0.05]} p={[0, 1.12, 0.58]} c="#22262F" />
      <RB s={[0.5, 0.45, 0.48]} rad={0.05} p={[0, 0.98, -0.5]} c={box} />
    </group>
  )
}

/** 공유 전동킥보드(정적) */
export function Kickboard({ color = '#35D07F' }: { color?: string }) {
  return (
    <group rotation={[0, 0, 0.06]}>
      <B s={[0.16, 0.06, 0.95]} p={[0, 0.1, 0]} c={color} />
      <B s={[0.05, 1.0, 0.05]} p={[0, 0.6, 0.42]} r={[-0.12, 0, 0]} c="#3B4252" />
      <B s={[0.45, 0.04, 0.04]} p={[0, 1.08, 0.48]} c="#3B4252" />
      {[0.42, -0.42].map((z) => <mesh key={z} geometry={cylGeo(0.08, 0.08, 0.06, 10)} rotation={[0, 0, Math.PI / 2]} position={[0, 0.08, z]} material={mat('#22262F')} />)}
    </group>
  )
}

/** 벤치 */
export function Bench() {
  return (
    <group>
      <B s={[1.8, 0.08, 0.45]} p={[0, 0.45, 0]} c="#B9763E" />
      <B s={[1.8, 0.4, 0.06]} p={[0, 0.72, -0.21]} c="#B9763E" />
      {[-0.75, 0.75].map((x) => <B key={x} s={[0.08, 0.45, 0.45]} p={[x, 0.22, 0]} c="#3B4252" />)}
    </group>
  )
}

/** 소화전 */
export function Hydrant() {
  return (
    <group>
      <Cyl rt={0.14} rb={0.17} h={0.75} p={[0, 0.38, 0]} c="#D9381E" />
      <mesh geometry={sphereGeo(0.15, 10, 8)} position={[0, 0.78, 0]} material={mat('#D9381E')} />
      <B s={[0.42, 0.1, 0.1]} p={[0, 0.5, 0]} c="#D9381E" />
    </group>
  )
}

/** 볼라드(차량 진입 방지 말뚝) */
export function Bollard() {
  return (
    <group>
      <Cyl rt={0.11} h={0.85} p={[0, 0.42, 0]} c="#5B6274" />
      <Cyl rt={0.115} h={0.1} p={[0, 0.7, 0]} c="#F2C233" />
    </group>
  )
}

/** 공사장: 가림막, 골조(기둥·슬래브), 자재 더미. 타워크레인 위쪽(돌아가는 부분)은 world/Town.tsx */
export function ConstructionSite({ w = 30, d = 56 }: { w?: number; d?: number }) {
  const floors = 6
  return (
    <group>
      <Flat s={[w, d]} p={[0, 0]} c="#C9B79A" y={0.02} />
      {/* 가림막(정면에 간판) */}
      <B s={[w, 3, 0.15]} p={[0, 1.5, d / 2]} c="#E9ECF4" />
      <B s={[w, 3, 0.15]} p={[0, 1.5, -d / 2]} c="#E9ECF4" />
      <B s={[0.15, 3, d]} p={[-w / 2, 1.5, 0]} c="#E9ECF4" />
      <B s={[0.15, 3, d - 10]} p={[w / 2, 1.5, -5]} c="#E9ECF4" />
      <B s={[w, 0.3, 0.17]} p={[0, 2.9, d / 2]} c="#2F55E6" />
      <AtlasSign cell={signId('다온 리버뷰 신축 공사')} w={10} h={1.3} p={[0, 1.7, d / 2 + 0.1]} />
      <AtlasSign cell={signId('공사 중 · 안전 제일')} w={4.5} h={0.8} p={[w / 2 + 0.1, 2.2, 3]} r={[0, Math.PI / 2, 0]} />
      {/* 골조: 기둥 + 층 슬래브 */}
      {Array.from({ length: floors }, (_, f) => (
        <group key={f}>
          <B s={[16, 0.25, 12]} p={[-3, 3 + f * 3, -10]} c="#B9BFCB" />
          {[[-10.5, -15.5], [4.5, -15.5], [-10.5, -4.5], [4.5, -4.5], [-3, -15.5], [-3, -4.5]].map(([x, z], i) => (
            <B key={i} s={[0.45, 3, 0.45]} p={[x, 1.5 + f * 3, z]} c="#C9CFDA" />
          ))}
        </group>
      ))}
      {/* 출입구(동쪽 가림막 틈): 양옆 이동식 안전 펜스, 앞 보도에 안전 콘. 자재 더미 둘레도 펜스 */}
      {[d / 2 - 10.6, d / 2 - 0.6].map((z) => (
        <group key={z} position={[w / 2 + 0.5, 0, z]} rotation={[0, Math.PI / 2, 0]}><Prop id="safety-barrier" /></group>
      ))}
      {[d / 2 - 9, d / 2 - 7.6, d / 2 - 3.4, d / 2 - 2].map((z) => (
        <group key={z} position={[w / 2 + 1.4, 0, z]}><Prop id="traffic-cone" /></group>
      ))}
      {[[4.4, 13.3, 0], [7.6, 13.3, 0], [8.9, 12, Math.PI / 2]].map(([x, z, r]) => (
        <group key={`${x}${z}`} position={[x, 0, z]} rotation={[0, r, 0]}><Prop id="safety-barrier" /></group>
      ))}
      {/* 자재 더미 · 컨테이너 사무실 · 레미콘 */}
      <B s={[4, 0.6, 1.2]} p={[6, 0.3, 12]} c="#8A94A8" />
      <B s={[4, 0.6, 1.2]} p={[6, 0.9, 12]} c="#8A94A8" />
      <B s={[6, 2.6, 2.4]} p={[-8, 1.3, 20]} c="#F2C233" />
      <B s={[1.2, 0.9, 0.06]} p={[-8, 1.5, 21.23]} m={glass()} cast={false} />
      <group position={[8, 0, 22]}>
        <B s={[2.3, 1.4, 2.0]} p={[0, 1.6, 3.2]} c="#F4F6FA" />
        <B s={[2.3, 0.4, 6]} p={[0, 0.8, 0]} c="#3B4252" />
        <mesh geometry={cylGeo(1.0, 1.25, 3.2, 14)} rotation={[Math.PI / 2 - 0.3, 0, 0]} position={[0, 2.2, -0.6]} material={mat('#E9ECF4')} castShadow />
      </group>
      {/* 타워크레인 기둥 */}
      <B s={[1.2, 34, 1.2]} p={[9, 17, -10]} c="#F2B92B" />
    </group>
  )
}

/** 다온초등학교: 4층 교사 + 운동장 + 정문 간판 */
export function SchoolBuilding() {
  const geo = boxUV([[12 / 6, 4 / 2.4], [12 / 6, 4 / 2.4], null, null, [44 / 6, 4 / 2.4], [44 / 6, 4 / 2.4]])
  return (
    <group>
      <mesh geometry={geo} position={[0, 6.8, 0]} scale={[44, 13.6, 12]} material={[officeFaceMat(), officeFaceMat(), mat('#E9DCC8'), mat('#E9DCC8'), officeFaceMat(), officeFaceMat()]} castShadow receiveShadow />
      <B s={[44.4, 0.6, 12.4]} p={[0, 13.9, 0]} c="#C8483F" />
      <B s={[6, 4, 2]} p={[-12, 2, 7]} c="#E9DCC8" />
      <AtlasSign cell={signId('다온초등학교')} w={8} h={1.5} p={[0, 12.2, 6.05]} lit />
      {/* 운동장(앞쪽 -z가 아니라 +z) */}
      <Flat s={[40, 18]} p={[0, 17]} c="#D9B98F" y={0.02} />
      <mesh geometry={torusGeo(7, 0.12)} rotation={[-Math.PI / 2, 0, 0]} scale={[2.2, 1, 1]} position={[0, 0.04, 17]} material={mat('#FFFFFF')} />
      {[-17, 17].map((x) => (
        <group key={x} position={[x, 0, 17]}>
          <B s={[0.1, 2.2, 0.1]} p={[0, 1.1, -1.5]} c="#F4F6FB" />
          <B s={[0.1, 2.2, 0.1]} p={[0, 1.1, 1.5]} c="#F4F6FB" />
          <B s={[0.1, 0.1, 3]} p={[0, 2.2, 0]} c="#F4F6FB" />
        </group>
      ))}
    </group>
  )
}

/** 멀리 보이는 주차 차량(저폴리: 상자 몇 개). 앞 = +z */
export function ParkedCar({ color = '#F4F6FA', kind = 'sedan' }: { color?: string; kind?: 'sedan' | 'suv' }) {
  const h = kind === 'suv' ? 0.95 : 0.7
  const tire = mat('#22262F', { rough: 0.9 })
  return (
    <group>
      <B s={[1.8, 0.6, 4.4]} p={[0, 0.6, 0]} c={color} />
      <B s={[1.6, h, kind === 'suv' ? 2.9 : 2.3]} p={[0, 0.9 + h / 2, kind === 'suv' ? -0.3 : -0.2]} c={color} />
      <B s={[1.5, h * 0.6, 0.05]} p={[0, 0.95 + h / 2, kind === 'suv' ? 1.18 : 0.96]} m={glass()} cast={false} />
      {[[0.8, 1.4], [-0.8, 1.4], [0.8, -1.4], [-0.8, -1.4]].map(([x, z], i) => <B key={i} s={[0.24, 0.62, 0.62]} p={[x, 0.31, z]} m={tire} cast={false} />)}
    </group>
  )
}
