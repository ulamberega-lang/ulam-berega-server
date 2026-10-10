// הדפים הציבוריים: דף נחיתה, מדיניות פרטיות וקישורי חיוג מהבוט. בלי גישה לנתונים, בלי סודות.
// משמש גם את השרת הראשי (app.js) וגם את השרת הציבורי הנפרד (public-server.js).
import { Router } from 'express';
import { fileURLToPath } from 'node:url';

const publicSite = fileURLToPath(new URL('../public/site', import.meta.url));

export const publicPages = Router();

publicPages.get('/health', (req, res) => res.send('ok')); // לפינג נגד שינה של Render
// דף נחיתה ומדיניות פרטיות פומביים (נדרשים לפרופיל העסקי ולאפליקציה אצל Meta)
publicPages.get('/', (req, res) => res.sendFile(`${publicSite}/index.html`));
publicPages.get('/privacy', (req, res) => res.sendFile(`${publicSite}/privacy.html`));

// קישורי חיוג מהבוט (לאנדרואיד): דף קבוע שפותח את החייגן עם המספר והספרות. רק ספרות בכתובת, בלי גישה לנתונים
const dialHtml = (href, label) => `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>חיוג</title></head><body style="font-family:sans-serif;text-align:center;padding:48px 16px"><p><a href="${href}" style="display:inline-block;background:#128c7e;color:#fff;padding:18px 36px;border-radius:12px;font-size:20px;text-decoration:none">📞 ${label}</a></p><script>location.href=${JSON.stringify(href)}</script></body></html>`;
const localNum = (num) => num.replace(/^972/, '0'); // מספר מקומי (033130858), בלי +
// לאולם: מספר, השהיה אחת, ואז 3 (מספר שלוחה) והשלוחה והסולמית ברצף (ימות מקבלת הקשות מהר)
publicPages.get('/c/:num(\\d{8,15})/:ext(\\d{1,6})', (req, res) => {
  res.set('cache-control', 'no-store').type('html').send(dialHtml(`tel:${localNum(req.params.num)},3${req.params.ext}%23`, `חיוג לאולם (שלוחה ${req.params.ext})`));
});
// להודעה קולית: מספר ו-5
publicPages.get('/m/:num(\\d{8,15})', (req, res) => {
  res.set('cache-control', 'no-store').type('html').send(dialHtml(`tel:${localNum(req.params.num)},5`, 'הודעה קולית'));
});
