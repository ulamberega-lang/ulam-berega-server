// חיפוש אולמות לפי כמות מוזמנים, שכונה וגודל (פונקציות נקיות). הרצה: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import '../dev/sim/harness.mjs'; // מחליף את Supabase במדומה לפני שהמודולים נטענים
import { pickHalls } from '../src/services/hall-directory.js';
import { guestMargin, guestCeiling } from '../src/repositories/halls.js';

const hall = (name, max, hood = null) => ({ name, max_guests: max, neighborhood_name: hood });
const names = (list) => list.map((h) => h.name);

test('guestMargin ו-guestCeiling: מרווח לפי גודל, ותקרה עד פי 1.5 ולפחות עוד 100', () => {
  assert.deepEqual([50, 100, 200, 400, 800].map(guestMargin), [30, 30, 50, 100, 200]);
  assert.equal(guestCeiling(100), 200);  // 150 קטן מ-100+100
  assert.equal(guestCeiling(400), 600);  // פי 1.5
});

test('pickHalls: אולם של 1000 לא מתאים ל-200 מוזמנים', () => {
  const found = pickHalls([hall('קטן', 180), hall('מתאים', 250), hall('ענק', 1000)], { guests: 200 });
  assert.deepEqual(names(found), ['קטן', 'מתאים']);
});

test('pickHalls: larger בלי גבול עליון, smaller מהגדול לקטן, near מהקרוב לכמות', () => {
  const all = [hall('א', 50), hall('ב', 100), hall('ג', 200), hall('ד', 800), hall('ה', 1200)];
  assert.deepEqual(names(pickHalls(all, { guests: 200, size: 'larger' })), ['ג', 'ד', 'ה']);
  assert.deepEqual(names(pickHalls(all, { guests: 200, size: 'smaller' })), ['ב', 'א']);
  assert.deepEqual(names(pickHalls(all, { guests: 200, size: 'near' })), ['ב', 'א', 'ד', 'ה']);
});

test('pickHalls: שכונה (גם אולם בכמה שכונות)', () => {
  const all = [hall('א', 200, 'גאולה'), hall('ב', 200, 'גאולה / בית וגן'), hall('ג', 200, 'רמות')];
  assert.deepEqual(names(pickHalls(all, { guests: 200, neighborhood: 'בית וגן' })), ['ב']);
  assert.deepEqual(names(pickHalls(all, { guests: 200, neighborhood: 'גאולה' })), ['א', 'ב']);
  assert.equal(pickHalls(all, { guests: 200 }).length, 3);
});
