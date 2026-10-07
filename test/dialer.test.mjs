// חייגן יוצא (/api/dialer): הרשאה, בדיקת מספר, ו-routing עם הזיהוי היוצא. הרצה: npm test
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, ivr, seedHalls, db, emails, hallsChanged, sleep } from '../dev/sim/harness.mjs'; // ראשון: מחליף את Supabase
const { routeCall } = await import('../src/lib/yemot.js');

let app;
before(async () => { seedHalls([]); hallsChanged(); app = await boot(); });
after(() => app.close());

const dial = (params) => ivr(app.base, { ApiCallId: 'D-1', ApiYFCallId: 'D-1', ApiPhone: '0525645458', ...params }, '/api/dialer');

test('חייגן: מספר מורשה - שאלה, ואחרי מספר תקין routing עם did בערך השישי ובסיום מתנתקים (hangup בערך העשירי)', async () => {
  const first = await dial({});
  assert.match(first.text, /^read=t-.*=v1,no,10,1,10,/);
  const routed = await dial({ v1: '0501234567' });
  assert.match(routed.text, /^id_list_message=t-.*&routing=0501234567,,,,,did,,,60,hangup$/);
});

test('חייגן: מספר לא תקין - הודעה ושאלה חוזרת במשתנה חדש, ואחר כך מספר תקין', async () => {
  const bad = await dial({ v1: '12345' });
  assert.match(bad.text, /=v2,no,/);
  assert.ok(bad.text.includes('t-'));
  const retry = await dial({ v1: '12345', v2: '0501234567' });
  assert.match(retry.text, /routing=0501234567,/);
  assert.match((await dial({ v1: '0525645458123' })).text, /=v2,/);   // יותר מדי ספרות
  assert.match((await dial({ v1: '972501234567' })).text, /=v2,/);   // בינלאומי לא מתקבל
});

test('חייגן: מספר לא מורשה או חסוי - ניתוק מיד בלי הקראה; פורמט 972 מורשה', async () => {
  assert.equal((await dial({ ApiPhone: '0529999999' })).text, 'go_to_folder=hangup');
  assert.equal((await dial({ ApiPhone: '' })).text, 'go_to_folder=hangup');
  assert.equal((await dial({ ApiPhone: '0529999999', v1: '0501234567' })).text, 'go_to_folder=hangup');
  assert.match((await dial({ ApiPhone: '972525645458' })).text, /^read=/);
});

test('חייגן: לא נרשם ב-leads_log ולא נשלח מייל', async () => {
  await dial({ v1: '0501234567' });
  await sleep(100);
  assert.equal((db.leads_log ?? []).length, 0);
  assert.equal(emails.length, 0);
});

test('routeCall: ההתנהגות הקיימת לא השתנתה, ו-yourId נכנס בערך השישי', () => {
  assert.equal(routeCall(['א'], '0501111111', 35, '/9'), 'id_list_message=t-א&routing=0501111111,,,,,,,,35,/9');
  assert.equal(routeCall(['א'], '0501111111', 60, 'hangup', 'did'), 'id_list_message=t-א&routing=0501111111,,,,,did,,,60,hangup');
});

test('כניסה מהתפריט הראשי: 7 ממספר בעל הפרויקט עוברת לשלוחה 7 ולא נרשמת ביומן; מכל מספר אחר - בחירה לא תקינה', async () => {
  const open = (id, phone) => ivr(app.base, { ApiCallId: id, ApiYFCallId: id, ApiPhone: phone });
  await open('MD-1', '0525645458');
  await sleep(100);
  assert.ok(db.leads_log.some((r) => r.yemot_call_id === 'MD-1'), 'פתיחת שיחה נרשמת');
  const owner = await ivr(app.base, { ApiCallId: 'MD-1', ApiYFCallId: 'MD-1', ApiPhone: '0525645458', v1: '7' });
  assert.equal(owner.text, 'go_to_folder=/7');
  await sleep(100);
  assert.ok(!db.leads_log.some((r) => r.yemot_call_id === 'MD-1'), 'השיחה נמחקה מהיומן');

  await open('MD-2', '0529999999');
  const other = await ivr(app.base, { ApiCallId: 'MD-2', ApiYFCallId: 'MD-2', ApiPhone: '0529999999', v1: '7' });
  assert.match(other.text, /^read=/);
  assert.ok(!other.text.includes('go_to_folder'));
  await open('MD-3', '');
  const hidden = await ivr(app.base, { ApiCallId: 'MD-3', ApiYFCallId: 'MD-3', v1: '7' });
  assert.ok(!hidden.text.includes('go_to_folder'));
});
