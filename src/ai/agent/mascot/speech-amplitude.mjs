// No microphone, autoplay, fetch, or audio recording. Feed an existing <audio> element.
const elementSources = new WeakMap();
let defaultContext;

/**
 * Call from a user click/tap, before audio.play(). Keep the audio element for reuse.
 * When your app already owns its MediaElementAudioSourceNode, pass {source}.
 * The permanent source->destination pass-through is intentionally retained on dispose:
 * disconnecting it or closing its AudioContext would mute the element.
 */
export async function createSpeechAmplitudeSource(audio, options = {}) {
  if (!audio || typeof audio.play !== 'function') throw new TypeError('An HTMLAudioElement is required.');
  const sourceUrl = audio.currentSrc || audio.src;
  if (sourceUrl && typeof location !== 'undefined') {
    const url = new URL(sourceUrl, location.href);
    if (/^https?:$/.test(url.protocol) && url.origin !== location.origin && !audio.crossOrigin) {
      throw new Error('Cross-origin speech audio needs audio.crossOrigin="anonymous" BEFORE setting src, and a server with CORS enabled.');
    }
  }
  let entry = elementSources.get(audio);
  if (options.source) {
    if (options.source.mediaElement !== audio) throw new Error('The supplied source belongs to another audio element.');
    if (entry && entry.source !== options.source) throw new Error('This element already uses another audio source.');
    entry ??= { source: options.source, context: options.source.context };
    elementSources.set(audio, entry);
  }
  if (!entry) {
    if (typeof AudioContext === 'undefined') throw new Error('Web Audio is not available in this browser.');
    defaultContext ??= new AudioContext();
    if (defaultContext.state === 'closed') defaultContext = new AudioContext();
    let source;
    try { source = defaultContext.createMediaElementSource(audio); }
    catch (cause) {
      throw new Error('Cannot attach this audio element. If your app already has a MediaElementAudioSourceNode, pass it as {source}.', { cause });
    }
    source.connect(defaultContext.destination);
    entry = { source, context: defaultContext };
    elementSources.set(audio, entry);
  }
  const { source, context } = entry;
  if (typeof context.resume !== 'function' || context.state === 'closed') throw new Error('A live AudioContext is required.');
  // Calling resume synchronously before the first await preserves user activation.
  await context.resume();
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0;
  source.connect(analyser);
  const data = new Float32Array(analyser.fftSize);
  const gain = Number.isFinite(options.gain) && options.gain > 0 ? options.gain : 4;
  const gate = Number.isFinite(options.noiseGate) ? Math.min(0.25, Math.max(0, options.noiseGate)) : 0.008;
  let level = 0;
  let disposed = false;
  return {
    sample(deltaSeconds = 1 / 60) {
      if (disposed) return 0;
      const dt = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(0.1, deltaSeconds)) : 1 / 60;
      let target = 0;
      if (!audio.paused && !audio.ended && context.state === 'running') {
        analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (const value of data) sum += value * value;
        const rms = Math.sqrt(sum / data.length);
        target = Number.isFinite(rms) ? Math.min(1, Math.max(0, rms - gate) * gain) : 0;
      }
      const tau = target > level ? 0.035 : 0.10;
      level += (target - level) * (1 - Math.exp(-dt / tau));
      return level;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      level = 0;
      // Disconnect only this analyser branch. Other adapters and playback stay connected.
      try { source.disconnect(analyser); } catch { /* The host may already have disconnected it. */ }
      analyser.disconnect();
    },
  };
}
