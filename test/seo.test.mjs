// קידום אתרים: robots, מפת אתר, canonical ו-JSON-LD
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFileSync } from 'node:fs';
import http from 'node:http';
const { publicPages } = await import('../src/public-pages.js');

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
