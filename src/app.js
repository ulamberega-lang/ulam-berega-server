// הרכבת שרת ה-Express: נתיבי ימות, אתר הניהול ובדיקת תקינות.
import express from 'express';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { ivrRouter } from './routes/ivr.js';
import { adminApi } from './routes/admin-api.js';
import { basicAuth } from './middleware/basic-auth.js';

const adminSite = fileURLToPath(new URL('../public/admin', import.meta.url));

export function createApp() {
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  app.get('/health', (req, res) => res.send('ok')); // לפינג נגד שינה של Render

  app.use('/api/ivr', ivrRouter);

  app.use('/admin', basicAuth(config.adminPassword));
  app.use('/admin/api', adminApi);
  app.use('/admin', express.static(adminSite));

  return app;
}
