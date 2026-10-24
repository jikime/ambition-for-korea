// 물류관리원 패널 배치: 넓은 화면(1440px 이상)에서는 오른쪽 열 위쪽에 자리 잡고(아래는 운영 현황 패널),
// 상세 정보 · 지도 버튼은 그 왼쪽으로 비켜선다. 좁은 화면에서는 오른쪽 패널 위에 덮어 연다.
import { useSyncExternalStore } from 'react'
import { useAgent } from '../../ai/agent/store'

function media(query: string) {
  const m = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query) : null
  return {
    subscribe: (f: () => void) => {
      m?.addEventListener('change', f)
      return () => m?.removeEventListener('change', f)
    },
    get: () => !!m?.matches,
  }
}

/** 상세 정보(304px)가 KPI 카드와 겹치지 않고 패널 왼쪽에 들어가는 폭 */
const WIDE = media('(min-width: 1440px)')
/** 지도 버튼까지 KPI 카드 줄 옆(위쪽)에 들어가는 폭 */
const WIDER = media('(min-width: 1480px)')

export function useAgentDock() {
  const open = useAgent((s) => s.open)
  const wide = useSyncExternalStore(WIDE.subscribe, WIDE.get, () => false)
  const wider = useSyncExternalStore(WIDER.subscribe, WIDER.get, () => false)
  return { open, docked: open && wide, roomy: wider }
}
