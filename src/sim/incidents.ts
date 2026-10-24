// 교통·기상·현장 돌발 상황. 문장은 AI가 읽어 "어느 구간에 얼마나" 영향을 주는지 판단하고,
// 속도 제한·우회·해제 같은 운영 정책은 코드가 정한다.
import type { Leg } from './path'
import { L, LL } from '../i18n'

export type LinkId = 'hw_ic_gj' | 'hw_gj_in' | 'hw_gj_bs' | 'hw_gj_ap' | 'hw_gj_dj' | 'town_gate' | 'port_crane'
export const LINK_IDS: LinkId[] = ['hw_ic_gj', 'hw_gj_in', 'hw_gj_bs', 'hw_gj_ap', 'hw_gj_dj', 'town_gate', 'port_crane']

export const LINK_LABEL: Record<LinkId | 'none', string> = {
  hw_ic_gj: L('이천↔곤지암 간선', 'Icheon↔Gonjiam linehaul'),
  hw_gj_in: L('곤지암↔인천 간선', 'Gonjiam↔Incheon linehaul'),
  hw_gj_bs: L('곤지암↔부산신항 간선', 'Gonjiam↔Busan New Port linehaul'),
  hw_gj_ap: L('곤지암↔인천공항 간선', 'Gonjiam↔Incheon Airport linehaul'),
  hw_gj_dj: L('곤지암↔대전 간선', 'Gonjiam↔Daejeon linehaul'),
  town_gate: L('다온마을 정문', 'Daon Village gate'),
  port_crane: L('부산신항 안벽 크레인', 'Busan New Port quay cranes'),
  none: L('운영 구간 밖', 'Outside our network'),
}

/** 지도 위 표시 위치(x, z) */
export const LINK_POS: Record<LinkId, [number, number]> = {
  hw_ic_gj: [217, 50],
  hw_gj_in: [-165, 48],
  hw_gj_bs: [180, 170],
  hw_gj_ap: [-560, 48],
  hw_gj_dj: [560, 48],
  town_gate: [-404, 150],
  port_crane: [255, 292],
}

export interface IncidentAnswer {
  link: string
  linkConfidence: number
  impact: number
  impactConfidence: number
}

export interface Incident {
  id: number
  time: number
  text: string
  source: string
  truth: { link: LinkId | 'none'; impact: number } | null
  ai: IncidentAnswer | null
  status: 'pending' | 'ready' | 'error'
  state: 'reading' | 'active' | 'confirm' | 'info' | 'ignored' | 'cleared'
  applied: { link: LinkId; impact: number } | null
  decision: string
  /** 활성 상태가 끝나는 시뮬레이션 경과 시간 */
  until: number
  duration: number
}

/** 영향 점수(0~3)를 속도 배율로. 전면 통제여도 남은 차로·갓길로 20%는 움직인다(따로 우회로를 만들지 않음) */
export function impactFactor(impact: number) {
  return Math.max(0.2, Math.min(1, 1 - 0.27 * impact))
}

/** 경로 다리가 어느 링크인지(거점 게이트 x 위치로 판정). 지도 밖(W/E)으로 가는 구간은 제외 */
export function linkOfLeg(l: Leg): LinkId | null {
  const pts = l.path.pts
  if (l.tag === 'approach' || l.tag === 'exit') return pts.some((p) => Math.abs(p.x - 180) < 4) ? 'hw_gj_bs' : null
  if (l.tag !== 'highway') return null
  const a = pts[0].x
  const b = pts[pts.length - 1].x
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  if (lo > 0 && hi > 300 && hi < 400) return 'hw_ic_gj'
  if (lo < -300 && lo > -420 && hi < 120) return 'hw_gj_in'
  if (lo > 0 && hi > 120 && hi < 300) return 'hw_gj_bs'
  // 인천공항 접속로(x −700)까지 가는 구간 · 대전 정문(x 700)까지 가는 구간
  if (lo < -600 && hi < 120) return 'hw_gj_ap'
  if (lo > 0 && hi > 600) return 'hw_gj_dj'
  return null
}

