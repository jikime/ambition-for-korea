/**
 * hubtrace fluffy logistics mascot — original CC0 animation/controller source.
 * Soft, restrained joint animation; no microphone, audio, network or render-loop ownership.
 * Times are seconds. The same pose sampler generates GLB clips and live motion.
 */
import * as THREE from 'three';

export const STATES = Object.freeze(['idle', 'listening', 'thinking', 'speaking', 'wave', 'success', 'error', 'sleep']);
export const CLIP_SPECS = Object.freeze([
  { state: 'idle', name: 'Idle', duration: 8, loop: true },
  { state: 'listening', name: 'Listening', duration: 6, loop: true },
  { state: 'thinking', name: 'Thinking', duration: 8, loop: true },
  { state: 'speaking', name: 'Speaking', duration: 4, loop: true },
  { state: 'wave', name: 'Wave', duration: 3.2, loop: false },
  { state: 'success', name: 'Success', duration: 2.8, loop: false },
  { state: 'error', name: 'Error', duration: 3, loop: false },
  { state: 'sleep', name: 'Sleep', duration: 6, loop: true },
].map(Object.freeze));

const SPEC = Object.fromEntries(CLIP_SPECS.map(spec => [spec.state, spec]));
const REQUIRED_NAMES = Object.freeze(['Body', 'Neck', 'Head', 'Shoulder_L', 'Elbow_L', 'Wrist_L', 'Shoulder_R', 'Elbow_R', 'Wrist_R', 'Eye_L', 'Eye_R', 'Pupil_L', 'Pupil_R', 'Brow_L', 'Brow_R', 'Mouth', 'MouthOpen']);
const NAMES = Object.freeze([...REQUIRED_NAMES, 'Antenna', 'Ear_L', 'Ear_R', 'TailBase']);
const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = value => typeof value === 'number' && Number.isFinite(value);
const smooth = value => { const x = clamp(value, 0, 1); return x * x * (3 - 2 * x); };
const interval = (time, start, end) => smooth((time - start) / (end - start));
const gesture = (time, inStart, inEnd, outStart, outEnd) => interval(time, inStart, inEnd) * (1 - interval(time, outStart, outEnd));
const dampFactor = (rate, dt) => 1 - Math.exp(-rate * dt);

function readRig(root) {
  if (!root?.isObject3D) throw new TypeError('createController/createClips requires a THREE.Object3D character root.');
  const all = new Map();
  root.traverse(node => { if (NAMES.includes(node.name)) { if (all.has(node.name)) throw new Error(`Duplicate character joint: ${node.name}`); all.set(node.name, node); } });
  const absent = REQUIRED_NAMES.filter(name => !all.has(name));
  if (absent.length) throw new Error(`Missing character joints: ${absent.join(', ')}`);
  return Object.fromEntries(NAMES.filter(name => all.has(name)).map(name => {
    const node = all.get(name);
    return [name, { node, position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone() }];
  }));
}
function newPose(rig) {
  return Object.fromEntries(Object.keys(rig).map(name => [name, {
    position: rig[name].position.clone(), quaternion: rig[name].quaternion.clone(), scale: rig[name].scale.clone(),
  }]));
}
function reset(pose, rig) { for (const name in rig) { const p = pose[name], r = rig[name]; p.position.copy(r.position); p.quaternion.copy(r.quaternion); p.scale.copy(r.scale); } }
function copyPose(target, source) { for (const name in source) { target[name].position.copy(source[name].position); target[name].quaternion.copy(source[name].quaternion); target[name].scale.copy(source[name].scale); } }
function blendPose(target, from, to, alpha) { for (const name in target) { target[name].position.lerpVectors(from[name].position, to[name].position, alpha); target[name].quaternion.slerpQuaternions(from[name].quaternion, to[name].quaternion, alpha); target[name].scale.lerpVectors(from[name].scale, to[name].scale, alpha); } }
function applyPose(rig, pose) { for (const name in rig) { const n = rig[name].node, p = pose[name]; n.position.copy(p.position); n.quaternion.copy(p.quaternion); n.scale.copy(p.scale); } }

