// הודעה קולית (אפשרות 5 בתפריט): ההקלטה נשלחת במייל כקובץ מצורף. אין תמלול.
// ההקלטה נשארת בימות (תיקיית ההקלטות), כגיבוי למקרה שהמייל נכשל.
import { config } from '../config.js';
import { downloadRecording } from './transcriber.js';
import * as voicemails from '../repositories/voicemails.js';
import { hebrewDate } from '../lib/hebrew-date.js';

const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024; // מעבר לזה Brevo עלולה לדחות את המייל

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export async function saveVoicemail({ path, callerPhone }) {
  console.log('voicemail: received, downloading', path);
  const audio = await downloadRecording(path);
  if (!audio) return console.error('voicemail: no recording at', path);
  // רשומה באתר הניהול (לשונית "הודעות"). אם הטבלה עוד לא קיימת - ממשיכים לשלוח את המייל
  await voicemails.create({ callerPhone, path }).catch((e) => console.error('voicemail: save failed:', e.message));
  if (!config.brevoKey || !config.mailFrom) return console.error('voicemail: mail is not configured');

  const tooBig = audio.length > MAX_ATTACHMENT_BYTES;
  const now = new Date();
  const when = now.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': config.brevoKey, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      sender: { email: config.mailFrom, name: 'שמחה בשיחה' },
      to: [{ email: config.mailFrom }],
      subject: `הודעה קולית חדשה${callerPhone ? ` - ${callerPhone}` : ''}`,
      htmlContent: `<div dir="rtl" style="font-family:Arial">
        <p>התקבלה הודעה קולית בקו.</p>
        <p>מספר המתקשר: <b>${escapeHtml(callerPhone) || 'חסוי'}</b><br>מועד: ${hebrewDate(now)}, ${when}</p>
        <p>${tooBig ? `ההקלטה גדולה מדי לצירוף, והיא שמורה בימות: ${escapeHtml(path)}` : 'ההקלטה מצורפת למייל.'}</p>
      </div>`,
      ...(tooBig ? {} : { attachment: [{ name: 'message.wav', content: audio.toString('base64') }] }),
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  console.log(`voicemail: sent ${tooBig ? 'without attachment' : 'with attachment'} (${audio.length} bytes) from ${callerPhone || 'hidden'} to ${config.mailFrom}`);
}
