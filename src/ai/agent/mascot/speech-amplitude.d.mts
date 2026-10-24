export interface SpeechAmplitudeOptions {
  /** Supply this when the app already created a source for the same audio element. */
  source?: MediaElementAudioSourceNode
  /** Positive RMS multiplier, default 4. */
  gain?: number
  /** RMS noise floor, 0..0.25, default 0.008. */
  noiseGate?: number
}
export interface SpeechAmplitudeSource {
  /** Call once per render frame; returns a smoothed level in 0..1. */
  sample(deltaSeconds?: number): number
  /** Detaches analysis only. Does not pause, mute, or disconnect audio playback. */
  dispose(): void
}
/** Call within a user gesture. Does not play audio or access a microphone. */
export function createSpeechAmplitudeSource(audio: HTMLAudioElement, options?: SpeechAmplitudeOptions): Promise<SpeechAmplitudeSource>
