// בדיקות שרת מלאות מול מסד נתונים מדומה: הודעות קוליות, יומן מיילים, API אולמות, זרימת שיחה. הרצה: npm test
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { hallsChanged, transcripts, chatReplies, boot, seedHalls, ivr, sleep, emails, yemotCalls, behavior, db, resetDb, realFetch, adminHeaders, strip } from '../dev/sim/harness.mjs';

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
  await ivr(app.base, other); await ivr(app.base, { ...other, v1: '2' }); await ivr(app.base, { ...other, v1: '2', v2: '101' });
  await sleep(100);
  await ivr(app.base, { ApiCallId: 'DF-2', ApiYFCallId: 'DF-2', DialStatus: 'NOANSWER', Phone: '0529999999' }, '/api/ivr/routing-status');
  await sleep(250);
  assert.equal(emails.length, 2);
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

  // הקשה 1: אמירת שם שכונה - האולמות בלי שכונה לא מושמעים
  const third = await toHoodQuestion('NH-3', 'גאולה');
  await third('1');                       // 1 = אמירה
  await third('/8/h.wav');                // → אישור שכונה
  const said = await third('1');
  assert.match(said, /אולם גאולה/);
  assert.doesNotMatch(said, /בלי שכונה/);
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
  chatReplies.push({ result: { 'בֵּית שֶׁמֶשׁ': { options: ['בֵּית שֶׁמֶשׁ'] } } });
  const keyed = await suggest([{ text: 'בית שמש', kind: 'city' }, { text: 'אלעד', kind: 'city' }]);
  assert.deepEqual(keyed[1].suggestions, { 'בית שמש': ['בֵּית שֶׁמֶשׁ'] });
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