/** 자동으로 들어오는 교통·기상 정보(가상). truth는 판독 정확도 확인용 */
export const INCIDENT_POOL: { text: string; source: string; link: LinkId | 'none'; impact: number; dur: number }[] = LL([
  { text: '영동고속도로 이천IC 부근 화물차 추돌, 2개 차로 통제 중', source: '도로공사 교통정보', link: 'hw_ic_gj', impact: 2, dur: 160 },
  { text: '이천IC~곤지암IC 양방향 전면 통제 (차량 화재)', source: '도로공사 교통정보', link: 'hw_ic_gj', impact: 3, dur: 120 },
  { text: '곤지암IC 진출로 가벼운 정체', source: '내비 교통정보', link: 'hw_ic_gj', impact: 1, dur: 140 },
  { text: '인천 방향 고속도로 도로 공사로 1개 차로 통제, 30분 지연 예상', source: '도로공사 교통정보', link: 'hw_gj_in', impact: 2, dur: 180 },
  { text: '수도권 서부 인천 방향 사고 처리 완료, 정상 소통', source: '도로공사 교통정보', link: 'hw_gj_in', impact: 0, dur: 0 },
  { text: '다온마을 정문 앞 상수도 공사로 차량 진입 불가', source: '관리사무소 공지', link: 'town_gate', impact: 3, dur: 160 },
  { text: '다온마을 단지 입구 이삿짐 차량 때문에 서행', source: '배송 기사 메시지', link: 'town_gate', impact: 1, dur: 120 },
  { text: '부산신항 강풍주의보 발령, 안벽 크레인 작업 속도 제한', source: '부산항만공사', link: 'port_crane', impact: 2, dur: 200 },
  { text: '부산신항 순간풍속 25m/s, 크레인 작업 전면 중지', source: '부산항만공사', link: 'port_crane', impact: 3, dur: 120 },
  { text: '부산 가는 남쪽 도로 폭우로 시야 불량, 전 차량 서행', source: '기상청 특보', link: 'hw_gj_bs', impact: 2, dur: 180 },
  { text: '부산 방향 남쪽 도로 정체 해소, 정상 소통', source: '내비 교통정보', link: 'hw_gj_bs', impact: 0, dur: 0 },
  { text: '인천공항 방향 영종대교 안개로 서행, 15분 지연', source: '도로공사 교통정보', link: 'hw_gj_ap', impact: 1, dur: 160 },
  { text: '공항고속도로 공항 방향 화물차 고장으로 2개 차로 통제', source: '도로공사 교통정보', link: 'hw_gj_ap', impact: 2, dur: 150 },
  { text: '중부고속도로 대전 방향 공사 구간 정체 40분', source: '도로공사 교통정보', link: 'hw_gj_dj', impact: 2, dur: 180 },
  { text: '대전 방향 고속도로 사고 처리 완료, 정상 소통', source: '내비 교통정보', link: 'hw_gj_dj', impact: 0, dur: 0 },
  { text: '서울 강남역 인근 집회로 일부 도로 통제', source: '경찰청 교통정보', link: 'none', impact: 0, dur: 0 },
  { text: '제주공항 강풍으로 항공편 다수 결항', source: '기상청 특보', link: 'none', impact: 0, dur: 0 },
], [
  { text: 'Truck rear-end collision near Icheon IC on the Yeongdong Expressway, 2 lanes closed', source: 'Expressway traffic info', link: 'hw_ic_gj', impact: 2, dur: 160 },
  { text: 'Icheon IC–Gonjiam IC fully closed in both directions (vehicle fire)', source: 'Expressway traffic info', link: 'hw_ic_gj', impact: 3, dur: 120 },
  { text: 'Light congestion on the Gonjiam IC exit ramp', source: 'Navigation traffic info', link: 'hw_ic_gj', impact: 1, dur: 140 },
  { text: 'Roadwork on the Incheon-bound expressway, 1 lane closed, 30 min delay expected', source: 'Expressway traffic info', link: 'hw_gj_in', impact: 2, dur: 180 },
  { text: 'Crash cleared on the Incheon-bound road in the western capital area, traffic flowing normally', source: 'Expressway traffic info', link: 'hw_gj_in', impact: 0, dur: 0 },
  { text: 'Water main work in front of the Daon Village main gate, no vehicle entry', source: 'Management office notice', link: 'town_gate', impact: 3, dur: 160 },
  { text: 'Slow traffic at the Daon Village complex entrance due to a moving truck', source: 'Delivery driver message', link: 'town_gate', impact: 1, dur: 120 },
  { text: 'Strong wind advisory at Busan New Port, quay crane speed restricted', source: 'Busan Port Authority', link: 'port_crane', impact: 2, dur: 200 },
  { text: 'Gusts of 25 m/s at Busan New Port, all crane work stopped', source: 'Busan Port Authority', link: 'port_crane', impact: 3, dur: 120 },
  { text: 'Heavy rain on the southern road to Busan, poor visibility, all vehicles slowing down', source: 'KMA weather warning', link: 'hw_gj_bs', impact: 2, dur: 180 },
  { text: 'Busan-bound southern road congestion cleared, traffic flowing normally', source: 'Navigation traffic info', link: 'hw_gj_bs', impact: 0, dur: 0 },
  { text: 'Fog on Yeongjong Bridge toward Incheon Airport, slow traffic, 15 min delay', source: 'Expressway traffic info', link: 'hw_gj_ap', impact: 1, dur: 160 },
  { text: 'Broken-down truck on the Airport Expressway (airport-bound), 2 lanes closed', source: 'Expressway traffic info', link: 'hw_gj_ap', impact: 2, dur: 150 },
  { text: 'Jungbu Expressway Daejeon-bound: 40 min of congestion in a work zone', source: 'Expressway traffic info', link: 'hw_gj_dj', impact: 2, dur: 180 },
  { text: 'Crash cleared on the Daejeon-bound expressway, traffic flowing normally', source: 'Navigation traffic info', link: 'hw_gj_dj', impact: 0, dur: 0 },
  { text: 'Some roads closed near Gangnam Station, Seoul, due to a rally', source: 'Police traffic info', link: 'none', impact: 0, dur: 0 },
  { text: 'Many flights canceled at Jeju Airport due to strong winds', source: 'KMA weather warning', link: 'none', impact: 0, dur: 0 },
])
