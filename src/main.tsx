import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { L, LANG } from './i18n'

// 페이지 언어와 제목
document.documentElement.lang = LANG
document.title = L('허브트레이스 · 물류 관제', 'HubTrace · Logistics Control')

const Gallery = lazy(() => import('./gallery/AssetGallery'))
const RealisticGallery = lazy(() => import('./gallery/RealisticGallery'))
const view = new URLSearchParams(location.search).get('view')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {view === 'assets' ? (
      <Suspense fallback={null}>
        <Gallery />
      </Suspense>
    ) : view === 'realistic' ? (
      <Suspense fallback={null}>
        <RealisticGallery />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)
