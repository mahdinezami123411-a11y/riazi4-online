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

try {
  await page.goto('http://127.0.0.1:8765/index.html', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => !!window.__quizTestApi, {timeout:12000});
  await page.evaluate(() => {
    const api = window.__quizTestApi;
    api.showStudentAppView('home');
    document.querySelector('#studentSubjectPicker [data-student-subject="persian"]')?.click();
    const lesson = document.querySelector('#otherSubjectLessonPicker [data-other-lesson]:not([disabled])');
    if (!lesson) throw new Error('Persian lesson picker did not show an available lesson.');
    lesson.click();
  });
  await page.waitForSelector('#lessonBookSection .book-page-thumb[data-book-gallery-open]', {timeout:15000});
  const result = await page.evaluate(() => {
    const thumbnails = [...document.querySelectorAll('#lessonBookSection .book-page-thumb[data-book-gallery-open]')];
    thumbnails[0]?.click();
    const modal = document.getElementById('persianBookGalleryModal');
    if (!modal) throw new Error('Tapping a page image did not open the gallery.');
    const stage = modal.querySelector('[data-gallery-stage]');
    const image = modal.querySelector('[data-gallery-image]');
    const nextButton = modal.querySelector('[data-gallery-next]');
    const nextButtonOnLeft = nextButton === stage.firstElementChild;
    const firstSource = image.getAttribute('src');
    nextButton.click();
    const buttonMovedToNextPage = image.getAttribute('src') !== firstSource;
    const dispatchTouch = (type, changedPoints, activePoints) => {
      const toTouch = point => ({clientX:point[0],clientY:point[1]});
      const event = new Event(type,{bubbles:true,cancelable:true});
      Object.defineProperty(event,'changedTouches',{value:changedPoints.map(toTouch)});
      Object.defineProperty(event,'touches',{value:activePoints.map(toTouch)});
      stage.dispatchEvent(event);
    };
    const sourceBeforeSwipe = image.getAttribute('src');
    dispatchTouch('touchstart',[[150,200]],[[150,200]]);
    dispatchTouch('touchend',[[230,200]],[]);
    const leftToRightGoesNext = image.getAttribute('src') !== sourceBeforeSwipe;
    dispatchTouch('touchstart',[[100,160],[180,160]],[[100,160],[180,160]]);
    dispatchTouch('touchmove',[[70,160],[210,160]],[[70,160],[210,160]]);
    const pinchZoomWorks = Number(image.dataset.zoom || '1') > 1.4;
    const zoomScale = image.dataset.zoom;
    dispatchTouch('touchend',[[70,160],[210,160]],[]);
    modal.querySelector('[data-gallery-close]')?.click();
    const closeWorks = !document.getElementById('persianBookGalleryModal');
    return {thumbnailCount:thumbnails.length,nextButtonOnLeft,buttonMovedToNextPage,leftToRightGoesNext,pinchZoomWorks,zoomScale,closeWorks};
  });
  assert.ok(result.thumbnailCount > 1, 'صفحه‌های درس به‌صورت تصاویر قابل انتخاب نمایش داده نشدند');
  assert.equal(result.nextButtonOnLeft,true,'فلش صفحهٔ بعد در سمت چپ قرار ندارد');
  assert.equal(result.buttonMovedToNextPage,true,'فلش سمت چپ صفحهٔ بعد را نمایش نداد');
  assert.equal(result.leftToRightGoesNext,true,'کشیدن تصویر از چپ به راست صفحهٔ بعدی را نمایش نداد');
  assert.equal(result.pinchZoomWorks,true,'زوم دو‌انگشتی تصویر را بزرگ نکرد');
  assert.equal(result.closeWorks,true,'دکمهٔ بستن گالری عمل نکرد');
  assert.deepEqual(pageErrors, [], 'خطای JavaScript هنگام آزمایش گالری: '+pageErrors.join(' | '));
  console.log('Persian gallery browser checks passed:', JSON.stringify(result));
} finally {
  await context.close();
  await browser.close();
}
