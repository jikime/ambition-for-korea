// 환경 효과 공용 상태: 셰이더 유니폼(눈 쌓임·젖음·야간), 현재 조명 값, 재질 패치.
// Merge가 재질을 복제하고 색을 정점 색으로 굽기 때문에, 색을 바꾸는 대신 셰이더에서 처리한다.
// - 눈: 위를 향한 면을 흰색으로 덮는다(재질 userData.snow 로 강도 조절, noSnow/투명 재질 제외)
// - 비: 위를 향한 면을 어둡고 매끈하게(젖은 노면)
// - 야간: userData.night = 'window'면 파란 유리 부분에 무작위로 불이 켜지고, 'lamp'면 발광이 밤에 세진다
import * as THREE from 'three'
import { create } from 'zustand'
import type { EnvState } from '../../sim/env'

export const ENV_U = {
  uSnow: { value: 0 },
  uWet: { value: 0 },
  uNight: { value: 0 },
}

/** 지붕 컷어웨이(0이면 지붕이 다 있고 1이면 다 녹아 없어짐). 건물마다 하나. 재질 userData.cut 에 키를 적는다 */
export const CUT_U: Record<string, { value: number }> = {
  DJ: { value: 0 },
  GJ: { value: 0 },
  IC: { value: 0 },
  /** 대전 창고 남쪽 벽 윗부분 */
  DJW: { value: 0 },
}

/** 지붕이 녹아 사라지는 재질로 표시 */
export function cutawayMaterial<T extends THREE.Material>(m: T, key: string): T {
  m.userData.cut = key
  m.userData.noSnow = false
  return m
}

/** 화면이 지금 보여 주는 환경(이산 값). 바뀔 때만 갱신된다 */
export const useEnvView = create<{ env: EnvState }>(() => ({ env: { season: 'autumn', time: 'day', weather: 'clear', hour: 10 } }))

/** 조명·하늘의 현재 값(프레임마다 목표값으로 보간) */
export const look = {
  sunColor: new THREE.Color('#FFFDF8'),
  sunIntensity: 2.1,
  hemiSky: new THREE.Color('#FFFFFF'),
  hemiGround: new THREE.Color('#C3CCE6'),
  hemiIntensity: 1.55,
  ambient: 0.3,
  skyTop: new THREE.Color('#BFD3F5'),
  horizon: new THREE.Color('#E7EBF6'),
  sunGlow: 0,
  night: 0,
  fogMul: 1,
  sunDir: new THREE.Vector3(0.5, 0.7, 0.6).normalize(),
  rain: 0,
  snowfall: 0,
  petals: 0,
  leaves: 0,
}

const VERT_HEAD = 'varying vec3 vEnvW;\n'
const VERT_BODY = `
  {
    vec4 ew = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      ew = instanceMatrix * ew;
    #endif
    vEnvW = (modelMatrix * ew).xyz;
  }
`
const FRAG_HEAD = `
varying vec3 vEnvW;
uniform float uSnow;
uniform float uWet;
uniform float uNight;
uniform float uSnowK;
uniform vec2 uWinGrid;
float envHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
#ifdef ENV_CUT
uniform float uCut;
float envNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(envHash(i), envHash(i + vec2(1.0, 0.0)), u.x), mix(envHash(i + vec2(0.0, 1.0)), envHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
#endif
`
const FRAG_BODY = `
  #ifdef ENV_CUT
  {
    // 지붕 컷어웨이: 노이즈 무늬를 따라 녹아 사라지고, 녹는 가장자리는 파랗게 빛난다
    float n = envNoise(vEnvW.xz * 0.09) * 0.7 + envNoise(vEnvW.xz * 0.37) * 0.3;
    float edge = n - uCut * 1.08 + 0.04;
    if (edge < 0.0) discard;
    totalEmissiveRadiance += vec3(0.25, 0.5, 1.0) * (1.0 - smoothstep(0.0, 0.05, edge)) * step(0.001, uCut) * 1.6;
  }
  #endif
  {
    vec3 wN = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
    float up = smoothstep(0.45, 0.85, wN.y);
    float s = clamp(uSnow * uSnowK * up, 0.0, 1.0);
    // 눈은 얼룩지게 쌓인다
    s *= 0.75 + 0.25 * envHash(floor(vEnvW.xz * 1.7));
    float w = uWet * up * (1.0 - s) * step(0.001, uSnowK);
    diffuseColor.rgb = mix(diffuseColor.rgb * (1.0 - 0.32 * w), vec3(0.94, 0.96, 0.99), s);
    roughnessFactor = mix(mix(roughnessFactor, 0.16, w), 0.92, s);
    #ifdef ENV_WINDOW
      float glass = smoothstep(0.06, 0.16, diffuseColor.b - diffuseColor.r);
      #ifdef USE_MAP
        vec2 cell = floor(vMapUv * uWinGrid) + floor(vEnvW.xz * 0.05);
      #else
        vec2 cell = floor(vEnvW.xz * 0.4 + vEnvW.y * 0.3);
      #endif
      float lit = step(0.38, envHash(cell));
      // 해가 지면 조금씩, 밤이 깊으면 많이 켜진다
      totalEmissiveRadiance += vec3(1.0, 0.78, 0.48) * glass * lit * uNight * uNight * 1.2;
    #endif
    #ifdef ENV_LAMP
      totalEmissiveRadiance *= mix(0.35, 3.2, uNight);
    #endif
  }
`

