// 계절·시간대·날씨에 따라 조명, 하늘, 안개, 눈비·꽃잎·낙엽, 노면(눈·젖음), 야간 불빛을 바꾼다.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { CameraControlsImpl } from '@react-three/drei'
import * as THREE from 'three'
import { sim } from '../../sim/sim'
import { daySeconds, resolveEnv, sunAngles, type EnvState, type Season } from '../../sim/env'
import { useStore } from '../../store'
import { ENV_U, look, patchScene, useEnvView } from './state'

interface Target {
  sunColor: string
  sunIntensity: number
  hemiSky: string
  hemiGround: string
  hemiIntensity: number
  ambient: number
  skyTop: string
  horizon: string
  sunGlow: number
  night: number
}

const DAY_SKY: Record<Season, [string, string]> = {
  spring: ['#B9D2F6', '#ECEFF7'],
  summer: ['#9CC4F4', '#E3EDF9'],
  autumn: ['#AECBF2', '#EEEBE6'],
  winter: ['#CBD7EA', '#EEF1F6'],
}

function targetOf(e: EnvState): Target {
  const [top, hor] = DAY_SKY[e.season]
  let t: Target
  if (e.time === 'day') {
    t = {
      sunColor: e.season === 'autumn' ? '#FFF2DE' : e.season === 'winter' ? '#F2F5FF' : '#FFFDF6',
      sunIntensity: e.season === 'summer' ? 2.35 : e.season === 'winter' ? 1.75 : 2.1,
      hemiSky: '#FFFFFF', hemiGround: e.season === 'autumn' ? '#D2C9C0' : '#C3CCE6', hemiIntensity: 1.55, ambient: 0.3,
      skyTop: top, horizon: hor, sunGlow: 0.15, night: 0,
    }
  } else if (e.time === 'sunset') {
    t = { sunColor: '#FFAE6E', sunIntensity: 2.0, hemiSky: '#FFE4CF', hemiGround: '#9C9BC0', hemiIntensity: 1.25, ambient: 0.26, skyTop: '#6A78BE', horizon: '#FFC08F', sunGlow: 1, night: 0.3 }
  } else if (e.time === 'dawn') {
    t = { sunColor: '#FFC2A4', sunIntensity: 1.2, hemiSky: '#D8CCEB', hemiGround: '#8389AE', hemiIntensity: 0.95, ambient: 0.2, skyTop: '#7484C4', horizon: '#F5C6BA', sunGlow: 0.8, night: 0.45 }
  } else {
    t = { sunColor: '#A9BEFF', sunIntensity: 0.45, hemiSky: '#56679C', hemiGround: '#1E253D', hemiIntensity: 0.78, ambient: 0.14, skyTop: '#070E26', horizon: '#1D2A4E', sunGlow: 0, night: 1 }
  }
  if (e.weather === 'rain') {
    const gray = e.time === 'night' ? '#151B2A' : '#8E97A9'
    t = {
      ...t,
      sunIntensity: t.sunIntensity * 0.35,
      hemiIntensity: t.hemiIntensity * 0.95,
      hemiSky: mixHex(t.hemiSky, '#B9C0CE', 0.6),
      skyTop: mixHex(t.skyTop, gray, 0.75),
      horizon: mixHex(t.horizon, e.time === 'night' ? '#222A3C' : '#AEB5C3', 0.75),
      sunGlow: t.sunGlow * 0.15,
    }
  } else if (e.weather === 'snow') {
    t = {
      ...t,
      sunIntensity: t.sunIntensity * 0.45,
      hemiIntensity: t.hemiIntensity * 1.05,
      hemiSky: mixHex(t.hemiSky, '#F4F6FA', 0.6),
      skyTop: mixHex(t.skyTop, e.time === 'night' ? '#20283A' : '#C6CDD9', 0.75),
      horizon: mixHex(t.horizon, e.time === 'night' ? '#2C3447' : '#E2E6EE', 0.75),
      sunGlow: t.sunGlow * 0.2,
    }
  }
  return t
}

function mixHex(a: string, b: string, k: number) {
  return '#' + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString()
}

const tmp = new THREE.Color()

