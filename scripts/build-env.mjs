// 환경 모델 만들기: hubtrace 도시·산업 환경 팩의 GLB를 웹용으로 줄인다(meshopt 압축 · 텍스처 크기 제한 · 형상 단순화).
// 노드 계층과 extras(지붕·정면·내부 구역 표시 section, 문 움직임 motion)를 지키려고 장면을 펼치거나 합치지 않는다
// (재질별로 합치기와 내부 빼기는 화면 코드 three/env.ts가 한다).
//  - 기본: 관제 화면 배경(산업단지 등)용 LOD1 → public/assets/env/<id>.glb
//  - --gallery: 3D 갤러리(?view=realistic)용 26종 상세(LOD0, 조립 장면 2종은 LOD1)와 비교용 LOD1 → public/assets/env-hd/<id>.glb · lod1/<id>.glb
// 사용: node scripts/build-env.mjs [팩 폴더(기본 hubtrace-environments-v1)] [--gallery] [id ...]  — npx로 glTF-Transform CLI를 받아 쓴다
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const args = process.argv.slice(2)
const gallery = args.includes('--gallery')
const rest = args.filter((a) => a !== '--gallery')
const PACK = resolve(rest[0] ?? 'hubtrace-environments-v1')
const OUT = resolve('public/assets/env')

/** id → [텍스처 최대 크기, 남길 삼각형 비율, 허용 오차(모델 크기 대비)] (LOD1 기준). 산업단지 배경은 수십 채라 멀리서 티 나지 않을 만큼 더 줄인다 */
const MODELS = {
  // 산업단지(공장 · 창고 · 주차장 칸): 89칸에 100채 넘게 놓이므로 외관 실루엣만 남길 만큼 줄인다
  'factory-production-hall': [512, 0.35, 0.02],
  'factory-utility-building': [512, 0.35, 0.02],
  'silo-farm': [256, 0.07, 0.02],
  'process-pipe-rack': [256, 0.2, 0.02],
  'industrial-chimney': [256, 0.15, 0.02],
  'distribution-warehouse': [512, 0.2, 0.02],
  'cold-storage-warehouse': [512, 0.25, 0.02],
  'surface-parking-lot': [256, 0.2, 0.02],
}
const only = rest.slice(1)

/** glTF-Transform optimize(노드 계층 · extras 유지) */
function optimize(src, dst, size, ratio, error, lossy) {
  execFileSync('npx', [
    '-y', '@gltf-transform/cli@4.1.1', 'optimize', src, dst,
    '--compress', 'meshopt', '--texture-compress', lossy ? 'webp' : 'false', '--texture-size', String(size),
    '--simplify', String(ratio < 1), '--simplify-ratio', String(ratio), '--simplify-error', String(error),
    '--join', 'false', '--flatten', 'false', '--instance', 'false',
  ], { stdio: ['ignore', 'ignore', 'inherit'] })
}

if (gallery) {
  // 갤러리: 보는 그대로의 모습이라 색을 바꾸지 않으므로 텍스처는 WebP로 줄인다
  const HD = resolve('public/assets/env-hd')
  mkdirSync(join(HD, 'lod1'), { recursive: true })
  const ids = JSON.parse(readFileSync(join(PACK, 'manifest.json'), 'utf8')).assets.map((a) => a.id)
  for (const id of ids) {
    if (only.length && !only.includes(id)) continue
    const scene = id === 'urban-district' || id === 'logistics-campus'
    const lod0 = join(PACK, 'models', scene ? 'lod1' : '', `${id}.glb`)
    optimize(lod0, join(HD, `${id}.glb`), 1024, scene ? 1 : 0.75, 0.001, true)
    // 조립 장면은 상세가 곧 LOD1이라 비교용을 따로 만들지 않는다
    if (!scene) optimize(join(PACK, 'models', 'lod1', `${id}.glb`), join(HD, 'lod1', `${id}.glb`), 512, 1, 0.001, true)
    console.log(`${id}: LOD0 ${(statSync(join(HD, `${id}.glb`)).size / 1024).toFixed(0)} KB${scene ? '' : ` · LOD1 ${(statSync(join(HD, 'lod1', `${id}.glb`)).size / 1024).toFixed(0)} KB`}`)
  }
  process.exit(0)
}

mkdirSync(OUT, { recursive: true })
for (const [id, [size, ratio, error]] of Object.entries(MODELS)) {
  if (only.length && !only.includes(id)) continue
  const src = join(PACK, 'models', 'lod1', `${id}.glb`)
  const dst = join(OUT, `${id}.glb`)
  // 텍스처는 손실 압축하지 않는다: 단색 재질을 모은 팔레트 텍스처(색 칸)가 흐려지면 화면에서 색을 바꿔 칠할 칸을 못 찾는다
  optimize(src, dst, size, ratio, error, false)
  console.log(`${id}: ${(statSync(src).size / 1024).toFixed(0)} KB → ${(statSync(dst).size / 1024).toFixed(0)} KB`)
}
