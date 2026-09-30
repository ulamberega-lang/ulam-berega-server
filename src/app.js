// הרכבת שרת ה-Express: נתיבי ימות, אתר הניהול ובדיקת תקינות.
import express from 'express';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { ivrRouter } from './routes/ivr.js';
import { adminApi } from './routes/admin-api.js';
import { basicAuth } from './middleware/basic-auth.js';
import { requireJson } from './middleware/admin-guard.js';

const adminSite = fileURLToPath(new URL('../public/admin', import.meta.url));

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Render מאחורי פרוקסי: כתובת המבקר מגיעה מ-X-Forwarded-For (להגבלת ניסיונות סיסמה)
  app.use(express.json());

  app.get('/health', (req, res) => res.send('ok')); // לפינג נגד שינה של Render

  app.use('/api/ivr', express.urlencoded({ extended: true }), ivrRouter); // רק ימות שולחת טפסים

  app.use('/admin', basicAuth(config.adminPassword));
  app.use('/admin/api', requireJson, adminApi);
  app.use('/admin', express.static(adminSite));

  return app;
}
