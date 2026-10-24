import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { aiMiddleware } from './server/http'

/** AI(Claude) 호출은 서버 미들웨어를 거친다. 키는 서버가 .env(ANTHROPIC_API_KEY)에서 읽고 브라우저로 보내지 않는다(VITE_ 접두사가 없어 화면 코드에 실리지 않음) */
function aiApi(): Plugin {
  return {
    name: 'ai-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => void aiMiddleware(req, res, next))
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => void aiMiddleware(req, res, next))
    },
  }
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), aiApi()],
    server: { port: 5188 },
    preview: { port: 5189 },
    build: {
      // 화면 문구가 한국어·영어 두 벌 들어 있어 본 묶음이 1MB 가까이 된다(gzip 약 320KB)
      chunkSizeWarningLimit: 1100,
      rolldownOptions: {
        output: {
          // 라이브러리는 따로 묶어 캐시를 오래 쓰게 한다
          advancedChunks: {
            groups: [
              { name: 'three', test: /node_modules[\\/]three[\\/]/ },
              { name: 'r3f', test: /node_modules[\\/](@react-three|three-stdlib|camera-controls|troika|zustand)/ },
              { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            ],
          },
        },
      },
    },
  }
})
