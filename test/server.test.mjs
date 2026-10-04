// בדיקות שרת מלאות מול מסד נתונים מדומה: הודעות קוליות, יומן מיילים, API אולמות, זרימת שיחה. הרצה: npm test
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { boot, seedHalls, ivr, sleep, emails, yemotCalls, behavior, db, resetDb, realFetch, adminHeaders, strip } from '../dev/sim/harness.mjs';

// הייבוא של קוד השרת דינמי (אחרי ה-harness): ייבוא סטטי היה נטען לפני שהמסד המדומה נרשם
let app, headers, resetMailLimits;
const admin = (path, method = 'GET', body) => realFetch(app.base + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

const HALLS = [
  { name: 'אולם א', city_name: 'ירושלים', extension: '101', gabbai_email: 'a@x.com', gabbai_phone: '0501111111', max_guests: 300 },
  { name: 'אולם ב', city_name: 'ירושלים', extension: '102', gabbai_email: '', gabbai_phone: '0502222222', max_guests: 300 },
];

before(async () => { ({ resetMailLimits } = await import('../src/services/mailer.js')); seedHalls(HALLS); app = await boot(); headers = await adminHeaders(app.base); });
after(() => app.close());
beforeEach(() => { resetMailLimits(); resetDb(); seedHalls(HALLS); emails.length = 0; yemotCalls.length = 0; behavior.brevoStatus = 201; });

// שיחה שמועברת לאולם לפי מספר שלוחה (תפריט 2), ותוצאת חיוג מימות
async function callHall(id, ext, dialStatus = 'ANSWER') {
  const b = { ApiCallId: id, ApiYFCallId: id, ApiPhone: '0521234567' };
  await ivr(app.base, b); await ivr(app.base, { ...b, v1: '2' }); await ivr(app.base, { ...b, v1: '2', v2: ext });
  await sleep(100);
  await ivr(app.base, { ApiCallId: id, ApiYFCallId: id, DialStatus: dialStatus, AnswerTime: '12', Phone: '0521234567' }, '/api/ivr/routing-status');
  await sleep(250);
}

test('הודעה קולית: נשמרת בטבלה ונשלחת במייל עם קובץ מצורף', async () => {
  const b = { ApiCallId: 'VM-1', ApiYFCallId: 'VM-1', ApiPhone: '0521234567' };
  await ivr(app.base, b); await ivr(app.base, { ...b, v1: '5' });
  const done = await ivr(app.base, { ...b, v1: '5', v2: '/8/x.wav' });
  assert.match(strip(done.text), /ההודעה נשמרה/);
  await sleep(400);
  assert.equal(db.voicemails.length, 1);
  assert.equal(db.voicemails[0].caller_phone, '0521234567');
  assert.equal(db.voicemails[0].handled, false);
  assert.equal(emails.length, 1);
  assert.equal(emails[0].attachment[0].name, 'message.wav');
});

test('הודעה קולית: נרשמת גם כשההורדה מימות נכשלת (ההקלטה נשארת בימות)', async () => {
  const realFetchMock = globalThis.fetch;
  globalThis.fetch = async (url, opts) => (String(url).includes('DownloadFile') ? new Response('{"error":1}', { status: 200, headers: { 'content-type': 'application/json' } }) : realFetchMock(url, opts));
  try {
    const b = { ApiCallId: 'VM-2', ApiYFCallId: 'VM-2', ApiPhone: '0521234567' };
    await ivr(app.base, b); await ivr(app.base, { ...b, v1: '5' }); await ivr(app.base, { ...b, v1: '5', v2: '/8/x.wav' });
    await sleep(300);
  } finally { globalThis.fetch = realFetchMock; }
  assert.equal(db.voicemails.length, 1);
  assert.equal(emails.length, 0);
});

test('אתר הניהול: רשימה, השמעה (Range), סימון טופל ומחיקה', async () => {
  const row = db.voicemails.push({ id: 1, created_at: new Date().toISOString(), caller_phone: '0501', yemot_path: 'ivr2:/8/vm_1.wav', handled: false });
  assert.equal(row, 1);
  assert.equal((await realFetch(`${app.base}/admin/api/voicemails`)).status, 401);
  const list = await (await admin('/admin/api/voicemails')).json();
  assert.equal(list.length, 1);

  const full = await admin('/admin/api/voicemails/1/audio');
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('content-type'), 'audio/wav');
  const part = await realFetch(`${app.base}/admin/api/voicemails/1/audio`, { headers: { ...headers, range: 'bytes=0-1' } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), 'bytes 0-1/3');
  const bad = await realFetch(`${app.base}/admin/api/voicemails/1/audio`, { headers: { ...headers, range: 'bytes=9-12' } });
  assert.equal(bad.status, 416);
  // ההורדה השנייה והשלישית מגיעות מהמטמון: ימות נקראה פעם אחת בלבד
  assert.equal(yemotCalls.filter((u) => u.includes('DownloadFile')).length, 1);

  assert.equal((await (await admin('/admin/api/voicemails/1', 'PUT', { handled: true })).json()).handled, true);
  assert.equal((await realFetch(`${app.base}/admin/api/voicemails/1`, { method: 'DELETE', headers: { cookie: headers.cookie } })).status, 415);
  assert.equal((await admin('/admin/api/voicemails/1', 'DELETE', {})).status, 200);
  await sleep(100);
  assert.equal(db.voicemails.length, 0);
  assert.ok(yemotCalls.some((u) => u.includes('FileAction') && u.includes('delete')));
  assert.equal((await admin('/admin/api/voicemails/1', 'DELETE', {})).status, 404);
});

