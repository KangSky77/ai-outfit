// 백엔드와 통신하는 함수들을 한 곳에 모아둔다.
// (운영/개발 모두 같은 오리진으로 요청 → Vite 프록시가 개발 환경을 처리)
import { serverLang } from './i18n.js'

// 공통 요청 헬퍼 — HTTP 에러를 한 곳에서 throw 로 바꿔준다.
async function request(url, options) {
  const res = await fetch(url, options)
  if (!res.ok) throw new Error(`${url} 요청 실패: ${res.status}`)
  return res.json()
}

export const fetchUser = () => request('/api/user')                 // 로그인 안 했으면 null
export const fetchHistory = () => request('/api/history')
export const fetchPublicGallery = () => request('/api/public-gallery')
export const likeOutfit = (id) => request(`/api/outfits/${id}/like`, { method: 'POST' }) // { likes, liked }
export const deleteOutfit = (id) => request(`/api/outfits/${id}`, { method: 'DELETE' })

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

// 분석 요청 — 실패해도 서버가 { error } 본문을 주므로 status 와 무관하게
// 본문을 그대로 반환한다 (호출부가 data.error 로 분기해서 사용자에게 보여줌).
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
  return res.json() // { analysis, id } 또는 { error }
}
