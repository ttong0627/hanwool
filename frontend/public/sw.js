/* 경안시장 집배송 — Service Worker (PWA)
 * - HTML: network-first (배포 즉시 반영, 오프라인 시 캐시 fallback)
 * - 정적 자산: stale-while-revalidate
 * - API/WS/사진/다운로드/헬스: SW가 가로채지 않음(항상 네트워크 — 인증·실시간 보호)
 */
const CACHE_NAME = 'hanwool-v1'
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
]

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // 동적/인증/실시간 경로는 SW가 손대지 않는다 (항상 네트워크)
  const passthrough = ['/api/', '/ws', '/photos/', '/downloads/', '/health']
  if (passthrough.some((p) => url.pathname.startsWith(p))) return

  // HTML 문서: network-first
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy))
          return res
        })
        .catch(() => caches.match(req).then((m) => m || caches.match('/index.html')))
    )
    return
  }

  // 그 외 정적 자산: stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy))
          return res
        })
        .catch(() => cached)
      return cached || network
    })
  )
})
