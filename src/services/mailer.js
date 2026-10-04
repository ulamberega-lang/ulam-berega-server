// מייל לאולם על כל שיחה שהועברה אליו (דרך Brevo). כל שליחה נרשמת ביומן המיילים (mail_log).
import { IVR } from '../config.js';
import * as halls from '../repositories/halls.js';
import * as mailLog from '../repositories/mail-log.js';
import { hebrewDate } from '../lib/hebrew-date.js';
import { startOfIsraelDay } from '../lib/israel-day.js';
import { escapeHtml, mailConfigured, sendMail } from '../lib/brevo.js';

// מתקשר שהתקשר כמה פעמים לאותו אולם ולא נענה: נשלח רק מייל אחד (עד שהאולם יענה לו, או עד חצות - ההגבלה מתאפסת בכל יום אזרחי)

async function isRepeatMiss(hall, callerPhone) {
  if (!callerPhone) return false; // מספר חסוי: אי אפשר לזהות שזה אותו מתקשר
  try {
    const last = await mailLog.lastForCaller(hall.id, callerPhone, startOfIsraelDay().toISOString());
    return last?.answered === false; // המייל האחרון שנשלח על המתקשר הזה היה על שיחה שלא נענתה
  } catch (e) {
    console.error('mail-log:', e.message);
    return false; // אם הבדיקה נכשלה - עדיף מייל כפול על מייל שלא נשלח
  }
}

export async function notifyHall({ hallId, callerPhone, startedAt, answered }) {
  const hall = await halls.findById(hallId);
  if (!hall) return;
  const entry = { hall_id: hall.id, hall_name: hall.name, to_email: hall.gabbai_email || '', caller_phone: callerPhone || '', answered: Boolean(answered) };
  const log = (status, error = '') => mailLog.record({ ...entry, status, error: String(error).slice(0, 300) })
    .catch((e) => console.error('mail-log:', e.message));
  if (!mailConfigured()) return log('failed', 'שליחת מיילים לא מוגדרת (BREVO_API_KEY / MAIL_FROM)');
  if (!hall.gabbai_email) return log('no_email');
  if (!answered && await isRepeatMiss(hall, callerPhone)) return log('repeat');

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