test('יומן מיילים: נשלח / אין כתובת / נכשל', async () => {
  await callHall('ML-1', '101');
  await callHall('ML-2', '102');
  assert.ok(db.mail_log.some((m) => m.status === 'sent' && m.to_email === 'a@x.com' && m.hall_name === 'אולם א'));
  assert.ok(db.mail_log.some((m) => m.status === 'no_email' && m.hall_name === 'אולם ב'));

  behavior.brevoStatus = 401;
  await callHall('ML-3', '101');
  const failed = db.mail_log.find((m) => m.status === 'failed');
  assert.ok(failed && /401/.test(failed.error), 'כשל בשליחה נרשם עם הסיבה');

  const list = await (await admin('/admin/api/mails')).json();
  assert.equal(list.length, 3);
  assert.equal((await realFetch(`${app.base}/admin/api/mails`)).status, 401);
});

test('יומן מיילים: מגבלת מיילים בשעה לאולם אחד', async () => {
  for (let i = 0; i < 32; i++) await callHall(`CAP-${i}`, '101');
  const sent = db.mail_log.filter((m) => m.status === 'sent').length;
  const capped = db.mail_log.filter((m) => m.status === 'failed' && /בשעה/.test(m.error)).length;
  assert.equal(sent, 30);
  assert.equal(capped, 2);
});

test('API אולמות: קלט לא תקין נדחה בהודעה ברורה, ושמירה תקינה מרעננת את הרשימה הטלפונית', async () => {
  const ok = { name: 'אולם ג', city_name: 'ירושלים', max_guests: 100, extension: '103', gabbai_phone: '0503333333' };
  const post = async (change) => { const r = await admin('/admin/api/halls', 'POST', { ...ok, ...change }); return [r.status, await r.json()]; };

  assert.equal((await post({ gabbai_email: 'not an email' }))[0], 400);
  const phone = await post({ gabbai_phone: 503333333 });            // מספר ב-JSON במקום מחרוזת
  assert.equal(phone[0], 400);
  assert.match(phone[1].error, /טלפון/);
  assert.equal((await post({ max_guests: 'abc' }))[0], 400);
  assert.equal((await post({ extension: '1' }))[0], 400);
  assert.equal((await post({ name: '' }))[0], 400);

  const [status, hall] = await post({ is_active: 'true', gabbai_email: ' b@x.com ' });
  assert.equal(status, 200);
  assert.equal(hall.is_active, true);
  assert.equal(hall.gabbai_email, 'b@x.com');

  assert.equal((await admin('/admin/api/halls/abc', 'PUT', { name: 'x' })).status, 400);
  assert.equal((await admin('/admin/api/halls/99999', 'PUT', { name: 'x' })).status, 404);
});

test('API: כותרות אבטחה, ותאריכים לא תקינים נדחים', async () => {
  const res = await realFetch(`${app.base}/health`);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await admin('/admin/api/stats/halls?from=x&to=y')).status, 400);
});

test('חיפוש לפי כמות: תפריט ראשי, בקשה כמות ושינוי כמות', async () => {
  const b = { ApiCallId: 'FL-1', ApiYFCallId: 'FL-1', ApiPhone: '0521234567' };
  const menu = await ivr(app.base, b);
  assert.match(strip(menu.text), /לחיפוש אולם הקש 1/);
  const guests = await ivr(app.base, { ...b, v1: '1' });
  assert.match(strip(guests.text), /כמות המוזמנים/);
  const ok = await ivr(app.base, { ...b, v1: '1', v2: '300' });
  assert.match(strip(ok.text), /הבנתי 300 מוזמנים/);
  const bad = await ivr(app.base, { ...b, v1: '1', v2: '300', v3: 'abc' });
  assert.match(strip(bad.text), /לא הבנתי/);
});

test('כניסה ישירה לשלוחה שלא קיימת, ושלוחה קיימת מועברת עם routing', async () => {
  const missing = await ivr(app.base, { ApiCallId: 'EX-1', ApiYFCallId: 'EX-1', ApiPhone: '0521234567', ext: '999' });
  assert.match(strip(missing.text), /שלוחה לא קיימת/);
  const routed = await ivr(app.base, { ApiCallId: 'EX-2', ApiYFCallId: 'EX-2', ApiPhone: '0521234567', ext: '101' });
  assert.match(routed.text, /routing=0501111111/);
});
