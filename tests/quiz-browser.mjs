import assert from 'node:assert/strict';

let chromium;
try {
  ({ chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright'));
} catch {
  ({ chromium } = await import(process.env.RUNNER_TEMP + '/quiz-test/node_modules/playwright/index.mjs'));
}
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ serviceWorkers: 'block' });
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'domcontentloaded' });
try {
  await page.waitForFunction(() => !!window.__quizTestApi, { timeout: 12000 });
} catch (error) {
  throw new Error('Local test bridge was not initialized. pageErrors=' + JSON.stringify(pageErrors) + '; consoleErrors=' + JSON.stringify(consoleErrors) + '; ' + error.message);
}
await page.evaluate(async () => { await window.__quizTestApi.loadSourceQuestionBanks(); });

const mathVisualAidReport = await page.evaluate(() => {
  const render = window.renderMathQuestionVisualMarkup;
  if (typeof render !== 'function') return { unavailable: true };
  const cases = [
    {tag:'machine', q:'قانون ماشین «دو برابر کن و ۱ اضافه کن» است. خروجی ورودی ۵ چیست؟', chapter:1, skill:'ماشین ورودی ـ خروجی'},
    {tag:'sequence', q:'عدد بعدی الگو چیست؟ ۷، ۱۲، ۱۷، ۲۲، ؟', chapter:1, skill:'الگوها'},
    {tag:'shape-sequence', q:'الگوی شکلی را ادامه بده: شکل بعدی چیست؟', chapter:1, skill:'الگوی شکلی'},
    {tag:'fractions', q:'یک شکل به ۶ قسمت مساوی تقسیم شده و ۲ قسمت رنگ شده است. کسر قسمت رنگ‌شده چیست؟', chapter:2, skill:'شناخت کسر'},
    {tag:'geometry', q:'در کارت هندسی شماره‌ی ۴ شکل مربع دیده می‌شود. کدام ویژگی آن درست است؟', chapter:6, skill:'چهارضلعی‌ها'},
    {tag:'geometry', q:'دو خط عمود بر هم زاویه‌ی ۸۰ درجه می‌سازند.', chapter:6, skill:'خط‌های عمود'},
    {tag:'time', q:'۱ ساعت و ۴۵ دقیقه چند دقیقه است؟', chapter:4, skill:'تبدیل زمان'},
    {tag:'probability', q:'اگر در کیسه ۵ مهره‌ی آبی و ۱ مهره‌ی قرمز باشد، قرمز به احتمال بیشتر انتخاب می‌شود؟', chapter:7, skill:'احتمال'},
    {tag:'chart', q:'داده‌ها ۱۳، ۱۶، ۲۷ هستند. بیشترین مقدار کدام است؟', chapter:7, skill:'بیشترین و کمترین داده'},
    {tag:'place-value', q:'عدد ۳۴۵٬۲۱۸ را به شکل گسترده بنویس.', chapter:1, skill:'شکل گسترده'},
    {tag:'number-line', q:'عدد ۱/۲ را روی محور عددی نشان بده.', chapter:2, skill:'محور عددی'}
  ];
  return cases.map(test => {
    const markup = render(test, false);
    const expected = ({
      machine:'mqv-machine',
      sequence:'mqv-sequence',
      'shape-sequence':'mqv-shape-sequence',
      fractions:'mqv-fractions',
      geometry:'mqv-geometry',
      time:'mqv-time-track',
      probability:'mqv-data-balls',
      chart:'mqv-line-chart',
      'place-value':'mqv-place-table',
      'number-line':'↔️ محور عددی'
    })[test.tag];
    return {tag:test.tag, hasMarkup:!!markup, expectedPresent:!!markup && markup.includes(expected)};
  });
});
assert.equal(mathVisualAidReport.unavailable, undefined, 'تابع رسم کمکی سؤال‌های ریاضی در صفحهٔ آزمون موجود نیست');
for (const aid of mathVisualAidReport) {
  assert.equal(aid.hasMarkup, true, 'شکل کمکی برای مورد ' + aid.tag + ' ساخته نشد');
  assert.equal(aid.expectedPresent, true, 'خروجی شکل کمکی برای مورد ' + aid.tag + ' درست نیست');
}


