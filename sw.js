const CACHE_NAME = 'riazi4-pwa-shell-v115';;;
const APP_SHELL = [
  './',
  './index.html',
  './offline.js?v=20261026-offline-v5',
  './manifest.webmanifest',
  './icons/app-icon-2.png',
  './assets/persian-vocabulary.json.gz.b64',
  './assets/source-question-banks.json.gz.b64'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('riazi4-pwa-shell-') && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Never intercept external requests, including Supabase authentication/data APIs.
  if (url.origin !== self.location.origin) return;

  // The HTML may still reference the previous query string for offline.js.
  // Always serve the exact current version pre-cached in APP_SHELL.
  if (url.pathname.endsWith('/offline.js')) {
    event.respondWith((async () => {
      const latestUrl = new URL('./offline.js?v=20261026-offline-v5', self.registration.scope).href;
      try {
        const cache = await caches.open(CACHE_NAME);
        const saved = await cache.match(latestUrl);
        if (saved) return saved;
        const response = await fetch(latestUrl);
        if (response && response.ok) await cache.put(latestUrl, response.clone());
        return response;
      } catch (error) {
        try {
          const fallback = await caches.match(request);
          if (fallback) return fallback;
        } catch {}
        return Response.error();
      }
    })());
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match('./index.html')) || Response.error())
    );
    return;
  }

  const isOfflineAsset =
    request.destination === 'image' ||
    request.destination === 'audio' ||
    url.pathname.includes('/assets/book-pages/') ||
    url.pathname.endsWith('/assets/math-fourth.pdf') ||
    url.pathname.endsWith('/assets/books/persian-pages.pdf') ||
    url.pathname.endsWith('/assets/source-question-banks.json.gz.b64') ||
    url.pathname.endsWith('/assets/persian-vocabulary.json.gz.b64');

  if (isOfflineAsset) {
    event.respondWith((async () => {
      let offlineCache;
      try {
        offlineCache = await caches.open('fourami-book-pages-v1');
      } catch (error) {
        console.warn('Offline asset cache is unavailable; loading from network', error);
        try { return await fetch(request); } catch { return Response.error(); }
      }

      try {
        const saved = await offlineCache.match(request,{ignoreSearch:true});
        if (saved) return saved;
      } catch {}

      // Migrate any page/image previously saved in the older app-shell cache.
      try {
        const legacySaved = await caches.match(request,{ignoreSearch:true});
        if (legacySaved) {
          await offlineCache.put(request, legacySaved.clone()).catch(() => {});
          return legacySaved;
        }
      } catch {}

      try {
        const response = await fetch(request);
        if (response && response.ok && response.type === 'basic') {
          await offlineCache.put(request, response.clone()).catch(error => {
            console.warn('Could not save an offline image or book file', url.pathname, error);
          });
        }
        return response;
      } catch (error) {
        try {
          const fallback = await offlineCache.match(request,{ignoreSearch:true}) || await caches.match(request,{ignoreSearch:true});
          if (fallback) return fallback;
        } catch {}
        return Response.error();
      }
    })());
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response && response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    }))
  );
});