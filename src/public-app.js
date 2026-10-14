// השרת הציבורי הנפרד: רק הדפים הציבוריים, בלי ניהול, בלי ימות ובלי מסד נתונים.
// נפרס כשירות Render נפרד (start: node public-server.js) ומחובר לדומיין הציבורי.
import express from 'express';
import { publicPages } from './public-pages.js';
import { makeLimiter } from './lib/rate-limit.js';

// השרת הראשי (הצ'אט צריך את נתוני האולמות): כתובתו ב-MAIN_URL, ברירת מחדל הכתובת הנוכחית
const mainUrl = () => (process.env.MAIN_URL || 'https://ulam-berega.onrender.com').replace(/\/+$/, '');
const allowIp = makeLimiter(30, 60 * 1000); // הגבלה לפי כתובת המבקר (כאן היא ידועה; בשרת הראשי כולם מגיעים מכתובת אחת)
const allowVisit = makeLimiter(60, 60 * 1000); // ספירת כניסות לדפים

export function createPublicApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({ 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'", 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin' });
    next();
  });
  app.use(publicPages);
  // הצ'אט באתר וספירת הכניסות: מעבירים את הבקשה לשרת הראשי (בלי מסד נתונים כאן). רק JSON קטן, ורק הנתיבים האלה
  const proxy = (path, allow) => app.post(path, express.json({ limit: '10kb' }), async (req, res) => {
    if (!allow(req.ip)) return res.status(429).json({ error: 'too many requests' });
    try {
      const upstream = await fetch(`${mainUrl()}${path}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req.body ?? {}), signal: AbortSignal.timeout(20000),
      });
      res.status(upstream.status).type('json').send(await upstream.text());
    } catch (e) {
      console.error(`proxy ${path}:`, e.message);
      res.status(502).json({ error: 'upstream' });
    }
  });
  proxy('/api/webchat', allowIp);
  proxy('/api/visit', allowVisit);
  app.use((req, res) => res.status(404).type('text/plain').send('Not found')); // כל השאר (כולל /admin) כאילו לא קיים
  return app;
}
