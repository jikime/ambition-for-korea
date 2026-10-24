// GLB 한 종을 여러 대 그리기(철송 열차·컨테이너 등): GLB 안 메시마다 InstancedMesh 하나를 만들고(지오메트리·재질 공유),
// 매 프레임 개체 행렬 × 메시 로컬 행렬로 인스턴스를 채운다. 그리기 명령은 개체 수와 무관하게 메시 수만큼이다.
//  - 투과(유리)·클리어코트 같은 물리 재질은 표준 재질로 바꾼다(투과 재질은 장면 전체를 한 번 더 그린다)
//  - tint 재질(도장면)은 텍스처를 회색조로 바꿔 두고 인스턴스 색을 곱해, 낡은 자국은 남기고 색만 바꾼다
//  - 부품(바퀴 등)을 따로 움직이지 않으므로, 같은 재질 메시는 불러올 때 하나로 합친다(그리기 명령 = 재질 수)
// 모델 좌표: 미터, +Y 위, +Z 앞(hubtrace 에셋 팩 규격). 메시는 Merge 대상이 아니다(userData.noMerge).
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export interface GlbPart {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  /** 모델 루트 기준 메시 행렬 */
  local: THREE.Matrix4
  tint: boolean
}

/** 회색조 텍스처(도장면 색 바꾸기용). 같은 원본은 한 번만 만든다 */
const grays = new Map<THREE.Texture, THREE.Texture>()
function grayTexture(tex: THREE.Texture) {
  const hit = grays.get(tex)
  if (hit) return hit
  const img = tex.image as CanvasImageSource & { width: number; height: number }
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d')!
  // 원래 도장(코발트)의 밝기를 끌어올려 인스턴스 색이 그대로 보이게 한다
  ctx.filter = 'grayscale(1) brightness(2.3)'
  ctx.drawImage(img, 0, 0)
  const out = new THREE.CanvasTexture(canvas)
  out.colorSpace = tex.colorSpace
  out.flipY = tex.flipY
  out.wrapS = tex.wrapS
  out.wrapT = tex.wrapT
  out.channel = tex.channel
  out.anisotropy = 4
  grays.set(tex, out)
  return out
}

/** 물리 재질 → 표준 재질(유리는 반투명), tint면 회색조 텍스처·흰 바탕색 */
function webMaterial(src: THREE.Material, tint: boolean): THREE.Material {
  const p = src as THREE.MeshPhysicalMaterial
  if (!p.isMeshStandardMaterial) return src
  let m: THREE.MeshStandardMaterial = p
  if (p.isMeshPhysicalMaterial) {
    m = new THREE.MeshStandardMaterial({
      name: p.name, color: p.color, map: p.map, normalMap: p.normalMap, normalScale: p.normalScale,
      roughness: p.roughness, roughnessMap: p.roughnessMap, metalness: p.metalness, metalnessMap: p.metalnessMap,
      emissive: p.emissive, emissiveMap: p.emissiveMap, emissiveIntensity: p.emissiveIntensity, aoMap: p.aoMap,
      alphaMap: p.alphaMap, transparent: p.transparent, opacity: p.opacity, side: p.side, alphaTest: p.alphaTest,
    })
    if (p.transmission > 0) {
      m.transparent = true
      m.opacity = 0.42
      m.color.set('#27324A')
      m.roughness = 0.08
      m.metalness = 0.3
      m.depthWrite = false
    }
  }
  if (tint) {
    if (m === p) m = p.clone()
    m.color.set('#ffffff')
    if (m.map) m.map = grayTexture(m.map)
  }
  return m
}

/**
 * 메시 하나를 모델 루트 좌표의 float 지오메트리로(위치·법선·UV만). meshopt 양자화(정수 정규화) 속성은
 * 노드 배율로 풀어야 하므로 먼저 float로 바꾼 뒤 행렬을 곱한다
 */
function bake(geo: THREE.BufferGeometry, m: THREE.Matrix4) {
  const out = new THREE.BufferGeometry()
  const n = geo.attributes.position.count
  for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2]] as const) {
    const a = geo.getAttribute(name) as THREE.BufferAttribute | undefined
    const arr = new Float32Array(n * size)
    if (a) for (let i = 0; i < n; i++) for (let j = 0; j < size; j++) arr[i * size + j] = a.getComponent(i, j)
    out.setAttribute(name, new THREE.BufferAttribute(arr, size))
  }
  // 합칠 때 색인 있는 것·없는 것이 섞이면 안 되므로 모두 색인을 단다
  out.setIndex(geo.index ? Array.from(geo.index.array as ArrayLike<number>) : Array.from({ length: n }, (_, i) => i))
  if (!geo.getAttribute('normal')) out.computeVertexNormals()
  out.applyMatrix4(m)
  return out
}

/** GLB 장면 → 재질마다 하나로 합친 조각들(모델 루트 기준). tint: 색을 바꿀 재질 이름 */
export function glbParts(scene: THREE.Object3D, tint?: RegExp): GlbPart[] {
  scene.updateMatrixWorld(true)
  const inv = scene.matrixWorld.clone().invert()
  const groups = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; tint: boolean }>()
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || Array.isArray(mesh.material)) return
    const src = mesh.material
    const g = groups.get(src) ?? { geos: [], tint: !!tint && tint.test(src.name) }
    g.geos.push(bake(mesh.geometry, inv.clone().multiply(mesh.matrixWorld)))
    groups.set(src, g)
  })
  const parts: GlbPart[] = []
  for (const [src, g] of groups) {
    const geometry = g.geos.length === 1 ? g.geos[0] : mergeGeometries(g.geos)
    if (!geometry) continue
    geometry.computeBoundingSphere()
    parts.push({ geometry, material: webMaterial(src, g.tint), local: new THREE.Matrix4(), tint: g.tint })
  }
  return parts
}

/** 같은 GLB를 capacity대까지 그리는 묶음. 매 프레임 begin → add… → end */
export class GlbInstances {
  readonly group = new THREE.Group()
  private items: { im: THREE.InstancedMesh; local: THREE.Matrix4; tint: boolean }[] = []
  private n = 0
  private m = new THREE.Matrix4()

  constructor(parts: GlbPart[], readonly capacity: number) {
    const white = new THREE.Color('#ffffff')
    for (const p of parts) {
      const im = new THREE.InstancedMesh(p.geometry, p.material, capacity)
      im.frustumCulled = false
      im.castShadow = !(p.material as THREE.MeshStandardMaterial).transparent
      im.receiveShadow = true
      im.userData.noMerge = true
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      if (p.tint) for (let i = 0; i < capacity; i++) im.setColorAt(i, white)
      im.count = 0
      this.items.push({ im, local: p.local, tint: p.tint })
      this.group.add(im)
    }
  }

  begin() {
    this.n = 0
  }

  /** 개체 하나(모델 루트 행렬). color는 tint 재질에만 */
  add(matrix: THREE.Matrix4, color?: THREE.Color) {
    if (this.n >= this.capacity) return
    for (const it of this.items) {
      it.im.setMatrixAt(this.n, this.m.multiplyMatrices(matrix, it.local))
      if (it.tint && color) it.im.setColorAt(this.n, color)
    }
    this.n++
  }

  end() {
    for (const it of this.items) {
      it.im.count = this.n
      it.im.instanceMatrix.needsUpdate = true
      if (it.im.instanceColor) it.im.instanceColor.needsUpdate = true
    }
  }
}