/** 설정·시계를 읽어 목표값을 정하고 현재값을 부드럽게 옮긴다 */
function EnvDriver() {
  const target = useRef<Target>(targetOf(useEnvView.getState().env))
  const snowTarget = useRef(0)
  const wetTarget = useRef(0)
  const state = useRef<EnvState | null>(null)
  const acc = useRef(1)
  useFrame((_, dt) => {
    acc.current += dt
    if (acc.current > 0.4) {
      acc.current = 0
      // 자동이면 이 컴퓨터의 오늘 날짜·현재 시각을 따른다(상단 LIVE 시각과 같다)
      const now = new Date()
      const e = resolveEnv(useStore.getState().env, now, daySeconds(now))
      const prev = state.current
      if (!prev || prev.season !== e.season || prev.time !== e.time || prev.weather !== e.weather) useEnvView.setState({ env: e })
      state.current = e
      // 냉동탑차 온도 계산에 쓰는 바깥 기온(계절 · 낮밤 · 날씨)
      sim.cold.ambient = { spring: 16, summer: 30, autumn: 14, winter: -2 }[e.season] + (e.time === 'night' ? -5 : e.time === 'day' ? 3 : 0) + (e.weather === 'clear' ? 1 : -2)
      // 지붕 태양광 발전(탄소 탭): 장면과 같은 계절 · 날씨 · 시각
      sim.solar.season = e.season
      sim.solar.weather = e.weather
      sim.solar.envHour = e.hour
      target.current = targetOf(e)
      snowTarget.current = e.weather === 'snow' ? 1 : e.season === 'winter' ? 0.62 : 0
      wetTarget.current = e.weather === 'rain' ? 1 : e.weather === 'snow' ? 0.15 : 0
      look.rain = e.weather === 'rain' ? 1 : 0
      look.snowfall = e.weather === 'snow' ? 1 : 0
      look.petals = e.season === 'spring' && e.weather === 'clear' && e.time !== 'night' ? 1 : 0
      look.leaves = e.season === 'autumn' && e.weather === 'clear' && e.time !== 'night' ? 1 : 0
      look.fogMul = e.weather === 'clear' ? 1 : 0.55
      // 해 방향
      const { elevation, azimuth } = sunAngles(e.hour, e.season)
      const el = e.time === 'night' ? 0.95 : Math.max(0.12, elevation)
      const az = e.time === 'night' ? 2.3 : azimuth
      // x=동쪽, z=남쪽: 아침엔 동쪽(+x), 한낮엔 남쪽(+z), 저녁엔 서쪽(-x)
      look.sunDir.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el) * 0.8 + 0.25).normalize()
    }
    const k = 1 - Math.exp(-dt * 1.6)
    const t = target.current
    look.sunColor.lerp(tmp.set(t.sunColor), k)
    look.hemiSky.lerp(tmp.set(t.hemiSky), k)
    look.hemiGround.lerp(tmp.set(t.hemiGround), k)
    look.skyTop.lerp(tmp.set(t.skyTop), k)
    look.horizon.lerp(tmp.set(t.horizon), k)
    look.sunIntensity += (t.sunIntensity - look.sunIntensity) * k
    look.hemiIntensity += (t.hemiIntensity - look.hemiIntensity) * k
    look.ambient += (t.ambient - look.ambient) * k
    look.sunGlow += (t.sunGlow - look.sunGlow) * k
    look.night += (t.night - look.night) * k
    ENV_U.uNight.value = look.night
    // 눈은 천천히 쌓이고 천천히 녹는다. 젖은 노면은 빨리 젖고 천천히 마른다
    const s = snowTarget.current
    ENV_U.uSnow.value += (s - ENV_U.uSnow.value) * (1 - Math.exp(-dt * (s > ENV_U.uSnow.value ? 0.35 : 0.2)))
    const w = wetTarget.current
    ENV_U.uWet.value += (w - ENV_U.uWet.value) * (1 - Math.exp(-dt * (w > ENV_U.uWet.value ? 0.8 : 0.25)))
  })
  return null
}

/** 장면에 새로 붙은 재질에 환경 셰이더를 붙인다 */
function EnvPatcher() {
  const scene = useThree((s) => s.scene)
  const acc = useRef(10)
  useFrame((_, dt) => {
    acc.current += dt
    if (acc.current < 1.5) return
    acc.current = 0
    patchScene(scene)
  })
  return null
}

