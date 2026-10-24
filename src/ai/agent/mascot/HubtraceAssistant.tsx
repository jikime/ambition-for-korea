import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree, type ThreeElements } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import type { Object3D } from 'three'
import { createController, type AssistantController, type AssistantState } from './motion.mjs'
import { createCharacterInstance } from './character-instance'
import type { SpeechAmplitudeSource } from './speech-amplitude.mjs'

export type { AssistantState } from './motion.mjs'
export const DEFAULT_CHARACTER_URL = '/assets/hubtrace/character/hubtrace-logistics-assistant.glb'

type GroupProps = Omit<ThreeElements['group'], 'children' | 'ref' | 'dispose'>

export interface HubtraceAssistantProps extends GroupProps {
  modelUrl?: string
  state?: AssistantState
  /** Increase to replay a one-shot state without first changing the state prop. */
  actionKey?: string | number
  /** Normalized focus: x positive = character's left/viewer's right; y positive = up. */
  look?: readonly [number, number]
  /** 0..1 audio envelope. Undefined uses the procedural speaking motion. */
  speechLevel?: number | null
  /** Optional live audio tap, sampled per frame without React state updates. Takes priority over speechLevel. */
  speechSource?: Pick<SpeechAmplitudeSource, 'sample'> | null
  /** Omitted: follows prefers-reduced-motion and updates if the OS preference changes. */
  reducedMotion?: boolean
  seed?: number
  /** Also reports automatic return to idle after wave/success/error. */
  onStateChange?: (state: AssistantState) => void
  /** Independent node tree; shared geometries/materials must not be disposed or mutated. */
  onReady?: (object: Object3D | null) => void
}

function useReducedMotion(explicit: boolean | undefined) {
  const [system, setSystem] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setSystem(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return explicit ?? system
}

/** Put inside an R3F Canvas + Suspense. The model is 1.5 m high, Y-up, looking toward +Z. */
export function HubtraceAssistant({
  modelUrl = DEFAULT_CHARACTER_URL, state = 'idle', actionKey,
  look, speechLevel, speechSource, reducedMotion, seed = 21,
  onStateChange, onReady, ...groupProps
}: HubtraceAssistantProps) {
  const { scene } = useGLTF(modelUrl)
  const object = useMemo(() => createCharacterInstance(scene), [scene])
  const controller = useRef<AssistantController | null>(null)
  const reported = useRef<AssistantState | null>(null)
  const callbacks = useRef({ onStateChange, onReady })
  callbacks.current = { onStateChange, onReady }
  const quiet = useReducedMotion(reducedMotion)
  const invalidate = useThree((s) => s.invalidate)
  const settleRemaining = useRef(0.5)
  const lookX = look?.[0] ?? 0
  const lookY = look?.[1] ?? 0

  // Construct inside the effect: React StrictMode cleanup/replay receives a fresh controller.
  useLayoutEffect(() => {
    const next = createController(object, { seed })
    controller.current = next
    reported.current = null
    callbacks.current.onReady?.(object)
    return () => {
      next.dispose()
      controller.current = null
      callbacks.current.onReady?.(null)
    }
  }, [object, seed])

  useLayoutEffect(() => {
    const active = controller.current
    // The controller intentionally ignores duplicate setState calls. An explicit actionKey requests replay.
    if (active && actionKey !== undefined && state !== 'idle' && active.getState() === state) active.setState('idle')
    active?.setState(state)
    settleRemaining.current = 0.6
    invalidate()
  }, [object, seed, state, actionKey, invalidate])
  useLayoutEffect(() => {
    controller.current?.setLook(lookX, lookY)
    settleRemaining.current = 0.6
    invalidate()
  }, [object, seed, lookX, lookY, invalidate])
  useLayoutEffect(() => {
    controller.current?.setSpeechLevel(speechLevel)
    settleRemaining.current = 0.6
    invalidate()
  }, [object, seed, speechLevel, speechSource, invalidate])
  useLayoutEffect(() => {
    controller.current?.setReducedMotion(quiet)
    settleRemaining.current = 0.6
    invalidate()
  }, [object, seed, quiet, invalidate])

  useFrame((_, dt) => {
    const active = controller.current
    if (!active) return
    if (speechSource) active.setSpeechLevel(speechSource.sample(dt))
    active.update(dt)
    const current = active.getState()
    if (current !== reported.current) {
      // Automatic one-shot -> idle transitions also need time to finish their crossfade.
      settleRemaining.current = Math.max(settleRemaining.current, 0.6)
      reported.current = current
      callbacks.current.onStateChange?.(current)
    }
    settleRemaining.current -= Math.min(Math.max(dt, 0), 0.1)
    // Demand canvases animate while active, then settle when reduced motion is enabled.
    if (!quiet || settleRemaining.current > 0 || current === 'wave' || current === 'success' || current === 'error') invalidate()
  })

  return <group {...groupProps} dispose={null}><primitive object={object} dispose={null} /></group>
}

/** Explicit, optional preload. No network request is made merely by importing this module. */
export function preloadHubtraceAssistant(modelUrl = DEFAULT_CHARACTER_URL) {
  useGLTF.preload(modelUrl)
}
