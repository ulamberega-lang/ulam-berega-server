// סימולציה של השרת המלא: האפליקציה האמיתית, מסד נתונים מדומה, ו-fetch מדומה לימות, OpenAI ו-Brevo.
// שימוש בבדיקות: import { boot, ... } from '../dev/sim/harness.mjs' (חייב להיות הייבוא הראשון של קוד השרת).
import { register } from 'node:module';

process.env.ADMIN_PASSWORD = 'pw';
process.env.BREVO_API_KEY = 'k';
process.env.MAIL_FROM = 'noreply@example.com';
process.env.YEMOT_TOKEN = '0777:key';
process.env.OPENAI_API_KEY = 'sk';
process.env.SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';
register('./loader.mjs', import.meta.url);

export const realFetch = globalThis.fetch;
export const emails = [];        // מיילים ש-Brevo "קיבלה"
export const yemotCalls = [];    // כתובות שנקראו בימות (הורדה / מחיקה)
export const transcripts = [];   // תור הטקסטים ש-OpenAI "ישמע"
export const chatReplies = [];    // תשובות "OpenAI" להשלמת צ'אט (הצעת ניקוד): מחרוזת JSON או אובייקט
export const behavior = { brevoStatus: 201 };   // לבדיקת כשל בשליחה

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith('http://127.0.0.1')) return realFetch(url, opts);
  if (u.includes('api.brevo.com')) {
    emails.push(JSON.parse(opts.body));
    return new Response(behavior.brevoStatus < 300 ? '{}' : '{"message":"rejected"}', { status: behavior.brevoStatus });
  }
  if (u.includes('DownloadFile')) { yemotCalls.push(u); return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'audio/wav' } }); }
  if (u.includes('FileAction')) { yemotCalls.push(u); return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'content-type': 'application/json' } }); }
  if (u.includes('api.openai.com/v1/chat/completions')) {
    const reply = chatReplies.shift();
    if (reply === undefined) return new Response('boom', { status: 500 });
    return new Response(JSON.stringify({ choices: [{ message: { content: typeof reply === 'string' ? reply : JSON.stringify(reply) } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (u.includes('api.openai.com')) {
    const text = transcripts.shift();
    if (text === undefined) return new Response('boom', { status: 500 });
    return new Response(JSON.stringify({ text }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  throw new Error(`fetch לא מדומה: ${u}`);
};

const { db, resetDb } = await import('./fake-supabase.mjs');
const { createApp } = await import('../../src/app.js');
const { startHallDirectory, hallsChanged } = await import('../../src/services/hall-directory.js');
export { db, resetDb, hallsChanged };

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const strip = (text) => text.replace(/[֑-ׇ]/g, ''); // בלי ניקוד, לקריאות

export function seedHalls(rows) {
  db.halls.length = 0;
  rows.forEach((r, i) => db.halls.push({ id: i + 1, is_active: true, gabbai_email: '', address: '', neighborhood_name: null, synagogue_name: null, ...r }));
}

// מפעיל שרת על פורט פנוי; refresh מיד אחרי שמירת אולמות
export async function boot() {
  const server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  startHallDirectory();
  await sleep(30);
  return { server, base, close: () => new Promise((r) => server.close(r)) };
}

// בקשה לשלוחה הראשית כמו שימות שולחת (טופס)
export async function ivr(base, params, path = '/api/ivr') {
  const res = await realFetch(base + path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() });
  return { status: res.status, text: await res.text() };
}

// כניסה לאתר הניהול; מחזיר כותרות עם העוגייה
export async function adminHeaders(base) {
  const res = await realFetch(`${base}/admin/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'pw' }) });
  return { cookie: res.headers.get('set-cookie').split(';')[0], 'content-type': 'application/json' };
}
