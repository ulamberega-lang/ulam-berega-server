// הרכבת שרת ה-Express: נתיבי ימות, אתר הניהול ובדיקת תקינות.
import express from 'express';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { ivrRouter } from './routes/ivr.js';
import { adminApi } from './routes/admin-api.js';
import { adminAuth } from './middleware/admin-auth.js';
import { dialerRouter } from './routes/dialer.js';
import { whatsappRouter } from './routes/whatsapp.js';
import { requireJson } from './middleware/admin-guard.js';

const adminSite = fileURLToPath(new URL('../public/admin', import.meta.url));
const publicSite = fileURLToPath(new URL('../public/site', import.meta.url));

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Render מאחורי פרוקסי: כתובת המבקר מגיעה מ-X-Forwarded-For (להגבלת ניסיונות סיסמה)
  app.use((req, res, next) => { // האתר לא יוטמע בדף זר (Clickjacking), והדפדפן לא מנחש סוגי קבצים
    res.set({ 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'", 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin' });
    next();
  });
  app.use('/api/whatsapp', whatsappRouter); // לפני express.json: החתימה מחושבת על הגוף הגולמי
  app.use(express.json());

  app.get('/health', (req, res) => res.send('ok')); // לפינג נגד שינה של Render
  // דף נחיתה ומדיניות פרטיות פומביים (נדרשים לפרופיל העסקי ולאפליקציה אצל Meta)
  app.get('/', (req, res) => res.sendFile(`${publicSite}/index.html`));
  app.get('/privacy', (req, res) => res.sendFile(`${publicSite}/privacy.html`));

  // קישור חיוג מהבוט (לאנדרואיד): דף קבוע שפותח את החייגן עם המספר, 2, השלוחה וסולמית. רק ספרות, בלי גישה לנתונים
  app.get('/c/:num(\\d{8,15})/:ext(\\d{1,6})', (req, res) => {
    const href = `tel:${req.params.num.replace(/^972/, '0')},2,${req.params.ext}%23`; // מספר מקומי (033130858), בלי +
    res.set('cache-control', 'no-store').type('html').send(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>חיוג לאולם</title></head><body style="font-family:sans-serif;text-align:center;padding:48px 16px"><p><a href="${href}" style="display:inline-block;background:#128c7e;color:#fff;padding:18px 36px;border-radius:12px;font-size:20px;text-decoration:none">📞 חיוג לאולם (שלוחה ${req.params.ext})</a></p><script>location.href=${JSON.stringify(href)}</script></body></html>`);
  });

  app.use('/api/ivr', express.urlencoded({ extended: true }), ivrRouter); // רק ימות שולחת טפסים

  app.use('/api/dialer', express.urlencoded({ extended: true }), dialerRouter); // חייגן יוצא: ימות שולחת טפסים

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
