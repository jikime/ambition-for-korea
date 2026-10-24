// 장면 안(Canvas)에서 소리를 장면에 붙인다: 듣는 위치를 카메라가 보는 곳 위에 두고(멀리 볼수록 높이 → 작게 들린다),
// 매 프레임 시뮬레이션 사건을 소리로 바꾼다(SoundDirector). 소리가 꺼져 있으면 아무것도 하지 않는다.
import { useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { CameraControlsImpl } from '@react-three/drei'
import * as THREE from 'three'
import { SoundDirector } from './director'
import { sound } from './sound'

export function SoundBridge() {
  const controls = useThree((s) => s.controls) as unknown as CameraControlsImpl | null
  const director = useMemo(() => new SoundDirector(), [])
  const target = useMemo(() => new THREE.Vector3(), [])
  const fwd = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera }) => {
    if (!sound.on) {
      director.step({ x: 0, z: 0, dist: 0 })
      return
    }
    if (controls) controls.getTarget(target)
    else target.set(0, 0, 0)
    const dist = camera.position.distanceTo(target)
    camera.getWorldDirection(fwd)
    sound.listen([target.x, target.y + dist * 0.25, target.z], [fwd.x, fwd.y, fwd.z], [camera.up.x, camera.up.y, camera.up.z])
    director.step({ x: target.x, z: target.z, dist })
  })
  return null
}
