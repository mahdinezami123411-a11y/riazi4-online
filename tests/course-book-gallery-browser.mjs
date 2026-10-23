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
const otherSubjects = [
  {id:'science',title:'علوم تجربی'},
  {id:'social',title:'مطالعات اجتماعی'},
  {id:'gifts',title:'هدیه‌های آسمانی'}
];
const mathChapters = [
  {id:1,sections:5,pages:19},
  {id:2,sections:4,pages:19},
  {id:3,sections:6,pages:27},
  {id:4,sections:4,pages:19},
  {id:5,sections:4,pages:19},
  {id:6,sections:5,pages:19},
  {id:7,sections:3,pages:11}
];

try {
  await page.goto('http://127.0.0.1:8765/index.html', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => !!window.__quizTestApi, {timeout:12000});

  // Other textbooks use the shared lesson picker and its lesson-level gallery.
  for (const subject of otherSubjects) {
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

  // Math chapters open directly; each subsection contains its own page gallery above the explanation.
  await page.evaluate(() => {
    const api = window.__quizTestApi;
    // In production, chapter availability is configured by the teacher; open all chapters in this UI test.
    api.setCourseLessonOpen(() => true);
    api.showStudentAppView('home');
    api.showStudentAppView('learn');
    api.renderChapterPicker();
    if (document.querySelector('#bookView [data-book-tab="chapters"]') || document.querySelector('#bookView .book-tabs')) {
      throw new Error('دکمهٔ قدیمی «آموزش فصل‌ها و صفحات کتاب» هنوز وجود دارد');
    }
    if (document.querySelector('#bookView [data-book-tab="file"]') || document.getElementById('booktab-file')) {
      throw new Error('تب PDF کتاب ریاضی هنوز در پنل دانش‌آموز وجود دارد');
    }
    window.__renderMathChapterForTest(1);
  });

  const mathReports=[];
  for (const chapter of mathChapters) {
    if (chapter.id > 1) {
      await page.evaluate(chapterId => {
        const api = window.__quizTestApi;
        window.__renderMathChapterForTest(chapterId);
      }, chapter.id);
    }
    await page.waitForFunction(() => document.querySelectorAll('#chapterLessonBody .math-subtopic-book-gallery').length > 0, {timeout:12000});
    const report = await page.evaluate(chapterId => {
      const notes=[...document.querySelectorAll('#chapterLessonBody .math-subtopic-learning')];
      const galleries=[...document.querySelectorAll('#chapterLessonBody .math-subtopic-book-gallery')];
      const pagesSection=document.querySelector('#chapterLessonBody details.math-chapter-book-pages');
      return {
        chapter:chapterId,
        sectionCount:notes.length,
        chapterPagesSection:Boolean(pagesSection),
        galleryCount:galleries.length,
        pageCount:galleries.reduce((sum,g)=>sum+((g.dataset.mathPageList||'').split(',').filter(Boolean).length),0),
        pathsValid:galleries.every(g=>[...g.querySelectorAll('img')].every(img=>(img.getAttribute('src')||'').includes('assets/book-pages/math/page-'))),
        eachSectionHasPages:notes.length===galleries.length&&notes.every(n=>{
          const gallery=n.querySelector('.math-subtopic-book-gallery');
          const explanation=n.querySelector('.lesson-accordion-content > p');
          return Boolean(gallery&&explanation&&gallery.nextElementSibling===explanation);
        }),
        firstImage:galleries[0]?.querySelector('img')?.getAttribute('src')||'',
        firstPageList:galleries[0]?.dataset.mathPageList||''
      };
    }, chapter.id);
    assert.equal(report.sectionCount,chapter.sections,'فصل '+chapter.id+': تعداد مباحث آموزشی تغییر کرده است');
    assert.equal(report.chapterPagesSection,false,'فصل '+chapter.id+': بخش جداگانهٔ صفحات کتاب هنوز نمایش داده می‌شود');
    assert.equal(report.galleryCount,chapter.sections,'فصل '+chapter.id+': برای همهٔ مباحث گالری صفحه ساخته نشده است');
    assert.equal(report.pageCount,chapter.pages,'فصل '+chapter.id+': تعداد صفحه‌های تخصیص‌داده‌شده با فهرست کتاب برابر نیست');
    assert.equal(report.pathsValid,true,'فصل '+chapter.id+': مسیر تصویرهای کتاب ریاضی اشتباه است');
    assert.equal(report.eachSectionHasPages,true,'فصل '+chapter.id+': تصویرهای مبحث بالای توضیحات همان مبحث قرار ندارند');
    assert.ok(report.firstImage.includes('assets/book-pages/math/page-'),'فصل '+chapter.id+': تصویر صفحه پیدا نشد');
    mathReports.push(report);
    console.log('math subsection page check passed:',JSON.stringify(report));
  }

  // Verify that an inline math subsection thumbnail opens the image gallery and supports next/close.
  await page.evaluate(() => {
    // Open chapter 1 and expand its pages accordion so lazy images can load.
    window.__renderMathChapterForTest(1);
    const subsection=document.querySelector('#chapterLessonBody details.math-subtopic-learning');
    if(subsection)subsection.open=true;
  });
  await page.waitForFunction(() => {
    const img=document.querySelector('#chapterLessonBody .math-subtopic-book-gallery img');
    return !!img && img.complete && img.naturalWidth>0;
  }, {timeout:12000});
  const mathModal = await page.evaluate(() => {
    const subsection=document.querySelector('#chapterLessonBody details.math-subtopic-learning');
    if(subsection)subsection.open=true;
    const gallery=subsection?.querySelector('.math-subtopic-book-gallery');
    const cards=[...(gallery?.querySelectorAll('[data-math-page-open]')||[])];
    const source=cards[0]?.querySelector('img')?.getAttribute('src')||'';
    cards[0]?.click();
    const modal=document.getElementById('persianBookGalleryModal');
    const image=modal?.querySelector('[data-gallery-image]');
    const first=image?.getAttribute('src')||'';
    modal?.querySelector('[data-gallery-next]')?.click();
    const next=image?.getAttribute('src')||'';
    const label=modal?.getAttribute('aria-label')||'';
    modal?.querySelector('[data-gallery-close]')?.click();
    return {source,first,next,label,opened:!!(modal&&first),nextWorked:!!(first&&next&&first!==next),closed:!document.getElementById('persianBookGalleryModal')};
  });
  assert.ok(mathModal.source.includes('assets/book-pages/math/page-'),'تصویر مبحث ریاضی از پوشهٔ اشتباه می‌آید');
  assert.equal(mathModal.opened,true,'گالری صفحهٔ مبحث ریاضی باز نشد');
  assert.ok(mathModal.label.includes('ریاضی'),'عنوان گالری صفحهٔ ریاضی درست نیست');
  assert.equal(mathModal.nextWorked,true,'رفتن به صفحهٔ بعد در گالری ریاضی کار نکرد');
  assert.equal(mathModal.closed,true,'بستن گالری ریاضی کار نکرد');
  assert.deepEqual(pageErrors,[], 'خطای JavaScript هنگام آزمایش گالری کتاب‌ها: '+pageErrors.join(' | '));
  console.log('math page modal check passed:',JSON.stringify(mathModal));
} finally {
  await context.close();
  await browser.close();
}
