// שליחת מייל דרך Brevo (משותף למייל לאולם ולהודעה הקולית), ומילוט HTML לתוכן המייל.
import { config } from '../config.js';

export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const mailConfigured = () => Boolean(config.brevoKey && config.mailFrom);

// מחזיר { ok, error }: תקלת רשת או דחייה של Brevo לא זורקות, כדי שהקורא ירשום אותן ביומן
export async function sendMail({ to, subject, html, attachment, timeoutMs = 10000 }) {
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': config.brevoKey, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        sender: { email: config.mailFrom, name: 'שמחה בשיחה' },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        ...(attachment ? { attachment: [attachment] } : {}),
      }),
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: `${res.status} ${await res.text()}`.trim() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
