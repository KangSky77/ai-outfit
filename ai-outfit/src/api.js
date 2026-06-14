// 백엔드와 통신하는 함수들을 한 곳에 모아둔다.
// (운영/개발 모두 같은 오리진으로 요청 → Vite 프록시가 개발 환경을 처리)
import { serverLang } from './i18n.js'

export async function fetchUser() {
  const res = await fetch('/api/user')
  if (!res.ok) throw new Error(`user 요청 실패: ${res.status}`)
  return res.json() // 로그인 안 했으면 null
}

export async function fetchHistory() {
  const res = await fetch('/api/history')
  if (!res.ok) throw new Error(`history 요청 실패: ${res.status}`)
  return res.json()
}

export async function fetchPublicGallery() {
  const res = await fetch('/api/public-gallery')
  if (!res.ok) throw new Error(`gallery 요청 실패: ${res.status}`)
  return res.json()
}

export async function likeOutfit(id) {
  const res = await fetch(`/api/outfits/${id}/like`, { method: 'POST' })
  if (!res.ok) throw new Error(`like 실패: ${res.status}`)
  return res.json() // { likes }
}

export async function deleteOutfit(id) {
  const res = await fetch(`/api/outfits/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`delete 실패: ${res.status}`)
  return res.json()
}

// 브라우저 Geolocation. 권한 거부/미지원이면 null로 resolve (절대 reject 안 함)
export function getUserLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null)
    )
  })
}

export async function analyzeOutfit(file, { coords, isPublic } = {}) {
  const formData = new FormData()
  formData.append('selfie', file)
  formData.append('lang', serverLang)
  formData.append('isPublic', isPublic ? 'true' : 'false')
  if (coords) {
    formData.append('lat', coords.lat)
    formData.append('lon', coords.lon)
  }
  const res = await fetch('/analyze-outfit', { method: 'POST', body: formData })
  return res.json() // { analysis } 또는 { error }
}
