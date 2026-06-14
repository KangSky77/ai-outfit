const KEY = 'theme'

// 저장된 설정 우선, 없으면 시스템(OS) 다크모드 설정을 따른다.
export function getInitialTheme() {
  const saved = localStorage.getItem(KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
  localStorage.setItem(KEY, theme)
}
