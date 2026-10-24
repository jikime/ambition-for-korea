import type { Mesh, Object3D } from 'three'

/** Clone rigid joints, not the cached geometry/materials. Never dispose these shared resources here. */
export function createCharacterInstance(source: Object3D): Object3D {
  const instance = source.clone(true)
  instance.userData.skip = true
  instance.traverse((node) => {
    if ((node as Mesh).isMesh) node.userData.noMerge = true
  })
  return instance
}
