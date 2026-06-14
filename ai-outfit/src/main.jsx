import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { getInitialTheme, applyTheme } from './theme.js'
import './styles.css'

// 첫 렌더 전에 테마를 적용해서 깜빡임(light→dark 번쩍) 방지
applyTheme(getInitialTheme())

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)

// PWA 서비스워커 등록 (설치 + 오프라인 지원)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('SW 등록 실패:', e))
  })
}