// All scratch state belongs to one sampler/controller. Multiple characters stay independent.
function makeSampler(rig) {
  const euler = new THREE.Euler(0, 0, 0, 'XYZ');
  const rotation = new THREE.Quaternion();
  const turn = (pose, name, x = 0, y = 0, z = 0) => {
    if (!pose[name]) return;
    rotation.setFromEuler(euler.set(x, y, z));
    pose[name].quaternion.multiply(rotation);
  };
  function sample(pose, state, time, { reduced = false, speech = null } = {}) {
    reset(pose, rig);
    const spec = SPEC[state], t = reduced ? 0 : clamp(time, 0, spec.duration);
    const phase = TAU * t / spec.duration;
    const moving = reduced ? 0 : 1;
    const action = !spec.loop;
    const edge = action ? gesture(t, 0, .45, spec.duration - .6, spec.duration) : 1;
    const breath = Math.sin(phase) * .0032 * moving * (action ? edge : 1);
    pose.Body.position.y += breath;
    // Tiny ribcage expansion gives the fluffy silhouette soft weight. Feet stay still.
    pose.Body.scale.x *= 1 + breath * .7;
    pose.Body.scale.z *= 1 + breath * .7;
    pose.Body.scale.y *= 1 - breath * .35;
    turn(pose, 'Body', .006 * Math.sin(phase) * moving * edge, .007 * Math.sin(phase) * moving * edge, .007 * Math.sin(phase * 2) * moving * edge);
    turn(pose, 'Head', .012 * Math.sin(phase * 2) * moving * edge, .016 * Math.sin(phase) * moving * edge, .009 * Math.sin(phase * 3) * moving * edge);
    // Rest forepaws have breathing room beside the vest and softly face forward.
    turn(pose, 'Shoulder_L', -.025, 0, .09 + breath * 2);
    turn(pose, 'Shoulder_R', -.025, 0, -.09 - breath * 2);
    turn(pose, 'Elbow_L', -.06 - breath * 2);
    turn(pose, 'Elbow_R', -.06 + breath * 2);
    turn(pose, 'Wrist_L', 0, .025, .02 * Math.sin(phase * 2) * moving * edge);
    turn(pose, 'Wrist_R', 0, -.025, -.02 * Math.sin(phase * 2) * moving * edge);
    // Optional ear/tail joints retain small angular limits around the fluffy body.
    turn(pose, 'Ear_L', .012 * Math.sin(phase * 2) * moving * edge, 0, .012 * Math.sin(phase * 3) * moving * edge);
    turn(pose, 'Ear_R', -.009 * Math.sin(phase * 3) * moving * edge, 0, -.011 * Math.sin(phase * 2) * moving * edge);
    turn(pose, 'TailBase', 0, .025 * Math.sin(phase * 2) * moving * edge, .012 * Math.sin(phase) * moving * edge);

    if (state === 'listening') {
      turn(pose, 'Neck', .026, 0, -.035);
      turn(pose, 'Head', .015 + .021 * Math.sin(phase * 2) * moving, .018, -.018);
      pose.Brow_L.position.y += .008;
      pose.Brow_R.position.y += .008;
      pose.Eye_L.scale.y *= 1.055;
      pose.Eye_R.scale.y *= 1.055;
      turn(pose, 'Shoulder_L', -.035);
      turn(pose, 'Shoulder_R', -.035);
      turn(pose, 'Ear_L', -.035, 0, -.025);
      turn(pose, 'Ear_R', -.035, 0, .025);
    } else if (state === 'thinking') {
      turn(pose, 'Neck', -.055, -.065, .055);
      turn(pose, 'Head', -.035, -.06 + .025 * Math.sin(phase) * moving, .025);
      pose.Pupil_L.position.x -= .003;
      pose.Pupil_R.position.x -= .003;
      pose.Pupil_L.position.y += .003;
      pose.Pupil_R.position.y += .003;
      pose.Brow_L.position.y += .007;
      turn(pose, 'Brow_L', 0, 0, .12);
      turn(pose, 'Brow_R', 0, 0, -.06);
      pose.Eye_R.scale.y *= .87;
      pose.Mouth.scale.x *= .76;
      pose.Mouth.scale.y *= .7;
      // A small paw consideration gesture, safely outside the head.
      turn(pose, 'Shoulder_R', -.16, -.04, -.22);
      turn(pose, 'Elbow_R', -.45, .06, -.12);
      turn(pose, 'Wrist_R', .05, -.12, -.04);
      turn(pose, 'Ear_L', .015, 0, .035);
      turn(pose, 'Ear_R', -.025, 0, .015);
    } else if (state === 'speaking') {
      const syllable = speech === null ? proceduralSpeech(t) : clamp(speech, 0, 1);
      const amount = reduced ? .14 : syllable;
      pose.MouthOpen.scale.y = Math.max(.025, .025 + amount * .82);
      pose.MouthOpen.scale.x *= .8 + amount * .25;
      pose.Mouth.scale.y *= 1 - amount * .82;
      pose.Mouth.scale.x *= 1 - amount * .16;
      turn(pose, 'Head', .016 * Math.sin(phase * 3) * moving, .018 * Math.sin(phase * 2) * moving);
      turn(pose, 'Shoulder_L', -.06 - .04 * Math.sin(phase * 2) * moving, .02, .08);
      turn(pose, 'Elbow_L', -.16 - .06 * Math.sin(phase * 2) * moving);
      turn(pose, 'Wrist_L', .045 * Math.sin(phase * 3) * moving, .04);
      pose.Brow_L.position.y += .003 + amount * .003;
      pose.Brow_R.position.y += .003 + amount * .003;
      turn(pose, 'TailBase', 0, .018 * Math.sin(phase * 3) * moving);
    } else if (state === 'wave') {
      const reach = reduced ? .12 : gesture(t, .2, .95, 2.45, 3.2);
      const anticipation = reduced ? 0 : gesture(t, .04, .19, .3, .5);
      const handWave = reduced ? 0 : gesture(t, .92, 1.15, 2.3, 2.5) * Math.sin((t - 1.05) * TAU * 2.15);
      turn(pose, 'Shoulder_L', -.16 * reach + .08 * anticipation, -.03 * reach, 2.11 * reach - .11 * anticipation);
      turn(pose, 'Elbow_L', -.28 * reach, 0, .52 * reach + .045 * handWave);
      turn(pose, 'Wrist_L', .055 * handWave, .08 * reach, .25 * handWave);
      turn(pose, 'Head', -.015 * reach, .035 * reach, -.035 * reach);
      pose.Brow_L.position.y += .008 * reach;
      pose.Brow_R.position.y += .008 * reach;
      pose.Mouth.scale.x *= 1 + .12 * reach;
      turn(pose, 'Ear_L', -.02 * reach, 0, -.02 * reach);
      turn(pose, 'Ear_R', -.02 * reach, 0, .02 * reach);
      turn(pose, 'TailBase', 0, .035 * handWave);
    } else if (state === 'success') {
      const cheer = reduced ? .12 : gesture(t, .12, .7, 1.8, 2.8);
      const settle = Math.sin(phase * 2) * moving * cheer;
      turn(pose, 'Shoulder_L', -.12 * cheer, .04 * cheer, .46 * cheer);
      turn(pose, 'Shoulder_R', -.14 * cheer, -.04 * cheer, -.46 * cheer);
      turn(pose, 'Elbow_L', -.42 * cheer, .08 * cheer, .17 * cheer);
      turn(pose, 'Elbow_R', -.42 * cheer, -.08 * cheer, -.17 * cheer);
      turn(pose, 'Wrist_L', -.07 * cheer, .11 * cheer, .08 * settle);
      turn(pose, 'Wrist_R', -.07 * cheer, -.11 * cheer, -.08 * settle);
      turn(pose, 'Head', -.045 * cheer + .026 * settle);
      pose.Eye_L.scale.y *= 1 - .15 * cheer;
      pose.Eye_R.scale.y *= 1 - .15 * cheer;
      pose.Mouth.scale.x *= 1 + .22 * cheer;
      pose.Mouth.scale.y *= 1 + .12 * cheer;
      pose.Brow_L.position.y += .006 * cheer;
      pose.Brow_R.position.y += .006 * cheer;
      turn(pose, 'TailBase', 0, .06 * Math.sin(phase * 4) * moving * cheer);
      turn(pose, 'Ear_L', -.025 * cheer, 0, -.025 * cheer);
      turn(pose, 'Ear_R', -.025 * cheer, 0, .025 * cheer);
    } else if (state === 'error') {
      const concern = reduced ? .25 : gesture(t, .08, .7, 1.95, 3);
      const shake = Math.sin(phase * 2) * moving * concern;
      turn(pose, 'Head', .035 * concern, .045 * shake, .032 * concern);
      turn(pose, 'Brow_L', 0, 0, -.12 * concern);
      turn(pose, 'Brow_R', 0, 0, .12 * concern);
      pose.Brow_L.position.y += .005 * concern;
      pose.Brow_R.position.y += .005 * concern;
      pose.Mouth.scale.x *= 1 - .18 * concern;
      pose.Mouth.scale.y *= 1 - .32 * concern;
      turn(pose, 'Shoulder_R', -.08 * concern, -.04 * concern, -.2 * concern);
      turn(pose, 'Elbow_R', -.2 * concern, -.05 * concern);
      turn(pose, 'Wrist_R', 0, -.12 * concern);
      turn(pose, 'Ear_L', .035 * concern, 0, .055 * concern);
      turn(pose, 'Ear_R', .035 * concern, 0, -.055 * concern);
    } else if (state === 'sleep') {
      turn(pose, 'Neck', .055);
      turn(pose, 'Head', .06 + .008 * Math.sin(phase) * moving, 0, .025);
      pose.Eye_L.scale.y = Math.max(.025, rig.Eye_L.scale.y * .035);
      pose.Eye_R.scale.y = Math.max(.025, rig.Eye_R.scale.y * .035);
      pose.Brow_L.position.y -= .003;
      pose.Brow_R.position.y -= .003;
      pose.Mouth.scale.x *= .84;
      pose.Mouth.scale.y *= .85;
      pose.Body.position.y -= breath * .5;
      turn(pose, 'Ear_L', .025, 0, .035);
      turn(pose, 'Ear_R', .025, 0, -.035);
    }
  }
  function attention(pose, state, x, y, blink = 0, strength = 1) {
    if (state === 'sleep' || strength === 0) return;
    const lookStrength = state === 'thinking' ? .45 : 1;
    const lx = clamp(x, -1, 1) * strength * lookStrength;
    const ly = clamp(y, -1, 1) * strength * lookStrength;
    turn(pose, 'Neck', -.045 * ly, .06 * lx);
    turn(pose, 'Head', -.075 * ly, .11 * lx, -.009 * lx);
    pose.Pupil_L.position.x += .006 * lx;
    pose.Pupil_R.position.x += .006 * lx;
    pose.Pupil_L.position.y += .006 * ly;
    pose.Pupil_R.position.y += .006 * ly;
    // State crossfades can combine a thinking offset with a new pointer target.
    // Keep the glossy lens and catchlight inside the physical eyeball throughout.
    for (const pupil of ['Pupil_L', 'Pupil_R']) {
      pose[pupil].position.x = clamp(pose[pupil].position.x, rig[pupil].position.x - .008, rig[pupil].position.x + .008);
      pose[pupil].position.y = clamp(pose[pupil].position.y, rig[pupil].position.y - .008, rig[pupil].position.y + .008);
    }
    for (const eye of ['Eye_L', 'Eye_R']) {
      pose[eye].scale.y = Math.max(.025, pose[eye].scale.y * (1 - .98 * clamp(blink, 0, 1)));
      pose[eye].scale.x *= 1 + .025 * blink;
    }
  }
  return { sample, attention };
}

