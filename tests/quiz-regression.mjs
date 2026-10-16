import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
console.log(`Static syntax check passed: ${compiled} inline script(s) compiled.`);
