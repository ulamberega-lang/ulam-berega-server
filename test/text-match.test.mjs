// בדיקות להתאמת שמות (מה שהמתקשר אמר מול רשימת ערים/שכונות/אולמות). הרצה: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { bestMatch, parseNumber } from '../src/lib/text-match.js';

const halls = ['היכל שמחה', 'היכל אור', 'גן עדן', 'אולם פאר', 'היכל כתר', 'שושנה'];

test('התאמה מדויקת', () => {
  assert.equal(bestMatch('היכל שמחה', halls), 'היכל שמחה');
  assert.equal(bestMatch('היכל  אור', halls), 'היכל אור'); // רווחים לא משנים
});

test('שם שלא ברשימה, ושונה משם קיים במילה אחת, לא נתפס כשם הקיים', () => {
  assert.equal(bestMatch('היכל משה', halls), null);   // לא "היכל שמחה"
  assert.equal(bestMatch('היכל מלך', halls), null);
});

test('טעות תמלול קטנה עדיין מתאימה', () => {
  assert.equal(bestMatch('גן עידן', halls), 'גן עדן');
  assert.equal(bestMatch('אולם פארר', halls), 'אולם פאר');
  assert.equal(bestMatch('היכל שמח', halls), 'היכל שמחה');
  assert.equal(bestMatch('רמות אשקול', ['רמות', 'רמות אשכול']), 'רמות אשכול');
});

test('השם מופיע בתוך מה שנאמר', () => {
  assert.equal(bestMatch('בירושלים', ['ירושלים', 'בית שמש']), 'ירושלים');
  assert.equal(bestMatch('אני רוצה בני ברק', ['בני ברק', 'ברק']), 'בני ברק'); // הארוך ביותר
});

test('חלק מהשם - רק אם הוא חד-משמעי', () => {
  assert.equal(bestMatch('מאה', ['מאה שערים', 'רמות']), 'מאה שערים');
  assert.equal(bestMatch('רמות', ['רמות אשכול', 'רמות שלמה']), null);
});

test('מספר מילים שונה (תמלול שפיצל או חיבר)', () => {
  assert.equal(bestMatch('בניברק', ['בני ברק', 'אלעד']), 'בני ברק');
});

test('קצר מדי או ריק - אין התאמה', () => {
  assert.equal(bestMatch('', halls), null);
  assert.equal(bestMatch('א', halls), null);
});

test('parseNumber', () => {
  assert.equal(parseNumber('בערך 1,200 או 1300'), 1200);
  assert.ok(Number.isNaN(parseNumber('אין מספר')));
});
