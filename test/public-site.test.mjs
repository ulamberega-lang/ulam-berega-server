// השרת הציבורי הנפרד: רק דפים ציבוריים, וכל השאר (ניהול, ימות, webhook) לא קיים שם.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createPublicApp } from '../src/public-app.js';

test('שרת ציבורי נפרד: דפים ציבוריים כן, ניהול וניתובי ימות לא', async () => {
  const server = createPublicApp().listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.match(await (await fetch(`${base}/`)).text(), /שמחה בשיחה/);
    assert.match(await (await fetch(`${base}/privacy`)).text(), /מדיניות פרטיות/);
    for (const path of ['/chat', '/accessibility', '/logo.png']) assert.equal((await fetch(`${base}${path}`)).status, 200, path);
    assert.match(await (await fetch(`${base}/c/033130858/77`)).text(), /tel:033130858,377%23/);
    assert.match(await (await fetch(`${base}/m/033130858`)).text(), /tel:033130858,5/);
    for (const path of ['/admin/', '/admin/login', '/admin/api/halls', '/api/ivr', '/api/whatsapp', '/api/dialer', '/c/abc/1']) {
      assert.equal((await fetch(`${base}${path}`)).status, 404, path);
    }
    assert.equal((await fetch(`${base}/`)).headers.get('x-powered-by'), null);
  } finally { server.close(); }
});

test('שרת ציבורי נפרד: הצאט מועבר לשרת הראשי, עם הגבלת קצב לפי כתובת', async () => {
  const seen = [];
  const main = http.createServer((req, res) => { // שרת ראשי מדומה
    let body = ''; req.on('data', (c) => { body += c; });
    req.on('end', () => { seen.push({ url: req.url, body }); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"messages":[]}'); });
  }).listen(0);
  process.env.MAIN_URL = `http://127.0.0.1:${main.address().port}/`;
  const server = createPublicApp().listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const post = (body) => fetch(`${base}/api/webchat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const res = await post({ sid: 'abcdefghijklmnop1', text: 'שלום' });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { messages: [] });
    assert.equal(seen[0].url, '/api/webchat');
    assert.match(seen[0].body, /שלום/);
    let last = 200;
    for (let i = 0; i < 40 && last === 200; i++) last = (await post({ sid: 'abcdefghijklmnop1' })).status;
    assert.equal(last, 429);   // יותר מ-30 בקשות בדקה מאותה כתובת
  } finally { server.close(); main.close(); delete process.env.MAIN_URL; }
});
