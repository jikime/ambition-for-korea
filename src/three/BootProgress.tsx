// 장면 안에서 로딩 화면(src/boot.ts)에 진행을 알리고 다 되면 닫는다.
//  - assets: three 기본 로딩 매니저가 세는 GLB · 텍스처(drei useProgress)의 받은 개수/전체 개수
//  - render: 받기가 잠잠해지면 셰이더를 미리 컴파일(compileAsync)하고 두 프레임을 그린 뒤 닫는다(첫 화면 끊김을 가린다)
//  - 무엇이 늦어도 20초가 지나면 닫는다
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useProgress } from '@react-three/drei'
import { boot } from '../boot'

const QUIET_MS = 700
const MAX_MS = 20_000

export function BootProgress() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const st = useRef({ t0: performance.now(), last: performance.now(), frames: 0, phase: 'assets' as 'assets' | 'compile' | 'frames' | 'done', after: 0 })

  useEffect(() => {
    if (boot.finished) {
      st.current.phase = 'done'
      return
    }
    boot.step('assets', 52, 58)
    const show = (s: ReturnType<typeof useProgress.getState>) => {
      st.current.last = performance.now()
      if (s.total > 0) boot.set(52 + (38 * s.loaded) / s.total, `${s.loaded}/${s.total}`)
    }
    show(useProgress.getState())
    return useProgress.subscribe(show)
  }, [])

  useFrame(() => {
    const s = st.current
    if (s.phase === 'done') return
    s.frames++
    const now = performance.now()
    const p = useProgress.getState()
    const quiet = !p.active && p.loaded >= p.total && now - s.last > QUIET_MS
    if (now - s.t0 > MAX_MS) {
      s.phase = 'done'
      boot.done()
      return
    }
    if (s.phase === 'assets' && quiet && s.frames > 3) {
      s.phase = 'compile'
      boot.step('render', 90, 97)
      gl.compileAsync(scene, camera)
        .catch(() => {})
        .finally(() => {
          s.phase = 'frames'
          s.after = s.frames
        })
    } else if (s.phase === 'frames' && s.frames - s.after >= 2) {
      s.phase = 'done'
      boot.done()
    }
  })
  return null
}
