// מייל לאולם על כל שיחה שהועברה אליו (דרך Brevo).
import { config } from '../config.js';
import * as halls from '../repositories/halls.js';

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
    body: JSON.stringify({
      sender: { email: config.mailFrom, name: 'גמ"ח אולם ברגע' },
      to: [{ email: hall.gabbai_email }],
      subject: `${answered ? 'שיחה' : 'שיחה שלא נענתה'} - ${hall.name}`,
      htmlContent: `<div dir="rtl" style="font-family:Arial">
        <p>שלום,</p>
        <p>התקבלה שיחה דרך גמ"ח אולם ברגע לאולם <b>${name}</b>.</p>
        <p>מספר המתקשר: <b>${escapeHtml(callerPhone) || 'חסוי'}</b><br>מועד: ${when}<br>
        ${answered ? 'השיחה הועברה אליך' : 'השיחה לא נענתה'}</p>
        ${answered ? '' : '<p>מומלץ לחזור למתקשר.</p>'}
      </div>`,
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
}
