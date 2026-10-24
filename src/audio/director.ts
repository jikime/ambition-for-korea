// 시뮬레이션 사건 → 소리. 매 프레임 상태를 이전 값과 비교해 바뀐 순간에만 울린다(시뮬레이션 코드는 고치지 않는다).
//  - 위치 소리: 지금 보는 곳(듣는 위치) 근처에서 일어난 것만 들린다(거리 감쇠)
//  - 안내 음성: 지금 보는 거점의 차량 도착·하차·출발, 그리고 어디서든 중요한 알림(냉동 온도·배터리·경로 변경·배송 완료)
//  - 되감기 중에는 울리지 않는다
import { sim } from '../sim/sim'
import { CARS, RAIL, TRAIN_LEN, carPose, type RailState } from '../sim/rail'
import { DESK, HUB } from '../sim/hub'
import { BARGE, type BargeState } from '../sim/barge'
import { useStore } from '../store'
import { useEnvView } from '../three/env/state'
import { STORY_STEPS } from '../ui/format'
import { sound } from './sound'
import type { Vec3 } from './engine'

/** 듣는 위치(카메라가 보는 곳) */
export interface Ear {
  x: number
  z: number
  /** 카메라와 보는 곳 사이 거리 */
  dist: number
}

const near = (x: number, z: number, e: Ear, r: number) => (x - e.x) ** 2 + (z - e.z) ** 2 < r * r

export class SoundDirector {
  private primed = false
  private rail: RailState = 'BS'
  private barge: BargeState = 'moored'
  private rmg = { BS: 0, GJ: 0 }
  private desk = 'idle'
  private phase = new Map<string, string>()
  private fork = new Map<string, string>()
  private cold = new Set<number>()
  private inc = new Set<number>()
  private story = -1
  private scan = 0

  /** 지금 상태를 기준으로 삼는다(켜자마자 밀린 사건이 한꺼번에 울리지 않게) */
  private prime() {
    const R = sim.rail
    this.rail = R.state
    this.barge = sim.barge.state
    this.rmg = { BS: R.bs.work.done, GJ: R.gj.work.done }
    this.desk = sim.hub.desk.mode
    for (const v of sim.vehicles) this.phase.set(v.id, v.phase)
    for (const f of sim.forklifts) this.fork.set(f.id, f.status)
    for (const m of sim.cold.messages) this.cold.add(m.id)
    for (const i of sim.incidents) if (i.state === 'active') this.inc.add(i.id)
    this.story = sim.story.stage
    this.primed = true
  }

  step(ear: Ear) {
    if (!sound.on || sim.history.replaying) {
      sound.stopLoops()
      this.primed = false
      return
    }
    if (!this.primed) this.prime()
    const st = useStore.getState()
    const onSite = st.view === 'site'
    this.railSounds(ear)
    this.bargeSounds(ear)
    this.hubSounds(ear, onSite)
    this.vehicles(ear, onSite, st.site)
    this.alerts(st.site)
    this.ambience(ear, onSite, st.site)
  }

  // ───────── 내륙 화물선: 출항·입항 기적 · 엔진 · 접안 중 선체에 부딪는 물결
  private bargeSounds(ear: Ear) {
    const b = sim.barge
    const pos: Vec3 = [b.x, 3, b.z]
    if (b.state !== this.barge) {
      if (b.state === 'unberth' || b.state === 'turn') sound.at('barge-horn', pos, { volume: 0.85, ref: 70 })
      this.barge = b.state
    }
    const busy = b.visible && b.state !== 'moored'
    sound.loop('barge-engine', 'barge-engine-loop', busy && near(b.x, b.z, ear, 500), pos, 0.3 + 0.4 * Math.min(1, b.v / BARGE.vmax), 30)
    sound.loop('barge-water', 'water-hull-loop', b.visible && near(b.x, b.z, ear, 250), pos, 0.35, 18)
  }

  // ───────── 철송: 출발 경적 · 달리는 소리 · 도착 제동 · 정차 공회전 · RMG 컨테이너 잠금
  private railSounds(ear: Ear) {
    const R = sim.rail
    const moving = R.state === 'toGJ' || R.state === 'toBS'
    const was = this.rail
    if (was !== R.state) {
      this.rail = R.state
      if (moving) {
        // 앞서가는 기관차에서 경적
        const lead = R.state === 'toGJ' ? CARS[CARS.length - 1] : CARS[0]
        const p = carPose(R.s + lead.u, lead.len)
        sound.at('rail-horn', [p.x, p.y + 4, p.z], { volume: 0.9, ref: 60 })
      } else {
        const p = carPose(R.s + TRAIN_LEN / 2, RAIL.wagonLen)
        sound.at('train-air-brake', [p.x, p.y + 1, p.z], { volume: 0.7, ref: 40 })
        setTimeout(() => sound.at('coupler-clank', [p.x, p.y + 1, p.z], { volume: 0.5, ref: 30 }), 1400)
      }
    }
    const mid = carPose(R.s + TRAIN_LEN / 2, RAIL.wagonLen)
    const k = Math.min(1, R.v / RAIL.vmax)
    sound.loop('rail-run', 'rail-wheel-clatter-loop', moving && R.v > 1.5, [mid.x, mid.y + 1, mid.z], 0.25 + 0.55 * k, 45)
    const loco = carPose(R.s + CARS[0].u, CARS[0].len)
    sound.loop('rail-idle', 'diesel-locomotive-idle-loop', !moving && near(loco.x, loco.z, ear, 600), [loco.x, loco.y + 3, loco.z], 0.3, 25)
    for (const id of ['BS', 'GJ'] as const) {
      const T = id === 'BS' ? R.bs : R.gj
      if (T.work.done > this.rmg[id]) sound.at('container-lock', [T.rmg.x, T.rmg.hy, T.rmg.tz], { volume: 0.55, ref: 20 })
      this.rmg[id] = T.work.done
    }
  }

