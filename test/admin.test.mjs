// בדיקות לפונקציות הנקיות של אתר הניהול. הרצה: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestExtension, buildRows } from '../public/admin/js/data.js';
import { matches, escapeHtml, percent } from '../public/admin/js/dom.js';
import { sortBy } from '../public/admin/js/controls.js';

const hall = (city, extension) => ({ city_name: city, extension });

test('suggestExtension: בלי אולמות מתחילים ב-101', () => {
  assert.equal(suggestExtension([], 'ירושלים').ext, 101);
});

test('suggestExtension: שלוחות מתחת ל-100 לא נספרות', () => {
  assert.equal(suggestExtension([hall('ירושלים', '12'), hall('בני ברק', '13')], 'ירושלים').ext, 101);
});

test('suggestExtension: ממשיך אחרי הגבוהה בעיר', () => {
  const halls = [hall('ירושלים', '101'), hall('ירושלים', '102'), hall('ירושלים', '145')];
  assert.equal(suggestExtension(halls, 'ירושלים').ext, 146);
});

test('suggestExtension: קידומת שהוקלדה ידנית קובעת את המאה', () => {
  assert.equal(suggestExtension([hall('ירושלים', '150')], 'ירושלים').ext, 151);
});

test('suggestExtension: עיר חדשה מקבלת מאה פנויה', () => {
  const s = suggestExtension([hall('ירושלים', '101'), hall('אלעד', '301')], 'בני ברק');
  assert.equal(s.ext, 201);
  assert.equal(s.existing, false);
});

test('suggestExtension: סוף המאה ממלא חורים', () => {
  assert.equal(suggestExtension([hall('ירושלים', '199')], 'ירושלים').ext, 101);
});

test('suggestExtension: עיר ריקה - אין הצעה', () => {
  assert.equal(suggestExtension([hall('ירושלים', '101')], '  '), null);
});

test('matches: כל המילים חייבות להופיע', () => {
  assert.ok(matches('אולם פאר ירושלים גאולה', 'פאר גאולה'));
  assert.ok(!matches('אולם פאר ירושלים', 'פאר חיפה'));
});

test('matches: מתעלם מניקוד, גרשיים ומקפים', () => {
  assert.ok(matches('בְּנֵי בְּרַק', 'בני ברק'));
  assert.ok(matches('050-1234567', '0501234567'));
  assert.ok(matches('גן א"ב', 'גן אב'));
});

test('matches: חיפוש ריק מתאים לכל', () => {
  assert.ok(matches('כלשהו', '   '));
});

test('escapeHtml ו-percent', () => {
  assert.equal(escapeHtml('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.equal(percent(1, 4), '25%');
  assert.equal(percent(0, 0), '');
});

test('sortBy: מספרים יורד, ריקים בסוף, שוויון לפי tiebreak', () => {
  const list = [{ n: 'ב', v: 5 }, { n: 'א', v: 5 }, { n: 'ג', v: null }, { n: 'ד', v: 9 }];
  const out = sortBy(list, { key: 'v', dir: 'desc' }, { v: (x) => x.v }, (a, b) => a.n.localeCompare(b.n, 'he'));
  assert.deepEqual(out.map((x) => x.n), ['ד', 'א', 'ב', 'ג']);
});

test('sortBy: ריקים בסוף גם בסדר עולה, ולא משנה את הרשימה המקורית', () => {
  const list = [{ v: 3 }, { v: null }, { v: 1 }];
  const out = sortBy(list, { key: 'v', dir: 'asc' }, { v: (x) => x.v });
  assert.deepEqual(out.map((x) => x.v), [1, 3, null]);
  assert.deepEqual(list.map((x) => x.v), [3, null, 1]);
});

test('sortBy: טקסט בעברית', () => {
  const list = [{ s: 'תל אביב' }, { s: 'אלעד' }, { s: 'בני ברק' }];
  const out = sortBy(list, { key: 's', dir: 'asc' }, { s: (x) => x.s });
  assert.deepEqual(out.map((x) => x.s), ['אלעד', 'בני ברק', 'תל אביב']);
});

test('buildRows: מחבר סטטיסטיקה לאולם, ואחוז מענה ריק בלי שיחות', () => {
  const rows = buildRows(
    [{ id: 1, name: 'א', city_name: 'ע', extension: '101', is_active: true }, { id: 2, name: 'ב', city_name: 'ע', is_active: false }],
    [{ hall_id: 1, total: '10', answered: '4', unanswered: '6' }],
  );
  assert.equal(rows[0].total, 10);
  assert.equal(rows[0].rate, 0.4);
  assert.equal(rows[1].total, 0);
  assert.equal(rows[1].rate, null);
});
