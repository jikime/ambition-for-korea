import { useLayoutEffect, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import type { ThreeElements } from '@react-three/fiber'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

type Mat = THREE.MeshStandardMaterial | THREE.MeshBasicMaterial

/**
 * 정적인 자식 메시를 재질 성격별로 합쳐 드로우콜을 줄인다.
 * - 색은 정점 색으로 옮겨 같은 성격의 재질끼리 한 메시가 된다.
 * - userData.dynamic 그룹은 그 그룹 안에서만 따로 합친다(움직이는 부품).
 * - 원본 메시는 숨겨 두고 레이캐스트(클릭) 대상으로만 쓴다.
 */
export function mergeStatic(root: THREE.Object3D, flat = false): THREE.Mesh[] {
  root.updateWorldMatrix(true, true)
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const buckets = new Map<string, { geos: THREE.BufferGeometry[]; mat: Mat; cast: boolean }>()
  const created: THREE.Mesh[] = []
  const m4 = new THREE.Matrix4()

  const visit = (o: THREE.Object3D, isRoot: boolean) => {
    if (!isRoot && o.userData.skip) return
    // flat: 세워 둔 차처럼 움직일 일이 없으면 바퀴·문(dynamic)까지 한꺼번에 합친다
    if (!isRoot && o.userData.dynamic && !flat) {
      created.push(...mergeStatic(o))
      return
    }
    const mesh = o as THREE.Mesh
    if (mesh.isMesh && !(o as THREE.InstancedMesh).isInstancedMesh && !o.userData.noMerge && !o.userData.merged && mesh.visible) {
      const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Mat[]
      if (mats.every((m) => (m as THREE.MeshStandardMaterial).isMeshStandardMaterial)) {
        let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
        for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name)
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
        if (!g.attributes.normal) g.computeVertexNormals()
        g.morphAttributes = {}
        m4.multiplyMatrices(inv, mesh.matrixWorld)
        g.applyMatrix4(m4)
        // 다중 재질이면 그룹별로 잘라 각 재질 버킷에 넣는다
        const parts: { geo: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial }[] = []
        if (Array.isArray(mesh.material) && g.groups.length) {
          for (const grp of g.groups) {
            const sm = mats[grp.materialIndex ?? 0] as THREE.MeshStandardMaterial
            if (!sm || !sm.visible) continue
            const sub = new THREE.BufferGeometry()
            for (const name of ['position', 'normal', 'uv']) {
              const a = g.attributes[name] as THREE.BufferAttribute
              sub.setAttribute(name, new THREE.BufferAttribute(a.array.slice(grp.start * a.itemSize, (grp.start + grp.count) * a.itemSize), a.itemSize))
            }
            parts.push({ geo: sub, mat: sm })
          }
          g.dispose()
        } else {
          g.clearGroups()
          parts.push({ geo: g, mat: mats[0] as THREE.MeshStandardMaterial })
        }
        for (const { geo, mat: sm } of parts) {
          const metal = sm.metalness > 0.1
          const key = [sm.map?.uuid ?? '', sm.transparent ? sm.opacity : 1, metal ? 'm' : 'd', sm.emissive.getHexString(), sm.emissiveIntensity, sm.side, sm.alphaTest, sm.depthWrite].join('|')
          const n = geo.attributes.position.count
          const col = new Float32Array(n * 3)
          for (let i = 0; i < n; i++) col.set([sm.color.r, sm.color.g, sm.color.b], i * 3)
          geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
          let b = buckets.get(key)
          if (!b) {
            const merged = sm.clone()
            merged.vertexColors = true
            merged.color.set('#ffffff')
            if (metal) {
              merged.roughness = 0.45
              merged.metalness = 0.3
            }
            b = { geos: [], mat: merged, cast: false }
            buckets.set(key, b)
          }
          b.geos.push(geo)
          b.cast ||= mesh.castShadow
        }
        mesh.visible = false
        mesh.userData.hiddenByMerge = true
      }
    }
    for (const c of [...o.children]) visit(c, false)
  }
  visit(root, true)

  for (const b of buckets.values()) {
    const geo = mergeGeometries(b.geos, false)
    b.geos.forEach((g) => g.dispose())
    if (!geo) continue
    const mesh = new THREE.Mesh(geo, b.mat)
    mesh.castShadow = b.cast
    mesh.receiveShadow = true
    mesh.userData.merged = true
    mesh.raycast = () => {}
    root.add(mesh)
    created.push(mesh)
  }
  return created
}

/** 자식 트리를 마운트 직후 한 번 합친다 */
export function Merge({ children, noSnow, flat, ...rest }: {
  children: ReactNode
  /** 지붕 아래 설비: 눈·젖음 효과 제외 */
  noSnow?: boolean
  /** 움직이는 부품(userData.dynamic)도 따로 두지 않고 모두 합친다(세워 둔 차·배경) */
  flat?: boolean
} & Omit<ThreeElements['group'], 'children' | 'ref'>) {
  const ref = useRef<THREE.Group>(null)
  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    const made = mergeStatic(root, flat)
    if (noSnow) for (const m of made) (m.material as THREE.Material).userData.noSnow = true
    return () => {
      for (const m of made) {
        m.removeFromParent()
        m.geometry.dispose()
        ;(m.material as THREE.Material).dispose()
      }
      root.traverse((o) => {
        if (o.userData.hiddenByMerge) {
          o.visible = true
          o.userData.hiddenByMerge = false
        }
      })
    }
  }, [])
  return (
    <group ref={ref} {...rest}>
      {children}
    </group>
  )
}
