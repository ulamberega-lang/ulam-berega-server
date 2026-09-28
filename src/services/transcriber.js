// תמלול תשובה מוקלטת: הורדה מימות → OpenAI → מחיקה מימות.
import { config } from '../config.js';

// מחזיר טקסט; '' אם לא נאמר כלום; null אם ההורדה או התמלול נכשלו
export async function transcribeRecording({ path, hints, kind }) {
  const started = Date.now();
  const token = encodeURIComponent(config.yemotToken);

  const file = await fetch(`${config.yemotApi}/DownloadFile?token=${token}&path=${encodeURIComponent(path)}`);
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
  form.append('prompt', `מתקשר אומר שם של ${kind} בישראל`);
  for (const h of hints) form.append('keywords[]', h.replace(/[<>\r\n]/g, ''));

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${config.openaiKey}` },
    body: form,
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
