// 3D 모델 만들기: hubtrace 에셋 팩의 GLB를 웹용으로 줄인다(meshopt 압축 · WebP 텍스처 · 형상 단순화 · 같은 재질 메시 합치기).
// 결과 → public/assets/models/<id>.glb. 화면에서는 여러 대를 InstancedMesh로 그리므로 GLB 인스턴싱(EXT_mesh_gpu_instancing)은 쓰지 않는다.
// 문·윙·바퀴·포크를 움직이는 차량·지게차(parts)는 그 노드 이름과 계층이 남도록 장면을 펼치거나 합치지 않는다(합치기는 화면 코드가 한다).
// 사람(rig, 스킨·동작 포함)은 같은 재질 메시만 합치고 골격 계층은 펼치지 않는다.
// 사용: node scripts/build-models.mjs [에셋 팩 폴더(기본 hubtrace-assets-v2)] [id ...]  — npx로 glTF-Transform CLI를 받아 쓴다
import { execFileSync } from 'node:child_process'
import { mkdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const PACK = resolve(process.argv[2] ?? 'hubtrace-assets-v2')
const OUT = resolve('public/assets/models')

/** id → [텍스처 최대 크기, 남길 삼각형 비율, 종류(static · parts · rig)] */
const MODELS = {
  'rail-locomotive': [1024, 0.3, 'static'],
  'container-flatcar': [512, 0.2, 'static'],
  'shipping-container': [512, 0.1, 'static'],
  'delivery-truck': [1024, 0.3, 'parts'],
  'wing-truck': [1024, 0.3, 'parts'],
  'reefer-truck': [1024, 0.3, 'parts'],
  forklift: [1024, 0.3, 'parts'],
  'warehouse-worker': [1024, 0.5, 'rig'],
  'delivery-courier': [1024, 0.5, 'rig'],
}
const only = process.argv.slice(3)
mkdirSync(OUT, { recursive: true })

for (const [id, [size, ratio, kind]] of Object.entries(MODELS)) {
  if (only.length && !only.includes(id)) continue
  const src = join(PACK, 'models', `${id}.glb`)
  const dst = join(OUT, `${id}.glb`)
  execFileSync('npx', [
    '-y', '@gltf-transform/cli@4.1.1', 'optimize', src, dst,
    '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', String(size),
    '--simplify', 'true', '--simplify-ratio', String(ratio), '--simplify-error', '0.002',
    '--join', String(kind !== 'parts'), '--flatten', String(kind === 'static'), '--instance', 'false',
  ], { stdio: ['ignore', 'ignore', 'inherit'] })
  console.log(`${id}: ${(statSync(src).size / 1024 / 1024).toFixed(1)} MB → ${(statSync(dst).size / 1024).toFixed(0)} KB`)
}