/** 해(달) · 하늘빛 · 그림자. 그림자는 카메라 주시점 근처에 맞춘다 */
function EnvLights() {
  const light = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const amb = useRef<THREE.AmbientLight>(null)
  const scene = useThree((s) => s.scene)
  const controls = useThree((s) => s.controls) as unknown as CameraControlsImpl | null
  const t = useMemo(() => new THREE.Vector3(), [])
  const dir = useMemo(() => look.sunDir.clone(), [])
  const basis = useMemo(() => ({ right: new THREE.Vector3(), up: new THREE.Vector3(), snapped: new THREE.Vector3() }), [])
  useEffect(() => {
    const l = light.current
    if (!l) return
    scene.add(l.target)
    return () => { scene.remove(l.target) }
  }, [scene])
  useFrame(() => {
    const l = light.current
    if (!l) return
    if (controls) controls.getTarget(t)
    t.y = 0
    // 해 방향은 0.5° 넘게 바뀔 때만 따라간다(그림자 경계가 매 프레임 떨리지 않게)
    if (dir.angleTo(look.sunDir) > 0.009) dir.copy(look.sunDir)
    // 그림자 중심을 광원 좌표계의 그림자 화소 격자에 맞춘다(카메라가 움직여도 그림자 화소가 미끄러지지 않는다)
    const texel = 190 / 4096
    basis.right.crossVectors(THREE.Object3D.DEFAULT_UP, dir).normalize()
    basis.up.crossVectors(dir, basis.right).normalize()
    const r = t.dot(basis.right)
    const u = t.dot(basis.up)
    basis.snapped.copy(t)
      .addScaledVector(basis.right, Math.round(r / texel) * texel - r)
      .addScaledVector(basis.up, Math.round(u / texel) * texel - u)
    l.position.copy(basis.snapped).addScaledVector(dir, 120)
    l.target.position.copy(basis.snapped)
    l.target.updateMatrixWorld()
    l.color.copy(look.sunColor)
    l.intensity = look.sunIntensity
    if (hemi.current) {
      hemi.current.color.copy(look.hemiSky)
      hemi.current.groundColor.copy(look.hemiGround)
      hemi.current.intensity = look.hemiIntensity
    }
    if (amb.current) amb.current.intensity = look.ambient
    // 배경·안개는 지평선 색을 따른다
    if (scene.background instanceof THREE.Color) scene.background.copy(look.horizon)
    else scene.background = look.horizon.clone()
    if (scene.fog) (scene.fog as THREE.Fog).color.copy(look.horizon)
  })
  return (
    <>
      <hemisphereLight ref={hemi} args={['#FFFFFF', '#C3CCE6', 1.55]} />
      <ambientLight ref={amb} intensity={0.3} />
      <directionalLight
        ref={light}
        castShadow
        intensity={2.1}
        color="#FFFDF8"
        shadow-mapSize={[4096, 4096]}
        shadow-camera-left={-95}
        shadow-camera-right={95}
        shadow-camera-top={95}
        shadow-camera-bottom={-95}
        shadow-camera-near={10}
        shadow-camera-far={320}
        shadow-bias={-0.0003}
        shadow-normalBias={0.05}
      />
    </>
  )
}

/** 하늘 돔(그러데이션 + 해 주변 빛 + 별) */
function SkyDome() {
  const camera = useThree((s) => s.camera)
  const group = useRef<THREE.Group>(null)
  const sky = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: true,
    uniforms: { uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() }, uGlow: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSun; uniform vec3 uSunCol; uniform float uGlow;
      varying vec3 vDir;
      void main(){
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 c = mix(uHorizon, uTop, pow(h, 0.5));
        float d = max(dot(normalize(vDir), normalize(uSun)), 0.0);
        c += uSunCol * (pow(d, 24.0) * 0.55 + pow(d, 4.0) * 0.18) * uGlow;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }), [])
  const stars = useMemo(() => {
    const n = 900
    const pos = new Float32Array(n * 3)
    const r = Math.random
    for (let i = 0; i < n; i++) {
      const th = r() * Math.PI * 2
      const y = 0.08 + r() * 0.92
      const rad = Math.sqrt(1 - y * y)
      pos.set([Math.cos(th) * rad * 3300, y * 3300, Math.sin(th) * rad * 3300], i * 3)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const m = new THREE.PointsMaterial({ color: '#FFFFFF', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false })
    return new THREE.Points(g, m)
  }, [])
  useFrame(() => {
    group.current?.position.copy(camera.position)
    sky.uniforms.uTop.value.copy(look.skyTop)
    sky.uniforms.uHorizon.value.copy(look.horizon)
    sky.uniforms.uSun.value.copy(look.sunDir)
    sky.uniforms.uSunCol.value.copy(look.sunColor)
    sky.uniforms.uGlow.value = look.sunGlow
    ;(stars.material as THREE.PointsMaterial).opacity = Math.max(0, look.night - 0.4) * 1.4 * (1 - look.rain) * (1 - look.snowfall)
  })
  return (
    <group ref={group}>
      <mesh material={sky} renderOrder={-10} frustumCulled={false}>
        <sphereGeometry args={[3500, 32, 16]} />
      </mesh>
      <primitive object={stars} renderOrder={-9} frustumCulled={false} />
    </group>
  )
}

