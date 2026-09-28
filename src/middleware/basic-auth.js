// הגנת סיסמה פשוטה (הדפדפן מציג חלון שם משתמש וסיסמה; שם המשתמש לא נבדק).
export function basicAuth(password) {
  return (req, res, next) => {
    if (!password) return res.status(503).send('יש להגדיר ADMIN_PASSWORD ב-Render');
    const encoded = (req.headers.authorization || '').split(' ')[1] || '';
    const given = Buffer.from(encoded, 'base64').toString().split(':').slice(1).join(':');
    if (given === password) return next();
    res.set('WWW-Authenticate', 'Basic realm="admin", charset="UTF-8"').status(401).send('נדרשת סיסמה');
  };
}
