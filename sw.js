const CACHE_NAME = 'riazi4-pwa-shell-v121';
const OFFLINE_JS_VERSION = '20261111-offline-v121';
const APP_SHELL = [
  './',
  './index.html',
  './offline.js?v=' + OFFLINE_JS_VERSION,
  './manifest.webmanifest',
  './icons/app-icon-2.png',
  './assets/persian-vocabulary.json.gz.b64',
  './assets/source-question-banks.json.gz.b64'
];
const INDEX_URL = new URL('./index.html', self.registration.scope).href;

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
      .then(keys => Promise.all([
        ...keys.filter(key => key.startsWith('riazi4-pwa-shell-') && key !== CACHE_NAME).map(key => caches.delete(key)),
        caches.delete('fourami-book-pages-v1')
      ]))
      .then(() => self.clients.claim())
  );
});

async function cachedShell() {
  return (await caches.match(INDEX_URL)) || (await caches.match('./index.html')) || (await caches.match('./')) || null;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Never intercept external requests, including Supabase authentication/data APIs.
  if (url.origin !== self.location.origin) return;

  // Textbook page images, page maps, and book PDFs are deliberately online-only.
  const isTextbookAsset =
    url.pathname.includes('/assets/book-pages/') ||
    url.pathname.endsWith('/assets/math-fourth.pdf') ||
    url.pathname.endsWith('/assets/books/persian-pages.pdf');
  if (isTextbookAsset) {
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(() => Response.error()));
    return;
  }

  // Always serve the exact current offline.js build, even when the HTML still
  // references an older query string.
  if (url.pathname.endsWith('/offline.js')) {
    event.respondWith((async () => {
      const latestUrl = new URL('./offline.js?v=' + OFFLINE_JS_VERSION, self.registration.scope).href;
      try {
        const cache = await caches.open(CACHE_NAME);
        const saved = await cache.match(latestUrl);
        if (saved) return saved;
        const response = await fetch(latestUrl);
        if (response && response.ok) await cache.put(latestUrl, response.clone());
        return response;
      } catch (error) {
        try {
          const fallback = await caches.match(request, { ignoreSearch: true });
          if (fallback) return fallback;
        } catch {}
        return Response.error();
      }
    })());
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        // A temporary host error must not replace a usable local shell.
        if (response && [502, 503, 504].includes(response.status)) {
          const shell = await cachedShell();
          if (shell) return shell;
        }
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(INDEX_URL, copy)).catch(() => {});
        }
        return response;
      } catch (error) {
        // Root/start_url and any navigation variant fall back to the single
        // canonical HTML cache key, never to an older install-only copy.
        return (await cachedShell()) || (await caches.match(request)) || Response.error();
      }
    })());
    return;
  }

  const isOfflineAsset =
    request.destination === 'image' ||
    request.destination === 'audio' ||
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
        const saved = await offlineCache.match(request, { ignoreSearch: true });
        if (saved) return saved;
      } catch {}

      // Migrate any page/image previously saved in the older app-shell cache.
      try {
        const legacySaved = await caches.match(request, { ignoreSearch: true });
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
        if (response && [502, 503, 504].includes(response.status)) {
          const fallback = await offlineCache.match(request, { ignoreSearch: true }) || await caches.match(request, { ignoreSearch: true });
          if (fallback) return fallback;
        }
        return response;
      } catch (error) {
        try {
          const fallback = await offlineCache.match(request, { ignoreSearch: true }) || await caches.match(request, { ignoreSearch: true });
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
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
      }
      return response;
    }))
  );
});
