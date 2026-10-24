// 움직이는 장식 차량 무리를 인스턴스로 그린다: 차종마다 모델을 한 번 합쳐(Merge와 같은 방식) 재질별 InstancedMesh를 만들고,
// 매 프레임 update(put)으로 위치만 넣는다. 차가 늘어도 그리기 명령은 차종 × 재질 수다.
import { useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeStatic } from './merge'

interface Part { k: number; geo: THREE.BufferGeometry; mat: THREE.Material; tint: boolean; cast: boolean }

export function Fleet({ kinds, counts, colors, update, visible = () => true, shadows = true }: {
  /** 차종 틀(흰 차체로 두면 colors로 칠한다) */
  kinds: ReactElement[]
  /** 차종별 대수 */
  counts: number[]
  /** 차종별 · 차별 차체 색(없으면 칠하지 않음) */
  colors?: (string[] | null)[]
  /** 매 프레임: put(차종, 번호, 행렬) */
  update: (put: (k: number, j: number, m: THREE.Matrix4) => void) => void
  visible?: () => boolean
  shadows?: boolean
}) {
  const tpl = useRef<THREE.Group>(null)
  const all = useRef<THREE.Group>(null)
  const meshes = useRef<(THREE.InstancedMesh | null)[]>([])
  const [parts, setParts] = useState<Part[]>([])
  useLayoutEffect(() => {
    const root = tpl.current
    if (!root) return
    const out: Part[] = []
    root.children.forEach((g, k) => {
      for (const m of mergeStatic(g, true)) {
        m.removeFromParent()
        const mt = m.material as THREE.MeshStandardMaterial
        out.push({ k, geo: m.geometry, mat: mt, tint: !!colors?.[k] && mt.metalness < 0.1 && !mt.transparent, cast: shadows && m.castShadow })
      }
    })
    setParts(out)
    return () => {
      for (const p of out) {
        p.geo.dispose()
        p.mat.dispose()
      }
    }
    // 틀은 처음 한 번만 만든다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useLayoutEffect(() => {
    const col = new THREE.Color()
    parts.forEach((p, i) => {
      const m = meshes.current[i]
      const list = colors?.[p.k]
      if (!m || !p.tint || !list) return
      list.forEach((c, j) => m.setColorAt(j, col.set(c)))
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    })
  }, [parts, colors])
  const byKind = useMemo(() => {
    const out: number[][] = kinds.map(() => [])
    parts.forEach((p, i) => out[p.k].push(i))
    return out
  }, [parts, kinds])
  useFrame(() => {
    const show = visible()
    if (all.current) all.current.visible = show
    if (!show || !parts.length) return
    update((k, j, m4) => {
      for (const i of byKind[k]) meshes.current[i]?.setMatrixAt(j, m4)
    })
    for (const m of meshes.current) if (m) m.instanceMatrix.needsUpdate = true
  })
  return (
    <>
      <group ref={tpl} visible={false}>
        {kinds.map((el, k) => <group key={k}>{el}</group>)}
      </group>
      <group ref={all} name="fleet">
        {parts.map((p, i) => (
          <instancedMesh
            key={i}
            ref={(o) => { meshes.current[i] = o }}
            args={[p.geo, p.mat, Math.max(1, counts[p.k])]}
            count={counts[p.k]}
            castShadow={p.cast}
            receiveShadow
            frustumCulled={false}
          />
        ))}
      </group>
    </>
  )
}
