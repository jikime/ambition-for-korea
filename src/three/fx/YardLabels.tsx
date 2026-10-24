// 부산신항 장치장 블록 점유율 이름표(항만 관제 영상 3순위): 블록마다 "A 블록 76%". 90% 이상이면 빨강(포화 주의).
import { Html } from '@react-three/drei'
import { sim } from '../../sim/sim'
import { PORT } from '../../sim/port'
import { useStore } from '../../store'
import { L, LL } from '../../i18n'

const NAMES = LL(['A 블록 · 냉동', 'B 블록', 'C 블록', 'D 블록 · 위험물'], ['Block A · Reefer', 'Block B', 'Block C', 'Block D · Dangerous goods'])
const Z = (PORT.blockBays[0] + PORT.blockBays[PORT.blockBays.length - 1]) / 2

export function YardLabels() {
  useStore((s) => s.tick)
  const site = useStore((s) => s.site)
  const view = useStore((s) => s.view)
  const labels = useStore((s) => s.labels)
  if (!labels || view !== 'site' || site !== 'BS') return null
  const occ = sim.port.occupancy()
  return (
    <group>
      {PORT.blocks.map((x, b) => {
        const pct = Math.round(occ[b] * 100)
        const tone = pct >= 90 ? 'red' : pct >= 75 ? 'amber' : 'green'
        return (
          <group key={b} position={[x, 16, Z]}>
            <Html center zIndexRange={[14, 0]} style={{ pointerEvents: 'none' }}>
              <div className={`v-chip tone-${tone}`}>
                <i />
                <b>{NAMES[b]}</b>
                <span>{pct}%{pct >= 90 ? L(' · 포화 주의', ' · Near full') : ''}</span>
              </div>
            </Html>
          </group>
        )
      })}
    </group>
  )
}
