// 3D 모델 만들기: hubtrace 에셋 팩의 GLB를 웹용으로 줄인다(meshopt 압축 · WebP 텍스처 · 형상 단순화 · 같은 재질 메시 합치기).
// 결과 → public/assets/models/<id>.glb. 화면에서는 여러 대를 InstancedMesh로 그리므로 GLB 인스턴싱(EXT_mesh_gpu_instancing)은 쓰지 않는다.
// 사용: node scripts/build-models.mjs [에셋 팩 폴더(기본 hubtrace-assets-v2)] [id ...]  — npx로 glTF-Transform CLI를 받아 쓴다
import { execFileSync } from 'node:child_process'
import { mkdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const PACK = resolve(process.argv[2] ?? 'hubtrace-assets-v2')
const OUT = resolve('public/assets/models')

/** id → [텍스처 최대 크기, 남길 삼각형 비율] */
const MODELS = {
  'rail-locomotive': [1024, 0.3],
  'container-flatcar': [512, 0.2],
  'shipping-container': [512, 0.1],
}
const only = process.argv.slice(3)
mkdirSync(OUT, { recursive: true })

for (const [id, [size, ratio]] of Object.entries(MODELS)) {
  if (only.length && !only.includes(id)) continue
  const src = join(PACK, 'models', `${id}.glb`)
  const dst = join(OUT, `${id}.glb`)
  execFileSync('npx', [
    '-y', '@gltf-transform/cli@4.1.1', 'optimize', src, dst,
    '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', String(size),
    '--simplify', 'true', '--simplify-ratio', String(ratio), '--simplify-error', '0.002',
    '--join', 'true', '--instance', 'false',
  ], { stdio: ['ignore', 'ignore', 'inherit'] })
  console.log(`${id}: ${(statSync(src).size / 1024 / 1024).toFixed(1)} MB → ${(statSync(dst).size / 1024).toFixed(0)} KB`)
}
