// webhook של WhatsApp Cloud API: אימות הכתובת (GET) וקליטת הודעות (POST).
import crypto from 'node:crypto';
import { Router, raw } from 'express';
import { config } from '../config.js';
import { handleMessage, greet, newSession } from '../whatsapp/flow.js';
import { sendAll, react } from '../whatsapp/api.js';
import { localDigits } from '../lib/owner-phones.js';

export const whatsappRouter = Router();

const SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const sessions = new Map(); // מספר משתמש → מצב
const seen = new Map();     // מזהי הודעות שכבר טופלו (Meta שולחת שוב אם לא ענינו בזמן)
const queues = new Map();   // מספר משתמש → תור: הודעות של אותו משתמש מטופלות בזה אחר זה

// הגבלת קצב: עד RATE_MAX הודעות בדקה לכל משתמש, העודף מתעלמים ממנו בלי לענות (הגנה מהצפה וממגבלת Meta על המספר)
const RATE_MAX = 20;
const RATE_WINDOW_MS = 60 * 1000;
const hits = new Map();     // מספר משתמש → זמני הודעות אחרונים
export function allowMessage(from, now = Date.now()) {
  const recent = (hits.get(from) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) { hits.set(from, recent); return false; }
  recent.push(now);
  hits.set(from, recent);
  return true;
}

setInterval(() => {
  for (const [k, list] of hits) if (!list.some((t) => Date.now() - t < RATE_WINDOW_MS)) hits.delete(k);
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [k, s] of sessions) if (s.t < cutoff) sessions.delete(k);
  for (const [k, t] of seen) if (t < cutoff) seen.delete(k);
}, 10 * 60 * 1000).unref();

// חתימה: sha256=HMAC של הגוף הגולמי עם סוד האפליקציה
function validSignature(req) {
  if (!config.waAppSecret) return false;
  const given = String(req.get('x-hub-signature-256') ?? '');
  const expected = `sha256=${crypto.createHmac('sha256', config.waAppSecret).update(req.body).digest('hex')}`;
  return given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

whatsappRouter.get('/', (req, res) => {
  if (config.waVerifyToken && req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === config.waVerifyToken) {
    return res.status(200).send(String(req.query['hub.challenge'] ?? ''));
  }
  res.sendStatus(403);
});

// מה המשתמש שלח: לחיצה על כפתור/שורה (id) או טקסט
export function inputOf(msg) {
  const reply = msg.interactive?.button_reply ?? msg.interactive?.list_reply;
  if (reply) return { id: reply.id, text: '' };
  if (msg.type === 'text') return { text: msg.text?.body ?? '' };
  return { text: '' }; // הקלטה, תמונה וכו': לא נתמך
}

// 97233130858 → 03-313-0858: בפורמט מקומי וואטסאפ הופך את המספר ללחיץ (פותח חייגן)
export function prettyPhone(phone) {
  const d = localDigits(phone);
  if (d.length === 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return String(phone ?? '');
}

async function process(phoneId, dial, msg) {
  const from = msg.from;
  const input = inputOf(msg);
  let s = sessions.get(from);
  const isNew = !s;
  if (isNew) { s = newSession(input.text); sessions.set(from, s); }
  const ctx = { dial: prettyPhone(dial), link: config.publicUrl };
  const searching = react(phoneId, from, msg.id, '🔍'); // מיד, במקביל לטיפול
  try {
    const out = isNew ? await greet(s, ctx) : await handleMessage(s, input, ctx);
    await sendAll(phoneId, from, out);
  } finally {
    await searching;                                    // כדי ש-✔️ תגיע אחרי 🔍
    await react(phoneId, from, msg.id, '✔️');
  }
}

whatsappRouter.post('/', raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  if (!Buffer.isBuffer(req.body) || !validSignature(req)) {
    console.error('whatsapp: בקשה נדחתה (חתימה לא תקינה או WA_APP_SECRET לא תואם)');
    return res.sendStatus(401);
  }
  console.log('whatsapp: התקבל webhook');
  res.sendStatus(200); // עונים מיד; הטיפול ברקע
  let body;
  try { body = JSON.parse(req.body.toString('utf8')); } catch { return; }
  for (const change of (body.entry ?? []).flatMap((e) => e.changes ?? [])) {
    const v = change.value ?? {};
    const phoneId = v.metadata?.phone_number_id;
    const dial = v.metadata?.display_phone_number;
    for (const msg of v.messages ?? []) {
      if (!msg.id || !msg.from || !phoneId || seen.has(msg.id)) continue;
      seen.set(msg.id, Date.now());
      if (!allowMessage(msg.from)) { console.error(`whatsapp: הגבלת קצב, הודעה נזרקה (${msg.from.slice(-4)})`); continue; }
      const prev = queues.get(msg.from) ?? Promise.resolve();
      const next = prev.then(() => process(phoneId, dial, msg)).catch((e) => console.error('whatsapp:', e.stack ?? e.message));
      queues.set(msg.from, next);
      next.finally(() => { if (queues.get(msg.from) === next) queues.delete(msg.from); });
    }
  }
});
