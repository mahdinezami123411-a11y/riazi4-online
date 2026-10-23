import assert from 'node:assert/strict';

let chromium;
try {
  ({ chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright'));
} catch {
  ({ chromium } = await import(process.env.RUNNER_TEMP + '/quiz-test/node_modules/playwright/index.mjs'));
}

const browser = await chromium.launch({headless:true});
const context = await browser.newContext({serviceWorkers:'block'});
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
const subjects = [
  {id:'math',title:'ریاضی'},
  {id:'science',title:'علوم تجربی'},
  {id:'social',title:'مطالعات اجتماعی'},
  {id:'gifts',title:'هدیه‌های آسمانی'}
];

try {
  await page.goto('http://127.0.0.1:8765/index.html', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => !!window.__quizTestApi, {timeout:12000});
  for (const subject of subjects) {
    await page.evaluate(subjectId => {
      const api = window.__quizTestApi;
      api.showStudentAppView('home');
      const button = document.querySelector('#studentSubjectPicker [data-student-subject="'+subjectId+'"]');
      if (!button) throw new Error('کتاب در فهرست انتخاب کتاب پیدا نشد: '+subjectId);
      button.click();
      const lesson = document.querySelector('#otherSubjectLessonPicker [data-other-lesson]:not([disabled])');
      if (!lesson) throw new Error('درس بازی برای کتاب پیدا نشد: '+subjectId);
      lesson.click();
    }, subject.id);
    await page.waitForSelector('#lessonBookSection .book-page-thumb[data-book-gallery-open]', {state:'attached',timeout:15000});
    const item = await page.evaluate(subjectId => {
      const cards = [...document.querySelectorAll('#lessonBookSection .book-page-thumb[data-book-gallery-open]')];
      const firstImagePath = cards[0]?.querySelector('img')?.getAttribute('src')||'';
      cards[0]?.click();
      const modal = document.getElementById('persianBookGalleryModal');
      const image = modal?.querySelector('[data-gallery-image]');
      const first = image?.getAttribute('src')||'';
      modal?.querySelector('[data-gallery-next]')?.click();
      const next = image?.getAttribute('src')||'';
      const label = modal?.getAttribute('aria-label')||'';
      modal?.querySelector('[data-gallery-close]')?.click();
      return {
        count:cards.length,firstImagePath,first,next,label,
        opened:Boolean(modal&&first),
        nextWorked:Boolean(first&&next&&first!==next),
        closed:!document.getElementById('persianBookGalleryModal'),
        expectedPath:'assets/book-pages/'+subjectId+'/page-'
      };
    }, subject.id);
    assert.ok(item.count>=2, subject.id+': تصاویر صفحه‌های درس نمایش داده نشدند');
    assert.ok(item.firstImagePath.includes(item.expectedPath), subject.id+': تصویر از مسیر کتاب اشتباه بارگذاری شد');
    assert.equal(item.opened,true,subject.id+': گالری با لمس تصویر باز نشد');
    assert.ok(item.label.includes(subject.title),subject.id+': عنوان کتاب در گالری اشتباه است');
    assert.equal(item.nextWorked,true,subject.id+': رفتن به صفحهٔ بعد کار نکرد');
    assert.equal(item.closed,true,subject.id+': بستن گالری کار نکرد');
    console.log(subject.id+' gallery check passed:',JSON.stringify(item));
  }
  assert.deepEqual(pageErrors,[], 'خطای JavaScript هنگام آزمایش گالری کتاب‌ها: '+pageErrors.join(' | '));
} finally {
  await context.close();
  await browser.close();
}
