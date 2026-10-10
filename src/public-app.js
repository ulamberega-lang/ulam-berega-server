// השרת הציבורי הנפרד: רק הדפים הציבוריים, בלי ניהול, בלי ימות ובלי מסד נתונים.
// נפרס כשירות Render נפרד (start: node public-server.js) ומחובר לדומיין הציבורי.
import express from 'express';
import { publicPages } from './public-pages.js';

export function createPublicApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({ 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'", 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin' });
    next();
  });
  app.use(publicPages);
  app.use((req, res) => res.status(404).type('text/plain').send('Not found')); // כל השאר (כולל /admin) כאילו לא קיים
  return app;
}
