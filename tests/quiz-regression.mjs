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
assert.doesNotMatch(html, /<option\s+value=["']multi["']>\s*انتخاب چند پاسخ<\/option>/, 'نوع سؤال چندپاسخی نباید در پنل معلم یا فیلتر تمرین باشد');
assert.match(html, /isText=type==='input',isMatching=type==='matching',multi=false/, 'کنترل سؤال‌های قدیمی باید تک‌پاسخی نمایش داده شود');
assert.match(html, /برای هر سؤال گزینه‌ای فقط یک شمارهٔ پاسخ صحیح وارد کن/, 'ذخیرهٔ سؤال باید دقیقاً یک گزینهٔ صحیح را اجباری کند');


// Readiness guard: the service-worker cache and its registration query must move together.
const serviceWorker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
const cacheVersion = serviceWorker.match(/const\s+CACHE_NAME\s*=\s*['"]riazi4-pwa-shell-v(\d+)['"]/);
const registrationVersion = html.match(/serviceWorker\.register\(['"]\.\/sw\.js\?v=202610\d+-v(\d+)['"]/);
assert.ok(cacheVersion, 'نام نسخهٔ کش در sw.js پیدا نشد');
assert.ok(registrationVersion, 'نشانی سرویس‌ورکر در index.html پیدا نشد');
assert.equal(registrationVersion[1], cacheVersion[1], 'نسخهٔ ثبت سرویس‌ورکر و نام کش با هم هماهنگ نیستند');
assert.equal(manifest.lang, 'fa', 'زبان برنامه در manifest باید فارسی باشد');
assert.equal(manifest.dir, 'rtl', 'جهت برنامه در manifest باید راست‌به‌چپ باشد');
assert.ok(manifest.start_url && manifest.start_url.startsWith('./'), 'نشانی شروع PWA باید نسبی باشد');

// Every asset explicitly precached by the service worker must exist in the repository.
const shellMatch = serviceWorker.match(/const\s+APP_SHELL\s*=\s*\[([\s\S]*?)\];/);
assert.ok(shellMatch, 'فهرست APP_SHELL در سرویس‌ورکر پیدا نشد');
const shellPaths = [...shellMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map(match => match[1]);
assert.ok(shellPaths.length > 0, 'فهرست APP_SHELL خالی است');
for (const path of shellPaths) {
  const relative = path === './' ? '../index.html' : '../' + path.replace(/^\.\//, '');
  try {
    await access(new URL(relative, import.meta.url));
  } catch {
    assert.fail('فایل موجود در APP_SHELL در مخزن وجود ندارد: ' + path);
  }
}

// Only verified files may be treated as bundled PDFs; absent textbook files use the upload/fallback UI.
const bundledAssetsMatch = html.match(/const\s+BUNDLED_BOOK_ASSETS\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
assert.ok(bundledAssetsMatch, 'فهرست فایل‌های PDF همراه برنامه پیدا نشد');
for (const match of bundledAssetsMatch[1].matchAll(/['"]([^'"]+)['"]/g)) {
  const relative = '../' + match[1].replace(/^\.\//, '');
  try {
    await access(new URL(relative, import.meta.url));
  } catch {
    assert.fail('فایل PDF معرفی‌شده به‌عنوان همراه برنامه وجود ندارد: ' + match[1]);
  }
}
const persianPageImagesEnabled = /BUNDLED_PERSIAN_PAGE_IMAGES\s*=\s*true/.test(html);
if (persianPageImagesEnabled) {
  const pageMap = JSON.parse(await readFile(new URL('../assets/book-pages/persian/page-map.json', import.meta.url), 'utf8'));
  assert.equal(Object.keys(pageMap).length, 17, 'نگاشت صفحات باید ۱۷ درس فارسی را پوشش دهد');
  let mappedPageCount = 0;
  for (const [lessonId, range] of Object.entries(pageMap)) {
    for (let page = range.printedStart; page <= range.printedEnd; page++) {
      try {
        await access(new URL(`../assets/book-pages/persian/page-${String(page).padStart(3, '0')}.webp`, import.meta.url));
      } catch {
        assert.fail(`تصویر صفحه ${page} مربوط به درس ${lessonId} در مخزن وجود ندارد`);
      }
      mappedPageCount++;
    }
  }
  assert.equal(mappedPageCount, 85, 'تعداد صفحات نگاشت‌شدهٔ کتاب باید ۸۵ صفحه باشد');
  await access(new URL('../assets/books/persian-pages.pdf', import.meta.url));
} else {
  assert.match(html, /BUNDLED_PERSIAN_PAGE_IMAGES\s*=\s*false/, 'تا پیش از نصب بسته، تصاویر صفحات کتاب نباید درخواست شوند');
}
assert.match(html, /function renderMathQuestionVisualMarkup\(q,printMode\)/, 'رسم‌های کمکی سؤال‌های ریاضی ثبت نشده‌اند');
assert.match(html, /id="bookPracticeVisualAid"/, 'جای نمایش شکل در تمرین وجود ندارد');
assert.match(html, /id="examQuestionVisualAid"/, 'جای نمایش شکل در آزمون وجود ندارد');
assert.match(html, /renderMathQuestionVisualMarkup\(q,true\)/, 'خروجی چاپی آزمون شکل کمکی را نمایش نمی‌دهد');
assert.match(html, /class="nm-arrow-op-label"/, 'عملیات ماشین در فلش بین ستون‌ها نمایش داده نمی‌شود');
assert.doesNotMatch(html, /chapterMachinePracticePanel|chapterMachinePracticeMount/, 'ماشین تعاملی نباید در بخش تمرین تکرار شود');
assert.doesNotMatch(html, /machine-ha\.html/, 'برنامه نباید به صفحه جداگانه ماشین وابسته باشد');
console.log('Static syntax and deployment checks passed: ' + compiled + ' inline script(s), ' + shellPaths.length + ' precached assets, service-worker version ' + cacheVersion[1] + '.');
