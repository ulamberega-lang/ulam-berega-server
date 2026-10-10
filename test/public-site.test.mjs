// השרת הציבורי הנפרד: רק דפים ציבוריים, וכל השאר (ניהול, ימות, webhook) לא קיים שם.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicApp } from '../src/public-app.js';

test('שרת ציבורי נפרד: דפים ציבוריים כן, ניהול וניתובי ימות לא', async () => {
  const server = createPublicApp().listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.match(await (await fetch(`${base}/`)).text(), /שמחה בשיחה/);
    assert.match(await (await fetch(`${base}/privacy`)).text(), /מדיניות פרטיות/);
    assert.match(await (await fetch(`${base}/c/033130858/77`)).text(), /tel:033130858,377%23/);
    assert.match(await (await fetch(`${base}/m/033130858`)).text(), /tel:033130858,5/);
    for (const path of ['/admin/', '/admin/login', '/admin/api/halls', '/api/ivr', '/api/whatsapp', '/api/dialer', '/c/abc/1']) {
      assert.equal((await fetch(`${base}${path}`)).status, 404, path);
    }
    assert.equal((await fetch(`${base}/`)).headers.get('x-powered-by'), null);
  } finally { server.close(); }
});
