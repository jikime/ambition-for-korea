import { useEffect } from 'react'
import { Scene } from './three/Scene'
import { useStore } from './store'
import { initAi } from './ai/judge'
import { sound } from './audio/sound'
import { TopBar } from './ui/TopBar'
import { Kpis, MapControls, Toast } from './ui/Overlays'
import { Inspector } from './ui/Inspector'
import { OpsPanel, Tracker } from './ui/BottomPanels'
import { OpsCenter } from './ui/center/OpsCenter'
import { FlowPanel } from './ui/FlowPanel'
import { ApproveDialog } from './ui/ApproveDialog'
import { Timeline } from './ui/Timeline'
import { useEnvView } from './three/env/state'
import { L } from './i18n'

export default function App() {
  useEffect(() => void initAi(), [])
  useEffect(() => sound.restore(), [])
  // 장면이 밤이면 패널도 어두운 테마로 바꾼다
  const time = useEnvView((s) => s.env.time)
  const panels = useStore((s) => s.panels)
  useEffect(() => {
    document.documentElement.dataset.theme = time === 'night' ? 'night' : 'day'
  }, [time])
  useEffect(() => {
    const id = setTimeout(() => useStore.getState().notify(L("오른쪽 위에서 거점을 바꾸거나, 아래 '여정 따라가기'로 택배 한 상자를 따라가 보세요", "Switch sites at the top right, or follow a single parcel with 'Follow journey' below")), 1800)
    return () => clearTimeout(id)
  }, [])
  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0 top-14">
        <Scene />
      </div>
      <div className="pointer-events-none absolute inset-0">
        <TopBar />
        {panels && <Kpis />}
        {panels && <FlowPanel />}
        <MapControls />
        {panels && <Inspector />}
        {panels && <Tracker />}
        {panels && <OpsPanel />}
        {panels && <Timeline />}
        <OpsCenter />
        <ApproveDialog />
        <Toast />
      </div>
    </div>
  )
}
