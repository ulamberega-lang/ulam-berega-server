// הגדרת מספר הוואטסאפ מול Meta מאתר הניהול: בדיקת מצב, בקשת קוד אימות, אימות ורישום (הטוקן נשאר בשרת).
import { config } from '../config.js';
import { GRAPH } from './api.js';
import { InputError } from '../lib/hall-input.js';

const STATUS_FIELDS = 'display_phone_number,verified_name,status,name_status,code_verification_status,quality_rating,platform_type,account_mode';

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
export const subscribedApps = (wabaId) => graph(`${idOf(wabaId)}/subscribed_apps`, { method: 'GET' });
export const subscribeApp = (wabaId) => graph(`${idOf(wabaId)}/subscribed_apps`);

export const phoneStatus = (phoneId) => graph(`${idOf(phoneId)}?fields=${STATUS_FIELDS}`, { method: 'GET' });

export const requestCode = (phoneId, method) =>
  graph(`${idOf(phoneId)}/request_code`, { body: { code_method: method === 'SMS' ? 'SMS' : 'VOICE', language: 'he' } });

export const verifyCode = (phoneId, code) => graph(`${idOf(phoneId)}/verify_code`, { body: { code: sixDigits(code, 'הקוד') } });

// רישום המספר ל-Cloud API; ה-PIN הוא אימות דו-שלבי (6 ספרות לבחירתך)
export const registerPhone = (phoneId, pin) =>
  graph(`${idOf(phoneId)}/register`, { body: { messaging_product: 'whatsapp', pin: sixDigits(pin, 'ה-PIN') } });
