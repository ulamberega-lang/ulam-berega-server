// רישום אירועים לסטטיסטיקה לפי ערוץ (וואטסאפ, צ'אט באתר, כניסות לאתר). ברקע: כשל ברישום לא פוגע בבוט או באתר.
import { createHmac } from 'node:crypto';
import { config } from '../config.js';
import * as events from '../repositories/channel-events.js';

// מזהה מגובב: אותו משתמש מקבל תמיד אותו מזהה (כדי לספור משתמשים שונים), אבל מספר הטלפון עצמו לא נשמר.
// המפתח הוא סוד של השרת, כך שאי אפשר לשחזר מספר מהמזהה ע"י ניסיון של כל המספרים
export const visitorId = (raw) => (raw ? createHmac('sha256', `channel:${config.supabaseKey ?? ''}`).update(String(raw)).digest('hex').slice(0, 20) : '');

let lastError = 0; // הטבלה חסרה (קובץ ה-SQL לא הורץ): שורת לוג אחת בשעה, לא בכל הודעה

// channel: whatsapp | web | site; kind: message | found | visit
export function track(channel, kind, raw, { page = '', source = '' } = {}) {
  return events.record({ channel, kind, visitor: visitorId(raw), page, source }).catch((e) => {
    if (Date.now() - lastError < 60 * 60 * 1000) return;
    lastError = Date.now();
    console.error('channel-log:', e.message);
  });
}
