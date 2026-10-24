// Web Audio 재생기(브라우저 전용). hubtrace 에셋 팩의 integration/audio/HubtraceAudio.ts(CC0)를 가져와
// 웹용 파일(Opus .ogg, 못 읽으면 .mp3)과 이 앱의 목록(public/assets/audio/audio-manifest.json)에 맞게 줄였다.
// 만들거나 import하는 것만으로는 소리가 나지 않는다. unlock()은 반드시 클릭·터치 처리 안에서 부른다.
export type Vec3 = readonly [number, number, number]

export interface AudioAsset {
  id: string
  type: 'voice' | 'sfx' | 'ambience'
  loop: boolean
  language: string | null
  transcript: string | null
  duration: number
  file: string
  fallback: string
}

export interface PlayOptions {
  volume?: number
  loop?: boolean
  /** 장면과 같은 미터 좌표. 주면 거리·방향에 따라 들린다 */
  position?: Vec3
  refDistance?: number
  maxDistance?: number
  rolloffFactor?: number
}

export interface Playback {
  readonly id: string
  readonly loop: boolean
  readonly ended: Promise<void>
  stop(fadeSeconds?: number): void
  setVolume(volume: number): void
  /** position을 주고 재생한 소리만 */
  setPosition(position: Vec3): void
}

const gainValue = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0)
const aborted = () => new DOMException('Audio request cancelled.', 'AbortError')
/** 동시에 울리는 소리 상한(시뮬레이션 사건이 몰려도 소리가 끝없이 쌓이지 않게) */
const MAX_PLAYING = 16

export class AudioEngine {
  private context?: AudioContext
  private master?: GainNode
  private limiter?: DynamicsCompressorNode
  private masterVolume: number
  private generation = 0
  private sequence = 0
  private manifestPromise?: Promise<void>
  private readonly assets = new Map<string, AudioAsset>()
  private readonly buffers = new Map<string, Promise<AudioBuffer>>()
  private readonly playing = new Map<number, Playback>()
  private ext: 'file' | 'fallback' = 'file'

  constructor(private readonly baseUrl = '/assets/audio/', masterVolume = 0.6) {
    this.masterVolume = gainValue(masterVolume)
  }

  get ready() {
    return this.context?.state === 'running'
  }

  has(id: string) {
    return this.assets.has(id)
  }

  /** 클릭·터치 처리 안에서 바로 부른다(네트워크를 기다리기 전에) */
  async unlock(): Promise<void> {
    if (!this.context) {
      const host = window as Window & { webkitAudioContext?: typeof AudioContext }
      const Context = window.AudioContext || host.webkitAudioContext
      if (!Context) throw new Error('This browser does not support Web Audio.')
      this.context = new Context()
      this.master = this.context.createGain()
      this.master.gain.value = this.masterVolume
      this.limiter = this.context.createDynamicsCompressor()
      this.limiter.threshold.value = -3
      this.limiter.knee.value = 2
      this.limiter.ratio.value = 12
      this.limiter.attack.value = 0.003
      this.limiter.release.value = 0.12
      this.master.connect(this.limiter).connect(this.context.destination)
      // Opus(.ogg)를 못 읽는 브라우저는 mp3
      this.ext = new Audio().canPlayType('audio/ogg; codecs=opus') ? 'file' : 'fallback'
    }
    // 사용자 입력 전이면 브라우저가 시작을 미루고 resume()이 끝나지 않을 수 있다: 잠깐만 기다리고 판단한다
    if (this.context.state !== 'running') await Promise.race([this.context.resume(), new Promise((r) => setTimeout(r, 300))])
    if (!this.ready) throw new Error('Enable sound from a user click or touch first.')
  }

  /** 소리를 끈다: 모두 멈추고 오디오 장치를 쉬게 한다(다시 켤 때 unlock) */
  async suspend() {
    this.stopAll(0.1)
    if (this.context?.state === 'running') await this.context.suspend()
  }

  loadManifest(): Promise<void> {
    this.manifestPromise ??= fetch(this.baseUrl + 'audio-manifest.json')
      .then(async (response) => {
        if (!response.ok) throw new Error(`Audio manifest: HTTP ${response.status}`)
        const data = (await response.json()) as { assets?: AudioAsset[] }
        if (!Array.isArray(data.assets)) throw new Error('Invalid audio manifest: assets must be an array.')
        for (const a of data.assets) this.assets.set(a.id, a)
      })
      .catch((error) => {
        this.manifestPromise = undefined
        throw error
      })
    return this.manifestPromise
  }

  /** 쓸 소리만 미리 풀어 둔다(unlock 뒤) */
  async preload(ids: readonly string[]): Promise<void> {
    await Promise.all([...new Set(ids)].map((id) => this.loadBuffer(id)))
  }

