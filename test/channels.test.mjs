// סטטיסטיקה לפי ערוץ: רישום הודעות וואטסאפ, צ'אט באתר וכניסות לאתר, ו-API אתר הניהול. הרצה: npm test
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { boot, seedHalls, hallsChanged, sleep, db, realFetch, adminHeaders } from '../dev/sim/harness.mjs'; // ראשון: מחליף את Supabase
const { sourceOf } = await import('../src/routes/visit.js');
const { visitorId } = await import('../src/services/channel-log.js');
const { pageLabel } = await import('../public/admin/js/channels.js');

const hall = (name, extension, max, city, hood = null) => ({ name, extension, max_guests: max, city_name: city, neighborhood_name: hood, address: 'רחוב א 1', is_active: true });
let app;
before(async () => { seedHalls([hall('אולם ערוץ', '301', 200, 'צפת', 'מרכז')]); hallsChanged(); await sleep(50); app = await boot(); });
after(() => app.close());

const events = () => db.channel_events ?? [];
const post = (path, body, headers = {}) => realFetch(`${app.base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('וואטסאפ: כל הודעה נרשמת, "קיבל פרטי אולם" נרשם, ומספר הטלפון לא נשמר', async () => {
  const sign = (raw) => `sha256=${crypto.createHmac('sha256', 'wa-secret').update(raw).digest('hex')}`;
  const send = async (id, message) => {
    const raw = JSON.stringify({ entry: [{ changes: [{ value: { metadata: { phone_number_id: 'PID', display_phone_number: '021234567' }, messages: [{ id, from: '972501112233', ...message }] } }] }] });
    await post('/api/whatsapp', raw, { 'x-hub-signature-256': sign(raw) });
    await sleep(80);
  };
  const before = events().length;
  await send('ch.1', { type: 'text', text: { body: 'שלום' } });
  await send('ch.2', { type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'm:name', title: 'x' } } });
  await send('ch.3', { type: 'text', text: { body: 'אולם ערוץ בצפת' } }); // כרטיס אולם
  const mine = events().slice(before).filter((e) => e.channel === 'whatsapp');
  assert.equal(mine.filter((e) => e.kind === 'message').length, 3);
  assert.equal(mine.filter((e) => e.kind === 'found').length, 1);
  assert.ok(mine.every((e) => e.visitor === visitorId('972501112233') && e.visitor.length === 20));
  assert.ok(!JSON.stringify(mine).includes('501112233'), 'המספר עצמו לא נשמר');
});

test("צ'אט באתר: פתיחה לא נספרת כהודעה, הודעות ותוצאות נספרות", async () => {
  const sid = 'channel-test-session-01';
  const before = events().length;
  await post('/api/webchat', { sid });
  await post('/api/webchat', { sid, id: 'm:name' });
  await post('/api/webchat', { sid, text: 'אולם ערוץ בצפת' });
  await sleep(50);
  const mine = events().slice(before).filter((e) => e.channel === 'web');
  assert.deepEqual(mine.map((e) => e.kind), ['message', 'message', 'found']);
  assert.ok(mine.every((e) => e.visitor === visitorId(sid)));
});

test('כניסה לאתר: נרשם הדף (בעברית) והמקור; קלט לא תקין נדחה', async () => {
  const before = events().length;
  const ok = await post('/api/visit', { v: 'abcdef1234567890', p: encodeURI('/אולם-קטן-ב/צפת'), r: 'https://www.google.com/search?q=x' });
  assert.equal(ok.status, 204);
  await sleep(30);
  const e = events().at(-1);
  assert.equal(events().length, before + 1);
  assert.deepEqual([e.channel, e.kind, e.page, e.source], ['site', 'visit', '/אולם-קטן-ב/צפת', 'google.com']);
  assert.notEqual(e.visitor, 'abcdef1234567890');
  assert.equal((await post('/api/visit', { v: 'x', p: '/' })).status, 400);              // מזהה קצר מדי
  assert.equal((await post('/api/visit', { v: 'abcdef1234567890', p: 'http://evil' })).status, 400);
  assert.equal(events().length, before + 1);
});

test('כניסה לאתר: הגבלת קצב לכל מבקר', async () => {
  const codes = [];
  for (let i = 0; i < 32; i++) codes.push((await post('/api/visit', { v: 'ratelimitvisitor01', p: '/' })).status);
  assert.equal(codes.filter((c) => c === 204).length, 30);
  assert.equal(codes.at(-1), 429);
});

test("צ'אט באתר: נספר לפי מזהה הדפדפן, כך ששתי לשוניות (שתי שיחות) הן משתמש אחד", async () => {
  const before = events().length;
  for (const sid of ['two-tabs-session-0001', 'two-tabs-session-0002']) {
    await post('/api/webchat', { sid, v: 'browserid12345678' });
    await post('/api/webchat', { sid, v: 'browserid12345678', id: 'm:search' });
  }
  await post('/api/webchat', { sid: 'no-visitor-session-01' });
  await post('/api/webchat', { sid: 'no-visitor-session-01', v: 'x', id: 'm:search' }); // מזהה לא תקין: נספר לפי השיחה
  await sleep(50);
  const mine = events().slice(before).filter((e) => e.channel === 'web');
  assert.deepEqual(mine.map((e) => e.visitor), [visitorId('browserid12345678'), visitorId('browserid12345678'), visitorId('no-visitor-session-01')]);
});

test('כניסה לאתר: הגבלה לפי כתובת, גם עם מזהים אקראיים (מונע הצפה של הטבלה)', async () => {
  const before = events().length;
  let first429 = -1;
  for (let i = 0; i < 700 && first429 < 0; i++) {
    if ((await post('/api/visit', { v: `flood${String(i).padStart(6, '0')}`, p: '/' })).status === 429) first429 = i;
  }
  assert.ok(first429 > 0 && first429 <= 600, `נחסם אחרי ${first429}`);
  await sleep(50);
  assert.ok(events().length - before <= 600);
});

test('sourceOf: דומיין בלבד, מעבר באתר עצמו = internal, בלי מקור = ריק', () => {
  assert.equal(sourceOf('https://www.google.co.il/url?q=1'), 'google.co.il');
  assert.equal(sourceOf('https://simcha-besicha.co.il/chat'), 'internal');
  assert.equal(sourceOf('https://ulam-berega.onrender.com/'), 'internal');
  assert.equal(sourceOf(''), '');
  assert.equal(sourceOf('not a url'), '');
});

test('pageLabel: שמות קריאים לדפים', () => {
  assert.equal(pageLabel('/'), 'דף הבית');
  assert.equal(pageLabel('/chat'), "צ'אט באתר");
  assert.equal(pageLabel('/אולם-קטן-ב/בני-ברק'), 'דף עיר: בני ברק');
  assert.equal(pageLabel('/אולם-קטן-ב/ירושלים/רמות-אשכול'), 'דף שכונה: רמות אשכול, ירושלים');
  assert.equal(pageLabel('/משהו'), '/משהו');
});

test('אתר הניהול: /channels דורש כניסה ותאריכים, ומחזיר ימים, סיכום ופירוט', async () => {
  assert.equal((await realFetch(`${app.base}/admin/api/channels?from=2026-01-01&to=2026-01-31`)).status, 401);
  const headers = await adminHeaders(app.base);
  assert.equal((await realFetch(`${app.base}/admin/api/channels?from=x&to=y`, { headers })).status, 400);
  const res = await realFetch(`${app.base}/admin/api/channels?from=2026-01-01&to=2026-01-31`, { headers });
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(await res.json()).sort(), ['breakdown', 'days', 'totals']);
});
