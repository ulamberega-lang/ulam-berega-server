// קידום אתרים: robots, מפת אתר, canonical ו-JSON-LD
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFileSync } from 'node:fs';
import http from 'node:http';
const { publicPages } = await import('../src/public-pages.js');

const { setCitiesProvider, groupCities } = await import('../src/city-pages.js');
setCitiesProvider(async () => groupCities([
  { city_name: 'בני ברק', neighborhood_name: 'פרדס כץ / זכרון מאיר' },
  { city_name: 'ירושלים', neighborhood_name: 'גאולה' },
]));

const app = express().use(publicPages);
const srv = app.listen(0);
const base = `http://127.0.0.1:${srv.address().port}`;
test.after(() => srv.close());

test('robots.txt ומפת אתר', async () => {
  const r = await (await fetch(`${base}/robots.txt`)).text();
  assert.match(r, /Sitemap: https:\/\/simcha-besicha\.co\.il\/sitemap\.xml/);
  const s = await (await fetch(`${base}/sitemap.xml`)).text();
  assert.match(s, /<loc>https:\/\/simcha-besicha\.co\.il\/<\/loc>/);
});

test('דומיין לא ראשי לא מאונדקס', async () => {
  // fetch מתעלם מכותרת Host, לכן http.request
  const tag = await new Promise((ok, no) => {
    http.get(`${base}/`, { headers: { host: 'ulam-berega.onrender.com' } }, (res) => { res.resume(); ok(res.headers['x-robots-tag'] || ''); }).on('error', no);
  });
  assert.match(tag, /noindex/);
});

test('canonical ו-JSON-LD תקינים', () => {
  const h = readFileSync(new URL('../public/site/index.html', import.meta.url), 'utf8');
  assert.match(h, /rel="canonical" href="https:\/\/simcha-besicha\.co\.il\/"/);
  const m = h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(JSON.parse(m[1])['@graph'].length >= 3);
});

test('דף עיר: תוכן, canonical, מפת אתר ו-404', async () => {
  const r = await fetch(`${base}/${encodeURI('אולם-קטן-ב')}/${encodeURIComponent('בני-ברק')}`);
  assert.equal(r.status, 200);
  const h = await r.text();
  assert.match(h, /href="https:\/\/wa\.me\/97233130858"/);
  assert.match(h, /<h1>אולם קטן בבני ברק<\/h1>/);
  assert.match(h, /זכרון מאיר · פרדס כץ/);
  assert.match(h, /rel="canonical" href="https:\/\/simcha-besicha\.co\.il\/%D7/);
  const ld = h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(JSON.parse(ld[1])['@graph'].length === 2);
  const s = await (await fetch(`${base}/sitemap.xml`)).text();
  assert.match(s, /%D7%99%D7%A8%D7%95%D7%A9%D7%9C%D7%99%D7%9D/);
  assert.equal((await fetch(`${base}/${encodeURI('אולם-קטן-ב')}/${encodeURIComponent('אין')}`)).status, 404);
});

test('סמל האתר: favicon.ico וקובץ 192', async () => {
  for (const p of ['/favicon.ico', '/icon-192.png']) {
    const r = await fetch(`${base}${p}`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'image/png');
  }
  assert.match(readFileSync(new URL('../public/site/index.html', import.meta.url), 'utf8'), /rel="icon"[^>]*href="\/icon-192\.png"/);
});
