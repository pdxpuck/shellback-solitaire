// Shellback Solitaire service worker — deliberately minimal.
// Scope is the deployment base path (registered via BASE_URL in main.tsx), so
// it only ever controls this app's pages — sibling GitHub Pages sites untouched.
// Strategies:
//   /assets/  — content-hashed + immutable → cache-first, safe to keep forever
//   /cards/   — static card art → cache-first (bump VERSION to refresh)
//   navigations — network-first; on success REPLACE the cached page, on
//                 network failure fall back to it (offline = last seen page)
//   everything else — passthrough (no respondWith, browser default)
const VERSION = 'v1'
const ASSET_CACHE = `shellback-assets-${VERSION}`
const PAGE_CACHE = `shellback-pages-${VERSION}`
// Path portion of the registration scope — keeps cache routing base-safe.
const BASE = new URL(self.registration.scope).pathname

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // Drop same-prefix caches left over from any OTHER version, then take
  // control of open pages immediately (no waiting for the next reload).
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('shellback-') && key !== ASSET_CACHE && key !== PAGE_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return // cross-origin: passthrough

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(
        (response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(PAGE_CACHE).then((cache) => cache.put(event.request, copy))
          }
          return response
        },
        () => caches.match(event.request),
      ),
    )
    return
  }

  if (url.pathname.startsWith(`${BASE}assets/`) || url.pathname.startsWith(`${BASE}cards/`)) {
    event.respondWith(
      caches.match(event.request).then(
        (hit) =>
          hit ??
          fetch(event.request).then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(ASSET_CACHE).then((cache) => cache.put(event.request, copy))
            }
            return response
          }),
      ),
    )
  }
  // anything else: no respondWith → plain browser fetch
})
