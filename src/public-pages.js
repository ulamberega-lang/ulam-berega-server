// הדפים הציבוריים: דף נחיתה, מדיניות פרטיות, הצהרת נגישות, דף הצ'אט וקישורי חיוג מהבוט. בלי גישה לנתונים, בלי סודות.
// משמש גם את השרת הראשי (app.js) וגם את השרת הציבורי הנפרד (public-server.js).
import express, { Router } from 'express';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { getCities, findCity, findHood, cityPage, hoodPage, cityPath, hoodPath, cityLinks } from './city-pages.js';

const publicSite = fileURLToPath(new URL('../public/site', import.meta.url));

export const publicPages = Router();

// כתובת האתר הראשית לקידום (canonical, מפת אתר)
const SITE_URL = process.env.SITE_URL || 'https://simcha-besicha.co.il';
const SITE_HOST = new URL(SITE_URL).hostname;

// כתובת כפולה (למשל onrender.com או www) לא תאונדקס, כדי שגוגל תציג רק את הדומיין הראשי. בפיתוח מקומי לא חל
publicPages.use((req, res, next) => {
  const host = req.hostname;
  if (host !== SITE_HOST && host !== 'localhost' && host !== '127.0.0.1') res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
});

publicPages.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /c/\nDisallow: /m/\nDisallow: /w\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
});
publicPages.get('/sitemap.xml', async (req, res) => {
  const paths = ['/', '/chat', '/privacy', '/accessibility', ...(await getCities()).flatMap((c) => [cityPath(c.city), ...c.hoods.map((n) => hoodPath(c.city, typeof n === 'string' ? n : n.name))])];
  const urls = paths.map((p) => `<url><loc>${SITE_URL}${p}</loc></url>`).join('');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>\n`);
});

// עיצוב ורקע משותפים (site.css, bg.js)
publicPages.use('/assets', express.static(`${publicSite}/assets`, { maxAge: '1h' }));
publicPages.get('/health', (req, res) => res.send('ok')); // לפינג נגד שינה של Render
// דף נחיתה ומדיניות פרטיות פומביים (נדרשים לפרופיל העסקי ולאפליקציה אצל Meta)
// דף הבית: בלוק קישורי הערים (קישור פנימי לדפי העיר) נוצר מהערים הפעילות
publicPages.get('/', async (req, res) => {
  const [html, cities] = await Promise.all([readFile(`${publicSite}/index.html`, 'utf8'), getCities()]);
  res.type('html').send(html.replace('<!--cities-->', cities.length ? `<section class="panel">\n    <h2>אולמות לפי עיר</h2>\n    <p>${cityLinks(cities)}</p>\n  </section>` : ''));
});
publicPages.get('/privacy', (req, res) => res.sendFile(`${publicSite}/privacy.html`));
publicPages.get('/accessibility', (req, res) => res.sendFile(`${publicSite}/accessibility.html`));
// הצ'אט באתר: הדף כאן, והבקשות שלו (/api/webchat) מגיעות לשרת הראשי (בשרת הציבורי הנפרד - דרך proxy)
publicPages.get('/chat', (req, res) => res.sendFile(`${publicSite}/chat.html`));
// דפי עיר ("אולם קטן בירושלים"): נוצרים מרשימת הערים הפעילות
// הנתיב מקודד כמו שהדפדפן שולח אותו
publicPages.get(`${encodeURI('/אולם-קטן-ב')}/:slug`, async (req, res) => {
  const c = await findCity(req.params.slug);
  if (!c) return res.status(404).type('text/plain').send('Not found');
  res.type('html').send(cityPage(c, await getCities()));
});
publicPages.get(`${encodeURI('/אולם-קטן-ב')}/:slug/:hood`, async (req, res) => {
  const c = await findCity(req.params.slug);
  const hood = c && findHood(c, req.params.hood);
  if (!hood) return res.status(404).type('text/plain').send('Not found');
  res.type('html').send(hoodPage(c, hood));
});
// קישור קצר לשיתוף בוואטסאפ (סטטוס, קבוצות): simcha-besicha.co.il/w → הצ'אט, ונספר כ"הקישור מהוואטסאפ שלך".
// 302 ולא 301, כדי שדפדפנים לא ישמרו את ההפניה לתמיד (אפשר לשנות את היעד בעתיד)
publicPages.get(['/w', '/w/'], (req, res) => res.redirect(302, '/chat?from=whatsapp'));
publicPages.get('/logo.png', (req, res) => res.sendFile(`${publicSite}/logo.png`));
// סמל האתר לגוגל (ריבוע, כפולה של 48): ב-/favicon.ico (גוגל בודקת גם שם) ובקובץ הקבוע
publicPages.get('/icon-192.png', (req, res) => res.sendFile(`${publicSite}/icon-192.png`));
publicPages.get('/favicon.ico', (req, res) => res.type('png').sendFile(`${publicSite}/icon-192.png`));

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