const sourceReport = await page.evaluate(() => {
  const api = window.__quizTestApi;
  const report = {};
  for (const subject of ['science', 'social', 'gifts']) {
    const bank = api.getSourceBank()[subject] || {};
    const lessons = Object.keys(bank).filter(key => key.length > 0 && [...key].every(ch => ch >= '0' && ch <= '9'));
    const questions = lessons.flatMap(lesson => api.getSourceQuizzes(subject, Number(lesson)));
    const sourceRows = lessons.flatMap(lesson => bank[lesson] || []);
    report[subject] = {
      lessonCount: lessons.length,
      questionCount: questions.length,
      multipleChoiceCount: questions.filter(q => q.type === 'mc').length,
      blankCount: questions.filter(q => q.type === 'blank_mc').length,
      matchingCount: questions.filter(q => q.type === 'matching').length,
      invalidFourChoice: questions.filter(q => q.type !== 'matching' && (q.options.length !== 4 || new Set(q.options.map(api.normalize)).size !== 4 || q.answer < 0 || q.answer >= q.options.length || api.normalize(q.options[q.answer]) !== api.normalize(q.sourceAnswer))).length,
      invalidMatching: questions.filter(q => {
        if (q.type !== 'matching') return false;
        if (q.options.length !== 8 || q.pairs.length !== 4 || q.answer.length !== 4 || q.answer.some(index => index < 4 || index > 7) || new Set(q.options.map(api.normalize)).size !== 8) return true;
        return !Array.isArray(q.sourceAnswers) || q.sourceAnswers.length !== 4 || q.pairs.some((question, i) => api.normalize(q.options[q.answer[i]]) !== api.normalize(q.sourceAnswers[i]));
      }).length,
      placeholders: questions.filter(q => q.options.some(option => option.toLowerCase().includes('گزینه') && option.toLowerCase().includes('تکمیلی'))).length
    };
  }
  let persianLessonCount = 0, persianQuestionCount = 0, persianBlankCount = 0, persianMatchingCount = 0, persianInvalid = 0;
  for (const lesson of api.getPersianLessons()) {
    persianLessonCount++;
    const questions = api.getPersianQuizzes(lesson);
    persianQuestionCount += questions.length;
    persianBlankCount += questions.filter(q => q.type === 'blank_mc').length;
    for (const q of questions) {
      if (q.options.length !== 4 || new Set(q.options.map(api.normalize)).size !== 4 || q.answer < 0 || q.answer > 3) persianInvalid++;
    }
    for (const q of api.getPersianMatching(lesson)) {
      persianMatchingCount++;
      if (q.options.length !== 8 || q.pairs.length !== 4 || q.answer.length !== 4 || q.answer.some(index => index < 4 || index > 7) || new Set(q.options.map(api.normalize)).size !== 8) persianInvalid++;
    }
  }
  report.persian = {lessonCount: persianLessonCount, questionCount: persianQuestionCount, blankCount: persianBlankCount, matchingSets: persianMatchingCount, invalidQuestions: persianInvalid};
  return report;
});
for (const subject of ['science','social','gifts']) {
  const info = sourceReport[subject];
  assert.ok(info.lessonCount > 0, subject + ': دفتر منبع بارگذاری نشد');
  assert.ok(info.questionCount > 0, subject + ': سؤال معتبر ساخته نشد');
  assert.equal(info.invalidFourChoice, 0, subject + ': سؤال چهارگزینه‌ای نامعتبر است');
  assert.equal(info.invalidMatching, 0, subject + ': سؤال جورکردنی نامعتبر است');
  assert.equal(info.placeholders, 0, subject + ': گزینهٔ تکمیلی در خروجی باقی مانده است');
}
assert.ok(sourceReport.persian.lessonCount > 0, 'فهرست درس‌های فارسی بارگذاری نشد');
assert.ok(sourceReport.persian.questionCount > 0, 'از داده‌های فارسی سؤال ساخته نشد');
assert.equal(sourceReport.persian.invalidQuestions, 0, 'سؤال فارسی یا جورکردنی فارسی نامعتبر است');

