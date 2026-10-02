// כניסה לאתר הניהול: דף כניסה משלנו (public/admin/login.html) ועוגייה חתומה, בלי שמירת מצב בשרת.
// העוגייה היא "תוקף.חתימה"; החתימה נגזרת מהסיסמה, ולכן החלפת הסיסמה ב-Render מנתקת את כולם.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE = 'ub_admin';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

// השוואה בזמן קבוע (על גיבוב, כדי שגם האורך לא ידלוף)
const digest = (s) => createHash('sha256').update(s).digest();
export const samePassword = (a, b) => timingSafeEqual(digest(a), digest(b));

const sign = (password, value) =>
  createHmac('sha256', digest(`ub-admin-session:${password}`)).update(value).digest('base64url');

export const makeToken = (password, now = Date.now()) => {
  const expires = String(now + SESSION_MS);
  return `${expires}.${sign(password, expires)}`;
};

export function validToken(password, token, now = Date.now()) {
  const [expires, signature = ''] = String(token ?? '').split('.');
  if (!/^\d+$/.test(expires) || Number(expires) <= now) return false;
  return samePassword(signature, sign(password, expires));
}

function readCookie(req, name) {
  const found = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((c) => c.startsWith(`${name}=`));
  return found?.slice(name.length + 1);
}

// הגבלת ניסיונות: אחרי MAX_FAILS סיסמאות שגויות מאותה כתובת בתוך חלון זמן, חוסמים עד סוף החלון
const MAX_FAILS = 10;
const WINDOW_MS = 10 * 60 * 1000;

export function adminAuth(password, now = () => Date.now()) {
  const fails = new Map(); // כתובת → { count, resetAt }

  const authed = (req) => Boolean(password) && validToken(password, readCookie(req, COOKIE), now());
  const cookie = (req, value, maxAgeSec) =>
    `${COOKIE}=${value}; Path=/admin; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${req.secure ? '; Secure' : ''}`;

  // כל מה שמתחת ל-/admin חוץ מדף הכניסה: בלי כניסה - דף הכניסה (או 401 ל-API, שהדף מנתב ממנו לכניסה)
  const guard = (req, res, next) => {
    if (!password) return res.status(503).send('יש להגדיר ADMIN_PASSWORD ב-Render');
    if (authed(req)) return next();
    if (req.path.startsWith('/api')) return res.status(401).json({ error: 'צריך להיכנס מחדש', login: true });
    return res.redirect('/admin/login');
  };

  // GET /admin/login: מי שכבר מחובר ממשיך לאתר
  const loginPage = (sendPage) => (req, res) => {
    if (!password) return res.status(503).send('יש להגדיר ADMIN_PASSWORD ב-Render');
    if (authed(req)) return res.redirect('/admin/');
    return sendPage(res);
  };

  // POST /admin/login: { password }
  const login = (req, res) => {
    if (!password) return res.status(503).json({ error: 'יש להגדיר ADMIN_PASSWORD ב-Render' });
    const key = req.ip || 'unknown';
    const entry = fails.get(key);
    if (entry && entry.resetAt <= now()) fails.delete(key);
    const current = fails.get(key);
    if (current && current.count >= MAX_FAILS) {
      res.set('Retry-After', String(Math.ceil((current.resetAt - now()) / 1000)));
      return res.status(429).json({ error: 'יותר מדי ניסיונות. נסה שוב בעוד כמה דקות' });
    }

    const given = typeof req.body?.password === 'string' ? req.body.password : '';
    if (given && samePassword(given, password)) {
      fails.delete(key);
      res.set('Set-Cookie', cookie(req, makeToken(password, now()), SESSION_MS / 1000));
      return res.json({ ok: true });
    }
    const attempt = current ?? { count: 0, resetAt: now() + WINDOW_MS };
    attempt.count++;
    fails.set(key, attempt);
    if (fails.size > 1000) for (const [k, v] of fails) if (v.resetAt <= now()) fails.delete(k);
    return res.status(401).json({ error: 'הסיסמה שגויה' });
  };

  // POST /admin/logout
  const logout = (req, res) => {
    res.set('Set-Cookie', cookie(req, '', 0));
    res.json({ ok: true });
  };

  return { guard, loginPage, login, logout };
}
