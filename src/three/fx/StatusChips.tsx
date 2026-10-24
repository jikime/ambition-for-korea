// 거점 화면에서 트럭 위에 떠 있는 작은 상태 칩(하차 중·후진 중·야드 대기…). 카메라에 가까운 차부터 몇 대만 보여 준다.
// 칩 자리는 MAX개를 고정해 두고(key = 자리 번호) 내용만 바꾼다: 차가 바뀔 때마다 Html을 새로 만들면 끊김이 생긴다.
import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { sim, type Vehicle } from '../../sim/sim'
import { useStore } from '../../store'
import { promiseChip, vehicleStatus } from '../../ui/format'
import { siteAt } from '../../ui/people'
import { L } from '../../i18n'

const MAX = 12
const HIDE = new Set(['highway', 'offsite', 'enroute', 'restArea', 'resting'])
const HTML_STYLE = { pointerEvents: 'none' } as const
const Z_RANGE: [number, number] = [15, 0]

function chipOf(v: Vehicle) {
  const rev = !!v.route && !v.route.done && v.route.leg.reverse && v.route.vel > 0.05
  if (rev) return { label: L('후진 중', 'Reversing'), tone: 'amber' as const }
  const s = vehicleStatus(v)
  // 도착 약속이 위험·지연이면 칩에 붙인다(이미 도착한 차는 빼고: 표시 글자 대신 도착 기록으로 가린다)
  const pc = promiseChip(v)
  if (pc && (pc.tone === 'amber' || pc.tone === 'red') && v.promise?.arrived === null) return { label: `${s.label} · ${pc.label}`, tone: pc.tone }
  return s
}

export function StatusChips() {
  useStore((s) => s.tick)
  const view = useStore((s) => s.view)
  const site = useStore((s) => s.site)
  const selected = useStore((s) => s.selected)
  const tour = useStore((s) => s.tour)
  const labels = useStore((s) => s.labels)
  const lens = useStore((s) => s.lens)
  const controls = useThree((s) => s.controls) as unknown as { distance?: number; getTarget?: (v: THREE.Vector3) => THREE.Vector3 } | null
  const slots = useRef<(THREE.Group | null)[]>([])
  const tmp = useMemo(() => new THREE.Vector3(), [])

  let list: Vehicle[] = []
  const dist = controls?.distance ?? 999
  if (labels && lens !== 'facilities' && view === 'site' && dist < 260) {
    const t = controls?.getTarget ? controls.getTarget(tmp) : tmp.set(0, 0, 0)
    list = sim.vehicles
      .filter((v) => v.visible && !HIDE.has(v.phase) && !(selected?.kind === 'vehicle' && selected.id === v.id) && siteAt(v.x, v.z) === site)
      .map((v) => ({ v, d: Math.hypot(v.x - t.x, v.z - t.z) }))
      .filter((o) => o.d < dist * 0.9)
      .sort((a, b) => a.d - b.d)
      .slice(0, tour !== null ? 6 : MAX)
      .map((o) => o.v)
  }

  useFrame(() => {
    for (let i = 0; i < MAX; i++) {
      const g = slots.current[i]
      const v = list[i]
      if (!g) continue
      g.visible = !!v
      if (v) g.position.set(v.x, v.kind === 'van' ? 3.6 : 5.0, v.z)
    }
  })

  return (
    <group>
      {Array.from({ length: MAX }, (_, i) => {
        const v = list[i]
        const s = v ? chipOf(v) : null
        return (
          <group key={i} ref={(o) => { slots.current[i] = o }}>
            <Html center zIndexRange={Z_RANGE} style={HTML_STYLE}>
              <div className={`v-chip tone-${s?.tone ?? 'gray'}`} style={v ? undefined : HIDDEN}>
                <i />
                <b>{v?.id}</b>
                <span>{s?.label}</span>
              </div>
            </Html>
          </group>
        )
      })}
    </group>
  )
}

const HIDDEN = { display: 'none' } as const
