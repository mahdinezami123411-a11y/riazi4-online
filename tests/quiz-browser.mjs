import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../package.json', import.meta.url));
let chromium;
try {
  ({ chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright'));
} catch {
  const alt = process.env.RUNNER_TEMP + '/quiz-test/node_modules/playwright/index.mjs';
  ({ chromium } = await import(alt));
}
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof getSourceQuestionBankQuizzes === 'function' && typeof buildPersianLessonQuizzes === 'function', { timeout: 15000 });
await page.evaluate(async () => { await loadSourceQuestionBanks(); });
await page.waitForFunction(() => typeof sourceQuestionBanks !== 'undefined' && !!sourceQuestionBanks._meta, { timeout: 15000 });

const sourceReport = await page.evaluate(() => {
  const report = {};
  for (const subject of ['science', 'social', 'gifts']) {
    const bank = sourceQuestionBanks[subject] || {};
    const lessons = Object.keys(bank).filter(key => /^\\d+$/.test(key));
    const questions = lessons.flatMap(lesson => getSourceQuestionBankQuizzes(subject, Number(lesson)));
    report[subject] = {
      lessonCount: lessons.length,
      questionCount: questions.length,
      multipleChoiceCount: questions.filter(q => q.type === 'mc').length,
      blankCount: questions.filter(q => q.type === 'blank_mc').length,
      matchingCount: questions.filter(q => q.type === 'matching').length,
      invalidFourChoice: questions.filter(q => q.type !== 'matching' && (q.options.length !== 4 || new Set(q.options.map(sourceQuestionNormalize)).size !== 4 || q.answer < 0 || q.answer >= q.options.length || sourceQuestionNormalize(q.options[q.answer]) !== sourceQuestionNormalize(q.sourceAnswer))).length,
      invalidMatching: questions.filter(q => q.type === 'matching' && (q.options.length !== 8 || q.pairs.length !== 4 || q.answer.length !== 4 || q.answer.some(index => index < 4 || index > 7) || q.answer.some((index, i) => sourceQuestionNormalize(q.options[index]) !== sourceQuestionNormalize(bank[String(q.pairs[i])])))).length,
      placeholders: questions.filter(q => q.options.some(option => /گزینه.?تکمیلی|option\\s*\\d+/i.test(option))).length
    };
  }
  let persianLessonCount = 0, persianQuestionCount = 0, persianBlankCount = 0, persianMatchingCount = 0, persianInvalid = 0;
  const lessons = typeof persianLessons !== 'undefined' ? persianLessons : [];
  for (const lesson of lessons) {
    persianLessonCount++;
    const questions = buildPersianLessonQuizzes(lesson);
    persianQuestionCount += questions.length;
    persianBlankCount += questions.filter(q => q.type === 'blank_mc').length;
    for (const q of questions) {
      if (q.options.length !== 4 || new Set(q.options.map(sourceQuestionNormalize)).size !== 4 || q.answer < 0 || q.answer > 3) persianInvalid++;
    }
    for (const q of buildPersianMatchingQuizzes(lesson)) {
      persianMatchingCount++;
      if (q.options.length !== 8 || q.pairs.length !== 4 || q.answer.length !== 4 || q.answer.some(index => index < 4 || index > 7)) persianInvalid++;
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
  const oldGetter = getOtherSubjectQuestions, oldOpen = isCourseLessonOpen, oldSubject = selectedOtherSubject;
  const options = ['مورد الف','مورد ب','مورد ج','مورد د','پاسخ ۱','پاسخ ۲','پاسخ ۳','پاسخ ۴'];
  const q = {type:'matching',kind:'جورکردنی آزمایشی',question:'هر مورد را با پاسخ درست جور کن.',pairs:options.slice(0,4),options,answer:[4,5,6,7],analysis:'تحلیل تستی'};
  getOtherSubjectQuestions = () => [q];
  isCourseLessonOpen = () => true;
  selectedOtherSubject = {id:'persian',name:'فارسی',lessons:[{id:1,title:'درس آزمایشی'}]};
  renderOtherSubjectActivity('practice');
  const selects = [...document.querySelectorAll('#otherSubjectActivityQuestions select[data-other-matching-index]')];
  const displayedOptions = selects[0] ? [...selects[0].options].slice(1).map(option => ({text:option.textContent.trim(),value:Number(option.value)})) : [];
  selects.forEach((select,i) => { select.value=String(i+4); select.dispatchEvent(new Event('change',{bubbles:true})); });
  const check = document.querySelector('#otherSubjectActivityQuestions [data-other-activity-check]');
  check?.click();
  const feedback = document.querySelector('#otherSubjectActivityQuestions [data-other-activity-feedback]')?.textContent || '';
  getOtherSubjectQuestions = oldGetter; isCourseLessonOpen = oldOpen; selectedOtherSubject = oldSubject;
  return {selectCount:selects.length,displayedOptions,feedback};
});
assert.equal(interaction.selectCount, 4, 'نمایش جورکردنی باید چهار فهرست انتخاب داشته باشد');
assert.deepEqual(interaction.displayedOptions.map(x => x.text), ['پاسخ ۱','پاسخ ۲','پاسخ ۳','پاسخ ۴'], 'گزینه‌های ستون راست باید فقط پاسخ‌ها باشند، نه موارد ستون چپ');
assert.deepEqual(interaction.displayedOptions.map(x => x.value), [4,5,6,7], 'شناسه‌های گزینه‌های جورکردنی باید با کلید پاسخ هماهنگ باشند');
assert.match(interaction.feedback, /آفرین|درست/, 'ثبت و تصحیح جورکردنی در صفحه کار نکرد');
assert.deepEqual(pageErrors, [], 'برنامه هنگام اجرا خطای JavaScript داد: ' + pageErrors.join(' | '));

console.log('Browser question checks passed:', JSON.stringify(sourceReport));
console.log('Matching interaction passed: four unique answer selectors, correct grading, and answer feedback.');
await browser.close();
