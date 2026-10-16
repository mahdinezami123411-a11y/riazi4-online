import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const scripts = [];
let cursor = 0;
const lowerHtml = html.toLowerCase();
while (true) {
  const open = lowerHtml.indexOf('<script', cursor);
  if (open < 0) break;
  const tagEnd = lowerHtml.indexOf('>', open);
  const close = lowerHtml.indexOf('</script>', tagEnd + 1);
  if (tagEnd < 0 || close < 0) break;
  const attrs = html.slice(open + 7, tagEnd);
  const body = html.slice(tagEnd + 1, close);
  if (!attrs.toLowerCase().includes('src=') && !attrs.toLowerCase().includes('application/ld+json') && body.trim()) {
    scripts.push({attrs, body});
  }
  cursor = close + 9;
}
let compiled = 0;
for (let i = 0; i < scripts.length; i++) {
  const attrs = scripts[i].attrs || '';
  const body = (scripts[i].body || '').trim();
  if (attrs.toLowerCase().includes('src=') || !body) continue;
  const type = (attrs.toLowerCase().includes('type="module"') || attrs.toLowerCase().includes("type='module'")) ? 'module' : '';
  if (type && !/javascript|ecmascript|module/i.test(type)) continue;
  new vm.Script(body, { filename: `index.html:inline-script-${i + 1}` });
  compiled++;
}
assert.ok(compiled >= 1, 'هیچ اسکریپت جاوااسکریپتی در index.html پیدا نشد');
assert.match(html, /value="blank_mc"/, 'نوع جای‌خالی در فرم معلم ثبت نشده است');
assert.match(html, /value="matching"/, 'نوع جورکردنی در فرم معلم ثبت نشده است');
assert.match(html, /question_type.*matching|matching.*question_type/s, 'پشتیبانی جورکردنی در برنامه پیدا نشد');

// Readiness guard: the service-worker cache and its registration query must move together.
const serviceWorker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
const cacheVersion = serviceWorker.match(/const\\s+CACHE_NAME\\s*=\\s*['"]riazi4-pwa-shell-v(\\d+)['"]/);
const registrationVersion = html.match(/serviceWorker\\.register\\(['"]\\.\\/sw\\.js\\?v=20261016-v(\\d+)['"]/);
assert.ok(cacheVersion, 'نام نسخهٔ کش در sw.js پیدا نشد');
assert.ok(registrationVersion, 'نشانی سرویس‌ورکر در index.html پیدا نشد');
assert.equal(registrationVersion[1], cacheVersion[1], 'نسخهٔ ثبت سرویس‌ورکر و نام کش با هم هماهنگ نیستند');
assert.equal(manifest.lang, 'fa', 'زبان برنامه در manifest باید فارسی باشد');
assert.equal(manifest.dir, 'rtl', 'جهت برنامه در manifest باید راست‌به‌چپ باشد');
assert.ok(manifest.start_url && manifest.start_url.startsWith('./'), 'نشانی شروع PWA باید نسبی باشد');

// Every asset explicitly precached by the service worker must exist in the repository.
const shellMatch = serviceWorker.match(/const\\s+APP_SHELL\\s*=\\s*\\[([\\s\\S]*?)\\];/);
assert.ok(shellMatch, 'فهرست APP_SHELL در سرویس‌ورکر پیدا نشد');
const shellPaths = [...shellMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map(match => match[1]);
assert.ok(shellPaths.length > 0, 'فهرست APP_SHELL خالی است');
for (const path of shellPaths) {
  const relative = path === './' ? '../index.html' : '../' + path.replace(/^\\.\\//, '');
  try {
    await access(new URL(relative, import.meta.url));
  } catch {
    assert.fail('فایل موجود در APP_SHELL در مخزن وجود ندارد: ' + path);
  }
}

// Only verified files may be treated as bundled PDFs; absent textbook files use the upload/fallback UI.
const bundledAssetsMatch = html.match(/const\\s+BUNDLED_BOOK_ASSETS\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\)/);
assert.ok(bundledAssetsMatch, 'فهرست فایل‌های PDF همراه برنامه پیدا نشد');
for (const match of bundledAssetsMatch[1].matchAll(/['"]([^'"]+)['"]/g)) {
  const relative = '../' + match[1].replace(/^\\.\\//, '');
  try {
    await access(new URL(relative, import.meta.url));
  } catch {
    assert.fail('فایل PDF معرفی‌شده به‌عنوان همراه برنامه وجود ندارد: ' + match[1]);
  }
}
assert.match(html, /BUNDLED_PERSIAN_PAGE_IMAGES\\s*=\\s*false/, 'نباید تصاویر صفحه‌های کتابِ منتشرنشده درخواست شوند');
console.log(`Static syntax and deployment checks passed: ${compiled} inline script(s), ${shellPaths.length} precached assets, service-worker version ${cacheVersion[1]}.`);
