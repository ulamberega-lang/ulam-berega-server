// בוט הוואטסאפ: זרימה (handleMessage) ו-webhook (חתימה, כפילויות, שליחה). הרצה: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { boot, seedHalls, sleep, hallsChanged, realFetch, whatsappSent } from '../dev/sim/harness.mjs'; // ראשון: מחליף את Supabase
const { handleMessage, greet, newSession } = await import('../src/whatsapp/flow.js');
const { toPayload } = await import('../src/whatsapp/api.js');
const { prettyPhone, allowMessage } = await import('../src/routes/whatsapp.js');

const hall = (name, extension, max, city, hood = null, extra = {}) => ({ name, extension, max_guests: max, min_guests: 0, city_name: city, neighborhood_name: hood, ...extra });
seedHalls([
  hall('אולם א', '101', 200, 'ירושלים', 'גאולה', { address: 'רחוב א 1' }),
  hall('אולם ב', '102', 250, 'ירושלים', 'רמות'),
  hall('בלי שכונה', '103', 220, 'ירושלים'),
  hall('ענק', '104', 900, 'ירושלים', 'גאולה'),
  hall('היכל משה', '201', 300, 'בני ברק', null, { synagogue_name: 'אוהל ברוך' }),
  hall('היכל שמחה', '202', 300, 'בני ברק'),
]);
hallsChanged();
await sleep(50);

const ctx = { dial: '02-1234567', link: 'https://x.test' };
const say = async (s, input) => handleMessage(s, typeof input === 'string' ? { text: input } : input, ctx);
const bodyOf = (msgs) => msgs.map((m) => m.text ?? m.body).join('\n');
const rowIds = (msgs) => msgs.flatMap((m) => (m.rows ?? m.buttons ?? []).map((r) => r[0]));

test('שפה: טקסט לטיני בהודעה הראשונה → אנגלית, עברית → עברית', () => {
  assert.equal(newSession('hello').lang, 'en');
  assert.equal(newSession('שלום').lang, 'he');
  assert.equal(newSession('').lang, 'he');
});

test('ברכה: ברכה ותפריט בשלושה כפתורים', async () => {
  const msgs = await greet(newSession('שלום'), ctx);
  assert.equal(msgs[0].kind, 'text');
  assert.deepEqual(rowIds(msgs), ['m:search', 'm:name', 'x:owner', 'x:lang']);
});

