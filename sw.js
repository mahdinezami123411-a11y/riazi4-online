const CACHE_NAME = 'riazi4-pwa-shell-v108';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/app-icon-2.png',
  './assets/persian-vocabulary.json.gz.b64',
  './assets/source-question-banks.json.gz.b64'
];

const INSTALL_PROMPT_MARKUP = [
  "<style id=\"chahromiha-install-style\">",
  "#chahromiha-install-overlay{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(4,8,25,.82);backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px);font-family:system-ui,sans-serif;direction:rtl;box-sizing:border-box}",
  "#chahromiha-install-overlay[hidden]{display:none!important}",
  "#chahromiha-install-overlay *{box-sizing:border-box}",
  "#chahromiha-install-card{width:min(100%,420px);padding:26px 22px 20px;border:1px solid rgba(167,139,250,.45);border-radius:25px;background:radial-gradient(circle at 85% 0%,rgba(99,102,241,.28),transparent 42%),linear-gradient(145deg,#111a38,#17112f);color:#f8fafc;text-align:center;box-shadow:0 24px 80px rgba(0,0,0,.48)}",
  "#chahromiha-install-rocket{font-size:48px;line-height:1.2;margin-bottom:12px}",
  "#chahromiha-install-card h2{font-size:22px;line-height:1.6;margin:0 0 8px;font-weight:800}",
  "#chahromiha-install-card p{font-size:14px;line-height:2;margin:0 0 16px;color:#dbeafe}",
  "#chahromiha-install-help{padding:11px 12px;margin:0 0 14px;border-radius:13px;background:rgba(15,23,42,.72);color:#fef3c7!important;text-align:right}",
  "#chahromiha-install-actions{display:flex;flex-direction:column;gap:10px}",
  "#chahromiha-install-actions button{width:100%;min-height:48px;border:0;border-radius:14px;font:inherit;font-size:15px;font-weight:800;cursor:pointer}",
  "#chahromiha-install-action{background:linear-gradient(100deg,#818cf8,#c084fc);color:#111827}",
  "#chahromiha-install-later{background:rgba(148,163,184,.13);color:#e2e8f0;border:1px solid rgba(203,213,225,.24)!important}",
  "</style>",
  "<div id=\"chahromiha-install-overlay\" hidden role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"chahromiha-install-title\" dir=\"rtl\">",
  "  <section id=\"chahromiha-install-card\">",
  "    <div id=\"chahromiha-install-rocket\" aria-hidden=\"true\">🚀</div>",
  "    <h2 id=\"chahromiha-install-title\">برنامهٔ چهارمی‌ها را نصب کن</h2>",
  "    <p>برای دسترسی سریع‌تر و تجربهٔ بهتر، برنامه را به صفحهٔ اصلی گوشی اضافه کن.</p>",
  "    <p id=\"chahromiha-install-help\" hidden></p>",
  "    <div id=\"chahromiha-install-actions\">",
  "      <button id=\"chahromiha-install-action\" type=\"button\">نصب برنامه</button>",
  "      <button id=\"chahromiha-install-later\" type=\"button\">فعلاً نه</button>",
  "    </div>",
  "  </section>",
  "</div>",
  "<script>(function(){",
  "  const key = 'chahromiha_install_prompt_seen_v1';",
  "  const overlay = document.getElementById('chahromiha-install-overlay');",
  "  const action = document.getElementById('chahromiha-install-action');",
  "  const later = document.getElementById('chahromiha-install-later');",
  "  const help = document.getElementById('chahromiha-install-help');",
  "  if (!overlay || !action || !later || !help) return;",
  "  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.matchMedia('(max-width: 900px)').matches);",
  "  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;",
  "  if (!mobile || standalone) { if (standalone) { try { localStorage.setItem(key, '1'); } catch (_) {} } return; }",
  "  let installEvent = null;",
  "  let helpMode = false;",
  "  let wasSeen = false;",
  "  try { wasSeen = localStorage.getItem(key) === '1'; } catch (_) {}",
  "  function closePrompt(markSeen) {",
  "    overlay.hidden = true;",
  "    if (markSeen) { try { localStorage.setItem(key, '1'); } catch (_) {} }",
  "  }",
  "  function showHelp() {",
  "    helpMode = true;",
  "    help.hidden = false;",
  "    help.textContent = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'دکمهٔ اشتراک‌گذاری مرورگر را بزن و گزینهٔ «افزودن به صفحهٔ اصلی» (Add to Home Screen) را انتخاب کن.' : 'منوی مرورگر (⋮) را باز کن و گزینهٔ «نصب برنامه» یا «افزودن به صفحهٔ اصلی» را انتخاب کن.';",
  "    action.textContent = 'متوجه شدم';",
  "  }",
  "  window.addEventListener('beforeinstallprompt', function(event) {",
  "    event.preventDefault();",
  "    installEvent = event;",
  "    helpMode = false;",
  "    help.hidden = true;",
  "    action.textContent = 'نصب برنامه';",
  "  });",
  "  window.addEventListener('appinstalled', function() { closePrompt(true); });",
  "  action.addEventListener('click', async function() {",
  "    if (helpMode) { closePrompt(true); return; }",
  "    if (!installEvent) { showHelp(); return; }",
  "    const promptEvent = installEvent;",
  "    installEvent = null;",
  "    try { await promptEvent.prompt(); await promptEvent.userChoice; closePrompt(true); }",
  "    catch (_) { showHelp(); }",
  "  });",
  "  later.addEventListener('click', function() { closePrompt(true); });",
  "  if (!wasSeen) window.setTimeout(function() { if (document.visibilityState === 'visible') overlay.hidden = false; }, 650);",
  "})();</script>"
].join('');

async function withInstallPrompt(response, request) {
  if (!response) return response;
  const url = new URL(request.url);
  if (url.searchParams.get('source') === 'pwa') return response;
  const userAgent = request.headers.get('user-agent') || '';
  if (!/Android|iPhone|iPod|Mobile/i.test(userAgent) && request.headers.get('sec-ch-ua-mobile') !== '?1') return response;
  if (!/text\/html/i.test(response.headers.get('content-type') || '')) return response;

  const html = await response.clone().text();
  if (html.includes('id="chahromiha-install-overlay"')) return response;
  const updatedHtml = /<\/body\s*>/i.test(html)
    ? html.replace(/<\/body\s*>/i, INSTALL_PROMPT_MARKUP + '</body>')
    : html + INSTALL_PROMPT_MARKUP;
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.delete('etag');
  return new Response(updatedHtml, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

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

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
          }
          return withInstallPrompt(response, request);
        })
        .catch(async () => {
          const cached = (await caches.match(request)) || (await caches.match('./index.html'));
          return withInstallPrompt(cached || Response.error(), request);
        })
    );
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