const interaction = await page.evaluate(() => {
  const api = window.__quizTestApi;
  const oldGetter = api.getOtherSubjectQuestions();
  const oldOpen = api.isCourseLessonOpen();
  const oldSubject = api.getSelectedOtherSubject();
  const options = ['مورد الف','مورد ب','مورد ج','مورد د','پاسخ ۱','پاسخ ۲','پاسخ ۳','پاسخ ۴'];
  const q = {type:'matching',kind:'جورکردنی آزمایشی',question:'هر مورد را با پاسخ درست جور کن.',pairs:options.slice(0,4),options,answer:[4,5,6,7],analysis:'تحلیل تستی'};
  api.setOtherSubjectQuestions(() => [q]);
  api.setCourseLessonOpen(() => true);
  api.setSelectedOtherSubject({id:'persian',name:'فارسی',lessons:[{id:1,title:'درس آزمایشی'}]});
  api.renderOtherSubjectActivity('practice');
  const selects = [...document.querySelectorAll('#otherSubjectActivityQuestions select[data-other-matching-index]')];
  const displayedOptions = selects[0] ? [...selects[0].options].slice(1).map(option => ({text:option.textContent.trim(),value:Number(option.value)})) : [];
  if (selects[0]) { selects[0].value='4'; selects[0].dispatchEvent(new Event('change',{bubbles:true})); }
  const duplicateWasDisabled = selects[1] ? [...selects[1].options].some(option => option.value === '4' && option.disabled) : false;
  selects.forEach((select,i) => { select.value=String(i+4); select.dispatchEvent(new Event('change',{bubbles:true})); });
  const check = document.querySelector('#otherSubjectActivityQuestions [data-other-activity-check]');
  check?.click();
  const feedback = document.querySelector('#otherSubjectActivityQuestions [data-other-activity-feedback]')?.textContent || '';
  api.setOtherSubjectQuestions(oldGetter);
  api.setCourseLessonOpen(oldOpen);
  api.setSelectedOtherSubject(oldSubject);
  return {selectCount:selects.length,displayedOptions,duplicateWasDisabled,feedback};
});
assert.equal(interaction.selectCount, 4, 'نمایش جورکردنی باید چهار فهرست انتخاب داشته باشد');
assert.deepEqual(interaction.displayedOptions.map(x => x.text), ['پاسخ ۱','پاسخ ۲','پاسخ ۳','پاسخ ۴'], 'گزینه‌های ستون راست باید فقط پاسخ‌ها باشند');
assert.deepEqual(interaction.displayedOptions.map(x => x.value), [4,5,6,7], 'شناسهٔ گزینه‌ها باید با پاسخ‌نامه هماهنگ باشد');
assert.equal(interaction.duplicateWasDisabled, true, 'یک پاسخ نباید در چند ردیف جورکردنی انتخاب شود');
assert.match(interaction.feedback, /آفرین|درست/, 'ثبت و تصحیح جورکردنی در صفحه کار نکرد');

