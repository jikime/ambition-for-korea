// 사람 GLB의 제자리 걷기 동작 다듬기. 에셋 팩 동작은 다리를 사인파로 흔드는 진자형이라 그대로 이동시키면 발이 미끄러진다:
//  - 디딤발이 뒤로 가는 속도가 일정하지 않고(끝에서 0), 무릎을 드는 시점이 발이 뒤 끝에 있을 때라 땅에 닿은 발이 앞으로 끌린다
// 그래서 불러올 때 한 번 다리 트랙만 다시 만든다.
//  1) 허벅지: 발 앞뒤 위치가 시간에 따라 직선(삼각파)이 되도록 시간을 다시 맞춘다 → 디딤발이 일정한 속도로 뒤로
//  2) 무릎·발목: 들어 올리는 시점을 발을 앞으로 내딛는 구간 한가운데로 옮긴다 → 땅에 닿은 발은 앞으로 끌리지 않는다
//  3) 몸 높이: 땅에 닿은 발(둘 중 낮은 발)이 늘 같은 높이에 있도록 다시 계산한다 → 디딤발이 출렁이지 않는다
// 결과 클립과 함께 배속 1에서 디딤발이 뒤로 가는 속도(= 미끄럼 없이 걷는 속도, m/s)를 돌려준다. 화면에서는 실제 이동 속도 ÷ 이 값으로 재생 배속을 맞춘다.
import * as THREE from 'three'
import { clone } from 'three/addons/utils/SkeletonUtils.js'

export interface Gait {
  clip: THREE.AnimationClip
  /** 배속 1에서 미끄럼 없이 걷는 속도(m/s) */
  speed: number
}

const N = 240
const KEYS = 60
const SIDES = ['L', 'R'] as const

/** 한 주기 동안 발(발목 뼈)의 모델 기준 위치를 N+1번 잰다 */
function sampleFeet(scene: THREE.Object3D, clip: THREE.AnimationClip) {
  const root = clone(scene)
  const mixer = new THREE.AnimationMixer(root)
  mixer.clipAction(clip).play()
  const feet = SIDES.map((s) => root.getObjectByName(`hubtrace_foot_${s}`))
  if (feet.some((f) => !f)) return null
  const out = SIDES.map(() => [] as THREE.Vector3[])
  for (let i = 0; i <= N; i++) {
    mixer.setTime((clip.duration * i) / N)
    root.updateMatrixWorld(true)
    feet.forEach((f, k) => out[k].push(f!.getWorldPosition(new THREE.Vector3())))
  }
  mixer.stopAllAction()
  return out
}

/** 트랙 보간기(three 타입 정의에는 빠져 있다) */
const interp = (track: THREE.KeyframeTrack) => (track as unknown as { createInterpolant(): THREE.Interpolant }).createInterpolant()

/** 트랙을 τ → src(τ) 시간으로 다시 뽑는다(KEYS+1개 키, 처음과 끝 같음) */
function resample(track: THREE.KeyframeTrack, T: number, src: (tau: number) => number) {
  const it = interp(track)
  const size = track.getValueSize()
  const times = new Float32Array(KEYS + 1)
  const values = new Float32Array((KEYS + 1) * size)
  for (let k = 0; k <= KEYS; k++) {
    const tau = (T * k) / KEYS
    times[k] = tau
    const t = (((src(tau) % T) + T) % T)
    values.set(it.evaluate(t), k * size)
  }
  const Ctor = track.constructor as new (name: string, times: Float32Array, values: Float32Array) => THREE.KeyframeTrack
  return new Ctor(track.name, times, values)
}

const fixed = new WeakMap<THREE.AnimationClip, Gait>()

