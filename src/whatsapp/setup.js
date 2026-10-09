// הגדרת מספר הוואטסאפ מול Meta מאתר הניהול: בדיקת מצב, בקשת קוד אימות, אימות ורישום (הטוקן נשאר בשרת).
import { config } from '../config.js';
import { GRAPH } from './api.js';
import { InputError } from '../lib/hall-input.js';

const STATUS_FIELDS = 'display_phone_number,verified_name,status,name_status,code_verification_status,quality_rating,platform_type,account_mode,webhook_configuration';

async function graph(path, { method = 'POST', body } = {}) {
  if (!config.waToken) throw new InputError('WA_ACCESS_TOKEN לא מוגדר ב-Render', 400);
  const res = await fetch(`${GRAPH}/${path}`, {
    method,
    headers: { authorization: `Bearer ${config.waToken}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    signal: AbortSignal.timeout(15000),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new InputError(`Meta: ${data.error?.message ?? res.status}${data.error?.error_user_msg ? ` (${data.error.error_user_msg})` : ''}`, 400);
  return data;
}

const idOf = (v) => {
  if (!/^\d{6,20}$/.test(String(v ?? ''))) throw new InputError('מזהה מספר הטלפון לא תקין (ספרות בלבד)');
  return String(v);
};
const sixDigits = (v, what) => {
  if (!/^\d{6}$/.test(String(v ?? ''))) throw new InputError(`${what}: בדיוק 6 ספרות`);
  return String(v);
};

// האפליקציות שמנויות להודעות של חשבון הוואטסאפ העסקי (WABA). בלי מנוי Meta לא שולחת הודעות ל-webhook
// פרטי החשבון העסקי: כתובת webhook שמוגדרת עליו (override) גוברת על זו שבאפליקציה
export const wabaStatus = (wabaId) =>
  graph(`${idOf(wabaId)}?fields=name,account_review_status,business_verification_status,webhook_configuration`, { method: 'GET' });

export const subscribedApps = (wabaId) => graph(`${idOf(wabaId)}/subscribed_apps`, { method: 'GET' });
export const subscribeApp = (wabaId) => graph(`${idOf(wabaId)}/subscribed_apps`);

export const phoneStatus = (phoneId) => graph(`${idOf(phoneId)}?fields=${STATUS_FIELDS}`, { method: 'GET' });

export const requestCode = (phoneId, method) =>
  graph(`${idOf(phoneId)}/request_code`, { body: { code_method: method === 'SMS' ? 'SMS' : 'VOICE', language: 'he' } });

export const verifyCode = (phoneId, code) => graph(`${idOf(phoneId)}/verify_code`, { body: { code: sixDigits(code, 'הקוד') } });

// רישום המספר ל-Cloud API; ה-PIN הוא אימות דו-שלבי (6 ספרות לבחירתך)
export const registerPhone = (phoneId, pin) =>
  graph(`${idOf(phoneId)}/register`, { body: { messaging_product: 'whatsapp', pin: sixDigits(pin, 'ה-PIN') } });

// ---------- פרופיל העסק (תמונה, אודות, תיאור, כתובת, מייל, אתרים, קטגוריה) ----------

const PROFILE_FIELDS = 'about,address,description,email,profile_picture_url,websites,vertical';
// הקטגוריות שמקבלת Meta
export const VERTICALS = ['UNDEFINED', 'OTHER', 'AUTO', 'BEAUTY', 'APPAREL', 'EDU', 'ENTERTAIN', 'EVENT_PLAN', 'FINANCE', 'GROCERY', 'GOVT', 'HOTEL', 'HEALTH', 'NONPROFIT', 'PROF_SERVICES', 'RETAIL', 'TRAVEL', 'RESTAURANT', 'NOT_A_BIZ'];
const PICTURE_MAX_BYTES = 5 * 1024 * 1024;

export async function getProfile(phoneId) {
  const res = await graph(`${idOf(phoneId)}/whatsapp_business_profile?fields=${PROFILE_FIELDS}`, { method: 'GET' });
  return res.data?.[0] ?? {};
}

const textField = (v, what, max, min = 0) => {
  const t = String(v ?? '').trim();
  if (t.length < min || t.length > max) throw new InputError(`${what}: ${min ? `בין ${min} ל-${max}` : `עד ${max}`} תווים`);
  return t;
};

// מעדכן רק שדות שנשלחו (שדה שלא נשלח לא נמחק)
export function updateProfile(phoneId, f = {}) {
  const body = { messaging_product: 'whatsapp' };
  if (f.about !== undefined) body.about = textField(f.about, 'אודות', 139, 1);
  if (f.description !== undefined) body.description = textField(f.description, 'תיאור', 512);
  if (f.address !== undefined) body.address = textField(f.address, 'כתובת', 256);
  if (f.email !== undefined) {
    body.email = textField(f.email, 'מייל', 128);
    if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) throw new InputError('כתובת המייל לא תקינה');
  }
  if (f.websites !== undefined) {
    const list = [].concat(f.websites).map((w) => String(w ?? '').trim()).filter(Boolean);
    if (list.length > 2) throw new InputError('אפשר עד שני אתרים');
    if (list.some((w) => !/^https?:\/\/\S+$/.test(w) || w.length > 256)) throw new InputError('כתובת אתר צריכה להתחיל ב-https://');
    body.websites = list;
  }
  if (f.vertical !== undefined) {
    if (!VERTICALS.includes(f.vertical)) throw new InputError('קטגוריה לא תקינה');
    body.vertical = f.vertical;
  }
  if (Object.keys(body).length === 1) throw new InputError('לא נשלח שום שדה לעדכון');
  return graph(`${idOf(phoneId)}/whatsapp_business_profile`, { body });
}

// תמונת פרופיל: העלאה ל-Meta (Resumable Upload) ואז שיוך לפרופיל. התמונה מגיעה מהדף כ-base64
export async function setProfilePicture(phoneId, appId, base64, mime) {
  idOf(phoneId);
  if (!/^\d{6,20}$/.test(String(appId ?? ''))) throw new InputError('מזהה האפליקציה לא תקין (ספרות בלבד)');
  if (!['image/jpeg', 'image/png'].includes(mime)) throw new InputError('התמונה חייבת להיות JPEG או PNG');
  const bytes = Buffer.from(String(base64 ?? ''), 'base64');
  if (!bytes.length) throw new InputError('לא התקבלה תמונה');
  if (bytes.length > PICTURE_MAX_BYTES) throw new InputError('התמונה גדולה מדי (עד 5MB)');

  const session = await graph(`${appId}/uploads?file_length=${bytes.length}&file_type=${encodeURIComponent(mime)}&file_name=profile`);
  if (!session.id) throw new InputError('Meta לא החזירה מזהה העלאה');
  const up = await fetch(`${GRAPH}/${session.id}`, {
    method: 'POST',
    headers: { authorization: `OAuth ${config.waToken}`, file_offset: '0' },
    signal: AbortSignal.timeout(30000),
    body: bytes,
  });
  const uploaded = await up.json().catch(() => ({}));
  if (!up.ok || !uploaded.h) throw new InputError(`Meta: העלאת התמונה נכשלה (${uploaded.error?.message ?? up.status})`, 400);
  return graph(`${idOf(phoneId)}/whatsapp_business_profile`, { body: { messaging_product: 'whatsapp', profile_picture_handle: uploaded.h } });
}
