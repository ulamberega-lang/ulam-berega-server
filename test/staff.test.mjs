// אתר ההוספה של העובד (/staff) ולשונית "לאישור" באתר הניהול. הרצה: npm test
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, seedHalls, hallsChanged, sleep, db, realFetch, adminHeaders, staffHeaders } from '../dev/sim/harness.mjs'; // ראשון: מחליף את Supabase
const { draftFromBody, hallFromBody } = await import('../src/lib/hall-input.js');

let app, staff, admin;
before(async () => {
  seedHalls([{ name: 'אולם קיים', extension: '101', max_guests: 200, city_name: 'ירושלים', neighborhood_name: 'גאולה', address: 'רחוב א 1', gabbai_phone: '0501234567', gabbai_email: 'secret@example.com', is_active: true }]);
  hallsChanged(); await sleep(50);
  app = await boot();
  staff = await staffHeaders(app.base);
  admin = await adminHeaders(app.base);
});
after(() => app.close());

const call = (path, { method = 'GET', headers, body } = {}) => realFetch(`${app.base}${path}`, { method, headers, redirect: 'manual', body: body == null ? undefined : JSON.stringify(body) });
const json = async (res) => ({ status: res.status, body: await res.json() });
const hall = { name: 'אולם חדש', city_name: 'בני ברק', neighborhood_name: 'רמת אלחנן', address: 'רחוב ב 2', max_guests: '120', gabbai_phone: '052-111-2233' };

test('draftFromBody: בלי שלוחה ובלי "פעיל", ושאר הבדיקות כמו באולם', () => {
  const d = draftFromBody({ ...hall, extension: '999', is_active: false });
  assert.deepEqual(d, { name: 'אולם חדש', city_name: 'בני ברק', neighborhood_name: 'רמת אלחנן', address: 'רחוב ב 2', max_guests: 120, gabbai_phone: '0521112233' });
  assert.throws(() => draftFromBody({ ...hall, gabbai_phone: '' }), /טלפון/);
  assert.throws(() => draftFromBody({ ...hall, max_guests: 'x' }), /מספר/);
  assert.throws(() => hallFromBody(hall, true), /שלוחה/); // באולם רגיל השלוחה עדיין חובה
});

test('כניסה: בלי כניסה - דף הכניסה או 401; עוגיית ניהול לא פותחת את אתר העובד ולהפך', async () => {
  assert.equal((await call('/staff/')).headers.get('location'), '/staff/login');
  assert.equal((await call('/staff/api/halls')).status, 401);
  assert.equal((await call('/staff/api/halls', { headers: { cookie: admin.cookie } })).status, 401);
  assert.equal((await call('/admin/api/halls', { headers: { cookie: staff.cookie } })).status, 401);
  assert.equal((await call('/staff/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: { password: 'pw' } })).status, 401, 'סיסמת הניהול לא נכנסת לאתר העובד');
  const page = await (await call('/staff/login')).text();
  assert.match(page, /fetch\('\/staff\/login'/);
  assert.doesNotMatch(page, /'\/admin\//);
  assert.equal((await call('/staff/', { headers: { cookie: staff.cookie } })).status, 200);
  assert.equal((await call('/staff/lib/import.js', { headers: { cookie: staff.cookie } })).status, 200);
});

test('העובד רואה את האולמות שבמערכת בלי מייל ושלוחה', async () => {
  const { status, body } = await json(await call('/staff/api/halls', { headers: staff }));
  assert.equal(status, 200);
  assert.equal(body[0].name, 'אולם קיים');
  assert.equal(body[0].gabbai_phone, '0501234567');
  assert.ok(!('gabbai_email' in body[0]) && !('extension' in body[0]));
});

test('הגשה, אישור בניהול (נוצר אולם), ואי אפשר לאשר פעמיים', async () => {
  const bad = await json(await call('/staff/api/submissions', { method: 'POST', headers: staff, body: { ...hall, gabbai_phone: '' } }));
  assert.equal(bad.status, 400);
  const sent = await json(await call('/staff/api/submissions', { method: 'POST', headers: staff, body: { ...hall, extension: '999', note: 'אולם יפה' } }));
  assert.equal(sent.status, 200);
  assert.equal(sent.body.status, 'pending');
  assert.equal(sent.body.note, 'אולם יפה');
  assert.ok(!('extension' in sent.body.data));
  assert.equal(db.halls.length, 1, 'ההגשה לא נכנסת למערכת');

  const pending = await json(await call('/admin/api/submissions', { headers: admin }));
  assert.deepEqual(pending.body.map((s) => s.id), [sent.body.id]);
  assert.equal((await call('/staff/api/submissions', { headers: admin })).status, 401);

  const noExt = await call(`/admin/api/submissions/${sent.body.id}/approve`, { method: 'POST', headers: admin, body: { ...sent.body.data, is_active: true } });
  assert.equal(noExt.status, 400, 'באישור השלוחה חובה');
  const ok = await json(await call(`/admin/api/submissions/${sent.body.id}/approve`, { method: 'POST', headers: admin, body: { ...sent.body.data, extension: '201', is_active: true } }));
  assert.equal(ok.status, 200);
  const created = db.halls.find((h) => h.extension === '201');
  assert.equal(created?.name, 'אולם חדש');
  const row = db.hall_submissions.find((s) => s.id === sent.body.id);
  assert.equal(row.status, 'approved');
  assert.equal(row.hall_id, created.id);
  const again = await json(await call(`/admin/api/submissions/${sent.body.id}/approve`, { method: 'POST', headers: admin, body: { ...sent.body.data, extension: '202', is_active: true } }));
  assert.equal(again.status, 400);
  assert.equal(db.halls.filter((h) => h.name === 'אולם חדש').length, 1);
  assert.deepEqual((await json(await call('/admin/api/submissions', { headers: admin }))).body, []);
});

test('דחייה עם סיבה (העובד רואה), וביטול הגשה שעוד ממתינה', async () => {
  const a = (await json(await call('/staff/api/submissions', { method: 'POST', headers: staff, body: { ...hall, name: 'אולם לדחייה' } }))).body;
  const b = (await json(await call('/staff/api/submissions', { method: 'POST', headers: staff, body: { ...hall, name: 'אולם לביטול' } }))).body;
  assert.equal((await call(`/admin/api/submissions/${a.id}/reject`, { method: 'POST', headers: admin, body: { reason: 'כבר קיים' } })).status, 200);
  const mine = (await json(await call('/staff/api/submissions', { headers: staff }))).body;
  assert.equal(mine.find((s) => s.id === a.id).reason, 'כבר קיים');
  assert.equal(mine.find((s) => s.id === a.id).status, 'rejected');
  assert.equal((await call(`/staff/api/submissions/${a.id}`, { method: 'DELETE', headers: staff, body: {} })).status, 404, 'הגשה שטופלה לא נמחקת');
  assert.equal((await call(`/staff/api/submissions/${b.id}`, { method: 'DELETE', headers: staff, body: {} })).status, 200);
  assert.ok(!db.hall_submissions.some((s) => s.id === b.id));
});
