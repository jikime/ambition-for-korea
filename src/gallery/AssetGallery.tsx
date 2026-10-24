import type { ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { BoxTruckModel, CarModel, ChassisModel, Container40, HandCart, ReeferModel, TractorModel, VanModel, WingTruckModel } from '../three/models/vehicles'
import { AptBlock, BusStop, CaseSealer, GuardHouse, ParcelLocker, PickStation, Playground, QuayCrane, ReachStacker, ShopRow, StretchWrapper, TrafficLight, Villa } from '../three/models/sites'
import { ChargerModel, Cone, ForkliftModel, PalletModel, PalletStack, Person, PinModel, RollCage } from '../three/models/equipment'
import { Office, ShippingContainer, StreetLight } from '../three/models/structures'
import { mat, unitPlane } from '../three/kit'
import { LogoMark, Avatar, ItemIcon, Glyph, CarrierMark } from '../ui/icons'
import type { ItemKey } from '../sim/data'
import { AircraftModel } from '../three/models/aircraft'
import { ContainerShip } from '../three/models/ship'
import { ControlTowerAP, FireStation, RadarTower, Windsock } from '../three/models/airport'
import { Billboard, GasStation } from '../three/world/Roadside'
import { AC_GROUND_Y } from '../sim/airport'
import { L } from '../i18n'

function Slot({ p, label, children, rot = -0.6 }: { p: [number, number]; label: string; children: ReactNode; rot?: number }) {
  return (
    <group position={[p[0], 0, p[1]]}>
      <group rotation={[0, rot, 0]}>{children}</group>
      <Html position={[0, 0, 4.5]} center style={{ pointerEvents: 'none' }}>
        <div className="whitespace-nowrap rounded-md bg-white/90 px-2 py-1 text-[11px] font-semibold text-ink shadow">{label}</div>
      </Html>
    </group>
  )
}

export default function AssetGallery() {
  const items: ItemKey[] = ['water', 'rice', 'ramen', 'tissue', 'detergent', 'petfood', 'box', 'helmet']
  return (
    <div className="relative h-full w-full">
      <Canvas shadows camera={{ position: [140, 260, 430], fov: 32, far: 3000 }} gl={{ toneMapping: THREE.NeutralToneMapping }}>
        <color attach="background" args={['#E7EBF6']} />
        <hemisphereLight args={['#FFFFFF', '#C3CCE6', 1.5]} />
        <directionalLight position={[40, 60, 50]} intensity={2.1} castShadow shadow-mapSize={[4096, 4096]} shadow-camera-left={-120} shadow-camera-right={120} shadow-camera-top={120} shadow-camera-bottom={-120} />
        <mesh geometry={unitPlane} scale={[400, 1, 400]} material={mat('#EEF1F8')} receiveShadow />
        <Slot p={[-30, -16]} label={L('1톤 배송 탑차', '1-ton delivery van')}><VanModel /></Slot>
        <Slot p={[-22, -16]} label={L('1톤 탑차 · 문 열림', '1-ton van · Doors open')}><VanModel open={1} /></Slot>
        <Slot p={[-10, -16]} label={L('5톤 윙바디 · 다온', '5-ton wing-body · Daon')}><WingTruckModel carrier="daon" /></Slot>
        <Slot p={[2, -16]} label={L('윙바디 · 날개 열림 · 바로', 'Wing-body · Wings open · Baro')}><WingTruckModel carrier="baro" open={1} /></Slot>
        <Slot p={[14, -16]} label={L('윙바디 · 동해', 'Wing-body · Donghae')}><WingTruckModel carrier="donghae" open={0.5} /></Slot>
        <Slot p={[26, -16]} label={L('11톤 간선 탑차 · 한길', '11-ton linehaul box truck · Hangil')}><BoxTruckModel carrier="hangil" open={0.6} /></Slot>
        <Slot p={[-30, 0]} label={L('전동 지게차', 'Electric forklift')}><ForkliftModel fork={0.9}><group position={[0, 0.03, 1.55]}><PalletModel look="water" height={1} /></group></ForkliftModel></Slot>
        <Slot p={[-24, 0]} label={L('파렛트 · 박스', 'Pallet · Boxes')}><PalletModel look="boxes" /></Slot>
        <Slot p={[-20, 0]} label={L('파렛트 · 생수', 'Pallet · Bottled water')}><PalletModel look="water" /></Slot>
        <Slot p={[-16, 0]} label={L('파렛트 · 화장지', 'Pallet · Toilet paper')}><PalletModel look="wrapped" /></Slot>
        <Slot p={[-12, 0]} label={L('파렛트 · 혼적', 'Pallet · Mixed load')}><PalletModel look="mixed" /></Slot>
        <Slot p={[-8, 0]} label={L('빈 파렛트 더미', 'Empty pallet stack')}><PalletStack n={7} /></Slot>
        <Slot p={[-4, 0]} label={L('롤테이너', 'Roll cage')}><RollCage fill={0.6} glb={false} /></Slot>
        <Slot p={[0, 0]} label={L('충전기', 'Charger')}><ChargerModel active /></Slot>
        <Slot p={[4, 0]} label={L('작업자', 'Worker')}><Person /></Slot>
        <Slot p={[8, 0]} label={L('위치 핀', 'Location pin')}><PinModel /></Slot>
        <Slot p={[12, 0]} label={L('교통 콘', 'Traffic cone')}><Cone /></Slot>
        <Slot p={[17, 0]} label={L('승용차', 'Car')}><CarModel color="#5D79E8" /></Slot>
        <Slot p={[23, 0]} label="SUV"><CarModel kind="suv" color="#2D3445" /></Slot>
        <Slot p={[30, 0]} label={L('컨테이너', 'Container')}><ShippingContainer name="HANMAR" color="#1F9C9A" /></Slot>
        <Slot p={[-20, 20]} label={L('관리동', 'Admin building')} rot={0}><Office p={[0, 0]} w={14} d={9} /></Slot>
        <Slot p={[0, 20]} label={L('가로등', 'Street light')} rot={0}><StreetLight p={[0, 0]} /></Slot>
        <Slot p={[-30, 40]} label={L('5톤 냉동탑차', '5-ton reefer truck')}><ReeferModel open={0.6} /></Slot>
        <Slot p={[-14, 40]} label={L('컨테이너 트랙터 + 섀시', 'Container tractor + chassis')}><group><TractorModel carrier="hangil" /><group position={[0, 0, -8.6]}><ChassisModel /><group position={[0, 1.28, 0]}><Container40 color="#5FAFAA" name="DAON" /></group></group></group></Slot>
        <Slot p={[4, 40]} label={L('택배 기사 + 핸드카트', 'Parcel driver + hand cart')}><group><Person vest="#2F55E6" cap /><group position={[0, 0, 0.75]}><HandCart /></group></group></Slot>
        <Slot p={[10, 40]} label={L('스트레치 랩핑기', 'Stretch wrapper')}><StretchWrapper /></Slot>
        <Slot p={[17, 40]} label={L('피킹 스테이션', 'Picking station')}><PickStation /></Slot>
        <Slot p={[23, 40]} label={L('자동 봉함기', 'Case sealer')}><CaseSealer /></Slot>
        <Slot p={[29, 40]} label={L('무인택배함', 'Parcel locker')}><ParcelLocker /></Slot>
        <Slot p={[35, 40]} label={L('단지 경비실', 'Complex security office')}><GuardHouse /></Slot>
        <Slot p={[42, 40]} label={L('신호등', 'Traffic light')} rot={0}><TrafficLight /></Slot>
        <Slot p={[49, 40]} label={L('버스 정류장', 'Bus stop')} rot={0}><BusStop name="다온마을 입구" /></Slot>
        <Slot p={[-30, 62]} label={L('리치스태커', 'Reach stacker')}><ReachStacker /></Slot>
        <Slot p={[-10, 62]} label={L('놀이터', 'Playground')} rot={0}><Playground /></Slot>
        <Slot p={[10, 66]} label={L('필로티 빌라', 'Piloti villa')} rot={-0.3}><Villa name="다솜하우스" /></Slot>
        <Slot p={[34, 66]} label={L('1층 상가', 'Ground-floor shops')} rot={-0.3}><ShopRow /></Slot>
        <Slot p={[-40, 100]} label={L('아파트 동', 'Apartment block')} rot={0}><AptBlock h={22} label="101동" /></Slot>
        <Slot p={[20, 110]} label={L('안벽 크레인(STS)', 'Quay crane (STS)')} rot={0}><QuayCrane /></Slot>
        {/* 항공 · 해상 · 도로변 */}
        <Slot p={[-40, 150]} label={L('다온항공 747-8F형 화물기', 'Daon Air 747-8F freighter')} rot={-2.2}><group position={[0, AC_GROUND_Y, 0]}><AircraftModel airline="daon" /></group></Slot>
        <Slot p={[40, 150]} label={L('한빛카고 777F형 화물기', 'Hanbit Cargo 777F freighter')} rot={-2.2}><group position={[0, AC_GROUND_Y, 0]}><AircraftModel airline="hanbit" /></group></Slot>
        <Slot p={[-95, 40]} label={L('공항 관제탑', 'Airport control tower')} rot={0}><ControlTowerAP /></Slot>
        <Slot p={[-95, 90]} label={L('레이더 · 풍향계', 'Radar · Windsock')} rot={0}><group><RadarTower /><group position={[8, 0, 0]}><Windsock /></group></group></Slot>
        <Slot p={[75, 100]} label={L('공항 소방대', 'Airport fire station')} rot={0}><FireStation /></Slot>
        <Slot p={[80, 62]} label={L('주유소', 'Gas station')} rot={0}><GasStation p={[0, 0]} /></Slot>
        <Slot p={[-65, 70]} label={L('대형 광고판(LED)', 'LED billboard')} rot={0}><Billboard ads={['air', 'dawn', 'tv']} p={[0, 0]} /></Slot>
        <Slot p={[0, 240]} label={L('컨테이너선 DAON OCEAN', 'Container ship DAON OCEAN')} rot={0}><ContainerShip bays={[-60, -40, -20, 0, 20, 40]} /></Slot>
        <OrbitControls target={[0, 0, 110]} />
      </Canvas>
      <div className="panel absolute bottom-4 left-4 flex items-center gap-4 p-3">
        <LogoMark size={36} />
        <Avatar size={40} />
        {(['daon', 'baro', 'donghae', 'hangil', 'daonair'] as const).map((c) => <CarrierMark key={c} carrier={c} size={28} />)}
        {items.map((i) => <ItemIcon key={i} item={i} size={26} />)}
        {(['site', 'wing', 'van', 'forklift', 'pallet', 'charger', 'dock', 'sorter'] as const).map((k) => <Glyph key={k} kind={k} size={36} />)}
      </div>
    </div>
  )
}
