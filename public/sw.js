/**
 * SoundPay Service Worker
 * 
 * Strategy: Cache-First for all app assets, Network-First for API calls.
 * This ensures the app works 100% offline after the first visit.
 */

const CACHE_NAME = 'soundpay-v4';
const OFFLINE_URL = '/~offline';

// All critical assets to pre-cache on install
const PRECACHE_ASSETS = [
  '/',
  '/pay',
  '/receive',
  '/ledger',
  '/~offline',
  '/manifest.json',
  '/ggwave/ggwave.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ── Install: pre-cache all assets ────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching assets...');
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => {
      console.log('[SW] Pre-cache complete');
      return self.skipWaiting(); // Activate immediately
    })
  );
});

// ── Activate: clean up old caches ────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      )
    ).then(() => self.clients.claim()) // Take control of all open tabs
  );
});

// ── Fetch: Cache-First strategy ──────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, chrome-extension, and Vercel internal requests
  if (
    request.method !== 'GET' ||
    url.protocol === 'chrome-extension:' ||
    url.hostname.includes('vercel-scripts') ||
    url.pathname.startsWith('/_vercel')
  ) {
    return;
  }

  // For navigation requests (HTML pages) — Network first, fall back to cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache the fresh page
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
          return response;
        })
        .catch(() =>
          // Offline: try cache, then fall back to offline page
          caches.match(request).then(
            (cached) => cached || caches.match(OFFLINE_URL)
          )
        )
    );
    return;
  }

  // For all other assets (JS, CSS, images, WASM) — Cache first, network fallback
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        // Serve from cache immediately, update cache in background
        const networkUpdate = fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
            }
            return response;
          })
          .catch(() => {});
        return cached;
      }

      // Not in cache — fetch from network and cache it
      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const cloned = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
        return response;
      }).catch(() => {
        // Return offline page as last resort for navigation
        if (request.destination === 'document') {
          return caches.match(OFFLINE_URL);
        }
      });
    })
  );
});
