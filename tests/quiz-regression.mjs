import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script\\b([^>]*)>([\\s\\S]*?)<\\/script\\s*>/gi)];
let compiled = 0;
for (let i = 0; i < scripts.length; i++) {
  const attrs = scripts[i][1] || '';
  const body = (scripts[i][2] || '').trim();
  if (/\\bsrc\\s*=/.test(attrs) || !body) continue;
  const type = (attrs.match(/\\btype\\s*=\\s*["']([^"']+)["']/i) || [])[1] || '';
  if (type && !/javascript|ecmascript|module/i.test(type)) continue;
  new vm.Script(body, { filename: `index.html:inline-script-${i + 1}` });
  compiled++;
}
assert.ok(compiled >= 1, 'هیچ اسکریپت جاوااسکریپتی در index.html پیدا نشد');
assert.match(html, /value="blank_mc"/, 'نوع جای‌خالی در فرم معلم ثبت نشده است');
assert.match(html, /value="matching"/, 'نوع جورکردنی در فرم معلم ثبت نشده است');
assert.match(html, /question_type.*matching|matching.*question_type/s, 'پشتیبانی جورکردنی در برنامه پیدا نشد');
console.log(`Static syntax check passed: ${compiled} inline script(s) compiled.`);
