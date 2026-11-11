import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
let chromium;
try {
  ({ chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright'));
} catch {
  ({ chromium } = await import(process.env.RUNNER_TEMP + '/quiz-test/node_modules/playwright/index.mjs'));
}

const BASE_URL = 'http://127.0.0.1:8765/index.html';
const swSource = await readFile(join(process.env.GITHUB_WORKSPACE, 'sw.js'), 'utf8');
const cacheMatch = swSource.match(/const CACHE_NAME = '([^']+)'/);
assert.ok(cacheMatch, 'Service worker must declare a cache name');
const CACHE_NAME = cacheMatch[1];
assert.match(swSource, /keys\.filter\(key => key\.startsWith\('riazi4-pwa-shell-'\) && key !== CACHE_NAME\)/);
assert.match(swSource, /clients\.claim\(\)/);
assert.match(swSource, /response && \[502, 503, 504\]\.includes\(response\.status\)/);

const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}),
});
try {
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__fouramiOfflineMode?.queueMathAttempt), { timeout: 20000 });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), { timeout: 20000 });

  // A real controller, not just a registration, is the precondition the old
  // blocked-worker suite never exercised.
  const controller = await page.evaluate(() => ({
    controlled: Boolean(navigator.serviceWorker.controller),
    scriptURL: navigator.serviceWorker.controller?.scriptURL || '',
    state: navigator.serviceWorker.controller?.state || '',
  }));
  assert.equal(controller.controlled, true, 'Page must be controlled by the service worker');
  assert.match(controller.scriptURL, /\/sw\.js/);
  assert.equal(controller.state, 'activated');

  const initialCache = await page.evaluate(async name => {
    const names = await caches.keys();
    const cache = await caches.open(name);
    const keys = await cache.keys();
    return {
      names,
      hasCurrent: names.includes(name),
      paths: keys.map(request => new URL(request.url).pathname),
    };
  }, CACHE_NAME);
  assert.equal(initialCache.hasCurrent, true, 'Current app-shell cache must exist');
  for (const required of ['/index.html', '/offline.js', '/manifest.webmanifest']) {
    assert.ok(initialCache.paths.some(path => path.endsWith(required)), 'App shell must cache ' + required);
  }

  // Seed a stale shell and force an update registration. The activate handler
  // must remove every old riazi4 shell cache and claim the page.
  await page.evaluate(async () => {
    const cache = await caches.open('riazi4-pwa-shell-v120');
    await cache.put(new Request(location.origin + '/index.html'), new Response('STALE-SHELL-MARKER', {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }));
  });
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('./sw.js?audit-sw-update=1', { scope: './', updateViaCache: 'none' });
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(async () => !(await caches.keys()).includes('riazi4-pwa-shell-v120'), null, { timeout: 20000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), { timeout: 20000 });
  const staleGone = await page.evaluate(async () => ({
    names: await caches.keys(),
    body: document.body?.textContent || '',
  }));
  assert.equal(staleGone.names.includes('riazi4-pwa-shell-v120'), false, 'Old app-shell cache must be deleted on activation');
  assert.equal(staleGone.body.includes('STALE-SHELL-MARKER'), false, 'Reload must not serve the stale shell');

  // Offline reload must use the canonical cached index.html and still expose
  // the offline queue API. This is the path the blocked-worker suite missed.
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#fouramiUnifiedStudentLogin', { state: 'attached', timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.__fouramiOfflineMode?.queueMathAttempt), { timeout: 20000 });
  const offlineState = await page.evaluate(() => ({
    controlled: Boolean(navigator.serviceWorker.controller),
    online: navigator.onLine,
    hasLogin: Boolean(document.querySelector('#fouramiUnifiedStudentLogin')),
  }));
  assert.equal(offlineState.controlled, true, 'Offline reload must still be controlled by the service worker');
  assert.equal(offlineState.online, false);
  assert.equal(offlineState.hasLogin, true, 'Offline reload must render the cached app shell');
  await context.setOffline(false);

  assert.deepEqual(pageErrors, [], 'Page must not throw during service-worker lifecycle');
  await context.close();
  console.log('PWA service-worker checks passed: controller active, canonical shell cached, stale shell removed, offline reload served by worker.');
} finally {
  await browser.close();
}
