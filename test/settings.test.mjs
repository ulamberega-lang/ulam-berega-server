// דף הגדרות השרת (משתני הסביבה ב-Render) באתר הניהול. הרצה: npm test
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, realFetch, adminHeaders, renderEnv, renderDeploys } from '../dev/sim/harness.mjs'; // ראשון: מחליף את Supabase
const { mask, isSecret } = await import('../src/services/render-env.js');

let app, admin;
before(async () => {
  app = await boot();
  admin = await adminHeaders(app.base);
  renderEnv.set('OWNER_PHONES', process.env.OWNER_PHONES); // כמו שהשרת עובד איתו עכשיו
  renderEnv.set('OPENAI_API_KEY', 'sk-abcdefghijklmnop1234');
  renderEnv.set('ADMIN_PASSWORD', 'pw');
  renderEnv.set('RENDER_API_KEY', 'rnd-key');
});
after(() => app.close());

const call = (path, { method = 'GET', body, headers = admin } = {}) =>
  realFetch(`${app.base}/admin/api/settings${path}`, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) }); // כמו הדף: תמיד גוף JSON
const json = async (res) => ({ status: res.status, body: await res.json() });

test('mask / isSecret', () => {
  assert.equal(mask('sk-abcdefghijklmnop1234'), '••••1234');
  assert.equal(mask('short'), '••••', 'ערך קצר - בלי תווים בכלל');
  assert.equal(mask(''), '');
  assert.ok(isSecret('OPENAI_API_KEY') && isSecret('ADMIN_PASSWORD') && isSecret('WA_ACCESS_TOKEN') && isSecret('WA_APP_SECRET'));
  assert.ok(!isSecret('OWNER_PHONES') && !isSecret('MAIL_FROM'));
});

test('רשימה: סוד לא יוצא לדפדפן, ו"ממתין" רק למה ששונה מהשרת הרץ', async () => {
  const { status, body } = await json(await call(''));
  assert.equal(status, 200);
  const by = Object.fromEntries(body.map((r) => [r.key, r]));
  assert.equal(by.OWNER_PHONES.value, process.env.OWNER_PHONES);
  assert.equal(by.OWNER_PHONES.pending, false);
  assert.equal(by.OPENAI_API_KEY.value, '••••1234');
  assert.ok(!JSON.stringify(body).includes('abcdefghijklmnop'), 'הערך הסודי לא נשלח');
  assert.equal(by.RENDER_API_KEY.locked, true);
  assert.equal(by.ADMIN_PASSWORD.required, true);
});

test('עדכון, הוספה ומחיקה; RENDER_API_KEY וחובה מוגנים; שם לא תקין נדחה', async () => {
  assert.equal((await call('/OWNER_PHONES', { method: 'PUT', body: { value: ' 0525645458,0501234567,0547654321 ' } })).status, 200);
  assert.equal(renderEnv.get('OWNER_PHONES'), '0525645458,0501234567,0547654321', 'רווחים בקצוות מוסרים');
  const list = (await json(await call(''))).body;
  assert.equal(list.find((r) => r.key === 'OWNER_PHONES').pending, true, 'ממתין להפעלה מחדש');

  assert.equal((await call('/NEW_SETTING', { method: 'PUT', body: { value: 'x' } })).status, 200);
  assert.equal((await call('/NEW_SETTING', { method: 'DELETE' })).status, 200);
  assert.ok(!renderEnv.has('NEW_SETTING'));

  assert.equal((await call('/RENDER_API_KEY', { method: 'PUT', body: { value: 'x' } })).status, 400);
  assert.equal((await call('/ADMIN_PASSWORD', { method: 'DELETE' })).status, 400);
  assert.ok(renderEnv.has('ADMIN_PASSWORD'));
  assert.equal((await call('/bad-name', { method: 'PUT', body: { value: 'x' } })).status, 400);
  assert.equal((await call('/MAIL_FROM', { method: 'PUT', body: { value: '  ' } })).status, 400, 'ערך ריק');
});

test('הפעלה מחדש, ובלי כניסה - 401', async () => {
  assert.equal((await call('/deploy', { method: 'POST' })).status, 200);
  assert.equal(renderDeploys.length, 1);
  assert.equal((await call('', { headers: {} })).status, 401);
  assert.equal((await realFetch(`${app.base}/admin/api/settings/MAIL_FROM`, { method: 'PUT', headers: { cookie: admin.cookie }, body: 'value=a' })).status, 415, 'בלי JSON נחסם');
});