  // ───────── 곤지암 허브: 크로스벨트 소터 모터, 리젝트 데스크 스캔
  private hubSounds(ear: Ear, onSite: boolean) {
    sound.loop('hub-sorter', 'conveyor-motor-loop', onSite && ear.dist < 260 && near(HUB.cx, HUB.cz, ear, 220), [HUB.cx, 2, HUB.cz], 0.35, 18)
    const mode = sim.hub.desk.mode
    if (mode !== this.desk && sound.gate('scan', 1.5)) {
      if (mode === 'ok') sound.at(`scanner-success-${(this.scan++ % 3) + 1}`, [DESK.x, 1.2, DESK.z], { volume: 0.5, ref: 10 })
      else if (mode === 'manual' || mode === 'irregular') sound.at('scanner-reject', [DESK.x, 1.2, DESK.z], { volume: 0.5, ref: 10 })
    }
    this.desk = mode
  }

  // ───────── 트럭: 정문 도착 제동 · 도크 후진 경보 · 하차 셔터, 보는 거점의 도착·하차·출발 안내
  private vehicles(ear: Ear, onSite: boolean, site: string) {
    for (const v of sim.vehicles) {
      const prev = this.phase.get(v.id)
      if (prev === v.phase) continue
      this.phase.set(v.id, v.phase)
      if (prev === undefined || !v.visible) continue
      const pos: Vec3 = [v.x, 1.6, v.z]
      const here = onSite && v.site === site
      const close = near(v.x, v.z, ear, 320)
      if (v.phase === 'gate') {
        if (close && sound.gate(`brake:${v.id}`, 20) && sound.gate('brake', 2.5)) sound.at('truck-air-brake', pos, { volume: 0.6 })
        if (here && v.kind !== 'van') sound.voice('vehicle-arrival', { radio: sound.gate('radio-toggle', 90), cooldown: 50 })
      } else if (v.phase === 'docking') {
        if (close && sound.gate(`reverse:${v.id}`, 12) && sound.gate('reverse', 3)) sound.at('truck-reverse-alarm', pos, { volume: 0.45, ref: 15 })
      } else if (v.phase === 'unloading') {
        if (close && sound.gate('shutter', 4)) sound.at('cargo-roll-shutter', pos, { volume: 0.45, ref: 15 })
        if (here) sound.voice('unloading-start', { cooldown: 70 })
      } else if (v.phase === 'departing' && (prev === 'loading' || prev === 'closing')) {
        if (here) sound.voice(v.kind === 'van' ? 'dispatch' : 'loading-complete', { cooldown: 70 })
      }
    }
  }

  // ───────── 어디서든 중요한 알림: 냉동 재냉각 · 지게차 배터리 · 돌발 상황 적용 · 따라가는 택배 배송 완료
  private alerts(site: string) {
    for (const m of sim.cold.messages) {
      if (this.cold.has(m.id) || m.status === 'pending') continue
      this.cold.add(m.id)
      if (m.action === 'recool') {
        sound.ui('ui-warning')
        sound.voice('temperature-alert', { cooldown: 40, force: true })
      }
    }
    for (const f of sim.forklifts) {
      const prev = this.fork.get(f.id)
      this.fork.set(f.id, f.status)
      if (prev !== undefined && prev !== 'toCharge' && f.status === 'toCharge' && f.site === site) sound.voice('battery-low', { cooldown: 90 })
    }
    for (const i of sim.incidents) {
      if (i.state !== 'active' || this.inc.has(i.id)) continue
      this.inc.add(i.id)
      sound.ui('ui-warning')
      sound.voice('route-updated', { cooldown: 40 })
    }
    const s = sim.story.stage
    if (s !== this.story) {
      if (s === STORY_STEPS.length - 1) {
        sound.ui('ui-dispatch', 0.5)
        sound.voice('delivery-complete', { cooldown: 20 })
      }
      this.story = s
    }
  }

  // ───────── 환경음: 야드 소음(거점), 창고 안 소음(가까이), 비·눈바람
  private ambience(ear: Ear, onSite: boolean, site: string) {
    const weather = useEnvView.getState().env.weather
    const indoor = onSite && ear.dist < 170 && ['GJ', 'IC', 'DJ', 'IN'].includes(site)
    sound.loop('amb-yard', 'yard-distant-traffic-loop', onSite, null, indoor ? 0.08 : 0.16)
    sound.loop('amb-indoor', 'warehouse-room-loop', indoor, null, 0.18)
    sound.loop('amb-rain', 'light-rain-loop', weather === 'rain', null, onSite ? 0.32 : 0.18)
    sound.loop('amb-wind', 'light-wind-loop', weather === 'snow', null, onSite ? 0.28 : 0.16)
  }
}
