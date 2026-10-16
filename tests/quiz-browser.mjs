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
  const allBookMapCount = document.querySelectorAll('#chapterPlanetRoute .chapter-planet-node[data-planet-subject]').length;
  api.showStudentAppView('profile');
  const placement = api.getProgressViewPlacement();
  api.showStudentAppView('home');
  return {catalogCounts,selectors,mathPlanetCount,lessonPlanetCounts,allBookMapCount,placement,reportNav:!!document.querySelector('#studentAppNav [data-app-view="report"]')};
});
for (const subject of ['math','persian','science','social','gifts']) {
  assert.ok(lessonUi.catalogCounts[subject] > 0, subject + ': فهرست پایهٔ درس‌ها خالی است');
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
assert.equal(lessonUi.allBookMapCount, ['math','persian','science','social','gifts'].reduce((sum,subject)=>sum+lessonUi.catalogCounts[subject],0), 'نقشهٔ پروفایل باید سیاره‌های هر پنج کتاب را داشته باشد');
assert.equal(lessonUi.placement.homeInsideProfile, false, 'صفحهٔ انتخاب درس نباید داخل بخش پنهان پروفایل باشد');
assert.equal(lessonUi.placement.reportInsideProfile, false, 'کارنامه باید جدا از پروفایل باشد');
assert.equal(lessonUi.placement.mapInsideHome, true, 'نقشهٔ کامل پیشرفت باید در صفحهٔ خانه باقی بماند');
assert.equal(lessonUi.placement.profileChartInsideProfile, true, 'نمودار خلاصهٔ پیشرفت باید در پروفایل نمایش داده شود');
assert.equal(lessonUi.reportNav, true, 'بخش کارنامه باید در نوار پیمایش وجود داشته باشد');

assert.deepEqual(pageErrors, [], 'برنامه هنگام اجرا خطای JavaScript داد: ' + pageErrors.join(' | '));

console.log('Browser question checks passed:', JSON.stringify(sourceReport));
console.log('Matching interaction passed: four answer selectors, correct grading, and answer feedback.');
await browser.close();
