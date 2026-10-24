// 재생 막대 조작: 되감기 시작(시뮬레이션 멈춤) · 재생 시각 옮기기 · LIVE 복귀. 기록과 써 넣기는 src/sim/history.ts
import { sim } from '../sim/sim'
import { SPEEDUP } from '../sim/clock'
import { useStore } from '../store'
import { L } from '../i18n'

/** 재생 시각으로 옮긴다(LIVE였으면 지금 상태를 저장하고 멈춘다) */
export function seekReplay(t: number, playing?: boolean) {
  const H = sim.history
  const st = useStore.getState()
  if (!st.replay.on && !H.start()) return
  const { t0, t1 } = H.range()
  const tt = Math.max(t0, Math.min(t1, t))
  H.seek(tt)
  st.setReplay({ on: true, t: tt, playing: playing ?? (st.replay.on ? st.replay.playing : false) })
}

/** LIVE로: 멈출 때 상태로 되돌리고 시뮬레이션을 이어 간다 */
export function exitReplay() {
  sim.history.stop()
  useStore.getState().setReplay({ on: false, playing: false })
}

/** 프레임마다(Scene SimDriver): 재생 중이면 재생 시각을 진행하고 끝에 닿으면 LIVE로 */
export function advanceReplay(dt: number) {
  const st = useStore.getState()
  if (!st.replay.on || !st.replay.playing) return
  const t = st.replay.t + Math.min(dt, 0.05) * SPEEDUP * st.replay.rate
  if (t >= sim.history.range().t1) {
    exitReplay()
    st.notify(L('재생이 지금 시각에 닿아 LIVE로 돌아왔습니다', 'Replay reached the present and returned to LIVE'))
    return
  }
  sim.history.seek(t)
  st.setReplay({ t })
}
