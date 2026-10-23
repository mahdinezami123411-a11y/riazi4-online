import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const input = process.argv[2];
const output = process.argv[3];
assert.ok(input && output, 'Usage: node instrument-test-page.mjs input.html output.html');
let html = await readFile(input, 'utf8');
// The app scope closes immediately before a later standalone UI IIFE.
 // Insert the bridge at the app-scope close, not the final close in the file,
 // so lexical helpers such as loadSourceQuestionBanks remain visible.
const loaderIndex = html.indexOf('async function loadSourceQuestionBanks');
const lastUiIife = html.lastIndexOf('(()=>{');
const marker = lastUiIife > 0 ? html.lastIndexOf('})();', lastUiIife) : -1;
assert.ok(loaderIndex >= 0 && marker > loaderIndex, 'Could not find the end of the app scope containing loadSourceQuestionBanks.');
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
      renderAnswerControls,
      isQuestionCorrect,
      renderOtherSubjectActivity,
      getCourseCatalog: subject => courseLessonCatalog(subject),
      refreshCourseLessonSelectors: () => typeof refreshAllCourseLessonSelectors === 'function' ? refreshAllCourseLessonSelectors() : null,
      renderPrintableLessonChoices: () => typeof window.__refreshPrintableExamLessonChoices === 'function' ? window.__refreshPrintableExamLessonChoices() : null,
      renderPlanetaryChapterRoute: () => typeof renderPlanetaryChapterRoute === 'function' ? renderPlanetaryChapterRoute() : null,
      renderChapterPicker: () => typeof renderChapterPicker === 'function' ? renderChapterPicker() : null,
      renderChapter: id => typeof renderChapter === 'function' ? renderChapter(id) : null,
      openOtherSubject: subject => typeof openOtherSubject === 'function' ? openOtherSubject(subject) : null,
      showStudentAppView: view => typeof showStudentAppView === 'function' ? showStudentAppView(view) : null,
      getProgressViewPlacement: () => ({
        homeInsideProfile: !!document.getElementById('studentHomeView')?.closest('#profileView'),
        reportInsideProfile: !!document.getElementById('studentReportView')?.closest('#profileView'),
        mapInsideHome: !!document.getElementById('studentDashboard')?.closest('#studentHomeView'),
        profileChartInsideProfile: !!document.querySelector('#profileView #profileProgressMount .profile-progress-chart')
      })
    };
  }
`;
html = html.slice(0, marker) + bridge + html.slice(marker);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, html, 'utf8');
console.log('Created temporary browser-test page with localhost-only test bridge.');
