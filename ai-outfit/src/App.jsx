import { useEffect, useState } from 'react'
import MainApp from './components/MainApp.jsx'
import { fetchUser } from './api.js'

export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchUser()
      .then(setUser)
      .catch((e) => console.error('초기화 중 에러:', e))
      .finally(() => setLoading(false))
  }, [])

  // 로그인 확인 전에는 깜빡임 방지를 위해 아무것도 그리지 않는다.
  if (loading) return null

  return (
    <div className="app-container">
      <MainApp user={user} />
    </div>
  )
}
