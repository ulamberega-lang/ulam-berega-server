// בדיקות לפונקציות הנקיות של אתר הניהול. הרצה: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestExtension, buildRows, HALL_GETTERS, byName } from '../public/admin/js/data.js';
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
    [{ hall_id: 1, total: '10', answered: '4', unanswered: '6', last_call: '2026-09-30T10:00:00Z' }],
  );
  assert.equal(rows[0].total, 10);
  assert.equal(rows[0].lastCall, Date.parse('2026-09-30T10:00:00Z'));
  assert.equal(rows[1].lastCall, null);
  assert.equal(rows[0].rate, 0.4);
  assert.equal(rows[1].total, 0);
  assert.equal(rows[1].rate, null);
});

// ---------- תיקונים מסקירת הקוד ----------
import { csvCell } from '../public/admin/js/dom.js';
import { daysBetween, MAX_DAYS, preset, today, ALL_FROM } from '../public/admin/js/dates.js';
import { hallLabel } from '../public/admin/js/data.js';
import { requireJson } from '../src/middleware/admin-guard.js';
import { basicAuth, samePassword } from '../src/middleware/basic-auth.js';

test('csvCell: מירכאות, ומניעת נוסחאות באקסל', () => {
  assert.equal(csvCell('שלום "עולם"'), '"שלום ""עולם"""');
  assert.equal(csvCell('=HYPERLINK("http://x")'), '"\'=HYPERLINK(""http://x"")"');
  for (const bad of ['+972501234567', '-1', '@cmd', '\tx']) assert.ok(csvCell(bad).startsWith('"\''), bad);
  assert.equal(csvCell('0501234567'), '"0501234567"');
  assert.equal(csvCell(null), '""');
});

test('daysBetween: כל הימים בטווח קצר, מהישן לחדש', () => {
  assert.deepEqual(daysBetween('2026-09-28', '2026-09-30'), ['2026-09-28', '2026-09-29', '2026-09-30']);
});

test('daysBetween: בטווח ארוך נשארים הימים החדשים', () => {
  const days = daysBetween('2024-01-01', '2025-12-31');
  assert.equal(days.length, MAX_DAYS);
  assert.equal(days.at(-1), '2025-12-31');
  assert.ok(days[0] > '2024-01-01');
});

test('hallLabel: אולמות עם אותו שם ועיר מקבלים תווית שונה', () => {
  const a = { name: 'פאר', city_name: 'ירושלים', extension: '101' };
  const b = { name: 'פאר', city_name: 'ירושלים', extension: '102' };
  assert.notEqual(hallLabel(a), hallLabel(b));
});

// ---------- בדיקות למידלוור (בלי Express: אובייקטים מזויפים) ----------
function run(middleware, req) {
  const out = { status: null, body: null, headers: {}, nexted: false };
  const res = {
    status(code) { out.status = code; return this; },
    json(body) { out.body = body; return this; },
    send(body) { out.body = body; return this; },
    set(name, value) { out.headers[name] = value; return this; },
  };
  middleware({ headers: {}, method: 'GET', ip: '1.1.1.1', is: () => false, ...req }, res, () => { out.nexted = true; });
  return out;
}
const jsonReq = (extra) => ({ method: 'POST', is: (t) => t === 'json', headers: { host: 'site.example' }, ...extra });

test('requireJson: GET עובר, טופס רגיל נחסם, JSON עובר', () => {
  assert.ok(run(requireJson, { method: 'GET' }).nexted);
  assert.equal(run(requireJson, { method: 'POST', headers: { host: 'site.example' } }).status, 415);
  assert.ok(run(requireJson, jsonReq()).nexted);
});

test('requireJson: Origin של אתר אחר נחסם, של האתר עצמו עובר', () => {
  assert.equal(run(requireJson, jsonReq({ headers: { host: 'site.example', origin: 'https://evil.example' } })).status, 403);
  assert.ok(run(requireJson, jsonReq({ headers: { host: 'site.example', origin: 'https://site.example' } })).nexted);
  assert.equal(run(requireJson, jsonReq({ headers: { host: 'site.example', origin: 'לא-כתובת' } })).status, 403);
});

const basic = (password) => ({ headers: { authorization: `Basic ${Buffer.from(`x:${password}`).toString('base64')}` } });

test('basicAuth: סיסמה נכונה עוברת, שגויה או חסרה נדחית', () => {
  const auth = basicAuth('סוד');
  assert.ok(run(auth, basic('סוד')).nexted);
  assert.equal(run(auth, basic('שגוי')).status, 401);
  assert.equal(run(auth, {}).status, 401);
  assert.equal(run(basicAuth(''), {}).status, 503);
});

test('basicAuth: אחרי 10 סיסמאות שגויות חוסמים, ובסיום החלון חוזרים לעבוד', () => {
  let time = 0;
  const auth = basicAuth('סוד', () => time);
  for (let i = 0; i < 10; i++) assert.equal(run(auth, basic('שגוי')).status, 401);
  const blocked = run(auth, basic('סוד')); // גם סיסמה נכונה נחסמת בזמן החסימה
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers['Retry-After']) > 0);
  assert.equal(run(auth, { ip: '2.2.2.2', ...basic('סוד') }).nexted, true); // כתובת אחרת לא מושפעת
  time = 11 * 60 * 1000;
  assert.ok(run(auth, basic('סוד')).nexted);
});

test('basicAuth: בקשה בלי סיסמה לא נספרת בהגבלה', () => {
  const auth = basicAuth('סוד');
  for (let i = 0; i < 30; i++) run(auth, {});
  assert.ok(run(auth, basic('סוד')).nexted);
});

test('samePassword', () => {
  assert.ok(samePassword('abc', 'abc'));
  assert.ok(!samePassword('abc', 'abd'));
  assert.ok(!samePassword('abc', 'abcd'));
});

test('preset תמיד: מתחילת המערכת ועד היום', () => {
  assert.deepEqual(preset('all'), { from: ALL_FROM, to: today() });
});

import { splitHoods } from '../public/admin/js/hoods.js';
test('splitHoods: כמה שכונות בשדה אחד', () => {
  assert.deepEqual(splitHoods('גאולה / בית וגן'), ['גאולה', 'בית וגן']);
  assert.deepEqual(splitHoods('א,ב / ג'), ['א', 'ב', 'ג']);
  assert.deepEqual(splitHoods('גאולה'), ['גאולה']);
  assert.deepEqual(splitHoods(null), []);
});

test('מיון לפי שיחה אחרונה: האחרונה ראשונה, בלי שיחות בסוף', () => {
  const rows = buildRows(
    [{ id: 1, name: 'א', city_name: 'ע' }, { id: 2, name: 'ב', city_name: 'ע' }, { id: 3, name: 'ג', city_name: 'ע' }],
    [{ hall_id: 1, total: '1', answered: '1', unanswered: '0', last_call: '2026-09-01T10:00:00Z' },
     { hall_id: 3, total: '1', answered: '1', unanswered: '0', last_call: '2026-09-20T10:00:00Z' }],
  );
  assert.deepEqual(sortBy(rows, { key: 'last', dir: 'desc' }, HALL_GETTERS, byName).map((r) => r.id), [3, 1, 2]);
});
