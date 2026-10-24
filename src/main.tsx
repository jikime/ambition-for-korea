import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { L, LANG } from './i18n'
import { boot, nextPaint } from './boot'

// 페이지 언어와 제목
document.documentElement.lang = LANG
document.title = L('허브트레이스 · 물류 관제', 'HubTrace · Logistics Control')

const Gallery = lazy(() => import('./gallery/AssetGallery'))
const RealisticGallery = lazy(() => import('./gallery/RealisticGallery'))
const view = new URLSearchParams(location.search).get('view')

async function start() {
  const root = createRoot(document.getElementById('root')!)
  if (view === 'assets' || view === 'realistic') {
    // 갤러리는 시뮬레이션이 없다: 화면을 그리면 로딩 화면을 닫는다(모델은 갤러리가 따로 "불러오는 중"을 보여 준다)
    root.render(
      <StrictMode>
        <Suspense fallback={null}>{view === 'assets' ? <Gallery /> : <RealisticGallery />}</Suspense>
      </StrictMode>,
    )
    await (view === 'assets' ? import('./gallery/AssetGallery') : import('./gallery/RealisticGallery'))
    await nextPaint()
    boot.done()
    return
  }
  // 관제 화면 코드를 받는 동안 단계 문구가 먼저 그려지고, 받은 뒤 시뮬레이션 예열(150초분)이 이어진다
  boot.step('sim', 18, 40)
  const { default: App } = await import('./App')
  boot.step('scene', 42, 52)
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void start()