const lessonUi = await page.evaluate(() => {
  const api = window.__quizTestApi;
  const subjects = ['math','persian','science','social','gifts'];
  const catalogCounts = Object.fromEntries(subjects.map(subject => [subject, api.getCourseCatalog(subject).length]));
  const selectors = [];
  for (const subject of subjects) {
    const pairs = [
      ['teacherBankSubject','teacherBankChapter'],
      ['actSubject','actLesson'],
      ['lessonFileSubject','lessonFileLesson'],
      ['printExamSubject','printExamLessons']
    ];
    for (const [subjectId, lessonId] of pairs) {
      const sub = document.getElementById(subjectId), target = document.getElementById(lessonId);
      if (sub && [...sub.options].some(option => option.value === subject)) sub.value = subject;
    }
    api.refreshCourseLessonSelectors();
    api.renderPrintableLessonChoices();
    selectors.push({
      subject,
      bank: document.querySelectorAll('#teacherBankChapter option').length,
      assignment: document.querySelectorAll('#actLesson option').length,
      material: document.querySelectorAll('#lessonFileLesson option').length,
      printable: document.querySelectorAll('#printExamLessons input[type="checkbox"]').length
    });
  }
  api.renderChapterPicker();
  const mathPlanetCount = document.querySelectorAll('#chapterPicker .chapter-planet-node[data-chapter]').length;
  const lessonPlanetCounts = {};
  for (const subject of ['persian','science','social','gifts']) {
    api.openOtherSubject(subject);
    lessonPlanetCounts[subject] = document.querySelectorAll('#otherSubjectLessonPicker .chapter-planet-node[data-other-lesson]').length;
  }
  api.renderPlanetaryChapterRoute();
  const galaxyMapRemoved = !document.getElementById('chapterPlanetRoute');
  api.showStudentAppView('profile');
  const placement = api.getProgressViewPlacement();
  api.showStudentAppView('home');
  const progressRendererAvailable = typeof window.__renderAllBooksProgressDashboard === 'function';
  if (progressRendererAvailable) window.__renderAllBooksProgressDashboard();
  const progressBookNames = [...document.querySelectorAll('#allBooksProgressMount .profile-progress-label')].map(el => el.textContent.trim());
  const homeNavLabel = document.querySelector('#studentAppNav [data-app-view="home"] small')?.textContent.trim() || '';
  const mathBookTabs = [...document.querySelectorAll('#bookView [data-book-tab]')].map(button => button.dataset.bookTab);
  const mainPracticeAndExamRetained = !!document.querySelector('#studentAppNav [data-app-view="practice"]') && !!document.querySelector('#studentAppNav [data-app-view="exam"]');
  return {catalogCounts,selectors,mathPlanetCount,lessonPlanetCounts,galaxyMapRemoved,progressRendererAvailable,progressBookNames,homeNavLabel,mathBookTabs,mainPracticeAndExamRetained,placement,reportNav:!!document.querySelector('#studentAppNav [data-app-view="report"]')};
});
const expectedCatalogCounts = {math:7,persian:17,science:13,social:22,gifts:19};
for (const subject of ['math','persian','science','social','gifts']) {
  assert.ok(lessonUi.catalogCounts[subject] > 0, subject + ': فهرست پایهٔ درس‌ها خالی است');
  assert.equal(lessonUi.catalogCounts[subject], expectedCatalogCounts[subject], subject + ': تعداد درس‌ها با فهرست مورد انتظار کتاب چهارم مطابقت ندارد');
}
for (const row of lessonUi.selectors) {
  assert.ok(row.bank > 0, row.subject + ': فهرست درس‌های بانک سؤال خالی است');
  assert.ok(row.assignment > 0, row.subject + ': فهرست درس‌های فعالیت خالی است');
  assert.ok(row.material > 0, row.subject + ': فهرست درس‌های منابع خالی است');
  assert.ok(row.printable > 0, row.subject + ': فهرست درس‌های آزمون چاپی خالی است');
}
assert.equal(lessonUi.mathPlanetCount, lessonUi.catalogCounts.math, 'فصل‌های ریاضی باید همگی به شکل سیاره نمایش داده شوند');
for (const subject of ['persian','science','social','gifts']) {
  assert.equal(lessonUi.lessonPlanetCounts[subject], lessonUi.catalogCounts[subject], subject + ': درس‌ها به شکل سیاره نمایش داده نمی‌شوند');
}
assert.equal(lessonUi.galaxyMapRemoved, true, 'نقشهٔ کهکشانی کتاب‌ها باید از صفحهٔ پیشرفت حذف شود');
assert.equal(lessonUi.progressRendererAvailable, true, 'تابع نمایش پیشرفت همهٔ کتاب‌ها تعریف نشده است');
assert.deepEqual(lessonUi.progressBookNames, ['ریاضی','فارسی','علوم تجربی','مطالعات اجتماعی','هدیه‌های آسمانی'], 'گزارش پیشرفت باید هر پنج کتاب را نشان دهد');
assert.equal(lessonUi.homeNavLabel, 'انتخاب کتاب', 'برچسب نوار اصلی باید «انتخاب کتاب» باشد');
assert.deepEqual(lessonUi.mathBookTabs, ['file','chapters'], 'فقط فایل کتاب و توضیح فصل باید در نوار داخلی کتاب بمانند');
assert.equal(lessonUi.mainPracticeAndExamRetained, true, 'تمرین و امتحان باید از نوار اصلی بالای برنامه در دسترس بمانند');
assert.equal(lessonUi.placement.homeInsideProfile, false, 'صفحهٔ انتخاب درس نباید داخل بخش پنهان پروفایل باشد');
assert.equal(lessonUi.placement.reportInsideProfile, false, 'کارنامه باید جدا از پروفایل باشد');
assert.equal(lessonUi.placement.mapInsideHome, true, 'نقشهٔ کامل پیشرفت باید در صفحهٔ خانه باقی بماند');
assert.equal(lessonUi.placement.profileChartInsideProfile, true, 'نمودار خلاصهٔ پیشرفت باید در پروفایل نمایش داده شود');
assert.equal(lessonUi.reportNav, true, 'بخش کارنامه باید در نوار پیمایش وجود داشته باشد');

