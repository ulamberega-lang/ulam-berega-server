// תמלול תשובה מוקלטת: הורדה מימות → OpenAI → מחיקה מימות.
import { config } from '../config.js';

const DOWNLOAD_TIMEOUT_MS = 8000;
const OPENAI_TIMEOUT_MS = 12000;   // ימות לא ממתינה לנצח לתשובת השרת
const MAX_KEYWORDS = 900;
const MAX_PROMPT_CHARS = 60000;

// מחזיר טקסט; '' אם לא נאמר כלום; null אם ההורדה או התמלול נכשלו.
// hints יכול להיות Promise - נטען במקביל להורדת ההקלטה
export async function transcribeRecording({ path, hints, kind }) {
  const started = Date.now();
  const token = encodeURIComponent(config.yemotToken);

  const file = await fetch(`${config.yemotApi}/DownloadFile?token=${token}&path=${encodeURIComponent(path)}`,
    { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  const type = file.headers.get('content-type') || '';
  if (!file.ok || type.includes('json') || type.includes('text')) {
    console.error('download:', file.status, (await file.text()).slice(0, 200));
    return null;
  }
  const audio = await file.blob();
  const downloaded = Date.now();
  deleteRecording(path, token);

  const form = new FormData();
  form.append('file', audio, 'answer.wav');
  form.append('model', 'gpt-transcribe');
  form.append('languages[]', 'he');
  // עד 900 רמזים כ-keywords (מעל כ-1,000 הבקשה נכשלת); השאר נכנסים לטקסט ההנחיה
  const cleanHints = (await hints).filter(Boolean).map((h) => h.replace(/[<>\r\n]/g, ' ').trim()).filter(Boolean);
  const extra = cleanHints.slice(MAX_KEYWORDS).join(', ').slice(0, MAX_PROMPT_CHARS);
  form.append('prompt', `מתקשר אומר שם של ${kind} בישראל${extra ? `. שמות אפשריים נוספים: ${extra}` : ''}`);
  for (const h of cleanHints.slice(0, MAX_KEYWORDS)) form.append('keywords[]', h);

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${config.openaiKey}` },
    body: form,
    signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
  });
  if (!res.ok) {
    console.error('openai:', res.status, await res.text());
    return null;
  }
  const { text } = await res.json();
  console.log(`transcribe: download ${downloaded - started}ms, openai ${Date.now() - downloaded}ms`);
  return text || '';
}

// לא חוסם את השיחה; נרשם בלוג אם נכשל
function deleteRecording(path, token) {
  fetch(`${config.yemotApi}/FileAction?token=${token}&action=delete&what=${encodeURIComponent(path)}`)
    .then((r) => r.json())
    .then((j) => { if (!j.success) console.error('delete:', JSON.stringify(j).slice(0, 200)); })
    .catch((e) => console.error('delete:', e.message));
}

// מוריד הקלטה מימות (בלי למחוק אותה). מחזיר Buffer, או null אם אין הקלטה או שההורדה נכשלה
export async function downloadRecording(path) {
  const token = encodeURIComponent(config.yemotToken);
  const file = await fetch(`${config.yemotApi}/DownloadFile?token=${token}&path=${encodeURIComponent(path)}`,
    { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  const type = file.headers.get('content-type') || '';
  if (!file.ok || type.includes('json') || type.includes('text')) return null;
  return Buffer.from(await file.arrayBuffer());
}

// מחיקת הקלטה מימות (למשל כשמוחקים הודעה קולית באתר הניהול)
export const deleteRecordingFile = (path) => deleteRecording(path, encodeURIComponent(config.yemotToken));
