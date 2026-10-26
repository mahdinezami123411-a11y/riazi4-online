import assert from 'node:assert/strict';

let chromium;
try {
  ({ chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright'));
} catch {
  ({ chromium } = await import(process.env.RUNNER_TEMP + '/quiz-test/node_modules/playwright/index.mjs'));
}

const BASE_URL = 'http://127.0.0.1:8765/index.html';
const SUBJECTS = ['math', 'persian', 'science', 'social', 'gifts', 'quran'];
const browser = await chromium.launch({ headless: true });

async function createOfflineAwareContext(serviceWorkers) {
  const context = await browser.newContext({ serviceWorkers });
  await context.addInitScript(() => {
    let testOnline = false;
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => testOnline
    });
    window.__setTestOnline = value => { testOnline = Boolean(value); };
  });
  return context;
}

async function waitForImage(page, src, expectBlob = false) {
  return page.evaluate(({ src, expectBlob }) => new Promise(resolve => {
    const image = document.createElement('img');
    image.alt = 'offline image cache test';
    image.style.cssText = 'position:fixed;width:20px;height:20px;opacity:0.01;left:0;top:0;z-index:999999;';
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      resolve(result);
    };
    const timer = setTimeout(() => finish({
      loaded: false,
      width: image.naturalWidth || 0,
      src: image.currentSrc || image.src
    }), 9000);
    image.onload = () => finish({
      loaded: image.naturalWidth > 0,
      width: image.naturalWidth,
      src: image.currentSrc || image.src
    });
    image.onerror = () => {
      // In the offline-fallback test, the first network error is expected.
      // The document-level recovery handler should replace src with a blob URL.
      if (!expectBlob) finish({ loaded: false, width: 0, src: image.currentSrc || image.src });
    };
    document.body.appendChild(image);
    image.src = src;
  }), { src, expectBlob });
}

async function firstPageUrl(page, subject) {
  return page.evaluate(async subject => {
    const response = await fetch('./assets/book-pages/' + subject + '/page-map.json');
    if (!response.ok) throw new Error('Could not read the page map for ' + subject + ': HTTP ' + response.status);
    const manifest = await response.json();
    const lessons = manifest.lessons && typeof manifest.lessons === 'object'
      ? Object.values(manifest.lessons)
      : Object.values(manifest).filter(item => item && Number.isInteger(Number(item.printedStart)) && Number.isInteger(Number(item.printedEnd)));
    if (!lessons.length) throw new Error('No lesson page ranges found for ' + subject);
    const firstPage = Number(lessons[0].printedStart);
    if (!Number.isInteger(firstPage) || firstPage < 1) throw new Error('Invalid first page for ' + subject);
    return './assets/book-pages/' + subject + '/page-' + String(firstPage).padStart(3, '0') + '.webp';
  }, subject);
}

try {
  // Check 1: displayed pages are cached by the app even when a Service Worker
  // does not control the current document (the common first-visit case).
  const fallbackContext = await createOfflineAwareContext('block');
  const fallbackPage = await fallbackContext.newPage();
  await fallbackPage.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await fallbackPage.waitForFunction(() => window.__setTestOnline && window.__fouramiOfflineBookImageCacheReady, { timeout: 12000 });
  await fallbackPage.evaluate(() => window.__setTestOnline(true));

  const pageUrls = {};
  for (const subject of SUBJECTS) {
    const path = await firstPageUrl(fallbackPage, subject);
    pageUrls[subject] = path;
    const onlineLoad = await waitForImage(fallbackPage, path + '?online-image-cache=' + subject);
    assert.equal(onlineLoad.loaded, true, subject + ': textbook page should load while online');

    const cached = await fallbackPage.waitForFunction(async path => {
      const cache = await caches.open('fourami-book-pages-v1');
      return Boolean(await cache.match(new URL(path, document.baseURI).href, { ignoreSearch: true }));
    }, path, { timeout: 12000 }).catch(() => null);
    assert.ok(cached, subject + ': displayed page was not stored in the offline cache');
  }

  await fallbackContext.setOffline(true);
  for (const subject of SUBJECTS) {
    const offlineLoad = await waitForImage(fallbackPage, pageUrls[subject] + '?offline-image-recovery=' + subject, true);
    assert.equal(offlineLoad.loaded, true, subject + ': cached page must recover when network image loading fails');
    assert.ok(offlineLoad.src.startsWith('blob:'), subject + ': offline fallback should render from the cached image blob');
  }
  await fallbackContext.close();

  // Check 2: the Service Worker also serves a cached page when the URL query
  // changes, and does not require a network connection on the second request.
  const swContext = await createOfflineAwareContext('allow');
  const swPage = await swContext.newPage();
  await swPage.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await swPage.evaluate(async () => { await navigator.serviceWorker.ready; });
  if (!(await swPage.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await swPage.reload({ waitUntil: 'domcontentloaded' });
  }
  await swPage.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), { timeout: 15000 });
  await swPage.evaluate(() => window.__setTestOnline(true));
  const swPath = pageUrls.math || await firstPageUrl(swPage, 'math');
  const first = await waitForImage(swPage, swPath + '?sw-cache-seed=1');
  assert.equal(first.loaded, true, 'Service Worker seed image should load online');
  const swCached = await swPage.waitForFunction(async path => {
    const cache = await caches.open('fourami-book-pages-v1');
    return Boolean(await cache.match(new URL(path, document.baseURI).href, { ignoreSearch: true }));
  }, swPath, { timeout: 12000 }).catch(() => null);
  assert.ok(swCached, 'Service Worker did not save the seed image in the dedicated cache');

  await swContext.setOffline(true);
  const replay = await waitForImage(swPage, swPath + '?sw-cache-replay=2');
  assert.equal(replay.loaded, true, 'Service Worker should display the cached image offline');
  assert.ok(!replay.src.startsWith('blob:'), 'Service Worker should serve the cached response directly, not rely on the image-error fallback');
  await swContext.close();

  // Check 3: all six page maps and the on-screen image/fallback path were
  // exercised, not just one hard-coded image URL.
  assert.equal(Object.keys(pageUrls).length, 6);
  console.log('Offline textbook image checks passed: six book caches, direct offline recovery, and Service Worker replay.');
} finally {
  await browser.close();
}
