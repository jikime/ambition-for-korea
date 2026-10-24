import type { AnimationClip, Object3D } from 'three'

export type AssistantState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'wave' | 'success' | 'error' | 'sleep'
export const STATES: readonly AssistantState[]
export interface ClipSpec {
  name: string
  state: AssistantState
  duration: number
  loop: boolean
}
export const CLIP_SPECS: readonly ClipSpec[]
export interface ControllerOptions {
  seed?: number
  reducedMotion?: boolean
}
export interface AssistantController {
  update(deltaSeconds: number): void
  setState(state: AssistantState): void
  setLook(x: number, y: number): void
  /** null / undefined restores the procedural speaking envelope. */
  setSpeechLevel(level?: number | null): void
  setReducedMotion(enabled: boolean): void
  getState(): AssistantState
  dispose(): void
}
export function createClips(root: Object3D): AnimationClip[]
export function createController(root: Object3D, options?: ControllerOptions): AssistantController