// ───────────────────────── 눈·비·꽃잎·낙엽(GPU에서 떨어뜨린다)

const RAIN_N = 7000
const FLAKE_N = 5000

function useVolume() {
  const controls = useThree((s) => s.controls) as unknown as CameraControlsImpl | null
  const center = useMemo(() => new THREE.Vector3(), [])
  return () => {
    if (controls) controls.getTarget(center)
    const d = controls?.distance ?? 150
    return { center, size: THREE.MathUtils.clamp(d * 1.5, 150, 1500), height: THREE.MathUtils.clamp(d * 0.85, 70, 800), d }
  }
}

function Rain() {
  const vol = useVolume()
  const { geo, mat } = useMemo(() => {
    const base = new Float32Array(RAIN_N * 2 * 3)
    const end = new Float32Array(RAIN_N * 2)
    for (let i = 0; i < RAIN_N; i++) {
      const b = [Math.random(), Math.random(), Math.random()]
      base.set(b, i * 6)
      base.set(b, i * 6 + 3)
      end[i * 2 + 1] = 1
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RAIN_N * 6), 3))
    g.setAttribute('aBase', new THREE.BufferAttribute(base, 3))
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1))
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uSize: { value: 300 }, uHeight: { value: 120 }, uLen: { value: 1.6 }, uAlpha: { value: 0 }, uColor: { value: new THREE.Color('#C9D6EE') } },
      vertexShader: `
        uniform float uTime; uniform vec3 uCenter; uniform float uSize; uniform float uHeight; uniform float uLen;
        attribute vec3 aBase; attribute float aEnd; varying float vEnd;
        void main(){
          vec3 p;
          p.x = uCenter.x + mod(aBase.x * uSize - uCenter.x, uSize) - uSize * 0.5;
          p.z = uCenter.z + mod(aBase.z * uSize - uCenter.z, uSize) - uSize * 0.5;
          p.y = mod(aBase.y * uHeight - uTime * 38.0, uHeight);
          p.y += aEnd * uLen;
          p.x -= aEnd * uLen * 0.18;
          vEnd = aEnd;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `uniform float uAlpha; uniform vec3 uColor; varying float vEnd; void main(){ gl_FragColor = vec4(uColor, uAlpha * (0.25 + 0.75 * vEnd)); }`,
    })
    return { geo: g, mat: m }
  }, [])
  const obj = useMemo(() => {
    const l = new THREE.LineSegments(geo, mat)
    l.frustumCulled = false
    return l
  }, [geo, mat])
  useFrame((_, dt) => {
    const a = mat.uniforms.uAlpha
    a.value += ((look.rain ? 0.55 : 0) - a.value) * (1 - Math.exp(-dt * 1.5))
    obj.visible = a.value > 0.01
    if (!obj.visible) return
    const v = vol()
    mat.uniforms.uTime.value += dt
    mat.uniforms.uCenter.value.copy(v.center)
    mat.uniforms.uSize.value = v.size
    mat.uniforms.uHeight.value = v.height
    mat.uniforms.uLen.value = Math.max(1.6, v.d / 90)
    mat.uniforms.uColor.value.set(look.night > 0.5 ? '#7C8BB0' : '#C9D6EE')
  })
  return <primitive object={obj} />
}

/** 눈송이·벚꽃잎·낙엽: 흔들리며 내려오는 점 */
function Flakes() {
  const vol = useVolume()
  const pts = useMemo(() => {
    const base = new Float32Array(FLAKE_N * 3)
    const seed = new Float32Array(FLAKE_N)
    for (let i = 0; i < FLAKE_N; i++) {
      base.set([Math.random(), Math.random(), Math.random()], i * 3)
      seed[i] = Math.random()
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FLAKE_N * 3), 3))
    g.setAttribute('aBase', new THREE.BufferAttribute(base, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uSize: { value: 300 }, uHeight: { value: 120 }, uFall: { value: 2.2 },
        uPx: { value: 6 }, uAlpha: { value: 0 }, uMode: { value: 0 }, uCount: { value: 1 },
      },
      vertexShader: `
        uniform float uTime; uniform vec3 uCenter; uniform float uSize; uniform float uHeight; uniform float uFall; uniform float uPx; uniform float uCount;
        attribute vec3 aBase; attribute float aSeed; varying float vSeed; varying float vKeep;
        void main(){
          vec3 p;
          float sway = sin(uTime * (0.6 + aSeed) + aSeed * 30.0) * (2.0 + aSeed * 3.0);
          p.x = uCenter.x + mod(aBase.x * uSize - uCenter.x + sway, uSize) - uSize * 0.5;
          p.z = uCenter.z + mod(aBase.z * uSize - uCenter.z + cos(uTime * 0.7 + aSeed * 20.0) * 1.5, uSize) - uSize * 0.5;
          p.y = mod(aBase.y * uHeight - uTime * uFall * (0.7 + aSeed * 0.6), uHeight);
          vSeed = aSeed;
          vKeep = step(aSeed, uCount);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_PointSize = min(uPx * (0.6 + aSeed * 0.8) * (300.0 / -mv.z), uPx * 2.2);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uAlpha; uniform float uMode; varying float vSeed; varying float vKeep;
        void main(){
          if (vKeep < 0.5) discard;
          vec2 q = gl_PointCoord - 0.5;
          vec3 col = vec3(1.0);
          float a;
          if (uMode < 0.5) {
            a = smoothstep(0.5, 0.15, length(q));
          } else {
            // 꽃잎·잎: 납작한 타원
            float ang = vSeed * 6.283;
            vec2 r = vec2(cos(ang) * q.x - sin(ang) * q.y, sin(ang) * q.x + cos(ang) * q.y);
            a = smoothstep(0.5, 0.38, length(r * vec2(1.0, 2.2)));
            if (uMode < 1.5) col = mix(vec3(1.0, 0.78, 0.86), vec3(1.0, 0.92, 0.95), vSeed);
            else col = vSeed < 0.33 ? vec3(0.93, 0.42, 0.18) : vSeed < 0.66 ? vec3(0.96, 0.75, 0.2) : vec3(0.78, 0.25, 0.16);
          }
          if (a < 0.02) discard;
          gl_FragColor = vec4(col, a * uAlpha);
        }`,
    })
    const p = new THREE.Points(g, m)
    p.frustumCulled = false
    return p
  }, [])
  useFrame((_, dt) => {
    const m = pts.material as THREE.ShaderMaterial
    const mode = look.snowfall ? 0 : look.petals ? 1 : look.leaves ? 2 : -1
    const v0 = vol()
    // 꽃잎·낙엽은 가까이서만(멀리서 보면 점으로 뭉개진다)
    const want = mode === 0 ? 0.95 : mode > 0 && v0.d < 420 ? 0.9 : 0
    if (mode >= 0) m.uniforms.uMode.value = mode
    const a = m.uniforms.uAlpha
    a.value += (want - a.value) * (1 - Math.exp(-dt * 1.2))
    pts.visible = a.value > 0.01
    if (!pts.visible) return
    const v = vol()
    m.uniforms.uTime.value += dt
    m.uniforms.uCenter.value.copy(v.center)
    m.uniforms.uSize.value = v.size
    m.uniforms.uHeight.value = v.height
    // 눈은 많이, 꽃잎·낙엽은 드문드문
    m.uniforms.uCount.value = mode === 0 ? 1 : 0.14
    m.uniforms.uFall.value = mode === 0 ? 3.2 : 2.2
    m.uniforms.uPx.value = (mode === 0 ? 2.4 : 3.4) * Math.max(1, v.d / 160)
  })
  return <primitive object={pts} />
}

export function Environment() {
  return (
    <>
      <EnvDriver />
      <EnvPatcher />
      <EnvLights />
      <SkyDome />
      <Rain />
      <Flakes />
    </>
  )
}
