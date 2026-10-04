// מייל לאולם על כל שיחה שהועברה אליו (דרך Brevo). כל שליחה נרשמת ביומן המיילים (mail_log).
import { IVR } from '../config.js';
import * as halls from '../repositories/halls.js';
import * as mailLog from '../repositories/mail-log.js';
import { hebrewDate } from '../lib/hebrew-date.js';
import { escapeHtml, mailConfigured, sendMail } from '../lib/brevo.js';

// הגנה מספאם: שיחות מזויפות לא יוכלו להציף אולם אחד במיילים (ולהיגמר את מכסת Brevo היומית)
const MAX_MAILS_PER_HALL_HOUR = 30;
const sentAt = new Map(); // מזהה אולם → זמני שליחה אחרונים

export const resetMailLimits = () => sentAt.clear(); // לבדיקות

function overLimit(hallId, now = Date.now()) {
  const recent = (sentAt.get(hallId) ?? []).filter((t) => now - t < 60 * 60 * 1000);
  if (recent.length >= MAX_MAILS_PER_HALL_HOUR) { sentAt.set(hallId, recent); return true; }
  sentAt.set(hallId, [...recent, now]);
  return false;
}

export async function notifyHall({ hallId, callerPhone, startedAt, answered }) {
  const hall = await halls.findById(hallId);
  if (!hall) return;
  const entry = { hall_id: hall.id, hall_name: hall.name, to_email: hall.gabbai_email || '', caller_phone: callerPhone || '', answered: Boolean(answered) };
  const log = (status, error = '') => mailLog.record({ ...entry, status, error: String(error).slice(0, 300) })
    .catch((e) => console.error('mail-log:', e.message));
  if (!mailConfigured()) return log('failed', 'שליחת מיילים לא מוגדרת (BREVO_API_KEY / MAIL_FROM)');
  if (!hall.gabbai_email) return log('no_email');
  if (overLimit(hall.id)) return log('failed', `יותר מ-${MAX_MAILS_PER_HALL_HOUR} מיילים לאולם בשעה, המייל לא נשלח`);

  const when = new Date(startedAt).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
  const name = escapeHtml(hall.name);
  const result = await sendMail({
    to: hall.gabbai_email,
    subject: `${answered ? 'שיחה' : 'שיחה שלא נענתה'} - ${hall.name}`,
    html: `<div dir="rtl" style="font-family:Arial">
        <p>שלום,</p>
        <p>התקבלה שיחה דרך שמחה בשיחה לאולם <b>${name}</b>${hall.synagogue_name ? ` (בבית הכנסת ${escapeHtml(hall.synagogue_name)})` : ''}.</p>
        <p>מספר המתקשר: <b>${escapeHtml(callerPhone) || 'חסוי'}</b><br>מועד: ${hebrewDate(startedAt)}, ${when}<br>
        ${answered ? 'השיחה הועברה אליך' : 'השיחה לא נענתה'}</p>
        ${answered ? '' : '<p>מומלץ לחזור למתקשר.</p>'}
        <p style="color:#666;font-size:13px">שיחות שמגיעות דרך שמחה בשיחה מופיעות אצלך בטלפון עם הספרות
        ${IVR.CALLER_ID_SUFFIX} בסוף מספר המתקשר. כדי לחזור למתקשר, יש לחייג למספר שמופיע כאן במייל.</p>
      </div>`,
  });
  if (!result.ok) {
    await log('failed', result.error);
    throw new Error(result.error);
  }
  await log('sent');
}
