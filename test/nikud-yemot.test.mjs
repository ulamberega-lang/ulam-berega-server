// הקראה בעברית ובניית פקודות ימות. הרצה: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import '../dev/sim/harness.mjs';
import { withPrefix } from '../src/services/nikud.js';
import { clean, say, tapOptions, recordOptions, lastValue, readParams } from '../src/lib/yemot.js';
import { startOfIsraelDay } from '../src/lib/israel-day.js';
import { gematria, hebrewDate } from '../public/admin/js/hebrew-date.js';

// סימני ניקוד יכולים להיכתב בסדר שונה: משווים אחרי נרמול
const same = (actual, expected) => assert.equal(actual.normalize('NFC'), expected.normalize('NFC'));

test('withPrefix: חיריק לפני שווא ובלי דגש, אחרת שווא', () => {
  same(withPrefix('ב', 'יְרוּשָׁלַיִם'), 'בִּירוּשָׁלַיִם');
  same(withPrefix('ל', 'בְּנֵי בְּרַק'), 'לִבְנֵי בְּרַק');
  same(withPrefix('ל', 'רָמוֹת'), 'לְרָמוֹת');
});

test('clean: מסיר תווים שמפרידים בפקודות ימות', () => {
  assert.equal(clean('a.b,c-d=e&f"g\'h|i'), 'a b c d e f g h i');
  assert.equal(say(['שלום', false, null, 'עולם']), 't-שלום.t-עולם');
});

test('פקודות read: הקשה והקלטה', () => {
  assert.equal(tapOptions(1), '1,1,7,No,no,no,,');
  assert.equal(recordOptions('/8', 'f', 90, true), 'record,/8,f,no,yes,,,90');
  assert.equal(recordOptions('/8', 'f', 5), 'record,/8,f,no,,,,5');
});

test('readParams: ApiYFCallId קובע את מזהה השיחה; lastValue לוקח את האחרון', () => {
  assert.equal(readParams({ query: { ApiCallId: 'a', ApiYFCallId: 'b' }, body: {} }).ApiCallId, 'b');
  assert.equal(lastValue(['1', '2']), '2');
  assert.equal(lastValue(undefined), '');
});

test('תאריך עברי: גימטריה ותאריך', () => {
  assert.equal(gematria(17), 'י״ז');
  assert.equal(gematria(15), 'ט״ו');
  assert.equal(gematria(5787), 'תשפ״ז');
  assert.equal(gematria(30), 'ל׳');
  assert.match(hebrewDate('2026-09-23T12:00:00Z'), /^[א-ת׳״]+ ב[א-ת ]+ תשפ״ז$/);
});

test('startOfIsraelDay: חצות בשעון ישראל, בקיץ ובחורף', () => {
  assert.equal(startOfIsraelDay(new Date('2026-07-10T15:30:00Z')).toISOString(), '2026-07-09T21:00:00.000Z');  // קיץ (UTC+3)
  assert.equal(startOfIsraelDay(new Date('2026-01-10T15:30:00Z')).toISOString(), '2026-01-09T22:00:00.000Z');  // חורף (UTC+2)
  assert.equal(startOfIsraelDay(new Date('2026-07-09T20:59:59Z')).toISOString(), '2026-07-08T21:00:00.000Z');  // רגע לפני חצות
  assert.equal(startOfIsraelDay(new Date('2026-07-09T21:00:00Z')).toISOString(), '2026-07-09T21:00:00.000Z');  // בדיוק חצות
});
