// 가상 데이터 사전. 실존 택배사·인물과 무관한 이름만 사용한다.
import { L, LL } from '../i18n'

export type CarrierKey = 'daon' | 'baro' | 'donghae' | 'hangil' | 'daonair'

export interface Carrier {
  name: string
  en: string
  color: string
  dark: string
  light: string
}

export const CARRIERS: Record<CarrierKey, Carrier> = {
  daon: { name: L('다온로지스', 'Daon Logistics'), en: 'DAON LOGIS', color: '#2F55E6', dark: '#1E3BB3', light: '#E6ECFF' },
  baro: { name: L('바로익스프레스', 'Baro Express'), en: 'BARO EXPRESS', color: '#13A39A', dark: '#0C7A73', light: '#DDF5F2' },
  donghae: { name: L('동해운수', 'Donghae Transport'), en: 'DONGHAE TRANS', color: '#F07A2A', dark: '#C45A14', light: '#FDEBDD' },
  hangil: { name: L('한길화물', 'Hangil Cargo'), en: 'HANGIL CARGO', color: '#22377F', dark: '#16245A', light: '#E1E6F5' },
  daonair: { name: L('다온항공 카고', 'Daon Air Cargo'), en: 'DAON AIR CARGO', color: '#3A9BD9', dark: '#1F6FA8', light: '#E3F2FB' },
}

export type ItemKey = 'water' | 'rice' | 'ramen' | 'tissue' | 'detergent' | 'petfood' | 'box' | 'helmet'
export type PalletLook = 'boxes' | 'water' | 'wrapped' | 'mixed'

export interface Item {
  name: string
  category: string
  unitKg: number
  look: PalletLook
  perPallet: number
}

export const ITEMS: Record<ItemKey, Item> = {
  water: { name: L('생수 2L × 6입', 'Bottled water 2L × 6'), category: L('식품', 'Food'), unitKg: 12.4, look: 'water', perPallet: 60 },
  rice: { name: L('즉석밥 210g × 24입', 'Instant rice 210g × 24'), category: L('식품', 'Food'), unitKg: 5.4, look: 'boxes', perPallet: 96 },
  ramen: { name: L('라면 멀티팩 5입', 'Ramen multipack × 5'), category: L('식품', 'Food'), unitKg: 2.9, look: 'boxes', perPallet: 120 },
  tissue: { name: L('화장지 30롤', 'Toilet paper 30 rolls'), category: L('생활용품', 'Household'), unitKg: 4.1, look: 'wrapped', perPallet: 48 },
  detergent: { name: L('세탁세제 3L × 4입', 'Laundry detergent 3L × 4'), category: L('생활용품', 'Household'), unitKg: 13.2, look: 'boxes', perPallet: 54 },
  petfood: { name: L('반려견 사료 6kg', 'Dog food 6kg'), category: L('반려용품', 'Pet supplies'), unitKg: 6.2, look: 'mixed', perPallet: 80 },
  box: { name: L('택배 상자 (중)', 'Shipping box (M)'), category: L('포장재', 'Packaging'), unitKg: 0.4, look: 'boxes', perPallet: 400 },
  helmet: { name: L('안전모', 'Safety helmet'), category: L('안전용품', 'Safety gear'), unitKg: 0.45, look: 'mixed', perPallet: 120 },
}

export const DRIVERS = LL([
  '김도윤', '이서준', '박지호', '최민재', '정하준', '강지훈', '조은우', '윤시우', '장건우', '임도현',
  '한승민', '오태윤', '서준혁', '신동하', '권태양', '황민성', '안재원', '송현우', '류성진', '전우진',
  '이하은', '박서연', '최지아', '정수아', '김나연', '배유나',
], [
  'Kim Do-yun', 'Lee Seo-jun', 'Park Ji-ho', 'Choi Min-jae', 'Jeong Ha-jun', 'Kang Ji-hun', 'Jo Eun-u', 'Yun Si-u', 'Jang Geon-u', 'Lim Do-hyeon',
  'Han Seung-min', 'Oh Tae-yun', 'Seo Jun-hyeok', 'Shin Dong-ha', 'Kwon Tae-yang', 'Hwang Min-seong', 'Ahn Jae-won', 'Song Hyeon-u', 'Ryu Seong-jin', 'Jeon U-jin',
  'Lee Ha-eun', 'Park Seo-yeon', 'Choi Ji-a', 'Jeong Su-a', 'Kim Na-yeon', 'Bae Yu-na',
])

