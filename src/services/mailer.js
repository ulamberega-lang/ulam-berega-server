// מייל לאולם על כל שיחה שהועברה אליו (דרך Brevo).
import { config, IVR } from '../config.js';
import * as halls from '../repositories/halls.js';
import * as mailLog from '../repositories/mail-log.js';
import { hebrewDate } from '../lib/hebrew-date.js';

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export async function notifyHall({ hallId, callerPhone, startedAt, answered }) {
  if (!config.brevoKey || !config.mailFrom) return;
  const hall = await halls.findById(hallId);
  if (!hall) return;
  const entry = { hall_id: hall.id, hall_name: hall.name, to_email: hall.gabbai_email || '', caller_phone: callerPhone || '', answered: Boolean(answered) };
  const log = (status, error = '') => mailLog.record({ ...entry, status, error: String(error).slice(0, 300) })
    .catch((e) => console.error('mail-log:', e.message));
  if (!hall.gabbai_email) return log('no_email');

  const when = new Date(startedAt).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
  const name = escapeHtml(hall.name);
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': config.brevoKey, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      sender: { email: config.mailFrom, name: 'שמחה בשיחה' },
      to: [{ email: hall.gabbai_email }],
      subject: `${answered ? 'שיחה' : 'שיחה שלא נענתה'} - ${hall.name}`,
      htmlContent: `<div dir="rtl" style="font-family:Arial">
        <p>שלום,</p>
        <p>התקבלה שיחה דרך שמחה בשיחה לאולם <b>${name}</b>${hall.synagogue_name ? ` (בבית הכנסת ${escapeHtml(hall.synagogue_name)})` : ''}.</p>
        <p>מספר המתקשר: <b>${escapeHtml(callerPhone) || 'חסוי'}</b><br>מועד: ${hebrewDate(startedAt)}, ${when}<br>
        ${answered ? 'השיחה הועברה אליך' : 'השיחה לא נענתה'}</p>
        ${answered ? '' : '<p>מומלץ לחזור למתקשר.</p>'}
        <p style="color:#666;font-size:13px">שיחות שמגיעות דרך שמחה בשיחה מופיעות אצלך בטלפון עם הספרות
        ${IVR.CALLER_ID_SUFFIX} בסוף מספר המתקשר. כדי לחזור למתקשר, יש לחייג למספר שמופיע כאן במייל.</p>
      </div>`,
    }),
  }).catch((e) => ({ ok: false, text: async () => e.message })); // תקלת רשת נרשמת ביומן כמו תשובת שגיאה
  if (!res.ok) {
    const error = `${res.status ?? ''} ${await res.text()}`.trim();
    await log('failed', error);
    throw new Error(error);
  }
  await log('sent');
}
