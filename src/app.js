// הרכבת שרת ה-Express: נתיבי ימות, אתר הניהול ובדיקת תקינות.
import express from 'express';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { ivrRouter } from './routes/ivr.js';
import { adminApi } from './routes/admin-api.js';
import { adminAuth } from './middleware/admin-auth.js';
import { requireJson } from './middleware/admin-guard.js';

const adminSite = fileURLToPath(new URL('../public/admin', import.meta.url));

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Render מאחורי פרוקסי: כתובת המבקר מגיעה מ-X-Forwarded-For (להגבלת ניסיונות סיסמה)
  app.use(express.json());

  app.get('/health', (req, res) => res.send('ok')); // לפינג נגד שינה של Render

  app.use('/api/ivr', express.urlencoded({ extended: true }), ivrRouter); // רק ימות שולחת טפסים

  // כניסה: דף משלנו ועוגייה חתומה. דף הכניסה ופעולות הכניסה והיציאה פתוחים; כל השאר מוגן
  const auth = adminAuth(config.adminPassword);
  app.get('/admin/login', auth.loginPage((res) => res.sendFile(`${adminSite}/login.html`)));
  app.post('/admin/login', requireJson, auth.login);
  app.post('/admin/logout', requireJson, auth.logout);
  app.use('/admin', auth.guard);
  app.use('/admin/api', requireJson, adminApi);
  app.use('/admin', express.static(adminSite));

  return app;
}
