// 화면 소리: 켜기·끄기(이 탭에서만 기억), 장면 위치 소리, 반복음, 안내 음성.
// 기본 켜짐이지만 브라우저 정책상 첫 클릭·터치·키 입력이 있어야 실제로 들린다(그때 자동으로 켠다).
// 이 탭에서 직접 끄면 꺼진 채로 둔다. 안내 음성은 화면 언어를 따르고, 겹치지 않게 차례로,
// 같은 안내는 잠시 쉬었다가 다시 한다(배속을 올려도 쏟아지지 않게 실제 시간으로 잰다).
import { AudioEngine, type Playback, type Vec3 } from './engine'
import { useStore } from '../store'
import { LANG } from '../i18n'

export type VoiceCue =
  | 'system-ready' | 'vehicle-arrival' | 'unloading-start' | 'loading-complete' | 'dispatch'
  | 'delivery-complete' | 'temperature-alert' | 'battery-low' | 'route-updated'

/** 켜자마자 바로 쓸 소리(나머지는 처음 울릴 때 불러온다) */
const PRELOAD = [
  'ui-confirm', 'ui-warning', 'radio-ptt-in', 'radio-ptt-out', 'yard-distant-traffic-loop',
  'rail-wheel-clatter-loop', 'diesel-locomotive-idle-loop', 'rail-horn', 'train-air-brake', 'container-lock',
  'truck-air-brake', 'truck-reverse-alarm', `voice-${LANG}-system-ready`,
]
const SS_KEY = 'hubtrace.sound'
const now = () => performance.now() / 1000

function ssSet(v: string) {
  try {
    sessionStorage.setItem(SS_KEY, v)
  } catch {
    // 저장할 수 없으면 이번 화면에서만
  }
}

class Sound {
  readonly engine = new AudioEngine()
  on = false
  private enabling: Promise<void> | null = null
  private loops = new Map<string, { p: Promise<Playback | null>; h: Playback | null }>()
  private gates = new Map<string, number>()
  private voices: { cue: VoiceCue; radio: boolean }[] = []
  private speaking = false
  private lastVoice = 0

  /** 켠다(클릭·터치 처리 안에서) */
  enable(): Promise<void> {
    if (this.on) return Promise.resolve()
    this.enabling ??= this.engine.unlock().then(() => {
      this.on = true
      this.enabling = null
      ssSet('1')
      useStore.getState().setSound('on')
      this.engine.preload(PRELOAD).catch(() => {})
      this.ui('ui-confirm')
      this.voice('system-ready', { force: true })
    }).catch((e) => {
      this.enabling = null
      throw e
    })
    return this.enabling
  }

  async disable() {
    this.on = false
    this.voices = []
    this.loops.clear()
    ssSet('0')
    useStore.getState().setSound('off')
    await this.engine.suspend()
  }

  /** 처음 열 때: 이 탭에서 끈 적이 없으면 켜 둔 것으로 보고, 첫 클릭·터치·키 입력에 실제로 켠다 */
  restore() {
    let v: string | null = null
    try {
      v = sessionStorage.getItem(SS_KEY)
    } catch {
      v = null
    }
    if (v === '0') return
    useStore.getState().setSound('armed')
    const once = () => {
      window.removeEventListener('pointerdown', once, true)
      window.removeEventListener('keydown', once, true)
      // 그사이 직접 껐으면 켜지 않는다
      if (useStore.getState().sound === 'armed') void this.enable().catch(() => {})
    }
    window.addEventListener('pointerdown', once, true)
    window.addEventListener('keydown', once, true)
  }

  /** key마다 sec초에 한 번만 true */
  gate(key: string, sec: number) {
    const t = now()
    if (t - (this.gates.get(key) ?? -1e9) < sec) return false
    this.gates.set(key, t)
    return true
  }

  /** 화면 효과음(위치 없음) */
  ui(id: string, volume = 0.45) {
    if (!this.on) return
    this.engine.play(id, { volume }).catch(() => {})
  }

  /** 장면 위치에서 한 번 울리는 소리 */
  at(id: string, pos: Vec3, opt: { volume?: number; ref?: number } = {}) {
    if (!this.on) return
    this.engine.play(id, { position: pos, volume: opt.volume ?? 0.7, refDistance: opt.ref ?? 25, maxDistance: 900, rolloffFactor: 1 }).catch(() => {})
  }

  /** 반복음: active인 동안 켜 두고 위치·크기를 따라 바꾼다. 위치가 없으면 화면 전체에 깔린다 */
  loop(key: string, id: string, active: boolean, pos: Vec3 | null, volume: number, ref = 30) {
    const cur = this.loops.get(key)
    if (!this.on || !active) {
      if (cur) {
        this.loops.delete(key)
        cur.p.then((h) => h?.stop(0.8)).catch(() => {})
      }
      return
    }
    if (!cur) {
      const entry: { p: Promise<Playback | null>; h: Playback | null } = { p: Promise.resolve(null), h: null }
      entry.p = this.engine.play(id, { loop: true, volume, ...(pos ? { position: pos, refDistance: ref, maxDistance: 900 } : {}) })
        .then((h) => {
          entry.h = h
          // 기다리는 사이 꺼졌으면 바로 멈춘다
          if (this.loops.get(key) !== entry) h.stop(0.3)
          return h
        })
        .catch(() => null)
      this.loops.set(key, entry)
      return
    }
    if (cur.h) {
      cur.h.setVolume(volume)
      if (pos) cur.h.setPosition(pos)
    }
  }

  stopLoops() {
    for (const [key] of this.loops) this.loop(key, '', false, null, 0)
  }

  /**
   * 안내 음성(화면 언어). 같은 안내는 cooldown초 안에 다시 하지 않고, 두 개 넘게 밀리면 버린다.
   * radio면 무전 버전에 무전기 누름·뗌 소리를 붙인다
   */
  voice(cue: VoiceCue, opt: { radio?: boolean; cooldown?: number; force?: boolean } = {}) {
    if (!this.on) return
    // 안내끼리는 8초 넘게 띄운다(급한 알림 force는 예외)
    if (!opt.force && now() - this.lastVoice < 8) return
    if (!opt.force && !this.gate(`voice:${cue}`, opt.cooldown ?? 45)) return
    if (this.voices.length >= 2) return
    this.voices.push({ cue, radio: !!opt.radio })
    void this.speak()
  }

  private async speak() {
    if (this.speaking) return
    this.speaking = true
    try {
      while (this.voices.length && this.on) {
        // 안내 사이에 숨 돌릴 틈
        const wait = 1.2 - (now() - this.lastVoice)
        if (wait > 0) await new Promise((r) => setTimeout(r, wait * 1000))
        const { cue, radio } = this.voices.shift()!
        const id = `voice-${LANG}-${cue}${radio ? '-radio' : ''}`
        try {
          if (radio) await (await this.engine.play('radio-ptt-in', { volume: 0.4 })).ended
          await (await this.engine.play(id, { volume: 0.95 })).ended
          if (radio) this.engine.play('radio-ptt-out', { volume: 0.4 }).catch(() => {})
        } catch {
          // 불러오기 실패·꺼짐은 건너뛴다
        }
        this.lastVoice = now()
      }
    } finally {
      this.speaking = false
    }
  }

  listen(pos: Vec3, forward: Vec3, up: Vec3) {
    if (this.on) this.engine.setListener(pos, forward, up)
  }
}

export const sound = new Sound()
