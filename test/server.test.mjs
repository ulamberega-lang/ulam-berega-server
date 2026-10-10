// בדיקות שרת מלאות מול מסד נתונים מדומה: הודעות קוליות, יומן מיילים, API אולמות, זרימת שיחה. הרצה: npm test
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { whatsappSent, hallsChanged, transcripts, chatReplies, boot, seedHalls, ivr, sleep, emails, yemotCalls, behavior, db, resetDb, realFetch, adminHeaders, strip } from '../dev/sim/harness.mjs';

let app, headers;
const admin = (path, method = 'GET', body) => realFetch(app.base + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

const HALLS = [
  { name: 'אולם א', city_name: 'ירושלים', extension: '101', gabbai_email: 'a@x.com', gabbai_phone: '0501111111', max_guests: 300 },
  { name: 'אולם ב', city_name: 'ירושלים', extension: '102', gabbai_email: '', gabbai_phone: '0502222222', max_guests: 300 },
];

before(async () => { seedHalls(HALLS); app = await boot(); headers = await adminHeaders(app.base); });
after(() => app.close());
beforeEach(() => { resetDb(); seedHalls(HALLS); emails.length = 0; yemotCalls.length = 0; behavior.brevoStatus = 201; });

// שיחה שמועברת לאולם לפי מספר שלוחה (תפריט 2), ותוצאת חיוג מימות
async function callHall(id, ext, dialStatus = 'ANSWER') {
  const b = { ApiCallId: id, ApiYFCallId: id, ApiPhone: '0521234567' };
  await ivr(app.base, b); await ivr(app.base, { ...b, v1: '3' }); await ivr(app.base, { ...b, v1: '3', v2: ext });
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

test('יומן מיילים: נשלח / נכשל; אולם בלי כתובת לא נרשם', async () => {
  await callHall('ML-1', '101');
  await callHall('ML-2', '102');
  assert.ok(db.mail_log.some((m) => m.status === 'sent' && m.to_email === 'a@x.com' && m.hall_name === 'אולם א'));
  assert.ok(!db.mail_log.some((m) => m.hall_name === 'אולם ב'), 'אולם בלי כתובת מייל לא נרשם ביומן');

  behavior.brevoStatus = 401;
  await callHall('ML-3', '101');
  const failed = db.mail_log.find((m) => m.status === 'failed');
  assert.ok(failed && /401/.test(failed.error), 'כשל בשליחה נרשם עם הסיבה');

  const list = await (await admin('/admin/api/mails')).json();
  assert.equal(list.length, 2);
  assert.equal((await realFetch(`${app.base}/admin/api/mails`)).status, 401);
});

test('מתקשר שהתקשר כמה פעמים ולא נענה: נשלח מייל אחד, ושיחה שנענתה מחדשת את הספירה', async () => {
  await callHall('RP-1', '101', 'NOANSWER');
  await callHall('RP-2', '101', 'NOANSWER');
  await callHall('RP-3', '101', 'NOANSWER');
  assert.equal(emails.length, 1, 'רק מייל אחד נשלח על שלוש שיחות שלא נענו');
  assert.deepEqual(db.mail_log.map((m) => m.status), ['sent', 'repeat', 'repeat']);

  await callHall('RP-4', '101', 'ANSWER');            // האולם ענה: נשלח מייל על שיחה שנענתה
  assert.equal(emails.length, 2);
  await callHall('RP-5', '101', 'NOANSWER');           // שוב לא נענה אחרי שיחה שנענתה: מייל חדש
  assert.equal(emails.length, 3);

  const list = await (await admin('/admin/api/mails')).json();
  assert.equal(list.filter((m) => m.status === 'repeat').length, 2);
});

test('מתקשרים שונים, או אולמות שונים: כל אחד מקבל מייל', async () => {
  await callHall('DF-1', '101', 'NOANSWER');
  const other = { ApiCallId: 'DF-2', ApiYFCallId: 'DF-2', ApiPhone: '0529999999' };      // מתקשר אחר, אותו אולם
  await ivr(app.base, other); await ivr(app.base, { ...other, v1: '3' }); await ivr(app.base, { ...other, v1: '3', v2: '101' });
  await sleep(100);
  await ivr(app.base, { ApiCallId: 'DF-2', ApiYFCallId: 'DF-2', DialStatus: 'NOANSWER', Phone: '0529999999' }, '/api/ivr/routing-status');
  await sleep(250);
  assert.equal(emails.length, 2);
});

test('שיחה שניסתה כמה אולמות: שורה לכל ניסיון ביומן, והניסיון הקודם נסגר', async () => {
  const b = { ApiCallId: 'AT-1', ApiYFCallId: 'AT-1', ApiPhone: '0521234567' };
  const status = (DialStatus) => ivr(app.base, { ApiCallId: 'AT-1', ApiYFCallId: 'AT-1', DialStatus, AnswerTime: '12', Phone: '0521234567' }, '/api/ivr/routing-status');
  await ivr(app.base, b); await ivr(app.base, { ...b, v1: '3' }); await ivr(app.base, { ...b, v1: '3', v2: '101' }); // ניסיון 1: אולם א
  await sleep(100);
  await status('BUSY');
  await ivr(app.base, { ApiCallId: 'AT-1', ApiYFCallId: 'AT-1' }, '/api/ivr/no-answer');                 // שלוחה 9: חזרה לתפריט
  await sleep(100);
  await ivr(app.base, { ...b, v1: '3', v2: '101' });                                                     // חזרה לתפריט הראשי (v3)
  await ivr(app.base, { ...b, v1: '3', v2: '101', v3: '3' });
  await ivr(app.base, { ...b, v1: '3', v2: '101', v3: '3', v4: '102' });                                  // ניסיון 2: אולם ב
  await sleep(100);
  await status('ANSWER');
  await sleep(250);

  const rows = db.leads_log.filter((r) => r.yemot_call_id === 'AT-1').sort((x, y) => x.attempt - y.attempt);
  assert.equal(rows.length, 2, 'שורה לכל ניסיון');
  const [first, second] = rows;
  assert.equal(first.hall_id, db.halls.find((h) => h.extension === '101').id);
  assert.equal(first.answered, false); assert.equal(first.dial_status, 'BUSY');
  assert.ok(first.ended_at, 'הניסיון הראשון נסגר כשנפתח השני');
  assert.equal(second.hall_id, db.halls.find((h) => h.extension === '102').id);
  assert.equal(second.answered, true); assert.equal(second.dial_status, 'ANSWER');
  assert.equal(emails.filter((m) => m.to[0].email === 'a@x.com').length, 1, 'מייל "לא נענתה" לאולם הראשון');
});

test('אולם לא ענה: "הקו תפוס" כשהתוצאה BUSY (גם אם הגיעה אחרי שלוחה 9), אחרת "אין מענה"', async () => {
  const route = async (id) => {
    const b = { ApiCallId: id, ApiYFCallId: id, ApiPhone: '0521234567' };
    await ivr(app.base, b); await ivr(app.base, { ...b, v1: '3' }); await ivr(app.base, { ...b, v1: '3', v2: '101' });
    await sleep(100);
  };
  const status = (id, DialStatus) => ivr(app.base, { ApiCallId: id, ApiYFCallId: id, DialStatus, Phone: '0521234567' }, '/api/ivr/routing-status');
  const noAnswer = async (id) => strip((await ivr(app.base, { ApiCallId: id, ApiYFCallId: id }, '/api/ivr/no-answer')).text);

  await route('BZ-1'); await status('BZ-1', 'BUSY'); await sleep(100);       // התוצאה הגיעה לפני שלוחה 9
  const early = await noAnswer('BZ-1');
  assert.match(early, /תפוס/); assert.match(early, /go_to_folder=\//);       // אומרים תפוס וחוזרים לאפשרויות

  await route('BZ-2');                                                          // התוצאה מגיעה מאוחר
  setTimeout(() => status('BZ-2', 'BUSY'), 400);
  assert.match(await noAnswer('BZ-2'), /תפוס/);

  await route('BZ-3'); await status('BZ-3', 'NOANSWER'); await sleep(100);
  const plain = await noAnswer('BZ-3');
  assert.match(plain, /אין מענה באולם/); assert.doesNotMatch(plain, /תפוס/);
});

test('דף נחיתה ומדיניות פרטיות פומביים (בלי כניסה)', async () => {
  const home = await realFetch(app.base + '/');
  assert.equal(home.status, 200);
  assert.match(await home.text(), /שמחה בשיחה/);
  const privacy = await realFetch(app.base + '/privacy');
  assert.equal(privacy.status, 200);
  assert.match(await privacy.text(), /מדיניות פרטיות/);
  const call = await realFetch(app.base + '/c/033130858/101');   // קישור חיוג מהבוט (אנדרואיד)
  assert.equal(call.status, 200);
  assert.match(await call.text(), /tel:033130858,3101%23/);
  assert.equal((await realFetch(app.base + '/c/abc/101')).status, 404);
  assert.match(await (await realFetch(app.base + '/m/033130858')).text(), /tel:033130858,5/);   // קישור להודעה קולית
});

test('הגדרת וואטסאפ: דורשת כניסה, בודקת קלט, וקוראת ל-Meta בלי לחשוף את הטוקן', async () => {
  const post = (path, body, authed = true) => realFetch(`${app.base}/admin/api/whatsapp/${path}`, { method: 'POST', headers: authed ? headers : { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post('status', { phoneId: '123456789' }, false)).status, 401);
  assert.equal((await post('status', { phoneId: 'abc' })).status, 400);
  assert.equal((await post('verify-code', { phoneId: '123456789', code: '12' })).status, 400);
  assert.equal((await post('register', { phoneId: '123456789', pin: '1234567' })).status, 400);

  const before = whatsappSent.length;
  const res = await post('request-code', { phoneId: '123456789', method: 'VOICE' });
  assert.equal(res.status, 200);
  const sent = whatsappSent.at(-1);
  assert.equal(whatsappSent.length, before + 1);
  assert.match(sent.url, /\/123456789\/request_code$/);
  assert.deepEqual(sent.body, { code_method: 'VOICE', language: 'he' });
  assert.ok(!(await res.text()).includes('wa-token'), 'הטוקן לא חוזר ללקוח');
  assert.equal((await post('register', { phoneId: '123456789', pin: '123456' })).status, 200);
  assert.deepEqual(whatsappSent.at(-1).body, { messaging_product: 'whatsapp', pin: '123456' });
  assert.equal((await post('waba', { wabaId: '555666777' })).status, 200);
  assert.match(whatsappSent.at(-1).url, /\/555666777\?fields=.*webhook_configuration/);
  assert.equal((await post('subscribe', { wabaId: 'x' })).status, 400);
  assert.equal((await post('subscribe', { wabaId: '555666777' })).status, 200);
  assert.match(whatsappSent.at(-1).url, /\/555666777\/subscribed_apps$/);
});

test('פרופיל העסק: קריאה, עדכון שדות בלבד, בדיקת קלט והעלאת תמונה', async () => {
  const post = (path, body) => realFetch(`${app.base}/admin/api/whatsapp/${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const phoneId = '123456789';
  assert.equal((await post('profile', { phoneId })).status, 200);
  assert.match(whatsappSent.at(-1).url, /\/123456789\/whatsapp_business_profile\?fields=about,address,description,email,profile_picture_url,websites,vertical$/);

  assert.equal((await post('profile/update', { phoneId })).status, 400);                              // בלי שדות
  assert.equal((await post('profile/update', { phoneId, about: '' })).status, 400);                   // אודות ריק
  assert.equal((await post('profile/update', { phoneId, about: 'x'.repeat(140) })).status, 400);
  assert.equal((await post('profile/update', { phoneId, email: 'לא מייל' })).status, 400);
  assert.equal((await post('profile/update', { phoneId, websites: ['a', 'b', 'c'] })).status, 400);
  assert.equal((await post('profile/update', { phoneId, websites: ['ftp://x'] })).status, 400);
  assert.equal((await post('profile/update', { phoneId, vertical: 'NOPE' })).status, 400);
  const ok = await post('profile/update', { phoneId, about: 'חיפוש אולמות', websites: ['https://ulam-berega.onrender.com', ''], vertical: 'EVENT_PLAN' });
  assert.equal(ok.status, 200);
  assert.deepEqual(whatsappSent.at(-1).body, { messaging_product: 'whatsapp', about: 'חיפוש אולמות', websites: ['https://ulam-berega.onrender.com'], vertical: 'EVENT_PLAN' });

  const image = Buffer.alloc(300 * 1024, 7).toString('base64');                                      // גדול מ-100KB: עובר בגלל המגבלה המיוחדת
  const before = whatsappSent.length;
  assert.equal((await post('profile/picture', { phoneId, appId: '555666777', mime: 'image/gif', image })).status, 400);
  assert.equal((await post('profile/picture', { phoneId, appId: 'x', mime: 'image/jpeg', image })).status, 400);
  const pic = await post('profile/picture', { phoneId, appId: '555666777', mime: 'image/jpeg', image });
  assert.equal(pic.status, 200);
  const calls = whatsappSent.slice(before);
  assert.match(calls[0].url, /\/555666777\/uploads\?file_length=307200&file_type=image%2Fjpeg/);
  assert.equal(calls[1].body.bytes, 307200);                                                          // הבייטים נשלחו כמות שהם
  assert.deepEqual(calls[2].body, { messaging_product: 'whatsapp', profile_picture_handle: 'HANDLE123' });
  const noAuth = await realFetch(`${app.base}/admin/api/whatsapp/profile/picture`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image }) });
  assert.equal(noAuth.status, 401);                                                                   // בלי כניסה - נדחה לפני ניתוח הגוף
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

test('רשימת שכונות: בסוף הרשימה "אולמות נוספים בעיר" (בלי שכונה); באמירת שם שכונה הם לא מושמעים', async () => {
  seedHalls([
    { name: 'אולם גאולה', city_name: 'ירושלים', neighborhood_name: 'גאולה', extension: '111', gabbai_phone: '0501111111', max_guests: 300 },
    { name: 'אולם רמות', city_name: 'ירושלים', neighborhood_name: 'רמות', extension: '112', gabbai_phone: '0501111112', max_guests: 300 },
    { name: 'אולם בלי שכונה', city_name: 'ירושלים', extension: '113', gabbai_phone: '0501111113', max_guests: 300 },
    { name: 'אולם בלי שכונה קטן', city_name: 'ירושלים', extension: '114', gabbai_phone: '0501111114', max_guests: 20 }, // לא מתאים ל-300
  ]);
  hallsChanged(); await sleep(100);
  // שיחה חדשה עד שאלת השכונה: תפריט 1, כמות 300, אישור, עיר (בדיבור), אישור. מחזיר פונקציה לשליחת התשובות הבאות (v6...)
  const toHoodQuestion = async (id, ...spoken) => {
    const b = { ApiCallId: id, ApiYFCallId: id, ApiPhone: '0521234567' };
    transcripts.push('ירושלים', ...spoken);
    let params = b;
    for (const answer of ['1', '300', '1', '/8/c.wav', '1']) { await ivr(app.base, params); params = { ...params, [`v${Object.keys(params).filter((k) => /^v\d+$/.test(k)).length + 1}`]: answer }; }
    await ivr(app.base, params);                                   // תשובת "אישור עיר" → שאלת השכונה (n=6)
    let n = 6;
    return async (answer) => { params = { ...params, [`v${n++}`]: answer }; return strip((await ivr(app.base, params)).text); };
  };

  // הקשה 2: רשימה. שתי שכונות ואחריהן "אולמות נוספים בעיר" (3)
  const list = await toHoodQuestion('NH-1');
  const menu = await list('2');
  assert.match(menu, /גאולה הקש 1/);
  assert.match(menu, /רמות הקש 2/);
  assert.match(menu, /לאולמות נוספים בעיר הקש 3/);
  const extra = await list('3');
  assert.match(extra, /נמצא אולם אחד/);
  assert.match(extra, /אולם בלי שכונה/);
  assert.doesNotMatch(extra, /אולם גאולה|בלי שכונה קטן/);
  assert.doesNotMatch(extra, /בשכונת/, 'אולם בלי שכונה לא מוקרא עם שכונה');

  // בחירת שכונה רגילה מהרשימה: בלי אולמות בלי שכונה
  const second = await toHoodQuestion('NH-2');
  await second('2');
  const hood = await second('1');
  assert.match(hood, /אולם גאולה/);
  assert.doesNotMatch(hood, /בלי שכונה/);
  assert.match(hood, /לאולמות נוספים בעיר הקש 6/, 'בתוצאות שכונה מוצעים אולמות בלי שכונה');
  const noHood = await second('6');
  assert.match(noHood, /אולם בלי שכונה/);
  assert.doesNotMatch(noHood, /אולם גאולה/);
  assert.doesNotMatch(noHood, /הקש 6/, 'באולמות בלי שכונה לא מציעים שוב');

  // הקשה 1: אמירת שם שכונה - האולמות בלי שכונה לא מושמעים
  const third = await toHoodQuestion('NH-3', 'גאולה');
  await third('1');                       // 1 = אמירה
  await third('/8/h.wav');                // → אישור שכונה
  const said = await third('1');
  assert.match(said, /אולם גאולה/);
  assert.doesNotMatch(said, /בלי שכונה/);
});

test('אולם עם כמה שמות (/): חיפוש לפי כל שם, ומוקרא השם שנאמר (באישור ובהעברה)', async () => {
  seedHalls([{ name: 'היכל משה / אולם דוד', city_name: 'ירושלים', extension: '121', gabbai_phone: '0501111121', max_guests: 300 }]);
  hallsChanged(); await sleep(100);
  for (const [id, said, other] of [['MN-1', 'דוד', /משה/], ['MN-2', 'היכל משה', /דוד/]]) {
    transcripts.push('ירושלים', said);
    let params = { ApiCallId: id, ApiYFCallId: id, ApiPhone: '0521234567' };
    const texts = [];
    for (const [i, answer] of [null, '2', '/8/c.wav', '1', '/8/h.wav', '1'].entries()) {
      if (answer !== null) params = { ...params, [`v${i}`]: answer };
      texts.push(strip((await ivr(app.base, params)).text));
    }
    const [confirm, routing] = texts.slice(-2);
    assert.match(confirm, new RegExp(said), `באישור נאמר "${said}"`);
    assert.doesNotMatch(confirm, other);
    assert.match(routing, /routing=0501111121/);
    assert.match(routing, new RegExp(`מעביר ל.*${said}`));
    assert.doesNotMatch(routing, other);
  }
});

test('ניקוד הקראה: הוספה, עדכון, מחיקה ובדיקות קלט, וההקראה בטלפון מתעדכנת מיד', async () => {
  const put = async (word, nikud) => { const r = await admin('/admin/api/pronunciations', 'PUT', { word, nikud }); return [r.status, await r.json()]; };
  assert.equal((await realFetch(`${app.base}/admin/api/pronunciations`)).status, 401);

  const [status, row] = await put('קריית ספר', 'קִרְיַת סֵפֶר');
  assert.equal(status, 200);
  assert.equal(row.word, 'קריית ספר');
  assert.equal(db.pronunciations.length, 1);

  // עדכון אותה מילה: שורה אחת, לא כפולה
  await put('קריית ספר', 'קִרְיַת סֶפֶר');
  assert.equal(db.pronunciations.length, 1);
  assert.equal(db.pronunciations[0].nikud, 'קִרְיַת סֶפֶר');

  // word נשמר בלי ניקוד גם אם הוקלד עם ניקוד
  assert.equal((await put('מֵאָה שְׁעָרִים', 'מֵאָה שְׁעָרִים'))[1].word, 'מאה שערים');

  assert.equal((await put('', 'אָ'))[0], 400);
  assert.equal((await put('מילה', 'מילה'))[0], 400, 'ניקוד זהה לשם בלי ניקוד נדחה');
  assert.equal((await put('מילה', 'abc'))[0], 400, 'בלי אותיות עבריות');

  const list = await (await admin('/admin/api/pronunciations')).json();
  assert.equal(list.length, 2);

  // ההקראה בטלפון משתמשת בניקוד שנשמר (בלי לחכות לרענון)
  const { withNikud } = await import('../src/services/nikud.js');
  await sleep(100);
  assert.equal(withNikud('קריית ספר'), 'קִרְיַת סֶפֶר');

  // שדה ריק = מחיקה
  assert.deepEqual(await (await admin('/admin/api/pronunciations', 'PUT', { word: 'קריית ספר', nikud: '' })).json(), { word: 'קריית ספר', nikud: '' });
  assert.equal((await put('מאה שערים', ''))[0], 200);
  await sleep(100);
  assert.equal(db.pronunciations.length, 0);
  assert.equal(withNikud('קריית ספר'), 'קריית ספר');
});

test('הצעת ניקוד מ-OpenAI: כמה אפשרויות, לא נשמרת, פסולות נזרקות, רענון לא חוזר על מה שהוצג, וכשל מוצג בהודעה', async () => {
  db.pronunciations.push({ word: 'שמחה', nikud: 'שִׂמְחָה' });                      // דוגמה מהטבלה
  const suggest = async (items, previous = {}) => { const r = await admin('/admin/api/pronunciations/suggest', 'POST', { items, previous }); return [r.status, await r.json()]; };

  chatReplies.push({ result: {
    'בית וגן': { pronunciation: 'beit vagan', options: ['בֵּית וָגָן', 'בַּיִת וָגָן', 'בֵּית וָגָן', 'בית וגן', 'x'] },   // כפולה, זהה לשם ובלי עברית - נזרקות
    'גאולה': { pronunciation: 'geula', options: ['גאולה'] },                                                       // רק זהה לשם: אין הצעה
    'רמות': 'רָמוֹת.',                                                                                              // מחרוזת אחת (גם זה מתקבל), הנקודה מוסרת
  } });
  const [status, body] = await suggest([{ text: 'בית וגן', kind: 'hood' }, { text: 'גאולה', kind: 'hood' }, { text: 'רמות', kind: 'hood' }]);
  assert.equal(status, 200);
  assert.deepEqual(body.suggestions, { 'בית וגן': ['בֵּית וָגָן', 'בַּיִת וָגָן'], 'רמות': ['רָמוֹת'] });
  assert.equal(db.pronunciations.length, 1, 'ההצעה לא נשמרת בטבלה');
  assert.match(body.reasons['גאולה'], /זהה לשם/, 'שם בלי הצעה תקינה מוסבר');

  // המודל החזיר מפתח עם ניקוד / בלי תשובה לשם: מזהים לפי השם בלי ניקוד, ושם בלי תשובה מוסבר
  chatReplies.push({ result: { 'בֵּית שֶׁמֶשׁ': { options: ['בֵּית שֶׁמֶשׁ'] }, 'אוהל ברוך (בית כנסת)': { options: ['אוֹהֶל בָּרוּךְ', 'אֹהֶל בָּרוּךְ'] } } });   // גם מפתח עם הסוג בסוגריים (כמו שהמודל החזיר בפועל)
  const keyed = await suggest([{ text: 'בית שמש', kind: 'city' }, { text: 'אלעד', kind: 'city' }, { text: 'אוהל ברוך', kind: 'synagogue' }]);
  assert.deepEqual(keyed[1].suggestions, { 'בית שמש': ['בֵּית שֶׁמֶשׁ'], 'אוהל ברוך': ['אוֹהֶל בָּרוּךְ', 'אֹהֶל בָּרוּךְ'] });
  assert.match(keyed[1].reasons['אלעד'], /לא החזיר תשובה/);

  // בקשה נוספת: מה שכבר הוצג נשלח למודל, ומה שהוא מחזיר שוב מסונן
  const realFetchMock = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (url, opts) => { if (String(url).includes('chat/completions')) sent.push(JSON.parse(opts.body)); return realFetchMock(url, opts); };
  try {
    chatReplies.push({ result: { 'בית וגן': { options: ['בֵּית וָגָן', 'בֵּית וְגָן', 'בֵּית וֶגָן'] } } });
    const again = await suggest([{ text: 'בית וגן', kind: 'hood' }], { 'בית וגן': ['בֵּית וָגָן', 'בַּיִת וָגָן'] });
    assert.deepEqual(again[1].suggestions['בית וגן'], ['בֵּית וְגָן', 'בֵּית וֶגָן'], 'אפשרות שכבר הוצגה לא חוזרת');
    assert.match(sent[0].messages[1].content, /בַּיִת וָגָן/, 'מה שהוצג נשלח למודל');
    assert.match(sent[0].messages[1].content, /שמחה → שִׂמְחָה/, 'דוגמה מהטבלה נשלחה');
    assert.equal(sent[0].temperature, 0.3);

    // דגם שדוחה טמפרטורה: ניסיון חוזר בלי ההגדרה
    sent.length = 0;
    chatReplies.push({ __status: 400 }, { result: { 'רמות': { options: ['רָמוֹת'] } } });
    const retry = await suggest([{ text: 'רמות', kind: 'hood' }]);
    assert.deepEqual(retry[1].suggestions, { 'רמות': ['רָמוֹת'] });
    assert.equal(sent.length, 2);
    assert.equal('temperature' in sent[1], false);
  } finally { globalThis.fetch = realFetchMock; }

  assert.equal((await suggest([]))[0], 400);
  const failure = await suggest([{ text: 'רמות', kind: 'hood' }]);        // אין תשובה מדומה: OpenAI "נכשל"
  assert.equal(failure[0], 502);
  assert.match(failure[1].error, /נכשלה/);
  assert.equal((await realFetch(`${app.base}/admin/api/pronunciations/suggest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
});

test('תפריט ראשי: 2 חיפוש לפי שם, 3 מספר שלוחה (הוחלפו)', async () => {
  const b = { ApiCallId: 'SW-1', ApiYFCallId: 'SW-1', ApiPhone: '0521234567' };
  const menu = strip((await ivr(app.base, b)).text);
  assert.match(menu, /לחיפוש לפי שם האולם הקש 2/);
  assert.match(menu, /מספר השלוחה של האולם הקש 3/);
  assert.match(strip((await ivr(app.base, { ...b, v1: '3' })).text), /הקש את מספר השלוחה/);                 // 3: שלוחה
  const c = { ApiCallId: 'SW-2', ApiYFCallId: 'SW-2', ApiPhone: '0521234567' };
  await ivr(app.base, c);
  const byName = strip((await ivr(app.base, { ...c, v1: '2' })).text);                                        // 2: שם (שואל עיר)
  assert.doesNotMatch(byName, /הקש את מספר השלוחה/);
  assert.match(byName, /עיר/);
});
