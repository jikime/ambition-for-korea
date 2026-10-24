// 물류관리원 음성 입출력 어댑터(교체 가능). 지금 공급자는 브라우저 Web Speech API다.
//  - STT(SpeechRecognition): 사용자가 마이크 버튼을 누를 때만 켠다. 중간 · 확정 문장을 넘기고, 확정 문장은 입력창에서 고친 뒤 보낸다
//  - TTS(speechSynthesis): 세션 ID로 지난 음성의 콜백을 무시한다. 브라우저 합성 음성은 오디오 데이터를 읽을 수 없어
//    입 움직임은 캐릭터의 기본 말하기 리듬을 쓴다(음량 분석 입 움직임은 오디오 파일 재생 때만: playClip)
//  - 지원하지 않거나 권한이 거부돼도 채팅은 그대로 쓸 수 있다
import { createSpeechAmplitudeSource, type SpeechAmplitudeSource } from './mascot/speech-amplitude.mjs'

type Recognition = {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}

const RecognitionCtor = (): (new () => Recognition) | null => {
  const w = globalThis as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export interface ListenHandlers {
  onText: (text: string, final: boolean) => void
  onEnd: (reason: 'done' | 'stopped' | 'error', error?: string) => void
}

export const stt = {
  get supported() {
    return !!RecognitionCtor()
  },
  /** 사용자 동작(마이크 버튼) 안에서 부른다 */
  start(lang: 'ko' | 'en', h: ListenHandlers) {
    const Ctor = RecognitionCtor()
    if (!Ctor) {
      h.onEnd('error', 'unsupported')
      return { stop() {} }
    }
    const r = new Ctor()
    r.lang = lang === 'ko' ? 'ko-KR' : 'en-US'
    r.interimResults = true
    r.continuous = false
    r.maxAlternatives = 1
    let finalText = ''
    let ended = false
    let stopped = false
    r.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) finalText += res[0].transcript
        else interim += res[0].transcript
      }
      h.onText((finalText + interim).trim(), !interim && !!finalText)
    }
    r.onerror = (e) => {
      if (ended) return
      ended = true
      h.onEnd(stopped ? 'stopped' : 'error', e.error)
    }
    r.onend = () => {
      if (ended) return
      ended = true
      h.onEnd(stopped ? 'stopped' : 'done')
    }
    try {
      r.start()
    } catch (e) {
      ended = true
      h.onEnd('error', e instanceof Error ? e.message : String(e))
    }
    return {
      stop() {
        stopped = true
        try {
          r.stop()
        } catch {
          // 이미 끝났으면 무시
        }
      },
    }
  },
}

export interface SpeakHandlers {
  onStart: () => void
  onEnd: (reason: 'done' | 'stopped' | 'error') => void
}

let ttsSession = 0

function pickVoice(lang: 'ko' | 'en') {
  const voices = globalThis.speechSynthesis?.getVoices() ?? []
  const want = lang === 'ko' ? /^ko/i : /^en(-|_)?(US|GB)?/i
  const list = voices.filter((v) => want.test(v.lang))
  // 자연스러운 음성(이름에 Natural · Neural · Google · Premium)을 먼저
  return list.find((v) => /natural|neural|premium|google|yuna|heami|samantha|siri/i.test(v.name)) ?? list[0] ?? null
}

export const tts = {
  get supported() {
    return typeof globalThis.speechSynthesis !== 'undefined'
  },
  /** 말하기. 새 말하기 · stop()이 오면 이전 세션의 콜백은 무시된다 */
  speak(text: string, lang: 'ko' | 'en', h: SpeakHandlers) {
    const synth = globalThis.speechSynthesis
    if (!synth || !text.trim()) {
      h.onEnd('error')
      return { id: 0 }
    }
    synth.cancel()
    const id = ++ttsSession
    const u = new SpeechSynthesisUtterance(text)
    u.lang = lang === 'ko' ? 'ko-KR' : 'en-US'
    const v = pickVoice(lang)
    if (v) u.voice = v
    u.rate = 1.05
    let started = false
    u.onstart = () => {
      if (id !== ttsSession) return
      started = true
      h.onStart()
    }
    u.onend = () => {
      if (id !== ttsSession) return
      h.onEnd('done')
    }
    u.onerror = (e) => {
      if (id !== ttsSession) return
      h.onEnd(e.error === 'interrupted' || e.error === 'canceled' ? 'stopped' : 'error')
    }
    synth.speak(u)
    // 일부 브라우저는 자동 재생 제한으로 시작하지 않는다: 잠시 뒤에도 시작하지 않으면 끝난 것으로
    setTimeout(() => {
      if (id === ttsSession && !started && !synth.speaking) h.onEnd('error')
    }, 2500)
    return { id }
  },
  stop() {
    ttsSession++
    globalThis.speechSynthesis?.cancel()
  },
}

// ───────────────────────── 오디오 파일(고정 인사말)과 음량 분석

let clipAudio: HTMLAudioElement | null = null
let clipTap: SpeechAmplitudeSource | null = null

/** 오디오 파일을 재생하고 음량 분석기를 돌려준다(사용자 동작 안에서 부른다). 끝나면 onEnd */
export async function playClip(urls: { ogg: string; mp3: string }, onEnd: () => void): Promise<SpeechAmplitudeSource | null> {
  clipAudio ??= new Audio()
  const audio = clipAudio
  audio.pause()
  audio.src = audio.canPlayType('audio/ogg; codecs=opus') ? urls.ogg : urls.mp3
  audio.onended = () => onEnd()
  audio.onpause = () => onEnd()
  try {
    const ready = clipTap ? Promise.resolve(clipTap) : createSpeechAmplitudeSource(audio)
    const playing = audio.play()
    clipTap = await ready
    await playing
    return clipTap
  } catch {
    onEnd()
    return null
  }
}

export function stopClip() {
  clipAudio?.pause()
}
