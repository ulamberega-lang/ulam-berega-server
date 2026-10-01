// מייל לאולם על כל שיחה שהועברה אליו (דרך Brevo).
import { config, IVR } from '../config.js';
import * as halls from '../repositories/halls.js';
import { hebrewDate } from '../lib/hebrew-date.js';

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export async function notifyHall({ hallId, callerPhone, startedAt, answered }) {
  if (!config.brevoKey || !config.mailFrom) return;
  const hall = await halls.findById(hallId);
  if (!hall?.gabbai_email) return;

  const when = new Date(startedAt).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
  const name = escapeHtml(hall.name);
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': config.brevoKey, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      sender: { email: config.mailFrom, name: 'גמ"ח אולם ברגע' },
      to: [{ email: hall.gabbai_email }],
      subject: `${answered ? 'שיחה' : 'שיחה שלא נענתה'} - ${hall.name}`,
      htmlContent: `<div dir="rtl" style="font-family:Arial">
        <p>שלום,</p>
        <p>התקבלה שיחה דרך גמ"ח אולם ברגע לאולם <b>${name}</b>${hall.synagogue_name ? ` (בבית הכנסת ${escapeHtml(hall.synagogue_name)})` : ''}.</p>
        <p>מספר המתקשר: <b>${escapeHtml(callerPhone) || 'חסוי'}</b><br>מועד: ${hebrewDate(startedAt)}, ${when}<br>
        ${answered ? 'השיחה הועברה אליך' : 'השיחה לא נענתה'}</p>
        ${answered ? '' : '<p>מומלץ לחזור למתקשר.</p>'}
        <p style="color:#666;font-size:13px">שיחות שמגיעות דרך גמ"ח אולם ברגע מופיעות אצלך בטלפון עם הספרות
        ${IVR.CALLER_ID_SUFFIX} בסוף מספר המתקשר. כדי לחזור למתקשר, יש לחייג למספר שמופיע כאן במייל.</p>
      </div>`,
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
}
