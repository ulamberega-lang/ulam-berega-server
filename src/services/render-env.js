// עריכת משתני הסביבה של השירות הראשי ב-Render מאתר הניהול (public/admin/settings.html), דרך ה-API של Render.
// דורש RENDER_API_KEY (נוצר ב-Render: Account Settings → API Keys). מזהה השירות - RENDER_SERVICE_ID, ש-Render מגדיר בעצמו.
// שינוי נשמר ב-Render מיד, אבל נכנס לתוקף רק אחרי הפעלה מחדש (deploy), כי השרת קורא את המשתנים כשהוא עולה.
import { config } from '../config.js';
import { InputError } from '../lib/hall-input.js';

const API = 'https://api.render.com/v1';
// בלי המפתח הדף הזה מפסיק לעבוד, ואין דרך לתקן מכאן - נערך רק ב-Render
const LOCKED = ['RENDER_API_KEY'];
// בלעדיהם השרת לא עובד: אפשר לשנות, לא למחוק
const REQUIRED = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_PASSWORD'];
// ערך סודי לא נשלח לדפדפן: מוצגים רק 4 התווים האחרונים, ואפשר רק להחליף אותו
export const isSecret = (key) => /KEY|SECRET|TOKEN|PASSWORD/.test(key);
export const mask = (value) => (value.length >= 12 ? `••••${value.slice(-4)}` : value ? '••••' : '');
const KEY_RE = /^[A-Z_][A-Z0-9_]{0,63}$/;

async function render(path, { method = 'GET', body } = {}) {
  if (!config.renderApiKey) throw new InputError('RENDER_API_KEY לא מוגדר ב-Render (יוצרים ב-Account Settings → API Keys)', 400);
  if (!config.renderServiceId) throw new InputError('RENDER_SERVICE_ID לא מוגדר (Render מגדיר אותו בעצמו בשירות)', 400);
  const res = await fetch(`${API}/services/${config.renderServiceId}${path}`, {
    method,
    headers: { authorization: `Bearer ${config.renderApiKey}`, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
    signal: AbortSignal.timeout(15000),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new InputError(`Render: ${data?.message ?? res.status}`, 400);
  return data;
}

const keyOf = (key) => {
  if (!KEY_RE.test(String(key ?? ''))) throw new InputError('שם משתנה: אותיות לטיניות גדולות, ספרות וקו תחתון (למשל OWNER_PHONES)');
  if (LOCKED.includes(key)) throw new InputError(`${key} נערך רק ב-Render`);
  return key;
};

// כל המשתנים. pending = הערך ב-Render שונה ממה שהשרת עובד איתו עכשיו (ייכנס לתוקף אחרי הפעלה מחדש)
export async function list() {
  const rows = [];
  for (let cursor = ''; ;) {
    const page = await render(`/env-vars?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    rows.push(...page.map((p) => p.envVar));
    if (page.length < 100) break;
    cursor = page.at(-1).cursor;
  }
  return rows
    .map(({ key, value = '' }) => {
      const secret = isSecret(key);
      return { key, value: secret ? mask(value) : value, secret, locked: LOCKED.includes(key), required: REQUIRED.includes(key), pending: (process.env[key] ?? '') !== value };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

export async function set(key, value) {
  keyOf(key);
  const v = String(value ?? '').trim();
  if (!v) throw new InputError('ערך ריק. כדי להסיר משתנה יש כפתור מחיקה');
  if (v.length > 4000) throw new InputError('ערך ארוך מדי');
  await render(`/env-vars/${key}`, { method: 'PUT', body: { value: v } });
  console.log(`settings: עודכן ${key}`); // בלי הערך
  return { ok: true };
}

export async function remove(key) {
  keyOf(key);
  if (REQUIRED.includes(key)) throw new InputError(`${key} חובה לשרת. אפשר לשנות, לא למחוק`);
  await render(`/env-vars/${key}`, { method: 'DELETE' });
  console.log(`settings: נמחק ${key}`);
  return { ok: true };
}

// הפעלה מחדש: Render בונה ומפעיל את השרת עם הערכים החדשים (שיחות פעילות מתנתקות)
export async function deploy() {
  const d = await render('/deploys', { method: 'POST', body: {} });
  console.log('settings: הופעלה פריסה מחדש');
  return { ok: true, id: d?.id };
}