export function fixGait(scene: THREE.Object3D, clip: THREE.AnimationClip): Gait {
  const hit = fixed.get(clip)
  if (hit) return hit
  const T = clip.duration
  const legs = (part: string, s: string) => clip.tracks.find((t) => t.name === `hubtrace_${part}_${s}.quaternion`)
  const fallback = { clip, speed: 0.6 }
  // 허벅지만 움직였을 때 발 앞뒤(z) → 시간 다시 맞추기, 전체 동작에서 발 높이(y) → 무릎 드는 시점
  const hipOnly = new THREE.AnimationClip('hip', T, SIDES.map((s) => legs('upperleg01', s)).filter((t): t is THREE.KeyframeTrack => !!t))
  const hip = sampleFeet(scene, hipOnly)
  const full = sampleFeet(scene, clip)
  if (!hip || !full || hipOnly.tracks.length < 2) return fallback
  const at = (i: number) => (T * i) / N
  const tracks: THREE.KeyframeTrack[] = []
  const speeds: number[] = []
  const swap = new Map<THREE.KeyframeTrack, THREE.KeyframeTrack>()
  SIDES.forEach((s, k) => {
    const z = hip[k].map((p) => p.z)
    let iF = 0
    let iB = 0
    z.forEach((v, i) => {
      if (v > z[iF]) iF = i
      if (v < z[iB]) iB = i
    })
    const zF = z[iF]
    const zB = z[iB]
    if (zF - zB < 0.05) return
    const tF = at(iF)
    const tB = at(iB)
    // 앞 끝 → 뒤 끝(디딤), 뒤 끝 → 앞 끝(내딛기) 구간 길이
    const stance = (((tB - tF) % T) + T) % T
    const swing = T - stance
    speeds.push((zF - zB) / stance)
    // 원래 시간에서 z가 목표값이 되는 시점(구간 안에서 단조라고 보고 선형 보간)
    const zAt = (t: number) => {
      const u = ((((t % T) + T) % T) / T) * N
      const i = Math.floor(u)
      return z[i] + (z[Math.min(N, i + 1)] - z[i]) * (u - i)
    }
    const solve = (t0: number, len: number, target: number, falling: boolean) => {
      let lo = 0
      let hi = len
      for (let n = 0; n < 30; n++) {
        const mid = (lo + hi) / 2
        const v = zAt(t0 + mid)
        if (falling ? v > target : v < target) lo = mid
        else hi = mid
      }
      return t0 + (lo + hi) / 2
    }
    const warp = (tau: number) => {
      const d = (((tau - tF) % T) + T) % T
      if (d <= stance) return solve(tF, stance, zF - ((zF - zB) * d) / stance, true)
      const e = d - stance
      return solve(tB, swing, zB + ((zF - zB) * e) / swing, false)
    }
    const upper = legs('upperleg01', s)!
    swap.set(upper, resample(upper, T, (tau) => warp(tau)))
    // 무릎을 가장 많이 든 시점(발이 가장 높을 때) → 내딛는 구간 한가운데로
    const y = full[k].map((p) => p.y)
    let iL = 0
    y.forEach((v, i) => { if (v > y[iL]) iL = i })
    const shift = tB + swing / 2 - at(iL)
    for (const part of ['lowerleg01', 'foot']) {
      const tr = legs(part, s)
      if (tr) swap.set(tr, resample(tr, T, (tau) => tau - shift))
    }
  })
  if (speeds.length < 2) return fallback
  // 몸 높이: 다리만 움직였을 때 낮은 발이 서 있는 자세의 발목 높이에 오도록 몸을 올리거나 내린다
  const rootTrack = clip.tracks.find((t) => t.name === 'hubtrace_root.position')
  const rootNode = scene.getObjectByName('hubtrace_root')
  const legsOnly = sampleFeet(scene, new THREE.AnimationClip('legs', T, [...swap.values()]))
  const rest = sampleFeet(scene, new THREE.AnimationClip('rest', T, []))
  if (rootTrack && rootNode && legsOnly && rest) {
    const ground = legsOnly[0].map((p, i) => Math.min(p.y, legsOnly[1][i].y))
    const top = Math.min(rest[0][0].y, rest[1][0].y)
    const it = interp(rootTrack)
    const times = new Float32Array(KEYS + 1)
    const values = new Float32Array((KEYS + 1) * 3)
    for (let k = 0; k <= KEYS; k++) {
      const tau = (T * k) / KEYS
      const v = it.evaluate(tau)
      times[k] = tau
      values.set([v[0], rootNode.position.y + top - ground[Math.round((k * N) / KEYS)], v[2]], k * 3)
    }
    swap.set(rootTrack, new THREE.VectorKeyframeTrack(rootTrack.name, times, values))
  }
  for (const t of clip.tracks) tracks.push(swap.get(t) ?? t)
  const out = { clip: new THREE.AnimationClip(clip.name, T, tracks), speed: (speeds[0] + speeds[1]) / 2 }
  fixed.set(clip, out)
  return out
}
