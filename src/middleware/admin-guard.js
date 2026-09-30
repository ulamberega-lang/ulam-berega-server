// הגנה מפני זיוף בקשה מאתר אחר (CSRF) ב-API של אתר הניהול: הדפדפן שולח את סיסמת הניהול אוטומטית,
// ולכן בקשה שמשנה נתונים חייבת להיות JSON (טופס רגיל מאתר זר לא יכול לשלוח JSON בלי אישור CORS),
// ואם הדפדפן שלח Origin - הוא חייב להיות של האתר עצמו.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function requireJson(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.headers.origin;
  if (origin) {
    let sameSite = false;
    try { sameSite = new URL(origin).host === req.headers.host; } catch { /* Origin לא תקין */ }
    if (!sameSite) return res.status(403).json({ error: 'הבקשה נחסמה: מקור לא מוכר' });
  }
  if (!req.is('json')) return res.status(415).json({ error: 'הבקשה חייבת להיות JSON' });
  next();
}