  async play(id: string, options: PlayOptions = {}): Promise<Playback> {
    const context = this.context
    if (!context || !this.ready) throw new Error('Call unlock() from a user gesture before play().')
    const generation = this.generation
    const buffer = await this.loadBuffer(id)
    if (generation !== this.generation) throw aborted()
    if (context.state !== 'running') throw new Error('Audio is suspended; enable sound again.')
    const asset = this.assets.get(id)!
    const source = context.createBufferSource()
    source.buffer = buffer
    source.loop = options.loop ?? asset.loop
    const gain = context.createGain()
    gain.gain.value = gainValue(options.volume ?? 0.7)
    let panner: PannerNode | undefined
    if (options.position) {
      panner = context.createPanner()
      panner.panningModel = 'HRTF'
      panner.distanceModel = 'inverse'
      panner.refDistance = Math.max(0.1, options.refDistance ?? 2)
      panner.maxDistance = Math.max(panner.refDistance, options.maxDistance ?? 80)
      panner.rolloffFactor = Math.min(4, Math.max(0, options.rolloffFactor ?? 1))
      panner.positionX.value = options.position[0]
      panner.positionY.value = options.position[1]
      panner.positionZ.value = options.position[2]
      source.connect(panner).connect(gain)
    } else source.connect(gain)
    gain.connect(this.master!)
    while (this.playing.size >= MAX_PLAYING) this.playing.values().next().value!.stop(0.02)
    const token = ++this.sequence
    let stopped = false
    let finished = false
    let cleanupTimer: ReturnType<typeof setTimeout> | undefined
    let resolveEnded!: () => void
    const ended = new Promise<void>((r) => { resolveEnded = r })
    const finish = () => {
      if (finished) return
      finished = true
      stopped = true
      if (cleanupTimer !== undefined) clearTimeout(cleanupTimer)
      this.playing.delete(token)
      source.onended = null
      source.disconnect()
      panner?.disconnect()
      gain.disconnect()
      resolveEnded()
    }
    const playback: Playback = {
      id, loop: source.loop, ended,
      stop: (fadeSeconds = 0.04) => {
        if (stopped) return
        stopped = true
        this.playing.delete(token)
        const fade = Number.isFinite(fadeSeconds) ? Math.min(1, Math.max(0, fadeSeconds)) : 0
        const now = context.currentTime
        gain.gain.cancelScheduledValues(now)
        gain.gain.setValueAtTime(gain.gain.value, now)
        gain.gain.linearRampToValueAtTime(0, now + fade)
        source.stop(now + fade)
        if (fade === 0) finish()
        else cleanupTimer = setTimeout(finish, (fade + 0.05) * 1000)
      },
      setVolume: (volume) => {
        if (stopped) return
        gain.gain.setTargetAtTime(gainValue(volume), context.currentTime, 0.05)
      },
      setPosition: (position) => {
        if (stopped || !panner) return
        panner.positionX.setTargetAtTime(position[0], context.currentTime, 0.05)
        panner.positionY.setTargetAtTime(position[1], context.currentTime, 0.05)
        panner.positionZ.setTargetAtTime(position[2], context.currentTime, 0.05)
      },
    }
    source.onended = finish
    this.playing.set(token, playback)
    source.start()
    return playback
  }

  setListener(position: Vec3, forward: Vec3 = [0, 0, -1], up: Vec3 = [0, 1, 0]): void {
    if (!this.context) return
    const listener = this.context.listener
    const now = this.context.currentTime
    if (listener.positionX) {
      listener.positionX.setTargetAtTime(position[0], now, 0.05)
      listener.positionY.setTargetAtTime(position[1], now, 0.05)
      listener.positionZ.setTargetAtTime(position[2], now, 0.05)
      listener.forwardX.setTargetAtTime(forward[0], now, 0.05)
      listener.forwardY.setTargetAtTime(forward[1], now, 0.05)
      listener.forwardZ.setTargetAtTime(forward[2], now, 0.05)
      listener.upX.setTargetAtTime(up[0], now, 0.05)
      listener.upY.setTargetAtTime(up[1], now, 0.05)
      listener.upZ.setTargetAtTime(up[2], now, 0.05)
    } else {
      listener.setPosition(...position)
      listener.setOrientation(...forward, ...up)
    }
  }

  /** 재생 중인 소리와 아직 불러오는 중인 재생 요청을 모두 멈춘다 */
  stopAll(fadeSeconds = 0.04): void {
    this.generation++
    for (const playback of this.playing.values()) playback.stop(fadeSeconds)
  }

  private async loadBuffer(id: string): Promise<AudioBuffer> {
    await this.loadManifest()
    const asset = this.assets.get(id)
    if (!asset) throw new Error(`Unknown audio asset: ${id}`)
    if (!this.context) throw new Error('Call unlock() before decoding audio.')
    if (!this.buffers.has(id)) {
      const context = this.context
      const request = fetch(this.baseUrl + asset[this.ext])
        .then(async (response) => {
          if (!response.ok) throw new Error(`Audio ${id}: HTTP ${response.status}`)
          return context.decodeAudioData(await response.arrayBuffer())
        })
        .catch((error) => {
          this.buffers.delete(id)
          throw error
        })
      this.buffers.set(id, request)
    }
    return this.buffers.get(id)!
  }
}
