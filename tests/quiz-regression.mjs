import assert from 'node:assert/strict';
import { readFile, access, readdir } from 'node:fs/promises';
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
const registrationVersion = html.match(/serviceWorker(?:\?\.|\.)register\(['"]\.\/sw\.js\?v=202610\d+-v(\d+)['"]/);
assert.ok(cacheVersion, 'نام نسخهٔ کش در sw.js پیدا نشد');
assert.ok(registrationVersion, 'نشانی سرویس‌ورکر در index.html پیدا نشد');
assert.equal(registrationVersion[1], cacheVersion[1], 'نسخهٔ ثبت سرویس‌ورکر و نام کش با هم هماهنگ نیستند');
assert.equal(manifest.lang, 'fa', 'زبان برنامه در manifest باید فارسی باشد');
assert.equal(manifest.dir, 'rtl', 'جهت برنامه در manifest باید راست‌به‌چپ باشد');
assert.ok(manifest.start_url && manifest.start_url.startsWith('./'), 'نشانی شروع PWA باید نسبی باشد');

// Persian textbook QR audio links must remain attached to the reading/lesson page.
const persianAudioMap = html.match(/const\s+persianAudioResourcesByLesson\s*=\s*\{([\s\S]*?)\n\s*\};/);
assert.ok(persianAudioMap, 'نگاشت صوت‌های QR کتاب فارسی پیدا نشد');
const persianAudioUrls = [...persianAudioMap[1].matchAll(/url:'(https:\/\/www\.roshd\.ir\/403-[^']+)'/g)].map(match => match[1]);
assert.equal(persianAudioUrls.length, 46, 'باید هر ۴۶ مقصد QR صوتی استخراج‌شده از PDF فارسی ثبت شده باشد');
assert.equal(new Set(persianAudioUrls).size, 46, 'مقصد تکراری در فهرست صوت‌های کتاب فارسی وجود دارد');
assert.match(html, /renderPersianAudioResources\(Number\(lesson\.id\)\)/, 'صوت‌های استخراج‌شده در صفحهٔ درس فارسی درج نمی‌شوند');
assert.match(html, /target="_blank" rel="noopener noreferrer"/, 'پیوندهای صوتی باید با تنظیمات ایمن در پنجرهٔ جدید باز شوند');

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
assert.match(html, /class="book-page-gallery"/, 'گالری تصاویر صفحات فارسی ثبت نشده است');
assert.match(html, /function openPersianBookGallery\(/, 'نمایشگر تمام‌صفحهٔ صفحات کتاب پیدا نشد');
assert.match(html, /touchstart/, 'تعویض صفحه با حرکت انگشت پیاده‌سازی نشده است');
assert.match(html, /data-gallery-next/, 'دکمهٔ صفحهٔ بعد در گالری وجود ندارد');
assert.doesNotMatch(html, />\s*ویژه(?:ٔ)?\s*(?:موبایل|موبایلی|گوشی)\s*</, 'برچسب ویژهٔ گوشی نباید در صفحهٔ انتخاب فارسی نمایش داده شود');
assert.match(html, /const delta=endX-touchStartX/, 'جهت حرکت انگشت از چپ به راست برای صفحهٔ بعد درست نیست');
assert.match(html, /touchDistance\(touches\[0\],touches\[1\]\)/, 'زوم دو‌انگشتی در گالری پیاده‌سازی نشده است');
assert.match(html, /image\.dataset\.zoom=zoom\.toFixed\(2\)/, 'بزرگ‌نمایی تصویر در گالری ثبت نشده است');
assert.doesNotMatch(html, /<span class="pill">ویژهٔ گوشی<\/span>/, 'برچسب ویژهٔ گوشی باید حذف شده باشد');
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

const coursePageImagesEnabled = /BUNDLED_COURSE_PAGE_IMAGES\s*=\s*true/.test(html);
if (coursePageImagesEnabled) {
  const expectedCourseBooks = {math:{pages:134,lessons:7},science:{pages:120,lessons:13},social:{pages:111,lessons:22},gifts:{pages:121,lessons:19},quran:{pages:91,lessons:15}};
  for (const [subject, expected] of Object.entries(expectedCourseBooks)) {
    const dir = new URL('../assets/book-pages/'+subject+'/', import.meta.url);
    const manifest = JSON.parse(await readFile(new URL('page-map.json', dir), 'utf8'));
    assert.equal(manifest.subject, subject, subject+': شناسنامهٔ صفحات کتاب نادرست است');
    assert.equal(manifest.pageCount, expected.pages, subject+': تعداد تصاویر صفحات کتاب نادرست است');
    assert.equal(manifest.lessonCount, expected.lessons, subject+': تعداد درس‌های نگاشت‌شده نادرست است');
    assert.equal(Object.keys(manifest.lessons).length, expected.lessons, subject+': نگاشت تمام درس‌ها کامل نیست');
    const files = await readdir(dir);
    assert.equal(files.filter(name => /^page-\d{3}\.webp$/.test(name)).length, expected.pages, subject+': تعداد فایل‌های تصویر با نگاشت برابر نیست');
    for (const range of Object.values(manifest.lessons)) {
      for (let page = range.printedStart; page <= range.printedEnd; page++) {
        await access(new URL('page-'+String(page).padStart(3,'0')+'.webp', dir));
      }
    }
  }
} else {
  assert.match(html, /BUNDLED_COURSE_PAGE_IMAGES\s*=\s*false/, 'تصاویر کتاب‌های جدید نباید پیش از نصب بسته فعال شوند');
}

assert.match(html, /function renderMathQuestionVisualMarkup\(q,printMode\)/, 'رسم‌های کمکی سؤال‌های ریاضی ثبت نشده‌اند');
assert.match(html, /id="bookPracticeVisualAid"/, 'جای نمایش شکل در تمرین وجود ندارد');
assert.match(html, /id="examQuestionVisualAid"/, 'جای نمایش شکل در آزمون وجود ندارد');
assert.match(html, /renderMathQuestionVisualMarkup\(q,true\)/, 'خروجی چاپی آزمون شکل کمکی را نمایش نمی‌دهد');
assert.match(html, /class="nm-arrow-op-label"/, 'عملیات ماشین در فلش بین ستون‌ها نمایش داده نمی‌شود');
assert.doesNotMatch(html, /chapterMachinePracticePanel|chapterMachinePracticeMount/, 'ماشین تعاملی نباید در بخش تمرین تکرار شود');
assert.doesNotMatch(html, /machine-ha\.html/, 'برنامه نباید به صفحه جداگانه ماشین وابسته باشد');
console.log('Static syntax and deployment checks passed: ' + compiled + ' inline script(s), ' + shellPaths.length + ' precached assets, service-worker version ' + cacheVersion[1] + '.');
