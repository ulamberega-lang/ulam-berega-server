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

// ---------- "אולם" לפני השם: עם או בלי ----------
const HALL_WORDS = ['אולם', 'אולמי', 'האולם', 'באולם'];

test('המתקשר אומר "אולם" והשם ב-DB בלי "אולם"', () => {
  const list = ['בית ישראל', 'פאר', 'שושנה'];
  assert.equal(bestMatch('אולם בית ישראל', list, { generic: HALL_WORDS }), 'בית ישראל');
  assert.equal(bestMatch('באולם בית ישראל', list, { generic: HALL_WORDS }), 'בית ישראל');
  assert.equal(bestMatch('בית ישראל', list, { generic: HALL_WORDS }), 'בית ישראל');
});

test('המתקשר לא אומר "אולם" והשם ב-DB כולל "אולם"', () => {
  const list = ['אולם בית ישראל', 'אולם פאר', 'שושנה'];
  assert.equal(bestMatch('בית ישראל', list, { generic: HALL_WORDS }), 'אולם בית ישראל');
  assert.equal(bestMatch('אולם בית ישראל', list, { generic: HALL_WORDS }), 'אולם בית ישראל');
  assert.equal(bestMatch('פאר', list, { generic: HALL_WORDS }), 'אולם פאר');
});

test('טעות תמלול קטנה יחד עם "אולם"', () => {
  assert.equal(bestMatch('אולם בית ישרל', ['בית ישראל', 'פאר'], { generic: HALL_WORDS }), 'בית ישראל');
  assert.equal(bestMatch('בית ישרל', ['אולם בית ישראל', 'פאר'], { generic: HALL_WORDS }), 'אולם בית ישראל');
});

test('שני אולמות שנבדלים רק ב"אולם" - שם מדויק מנצח', () => {
  const list = ['אולם שמחה', 'שמחה'];
  assert.equal(bestMatch('אולם שמחה', list, { generic: HALL_WORDS }), 'אולם שמחה');
  assert.equal(bestMatch('שמחה', list, { generic: HALL_WORDS }), 'שמחה');
});

test('"אולם" לא הופך שם לא קיים לשם קיים', () => {
  assert.equal(bestMatch('אולם היכל משה', ['היכל שמחה', 'פאר'], { generic: HALL_WORDS }), null);
  assert.equal(bestMatch('אולם', ['בית ישראל', 'פאר'], { generic: HALL_WORDS }), null);
});

test('שכונה ועיר: "בשכונת רמות" ו-"בעיר ירושלים"', () => {
  assert.equal(bestMatch('בשכונת רמות', ['רמות', 'גאולה'], { generic: ['שכונת', 'שכונה', 'השכונה', 'בשכונת', 'בשכונה'] }), 'רמות');
  assert.equal(bestMatch('בעיר ירושלים', ['ירושלים', 'בית שמש'], { generic: ['עיר', 'העיר', 'בעיר'] }), 'ירושלים');
});