const mathNavigation = await page.evaluate(() => {
  const api = window.__quizTestApi;
  api.showStudentAppView('home');
  document.querySelector('#studentSubjectPicker [data-student-subject="math"]')?.click();
  const mathMenuVisible = !document.getElementById('mathHomeMenu')?.classList.contains('hidden');
  const allBooksMapHidden = document.getElementById('studentDashboard')?.classList.contains('hidden') === true;
  document.querySelector('#mathHomeMenu [data-student-view="book"]')?.click();
  const bookVisible = !document.getElementById('bookView')?.classList.contains('hidden');
  const chapterTabActive = document.getElementById('booktab-chapters')?.classList.contains('active') === true;
  const chapterButton = document.querySelector('#chapterPicker [data-chapter="1"]');
  const chapterDisabled = !chapterButton || chapterButton.disabled;
  chapterButton?.click();
  const lessonViewVisible = !document.getElementById('mathChapterLessonView')?.classList.contains('hidden');
  const bookHidden = document.getElementById('bookView')?.classList.contains('hidden') === true;
  const lessonTitle = document.getElementById('chapterLessonTitle')?.textContent || '';
  const lessonContentPresent = (document.getElementById('chapterLessonBody')?.textContent || '').trim().length > 20;
  document.getElementById('backToChapterPicker')?.click();
  const backReturnsToChapters = document.getElementById('mathChapterLessonView')?.classList.contains('hidden') === true
    && !document.getElementById('bookView')?.classList.contains('hidden')
    && !document.getElementById('booktab-chapters')?.classList.contains('active') === false;
  return {mathMenuVisible,allBooksMapHidden,bookVisible,chapterTabActive,chapterDisabled,lessonViewVisible,bookHidden,lessonTitle,lessonContentPresent,backReturnsToChapters};
});
assert.equal(mathNavigation.mathMenuVisible, true, 'انتخاب کتاب ریاضی باید منوی اختصاصی ریاضی را باز کند');
assert.equal(mathNavigation.allBooksMapHidden, true, 'نقشهٔ تمام کتاب‌ها نباید زیر منوی ریاضی نمایش داده شود');
assert.equal(mathNavigation.bookVisible, true, 'دکمهٔ کتاب ریاضی باید کتاب ریاضی را باز کند');
assert.equal(mathNavigation.chapterTabActive, true, 'کتاب ریاضی باید مستقیماً بخش توضیح فصل‌ها را باز کند');
assert.equal(mathNavigation.chapterDisabled, false, 'فصل اول ریاضی به‌طور پیش‌فرض باید قابل بازشدن باشد');
assert.equal(mathNavigation.lessonViewVisible, true, 'انتخاب فصل باید صفحهٔ مستقل آموزش را نمایش دهد');
assert.equal(mathNavigation.bookHidden, true, 'با باز شدن آموزش فصل، فهرست کتاب باید پنهان شود');
assert.match(mathNavigation.lessonTitle, /فصل\s*۱|فصل 1|فصل ۱/, 'عنوان فصل در صفحهٔ آموزش نمایش داده نشد');
assert.equal(mathNavigation.lessonContentPresent, true, 'توضیحات فصل در صفحهٔ آموزش خالی است');
assert.equal(mathNavigation.backReturnsToChapters, true, 'دکمهٔ بازگشت باید فهرست فصل‌ها را برگرداند');