test('חיפוש לפי מוזמנים: כמות → עיר → שכונה → תוצאות עם מספרי שלוחה והוראת חיוג', async () => {
  const s = newSession('שלום');
  await say(s, { id: 'm:search' });
  assert.match(bodyOf(await say(s, '200')), /עיר/);          // אחרי הכמות שואלים עיר
  const hood = await say(s, 'ירושלים');
  assert.deepEqual(rowIds(hood), ['k:pick', 'k:all']);
  const res = await say(s, { id: 'k:all' });
  const text = bodyOf(res);
  assert.match(text, /אולם א/); assert.match(text, /אולם ב/); assert.match(text, /בלי שכונה/);
  assert.doesNotMatch(text, /ענק/);                          // 900 לא מתאים ל-200
  assert.match(text, /הקישו \*2\*, \*101\*, \*ו-#\*\./);
  assert.match(text, /או לחצו על הקישור: https:\/\/x\.test\/c\/021234567\/101/);
  assert.match(text, /רחוב א 1, שכונת גאולה, ירושלים/);               // כתובת ועיר בכל אולם
  assert.match(text, /02-1234567/);                          // המספר שאליו כתבו
  assert.equal(res.filter((m) => m.kind === 'text' && /לחיוג לאולם/.test(m.text)).length, 3); // הודעה נפרדת לכל אולם
  assert.ok(rowIds(res).includes('r:near'));                 // אולמות בגודל קרוב (ענק)
});

test('שכונה: כתיבת שם שכונה, ו"אולמות נוספים בעיר" ברשימה', async () => {
  const s = newSession('שלום');
  await say(s, { id: 'm:search' }); await say(s, '200'); await say(s, 'ירושלים');
  const t = bodyOf(await say(s, 'שכונת גאולה'));
  assert.match(t, /אולם א/); assert.doesNotMatch(t, /אולם ב/);

  const s2 = newSession('שלום');
  await say(s2, { id: 'm:search' }); await say(s2, '200'); await say(s2, 'ירושלים');
  const menu = await say(s2, { id: 'k:pick' });
  assert.ok(rowIds(menu).includes('k:extra'));
  assert.match(bodyOf(await say(s2, { id: 'k:extra' })), /בלי שכונה/);

  // בתוצאות שכונה מוצע "אולמות נוספים בעיר"; בכל העיר ובאולמות בלי שכונה - לא
  const s3 = newSession('שלום');
  await say(s3, { id: 'm:search' }); await say(s3, '200'); await say(s3, 'ירושלים');
  const byHood = await say(s3, 'שכונת גאולה');
  assert.ok(rowIds(byHood).includes('r:extra'));
  const extra = await say(s3, { id: 'r:extra' });
  assert.match(bodyOf(extra), /בלי שכונה/);
  assert.ok(!rowIds(extra).includes('r:extra'));
  const s4 = newSession('שלום');
  await say(s4, { id: 'm:search' }); await say(s4, '200'); await say(s4, 'ירושלים');
  assert.ok(!rowIds(await say(s4, { id: 'k:all' })).includes('r:extra'));
});

test('אין אולם בטווח: noFit עם קטנים יותר, ושינוי כמות ממשיך באותה עיר', async () => {
  const s = newSession('שלום');
  await say(s, { id: 'm:search' }); await say(s, '2000');
  const noFit = await say(s, 'ירושלים');
  assert.deepEqual(rowIds(noFit), ['f:smaller', 'f:guests']);   // אין גדולים יותר, יש קטנים
  assert.match(bodyOf(await say(s, { id: 'f:smaller' })), /ענק/);
  await say(s, { id: 'r:guests' });
  await say(s, '200');                                           // חוזרים ישר לתוצאות באותה עיר
  assert.equal(s.step, 'results');
  assert.equal(s.city, 'ירושלים');
});

test('חיפוש לפי שם: שם אולם ושם בית כנסת, ושם שלא קיים', async () => {
  const s = newSession('שלום');
  await say(s, { id: 'm:name' });
  await say(s, 'בני ברק');
  const card = await say(s, 'אוהל ברוך');
  assert.match(bodyOf(card), /היכל משה/);
  assert.match(bodyOf(card), /שלוחה|\*201\*/);
  const s2 = newSession('שלום');
  await say(s2, { id: 'm:name' }); await say(s2, 'בני ברק');
  const none = await say(s2, 'פלוני אלמוני');
  assert.deepEqual(rowIds(none), ['h:retry', 'h:list', 'm:menu']);
  const lst = await say(s2, { id: 'h:list' });
  assert.deepEqual(rowIds(lst).slice(0, 2), ['hl:0', 'hl:1']);
});

test('כרטיס אולם: כתובת, הוראת חיוג עם השלוחה וקישור', async () => {
  const s = newSession('שלום');
  await say(s, { id: 'm:name' }); await say(s, { id: 'h:list' });
  await say(s, 'ירושלים');
  const card = bodyOf(await say(s, 'אולם א'));
  assert.match(card, /אולם א/); assert.match(card, /רחוב א 1/); assert.match(card, /\*101\*/);
  assert.match(card, /הקישו \*2\*, \*101\*, \*ו-#\*\./);
  assert.match(card, /https:\/\/x\.test\/c\/021234567\/101/);
});

test('אנגלית: מעבר שפה מהתפריט, והטקסטים באנגלית', async () => {
  const s = newSession('שלום');
  const m = await say(s, { id: 'x:lang' });
  assert.equal(s.lang, 'en');
  assert.match(bodyOf(m), /What would you like/);
  await say(s, { id: 'm:search' });
  assert.match(bodyOf(await say(s, 'abc')), /Type the guest count/);
});

test('"תפריט" חוזר לתפריט בכל שלב, ובחירה לא תקינה לא שוברת', async () => {
  const s = newSession('שלום');
  await say(s, { id: 'm:search' }); await say(s, '200');
  assert.match(bodyOf(await say(s, { id: 'zzz' })), /לא הבנתי/);
  assert.deepEqual(rowIds(await say(s, 'תפריט')), ['m:search', 'm:name', 'x:owner', 'x:lang']);
});

test('toPayload: קיצור כותרות לפי מגבלות וואטסאפ', () => {
  const p = toPayload('1', { kind: 'list', body: 'b', button: 'x'.repeat(40), rows: [['a', 'y'.repeat(50), 'z'.repeat(100)]] });
  assert.equal(p.interactive.action.button.length, 20);
  const row = p.interactive.action.sections[0].rows[0];
  assert.equal(row.title.length, 24); assert.equal(row.description.length, 72);
  const b = toPayload('1', { kind: 'buttons', body: 'b', buttons: [['a', 'w'.repeat(30)]] });
  assert.equal(b.interactive.action.buttons[0].reply.title.length, 20);
});

// ---------- webhook ----------

const sign = (raw, secret = 'wa-secret') => `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;
const payload = (id, from, message) => JSON.stringify({ entry: [{ changes: [{ value: {
  metadata: { phone_number_id: 'PID', display_phone_number: '021234567' }, messages: [{ id, from, ...message }] } }] }] });

test('webhook: אימות כתובת, חתימה, שליחה וסינון כפילויות', async () => {
  const { base, close } = await boot();
  try {
    assert.equal((await realFetch(`${base}/api/whatsapp?hub.mode=subscribe&hub.verify_token=wa-verify&hub.challenge=123`)).status, 200);
    assert.equal(await (await realFetch(`${base}/api/whatsapp?hub.mode=subscribe&hub.verify_token=wa-verify&hub.challenge=123`)).text(), '123');
    assert.equal((await realFetch(`${base}/api/whatsapp?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=1`)).status, 403);

    const post = (raw, sig) => realFetch(`${base}/api/whatsapp`, { method: 'POST', headers: { 'content-type': 'application/json', ...(sig ? { 'x-hub-signature-256': sig } : {}) }, body: raw });
    const first = payload('wamid.1', '972501234567', { type: 'text', text: { body: 'שלום' } });
    assert.equal((await post(first)).status, 401);                 // בלי חתימה
    assert.equal((await post(first, sign(first, 'other'))).status, 401); // חתימה שגויה
    assert.equal(whatsappSent.length, 0);

    assert.equal((await post(first, sign(first))).status, 200);
    await sleep(100);
    assert.equal(whatsappSent.length, 2);                           // ברכה + תפריט
    assert.equal(whatsappSent[0].url.includes('/PID/messages'), true);
    assert.equal(whatsappSent[1].body.interactive.type, 'list');

    await post(first, sign(first));                                 // אותה הודעה שוב (Meta ניסתה שוב)
    await sleep(100);
    assert.equal(whatsappSent.length, 2);

    const click = payload('wamid.2', '972501234567', { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'm:search', title: 'x' } } });
    await post(click, sign(click));
    await sleep(100);
    assert.equal(whatsappSent.length, 3);
    assert.match(whatsappSent[2].body.text.body, /מוזמנים/);
  } finally { close(); }
});

test('אולם עם כמה שמות (/): חיפוש לפי כל שם', async () => {
  seedHalls([hall('היכל דוד / אולם רחל', '301', 200, 'חיפה')]);
  hallsChanged(); await sleep(100);
  for (const name of ['אולם רחל', 'היכל דוד']) {
    const s = newSession('שלום');
    await say(s, { id: 'm:name' }); await say(s, 'חיפה');
    const card = bodyOf(await say(s, name));
    assert.match(card, /היכל דוד \/ אולם רחל/, name);
  }
});

test('מספר המרכזייה מוצג בפורמט מקומי (ליחיד לחיצה בוואטסאפ)', () => {
  assert.equal(prettyPhone('97233130858'), '03-313-0858');
  assert.equal(prettyPhone('972525645458'), '052-564-5458');
});

test('הגבלת קצב: 20 הודעות בדקה למשתמש, אחר כך מתעלמים, ובדקה הבאה חוזר לעבוד', () => {
  const t0 = 1_000_000;
  for (let i = 0; i < 20; i++) assert.equal(allowMessage('rate-user', t0 + i), true);
  assert.equal(allowMessage('rate-user', t0 + 100), false);
  assert.equal(allowMessage('other-user', t0 + 100), true);   // משתמש אחר לא מושפע
  assert.equal(allowMessage('rate-user', t0 + 61_000), true);
});

test('להוספת אולם: נוסח המייל, והודעה קולית עם מספר וקישור', async () => {
  const s = newSession('שלום');
  const out = bodyOf(await say(s, { id: 'x:owner' }));
  assert.match(out, /simchabesicha@gmail\.com\nרשמו את שם האולם,\nמספר פלאפון להזמנה,/);
  assert.match(out, /התקשרו למספר 02-1234567 והקישו 5, או לחצו על הקישור: https:\/\/x\.test\/m\/021234567/);
});
