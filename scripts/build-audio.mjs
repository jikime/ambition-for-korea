// 오디오 에셋 만들기: hubtrace 에셋 팩(WAV 48kHz)에서 화면에 쓰는 소리만 골라 웹용으로 줄인다.
//  - <id>.ogg(Opus, 반복음도 이음새 없이) + <id>.mp3(Opus를 못 읽는 브라우저용) → public/assets/audio/
//  - audio-manifest.json: 쓰는 소리의 id · 종류 · 반복 여부 · 언어 · 문구 · 길이
// 사용: node scripts/build-audio.mjs [에셋 팩 폴더(기본 hubtrace-assets-v2)]  — ffmpeg 필요
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const PACK = resolve(process.argv[2] ?? 'hubtrace-assets-v2')
const OUT = resolve('public/assets/audio')

const VOICES = ['system-ready', 'vehicle-arrival', 'vehicle-arrival-radio', 'unloading-start', 'loading-complete', 'dispatch', 'delivery-complete', 'temperature-alert', 'battery-low', 'route-updated']
const IDS = [
  ...VOICES.flatMap((v) => [`voice-ko-${v}`, `voice-en-${v}`]),
  // 철송
  'rail-horn', 'rail-wheel-clatter-loop', 'train-air-brake', 'coupler-clank', 'diesel-locomotive-idle-loop', 'container-lock',
  // 트럭 · 허브
  'truck-air-brake', 'truck-reverse-alarm', 'cargo-roll-shutter', 'scanner-success-1', 'scanner-success-2', 'scanner-success-3', 'scanner-reject', 'conveyor-motor-loop',
  // 무전 · 화면
  'radio-ptt-in', 'radio-ptt-out', 'ui-confirm', 'ui-warning', 'ui-dispatch',
  // 환경음
  'light-rain-loop', 'light-wind-loop', 'yard-distant-traffic-loop', 'warehouse-room-loop',
]

const src = JSON.parse(readFileSync(join(PACK, 'audio-manifest.json'), 'utf8'))
const byId = new Map(src.assets.map((a) => [a.id, a]))
mkdirSync(OUT, { recursive: true })

const ff = (args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args], { stdio: 'inherit' })
const out = []
let bytes = 0
for (const id of IDS) {
  const a = byId.get(id)
  if (!a) throw new Error(`에셋 팩에 없는 소리: ${id}`)
  const input = join(PACK, a.file)
  // 음성은 낮은 비트레이트로도 충분하고, 반복 환경음은 스테레오 폭을 남긴다
  const opus = a.type === 'voice' ? '32k' : a.loop ? '64k' : '48k'
  ff(['-i', input, '-c:a', 'libopus', '-b:a', opus, join(OUT, `${id}.ogg`)])
  ff(['-i', input, '-c:a', 'libmp3lame', '-q:a', a.type === 'voice' ? '7' : '5', join(OUT, `${id}.mp3`)])
  bytes += statSync(join(OUT, `${id}.ogg`)).size + statSync(join(OUT, `${id}.mp3`)).size
  out.push({ id, type: a.type, loop: !!a.loop, language: a.language ?? null, transcript: a.transcript ?? null, duration: a.duration, file: `${id}.ogg`, fallback: `${id}.mp3` })
}
writeFileSync(join(OUT, 'audio-manifest.json'), JSON.stringify({ title: 'hubtrace audio (web)', source: 'hubtrace-assets-v2 · CC0 (voices: Windows Heami/Zira renders)', assets: out }, null, 1))
console.log(`${out.length}개 · ${(bytes / 1024 / 1024).toFixed(2)} MB → ${OUT}`)