function proceduralSpeech(t) {
  // Integer-period components close exactly at the four-second Speaking boundary.
  const p = TAU * t / 4;
  const syllables = .51 + .22 * Math.sin(p * 13) + .16 * Math.sin(p * 21 + .8);
  const phrase = .65 + .35 * Math.cos(p * 2);
  return clamp(syllables * phrase, .025, .9);
}
function blinkCurve(elapsed) {
  if (elapsed < 0 || elapsed >= .19) return 0;
  return elapsed < .065 ? smooth(elapsed / .065) : 1 - smooth((elapsed - .065) / .125);
}
function bakedBlink(t, duration, state) {
  if (state === 'sleep') return 0;
  return Math.max(blinkCurve(t - duration * .31), blinkCurve(t - duration * .76));
}

/** Export complete standard glTF-compatible clips. The input rig is never posed. */
export function createClips(root) {
  const rig = readRig(root), pose = newPose(rig), sampler = makeSampler(rig);
  return CLIP_SPECS.map(spec => {
    const count = Math.round(spec.duration * 30), times = [];
    const values = Object.fromEntries(Object.keys(rig).map(name => [name, { position: [], quaternion: [], scale: [] }]));
    for (let frame = 0; frame <= count; frame++) {
      const t = frame * spec.duration / count;
      times.push(t);
      sampler.sample(pose, spec.state, t);
      const envelope = spec.loop ? 1 : gesture(t, 0, .5, spec.duration - .5, spec.duration);
      const phase = TAU * t / spec.duration;
      sampler.attention(pose, spec.state, .12 * Math.sin(phase) * envelope, .07 * Math.sin(phase * 2) * envelope, bakedBlink(t, spec.duration, spec.state));
      for (const name in rig) for (const key of ['position', 'quaternion', 'scale']) pose[name][key].toArray(values[name][key], values[name][key].length);
    }
    const tracks = [];
    for (const name in rig) for (const key of ['position', 'quaternion', 'scale']) {
      const list = values[name][key], width = key === 'quaternion' ? 4 : 3;
      const changed = list.some((value, index) => Math.abs(value - list[index % width]) > 1e-7);
      const restArray = rig[name][key].toArray();
      const offset = list.slice(0, width).some((value, index) => Math.abs(value - restArray[index]) > 1e-7);
      if (!changed && !offset) continue;
      const Track = key === 'quaternion' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
      tracks.push(new Track(`${name}.${key}`, changed ? times : [0, spec.duration], changed ? list : [...list.slice(0, width), ...list.slice(0, width)]));
    }
    const clip = new THREE.AnimationClip(spec.name, spec.duration, tracks);
    clip.userData = { state: spec.state, loop: spec.loop, returnState: spec.loop ? null : 'idle', fps: 30 };
    return clip;
  });
}