/** 표준 재질에 환경 셰이더를 붙인다(한 번만) */
/** 재질 설정(userData)을 컴파일 시점에 읽는다. 복제된 재질에 함수가 그대로 따라가도 결과가 같다 */
function envFlags(m: THREE.Material) {
  const sm = m as THREE.MeshStandardMaterial
  const kind = m.userData.night as 'window' | 'lamp' | undefined
  const snowK = sm.transparent || m.userData.noSnow ? 0 : typeof m.userData.snow === 'number' ? m.userData.snow : 1
  const cut = m.userData.cut as string | undefined
  return { kind, snowK, cut }
}

function envCompile(this: THREE.Material, shader: THREE.WebGLProgramParametersWithUniforms) {
  const { kind, snowK, cut } = envFlags(this)
  if (!snowK && !kind && !cut) return
  if (shader.vertexShader.includes('vEnvW')) return
  if (cut && CUT_U[cut]) {
    shader.uniforms.uCut = CUT_U[cut]
    shader.defines = { ...shader.defines, ENV_CUT: '' }
  }
  shader.uniforms.uSnow = ENV_U.uSnow
  shader.uniforms.uWet = ENV_U.uWet
  shader.uniforms.uNight = ENV_U.uNight
  shader.uniforms.uSnowK = { value: snowK }
  // 창 한 칸 크기(텍스처 한 장 안의 창 개수). 사무동은 큰 유리창, 아파트는 작은 창
  const grid = (this.userData.winGrid as [number, number] | undefined) ?? [12.8, 19.7]
  shader.uniforms.uWinGrid = { value: new THREE.Vector2(grid[0], grid[1]) }
  if (kind === 'window') shader.defines = { ...shader.defines, ENV_WINDOW: '' }
  if (kind === 'lamp') shader.defines = { ...shader.defines, ENV_LAMP: '' }
  shader.vertexShader = VERT_HEAD + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_BODY}`)
  shader.fragmentShader = FRAG_HEAD + shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${FRAG_BODY}`)
}

function envKey(this: THREE.Material) {
  const { kind, snowK, cut } = envFlags(this)
  return `env2-${snowK ? 's' : ''}${kind ?? ''}${cut ? `-cut-${cut}` : ''}`
}

/** 표준 재질에 환경 셰이더를 붙인다 */
export function patchEnvMaterial(m: THREE.Material) {
  const sm = m as THREE.MeshStandardMaterial
  // 자체 셰이더를 붙인 재질(바다 물보라 등)은 건드리지 않는다
  if (!sm.isMeshStandardMaterial || m.onBeforeCompile === envCompile || m.userData.customShader) return
  m.onBeforeCompile = envCompile
  m.customProgramCacheKey = envKey
  m.needsUpdate = true
}

/** 장면 전체 재질을 훑어 패치한다(새로 붙은 메시 포함) */
export function patchScene(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const ms = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const m of ms) if (m) patchEnvMaterial(m)
  })
}

/** 밤에 유리창이 켜지는 재질 표시 */
export function windowMaterial<T extends THREE.Material>(m: T, kind: 'apt' | 'office' = 'apt'): T {
  m.userData.night = 'window'
  m.userData.winGrid = kind === 'office' ? [8, 3] : [12.8, 19.7]
  return m
}

/** 밤에 밝아지는 등(가로등·전조등·간판 조명) */
export function lampMaterial<T extends THREE.Material>(m: T): T {
  m.userData.night = 'lamp'
  m.userData.noSnow = true
  return m
}
