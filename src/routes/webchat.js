// צ'אט באתר: אותו בוט כמו בוואטסאפ (flow.js), דרך בקשות JSON מדף ה-/chat. בלי מסד נתונים נוסף: המצב בזיכרון.
import { Router } from 'express';
import { handleMessage, greet, newSession } from '../whatsapp/flow.js';
import { prettyPhone } from './whatsapp.js';
import { config } from '../config.js';

export const webchatRouter = Router();

const TTL_MS = 15 * 60 * 1000;           // כמו בוואטסאפ: בלי פעילות 15 דקות - מתחילים מחדש
const SID = /^[A-Za-z0-9_-]{16,64}$/;    // מזהה שהדפדפן מייצר
const MAX_SESSIONS = 5000;               // מגבלת זיכרון
const RATE_MAX = 30, RATE_WINDOW_MS = 60 * 1000;
const sessions = new Map();              // מזהה → { s, queue }
const hits = new Map();                  // כתובת → זמני בקשות אחרונים

export function allowRequest(key, now = Date.now()) {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) { hits.set(key, recent); return false; }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, list] of hits) if (!list.some((t) => now - t < RATE_WINDOW_MS)) hits.delete(k);
  for (const [k, v] of sessions) if (now - v.s.t > TTL_MS) sessions.delete(k);
}, 5 * 60 * 1000).unref();

// POST { sid, id? , text? }: בלי id וטקסט - פתיחת שיחה (ברכה ותפריט)
webchatRouter.post('/', async (req, res) => {
  const { sid, id, text, desktop } = req.body ?? {};
  if (typeof sid !== 'string' || !SID.test(sid)) return res.status(400).json({ error: 'bad sid' });
  if (!allowRequest(`ip:${req.ip}`) || !allowRequest(`sid:${sid}`)) return res.status(429).json({ error: 'too many requests' });
  const input = { id: typeof id === 'string' ? id.slice(0, 40) : undefined, text: typeof text === 'string' ? text.slice(0, 300) : '' };
  // קישור חיוג (tel:) עובד רק בטלפון: במחשב לא מציגים אותו. web: בלי שורת "או בצ'אט באתר" בחתימה (כבר בצ'אט)
  const ctx = { dial: prettyPhone(config.systemPhone), link: desktop === true ? undefined : config.publicUrl, web: true };
  try {
    let entry = sessions.get(sid);
    if (entry && Date.now() - entry.s.t > TTL_MS) { sessions.delete(sid); entry = undefined; }
    if (!entry && sessions.size >= MAX_SESSIONS) return res.status(503).json({ error: 'busy' });
    // הודעות של אותו מבקר מטופלות בזו אחר זו (לחיצות מהירות)
    const prev = entry?.queue ?? Promise.resolve();
    const work = prev.then(async () => {
      if (!entry) { entry = { s: newSession(input.text) }; sessions.set(sid, entry); return greet(entry.s, ctx); }
      if (!input.id && !input.text) return greet(entry.s, ctx);
      return handleMessage(entry.s, input, ctx);
    });
    if (entry) entry.queue = work.catch(() => {});
    res.json({ messages: await work });
  } catch (e) {
    console.error('webchat:', e.stack ?? e.message);
    res.status(500).json({ error: 'server error' });
  }
});
