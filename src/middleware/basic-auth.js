// הגנת סיסמה פשוטה (הדפדפן מציג חלון שם משתמש וסיסמה; שם המשתמש לא נבדק).
import { createHash, timingSafeEqual } from 'node:crypto';

// השוואה בזמן קבוע (על גיבוב, כדי שגם האורך לא ידלוף)
const digest = (s) => createHash('sha256').update(s).digest();
export const samePassword = (a, b) => timingSafeEqual(digest(a), digest(b));

// הגבלת ניסיונות: אחרי MAX_FAILS סיסמאות שגויות מאותה כתובת בתוך חלון זמן, חוסמים עד סוף החלון
const MAX_FAILS = 10;
const WINDOW_MS = 10 * 60 * 1000;

export function basicAuth(password, now = () => Date.now()) {
  const fails = new Map(); // כתובת → { count, resetAt }

  return (req, res, next) => {
    if (!password) return res.status(503).send('יש להגדיר ADMIN_PASSWORD ב-Render');

    const key = req.ip || 'unknown';
    const entry = fails.get(key);
    if (entry && entry.resetAt <= now()) fails.delete(key);
    const current = fails.get(key);
    if (current && current.count >= MAX_FAILS) {
      res.set('Retry-After', String(Math.ceil((current.resetAt - now()) / 1000)));
      return res.status(429).send('יותר מדי ניסיונות. נסה שוב בעוד כמה דקות');
    }

    const [scheme, encoded = ''] = (req.headers.authorization || '').split(' ');
    if (scheme.toLowerCase() === 'basic') {
      const given = Buffer.from(encoded, 'base64').toString().split(':').slice(1).join(':');
      if (samePassword(given, password)) {
        fails.delete(key);
        return next();
      }
      // בקשה בלי סיסמה (פתיחה ראשונה של הדפדפן) לא נספרת, רק סיסמה שגויה
      const attempt = current ?? { count: 0, resetAt: now() + WINDOW_MS };
      attempt.count++;
      fails.set(key, attempt);
      if (fails.size > 1000) for (const [k, v] of fails) if (v.resetAt <= now()) fails.delete(k);
    }
    res.set('WWW-Authenticate', 'Basic realm="admin", charset="UTF-8"').status(401).send('נדרשת סיסמה');
  };
}
