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

// ---------- תיקונים מסקירת הקוד ----------
import { csvCell } from '../public/admin/js/dom.js';
import { daysBetween, MAX_DAYS, preset, today, ALL_FROM } from '../public/admin/js/dates.js';
import { hallLabel } from '../public/admin/js/data.js';
import { requireJson } from '../src/middleware/admin-guard.js';
import { adminAuth, samePassword, makeToken, validToken } from '../src/middleware/admin-auth.js';

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
    redirect(url) { out.status = 302; out.redirect = url; return this; },
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

const withCookie = (password, now) => ({ headers: { cookie: `ub_admin=${makeToken(password, now)}` } });
const loginReq = (password, extra) => ({ method: 'POST', body: { password }, ...extra });

test('אימות כניסה: עוגייה תקפה עוברת; בלי עוגייה - הפניה לדף הכניסה, וב-API 401', () => {
  const { guard } = adminAuth('סוד');
  assert.ok(run(guard, { path: '/', ...withCookie('סוד') }).nexted);
  const page = run(guard, { path: '/index.html' });
  assert.equal(page.status, 302);
  assert.equal(page.redirect, '/admin/login');
  const api = run(guard, { path: '/api/halls' });
  assert.equal(api.status, 401);
  assert.equal(api.body.login, true);
  assert.equal(run(adminAuth('').guard, { path: '/' }).status, 503);
});

test('עוגיית כניסה: מזויפת, פגה או מסיסמה אחרת נדחית', () => {
  const now = 1_000_000;
  const token = makeToken('סוד', now);
  assert.ok(validToken('סוד', token, now + 1000));
  assert.ok(!validToken('סוד', token, now + 31 * 24 * 60 * 60 * 1000), 'פגה אחרי 30 יום');
  assert.ok(!validToken('אחרת', token, now + 1000), 'סיסמה שהוחלפה מנתקת');
  const [expires, sig] = token.split('.');
  assert.ok(!validToken('סוד', `${Number(expires) + 99999999}.${sig}`, now), 'הארכת תוקף ידנית');
  for (const bad of ['', 'abc', '123', '123.', undefined, null]) assert.ok(!validToken('סוד', bad, now));
});

test('כניסה: סיסמה נכונה מקבלת עוגייה מוגנת; שגויה או ריקה - 401 בלי עוגייה', () => {
  const { login } = adminAuth('סוד');
  const ok = run(login, loginReq('סוד', { secure: true }));
  assert.equal(ok.body.ok, true);
  assert.match(ok.headers['Set-Cookie'], /^ub_admin=\d+\.[\w-]+; Path=\/admin; HttpOnly; SameSite=Lax; Max-Age=\d+; Secure$/);
  for (const bad of ['שגוי', '', undefined]) {
    const r = run(login, loginReq(bad));
    assert.equal(r.status, 401);
    assert.equal(r.headers['Set-Cookie'], undefined);
  }
  assert.equal(run(adminAuth('').login, loginReq('x')).status, 503);
});

test('כניסה: אחרי 10 סיסמאות שגויות חוסמים, ובסיום החלון חוזרים לעבוד', () => {
  let time = 0;
  const { login } = adminAuth('סוד', () => time);
  for (let i = 0; i < 10; i++) assert.equal(run(login, loginReq('שגוי')).status, 401);
  const blocked = run(login, loginReq('סוד')); // גם סיסמה נכונה נחסמת בזמן החסימה
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers['Retry-After']) > 0);
  assert.ok(run(login, loginReq('סוד', { ip: '2.2.2.2' })).body.ok); // כתובת אחרת לא מושפעת
  time = 11 * 60 * 1000;
  assert.ok(run(login, loginReq('סוד')).body.ok);
});

test('דף הכניסה: מחובר מופנה לאתר, אחרת מוצג הדף; יציאה מוחקת את העוגייה', () => {
  const { loginPage, logout } = adminAuth('סוד');
  let sent = false;
  const page = loginPage(() => { sent = true; });
  run(page, {});
  assert.ok(sent);
  assert.equal(run(page, withCookie('סוד')).redirect, '/admin/');
  assert.match(run(logout, { method: 'POST' }).headers['Set-Cookie'], /^ub_admin=; .*Max-Age=0/);
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
