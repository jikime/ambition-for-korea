// 여러 건물이 같이 쓰는 재질(텍스처 하나). 반복 배율은 kit.boxUV로 지오메트리에 굽는다 → Merge가 한 번에 그림.
import * as THREE from 'three'
import { windowMaterial } from './env/state'
import { repeatTex } from './kit'
import { corrugatedTex, windowsTex } from './textures'

let officeFace: THREE.MeshStandardMaterial | null = null
let aptFace: THREE.MeshStandardMaterial | null = null
let corr: THREE.MeshStandardMaterial | null = null

/** 사무동 창(공유) */
export function officeFaceMat() {
  officeFace ??= windowMaterial(new THREE.MeshStandardMaterial({ map: repeatTex(windowsTex('office')), roughness: 0.25 }), 'office')
  return officeFace
}
/** 아파트·빌라 창(공유). 색만 다른 복제를 써도 Merge는 색을 정점 색으로 구워 같이 묶는다 */
export function aptFaceMat() {
  aptFace ??= windowMaterial(new THREE.MeshStandardMaterial({ map: repeatTex(windowsTex('apt')), roughness: 0.8 }))
  return aptFace
}
/** 공장·창고 골강판 벽(공유) */
export function corrugatedMat() {
  corr ??= new THREE.MeshStandardMaterial({ map: repeatTex(corrugatedTex('#EDF0F6', '#D8DEEA')), roughness: 0.8 })
  return corr
}