const subjectLessonUi = await page.evaluate(async () => {
  const api = window.__quizTestApi;
  const result = {};
  for (const subject of ['persian','science','social','gifts']) {
    api.showStudentAppView('home');
    const subjectButton = document.querySelector('#studentSubjectPicker [data-student-subject="'+subject+'"]');
    subjectButton?.click();
    const lessonButton = document.querySelector('#otherSubjectLessonPicker [data-other-lesson]:not([disabled])');
    const lessonId = lessonButton?.getAttribute('data-other-lesson') || '';
    lessonButton?.click();
    const title = document.getElementById('otherLessonTitle')?.textContent.trim() || '';
    const body = document.getElementById('otherLessonContent')?.textContent.trim() || '';
    const viewVisible = !document.getElementById('otherSubjectLessonBody')?.classList.contains('hidden');
    const renderedError = /باز کردن این درس با خطا روبه‌رو شد/.test(body);
    result[subject] = {lessonId,title,bodyLength:body.length,viewVisible,renderedError};
    document.getElementById('backToOtherLessons')?.click();
  }
  api.showStudentAppView('home');
  const idCounts = {};
  document.querySelectorAll('[id]').forEach(el => { idCounts[el.id]=(idCounts[el.id]||0)+1; });
  const duplicateIds = Object.entries(idCounts).filter(([,count])=>count>1).map(([id,count])=>({id,count}));
  return {result,duplicateIds};
});
for (const subject of ['persian','science','social','gifts']) {
  const item = subjectLessonUi.result[subject];
  assert.ok(item.lessonId, subject + ': هیچ درس بازی برای آزمون پیدا نشد');
  assert.ok(item.viewVisible, subject + ': صفحهٔ آموزش درس باز نشد');
  assert.ok(item.title.length > 0, subject + ': عنوان درس نمایش داده نشد');
  assert.ok(item.bodyLength > 30, subject + ': محتوای درس خالی است');
  assert.equal(item.renderedError, false, subject + ': نمایش درس به پیام خطا رسید');
}
assert.deepEqual(subjectLessonUi.duplicateIds, [], 'شناسهٔ تکراری در DOM می‌تواند کلیک‌ها و کنترل‌ها را مختل کند: '+JSON.stringify(subjectLessonUi.duplicateIds));

await page.setViewportSize({width:390,height:844});
const mobileUi = await page.evaluate(() => {
  const api = window.__quizTestApi;
  const measure = label => ({
    label,
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  });
  const checks = [];
  api.showStudentAppView('home');
  checks.push(measure('student-home'));
  document.querySelector('#studentSubjectPicker [data-student-subject="math"]')?.click();
  checks.push(measure('math-menu'));
  document.querySelector('#mathHomeMenu [data-student-view="book"]')?.click();
  checks.push(measure('math-book'));
  document.querySelector('#chapterPicker [data-chapter="1"]')?.click();
  checks.push(measure('math-chapter-lesson'));
  document.getElementById('backToChapterPicker')?.click();
  api.showStudentAppView('home');
  document.querySelector('#studentSubjectPicker [data-student-subject="science"]')?.click();
  const lessonButton = document.querySelector('#otherSubjectLessonPicker [data-other-lesson]:not([disabled])');
  lessonButton?.click();
  checks.push(measure('science-lesson'));
  const navButtons = [...document.querySelectorAll('#studentAppNav [data-app-view]')].filter(button => !button.classList.contains('hidden'));
  return {checks, visibleNavButtons:navButtons.length, navButtonsHaveLabels:navButtons.every(button => !!button.querySelector('small')?.textContent.trim())};
});
assert.equal(mobileUi.checks.every(x=>!x.hasHorizontalOverflow), true, 'نمایش موبایل دارای سرریز افقی است: '+JSON.stringify(mobileUi.checks));
assert.ok(mobileUi.visibleNavButtons >= 5, 'در عرض موبایل، گزینه‌های ناوبری اصلی پنهان شده‌اند');
assert.equal(mobileUi.navButtonsHaveLabels, true, 'یکی از دکمه‌های ناوبری موبایل برچسب ندارد');
assert.deepEqual(pageErrors, [], 'برنامه هنگام اجرا خطای JavaScript داد: ' + pageErrors.join(' | '));
assert.deepEqual(consoleErrors, [], 'برنامه درخواست/خطای کنسول ناخواسته دارد: ' + consoleErrors.join(' | '));

console.log('Browser question checks passed:', JSON.stringify(sourceReport));
console.log('Matching interaction passed: four answer selectors, correct grading, and answer feedback.');
await browser.close();
