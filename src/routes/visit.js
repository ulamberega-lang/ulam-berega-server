// כניסה לדף באתר הציבורי (public/site/assets/visit.js שולח מהדפדפן). רק נספר, בלי מידע אישי:
// מזהה אקראי שהדפדפן יצר (מגובב בשרת), הדף, ומאיזה אתר הגיע (דומיין בלבד).
import { Router } from 'express';
import { track } from '../services/channel-log.js';
import { makeLimiter } from '../lib/rate-limit.js';

export const visitRouter = Router();

const allow = makeLimiter(30, 60 * 1000); // לכל מבקר
// לפי כתובת: גבוה, כי בשרת הציבורי הנפרד כל הכניסות מגיעות לכאן מכתובת אחת (ושם יש הגבלה לפי כתובת המבקר);
// מונע הצפה של הטבלה ממקור אחד עם מזהים אקראיים
const allowIp = makeLimiter(600, 60 * 1000);
const VISITOR = /^[A-Za-z0-9_-]{8,64}$/;
// דומיינים של האתר עצמו (מעבר בין דפים באתר): לא "מקור"
const OWN = /(^|\.)(simcha-besicha\.co\.il|simchabesicha\.co\.il|onrender\.com|localhost|127\.0\.0\.1)$/;

// הדף כפי שנראה בכתובת (עברית ולא קידוד אחוזים)
const pageOf = (p) => {
  const path = String(p ?? '').split(/[?#]/)[0].slice(0, 300);
  if (!path.startsWith('/')) return null;
  try { return decodeURIComponent(path).slice(0, 200); } catch { return path.slice(0, 200); }
};

// מאיפה הגיע: הדומיין בלבד (google.com), internal = דף אחר באתר, ריק = כניסה ישירה
export function sourceOf(referrer) {
  if (!referrer) return '';
  try {
    const host = new URL(String(referrer)).hostname.replace(/^www\./, '').toLowerCase();
    if (!host) return '';
    return OWN.test(host) ? 'internal' : host.slice(0, 100);
  } catch { return ''; }
}

visitRouter.post('/', (req, res) => {
  const { v, p, r } = req.body ?? {};
  const page = pageOf(p);
  if (typeof v !== 'string' || !VISITOR.test(v) || !page) return res.status(400).json({ error: 'bad request' });
  if (!allowIp(req.ip) || !allow(v)) return res.status(429).json({ error: 'too many requests' });
  track('site', 'visit', v, { page, source: sourceOf(r) });
  res.status(204).end();
});
