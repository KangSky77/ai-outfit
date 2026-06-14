// 간단한 서비스워커: 앱 셸(html/js/css/아이콘)을 런타임 캐시해서
// 오프라인에서도 화면이 뜨게 한다. API·업로드·인증은 항상 네트워크 우선(캐시 안 함).
const CACHE = 'ai-closet-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // 외부 CDN(폰트 등)은 건드리지 않음

  // 동적 데이터는 캐시하지 않는다 (항상 최신 + 인증 깨짐 방지)
  if (/^\/(api|analyze-outfit|auth|logout|uploads)/.test(url.pathname)) return

  // 정적 자원: 네트워크 우선 + 실패 시 캐시 폴백
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
        return res
      })
      .catch(() => caches.match(req))
  )
})
