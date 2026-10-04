// הודעה קולית (אפשרות 5 בתפריט): ההקלטה נשלחת במייל כקובץ מצורף. אין תמלול.
// ההקלטה נשארת בימות (תיקיית ההקלטות), כגיבוי למקרה שהמייל נכשל.
import { config } from '../config.js';
import { downloadRecording } from './transcriber.js';
import * as voicemails from '../repositories/voicemails.js';
import { hebrewDate } from '../lib/hebrew-date.js';
import { escapeHtml, mailConfigured, sendMail } from '../lib/brevo.js';

const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024; // מעבר לזה Brevo עלולה לדחות את המייל

export async function saveVoicemail({ path, callerPhone }) {
  console.log('voicemail: received, downloading', path);
  // קודם רושמים בלשונית "הודעות" (הנתיב כבר ידוע), כדי שהודעה לא תיעלם אם ההורדה מימות נכשלת.
  // אם הטבלה עוד לא קיימת - ממשיכים לשלוח את המייל
  await voicemails.create({ callerPhone, path }).catch((e) => console.error('voicemail: save failed:', e.message));
  const audio = await downloadRecording(path);
  if (!audio) return console.error('voicemail: no recording at', path);
  if (!mailConfigured()) return console.error('voicemail: mail is not configured');

  const tooBig = audio.length > MAX_ATTACHMENT_BYTES;
  const now = new Date();
  const when = now.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
  const result = await sendMail({
    to: config.mailFrom,
    subject: `הודעה קולית חדשה${callerPhone ? ` - ${callerPhone}` : ''}`,
    html: `<div dir="rtl" style="font-family:Arial">
        <p>התקבלה הודעה קולית בקו.</p>
        <p>מספר המתקשר: <b>${escapeHtml(callerPhone) || 'חסוי'}</b><br>מועד: ${hebrewDate(now)}, ${when}</p>
        <p>${tooBig ? `ההקלטה גדולה מדי לצירוף, והיא שמורה בימות: ${escapeHtml(path)}` : 'ההקלטה מצורפת למייל.'}</p>
      </div>`,
    attachment: tooBig ? null : { name: 'message.wav', content: audio.toString('base64') },
    timeoutMs: 15000,
  });
  if (!result.ok) throw new Error(result.error);
  console.log(`voicemail: sent ${tooBig ? 'without attachment' : 'with attachment'} (${audio.length} bytes) from ${callerPhone || 'hidden'} to ${config.mailFrom}`);
}
