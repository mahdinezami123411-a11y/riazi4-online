import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const input = process.argv[2];
const output = process.argv[3];
assert.ok(input && output, 'Usage: node instrument-test-page.mjs input.html output.html');
let html = await readFile(input, 'utf8');
const marker = html.lastIndexOf('})();');
assert.ok(marker >= 0, 'Could not find the end of the app scope to attach the local test bridge.');
const bridge = `
  if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') {
    window.__quizTestApi = {
      loadSourceQuestionBanks,
      getSourceBank: () => sourceQuestionBanks,
      getSourceQuizzes: (subject, lesson) => getSourceQuestionBankQuizzes(subject, lesson),
      getPersianLessons: () => typeof persianLessons !== 'undefined' ? persianLessons : [],
      getPersianQuizzes: lesson => buildPersianLessonQuizzes(lesson),
      getPersianMatching: lesson => buildPersianMatchingQuizzes(lesson),
      normalize: value => sourceQuestionNormalize(value),
      getOtherSubjectQuestions: () => getOtherSubjectQuestions,
      setOtherSubjectQuestions: fn => { getOtherSubjectQuestions = fn; },
      isCourseLessonOpen: () => isCourseLessonOpen,
      setCourseLessonOpen: fn => { isCourseLessonOpen = fn; },
      getSelectedOtherSubject: () => selectedOtherSubject,
      setSelectedOtherSubject: value => { selectedOtherSubject = value; },
      renderOtherSubjectActivity
    };
  }
`;
html = html.slice(0, marker) + bridge + html.slice(marker);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, html, 'utf8');
console.log('Created temporary browser-test page with localhost-only test bridge.');