export const CUSTOMERS = LL(
  ['하루마켓', '온담푸드', '다솜리빙', '바른생활몰', '초록상회', '모아마트', '해밀커머스', '늘봄유통'],
  ['Haru Market', 'Ondam Food', 'Dasom Living', 'Bareun Life Mall', 'Chorok Store', 'Moa Mart', 'Haemil Commerce', 'Neulbom Distribution'],
)
export const ORIGINS = LL(
  ['인천 서구', '평택 포승', '용인 처인', '이천 마장', '김포 고촌', '화성 동탄', '안산 단원'],
  ['Seo-gu, Incheon', 'Poseung, Pyeongtaek', 'Cheoin, Yongin', 'Majang, Icheon', 'Gochon, Gimpo', 'Dongtan, Hwaseong', 'Danwon, Ansan'],
)
export const LINEHAUL_DESTS = LL(
  ['대전 중부허브', '부산신항 물류센터', '인천 서브터미널', '이천 콜드체인센터', '원주 서브', '대구 서브'],
  ['Daejeon Central Hub', 'Busan New Port Logistics Center', 'Incheon Sub-terminal', 'Icheon Cold Chain Center', 'Wonju Sub-terminal', 'Daegu Sub-terminal'],
)
export const DELIVERY_ZONES = LL([
  '곤지암읍', '초월읍', '도척면', '퇴촌면', '오포읍', '경안동', '쌍령동', '송정동', '탄벌동', '역동', '목현동', '신현동',
], [
  'Gonjiam-eup', 'Chowol-eup', 'Docheok-myeon', 'Toechon-myeon', 'Opo-eup', 'Gyeongan-dong', 'Ssangnyeong-dong', 'Songjeong-dong', 'Tanbeol-dong', 'Yeok-dong', 'Mokhyeon-dong', 'Sinhyeon-dong',
])

export interface SiteInfo {
  id: string
  name: string
  type: string
  address: string
  utilization: number
  docksBusy: number
  docksTotal: number
  inbound: number
  ready: boolean
}

export const SITES: SiteInfo[] = [
  { id: 'GJ-01', name: L('곤지암 메가허브', 'Gonjiam Mega Hub'), type: L('메가허브', 'Mega hub'), address: L('경기 광주시 곤지암읍 다온로 120', '120 Daon-ro, Gonjiam-eup, Gwangju-si, Gyeonggi'), utilization: 72, docksBusy: 4, docksTotal: 6, inbound: 2, ready: true },
  { id: 'DJ-02', name: L('대전 중부허브', 'Daejeon Central Hub'), type: L('간선 허브', 'Linehaul hub'), address: L('대전 대덕구 다온물류로 45', '45 Daonmullyu-ro, Daedeok-gu, Daejeon'), utilization: 79, docksBusy: 2, docksTotal: 4, inbound: 2, ready: false },
  { id: 'IC-03', name: L('이천 콜드체인센터', 'Icheon Cold Chain Center'), type: L('콜드체인', 'Cold chain'), address: L('경기 이천시 마장면 냉장로 7', '7 Naengjang-ro, Majang-myeon, Icheon-si, Gyeonggi'), utilization: 71, docksBusy: 1, docksTotal: 3, inbound: 2, ready: false },
  { id: 'BS-04', name: L('부산신항 물류센터', 'Busan New Port Logistics Center'), type: L('항만 물류', 'Port logistics'), address: L('부산 강서구 신항배후로 220', '220 Sinhangbaehu-ro, Gangseo-gu, Busan'), utilization: 38, docksBusy: 2, docksTotal: 6, inbound: 2, ready: false },
  { id: 'IN-05', name: L('인천 서브터미널', 'Incheon Sub-terminal'), type: L('서브터미널', 'Sub-terminal'), address: L('인천 서구 배송로 88', '88 Baesong-ro, Seo-gu, Incheon'), utilization: 66, docksBusy: 1, docksTotal: 4, inbound: 3, ready: false },
]

export const MANAGER = { name: L('이수민', 'Lee Su-min'), role: L('운영 매니저', 'Operations manager') }

/** 결정론적 의사난수. 같은 시드면 같은 장면이 나온다. */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const rand = mulberry32(20261004)
export const pick = <T,>(arr: readonly T[], r = rand) => arr[Math.floor(r() * arr.length)]
export const randInt = (min: number, max: number, r = rand) => Math.floor(min + r() * (max - min + 1))

export function plate(kind: 'truck' | 'van') {
  const n = randInt(1000, 9999)
  if (kind === 'van') {
    const a = randInt(80, 89)
    return L(`경기 ${a}배 ${n}`, `Gyeonggi ${a}-bae ${n}`)
  }
  const a = randInt(90, 98)
  const s = pick(LL(['사', '아', '자'], ['sa', 'a', 'ja']))
  return L(`경기 ${a}${s} ${n}`, `Gyeonggi ${a}-${s} ${n}`)
}

export function invoiceNo() {
  const g = () => String(randInt(1000, 9999))
  return `${g()}-${g()}-${g()}`
}
