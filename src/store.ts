import { create } from 'zustand'
import type { SiteId } from './sim/world'
import type { EnvSettings } from './sim/env'

export type TrackMode = 'story' | 'sea' | 'air' | 'ret' | 'vehicle' | 'dock' | 'gate'

export type SelKind = 'site' | 'vehicle' | 'forklift' | 'pallet' | 'charger' | 'dock' | 'sorter' | 'crane' | 'story' | 'aircraft' | 'mover' | 'robot' | 'equip'
export interface Selection {
  kind: SelKind
  id: string
}
export type CamCmd = 'zoomIn' | 'zoomOut' | 'rotL' | 'rotR' | 'home' | 'focus' | 'site' | 'network' | 'zone'
export type OpsTab = 'docks' | 'forklifts' | 'vehicles' | 'robots' | 'people'
/** 운영 센터 탭 */
export type CenterTab = 'brief' | 'inquiry' | 'returns' | 'cold' | 'customs' | 'address' | 'scenario' | 'routes' | 'carbon' | 'drivers'

export interface Replay {
  on: boolean
  /** 재생 시각(관제 시계 초) */
  t: number
  playing: boolean
  /** 재생 배속(×1이면 실시간 화면과 같은 빠르기) */
  rate: number
}

interface State {
  tick: number
  site: SiteId
  view: 'site' | 'network'
  speed: number
  selected: Selection | null
  hovered: Selection | null
  follow: boolean
  tracked: string
  /** 하단 추적 패널: 육로 택배 여정 · 해상 여정 · 항공 여정 · 차량 */
  trackMode: TrackMode
  opsTab: OpsTab
  cam: { cmd: CamCmd; n: number; x?: number; z?: number; d?: number } | null
  /** 현장 흐름 투어: 재생 중이면 지금 단계 번호 */
  tour: number | null
  /** 현장 흐름 패널에서 고른 단계 */
  flowStep: string | null
  setTour: (i: number | null) => void
  /** 카메라를 한 구역으로(선택 없이) */
  goZone: (x: number, z: number, d: number, site?: SiteId) => void
  setFlowStep: (k: string | null) => void
  /** 3D 위 이름표(트럭 상태 칩 · 선택 이름표)를 보이나 */
  labels: boolean
  /** 이름표 묶음: 차량(트럭 상태 칩) · 시설(작업 단계 이름표) · 전체 */
  lens: 'vehicles' | 'facilities' | 'all'
  setLens: (l: 'vehicles' | 'facilities' | 'all') => void
  /** 전국 보기 차량 점 색: 차종 / 도착 약속 상태 */
  beaconMode: 'kind' | 'promise'
  setBeaconMode: (m: 'kind' | 'promise') => void
  /** 화면 패널(KPI · 현장 흐름 · 인스펙터 · 하단 패널)을 보이나: 끄면 3D 장면만 */
  panels: boolean
  setLabels: (on: boolean) => void
  setPanels: (on: boolean) => void
  /** 재생 막대(되감기): 보이나, 재생 상태(on이면 시뮬레이션이 멈추고 기록을 보여 준다) */
  timeline: boolean
  replay: Replay
  setTimeline: (on: boolean) => void
  setReplay: (p: Partial<Replay>) => void
  toast: { text: string; n: number } | null
  /** 계절·시간대·날씨. 'auto'면 날짜·관제 시계를 따른다 */
  env: EnvSettings
  setEnv: (patch: Partial<EnvSettings>) => void
  /** 상단 AI 설정 창이 열려 있는가 */
  aiOpen: boolean
  setAiOpen: (open: boolean) => void
  /** 운영 센터 창(열린 탭, 닫혀 있으면 null) */
  center: CenterTab | null
  openCenter: (t: CenterTab | null) => void
  select: (s: Selection | null, site?: SiteId) => void
  hover: (s: Selection | null) => void
  setFollow: (f: boolean) => void
  setTab: (t: OpsTab) => void
  setSite: (id: SiteId) => void
  showNetwork: () => void
  setSpeed: (n: number) => void
  followStory: () => void
  setTrackMode: (m: TrackMode) => void
  camera: (cmd: CamCmd) => void
  notify: (text: string) => void
  bump: () => void
}

