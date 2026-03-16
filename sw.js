// PredictAI360 Service Worker v1.0
// Caches core assets for offline use, serves fresh data when online

const CACHE_NAME = 'predictai360-v1';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes for API data

// Core assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'
];

// API domains — network-first, fallback to cache
const API_DOMAINS = [
  'alphavantage.co',
  'newsapi.org',
  'allorigins.win',
  'corsproxy.io'
];

// Image domains — cache-first (images don't change)
const IMAGE_DOMAINS = [
  'images.pexels.com',
  'fonts.gstatic.com'
];

// ── INSTALL: cache all static assets ──
self.addEventListener('install', function(e) {
  console.log('[SW] Installing PredictAI360 v1...');
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS).catch(function(err) {
        console.warn('[SW] Some assets failed to cache:', err);
      });
    }).then(function() {
      console.log('[SW] Installed. Skipping waiting...');
      return self.skipWaiting();
    })
  );
});

// ── ACTIVATE: clean old caches ──
self.addEventListener('activate', function(e) {
  console.log('[SW] Activating...');
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) {
              console.log('[SW] Deleting old cache:', key);
              return caches.delete(key);
            })
      );
    }).then(function() {
      console.log('[SW] Activated. Claiming clients...');
      return self.clients.claim();
    })
  );
});

// ── FETCH: smart routing strategy ──
self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);

  // Skip non-GET and chrome-extension requests
  if (e.request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // API calls — network first, no cache fallback (data must be fresh)
  if (API_DOMAINS.some(function(d) { return url.hostname.includes(d); })) {
    e.respondWith(
      fetch(e.request).catch(function() {
        // Offline: return empty JSON so app falls back to static data
        return new Response(JSON.stringify({ status: 'offline' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Images — cache first, fetch if not cached
  if (IMAGE_DOMAINS.some(function(d) { return url.hostname.includes(d); })) {
    e.respondWith(
      caches.match(e.request).then(function(cached) {
        if (cached) return cached;
        return fetch(e.request).then(function(response) {
          if (response.ok) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(e.request, clone);
            });
          }
          return response;
        }).catch(function() {
          // Image failed offline — return transparent 1px placeholder
          return new Response(
            '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>',
            { headers: { 'Content-Type': 'image/svg+xml' } }
          );
        });
      })
    );
    return;
  }

  // Everything else (HTML, JS, CSS, fonts) — stale-while-revalidate
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      var fetchPromise = fetch(e.request).then(function(response) {
        if (response.ok) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(e.request, clone);
          });
        }
        return response;
      }).catch(function() {
        // Fully offline — return cached version if available
        return cached || new Response('Offline — please reconnect', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' }
        });
      });

      // Return cached immediately, update in background
      return cached || fetchPromise;
    })
  );
});

// ── BACKGROUND SYNC: refresh prices when back online ──
self.addEventListener('sync', function(e) {
  if (e.tag === 'refresh-prices') {
    console.log('[SW] Background sync: refreshing prices');
  }
});

// ── PUSH NOTIFICATIONS: price alerts ──
self.addEventListener('push', function(e) {
  if (!e.data) return;
  var data = e.data.json();
  e.waitUntil(
    self.registration.showNotification(data.title || 'PredictAI360 Alert', {
      body: data.body || 'Price alert triggered',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'price-alert',
      requireInteraction: false,
      actions: [
        { action: 'view', title: 'View Dashboard' },
        { action: 'dismiss', title: 'Dismiss' }
      ]
    })
  );
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  if (e.action === 'view' || !e.action) {
    e.waitUntil(
      clients.openWindow('https://predictai360.com')
    );
  }
});

console.log('[SW] Service worker loaded — PredictAI360 v1');
