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
const SUBJECTS = ['math', 'persian', 'science', 'social', 'gifts', 'quran'];
const browser = await chromium.launch({ headless: true });
const swSource = await readFile(join(process.env.GITHUB_WORKSPACE, 'sw.js'), 'utf8');
const offlineSource = await readFile(join(process.env.GITHUB_WORKSPACE, 'offline.js'), 'utf8');
assert.match(swSource, /const isTextbookAsset =([\s\S]*?)if \(isTextbookAsset\)[\s\S]*?fetch\(request, \{ cache: 'no-store' \}\)/);
assert.match(swSource, /caches\.delete\('fourami-book-pages-v1'\)/);
assert.doesNotMatch(offlineSource, /preloadOfflineBookAssets|setupFouramiOfflineBookImageCache|fourami-book-pages-v1/);

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

async function loadImage(page, src) {
  return page.evaluate(src => new Promise(resolve => {
    const image = document.createElement('img');
    image.alt = 'textbook online-only check';
    image.style.cssText = 'position:fixed;width:20px;height:20px;opacity:0.01;left:0;top:0;z-index:999999;';
    let settled = false;
    const finish = loaded => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      image.remove();
      resolve({ loaded, width: image.naturalWidth || 0 });
    };
    const timer = setTimeout(() => finish(false), 9000);
    image.onload = () => finish(image.naturalWidth > 0);
    image.onerror = () => finish(false);
    document.body.appendChild(image);
    image.src = src;
  }), src);
}

async function getBookCacheEntries(page) {
  return page.evaluate(async () => {
    const matches = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        const url = new URL(request.url);
        if (url.pathname.includes('/assets/book-pages/') ||
            url.pathname.endsWith('/assets/math-fourth.pdf') ||
            url.pathname.endsWith('/assets/books/persian-pages.pdf')) {
          matches.push({ cache: name, path: url.pathname });
        }
      }
    }
    return matches;
  });
}

try {
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await context.newPage();
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__fouramiOfflineMode?.queueMathAttempt), { timeout: 15000 });
  await page.waitForSelector('#fouramiOfflineLoginPanel', { state: 'attached', timeout: 15000 });

  // Check 1: PIN-based offline login remains, and explains the intentionally unavailable textbook files.
  const loginText = await page.locator('#fouramiOfflineLoginPanel').evaluate(element => element.textContent || '');
  assert.match(loginText, /تصاویر و فایل‌های کتاب در دسترس نیستند/);
  assert.match(loginText, /آموزش‌ها، تمرین‌ها و آزمون‌ها (?:همچنان فعال‌اند|فعال می‌مانند)/);
  assert.ok(await page.locator('#fouramiOfflineUsernameInput').count(), 'Offline username field should remain available');
  assert.ok(await page.locator('#fouramiOfflinePinLogin').count(), 'Offline PIN field should remain available');
  assert.ok(await page.locator('#fouramiOfflineLoginButton').count(), 'Offline login button should remain available');
  assert.ok(await page.locator('#studentAppNav [data-app-view="practice"]').count(), 'Practice navigation should remain available');
  assert.ok(await page.locator('#studentAppNav [data-app-view="exam"]').count(), 'Exam navigation should remain available');

  // Check 2: lesson navigation scrolls the section-selector bar to the top, not the whole document to y=0.
  const navScroll = await page.evaluate(async () => {
    const student = document.getElementById('student');
    const nav = document.getElementById('studentAppNav');
    if (!student || !nav || typeof window.yareScrollToSectionNav !== 'function') {
      throw new Error('Student section navigation scroll helper is missing.');
    }
    student.classList.remove('hidden');
    nav.classList.remove('hidden');
    window.scrollTo(0, document.documentElement.scrollHeight);
    window.yareScrollToSectionNav();
    await new Promise(resolve => setTimeout(resolve, 700));
    return { navTop: nav.getBoundingClientRect().top, scrollY: window.scrollY };
  });
  assert.ok(Math.abs(navScroll.navTop) < 6, 'Section navigation bar should be at the top of the viewport');
  assert.ok(navScroll.scrollY > 0, 'Navigation should not reset the entire page to y=0');

  // Check 3: textbook images still load online, but no book page/PDF is written to browser caches.
  const pageUrls = {};
  for (const subject of SUBJECTS) {
    const path = await firstPageUrl(page, subject);
    pageUrls[subject] = path;
    const result = await loadImage(page, path + '?online-only-check=' + subject);
    assert.equal(result.loaded, true, subject + ': textbook image should load while online');
  }

  // Allow any service-worker/cache work to settle before inspecting Cache Storage.
  await page.waitForTimeout(300);
  const cachedBookEntries = await getBookCacheEntries(page);
  assert.deepEqual(cachedBookEntries, [], 'Textbook pages/maps/PDFs must not be stored in browser Cache Storage');
  assert.ok(!(await page.evaluate(() => caches.keys())).includes('fourami-book-pages-v1'),
    'Legacy textbook cache should be removed by the updated Service Worker');

  // After turning the connection off, images should fail instead of silently replaying an old cached copy.
  await context.setOffline(true);
  for (const subject of SUBJECTS) {
    const result = await loadImage(page, pageUrls[subject] + '?offline-only-check=' + subject);
    assert.equal(result.loaded, false, subject + ': textbook image should not be available offline');
  }
  assert.deepEqual(await getBookCacheEntries(page), [], 'Book files unexpectedly appeared in Cache Storage after offline checks');

  await context.close();
  console.log('Offline behavior checks passed: PIN login retained, warning shown, practice/exams retained, section-nav scroll verified, and book page/PDF caching disabled.');
} finally {
  await browser.close();
}