export const useStore = create<State>((set, get) => ({
  tick: 0,
  site: 'GJ',
  view: 'site',
  speed: 1,
  selected: null,
  hovered: null,
  follow: false,
  tracked: 'TR-2205',
  trackMode: 'story',
  opsTab: 'vehicles',
  cam: null,
  toast: null,
  env: { season: 'auto', time: 'auto', weather: 'auto' },
  setEnv: (patch) => set({ env: { ...get().env, ...patch } }),
  aiOpen: false,
  setAiOpen: (open) => set({ aiOpen: open }),
  center: null,
  openCenter: (t) => set({ center: t }),
  select: (s, site) => {
    const patch: Partial<State> = { selected: s, follow: !!s && (s.kind === 'vehicle' || s.kind === 'forklift' || s.kind === 'story' || s.kind === 'aircraft' || s.kind === 'mover' || s.kind === 'robot' || s.kind === 'equip'), view: 'site' }
    if (s?.kind === 'vehicle') {
      patch.tracked = s.id
      patch.trackMode = 'vehicle'
    }
    if (s?.kind === 'story') patch.trackMode = s.id === 'sea' || s.id === 'air' || s.id === 'ret' ? s.id : 'story'
    if (s?.kind === 'site') patch.site = s.id as SiteId
    else if (site) patch.site = site
    set(patch)
    set({ cam: { cmd: 'focus', n: (get().cam?.n ?? 0) + 1 } })
  },
  hover: (s) => {
    const h = get().hovered
    if (h?.id === s?.id && h?.kind === s?.kind) return
    set({ hovered: s })
    document.body.style.cursor = s ? 'pointer' : ''
  },
  setFollow: (f) => set({ follow: f }),
  setTab: (t) => set({ opsTab: t }),
  setSite: (id) => {
    set({ site: id, selected: null, follow: false, view: 'site' })
    set({ cam: { cmd: 'site', n: (get().cam?.n ?? 0) + 1 } })
  },
  showNetwork: () => {
    set({ selected: null, follow: false, view: 'network' })
    set({ cam: { cmd: 'network', n: (get().cam?.n ?? 0) + 1 } })
  },
  setSpeed: (n) => set({ speed: n }),
  followStory: () => get().select({ kind: 'story', id: 'story' }),
  setTrackMode: (m) => set({ trackMode: m }),
  camera: (cmd) => set({ cam: { cmd, n: (get().cam?.n ?? 0) + 1 } }),
  tour: null,
  flowStep: null,
  setTour: (i) => set({ tour: i }),
  goZone: (x, z, d, site) => set({ cam: { cmd: 'zone', n: (get().cam?.n ?? 0) + 1, x, z, d }, selected: null, follow: false, view: 'site', ...(site ? { site } : {}) }),
  setFlowStep: (k) => set({ flowStep: k }),
  labels: true,
  lens: 'vehicles',
  setLens: (l) => set({ lens: l, labels: true }),
  panels: true,
  beaconMode: 'kind',
  setBeaconMode: (m) => set({ beaconMode: m }),
  setLabels: (on) => set({ labels: on }),
  setPanels: (on) => set({ panels: on }),
  timeline: false,
  replay: { on: false, t: 0, playing: false, rate: 4 },
  setTimeline: (on) => set({ timeline: on }),
  setReplay: (p) => set({ replay: { ...get().replay, ...p } }),
  notify: (text) => set({ toast: { text, n: (get().toast?.n ?? 0) + 1 } }),
  bump: () => set({ tick: get().tick + 1 }),
}))
