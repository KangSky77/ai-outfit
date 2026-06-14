import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 백엔드(Express)가 7704 포트에서 돌고, Vite 개발서버는 5173에서 돈다.
// 개발 중에는 /api, /auth, /uploads 등의 요청을 Express로 프록시해서
// 운영(빌드 후 Express가 dist를 직접 서빙)과 동일한 동작을 재현한다.
const backend = 'http://localhost:7704'

export default defineConfig({
  plugins: [react()],
  // 정적 자산 폴더. 기본값 'public'은 서버의 업로드 심링크가 들어있어 충돌하므로
  // 'static' 으로 분리한다. (static/* 는 빌드 시 dist 루트로 복사됨)
  publicDir: 'static',
  server: {
    port: 5173,
    proxy: {
      '/api': backend,
      '/analyze-outfit': backend,
      '/auth': backend,
      '/logout': backend,
      '/uploads': backend,
    },
  },
  build: {
    outDir: 'dist',
  },
})