/**
 * Live controller. Call update(deltaSeconds) from your existing render loop.
 * setSpeechLevel(null) restores procedural speech; a finite 0 silences the mouth.
 * Reduced motion holds a static pose, disables blink/gaze/idle loops, and retains
 * gentle state crossfades. dispose restores rest transforms, not shared resources.
 */
export function createController(root, options = {}) {
  const rig = readRig(root), sampler = makeSampler(rig);
  const target = newPose(rig), current = newPose(rig), from = newPose(rig), output = newPose(rig);
  let state = 'idle', stateTime = 0, elapsed = 0, transitionTime = .35, disposed = false;
  let reduced = Boolean(options.reducedMotion), lookX = 0, lookY = 0, targetX = 0, targetY = 0;
  let speechTarget = null, speechValue = proceduralSpeech(0);
  let randomSeed = (finite(options.seed) ? options.seed : 27183) >>> 0;
  if (!randomSeed) randomSeed = 27183;
  function random() { randomSeed ^= randomSeed << 13; randomSeed ^= randomSeed >>> 17; randomSeed ^= randomSeed << 5; return (randomSeed >>> 0) / 4294967296; }
  let nextBlink = 1.6 + random() * 2, blinkStart = -1, doublePending = false;
  let saccadeAt = .8 + random(), focusX = 0, focusY = 0, focusTargetX = 0, focusTargetY = 0;
  sampler.sample(current, state, 0, { reduced });
  copyPose(from, current);
  applyPose(rig, current);

  function setState(next) {
    if (!STATES.includes(next)) throw new RangeError(`Unknown hubtrace assistant state: ${String(next)}. Expected ${STATES.join(', ')}.`);
    if (disposed || next === state) return;
    copyPose(from, current);
    state = next;
    stateTime = 0;
    transitionTime = 0;
  }
  function update(delta) {
    if (disposed) return;
    const dt = finite(delta) ? clamp(delta, 0, .1) : 0;
    elapsed += dt;
    stateTime += dt;
    transitionTime += dt;
    const spec = SPEC[state];
    if (!spec.loop && stateTime >= spec.duration) {
      sampler.sample(current, state, spec.duration, { reduced, speech: speechTarget === null ? null : speechValue });
      setState('idle');
    }
    const duration = SPEC[state].duration;
    const localTime = SPEC[state].loop ? stateTime % duration : stateTime;
    // Keep a bounded phase over long-running dashboard sessions.
    if (SPEC[state].loop && stateTime > duration * 1000) stateTime %= duration;
    const speechDesired = speechTarget === null ? proceduralSpeech(localTime) : speechTarget;
    speechValue += (speechDesired - speechValue) * dampFactor(speechDesired > speechValue ? 24 : 15, dt);
    sampler.sample(target, state, localTime, { reduced, speech: speechValue });
    blendPose(current, from, target, smooth(transitionTime / .35));
    copyPose(output, current);

    if (!reduced) {
      if (elapsed >= nextBlink && blinkStart < 0) {
        blinkStart = elapsed;
        doublePending = random() < .14;
      }
      let blink = blinkStart < 0 ? 0 : blinkCurve(elapsed - blinkStart);
      if (blinkStart >= 0 && elapsed - blinkStart >= .19) {
        blinkStart = -1;
        nextBlink = elapsed + (doublePending ? .12 : 2.6 + random() * 3.8);
        doublePending = false;
        blink = 0;
      }
      if (elapsed >= saccadeAt) {
        focusTargetX = (random() - .5) * .19;
        focusTargetY = (random() - .5) * .12;
        saccadeAt = elapsed + 1.5 + random() * 2.8;
      }
      focusX += (focusTargetX - focusX) * dampFactor(14, dt);
      focusY += (focusTargetY - focusY) * dampFactor(14, dt);
      lookX += (targetX - lookX) * dampFactor(8, dt);
      lookY += (targetY - lookY) * dampFactor(8, dt);
      sampler.attention(output, state, clamp(lookX + focusX, -1, 1), clamp(lookY + focusY, -1, 1), blink);
    }
    applyPose(rig, output);
  }
  return {
    update,
    setState,
    setLook(x, y) { targetX = finite(x) ? clamp(x, -1, 1) : 0; targetY = finite(y) ? clamp(y, -1, 1) : 0; },
    setSpeechLevel(level = null) { speechTarget = level === null || level === undefined ? null : finite(level) ? clamp(level, 0, 1) : 0; },
    setReducedMotion(value) {
      const next = Boolean(value);
      if (disposed || next === reduced) return;
      copyPose(from, current);
      transitionTime = 0;
      reduced = next;
      blinkStart = -1;
      nextBlink = elapsed + 1.6 + random() * 2;
      focusX = focusY = focusTargetX = focusTargetY = 0;
    },
    getState() { return state; },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const name in rig) { const r = rig[name]; r.node.position.copy(r.position); r.node.quaternion.copy(r.quaternion); r.node.scale.copy(r.scale); }
    },
  };
}
