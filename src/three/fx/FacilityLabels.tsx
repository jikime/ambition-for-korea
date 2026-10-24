// 거점 안 보기 전환(항만 관제 영상 분석 3순위 A-1의 가벼운 버전): 이름표를 "시설"로 바꾸면 트럭 상태 칩 대신
// 거점의 작업 단계(현장 흐름, src/ui/flow.ts)를 그 자리 위에 "이름 · 수치 · 한 줄 상태"로 띄운다. 누르면 그 단계로 카메라.
import { Html } from '@react-three/drei'
import { useStore } from '../../store'
import { flowSteps } from '../../ui/flow'
import { focusStep } from '../../ui/FlowPanel'

/** 단계 자리(흐름 단계에 구역이 없을 때) [x, z] */
const AT: Record<string, [number, number]> = {
  'gj-sort': [-22, -30], 'ic-pick': [418, -28], 'in-sort': [-500, -34], 'bs-sts': [255, 300], 'bs-agv': [255, 278],
  'dj-qc': [612, -40], 'dj-put': [628, -54], 'dj-pick': [664, -54],
}
/** 같은 구역을 쓰는 단계는 조금 비킨다 */
const NUDGE: Record<string, [number, number]> = { 'in-load': [0, 12], 'in-chute': [10, 0] }
/** 이름표 높이(큰 건물 안 단계는 지붕 위로) */
const Y: Record<string, number> = {
  'gj-store': 15, 'gj-sort': 15, 'ic-amr': 17, 'ic-pick': 16, 'ic-pack': 15, 'dj-store': 16, 'dj-put': 15, 'dj-pick': 15, 'dj-qc': 14,
  'bs-sts': 32, 'bs-rail': 20, 'ap-stand': 20, 'ap-land': 24, 'ap-screen': 16, 'tw-door': 14,
}
/** 장치장 블록은 YardLabels가 따로, 이륙은 활주로 끝이라 뺀다 */
const SKIP = new Set(['bs-yard', 'ap-takeoff'])

export function FacilityLabels() {
  useStore((s) => s.tick)
  const view = useStore((s) => s.view)
  const site = useStore((s) => s.site)
  const labels = useStore((s) => s.labels)
  const lens = useStore((s) => s.lens)
  if (!labels || lens === 'vehicles' || view !== 'site') return null
  const steps = flowSteps(site, 'site').filter((s) => !SKIP.has(s.key))
  return (
    <group>
      {steps.map((s) => {
        const z = s.focus().zone
        const at = AT[s.key] ?? (z ? [z.x, z.z] as [number, number] : null)
        if (!at) return null
        const [dx, dz] = NUDGE[s.key] ?? [0, 0]
        return (
          <group key={s.key} position={[at[0] + dx, Y[s.key] ?? 9, at[1] + dz]}>
            <Html center zIndexRange={[13, 0]}>
              <button
                type="button"
                className="v-chip tone-blue fac-chip"
                title={s.desc}
                onClick={() => focusStep(s, { view: 'site', site })}
              >
                <i />
                <b>{s.label}</b>
                <span className="num">{s.count}</span>
                <em>{s.status}</em>
              </button>
            </Html>
          </group>
        )
      })}
    </group>
  )
}
